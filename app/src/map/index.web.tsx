import L from 'leaflet';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SERVER_URL } from '../api';

type Coord = { latitude: number; longitude: number };
type Region = Coord & { latitudeDelta: number; longitudeDelta: number };
type Padding = { top: number; right: number; bottom: number; left: number };
type MapPressEvent = { nativeEvent: { coordinate: Coord } };

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

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
      }
      return k;
    })
    .catch(() => null)
    .finally(() => clearTimeout(t));
}
function googleKey(): Promise<string | null> {
  if (GOOGLE_KEY) return Promise.resolve(GOOGLE_KEY);
  if (!keyPromise) {
    const cached = cachedKey();
    const fresh = fetchKey();
    keyPromise = cached ? Promise.resolve(cached) : fresh;
  }
  return keyPromise;
}

export function preloadMap() {
  googleKey()
    .then((k) => (k ? loadGoogle(k) : webglOK() ? loadMapLibre() : null))
    .catch(() => {});
}

const ok = (c?: Coord | null): c is Coord =>
  !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude);
const zoomFor = (delta: number) => Math.max(3, Math.min(19, Math.log2(360 / Math.max(delta, 1e-6))));
const deltaFor = (zoom: number) => 360 / Math.pow(2, zoom);

type Engine = {
  kind: 'google' | 'vector' | 'leaflet';
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
    googlePromise = null;
    throw e;
  });
  return googlePromise;
}

const LIGHT_STYLE = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -30 }, { lightness: 15 }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#FFD98A' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#E8B54A' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#A9D3F2' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#EEF3EC' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#CDEBCF' }] },
];

function googleEngine(google: any, el: HTMLDivElement, start: Region, hooks: Hooks, styles?: unknown): Engine {
  const gm = google.maps;
  const map = new gm.Map(el, {
    center: { lat: start.latitude, lng: start.longitude },
    zoom: Math.round(zoomFor(start.latitudeDelta)),
    styles: Array.isArray(styles) ? styles : LIGHT_STYLE,
    backgroundColor: Array.isArray(styles) ? '#1b2420' : undefined,
    disableDefaultUI: true,
    clickableIcons: false,
    gestureHandling: 'greedy',
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

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl';
const MAPLIBRE_SRI = {
  js: 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj',
  css: 'sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V',
};
let mlPromise: Promise<any> | null = null;

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function loadMapLibre(): Promise<any> {
  const w = window as any;
  if (w.maplibregl?.Map) return Promise.resolve(w.maplibregl);
  if (mlPromise) return mlPromise;
  mlPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('maplibre-css')) {
      const pre = document.createElement('link');
      pre.rel = 'preconnect';
      pre.href = 'https://tiles.openfreemap.org';
      pre.crossOrigin = '';
      document.head.appendChild(pre);
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = MAPLIBRE + '.css';
      link.integrity = MAPLIBRE_SRI.css;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
    const timer = setTimeout(() => reject(new Error('o mapa demorou demasiado')), 12000);
    const sc = document.createElement('script');
    sc.src = MAPLIBRE + '.js';
    sc.async = true;
    sc.integrity = MAPLIBRE_SRI.js;
    sc.crossOrigin = 'anonymous';
    sc.onload = () => {
      clearTimeout(timer);
      if (w.maplibregl?.Map) resolve(w.maplibregl);
      else reject(new Error('MapLibre indisponível'));
    };
    sc.onerror = () => {
      clearTimeout(timer);
      reject(new Error('o MapLibre não carregou'));
    };
    document.head.appendChild(sc);
  }).catch((e) => {
    mlPromise = null;
    throw e;
  });
  return mlPromise;
}

const ZOFF = 1;
let lineSeq = 0;

function vectorEngine(ml: any, el: HTMLDivElement, start: Region, hooks: Hooks, dark: boolean): Engine {
  el.style.background = dark ? '#1b2420' : '#EEF2EF';
  const map = new ml.Map({
    container: el,
    style: `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'liberty'}`,
    center: [start.longitude, start.latitude],
    zoom: zoomFor(start.latitudeDelta) - ZOFF,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    keyboard: false,
    fadeDuration: 200,
    maxZoom: 19,
  });
  map.touchZoomRotate?.disableRotation?.();

  map.on('styleimagemissing', (e: any) => {
    try {
      if (e?.id && !map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    } catch {
    }
  });
  let loaded = false;
  const waiting: (() => void)[] = [];
  const whenReady = (fn: () => void) => (loaded ? fn() : waiting.push(fn));
  map.once('load', () => {
    loaded = true;
    waiting.splice(0).forEach((fn) => {
      try {
        fn();
      } catch {
      }
    });
  });
  map.on('move', () => hooks.changed());
  map.on('dragstart', () => hooks.drag());
  map.on('moveend', () => hooks.idle());
  map.on('click', (e: any) => e?.lngLat && hooks.press({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }));
  const resize = new ResizeObserver(() => map.resize());
  resize.observe(el);
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  return {
    kind: 'vector',
    project(c) {
      const p = map.project([c.longitude, c.latitude]);
      return p ? { x: p.x, y: p.y } : null;
    },
    center() {
      const c = map.getCenter();
      return { latitude: c.lat, longitude: c.lng };
    },
    zoom: () => map.getZoom() + ZOFF,
    heightPx: () => el.clientHeight,
    flyTo(c, zoom, durationMs) {
      map.easeTo({ center: [c.longitude, c.latitude], zoom: zoom - ZOFF, duration: Math.max(0, durationMs), easing: ease });
    },
    fit(coords, pad, animate) {
      let w = 180;
      let e = -180;
      let so = 90;
      let n = -90;
      for (const c of coords) {
        w = Math.min(w, c.longitude);
        e = Math.max(e, c.longitude);
        so = Math.min(so, c.latitude);
        n = Math.max(n, c.latitude);
      }

      const W = el.clientWidth || 360;
      const H = el.clientHeight || 640;
      const padding = {
        top: Math.min(pad.top, H * 0.35),
        bottom: Math.min(pad.bottom, H * 0.6),
        left: Math.min(pad.left, W * 0.2),
        right: Math.min(pad.right, W * 0.2),
      };
      map.fitBounds(
        [
          [w, so],
          [e, n],
        ],
        { padding, maxZoom: 17 - ZOFF, duration: animate ? 700 : 0, easing: ease },
      );
    },
    polyline(color, width) {
      const id = `boleia-line-${++lineSeq}`;
      let coords: Coord[] = [];
      let added = false;
      let removed = false;
      const data = () => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords.map((c) => [c.longitude, c.latitude]) },
      });
      whenReady(() => {
        if (removed || added) return;
        map.addSource(id, { type: 'geojson', data: data() });
        map.addLayer({
          id,
          type: 'line',
          source: id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': color, 'line-width': width },
        });
        added = true;
      });
      return {
        set(cs) {
          coords = cs;
          if (added) map.getSource(id)?.setData(data());
        },
        remove() {
          removed = true;
          if (!added) return;
          try {
            if (map.getLayer(id)) map.removeLayer(id);
            if (map.getSource(id)) map.removeSource(id);
          } catch {
          }
        },
      };
    },
    destroy() {
      resize.disconnect();
      map.remove();
      el.innerHTML = '';
    },
  };
}

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

    zoomSnap: 1,
    zoomDelta: 1,
    wheelPxPerZoomLevel: 90,
    fadeAnimation: true,
    zoomAnimation: true,
    markerZoomAnimation: true,
    inertia: true,
    center: toLL(start),
    zoom: Math.round(zoomFor(start.latitudeDelta)),
  });
  el.style.background = dark ? '#1b2420' : '#EEF2EF';
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    keepBuffer: 4,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  if (dark) {
    const pane = map.getPanes().tilePane;
    if (pane) pane.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)';
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
      map.flyTo(toLL(c), Math.round(zoom), { duration: Math.max(0.25, durationMs / 1000), easeLinearity: 0.2 });
    },
    fit(coords, pad, animate) {
      map.flyToBounds(L.latLngBounds(coords.map(toLL)), {
        paddingTopLeft: [pad.left, pad.top],
        paddingBottomRight: [pad.right, pad.bottom],
        animate,
        duration: animate ? 0.6 : 0,
        maxZoom: 17,
      });
    },
    polyline(color, width) {
      const line = L.polyline([], { color, weight: width, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      return { set: (cs) => line.setLatLngs(cs.map(toLL)), remove: () => line.remove() };
    },
    destroy() {
      resize.disconnect();
      map.remove();
      el.innerHTML = '';
    },
  };
}

const MapCtx = createContext<{ engine: Engine | null; version: number }>({ engine: null, version: 0 });

type MapProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  showsUserLocation?: boolean;
  onPanDrag?: () => void;
  onPress?: (e: MapPressEvent) => void;
  onRegionChangeComplete?: (r: Region) => void;
  children?: React.ReactNode;

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
  private onAuthFail = () => {
    this.switchToFallback();
  };

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

  private dark() {
    return Array.isArray(this.props.customMapStyle);
  }

  private startRegion(): Region {
    const r = this.props.initialRegion;
    return ok(r) ? r : { latitude: -25.9692, longitude: 32.5732, latitudeDelta: 0.03, longitudeDelta: 0.03 };
  }

  private current: Engine | null = null;
  private fallingBack = false;

  private use(engine: Engine) {
    if (!this.alive) {
      engine.destroy();
      return;
    }
    this.current = engine;
    this.setState({ engine }, () => {
      const p = this.pending;
      this.pending = null;
      if (p) this.apply(p);
      this.hooks.idle();
    });
  }

  private async startFallback(region: Region) {
    if (webglOK()) {
      try {
        const ml = await loadMapLibre();
        if (!this.alive || !this.el) return;
        this.use(vectorEngine(ml, this.el, region, this.hooks, this.dark()));
        return;
      } catch (e) {
        console.warn('[mapa] mapa vectorial indisponível, a usar OpenStreetMap:', (e as Error)?.message);
      }
    }
    if (this.alive && this.el) this.use(leafletEngine(this.el, region, this.hooks, this.dark()));
  }

  private switchToFallback() {
    const cur = this.current;
    if (!this.el || !this.alive || this.fallingBack || cur?.kind !== 'google') return;
    this.fallingBack = true;
    const region = { ...cur.center(), latitudeDelta: deltaFor(cur.zoom()), longitudeDelta: deltaFor(cur.zoom()) };
    cur.destroy();
    this.current = null;
    this.setState({ engine: null });
    this.startFallback(region);
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
        if (googleAuthFailed) this.switchToFallback();
        return;
      } catch (e) {
        console.warn('[mapa] Google Maps indisponível, a usar o mapa OpenFreeMap:', (e as Error)?.message);
      }
    }
    if (this.alive && this.el) await this.startFallback(this.startRegion());
  }

  componentWillUnmount() {
    this.alive = false;
    authListeners.delete(this.onAuthFail);
    if (this.geoWatch !== null) navigator.geolocation.clearWatch(this.geoWatch);
    this.current?.destroy();
    this.current = null;
  }

  private apply(p: PendingView) {
    const e = this.state.engine;
    if (!e) {
      this.pending = p;
      return;
    }
    if (p.kind === 'region') e.flyTo(p.region, zoomFor(p.region.latitudeDelta), p.duration);
    else if (p.kind === 'camera') e.flyTo(p.center, p.zoom ?? e.zoom(), p.duration);
    else {
      const bottom = Math.min(p.pad.bottom, Math.max(40, e.heightPx() * 0.6));
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

  flat?: boolean;
  tracksViewChanges?: boolean;
  /** ignorado na web (o marcador deixa passar o toque para o mapa) */
  onPress?: () => void;
};

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
