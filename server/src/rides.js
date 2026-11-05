import { haversine } from './geo.js';
import { CATEGORIES, PAYMENTS, demandMultiplier } from './pricing.js';

const ACTIVE = ['accepted', 'arrived', 'in_progress'];
const TERMINAL = ['completed', 'cancelled', 'no_drivers'];
const MAX_PICKUP_M = 10000;
const NEARBY_M = 5000;
const DEMAND_RADIUS_M = 5000;
const ENDED_TTL_MS = 30 * 60 * 1000;
const RATING_PRIOR = 5; // avaliações "virtuais" iniciais, para uma nota não cair a pique

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
export const validLatLng = (p) =>
  !!p && isNum(p.lat) && isNum(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const str = (s, max = 120) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const place = (p) => ({ lat: p.lat, lng: p.lng, address: str(p.address, 300) });

const publicDriver = (d) => ({
  id: d.id,
  name: d.name,
  car: d.car,
  plate: d.plate,
  category: d.category,
  rating: Math.round(d.rating * 10) / 10,
  location: d.location,
});

/**
 * Estado em memória (motoristas, passageiros, viagens) e atribuição.
 * quotes: { quote(origin, destination), lookup(quoteId, origin, destination) }
 */
export function createRideService({
  io,
  quotes,
  offerTimeoutMs = 15000,
  clock = () => new Date(),
  log = console.log,
}) {
  const drivers = new Map(); // socketId -> driver
  const passengers = new Map(); // socketId -> { name, location }
  const rides = new Map(); // rideId -> Ride
  const meta = new Map(); // rideId -> { tried:Set, timer, offeredTo }
  const ended = new Map(); // rideId -> ms em que terminou
  const rated = new Set(); // rideIds já avaliados
  let seq = 0;

  const say = (msg) => log(`[boleia] ${msg}`);
  const nowMs = () => clock().getTime();

  function emitRide(ride) {
    io.to(ride.passengerId).emit('ride:update', ride);
    if (ride.driver) io.to(ride.driver.id).emit('ride:update', ride);
  }

  function setStatus(ride, status) {
    ride.status = status;
    say(`viagem ${ride.id} -> ${status}`);
    if (TERMINAL.includes(status)) ended.set(ride.id, nowMs());
    emitRide(ride);
  }

  function clearOffer(ride) {
    const m = meta.get(ride.id);
    if (!m) return;
    clearTimeout(m.timer);
    m.timer = null;
    const d = m.offeredTo && drivers.get(m.offeredTo);
    if (d && d.offering === ride.id) d.offering = null;
    m.offeredTo = null;
  }

  function endSearch(ride) {
    clearOffer(ride);
    meta.delete(ride.id);
  }

  function offerNext(ride) {
    const m = meta.get(ride.id);
    if (!m || ride.status !== 'searching') return;
    const best = [...drivers.values()]
      .filter((d) => !d.busy && !d.offering && d.category === ride.category && !m.tried.has(d.id))
      .map((d) => ({ d, dist: haversine(d.location, ride.pickup) }))
      .filter((x) => x.dist <= MAX_PICKUP_M)
      .sort((a, b) => a.dist - b.dist)[0];
    if (!best) {
      endSearch(ride);
      setStatus(ride, 'no_drivers');
      return;
    }
    const { d, dist } = best;
    m.tried.add(d.id);
    m.offeredTo = d.id;
    d.offering = ride.id;
    m.timer = setTimeout(() => {
      try {
        say(`oferta ${ride.id} expirou para motorista ${d.id}`);
        clearOffer(ride);
        offerNext(ride);
      } catch (e) {
        say(`erro no timer de oferta: ${e?.message ?? e}`);
      }
    }, offerTimeoutMs);
    say(`oferta ${ride.id} -> motorista ${d.id} (${Math.round(dist)} m)`);
    io.to(d.id).emit('ride:offer', {
      ride,
      expiresInSeconds: Math.max(1, Math.round(offerTimeoutMs / 1000)),
      pickupDistanceMeters: Math.round(dist),
    });
  }

  function terminate(ride, status, cancel) {
    if (cancel) {
      ride.cancelledBy = cancel.by;
      ride.cancelReason = cancel.reason;
    }
    const m = meta.get(ride.id);
    if (m?.offeredTo) io.to(m.offeredTo).emit('ride:update', { ...ride, status });
    endSearch(ride);
    const d = ride.driver && drivers.get(ride.driver.id);
    if (d) {
      d.busy = false;
      d.rideId = null;
    }
    setStatus(ride, status);
  }

  function activeRideOfPassenger(id) {
    return [...rides.values()].find(
      (r) => r.passengerId === id && (r.status === 'searching' || ACTIVE.includes(r.status)),
    );
  }

  function removeDriver(id, reason) {
    const d = drivers.get(id);
    if (!d) return;
    drivers.delete(id);
    say(`motorista ${id} offline (${reason})`);
    if (d.offering) {
      const ride = rides.get(d.offering);
      if (ride) {
        clearOffer(ride);
        offerNext(ride);
      }
    }
    if (d.rideId) {
      const ride = rides.get(d.rideId);
      if (ride && ACTIVE.includes(ride.status)) {
        delete ride.driver;
        meta.set(ride.id, { tried: new Set([id]), timer: null, offeredTo: null });
        setStatus(ride, 'searching');
        offerNext(ride);
      }
    }
  }

  /** Multiplicador de procura numa zona: pedidos à espera vs. motoristas livres. */
  function demand(category, point) {
    if (!validLatLng(point)) return 1;
    let waiting = 1; // o próprio pedido que está a ser cotado
    for (const r of rides.values()) {
      if (r.status === 'searching' && r.category === category && haversine(r.pickup, point) <= DEMAND_RADIUS_M) {
        waiting++;
      }
    }
    let free = 0;
    for (const d of drivers.values()) {
      if (!d.busy && !d.offering && d.category === category && haversine(d.location, point) <= DEMAND_RADIUS_M) {
        free++;
      }
    }
    return demandMultiplier(waiting, free);
  }

  async function requestRide(socket, p) {
    if (!p || !validLatLng(p.pickup) || !validLatLng(p.dropoff)) {
      return { ok: false, error: 'Locais de recolha e destino inválidos.' };
    }
    if (!CATEGORIES.includes(p.category)) return { ok: false, error: 'Categoria inválida.' };
    if (!PAYMENTS.includes(p.payment)) return { ok: false, error: 'Forma de pagamento inválida.' };
    if (activeRideOfPassenger(socket.id)) {
      return { ok: false, error: 'Já tem uma viagem em curso.' };
    }
    let q = quotes.lookup(p.quoteId, p.pickup, p.dropoff);
    if (!q) {
      try {
        q = await quotes.quote(p.pickup, p.dropoff);
      } catch (e) {
        say(`cotação falhou: ${e?.message ?? 'erro'}`);
        return {
          ok: false,
          error: e?.status ? e.message : 'Não foi possível calcular o preço da viagem.',
        };
      }
    }
    if (!socket.connected) return { ok: false, error: 'Ligação perdida.' };
    if (activeRideOfPassenger(socket.id)) {
      return { ok: false, error: 'Já tem uma viagem em curso.' };
    }
    const fare = q.fares[p.category];
    const ride = {
      id: `r${Date.now().toString(36)}${(++seq).toString(36)}`,
      status: 'searching',
      passengerId: socket.id,
      passengerName: str(p.passengerName, 60) || passengers.get(socket.id)?.name || 'Passageiro',
      pickup: place(p.pickup),
      dropoff: place(p.dropoff),
      category: p.category,
      payment: p.payment,
      note: str(p.note, 140),
      price: fare.total,
      fare,
      period: q.period,
      traffic: q.traffic,
      highDemand: !!q.highDemand,
      distanceMeters: q.distanceMeters,
      durationSeconds: q.durationSeconds,
      polyline: q.polyline,
      createdAt: Date.now(),
    };
    rides.set(ride.id, ride);
    meta.set(ride.id, { tried: new Set(), timer: null, offeredTo: null });
    say(`viagem ${ride.id} criada (${ride.category}, ${ride.price} MZN, ${q.period.label})`);
    const ack = { ok: true, ride: JSON.parse(JSON.stringify(ride)) };
    setImmediate(() => {
      try {
        offerNext(ride);
      } catch (e) {
        say(`erro a atribuir: ${e?.message ?? e}`);
      }
    });
    return ack;
  }

  function attach(socket) {
    const on = (ev, fn) =>
      socket.on(ev, (p) => {
        try {
          fn(p);
        } catch (e) {
          say(`erro em ${ev}: ${e?.message ?? e}`);
        }
      });
    const withAck = (ev, fn) =>
      socket.on(ev, (p, cb) => {
        let res;
        try {
          res = fn(p);
        } catch (e) {
          say(`erro em ${ev}: ${e?.message ?? e}`);
          res = { ok: false, error: 'Erro interno do servidor.' };
        }
        if (typeof cb === 'function') cb(res);
      });
    const findRide = (p, pred) => {
      const r = p && typeof p.rideId === 'string' ? rides.get(p.rideId) : null;
      return r && pred(r) ? r : null;
    };
    const asDriver = (p, status) =>
      findRide(p, (r) => r.driver?.id === socket.id && r.status === status);
    const offeredToMe = (p) =>
      findRide(p, (r) => r.status === 'searching' && meta.get(r.id)?.offeredTo === socket.id);

    on('passenger:hello', (p) => {
      if (!p || !validLatLng(p.location)) return;
      passengers.set(socket.id, { name: str(p.name, 60) || 'Passageiro', location: p.location });
      sendNearby(socket.id);
    });

    on('driver:online', (p) => {
      if (!p || !CATEGORIES.includes(p.category) || !validLatLng(p.location)) return;
      const prev = drivers.get(socket.id);
      drivers.set(socket.id, {
        id: socket.id,
        name: str(p.name, 60) || 'Motorista',
        car: str(p.car, 60),
        plate: str(p.plate, 20),
        category: p.category,
        rating: prev?.rating ?? 4.8,
        ratingCount: prev?.ratingCount ?? RATING_PRIOR,
        location: { lat: p.location.lat, lng: p.location.lng },
        busy: prev?.busy ?? false,
        offering: prev?.offering ?? null,
        rideId: prev?.rideId ?? null,
      });
      if (!prev) say(`motorista ${socket.id} online (${p.category})`);
    });

    on('driver:location', (p) => {
      const d = drivers.get(socket.id);
      if (!d || !validLatLng(p)) return;
      d.location = { lat: p.lat, lng: p.lng };
      const r = d.rideId && rides.get(d.rideId);
      if (r && ACTIVE.includes(r.status)) {
        io.to(r.passengerId).emit('ride:driver_location', d.location);
      }
    });

    on('driver:offline', () => removeDriver(socket.id, 'pedido'));

    socket.on('ride:request', async (p, cb) => {
      let res;
      try {
        res = await requestRide(socket, p);
      } catch (e) {
        say(`erro em ride:request: ${e?.message ?? e}`);
        res = { ok: false, error: 'Erro interno do servidor.' };
      }
      if (typeof cb === 'function') cb(res);
    });

    on('ride:accept', (p) => {
      const d = drivers.get(socket.id);
      const ride = offeredToMe(p);
      if (!d || !ride) return;
      clearOffer(ride);
      meta.delete(ride.id);
      d.busy = true;
      d.rideId = ride.id;
      ride.driver = publicDriver(d);
      setStatus(ride, 'accepted');
      io.to(ride.passengerId).emit('ride:driver_location', d.location);
    });

    on('ride:decline', (p) => {
      const ride = offeredToMe(p);
      if (!ride) return;
      say(`motorista ${socket.id} recusou ${ride.id}`);
      clearOffer(ride);
      offerNext(ride);
    });

    on('ride:arrived', (p) => {
      const r = asDriver(p, 'accepted');
      if (r) setStatus(r, 'arrived');
    });
    on('ride:start', (p) => {
      const r = asDriver(p, 'arrived');
      if (r) setStatus(r, 'in_progress');
    });
    on('ride:complete', (p) => {
      const r = asDriver(p, 'in_progress');
      if (!r) return;
      const d = drivers.get(socket.id);
      if (d) {
        d.busy = false;
        d.rideId = null;
      }
      setStatus(r, 'completed');
    });

    on('ride:cancel', (p) => {
      const ride = findRide(
        p,
        (r) =>
          (r.status === 'searching' || ACTIVE.includes(r.status)) &&
          (r.passengerId === socket.id || r.driver?.id === socket.id),
      );
      if (!ride) return;
      const by = ride.passengerId === socket.id ? 'passenger' : 'driver';
      terminate(ride, 'cancelled', { by, reason: str(p.reason, 80) });
    });

    // Avaliação do motorista pelo passageiro (uma vez por viagem concluída)
    withAck('ride:rate', (p) => {
      const ride = findRide(p, (r) => r.passengerId === socket.id && r.status === 'completed');
      const stars = Number(p?.stars);
      if (!ride || !ride.driver) return { ok: false, error: 'Viagem não encontrada.' };
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
        return { ok: false, error: 'Avaliação inválida.' };
      }
      if (rated.has(ride.id)) return { ok: false, error: 'Esta viagem já foi avaliada.' };
      rated.add(ride.id);
      const d = drivers.get(ride.driver.id);
      if (d) {
        d.rating = (d.rating * d.ratingCount + stars) / (d.ratingCount + 1);
        d.ratingCount += 1;
      }
      say(`viagem ${ride.id} avaliada com ${stars}`);
      return { ok: true };
    });

    socket.on('disconnect', () => {
      try {
        removeDriver(socket.id, 'desligou');
        passengers.delete(socket.id);
        const r = activeRideOfPassenger(socket.id);
        if (r) terminate(r, 'cancelled', { by: 'passenger', reason: 'O passageiro perdeu a ligação' });
      } catch (e) {
        say(`erro no disconnect: ${e?.message ?? e}`);
      }
    });
  }

  function sendNearby(id) {
    const p = passengers.get(id);
    if (!p) return;
    const list = [...drivers.values()]
      .filter((d) => !d.busy && !d.offering)
      .map((d) => ({ d, dist: haversine(d.location, p.location) }))
      .filter((x) => x.dist <= NEARBY_M)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 20)
      .map((x) => publicDriver(x.d));
    io.to(id).emit('drivers:nearby', list);
  }

  function broadcastNearby() {
    for (const id of passengers.keys()) {
      try {
        sendNearby(id);
      } catch (e) {
        say(`erro nearby: ${e?.message ?? e}`);
      }
    }
  }

  /** Remove viagens terminadas há mais de 30 min (evita crescer a memória sem fim). */
  function sweep() {
    const t = nowMs();
    for (const [id, at] of ended) {
      if (t - at > ENDED_TTL_MS) {
        ended.delete(id);
        rides.delete(id);
        rated.delete(id);
      }
    }
  }

  function shutdown() {
    for (const m of meta.values()) clearTimeout(m.timer);
    meta.clear();
  }

  return {
    attach,
    broadcastNearby,
    sweep,
    shutdown,
    demand,
    driverCount: () => drivers.size,
    rideCount: () => rides.size,
  };
}
