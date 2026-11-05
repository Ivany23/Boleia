import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Polyline } from '../map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getQuote } from '../api';
import { CancelDialog } from '../components/CancelDialog';
import {
  Avatar,
  Button,
  ErrorNote,
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
import { CarTop, VehicleBadge } from '../components/Vehicle';
import { VehicleMarker } from '../components/VehicleMarker';
import { ViewMarker } from '../components/ViewMarker';
import { mapStyle } from '../mapStyle';
import { notify, tap } from '../haptics';
import { addressOf, currentPosition } from '../location';
import { getSocket } from '../socket';
import { shadow, theme } from '../theme';
import type { AckResult, Category, DriverPublic, LatLng, Payment, Place, Profile, Quote, Ride } from '../types';
import {
  CATEGORIES,
  PAYMENTS,
  categoryLabel,
  cleanPath,
  formatDistance,
  formatDuration,
  haversine,
  money,
  priceTags,
  toRN,
  validPoint,
} from '../utils';
import { PlaceSearch } from './PlaceSearch';

const TERMINAL = ['completed', 'cancelled', 'no_drivers'];
const LIVE = ['accepted', 'arrived', 'in_progress'];

export function PassengerScreen({ profile, onExit }: { profile: Profile; onExit: () => void }) {
  const insets = useSafeAreaInsets();
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
  const [showFare, setShowFare] = useState(false);
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
      mapRef.current?.animateToRegion({ ...toRN(p), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
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
                edgePadding: { top: insets.top + 90, right: 50, bottom: 520, left: 50 },
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
        { ...params, passengerName: profile.name, quoteId: quote?.quoteId, note: note.trim() },
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
    [profile.name, quote, note],
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
    setShowFare(false);
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
  const quoteTags = quote ? priceTags(quote) : [];
  const selectedFare = quote?.fares?.[category];
  const trafficDelay =
    quote && quote.staticDurationSeconds && quote.durationSeconds > quote.staticDurationSeconds + 60
      ? quote.durationSeconds - quote.staticDurationSeconds
      : 0;
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
        customMapStyle={mapStyle}
        showsUserLocation
        showsMyLocationButton={false}
        showsBuildings
        pitchEnabled
        toolbarEnabled={false}
        showsCompass={false}
        onPanDrag={() => follow && setFollow(false)}
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

      {!ride && <MapButton icon="‹" label="Voltar" onPress={onExit} style={[styles.floating, { top: insets.top + 10 }]} />}
      {!ride && pos && (
        <MapButton
          icon="◎"
          label="A minha posição"
          onPress={() => mapRef.current?.animateToRegion({ ...toRN(pos), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400)}
          style={[styles.floatingRight, { top: insets.top + 10 }]}
        />
      )}
      {active && (
        <View style={[styles.mapTools, { top: insets.top + 10 }]}>
          <MapButton icon="🧭" label="Seguir o motorista em 3D" active={follow} onPress={() => setFollow((f) => !f)} />
          <MapButton icon="⤢" label="Ver o percurso todo" onPress={overview} />
        </View>
      )}

      {/* Sheets */}
      {!ride && !dropoff && (
        <Sheet>
          <Text style={common.h1}>Olá, {profile.name.split(' ')[0]} 👋</Text>
          <Pressable onPress={() => setSearch('dropoff')} style={[styles.where, shadow(1)]}>
            <View style={styles.whereIcon}>
              <Text style={{ fontSize: 16 }}>🔍</Text>
            </View>
            <Text style={styles.whereText}>Para onde vamos?</Text>
          </Pressable>
          <PickupRow pickup={pickup} onPress={() => setSearch('pickup')} />
          <View style={[common.row, { gap: 8 }]}>
            <View style={[styles.dotLive, { backgroundColor: nearby.length ? theme.primaryLight : theme.line }]} />
            <Text style={common.muted}>
              {nearby.length > 0 ? `${nearby.length} motorista(s) perto de si` : 'Nenhum motorista visível por agora.'}
            </Text>
          </View>
        </Sheet>
      )}

      {!ride && dropoff && (
        <Sheet>
          <View style={common.row}>
            <View style={{ flex: 1 }}>
              <Text style={common.muted}>Destino</Text>
              <Text style={[common.h2, { fontSize: 16 }]} numberOfLines={1}>{dropoff.address}</Text>
            </View>
            <Pressable
              onPress={() => {
                setDropoff(null);
                setQuote(null);
                setQuoteError('');
                setShowFare(false);
              }}
              hitSlop={10}
              style={styles.x}
              accessibilityLabel="Remover destino"
            >
              <Text style={{ fontSize: 18, color: theme.muted }}>✕</Text>
            </Pressable>
          </View>
          <PickupRow pickup={pickup} onPress={() => setSearch('pickup')} />

          {quoteLoading && !quote && (
            <View style={{ alignItems: 'center', padding: 14 }}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[common.muted, { marginTop: 6 }]}>A calcular o melhor preço…</Text>
            </View>
          )}
          {quoteError ? (
            <>
              <ErrorNote text={quoteError} />
              <Button title="Tentar de novo" variant="ghost" onPress={() => setQuoteNonce((n) => n + 1)} />
            </>
          ) : null}

          {quote && (
            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              <View style={[common.row, { gap: 8 }]}>
                <Text style={common.muted}>
                  {formatDistance(quote.distanceMeters)} · {formatDuration(quote.durationSeconds)}
                  {trafficDelay ? ` (+${formatDuration(trafficDelay)} de trânsito)` : ''}
                </Text>
                {quoteLoading && <ActivityIndicator size="small" color={theme.primary} />}
              </View>
              <PriceTags tags={quoteTags} />
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
                    <VehicleBadge category={c.id} size={48} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={common.h2}>{c.label}</Text>
                      <Text style={common.muted}>{c.desc}</Text>
                    </View>
                    <Text style={[common.h2, { color: on ? theme.primaryDark : theme.ink }]}>
                      {money(quote.prices?.[c.id])}
                    </Text>
                  </Pressable>
                );
              })}
              {selectedFare && (
                <Pressable onPress={() => setShowFare((v) => !v)} hitSlop={6}>
                  <Text style={styles.link}>{showFare ? 'Esconder detalhe do preço ▲' : 'Como é calculado este preço? ▼'}</Text>
                </Pressable>
              )}
              {showFare && selectedFare && <FareDetails fare={selectedFare} />}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PAYMENTS.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      tap();
                      setPayment(p.id);
                    }}
                    style={[styles.pay, payment === p.id && styles.payOn]}
                  >
                    <Text style={[styles.payText, payment === p.id && { color: '#fff' }]}>{p.label}</Text>
                    {p.note ? <Text style={[styles.payNote, payment === p.id && { color: '#DCEFE7' }]}>{p.note}</Text> : null}
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => setNoteOpen(true)} style={styles.noteRow}>
                <Text style={{ fontSize: 16 }}>✏️</Text>
                <Text style={[common.body, { flex: 1, color: note ? theme.ink : theme.muted }]} numberOfLines={1}>
                  {note || 'Nota para o motorista (ex.: portão azul)'}
                </Text>
                <Text style={{ color: theme.primary, fontWeight: '700' }}>{note ? 'Editar' : 'Adicionar'}</Text>
              </Pressable>
              {requestError ? <ErrorNote text={requestError} /> : null}
              <Text style={[common.muted, { textAlign: 'center', fontSize: 12 }]}>🔒 Preço fixo: paga o valor que vê agora.</Text>
              <Button
                title={`Pedir Boleia · ${money(quote.prices?.[category])}`}
                variant="accent"
                disabled={quoteLoading}
                onPress={() => pickup && dropoff && doRequest({ pickup, dropoff, category, payment })}
              />
            </ScrollView>
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
            {ride.status === 'arrived' && <Text style={{ fontSize: 22 }}>📍</Text>}
          </View>
          {progress !== null && (
            <View style={{ gap: 4 }}>
              <ProgressBar value={progress} />
              {kmLeft !== null && <Text style={common.muted}>Faltam cerca de {formatDistance(kmLeft)} (em linha recta)</Text>}
            </View>
          )}
          {ride.driver ? (
            <View style={[common.row, styles.driverCard]}>
              <Avatar name={ride.driver.name} emoji={ride.driver.category === 'moto' ? '🏍️' : '🚗'} />
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
            <Text style={common.body} numberOfLines={1}>📍 {ride.pickup?.address}</Text>
            <Text style={common.body} numberOfLines={1}>🏁 {ride.dropoff?.address}</Text>
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
          <Text style={[common.h1, { textAlign: 'center' }]}>Chegou ao destino 🎉</Text>
          <Text style={styles.bigPrice}>{money(ride.price)}</Text>
          <Text style={[common.muted, { textAlign: 'center' }]}>
            {formatDistance(ride.distanceMeters)} · {formatDuration(ride.durationSeconds)} ·{' '}
            {PAYMENTS.find((p) => p.id === ride.payment)?.label}
          </Text>
          {ride.fare && <FareDetails fare={ride.fare} />}
          <View style={styles.rateBox}>
            <Text style={[common.body, { textAlign: 'center', fontWeight: '700' }]}>
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
          <Text style={{ fontSize: 34, textAlign: 'center' }}>😕</Text>
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
          <Text style={{ fontSize: 34, textAlign: 'center' }}>🚫</Text>
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

function PickupRow({ pickup, onPress }: { pickup: Place | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[common.row, styles.pickupRow]}>
      <View style={styles.dot} />
      <View style={{ flex: 1 }}>
        <Text style={common.muted}>Recolha</Text>
        <Text style={common.body} numberOfLines={1}>{pickup?.address ?? 'A obter localização…'}</Text>
      </View>
      <Text style={{ color: theme.primary, fontWeight: '700' }}>Alterar</Text>
    </Pressable>
  );
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
  floatingRight: { position: 'absolute', right: 16 },
  mapTools: { position: 'absolute', right: 16, gap: 10 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderRadius: 18, backgroundColor: theme.card, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.line },
  whereIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 14, backgroundColor: theme.bg, paddingHorizontal: 12 },
  noteBg: { flex: 1, backgroundColor: 'rgba(6,33,15,0.45)', paddingHorizontal: 16 },
  noteCard: { backgroundColor: '#fff', borderRadius: 22, padding: 18, gap: 10 },
  noteInput: { minHeight: 80, maxHeight: 140, borderRadius: 14, backgroundColor: theme.bg, padding: 12, fontSize: 16, color: theme.ink, textAlignVertical: 'top' },
  whereText: { fontSize: 18, fontWeight: '700', color: theme.ink },
  pickupRow: { minHeight: 52, gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.primary },
  dotLive: { width: 8, height: 8, borderRadius: 4 },
  x: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  cat: { flexDirection: 'row', alignItems: 'center', minHeight: 68, borderRadius: 16, borderWidth: 2, borderColor: theme.line, paddingHorizontal: 14 },
  catOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  link: { color: theme.primary, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  pay: { flex: 1, minHeight: 56, borderRadius: 14, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 6 },
  payOn: { backgroundColor: theme.primary },
  payText: { fontSize: 14, fontWeight: '800', color: theme.ink },
  payNote: { fontSize: 10, color: theme.muted, textAlign: 'center' },
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
  plateText: { fontSize: 13, fontWeight: '900', letterSpacing: 1.2, color: theme.ink },
  bigPrice: { fontSize: 36, fontWeight: '900', color: theme.primary, textAlign: 'center' },
  pulse: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: theme.accent },
  pulseCore: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 16, right: 16 },
});
