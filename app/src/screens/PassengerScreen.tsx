import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import MapView, { Polyline } from '../map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getQuote, reverseGeocode } from '../api';
import { CancelDialog } from '../components/CancelDialog';
import {
  Avatar,
  Button,
  ErrorNote,
  FareDetails,
  MapButton,
  MapPill,
  Pin,
  ProgressBar,
  Sheet,
  Stars,
  common,
} from '../components/ui';
import { CarTop, VehicleBadge } from '../components/Vehicle';
import { VehicleMarker } from '../components/VehicleMarker';
import { ViewMarker } from '../components/ViewMarker';
import { Icon } from '../components/Icon';
import { notify, tap } from '../haptics';
import { addressOf, currentPosition } from '../location';
import { getSocket } from '../socket';
import { darkMapStyle } from '../mapDark';
import { isDark, theme } from '../theme';
import type { AckResult, Category, DriverPublic, LatLng, Payment, Place, Profile, Quote, Ride } from '../types';
import {
  CATEGORIES,
  MAPUTO,
  PAYMENTS,
  categoryLabel,
  cleanPath,
  formatDistance,
  formatDuration,
  haversine,
  money,
  toRN,
  validPoint,
} from '../utils';
import { PlaceSearch } from './PlaceSearch';

const TERMINAL = ['completed', 'cancelled', 'no_drivers'];
const LIVE = ['accepted', 'arrived', 'in_progress'];

export function PassengerScreen({ profile, onMenu }: { profile: Profile; onMenu: () => void }) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const [pos, setPos] = useState<LatLng | null>(null);
  const posRef = useRef<LatLng | null>(null);
  const [pickup, setPickup] = useState<Place | null>(null);
  const pickupCustom = useRef(false);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [search, setSearch] = useState<null | 'dropoff' | 'pickup'>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [category, setCategory] = useState<Category>('economico');
  const [payment, setPayment] = useState<Payment>('dinheiro');
  const [nearby, setNearby] = useState<DriverPublic[]>([]);
  const [ride, setRide] = useState<Ride | null>(null);
  const rideRef = useRef<Ride | null>(null);
  const requesting = useRef(false);
  const [requestError, setRequestError] = useState('');
  const [driverLoc, setDriverLoc] = useState<LatLng | null>(null);
  const [rating, setRating] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [follow, setFollow] = useState(false);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  // "Escolher no mapa": pino fixo no centro, a pessoa arrasta o mapa ou toca no local
  const [picking, setPicking] = useState<null | 'dropoff' | 'pickup'>(null);
  const [pickCenter, setPickCenter] = useState<LatLng | null>(null);
  const [pickPlace, setPickPlace] = useState<Place | null>(null);
  const lastDelta = useRef(0.02);
  const quoteId = useRef(0);

  const setRideBoth = (r: Ride | null) => {
    rideRef.current = r;
    setRide(r);
  };

  // Position + initial pickup address
  useEffect(() => {
    let alive = true;
    (async () => {
      const { pos: p } = await currentPosition();
      if (!alive) return;
      posRef.current = p;
      setPos(p);
      // Se a pessoa já escolheu um destino (o GPS demorou), não estraga o enquadramento do percurso
      if (quoteId.current === 0 && !rideRef.current) {
        mapRef.current?.animateToRegion({ ...toRN(p), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
      }
      getSocket().emit('passenger:hello', { name: profile.name, location: p });
      const address = await addressOf(p);
      if (alive && !pickupCustom.current) setPickup({ ...p, address });
    })();
    return () => {
      alive = false;
    };
  }, [profile.name]);

  // Socket listeners
  useEffect(() => {
    const s = getSocket();
    const hello = () => {
      if (posRef.current) s.emit('passenger:hello', { name: profile.name, location: posRef.current });
    };
    const onNearby = (list: DriverPublic[]) =>
      setNearby(Array.isArray(list) ? list.filter((d) => d && validPoint(d.location)) : []);
    const onUpdate = (r: Ride) => {
      if (!r || !r.id) return;
      const cur = rideRef.current;
      if (cur && cur.id !== 'pending' && cur.id !== r.id) return;
      if (!cur && !requesting.current) return;
      if (cur?.status !== r.status) {
        if (r.status === 'accepted' || r.status === 'arrived') notify('success');
        if (r.status === 'cancelled' || r.status === 'no_drivers') notify('warning');
      }
      setRideBoth(r);
      if (TERMINAL.includes(r.status) || r.status === 'searching') setDriverLoc(null);
    };
    const onDriverLoc = (l: LatLng) => {
      if (validPoint(l)) setDriverLoc(l);
    };
    s.on('connect', hello);
    s.on('drivers:nearby', onNearby);
    s.on('ride:update', onUpdate);
    s.on('ride:driver_location', onDriverLoc);
    return () => {
      s.off('connect', hello);
      s.off('drivers:nearby', onNearby);
      s.off('ride:update', onUpdate);
      s.off('ride:driver_location', onDriverLoc);
    };
  }, [profile.name]);

  // Quote when both places are known (and again when the guaranteed price expires)
  useEffect(() => {
    if (!pickup || !dropoff || rideRef.current) return;
    const id = ++quoteId.current;
    setQuoteError('');
    setQuoteLoading(true);
    getQuote(pickup, dropoff)
      .then((q) => {
        if (id !== quoteId.current) return;
        setQuote(q);
        const pts = cleanPath(q.polyline);
        if (pts.length > 1) {
          setTimeout(
            () =>
              mapRef.current?.fitToCoordinates(pts.map(toRN), {
                // o painel ocupa ~metade do ecrã: o percurso fica na metade de cima
                edgePadding: { top: insets.top + 80, right: 40, bottom: Math.round(winH * 0.55), left: 40 },
                animated: true,
              }),
            150,
          );
        }
      })
      .catch((e: any) => {
        if (id !== quoteId.current) return;
        setQuote(null);
        setQuoteError(e?.message ?? 'Erro ao calcular o preço.');
      })
      .finally(() => {
        if (id === quoteId.current) setQuoteLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, insets.top, quoteNonce]);

  // Renova a cotação um pouco antes de o preço garantido expirar
  useEffect(() => {
    if (!quote || ride) return;
    const secs = Number.isFinite(quote.validForSeconds) ? (quote.validForSeconds as number) : 300;
    const t = setTimeout(() => setQuoteNonce((n) => n + 1), Math.max(30, secs - 20) * 1000);
    return () => clearTimeout(t);
  }, [quote, ride]);

  // Fit map to ride route when a ride is active
  useEffect(() => {
    const pts = cleanPath(ride?.polyline);
    if (ride && pts.length > 1 && !follow) {
      mapRef.current?.fitToCoordinates(pts.map(toRN), {
        edgePadding: { top: insets.top + 90, right: 50, bottom: 400, left: 50 },
        animated: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, ride?.status === 'in_progress']);

  // Modo "seguir": câmara 3D inclinada atrás do carro do motorista
  const liveNow = !!ride && LIVE.includes(ride.status);
  useEffect(() => {
    if (!follow || !liveNow || !driverLoc) return;
    mapRef.current?.animateCamera({ center: toRN(driverLoc), pitch: 50, zoom: 17 }, { duration: 900 });
  }, [follow, liveNow, driverLoc]);

  function overview() {
    setFollow(false);
    const pts = [...cleanPath(rideRef.current?.polyline), ...(driverLoc ? [driverLoc] : [])];
    if (pts.length > 1) {
      mapRef.current?.animateCamera({ pitch: 0, heading: 0 }, { duration: 300 });
      mapRef.current?.fitToCoordinates(pts.map(toRN), {
        edgePadding: { top: insets.top + 90, right: 50, bottom: 360, left: 50 },
        animated: true,
      });
    }
  }

  const doRequest = useCallback(
    (params: { pickup: Place; dropoff: Place; category: Category; payment: Payment }) => {
      const s = getSocket();
      if (!s.connected) {
        setRequestError('Sem ligação ao servidor. Tente novamente quando a ligação voltar.');
        return;
      }
      setRequestError('');
      requesting.current = true;
      setRating(0);
      s.timeout(10000).emit(
        'ride:request',
        { ...params, passengerName: profile.name, phone: profile.phone, quoteId: quote?.quoteId, note: note.trim() },
        (err: Error | null, res?: AckResult) => {
          requesting.current = false;
          if (err || !res || !res.ok) {
            setRideBoth(null);
            setRequestError(
              !err && res && !res.ok
                ? res.error || 'Não foi possível pedir a boleia.'
                : 'O servidor não respondeu ao pedido. Tente novamente.',
            );
            return;
          }
          if (!rideRef.current) {
            // cancelled locally while the request was in flight
            getSocket().emit('ride:cancel', { rideId: res.ride.id });
            return;
          }
          // an update may already have arrived with a newer status
          if (rideRef.current.id !== res.ride.id) setRideBoth(res.ride);
        },
      );
      // show the searching state immediately
      setRideBoth({
        id: 'pending',
        status: 'searching',
        passengerId: '',
        passengerName: profile.name,
        ...params,
        note: note.trim(),
        price: quote?.prices?.[params.category] ?? 0,
        fare: quote?.fares?.[params.category],
        period: quote?.period,
        traffic: quote?.traffic,
        highDemand: quote?.highDemand,
        distanceMeters: quote?.distanceMeters ?? 0,
        durationSeconds: quote?.durationSeconds ?? 0,
        polyline: cleanPath(quote?.polyline),
        createdAt: Date.now(),
      });
    },
    [profile.name, profile.phone, quote, note],
  );

  function cancelRide(reason = 'Cancelado durante a procura') {
    const r = rideRef.current;
    if (r && r.id !== 'pending') getSocket().emit('ride:cancel', { rideId: r.id, reason });
    setCancelOpen(false);
    setFollow(false);
    setRideBoth(null);
    setDriverLoc(null);
    requesting.current = false;
  }

  function reset() {
    setRideBoth(null);
    setDriverLoc(null);
    setDropoff(null);
    setQuote(null);
    setNote('');
    setFollow(false);
    mapRef.current?.animateCamera({ pitch: 0, heading: 0 }, { duration: 300 });
    setRating(0);
    setRequestError('');
    requesting.current = false;
    if (posRef.current) {
      mapRef.current?.animateToRegion({ ...toRN(posRef.current), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
    }
  }

  function finish() {
    const r = rideRef.current;
    if (r && rating > 0) getSocket().emit('ride:rate', { rideId: r.id, stars: rating }, () => {});
    reset();
  }

  // Morada do ponto escolhido no mapa (espera o mapa parar meio segundo)
  useEffect(() => {
    if (!picking || !pickCenter) return;
    const c = pickCenter;
    let alive = true;
    const t = setTimeout(() => {
      reverseGeocode(c)
        .then((p) => alive && setPickPlace(p))
        .catch(() => alive && setPickPlace({ ...c, address: 'Ponto no mapa' }));
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [picking, pickCenter]);

  function startPick(kind: 'dropoff' | 'pickup') {
    setSearch(null);
    const start = (kind === 'pickup' ? pickup : dropoff) ?? posRef.current ?? pickup ?? MAPUTO;
    setPicking(kind);
    setPickPlace(null);
    setPickCenter({ lat: start.lat, lng: start.lng });
    mapRef.current?.animateToRegion({ ...toRN(start), latitudeDelta: 0.008, longitudeDelta: 0.008 }, 400);
  }

  function confirmPick() {
    if (!picking || !pickCenter) return;
    const same = pickPlace && pickPlace.lat === pickCenter.lat && pickPlace.lng === pickCenter.lng;
    const place: Place = same ? pickPlace : { ...pickCenter, address: 'Ponto no mapa' };
    if (picking === 'dropoff') setDropoff(place);
    else {
      pickupCustom.current = true;
      setPickup(place);
    }
    setPicking(null);
  }

  async function useCurrentAsPickup() {
    setSearch(null);
    pickupCustom.current = false;
    if (posRef.current) {
      const p = posRef.current;
      setPickup({ ...p, address: await addressOf(p) });
    }
  }

  const initial = pos ?? { lat: -25.9692, lng: 32.5732 };
  const routePts = cleanPath(ride?.polyline ?? quote?.polyline);
  const active = ride && LIVE.includes(ride.status);
  const showNearby = !ride && !dropoff;
  const etaMin =
    ride?.status === 'accepted' && driverLoc && validPoint(ride.pickup)
      ? Math.max(1, Math.round((haversine(driverLoc, ride.pickup) / 1000 / 25) * 60))
      : null;
  const progress =
    ride?.status === 'in_progress' && driverLoc && validPoint(ride.pickup) && validPoint(ride.dropoff)
      ? 1 - haversine(driverLoc, ride.dropoff) / Math.max(1, haversine(ride.pickup, ride.dropoff))
      : null;
  const kmLeft = ride?.status === 'in_progress' && driverLoc ? haversine(driverLoc, ride.dropoff) : null;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...toRN(initial), latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        showsUserLocation
        customMapStyle={isDark() ? darkMapStyle : undefined}
        userInterfaceStyle={isDark() ? 'dark' : 'light'}
        showsMyLocationButton={false}
        showsBuildings
        pitchEnabled
        toolbarEnabled={false}
        showsCompass={false}
        onPanDrag={() => follow && setFollow(false)}
        onRegionChangeComplete={(r) => {
          if (Number.isFinite(r?.latitudeDelta)) lastDelta.current = r.latitudeDelta;
          if (picking && validPoint({ lat: r?.latitude, lng: r?.longitude })) {
            // o mapa avisa "parou" mais do que uma vez no mesmo sítio: só conta se mudou
            setPickCenter((prev) =>
              prev && Math.abs(prev.lat - r.latitude) < 1e-6 && Math.abs(prev.lng - r.longitude) < 1e-6
                ? prev
                : { lat: r.latitude, lng: r.longitude },
            );
          }
        }}
        onPress={(e) => {
          // a escolher no mapa: tocar leva o pino a esse local
          const c = e?.nativeEvent?.coordinate;
          if (!picking || !c) return;
          mapRef.current?.animateToRegion(
            { ...c, latitudeDelta: lastDelta.current, longitudeDelta: lastDelta.current },
            300,
          );
        }}
      >
        {showNearby &&
          nearby.map((d) => <VehicleMarker key={d.id} point={d.location} category={d.category} size={22} />)}
        {routePts.length > 1 && (
          <>
            <Polyline coordinates={routePts.map(toRN)} strokeWidth={10} strokeColor="rgba(10,122,75,0.22)" />
            <Polyline coordinates={routePts.map(toRN)} strokeWidth={5} strokeColor={theme.primary} />
          </>
        )}
        {(dropoff || ride) && pickup && (
          <ViewMarker point={ride?.pickup ?? pickup} dep="p">
            <Pin color={theme.primary} />
          </ViewMarker>
        )}
        {etaMin !== null && ride && (
          <ViewMarker point={ride.pickup} dep={`eta${etaMin}`} anchor={{ x: 0.5, y: 1 }}>
            <View style={{ paddingBottom: 16 }}>
              <MapPill text={`${etaMin} min`} />
            </View>
          </ViewMarker>
        )}
        {(ride?.dropoff ?? dropoff) && (
          <ViewMarker point={(ride?.dropoff ?? dropoff) as Place} dep="d">
            <Pin color={theme.accentDark} />
          </ViewMarker>
        )}
        {active && driverLoc && ride?.driver && (
          <VehicleMarker point={driverLoc} category={ride.driver.category} size={30} zIndex={10} />
        )}
      </MapView>

      {!ride && (
        <MapButton
          icon={picking ? 'back' : 'menu'}
          label={picking ? 'Voltar' : 'Menu'}
          onPress={picking ? () => setPicking(null) : onMenu}
          style={[styles.floating, { top: insets.top + 10 }]}
        />
      )}
      {!ride && pos && (
        <MapButton
          icon="my-location"
          label="A minha posição"
          onPress={() => mapRef.current?.animateToRegion({ ...toRN(pos), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400)}
          style={[styles.floatingRight, { top: insets.top + 10 }]}
        />
      )}
      {active && (
        <View style={[styles.mapTools, { top: insets.top + 10 }]}>
          <MapButton icon="compass" label="Seguir o motorista em 3D" active={follow} onPress={() => setFollow((f) => !f)} />
          <MapButton icon="expand" label="Ver o percurso todo" onPress={overview} />
        </View>
      )}

      {/* Escolher no mapa: pino fixo no centro + morada + confirmar */}
      {picking && (
        <>
          <View pointerEvents="none" style={styles.pickPinWrap}>
            <View style={styles.pickPin}>
              <View style={[styles.pickHead, { backgroundColor: picking === 'pickup' ? theme.primary : theme.accentDark }]}>
                <View style={styles.pickDot} />
              </View>
              <View style={styles.pickStem} />
              <View style={styles.pickShadow} />
            </View>
          </View>
          <View pointerEvents="none" style={[styles.pickHint, { top: insets.top + 14 }]}>
            <Text style={styles.pickHintText}>Arraste o mapa ou toque no local</Text>
          </View>
          <Sheet>
            <Text style={common.muted}>{picking === 'pickup' ? 'Local de recolha' : 'Destino'}</Text>
            <View style={[common.row, { gap: 10, minHeight: 44 }]}>
              <Icon name={picking === 'pickup' ? 'location' : 'flag'} size={20} color={picking === 'pickup' ? theme.primary : theme.accentDark} />
              {pickPlace && pickCenter && pickPlace.lat === pickCenter.lat && pickPlace.lng === pickCenter.lng ? (
                <Text style={[common.h2, { flex: 1, fontSize: 16 }]} numberOfLines={2}>{pickPlace.address}</Text>
              ) : (
                <View style={[common.row, { gap: 8, flex: 1 }]}>
                  <ActivityIndicator color={theme.primary} />
                  <Text style={common.muted}>A procurar a morada…</Text>
                </View>
              )}
            </View>
            <Button
              title={picking === 'pickup' ? 'Confirmar recolha' : 'Confirmar destino'}
              variant="accent"
              disabled={!pickCenter}
              onPress={confirmPick}
            />
            <Button title="Cancelar" variant="ghost" onPress={() => setPicking(null)} />
          </Sheet>
        </>
      )}

      {/* Sheets */}
      {!ride && !dropoff && !picking && (
        <Sheet>
          <Text style={styles.hello}>Olá, {profile.name.split(' ')[0]}</Text>
          <Pressable onPress={() => setSearch('dropoff')} style={styles.where} accessibilityRole="search">
            <Icon name="search" size={17} color={theme.muted} />
            <Text style={styles.whereText}>Para onde vamos?</Text>
          </Pressable>
          <Pressable onPress={() => setSearch('pickup')} style={[common.row, styles.pickupMini]}>
            <View style={styles.dot} />
            <Text style={[common.muted, { flex: 1 }]} numberOfLines={1}>
              Recolha: <Text style={{ color: theme.ink }}>{pickup?.address ?? 'a obter localização…'}</Text>
            </Text>
            <Text style={styles.linkSmall}>Alterar</Text>
          </Pressable>
          <View style={[common.row, { gap: 6 }]}>
            <View style={[styles.dotLive, { backgroundColor: nearby.length ? theme.primaryLight : theme.line }]} />
            <Text style={common.muted}>
              {nearby.length > 0 ? `${nearby.length} motorista(s) por perto` : 'Nenhum motorista visível por agora'}
            </Text>
          </View>
        </Sheet>
      )}

      {!ride && dropoff && !picking && (
        <Sheet
          summary={
            quote ? (
              <View style={[common.row, { gap: 10, paddingBottom: 2 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catName} numberOfLines={1}>{categoryLabel(category)} · {money(quote.prices?.[category])}</Text>
                  <Text style={styles.catDesc} numberOfLines={1}>{dropoff.address}</Text>
                </View>
                <Button
                  title="Pedir"
                  variant="accent"
                  disabled={quoteLoading}
                  onPress={() => pickup && dropoff && doRequest({ pickup, dropoff, category, payment })}
                  style={{ minHeight: 42, paddingHorizontal: 22 }}
                />
              </View>
            ) : undefined
          }
        >
          {/* Recolha → destino num só cartão */}
          <View style={styles.route}>
            <View style={styles.routeRail}>
              <View style={styles.dot} />
              <View style={styles.railLine} />
              <View style={styles.square} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Pressable onPress={() => setSearch('pickup')} hitSlop={4}>
                <Text style={styles.routeText} numberOfLines={1}>{pickup?.address ?? 'A obter localização…'}</Text>
              </Pressable>
              <Pressable onPress={() => setSearch('dropoff')} hitSlop={4}>
                <Text style={[styles.routeText, { fontWeight: '700' }]} numberOfLines={1}>{dropoff.address}</Text>
              </Pressable>
            </View>
            {quote ? (
              <Text style={styles.routeMeta}>
                {formatDistance(quote.distanceMeters)}
                {'\n'}
                {formatDuration(quote.durationSeconds)}
              </Text>
            ) : null}
            <Pressable
              onPress={() => {
                setDropoff(null);
                setQuote(null);
                setQuoteError('');
              }}
              hitSlop={10}
              style={styles.x}
              accessibilityLabel="Remover destino"
            >
              <Text style={{ fontSize: 15, color: theme.muted }}>✕</Text>
            </Pressable>
          </View>

          {quoteLoading && !quote && (
            <View style={[common.row, { gap: 8, justifyContent: 'center', paddingVertical: 10 }]}>
              <ActivityIndicator color={theme.primary} />
              <Text style={common.muted}>A calcular o preço…</Text>
            </View>
          )}
          {quoteError ? (
            <>
              <ErrorNote text={quoteError} />
              <Button title="Tentar de novo" variant="ghost" onPress={() => setQuoteNonce((n) => n + 1)} />
            </>
          ) : null}

          {quote && (
            <>
              {/* Categorias lado a lado: ocupa pouco e deixa o mapa à vista */}
              <View style={styles.cats}>
                {CATEGORIES.map((c) => {
                  const on = category === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        tap();
                        setCategory(c.id);
                      }}
                      style={[styles.cat, on && styles.catOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <VehicleBadge category={c.id} size={34} />
                      <Text style={styles.catName} numberOfLines={1}>{c.label}</Text>
                      <Text style={[styles.catPrice, on && { color: theme.primaryDark }]}>{money(quote.prices?.[c.id])}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Pagamento e nota em botões pequenos */}
              <View style={[common.row, { gap: 6 }]}>
                {PAYMENTS.map((p) => {
                  const on = payment === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        tap();
                        setPayment(p.id);
                      }}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>{p.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => setNoteOpen(true)} style={[styles.chip, note ? styles.chipNote : null]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name="pencil" size={13} color={theme.ink} />
                    <Text style={styles.chipText} numberOfLines={1}>{note ? 'Nota ✓' : 'Nota'}</Text>
                  </View>
                </Pressable>
              </View>
              {requestError ? <ErrorNote text={requestError} /> : null}
              <Button
                title={`Pedir ${categoryLabel(category)} · ${money(quote.prices?.[category])}`}
                variant="accent"
                disabled={quoteLoading}
                onPress={() => pickup && dropoff && doRequest({ pickup, dropoff, category, payment })}
              />
            </>
          )}
        </Sheet>
      )}

      {ride && ride.status === 'searching' && (
        <Sheet>
          <SearchingPulse category={ride.category} />
          <Text style={[common.h2, { textAlign: 'center' }]}>À procura do melhor motorista…</Text>
          <Text style={[common.muted, { textAlign: 'center' }]}>
            {categoryLabel(ride.category)} · {money(ride.price)}
          </Text>
          <Button title="Cancelar pedido" variant="danger" onPress={() => cancelRide()} />
        </Sheet>
      )}

      {ride && active && (
        <Sheet
          summary={
            <View style={{ paddingBottom: 4 }}>
              <Text style={[common.h2, { color: theme.primary }]} numberOfLines={1}>{statusTitle(ride, driverLoc)}</Text>
              <Text style={common.muted} numberOfLines={1}>
                {ride.driver ? `${ride.driver.name} · ${ride.driver.plate}` : ''}
              </Text>
            </View>
          }
        >
          <View style={styles.statusRow}>
            <Text style={[common.h2, { color: theme.primary, flex: 1 }]}>{statusTitle(ride, driverLoc)}</Text>
            {ride.status === 'arrived' && <Icon name="location" size={20} color={theme.primary} />}
          </View>
          {progress !== null && (
            <View style={{ gap: 4 }}>
              <ProgressBar value={progress} />
              {kmLeft !== null && <Text style={common.muted}>Faltam cerca de {formatDistance(kmLeft)} (em linha recta)</Text>}
            </View>
          )}
          {ride.driver ? (
            <View style={[common.row, styles.driverCard]}>
              <Avatar name={ride.driver.name} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={common.h2} numberOfLines={1}>{ride.driver.name}</Text>
                <Text style={common.muted} numberOfLines={1}>
                  {ride.driver.car} · ★ {Number.isFinite(ride.driver.rating) ? ride.driver.rating.toFixed(1) : '-'}
                </Text>
                <View style={styles.plate}>
                  <Text style={styles.plateText}>{ride.driver.plate}</Text>
                </View>
              </View>
            </View>
          ) : null}
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="location" size={14} color={theme.primary} /><Text style={[common.body, { flex: 1 }]} numberOfLines={1}>{ride.pickup?.address}</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="flag" size={14} color={theme.accentDark} /><Text style={[common.body, { flex: 1 }]} numberOfLines={1}>{ride.dropoff?.address}</Text></View>
          </View>
          <View style={[common.row, { justifyContent: 'space-between' }]}>
            <Text style={common.muted}>
              {PAYMENTS.find((p) => p.id === ride.payment)?.label}
              {ride.payment !== 'dinheiro' ? ' (ao motorista)' : ''}
            </Text>
            <Text style={[common.h2, { color: theme.primaryDark }]}>{money(ride.price)}</Text>
          </View>
          {ride.status !== 'in_progress' && (
            <Button title="Cancelar viagem" variant="danger" onPress={() => setCancelOpen(true)} />
          )}
        </Sheet>
      )}

      {ride && ride.status === 'completed' && (
        <Sheet>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Icon name="check" size={22} color={theme.primary} />
            <Text style={[common.h1, { textAlign: 'center' }]}>Chegou ao destino</Text>
          </View>
          <Text style={styles.bigPrice}>{money(ride.price)}</Text>
          <Text style={[common.muted, { textAlign: 'center' }]}>
            {formatDistance(ride.distanceMeters)} · {formatDuration(ride.durationSeconds)} ·{' '}
            {PAYMENTS.find((p) => p.id === ride.payment)?.label}
          </Text>
          {ride.fare && <FareDetails fare={ride.fare} />}
          <View style={styles.rateBox}>
            <Text style={[common.body, { textAlign: 'center', fontWeight: '600' }]}>
              Quer avaliar {ride.driver?.name?.split(' ')[0] ?? 'o motorista'}?
            </Text>
            <Text style={[common.muted, { textAlign: 'center' }]}>É opcional. Ajuda a manter bons motoristas na Boleia.</Text>
            <Stars value={rating} onChange={setRating} />
          </View>
          {rating ? (
            <Button title="Enviar avaliação" onPress={finish} />
          ) : (
            <Button title="Agora não" variant="ghost" onPress={finish} />
          )}
        </Sheet>
      )}

      {ride && ride.status === 'no_drivers' && (
        <Sheet>
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Icon name="sad" size={32} color={theme.muted} />
          </View>
          <Text style={[common.h2, { textAlign: 'center' }]}>Sem motoristas disponíveis</Text>
          <Text style={[common.muted, { textAlign: 'center' }]}>
            Nenhum motorista aceitou o pedido. Tente outra vez dentro de instantes.
          </Text>
          <Button
            title="Tentar de novo"
            variant="accent"
            onPress={() =>
              doRequest({ pickup: ride.pickup, dropoff: ride.dropoff, category: ride.category, payment: ride.payment })
            }
          />
          <Button title="Voltar" variant="ghost" onPress={reset} />
        </Sheet>
      )}

      {ride && ride.status === 'cancelled' && (
        <Sheet>
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Icon name="ban" size={32} color={theme.danger} />
          </View>
          <Text style={[common.h2, { textAlign: 'center' }]}>
            {ride.cancelledBy === 'driver' ? 'O motorista cancelou a viagem' : 'Viagem cancelada'}
          </Text>
          {ride.cancelledBy === 'driver' && ride.cancelReason ? (
            <Text style={[common.muted, { textAlign: 'center' }]}>Motivo: {ride.cancelReason}</Text>
          ) : null}
          {ride.cancelledBy === 'driver' && (
            <Button
              title="Pedir outro motorista"
              variant="accent"
              onPress={() =>
                doRequest({ pickup: ride.pickup, dropoff: ride.dropoff, category: ride.category, payment: ride.payment })
              }
            />
          )}
          <Button title="Fechar" variant={ride.cancelledBy === 'driver' ? 'ghost' : 'primary'} onPress={reset} />
        </Sheet>
      )}

      {requestError && !dropoff && !ride ? (
        <View style={[styles.toast, { top: insets.top + 64 }]}>
          <ErrorNote text={requestError} />
        </View>
      ) : null}

      {search && (
        <PlaceSearch
          title={search === 'dropoff' ? 'Para onde?' : 'Ponto de recolha'}
          near={pos ?? undefined}
          onClose={() => setSearch(null)}
          onUseCurrent={search === 'pickup' ? useCurrentAsPickup : undefined}
          onPickOnMap={() => startPick(search)}
          onSelect={(p) => {
            if (search === 'dropoff') setDropoff(p);
            else {
              pickupCustom.current = true;
              setPickup(p);
            }
            setSearch(null);
          }}
        />
      )}

      <CancelDialog
        visible={cancelOpen && !!active}
        role="passenger"
        onClose={() => setCancelOpen(false)}
        onConfirm={(reason) => cancelRide(reason)}
      />

      <NoteDialog visible={noteOpen} value={note} onClose={() => setNoteOpen(false)} onSave={setNote} />
    </View>
  );
}

/** Janela para escrever a nota ao motorista (fica no topo, o teclado nunca a tapa). */
function NoteDialog({
  visible,
  value,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(value);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setText(value);
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[styles.noteBg, { paddingTop: insets.top + 60 }]} onPress={onClose}>
          <Pressable style={styles.noteCard} onPress={() => {}}>
            <Text style={common.h2}>Nota para o motorista</Text>
            <Text style={common.muted}>Ajude o motorista a encontrá-lo. Ele vê esta nota ao receber o pedido.</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ex.: Estou no portão azul, ao lado da farmácia"
              placeholderTextColor={theme.muted}
              style={styles.noteInput}
              maxLength={140}
              multiline
              autoFocus
            />
            <Text style={[common.muted, { textAlign: 'right', fontSize: 11 }]}>{text.length}/140</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Cancelar" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
              <Button
                title="Guardar"
                onPress={() => {
                  onSave(text.trim());
                  onClose();
                }}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function statusTitle(ride: Ride, driverLoc: LatLng | null) {
  if (ride.status === 'arrived') return 'O motorista chegou!';
  if (ride.status === 'in_progress') return 'Boa viagem! A caminho do destino';
  if (driverLoc && validPoint(ride.pickup)) {
    const min = Math.max(1, Math.round((haversine(driverLoc, ride.pickup) / 1000 / 25) * 60));
    return `O motorista chega em ~${min} min`;
  }
  return 'O motorista está a caminho';
}

function SearchingPulse({ category }: { category: Category }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
  // o carro "procura" à volta, a rodar devagar
  const rotate = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-12deg', '12deg', '-12deg'] });
  return (
    <View style={{ height: 110, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.pulse, { transform: [{ scale }], opacity }]} />
      <Animated.View style={[styles.pulseCore, { transform: [{ rotate }] }]}>
        <CarTop category={category} width={22} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', left: 16 },
  // pino fixo no centro do ecrã: a ponta fica exactamente no centro do mapa
  pickPinWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // altura do pino ≈ 53 (cabeça 34 + haste 16 + sombra 3); ponta a 50 px do topo.
  // Centrado com marginBottom M, a ponta fica no centro quando M = 2 × 50 − 53 = 47.
  pickPin: { alignItems: 'center', marginBottom: 47 },
  pickHead: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  pickDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  pickStem: { width: 3, height: 16, backgroundColor: theme.ink, borderRadius: 2 },
  pickShadow: { width: 12, height: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.25)', marginTop: -1 },
  pickHint: { position: 'absolute', alignSelf: 'center', backgroundColor: theme.primaryDark, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  pickHintText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  floatingRight: { position: 'absolute', right: 16 },
  mapTools: { position: 'absolute', right: 16, gap: 10 },
  hello: { fontSize: 17, fontWeight: '600', color: theme.ink },
  where: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, borderRadius: 14, backgroundColor: theme.bg, paddingHorizontal: 14 },
  pickupMini: { gap: 8, minHeight: 28 },
  linkSmall: { color: theme.primary, fontWeight: '600', fontSize: 12.5, textAlign: 'center' },
  // cartão recolha -> destino
  route: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.bg, borderRadius: 14, paddingVertical: 10, paddingLeft: 12, paddingRight: 4 },
  routeRail: { alignItems: 'center', width: 12 },
  railLine: { width: 2, height: 18, backgroundColor: theme.line, marginVertical: 3 },
  square: { width: 10, height: 10, borderRadius: 2, backgroundColor: theme.accentDark },
  routeText: { fontSize: 13.5, color: theme.ink },
  routeSep: { height: 1, backgroundColor: theme.line },
  routeMeta: { fontSize: 11.5, color: theme.muted, textAlign: 'right', lineHeight: 15 },
  cats: { flexDirection: 'row', gap: 8 },
  catName: { fontSize: 13, fontWeight: '600', color: theme.ink },
  catDesc: { fontSize: 11.5, color: theme.muted },
  catPrice: { fontSize: 13.5, fontWeight: '700', color: theme.ink },
  chip: { minHeight: 32, borderRadius: 999, paddingHorizontal: 12, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: theme.primary },
  chipNote: { backgroundColor: theme.accentSoft },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.ink },
  noteBg: { flex: 1, backgroundColor: theme.overlay, paddingHorizontal: 16 },
  noteCard: { backgroundColor: theme.card, borderRadius: 20, padding: 18, gap: 10 },
  noteInput: { minHeight: 80, maxHeight: 140, borderRadius: 12, backgroundColor: theme.bg, padding: 12, fontSize: 15, color: theme.ink, textAlignVertical: 'top' },
  whereText: { fontSize: 15, fontWeight: '500', color: theme.muted },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary },
  dotLive: { width: 8, height: 8, borderRadius: 4 },
  x: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  cat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.line,
    backgroundColor: theme.card,
  },
  catOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  rateBox: { backgroundColor: theme.accentSoft, borderRadius: 16, padding: 12, gap: 4 },
  driverCard: { backgroundColor: theme.bg, borderRadius: 16, padding: 12 },
  plate: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.ink,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  plateText: { fontSize: 12.5, fontWeight: '700', letterSpacing: 1.2, color: theme.ink },
  bigPrice: { fontSize: 32, fontWeight: '800', color: theme.primary, textAlign: 'center' },
  pulse: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: theme.accent },
  pulseCore: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 16, right: 16 },
});
