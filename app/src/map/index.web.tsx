/**
 * Mapa para a versão web (Vercel), com a mesma interface que usamos do
 * react-native-maps: <MapView>, <Marker>, <Polyline>, os métodos
 * animateToRegion / fitToCoordinates / animateCamera e os eventos
 * onPress, onPanDrag e onRegionChangeComplete.
 *
 * Motor:
 *  - Google Maps (igual ao telemóvel) se houver chave do site: EXPO_PUBLIC_GOOGLE_MAPS_KEY
 *    (Vercel) ou GOOGLE_MAPS_WEB_KEY no servidor (Render, lida em /api/config);
 *  - OpenStreetMap (Leaflet) como reserva automática: sem chave, se o Google
 *    não carregar em 10 s ou se recusar a chave.
 */
import L from 'leaflet';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SERVER_URL } from '../api';

type Coord = { latitude: number; longitude: number };
type Region = Coord & { latitudeDelta: number; longitudeDelta: number };
type Padding = { top: number; right: number; bottom: number; left: number };
type MapPressEvent = { nativeEvent: { coordinate: Coord } };

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

/**
 * Chave do Google Maps do site: da Vercel (EXPO_PUBLIC_GOOGLE_MAPS_KEY) ou, se não
 * existir, do servidor (GOOGLE_MAPS_WEB_KEY no Render, via /api/config).
 */
let keyPromise: Promise<string | null> | null = null;
const KEY_CACHE = 'boleia.mapsKey.v1';
const cachedKey = () => {
  try {
    return localStorage.getItem(KEY_CACHE);
  } catch {
    return null;
  }
};
function fetchKey(): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  return fetch(`${SERVER_URL}/api/config`, { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const k = j && typeof j.googleMapsWebKey === 'string' && j.googleMapsWebKey ? j.googleMapsWebKey : null;
      try {
        if (k) localStorage.setItem(KEY_CACHE, k);
        else if (j) localStorage.removeItem(KEY_CACHE);
      } catch {
        // ignora
      }
      return k;
    })
    .catch(() => null)
    .finally(() => clearTimeout(t));
}
function googleKey(): Promise<string | null> {
  if (GOOGLE_KEY) return Promise.resolve(GOOGLE_KEY);
  if (!keyPromise) {
    // Velocidade: usa logo a chave guardada da visita anterior e actualiza em segundo plano
    const cached = cachedKey();
    const fresh = fetchKey();
    keyPromise = cached ? Promise.resolve(cached) : fresh;
  }
  return keyPromise;
}

/** Começa a carregar o Google Maps cedo (ex.: enquanto a pessoa se regista). */
export function preloadMap() {
  googleKey()
    .then((k) => (k ? loadGoogle(k) : null))
    .catch(() => {});
}

const ok = (c?: Coord | null): c is Coord =>
  !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude);
const zoomFor = (delta: number) => Math.max(3, Math.min(19, Math.log2(360 / Math.max(delta, 1e-6))));
const deltaFor = (zoom: number) => 360 / Math.pow(2, zoom);

/** O que cada motor (Google / Leaflet) tem de saber fazer. */
type Engine = {
  kind: 'google' | 'leaflet';
  project(c: Coord): { x: number; y: number } | null;
  center(): Coord;
  zoom(): number;
  heightPx(): number;
  flyTo(c: Coord, zoom: number, durationMs: number): void;
  fit(coords: Coord[], pad: Padding, animate: boolean): void;
  polyline(color: string, width: number): { set(coords: Coord[]): void; remove(): void };
  destroy(): void;
};
type Hooks = { changed(): void; drag(): void; idle(): void; press(c: Coord): void };

// ---------------------------------------------------------------------------
// Google Maps
// ---------------------------------------------------------------------------

let googlePromise: Promise<any> | null = null;
let googleAuthFailed = false;
const authListeners = new Set<() => void>();

function loadGoogle(key: string): Promise<any> {
  const w = window as any;
  if (googleAuthFailed) return Promise.reject(new Error('chave recusada'));
  if (w.google?.maps?.Map) return Promise.resolve(w.google);
  if (googlePromise) return googlePromise;
  googlePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('o Google Maps demorou demasiado')), 10000);
    w.gm_authFailure = () => {
      googleAuthFailed = true;
      authListeners.forEach((f) => f());
    };
    w.__boleiaMapsReady = async () => {
      try {
        if (w.google?.maps?.importLibrary) await w.google.maps.importLibrary('maps');
        clearTimeout(timer);
        resolve(w.google);
      } catch (e) {
        reject(e);
      }
    };
    const s = document.createElement('script');
    s.src =
      'https://maps.googleapis.com/maps/api/js?key=' +
      encodeURIComponent(key) +
      '&v=weekly&language=pt&region=MZ&loading=async&callback=__boleiaMapsReady';
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error('o Google Maps não carregou'));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    googlePromise = null; // permite tentar de novo mais tarde
    throw e;
  });
  return googlePromise;
}

function googleEngine(google: any, el: HTMLDivElement, start: Region, hooks: Hooks, styles?: unknown): Engine {
  const gm = google.maps;
  const map = new gm.Map(el, {
    center: { lat: start.latitude, lng: start.longitude },
    zoom: Math.round(zoomFor(start.latitudeDelta)),
    styles: Array.isArray(styles) ? styles : undefined, // modo nocturno
    backgroundColor: Array.isArray(styles) ? '#1b2420' : undefined,
    disableDefaultUI: true,
    clickableIcons: false,
    gestureHandling: 'greedy', // um dedo arrasta o mapa (sem "use dois dedos")
    keyboardShortcuts: false,
  });
  const overlay = new gm.OverlayView();
  overlay.onAdd = () => {};
  overlay.onRemove = () => {};
  overlay.draw = () => hooks.changed();
  overlay.setMap(map);
  const ls = [
    map.addListener('bounds_changed', () => hooks.changed()),
    map.addListener('dragstart', () => hooks.drag()),
    map.addListener('idle', () => hooks.idle()),
    map.addListener('click', (e: any) => e?.latLng && hooks.press({ latitude: e.latLng.lat(), longitude: e.latLng.lng() })),
  ];
  return {
    kind: 'google',
    project(c) {
      const proj = overlay.getProjection();
      if (!proj) return null;
      const p = proj.fromLatLngToContainerPixel(new gm.LatLng(c.latitude, c.longitude));
      return p ? { x: p.x, y: p.y } : null;
    },
    center() {
      const c = map.getCenter();
      return { latitude: c.lat(), longitude: c.lng() };
    },
    zoom: () => map.getZoom() ?? 14,
    heightPx: () => el.clientHeight,
    flyTo(c, zoom) {
      const z = Math.round(zoom);
      if (map.getZoom() !== z) map.setZoom(z);
      map.panTo({ lat: c.latitude, lng: c.longitude });
    },
    fit(coords, pad) {
      const b = new gm.LatLngBounds();
      coords.forEach((c) => b.extend({ lat: c.latitude, lng: c.longitude }));
      map.fitBounds(b, pad);
    },
    polyline(color, width) {
      const line = new gm.Polyline({ map, strokeColor: color, strokeWeight: width, strokeOpacity: 1, clickable: false });
      return {
        set: (cs) => line.setPath(cs.map((c) => ({ lat: c.latitude, lng: c.longitude }))),
        remove: () => line.setMap(null),
      };
    },
    destroy() {
      ls.forEach((l) => l.remove());
      overlay.setMap(null);
      el.innerHTML = '';
    },
  };
}

// ---------------------------------------------------------------------------
// OpenStreetMap (Leaflet)
// ---------------------------------------------------------------------------

function ensureLeafletCss() {
  if (typeof document === 'undefined' || document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  link.crossOrigin = '';
  document.head.appendChild(link);
}

function leafletEngine(el: HTMLDivElement, start: Region, hooks: Hooks, dark = false): Engine {
  ensureLeafletCss();
  const toLL = (c: Coord) => L.latLng(c.latitude, c.longitude);
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
    zoomSnap: 0.25,
    center: toLL(start),
    zoom: zoomFor(start.latitudeDelta),
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  // modo nocturno no OpenStreetMap: inverte as cores das imagens do mapa
  if (dark) {
    const pane = map.getPanes().tilePane;
    if (pane) pane.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)';
    el.style.background = '#1b2420';
  }
  map.on('move zoom resize', () => hooks.changed());
  map.on('dragstart', () => hooks.drag());
  map.on('moveend', () => hooks.idle());
  map.on('click', (e: L.LeafletMouseEvent) => hooks.press({ latitude: e.latlng.lat, longitude: e.latlng.lng }));
  const resize = new ResizeObserver(() => map.invalidateSize());
  resize.observe(el);
  return {
    kind: 'leaflet',
    project(c) {
      const p = map.latLngToContainerPoint(toLL(c));
      return { x: p.x, y: p.y };
    },
    center() {
      const c = map.getCenter();
      return { latitude: c.lat, longitude: c.lng };
    },
    zoom: () => map.getZoom(),
    heightPx: () => map.getSize().y,
    flyTo(c, zoom, durationMs) {
      map.flyTo(toLL(c), zoom, { duration: durationMs / 1000 });
    },
    fit(coords, pad, animate) {
      map.fitBounds(L.latLngBounds(coords.map(toLL)), {
        paddingTopLeft: [pad.left, pad.top],
        paddingBottomRight: [pad.right, pad.bottom],
        animate,
        maxZoom: 17,
      });
    },
    polyline(color, width) {
      const line = L.polyline([], { color, weight: width, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      return { set: (cs) => line.setLatLngs(cs.map(toLL)), remove: () => line.remove() };
    },
    destroy() {
      resize.disconnect();
      map.remove();
      el.innerHTML = '';
    },
  };
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

const MapCtx = createContext<{ engine: Engine | null; version: number }>({ engine: null, version: 0 });

type MapProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  showsUserLocation?: boolean;
  onPanDrag?: () => void;
  onPress?: (e: MapPressEvent) => void;
  onRegionChangeComplete?: (r: Region) => void;
  children?: React.ReactNode;
  // Aceites por compatibilidade (só têm efeito no telemóvel)
  customMapStyle?: unknown;
  showsMyLocationButton?: boolean;
  showsBuildings?: boolean;
  pitchEnabled?: boolean;
  toolbarEnabled?: boolean;
  showsCompass?: boolean;
};

type MapState = { engine: Engine | null; version: number; me: Coord | null };
type PendingView =
  | { kind: 'region'; region: Region; duration: number }
  | { kind: 'fit'; coords: Coord[]; pad: Padding; animate: boolean }
  | { kind: 'camera'; center: Coord; zoom?: number; duration: number };

export default class MapView extends React.Component<MapProps, MapState> {
  state: MapState = { engine: null, version: 0, me: null };
  private el: HTMLDivElement | null = null;
  private alive = true;
  private geoWatch: number | null = null;
  private pending: PendingView | null = null;
  private onAuthFail = () => this.switchToLeaflet();

  private hooks: Hooks = {
    changed: () => this.alive && this.setState((s) => ({ version: s.version + 1 })),
    drag: () => this.props.onPanDrag?.(),
    idle: () => {
      const e = this.state.engine;
      if (!e) return;
      const c = e.center();
      const d = deltaFor(e.zoom());
      this.props.onRegionChangeComplete?.({ ...c, latitudeDelta: d, longitudeDelta: d });
    },
    press: (c) => this.props.onPress?.({ nativeEvent: { coordinate: c } }),
  };

  /** Modo nocturno: o ecrã passa um estilo de mapa (customMapStyle). */
  private dark() {
    return Array.isArray(this.props.customMapStyle);
  }

  private startRegion(): Region {
    const r = this.props.initialRegion;
    return ok(r) ? r : { latitude: -25.9692, longitude: 32.5732, latitudeDelta: 0.03, longitudeDelta: 0.03 };
  }

  private use(engine: Engine) {
    if (!this.alive) {
      engine.destroy();
      return;
    }
    this.setState({ engine }, () => {
      const p = this.pending;
      this.pending = null;
      if (p) this.apply(p);
      this.hooks.idle();
    });
  }

  private switchToLeaflet() {
    if (!this.el || !this.alive || this.state.engine?.kind === 'leaflet') return;
    const cur = this.state.engine;
    const region = cur
      ? { ...cur.center(), latitudeDelta: deltaFor(cur.zoom()), longitudeDelta: deltaFor(cur.zoom()) }
      : this.startRegion();
    cur?.destroy();
    this.use(leafletEngine(this.el, region, this.hooks, this.dark()));
  }

  async componentDidMount() {
    if (!this.el) return;
    if (this.props.showsUserLocation && typeof navigator !== 'undefined' && navigator.geolocation) {
      this.geoWatch = navigator.geolocation.watchPosition(
        (p) => this.alive && this.setState({ me: { latitude: p.coords.latitude, longitude: p.coords.longitude } }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000 },
      );
    }
    const key = await googleKey();
    if (!this.alive) return;
    if (key) {
      try {
        const g = await loadGoogle(key);
        if (!this.alive || !this.el) return;
        authListeners.add(this.onAuthFail);
        this.use(googleEngine(g, this.el, this.startRegion(), this.hooks, this.props.customMapStyle));
        return;
      } catch (e) {
        console.warn('[mapa] Google Maps indisponível, a usar OpenStreetMap:', (e as Error)?.message);
      }
    }
    if (this.alive && this.el) this.use(leafletEngine(this.el, this.startRegion(), this.hooks, this.dark()));
  }

  componentWillUnmount() {
    this.alive = false;
    authListeners.delete(this.onAuthFail);
    if (this.geoWatch !== null) navigator.geolocation.clearWatch(this.geoWatch);
    this.state.engine?.destroy();
  }

  private apply(p: PendingView) {
    const e = this.state.engine;
    if (!e) {
      this.pending = p; // o mapa ainda está a carregar: aplica quando estiver pronto
      return;
    }
    if (p.kind === 'region') e.flyTo(p.region, zoomFor(p.region.latitudeDelta), p.duration);
    else if (p.kind === 'camera') e.flyTo(p.center, p.zoom ?? e.zoom(), p.duration);
    else {
      // Num ecrã baixo, limita a margem para o percurso nunca ficar sem espaço
      const bottom = Math.min(p.pad.bottom, Math.max(40, e.heightPx() * 0.55));
      e.fit(p.coords, { ...p.pad, bottom }, p.animate);
    }
  }

  animateToRegion(region: Region, duration = 500) {
    if (ok(region)) this.apply({ kind: 'region', region, duration });
  }

  fitToCoordinates(coords: Coord[], opts?: { edgePadding?: Padding; animated?: boolean }) {
    const pts = (coords ?? []).filter(ok);
    if (!pts.length) return;
    this.apply({
      kind: 'fit',
      coords: pts,
      pad: opts?.edgePadding ?? { top: 40, right: 40, bottom: 40, left: 40 },
      animate: opts?.animated !== false,
    });
  }

  animateCamera(camera: { center?: Coord; zoom?: number; pitch?: number; heading?: number }, opts?: { duration?: number }) {
    // Na web não há inclinação 3D: segue o centro e o zoom
    if (ok(camera.center)) this.apply({ kind: 'camera', center: camera.center, zoom: camera.zoom, duration: opts?.duration ?? 500 });
  }

  render() {
    const { engine, version, me } = this.state;
    return (
      <View style={[this.props.style, { overflow: 'hidden' }]}>
        <div
          ref={(el) => {
            this.el = el;
          }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 }}
        />
        {engine ? (
          <MapCtx.Provider value={{ engine, version }}>
            {this.props.children}
            {me ? (
              <Marker coordinate={me} zIndex={1}>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: '#2F7CF6',
                    borderWidth: 3,
                    borderColor: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                  }}
                />
              </Marker>
            ) : null}
          </MapCtx.Provider>
        ) : null}
      </View>
    );
  }
}

type MarkerProps = {
  coordinate: Coord;
  anchor?: { x: number; y: number };
  rotation?: number;
  zIndex?: number;
  children?: React.ReactNode;
  // Aceites por compatibilidade
  flat?: boolean;
  tracksViewChanges?: boolean;
};

/** Marcador: uma View posicionada por cima do mapa, na coordenada certa. */
export function Marker({ coordinate, anchor, rotation = 0, zIndex = 0, children }: MarkerProps) {
  const { engine } = useContext(MapCtx);
  const [size, setSize] = useState({ w: 0, h: 0 });
  if (!engine || !ok(coordinate)) return null;
  const p = engine.project(coordinate);
  if (!p) return null;
  const a = anchor ?? { x: 0.5, y: 0.5 };
  return (
    <View
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
      style={{
        position: 'absolute',
        left: p.x - size.w * a.x,
        top: p.y - size.h * a.y,
        zIndex: 10 + zIndex,
        opacity: size.w ? 1 : 0,
        transform: [{ rotate: `${rotation}deg` }],
      }}
    >
      {children}
    </View>
  );
}

/** Linha do percurso. */
export function Polyline({
  coordinates,
  strokeWidth = 4,
  strokeColor = '#0A7A4B',
}: {
  coordinates: Coord[];
  strokeWidth?: number;
  strokeColor?: string;
}) {
  const { engine } = useContext(MapCtx);
  const line = useRef<{ set(c: Coord[]): void; remove(): void } | null>(null);
  useEffect(() => {
    if (!engine) return;
    const l = engine.polyline(strokeColor, strokeWidth);
    line.current = l;
    return () => {
      l.remove();
      line.current = null;
    };
  }, [engine, strokeColor, strokeWidth]);
  useEffect(() => {
    line.current?.set((coordinates ?? []).filter(ok));
  }, [coordinates, engine, strokeColor, strokeWidth]);
  return null;
}
