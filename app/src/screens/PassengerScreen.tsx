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
  FadeIn,
  FareDetails,
  MapButton,
  MapPill,
  Pin,
  PriceTags,
  ProgressBar,
  Sheet,
  Stars,
  common,
} from '../components/ui';
import { Vehicle3D } from '../components/Vehicle';
import { VehicleMarker } from '../components/VehicleMarker';
import { ViewMarker } from '../components/ViewMarker';
import { Icon } from '../components/Icon';
import { notify, tap } from '../haptics';
import { addressOf, currentPosition } from '../location';
import { getSocket } from '../socket';
import { darkMapStyle } from '../mapDark';
import { categoryColors, isDark, shadow, theme } from '../theme';
import type { AckResult, Category, DriverPublic, LatLng, Payment, Place, Profile, Quote, Ride } from '../types';
import {
  CATEGORIES,
  MAPUTO,
  MAX_STOPS,
  PAYMENTS,
  categoryLabel,
  cleanPath,
  formatDistance,
  formatDuration,
  haversine,
  clockTime,
  money,
  priceTags,
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

  const [stops, setStops] = useState<Place[]>([]);
  const [search, setSearch] = useState<null | PlaceKind>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  // rotas possíveis para o mesmo destino; `quote` é a escolhida
  const [routes, setRoutes] = useState<Quote[]>([]);
  const chosenKm = useRef<number | null>(null);
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

  const [picking, setPicking] = useState<null | PlaceKind>(null);
  const [pickCenter, setPickCenter] = useState<LatLng | null>(null);
  const [pickPlace, setPickPlace] = useState<Place | null>(null);
  const lastDelta = useRef(0.02);
  const quoteId = useRef(0);

  const setRideBoth = (r: Ride | null) => {
    rideRef.current = r;
    setRide(r);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const { pos: p } = await currentPosition();
      if (!alive) return;
      posRef.current = p;
      setPos(p);

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

  const stopsKey = stops.map((p) => `${p.lat},${p.lng}`).join('|');
  useEffect(() => {
    if (!pickup || !dropoff || rideRef.current) return;
    const id = ++quoteId.current;
    setQuoteError('');
    setQuoteLoading(true);
    getQuote(pickup, dropoff, stops)
      .then((q) => {
        if (id !== quoteId.current) return;
        const list = q.routes?.length ? q.routes : [q];
        // ao renovar a cotação, mantém a rota que o passageiro escolheu (a de distância mais parecida)
        const prev = chosenKm.current;
        const pick =
          prev === null
            ? list[0]
            : list.reduce((a, b) => (Math.abs(b.distanceMeters - prev) < Math.abs(a.distanceMeters - prev) ? b : a));
        setRoutes(list);
        setQuote(pick);
        chosenKm.current = pick.distanceMeters;
        const pts = list.flatMap((r) => cleanPath(r.polyline));
        if (prev === null && pts.length > 1) {
          setTimeout(
            () =>
              mapRef.current?.fitToCoordinates(pts.map(toRN), {
                edgePadding: { top: insets.top + 70, right: 40, bottom: Math.round(winH * 0.6), left: 40 },
                animated: true,
              }),
            150,
          );
        }
      })
      .catch((e: any) => {
        if (id !== quoteId.current) return;
        setQuote(null);
        setRoutes([]);
        setQuoteError(e?.message ?? 'Erro ao calcular o preço.');
      })
      .finally(() => {
        if (id === quoteId.current) setQuoteLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, stopsKey, insets.top, quoteNonce]);

  useEffect(() => {
    if (!quote || ride) return;
    const secs = Number.isFinite(quote.validForSeconds) ? (quote.validForSeconds as number) : 300;
    const t = setTimeout(() => setQuoteNonce((n) => n + 1), Math.max(30, secs - 20) * 1000);
    return () => clearTimeout(t);
  }, [quote, ride]);

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
    (params: { pickup: Place; dropoff: Place; stops: Place[]; category: Category; payment: Payment }) => {
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
        {
          ...params,
          stops: params.stops.map((p) => ({ lat: p.lat, lng: p.lng, address: p.address })),
          passengerName: profile.name,
          phone: profile.phone,
          quoteId: quote?.quoteId,
          note: note.trim(),
        },
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
            getSocket().emit('ride:cancel', { rideId: res.ride.id });
            return;
          }

          if (rideRef.current.id !== res.ride.id) setRideBoth(res.ride);
        },
      );

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
        surface: quote?.surface ?? null,
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
    setStops([]);
    setQuote(null);
    setRoutes([]);
    chosenKm.current = null;
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

  function startPick(kind: PlaceKind) {
    setSearch(null);
    const start = (kind === 'pickup' ? pickup : kind === 'dropoff' ? dropoff : null) ?? posRef.current ?? pickup ?? MAPUTO;
    setPicking(kind);
    setPickPlace(null);
    setPickCenter({ lat: start.lat, lng: start.lng });
    mapRef.current?.animateToRegion({ ...toRN(start), latitudeDelta: 0.008, longitudeDelta: 0.008 }, 400);
  }

  function confirmPick() {
    if (!picking || !pickCenter) return;
    const same = pickPlace && pickPlace.lat === pickCenter.lat && pickPlace.lng === pickCenter.lng;
    const place: Place = same ? pickPlace : { ...pickCenter, address: 'Ponto no mapa' };
    setPlace(picking, place);
    setPicking(null);
  }

  function setPlace(kind: PlaceKind, place: Place) {
    if (kind === 'dropoff') setDropoff(place);
    else if (kind === 'stop') setStops((list) => [...list, place].slice(0, MAX_STOPS));
    else {
      pickupCustom.current = true;
      setPickup(place);
    }
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
  const shownStops = ride ? (ride.stops ?? []) : stops;
  const sand = quote?.surface ?? null;
  const sandy = !!sand && (sand.sandMeters >= 50 || sand.pickupSand || sand.dropoffSand);
  const tags = quote ? priceTags({ ...quote, category }).filter((t) => t.key !== 'sand') : [];
  const waitRate = quote?.waitRates?.[category];
  const freeWait = quote?.freeWaitMin ?? 3;
  const showRoutes = !ride && routes.length > 1;
  const cheapestPrice = showRoutes ? Math.min(...routes.map((r) => r.prices?.[category] ?? Infinity)) : 0;
  const fastestSecs = showRoutes ? Math.min(...routes.map((r) => r.durationSeconds)) : 0;
  const otherRoutes = showRoutes ? routes.filter((r) => r !== quote) : [];

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
            setPickCenter((prev) =>
              prev && Math.abs(prev.lat - r.latitude) < 1e-6 && Math.abs(prev.lng - r.longitude) < 1e-6
                ? prev
                : { lat: r.latitude, lng: r.longitude },
            );
          }
        }}
        onPress={(e) => {
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
          // a chave muda com a rota escolhida: as linhas voltam a ser criadas por ordem e a escolhida fica por cima
          <React.Fragment key={`r-${quote?.quoteId ?? ride?.id ?? ''}`}>
            {otherRoutes.map((r) => (
              <Polyline
                key={r.quoteId}
                coordinates={cleanPath(r.polyline).map(toRN)}
                strokeWidth={5}
                strokeColor={isDark() ? 'rgba(170,180,190,0.55)' : 'rgba(90,100,110,0.45)'}
              />
            ))}
            <Polyline coordinates={routePts.map(toRN)} strokeWidth={10} strokeColor="rgba(10,122,75,0.22)" />
            <Polyline coordinates={routePts.map(toRN)} strokeWidth={5} strokeColor={theme.primary} />
          </React.Fragment>
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
        {(dropoff || ride) &&
          shownStops.filter(validPoint).map((p, i) => (
            <ViewMarker key={`s${i}`} point={p} dep={`s${i}-${p.lat}-${p.lng}`}>
              <Pin color={theme.violet} label={String(i + 1)} />
            </ViewMarker>
          ))}
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

      {picking && (
        <>
          <View pointerEvents="none" style={styles.pickPinWrap}>
            <View style={styles.pickPin}>
              <View style={[styles.pickHead, { backgroundColor: kindColor(picking) }]}>
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
            <Text style={common.muted}>{kindLabel(picking)}</Text>
            <View style={[common.row, { gap: 10, minHeight: 44 }]}>
              <Icon name={picking === 'pickup' ? 'location' : picking === 'stop' ? 'stop' : 'flag'} size={20} color={kindColor(picking)} />
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
              title={picking === 'pickup' ? 'Confirmar recolha' : picking === 'stop' ? 'Adicionar paragem' : 'Confirmar destino'}
              variant="accent"
              disabled={!pickCenter}
              onPress={confirmPick}
            />
            <Button title="Cancelar" variant="ghost" onPress={() => setPicking(null)} />
          </Sheet>
        </>
      )}

      {!ride && !dropoff && !picking && (
        <Sheet>
          <Text style={styles.hello}>Olá, {profile.name.split(' ')[0]}</Text>
          <Pressable onPress={() => setSearch('dropoff')} style={styles.where} accessibilityRole="search">
            <View style={styles.whereIcon}>
              <Icon name="search" size={16} color="#fff" strokeWidth={2.4} />
            </View>
            <Text style={styles.whereText}>Para onde vamos?</Text>
          </Pressable>
          <View style={styles.fleet}>
            {CATEGORIES.map((c, i) => (
              <View key={c.id} style={[styles.fleetItem, { backgroundColor: categoryColors(c.id).soft }]}>
                <Vehicle3D category={c.id} size={44} delay={i * 350} />
                <Text style={[styles.fleetText, { color: categoryColors(c.id).fg }]}>{c.label}</Text>
              </View>
            ))}
          </View>
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
                  onPress={() => pickup && dropoff && doRequest({ pickup, dropoff, stops, category, payment })}
                  style={{ minHeight: 42, paddingHorizontal: 22 }}
                />
              </View>
            ) : undefined
          }
        >

          <View style={styles.route}>
            <View style={styles.routeRow}>
              <View style={styles.dot} />
              <Pressable onPress={() => setSearch('pickup')} hitSlop={4} style={{ flex: 1 }}>
                <Text style={styles.routeText} numberOfLines={1}>{pickup?.address ?? 'A obter localização…'}</Text>
              </Pressable>
              {quote ? (
                <Text style={styles.routeMeta}>
                  {formatDistance(quote.distanceMeters)} · {formatDuration(quote.durationSeconds)}
                </Text>
              ) : null}
            </View>
            {stops.map((p, i) => (
              <View key={`${i}-${p.lat}-${p.lng}`} style={styles.routeRow}>
                <View style={styles.stopDot}>
                  <Text style={styles.stopNum}>{i + 1}</Text>
                </View>
                <Text style={[styles.routeText, { flex: 1 }]} numberOfLines={1}>{p.address}</Text>
                <Pressable
                  onPress={() => setStops((list) => list.filter((_, j) => j !== i))}
                  hitSlop={10}
                  style={styles.xSmall}
                  accessibilityLabel={`Remover paragem ${i + 1}`}
                >
                  <Icon name="close" size={14} color={theme.muted} />
                </Pressable>
              </View>
            ))}
            <View style={styles.routeRow}>
              <View style={styles.square} />
              <Pressable onPress={() => setSearch('dropoff')} hitSlop={4} style={{ flex: 1 }}>
                <Text style={[styles.routeText, { fontWeight: '700' }]} numberOfLines={1}>{dropoff.address}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDropoff(null);
                  setStops([]);
                  setQuote(null);
                  setRoutes([]);
                  chosenKm.current = null;
                  setQuoteError('');
                }}
                hitSlop={10}
                style={styles.xSmall}
                accessibilityLabel="Remover destino"
              >
                <Icon name="close" size={15} color={theme.muted} />
              </Pressable>
            </View>
            {stops.length < MAX_STOPS && (
              <Pressable onPress={() => setSearch('stop')} style={styles.addStop} accessibilityRole="button" hitSlop={4}>
                <Icon name="plus" size={15} color={theme.violet} strokeWidth={2.4} />
                <Text style={styles.addStopText}>
                  {stops.length ? 'Adicionar outra paragem' : 'Adicionar paragem pelo caminho'}
                </Text>
              </Pressable>
            )}
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
              {sandy && sand ? (
                <FadeIn style={styles.sandCard}>
                  <View style={styles.sandIcon}>
                    <Icon name="sand" size={18} color={theme.sand} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.sandTitle}>Zona de areia · Mota e Conforto andam melhor</Text>
                    <Text style={styles.sandText}>
                      {sandMessage(sand.pickupSand, sand.dropoffSand, sand.sandMeters)}
                    </Text>
                    {sand.pickupSand ? (
                      <Pressable onPress={() => setSearch('pickup')} hitSlop={6}>
                        <Text style={styles.sandLink}>Escolher recolha numa estrada alcatroada</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </FadeIn>
              ) : null}
              {showRoutes ? (
                <View style={styles.routes} accessibilityRole="radiogroup" accessibilityLabel="Rotas possíveis">
                  {routes.map((r, i) => {
                    const on = r === quote;
                    const price = r.prices?.[category];
                    const cheapest = price === cheapestPrice;
                    const fastest = r.durationSeconds === fastestSecs;
                    const label = cheapest && fastest ? 'Melhor' : cheapest ? 'Mais barata' : fastest ? 'Mais rápida' : `Rota ${i + 1}`;
                    return (
                      <Pressable
                        key={r.quoteId ?? i}
                        onPress={() => {
                          tap();
                          setQuote(r);
                          chosenKm.current = r.distanceMeters;
                        }}
                        style={[styles.routeOpt, on && styles.routeOptOn]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${label}: ${formatDistance(r.distanceMeters)}, ${formatDuration(r.durationSeconds)}, ${money(price)}`}
                      >
                        <Text style={[styles.routeOptTag, cheapest && { color: theme.primary }]} numberOfLines={1}>
                          {label}
                        </Text>
                        <Text style={[styles.routeOptPrice, on && { color: theme.ink }]} numberOfLines={1}>
                          {money(price)}
                        </Text>
                        <Text style={styles.routeOptMeta} numberOfLines={1}>
                          {formatDistance(r.distanceMeters)} · {formatDuration(r.durationSeconds)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <PriceTags tags={tags} />

              <View style={styles.cats}>
                {CATEGORIES.map((c, i) => {
                  const on = category === c.id;
                  const col = categoryColors(c.id);
                  const goodOnSand = sandy && c.id !== 'economico';
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        tap();
                        setCategory(c.id);
                      }}
                      style={[styles.cat, on && { borderColor: col.fg, backgroundColor: col.soft }, on && shadow(1)]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${c.label}, ${money(quote.prices?.[c.id])}`}
                    >
                      <Vehicle3D category={c.id} size={58} active={on} delay={i * 400} />
                      <Text style={[styles.catName, on && { color: col.fg }]} numberOfLines={1}>{c.label}</Text>
                      <Text style={[styles.catPrice, on && { color: theme.ink }]}>{money(quote.prices?.[c.id])}</Text>
                      {goodOnSand ? (
                        <Text style={[styles.catHint, { color: theme.sand }]} numberOfLines={1}>melhor na areia</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

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
                      <View style={styles.chipRow}>
                        <Icon name={p.icon} size={14} color={on ? '#fff' : theme.muted} />
                        <Text style={[styles.chipText, on && { color: '#fff' }]}>{p.label}</Text>
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => setNoteOpen(true)} style={[styles.chip, note ? styles.chipNote : null]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name={note ? 'check' : 'pencil'} size={13} color={note ? theme.accentDark : theme.muted} />
                    <Text style={styles.chipText} numberOfLines={1}>Nota</Text>
                  </View>
                </Pressable>
              </View>
              {waitRate ? (
                <View style={styles.waitInfo}>
                  <Icon name="timer" size={13} color={theme.muted} />
                  <Text style={styles.waitInfoText}>
                    Espera grátis de {freeWait} min na recolha; depois {money(waitRate)}/min.
                  </Text>
                </View>
              ) : null}
              {requestError ? <ErrorNote text={requestError} /> : null}
              <Button
                title={`Pedir ${categoryLabel(category)} · ${money(quote.prices?.[category])}`}
                variant="accent"
                disabled={quoteLoading}
                onPress={() => pickup && dropoff && doRequest({ pickup, dropoff, stops, category, payment })}
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
          {ride.status === 'arrived' && ride.waitRatePerMin ? (
            <View style={styles.waitCard}>
              <Icon name="timer" size={18} color={theme.warn} />
              <Text style={[common.body, { flex: 1, fontSize: 13 }]}>
                {ride.arrivedAt
                  ? `Espera grátis até às ${clockTime(ride.arrivedAt + (ride.freeWaitMin ?? 3) * 60000)}. `
                  : `Espera grátis de ${ride.freeWaitMin ?? 3} min. `}
                Depois: {money(ride.waitRatePerMin)}/min.
              </Text>
            </View>
          ) : null}
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
                <View style={[common.row, { gap: 4 }]}>
                  <Text style={common.muted} numberOfLines={1}>{ride.driver.car} ·</Text>
                  <Icon name="star" size={12} color={theme.accent} />
                  <Text style={common.muted}>{Number.isFinite(ride.driver.rating) ? ride.driver.rating.toFixed(1) : '-'}</Text>
                </View>
                <View style={styles.plate}>
                  <Text style={styles.plateText}>{ride.driver.plate}</Text>
                </View>
              </View>
            </View>
          ) : null}
          <View style={{ gap: 4 }}>
            <View style={styles.addrRow}>
              <Icon name="location" size={14} color={theme.primary} />
              <Text style={[common.body, { flex: 1 }]} numberOfLines={1}>{ride.pickup?.address}</Text>
            </View>
            {(ride.stops ?? []).map((p, i) => (
              <View key={`rs${i}`} style={styles.addrRow}>
                <Icon name="stop" size={14} color={theme.violet} />
                <Text style={[common.body, { flex: 1 }]} numberOfLines={1}>Paragem {i + 1}: {p.address}</Text>
              </View>
            ))}
            <View style={styles.addrRow}>
              <Icon name="flag" size={14} color={theme.accentDark} />
              <Text style={[common.body, { flex: 1 }]} numberOfLines={1}>{ride.dropoff?.address}</Text>
            </View>
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
              doRequest({ pickup: ride.pickup, dropoff: ride.dropoff, stops: ride.stops ?? [], category: ride.category, payment: ride.payment })
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
                doRequest({ pickup: ride.pickup, dropoff: ride.dropoff, stops: ride.stops ?? [], category: ride.category, payment: ride.payment })
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
          title={search === 'dropoff' ? 'Para onde?' : search === 'stop' ? `Paragem ${stops.length + 1}` : 'Ponto de recolha'}
          near={pos ?? undefined}
          onClose={() => setSearch(null)}
          onUseCurrent={search === 'pickup' ? useCurrentAsPickup : undefined}
          onPickOnMap={() => startPick(search)}
          onSelect={(p) => {
            setPlace(search, p);
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

type PlaceKind = 'dropoff' | 'pickup' | 'stop';

function kindColor(k: PlaceKind | null) {
  return k === 'pickup' ? theme.primary : k === 'stop' ? theme.violet : theme.accentDark;
}
function kindLabel(k: PlaceKind | null) {
  return k === 'pickup' ? 'Local de recolha' : k === 'stop' ? 'Paragem pelo caminho' : 'Destino';
}

function sandMessage(pickupSand: boolean, dropoffSand: boolean, sandMeters: number) {
  const where = [pickupSand ? 'recolha' : '', dropoffSand ? 'destino' : ''].filter(Boolean).join(' e ');
  const parts: string[] = [];
  if (where) parts.push(`${where[0].toUpperCase()}${where.slice(1)} em rua de areia.`);
  if (sandMeters >= 50) parts.push(`~${formatDistance(sandMeters)} em areia, já no preço.`);
  return parts.join(' ');
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
  const col = categoryColors(category);
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
  return (
    <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.pulse, { backgroundColor: col.fg, transform: [{ scale }], opacity }]} />
      <View style={[styles.pulseCore, { backgroundColor: col.soft }]}>
        <Vehicle3D category={category} size={70} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', left: 16 },

  pickPinWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },

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
  hello: { fontSize: 18, fontWeight: '700', color: theme.ink, letterSpacing: -0.2 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderRadius: 16, backgroundColor: theme.bg, paddingHorizontal: 8, borderWidth: 1, borderColor: theme.line },
  whereIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
  fleet: { flexDirection: 'row', gap: 8 },
  fleetItem: { flex: 1, alignItems: 'center', borderRadius: 14, paddingTop: 2, paddingBottom: 6 },
  fleetText: { fontSize: 12, fontWeight: '700' },
  pickupMini: { gap: 8, minHeight: 28 },
  linkSmall: { color: theme.primary, fontWeight: '600', fontSize: 12.5, textAlign: 'center' },

  route: { backgroundColor: theme.bg, borderRadius: 14, paddingVertical: 6, paddingLeft: 12, paddingRight: 4 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30 },
  square: { width: 10, height: 10, borderRadius: 2, backgroundColor: theme.accentDark },
  stopDot: { width: 16, height: 16, borderRadius: 8, marginHorizontal: -3, backgroundColor: theme.violet, alignItems: 'center', justifyContent: 'center' },
  stopNum: { color: '#fff', fontSize: 10, fontWeight: '800' },
  routeText: { fontSize: 13.5, color: theme.ink },
  routeMeta: { fontSize: 11.5, color: theme.muted, paddingRight: 8 },
  addStop: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32, alignSelf: 'flex-start' },
  addStopText: { color: theme.violet, fontWeight: '700', fontSize: 13 },
  xSmall: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  sandCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.sandSoft, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10 },
  sandIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  sandTitle: { fontSize: 13, fontWeight: '700', color: theme.ink },
  sandText: { fontSize: 12, color: theme.muted, lineHeight: 16 },
  sandLink: { fontSize: 12, fontWeight: '700', color: theme.sand },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waitInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waitInfoText: { fontSize: 11.5, color: theme.muted, flex: 1 },
  waitCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.warnSoft, borderRadius: 12, padding: 10 },
  cats: { flexDirection: 'row', gap: 8 },
  routes: { flexDirection: 'row', gap: 8 },
  routeOpt: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.line,
    gap: 1,
  },
  routeOptOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  routeOptTag: { fontSize: 11, fontWeight: '700', color: theme.muted },
  routeOptPrice: { fontSize: 15, fontWeight: '800', color: theme.muted },
  routeOptMeta: { fontSize: 11, color: theme.muted },
  catName: { fontSize: 13, fontWeight: '700', color: theme.ink },
  catDesc: { fontSize: 11.5, color: theme.muted },
  catPrice: { fontSize: 14, fontWeight: '700', color: theme.muted },
  catHint: { fontSize: 10.5, fontWeight: '700' },
  chip: { minHeight: 34, borderRadius: 999, paddingHorizontal: 12, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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
    gap: 1,
    paddingTop: 2,
    paddingBottom: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.line,
    backgroundColor: theme.card,
  },
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
  pulse: { position: 'absolute', width: 90, height: 90, borderRadius: 45 },
  pulseCore: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 16, right: 16 },
});
