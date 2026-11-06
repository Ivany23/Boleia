import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, StyleSheet, Switch, Text, View } from 'react-native';
import MapView, { Polyline } from '../map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPricing } from '../api';
import { CancelDialog } from '../components/CancelDialog';
import { Logo } from '../components/Logo';
import {
  Avatar,
  Button,
  ErrorNote,
  FareDetails,
  MapButton,
  Pin,
  PriceTags,
  Sheet,
  common,
} from '../components/ui';
import { VehicleMarker } from '../components/VehicleMarker';
import { ViewMarker } from '../components/ViewMarker';
import { notify } from '../haptics';
import { bearing, useSmoothPoint } from '../motion';
import { currentPosition } from '../location';
import { getSocket } from '../socket';
import { theme } from '../theme';
import type { LatLng, PricingInfo, Profile, Ride, RideOffer } from '../types';
import {
  MAPUTO,
  PAYMENTS,
  categoryLabel,
  cleanPath,
  formatDistance,
  formatDuration,
  money,
  pct,
  priceTags,
  toRN,
  validPoint,
} from '../utils';

const LIVE = ['accepted', 'arrived', 'in_progress'];
const earningsOf = (r: Ride) => {
  const v = r.fare?.driverEarnings ?? r.price;
  return Number.isFinite(v) ? v : 0;
};

export function DriverScreen({ profile, onExit }: { profile: Profile; onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [pos, setPos] = useState<LatLng>(MAPUTO);
  const posRef = useRef<LatLng>(MAPUTO);
  const [online, setOnline] = useState(false);
  const onlineRef = useRef(false);
  const [offer, setOffer] = useState<RideOffer | null>(null);
  const [left, setLeft] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const pendingAccept = useRef<string | null>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const rideRef = useRef<Ride | null>(null);
  const [total, setTotal] = useState(0);
  const [trips, setTrips] = useState(0);
  const [notice, setNotice] = useState('');
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [follow, setFollow] = useState(true);
  const countedRef = useRef<string | null>(null);
  const me = useSmoothPoint(pos);
  const camRef = useRef<{ p: LatLng; heading: number } | null>(null);

  const setRideBoth = (r: Ride | null) => {
    rideRef.current = r;
    setRide(r);
  };

  // Tarifa em vigor e preço do combustível (actualiza a cada 5 min)
  useEffect(() => {
    let alive = true;
    const load = () =>
      getPricing().then((p) => {
        if (alive && p) setPricing(p);
      });
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const goOnline = useCallback(() => {
    getSocket().emit('driver:online', {
      phone: profile.phone,
      name: profile.name,
      car: profile.car ?? '',
      plate: profile.plate ?? '',
      category: profile.category ?? 'economico',
      location: posRef.current,
    });
  }, [profile]);

  // Location watcher + 3s sender, only while online
  useEffect(() => {
    if (!online) return;
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    (async () => {
      try {
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 0 },
          (p) => {
            const l = { lat: p.coords.latitude, lng: p.coords.longitude };
            posRef.current = l;
            setPos(l);
          },
        );
        if (alive) sub = s;
        else s.remove();
      } catch {
        setNotice('Não foi possível seguir a sua posição por GPS. A usar a última posição conhecida.');
      }
    })();
    const timer = setInterval(() => {
      const s = getSocket();
      if (s.connected) s.emit('driver:location', posRef.current);
    }, 3000);
    return () => {
      alive = false;
      sub?.remove();
      clearInterval(timer);
    };
  }, [online]);

  // Initial position
  useEffect(() => {
    let alive = true;
    currentPosition().then(({ pos: p }) => {
      if (!alive) return;
      posRef.current = p;
      setPos(p);
      mapRef.current?.animateToRegion({ ...toRN(p), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Socket events
  useEffect(() => {
    const s = getSocket();
    const onOffer = (o: RideOffer) => {
      if (!o?.ride?.id || rideRef.current) return;
      notify('warning');
      setOffer(o);
      setLeft(Number.isFinite(o.expiresInSeconds) && o.expiresInSeconds > 0 ? o.expiresInSeconds : 15);
    };
    const onUpdate = (r: Ride) => {
      if (!r?.id) return;
      const mine = rideRef.current?.id === r.id || pendingAccept.current === r.id;
      if (!mine) return;
      if (pendingAccept.current === r.id) {
        pendingAccept.current = null;
        setAccepting(false);
        setOffer(null);
      }
      if (rideRef.current?.status !== r.status && r.status === 'cancelled') notify('error');
      setRideBoth(r);
      if (r.status === 'completed' && countedRef.current !== r.id) {
        countedRef.current = r.id;
        notify('success');
        setTotal((t) => t + earningsOf(r));
        setTrips((n) => n + 1);
      }
    };
    const onConnect = () => {
      if (onlineRef.current) goOnline();
    };
    // o servidor recusou ficar online (ex.: número de WhatsApp inválido)
    const onDriverError = (e: { error?: string }) => {
      onlineRef.current = false;
      setOnline(false);
      setNotice(typeof e?.error === 'string' ? e.error : 'Não foi possível ficar online.');
    };
    s.on('ride:offer', onOffer);
    s.on('ride:update', onUpdate);
    s.on('connect', onConnect);
    s.on('driver:error', onDriverError);
    return () => {
      s.off('ride:offer', onOffer);
      s.off('ride:update', onUpdate);
      s.off('connect', onConnect);
      s.off('driver:error', onDriverError);
      if (onlineRef.current) s.emit('driver:offline');
    };
  }, [goOnline]);

  // Offer countdown
  useEffect(() => {
    if (!offer || accepting) return;
    const t = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setOffer(null);
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [offer, accepting]);

  function toggle(v: boolean) {
    setNotice('');
    onlineRef.current = v;
    setOnline(v);
    if (v) {
      if (!getSocket().connected) setNotice('Sem ligação ao servidor. Ficará online quando a ligação voltar.');
      goOnline();
    } else {
      getSocket().emit('driver:offline');
      setOffer(null);
    }
  }

  function accept() {
    if (!offer) return;
    pendingAccept.current = offer.ride.id;
    setAccepting(true);
    getSocket().emit('ride:accept', { rideId: offer.ride.id });
    const id = offer.ride.id;
    setTimeout(() => {
      if (pendingAccept.current === id) {
        pendingAccept.current = null;
        setAccepting(false);
        setOffer(null);
        setNotice('Esta viagem já não está disponível.');
      }
    }, 6000);
  }

  function decline() {
    if (offer) getSocket().emit('ride:decline', { rideId: offer.ride.id });
    setOffer(null);
  }

  const act = (ev: 'ride:arrived' | 'ride:start' | 'ride:complete') => {
    if (!rideRef.current) return;
    if (!getSocket().connected) return setNotice('Sem ligação ao servidor.');
    getSocket().emit(ev, { rideId: rideRef.current.id });
  };

  function cancelRide(reason: string) {
    setCancelOpen(false);
    if (!rideRef.current) return;
    if (!getSocket().connected) return setNotice('Sem ligação ao servidor.');
    getSocket().emit('ride:cancel', { rideId: rideRef.current.id, reason });
  }

  function closeRide() {
    setRideBoth(null);
    setNotice('');
    setFollow(true);
    camRef.current = null;
    mapRef.current?.animateCamera({ pitch: 0, heading: 0, center: toRN(posRef.current) }, { duration: 500 });
  }

  /** Abre a navegação do Google Maps até à recolha (ou ao destino, já em viagem). */
  function navigate() {
    const r = rideRef.current;
    if (!r) return;
    const t = r.status === 'in_progress' ? r.dropoff : r.pickup;
    if (!validPoint(t)) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lng}&travelmode=driving`;
    Linking.openURL(url).catch(() => setNotice('Não foi possível abrir a navegação.'));
  }

  const live = !!ride && LIVE.includes(ride.status);

  // Fit route when ride becomes active (vista geral; o modo 3D assume a seguir)
  useEffect(() => {
    const pts = cleanPath(ride?.polyline);
    if (ride && pts.length > 1 && !follow) {
      mapRef.current?.fitToCoordinates([...pts, pos].filter(validPoint).map(toRN), {
        edgePadding: { top: insets.top + 80, right: 50, bottom: 380, left: 50 },
        animated: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

  // Câmara de navegação 3D: atrás do carro, inclinada e virada para onde segue
  useEffect(() => {
    if (!live || !follow) return;
    const prev = camRef.current;
    const moved = prev ? Math.abs(prev.p.lat - pos.lat) + Math.abs(prev.p.lng - pos.lng) > 0.00003 : false;
    const heading = prev && moved ? bearing(prev.p, pos) : (prev?.heading ?? 0);
    camRef.current = { p: pos, heading };
    mapRef.current?.animateCamera({ center: toRN(pos), heading, pitch: 55, zoom: 17.5 }, { duration: 1000 });
  }, [live, follow, pos]);

  function overview() {
    setFollow(false);
    const pts = [...cleanPath(rideRef.current?.polyline), posRef.current].filter(validPoint);
    mapRef.current?.animateCamera({ pitch: 0, heading: 0 }, { duration: 300 });
    if (pts.length > 1) {
      mapRef.current?.fitToCoordinates(pts.map(toRN), {
        edgePadding: { top: insets.top + 80, right: 50, bottom: 380, left: 50 },
        animated: true,
      });
    }
  }

  const routePts = cleanPath(ride?.polyline);
  const period = pricing?.period;
  const offerRide = offer?.ride;
  const category = profile.category ?? 'economico';

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...toRN(pos), latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsBuildings
        pitchEnabled
        toolbarEnabled={false}
        showsCompass={false}
        onPanDrag={() => follow && live && setFollow(false)}
      >
        {routePts.length > 1 && (
          <>
            <Polyline coordinates={routePts.map(toRN)} strokeWidth={10} strokeColor="rgba(10,122,75,0.22)" />
            <Polyline coordinates={routePts.map(toRN)} strokeWidth={5} strokeColor={theme.primary} />
          </>
        )}
        {ride && validPoint(ride.pickup) && (
          <ViewMarker point={ride.pickup} dep="p">
            <Pin color={theme.primary} />
          </ViewMarker>
        )}
        {ride && validPoint(ride.dropoff) && (
          <ViewMarker point={ride.dropoff} dep="d">
            <Pin color={theme.accentDark} />
          </ViewMarker>
        )}
        {me && <VehicleMarker point={me.point} heading={me.heading} category={category} size={30} zIndex={10} />}
      </MapView>

      {!ride && (
        <MapButton
          icon="‹"
          label="Voltar"
          onPress={() => {
            if (online) toggle(false);
            onExit();
          }}
          style={[styles.back, { top: insets.top + 10 }]}
        />
      )}
      {!ride && (
        <MapButton
          icon="◎"
          label="A minha posição"
          onPress={() => mapRef.current?.animateToRegion({ ...toRN(posRef.current), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400)}
          style={[styles.backRight, { top: insets.top + 10 }]}
        />
      )}
      {live && (
        <View style={[styles.mapTools, { top: insets.top + 10 }]}>
          <MapButton icon="🧭" label="Modo navegação 3D" active={follow} onPress={() => setFollow((f) => !f)} />
          <MapButton icon="⤢" label="Ver o percurso todo" onPress={overview} />
        </View>
      )}

      {!ride && (
        <Sheet>
          <View style={common.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Logo size={22} />
              <View style={[common.row, { gap: 8, marginTop: 6 }]}>
                <View style={[styles.liveDot, { backgroundColor: online ? theme.primaryLight : theme.line }]} />
                <Text style={common.h1}>{online ? 'Está online' : 'Está offline'}</Text>
              </View>
              <Text style={common.muted}>
                {online ? 'À espera de pedidos de boleia…' : 'Ligue para receber pedidos.'}
              </Text>
            </View>
            <Switch
              value={online}
              onValueChange={toggle}
              trackColor={{ true: theme.primary, false: theme.line }}
              thumbColor={online ? theme.accent : '#fff'}
              style={{ transform: [{ scale: 1.3 }] }}
              accessibilityLabel="Ficar online"
            />
          </View>
          <Text style={common.muted}>
            {profile.car} · {profile.plate} · {categoryLabel(profile.category)}
          </Text>

          {pricing && period && (
            <View style={[styles.period, period.multiplier > 1 ? styles.periodHot : null]}>
              <Text style={{ fontSize: 22 }}>{period.id === 'noite' ? '🌙' : period.multiplier > 1 ? '⏰' : '☀️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.periodTitle}>
                  {period.label}
                  {period.multiplier > 1 ? ` · viagens rendem ${pct(period.multiplier)}` : ''}
                </Text>
                <Text style={common.muted}>
                  Gasolina {pricing.fuel.gasolina.toFixed(2).replace('.', ',')} MT/L · já incluída no preço
                </Text>
                {pricing.driverMinHourly ? (
                  <Text style={common.muted}>
                    Ganho mínimo garantido: {money(pricing.driverMinHourly)}/hora, além do combustível
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          <View style={[common.row, styles.earn]}>
            <View style={{ flex: 1 }}>
              <Text style={common.muted}>Ganhos líquidos da sessão</Text>
              <Text style={[common.h1, { color: theme.primary }]}>{money(total)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={common.h2}>{trips}</Text>
              <Text style={common.muted}>viagem(ns)</Text>
            </View>
          </View>
          {notice ? <ErrorNote text={notice} /> : null}
        </Sheet>
      )}

      {live && ride && (
        <Sheet
          summary={
            <View style={{ paddingBottom: 4 }}>
              <Text style={[common.h2, { color: theme.primary }]} numberOfLines={1}>{driverTitle(ride)}</Text>
              <Text style={common.muted} numberOfLines={1}>
                {ride.passengerName} · recebe {money(earningsOf(ride))}
              </Text>
            </View>
          }
        >
          <View style={[common.row, { gap: 10 }]}>
            <Text style={[common.h2, { color: theme.primary, flex: 1 }]}>{driverTitle(ride)}</Text>
            <Button title="Navegar" variant="ghost" onPress={navigate} style={styles.navBtn} />
          </View>
          <View style={[common.row, styles.paxCard]}>
            <Avatar name={ride.passengerName} size={46} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={common.h2} numberOfLines={1}>{ride.passengerName}</Text>
              <Text style={common.muted}>
                {PAYMENTS.find((p) => p.id === ride.payment)?.label} · recebe {money(earningsOf(ride))}
              </Text>
            </View>
          </View>
          {ride.note ? (
            <View style={styles.note}>
              <Text style={{ fontSize: 14 }}>📝</Text>
              <Text style={[common.body, { flex: 1 }]}>{ride.note}</Text>
            </View>
          ) : null}
          <View style={{ gap: 4 }}>
            <Text style={common.body} numberOfLines={1}>📍 {ride.pickup?.address}</Text>
            <Text style={common.body} numberOfLines={1}>🏁 {ride.dropoff?.address}</Text>
          </View>
          <Text style={common.muted}>
            Cobrar ao passageiro: {money(ride.price)} · {formatDistance(ride.distanceMeters)}
          </Text>
          {notice ? <ErrorNote text={notice} /> : null}
          {ride.status === 'accepted' && <Button title="Cheguei" onPress={() => act('ride:arrived')} />}
          {ride.status === 'arrived' && <Button title="Iniciar viagem" onPress={() => act('ride:start')} />}
          {ride.status === 'in_progress' && <Button title="Terminar viagem" variant="accent" onPress={() => act('ride:complete')} />}
          {ride.status !== 'in_progress' && (
            <Button title="Cancelar viagem" variant="danger" onPress={() => setCancelOpen(true)} />
          )}
        </Sheet>
      )}

      {ride?.status === 'completed' && (
        <Sheet>
          <Text style={[common.h1, { textAlign: 'center' }]}>Viagem concluída ✅</Text>
          <Text style={[common.muted, { textAlign: 'center' }]}>Cobre ao passageiro</Text>
          <Text style={styles.bigPrice}>{money(ride.price)}</Text>
          <Text style={[common.muted, { textAlign: 'center' }]}>
            {formatDistance(ride.distanceMeters)} · {formatDuration(ride.durationSeconds)} · {PAYMENTS.find((p) => p.id === ride.payment)?.label}
          </Text>
          {ride.fare && <FareDetails fare={ride.fare} perspective="driver" />}
          <Text style={[common.body, { textAlign: 'center' }]}>Ganhos líquidos da sessão: {money(total)}</Text>
          <Button title="Continuar online" onPress={closeRide} />
        </Sheet>
      )}

      {ride?.status === 'cancelled' && (
        <Sheet>
          <Text style={{ fontSize: 34, textAlign: 'center' }}>🚫</Text>
          <Text style={[common.h2, { textAlign: 'center' }]}>
            {ride.cancelledBy === 'passenger' ? 'O passageiro cancelou a viagem' : 'Viagem cancelada'}
          </Text>
          {ride.cancelledBy === 'passenger' && ride.cancelReason ? (
            <Text style={[common.muted, { textAlign: 'center' }]}>Motivo: {ride.cancelReason}</Text>
          ) : null}
          <Button title="Fechar" onPress={closeRide} />
        </Sheet>
      )}

      {ride && (ride.status === 'searching' || ride.status === 'no_drivers') && (
        <Sheet>
          <Text style={[common.h2, { textAlign: 'center' }]}>A viagem foi reatribuída</Text>
          <Button title="Fechar" onPress={closeRide} />
        </Sheet>
      )}

      <Modal visible={!!offer && !ride} transparent animationType="slide" onRequestClose={decline}>
        <View style={styles.modalBg}>
          <View style={[styles.offer, { paddingBottom: Math.max(insets.bottom, 16) + 20 }]}>
            <View style={common.row}>
              <Text style={[common.h1, { flex: 1 }]}>Novo pedido</Text>
              <View style={styles.count}>
                <Text style={{ fontWeight: '900', fontSize: 20, color: theme.ink }}>{left}</Text>
              </View>
            </View>
            {offerRide && (
              <>
                <View style={styles.offerEarn}>
                  <Text style={{ color: '#CFEBDC', fontWeight: '700' }}>Você recebe</Text>
                  <Text style={styles.offerEarnValue}>{money(earningsOf(offerRide))}</Text>
                  <Text style={{ color: '#CFEBDC', fontSize: 12 }}>
                    Passageiro paga {money(offerRide.price)} · {PAYMENTS.find((p) => p.id === offerRide.payment)?.label}
                  </Text>
                </View>
                <PriceTags tags={priceTags(offerRide)} />
                <Text style={common.muted}>
                  {formatDistance(offer?.pickupDistanceMeters)} até à recolha · viagem de {formatDistance(offerRide.distanceMeters)} (
                  {formatDuration(offerRide.durationSeconds)})
                </Text>
                <Text style={common.body} numberOfLines={2}>📍 {offerRide.pickup?.address}</Text>
                <Text style={common.body} numberOfLines={2}>🏁 {offerRide.dropoff?.address}</Text>
                {offerRide.note ? (
                  <View style={styles.note}>
                    <Text style={{ fontSize: 14 }}>📝</Text>
                    <Text style={[common.body, { flex: 1 }]}>{offerRide.note}</Text>
                  </View>
                ) : null}
              </>
            )}
            {accepting ? (
              <Text style={[common.h2, { textAlign: 'center' }]}>A confirmar…</Text>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Recusar" variant="danger" onPress={decline} style={{ flex: 1 }} />
                <Button title="Aceitar" onPress={accept} style={{ flex: 1.4 }} />
              </View>
            )}
          </View>
        </View>
      </Modal>

      <CancelDialog
        visible={cancelOpen && live}
        role="driver"
        onClose={() => setCancelOpen(false)}
        onConfirm={cancelRide}
      />
    </View>
  );
}

function driverTitle(ride: Ride) {
  if (ride.status === 'accepted') return 'A caminho do passageiro';
  if (ride.status === 'arrived') return 'À espera do passageiro';
  return 'Viagem em curso';
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: 16 },
  backRight: { position: 'absolute', right: 16 },
  mapTools: { position: 'absolute', right: 16, gap: 10 },
  navBtn: { minHeight: 40, paddingHorizontal: 14, borderWidth: 1.5, borderColor: theme.primary },
  note: { flexDirection: 'row', gap: 8, backgroundColor: theme.accentSoft, borderRadius: 12, padding: 10 },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  period: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.bg, borderRadius: 16, padding: 12 },
  periodHot: { backgroundColor: theme.warnSoft },
  periodTitle: { fontSize: 15, fontWeight: '800', color: theme.ink },
  earn: { backgroundColor: theme.primarySoft, borderRadius: 16, padding: 14 },
  paxCard: { backgroundColor: theme.bg, borderRadius: 16, padding: 12 },
  bigPrice: { fontSize: 36, fontWeight: '900', color: theme.primary, textAlign: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  offer: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 10 },
  offerEarn: { backgroundColor: theme.primary, borderRadius: 18, padding: 16, alignItems: 'center', gap: 2 },
  offerEarnValue: { color: '#fff', fontSize: 36, fontWeight: '900' },
  count: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
});
