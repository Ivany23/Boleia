/**
 * Mapa para a versão web (Vercel), com a mesma interface que usamos do
 * react-native-maps: <MapView>, <Marker>, <Polyline> e os métodos
 * animateToRegion, fitToCoordinates e animateCamera.
 * Usa Leaflet com mapas CARTO/OpenStreetMap (sem chave nem custos).
 */
import L from 'leaflet';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

type Coord = { latitude: number; longitude: number };
type Region = Coord & { latitudeDelta: number; longitudeDelta: number };
type Padding = { top: number; right: number; bottom: number; left: number };

/** Estilos do Leaflet (mesma versão do pacote), carregados uma vez. */
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

const MapCtx = createContext<{ map: L.Map | null; version: number }>({ map: null, version: 0 });

const ok = (c?: Coord | null): c is Coord =>
  !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude);
const toLL = (c: Coord) => L.latLng(c.latitude, c.longitude);
const zoomFor = (delta: number) => Math.max(3, Math.min(19, Math.log2(360 / Math.max(delta, 1e-6))));

type MapProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  showsUserLocation?: boolean;
  onPanDrag?: () => void;
  children?: React.ReactNode;
  // Aceites por compatibilidade (só têm efeito no telemóvel)
  customMapStyle?: unknown;
  showsMyLocationButton?: boolean;
  showsBuildings?: boolean;
  pitchEnabled?: boolean;
  toolbarEnabled?: boolean;
  showsCompass?: boolean;
};

type MapState = { map: L.Map | null; version: number };

export default class MapView extends React.Component<MapProps, MapState> {
  state: MapState = { map: null, version: 0 };
  private el: HTMLDivElement | null = null;
  private resize: ResizeObserver | null = null;
  private geoWatch: number | null = null;
  private me: L.CircleMarker | null = null;

  componentDidMount() {
    ensureLeafletCss();
    if (!this.el) return;
    const r = this.props.initialRegion;
    const map = L.map(this.el, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.25,
      center: ok(r) ? toLL(r) : L.latLng(-25.9692, 32.5732),
      zoom: ok(r) ? zoomFor(r.latitudeDelta) : 14,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const bump = () => this.setState((s) => ({ version: s.version + 1 }));
    map.on('move zoom resize', bump);
    map.on('dragstart', () => this.props.onPanDrag?.());
    this.resize = new ResizeObserver(() => map.invalidateSize());
    this.resize.observe(this.el);

    if (this.props.showsUserLocation && typeof navigator !== 'undefined' && navigator.geolocation) {
      this.geoWatch = navigator.geolocation.watchPosition(
        (p) => {
          const ll = L.latLng(p.coords.latitude, p.coords.longitude);
          if (!this.me) {
            this.me = L.circleMarker(ll, {
              radius: 8,
              color: '#ffffff',
              weight: 3,
              fillColor: '#2F7CF6',
              fillOpacity: 1,
            }).addTo(map);
          } else this.me.setLatLng(ll);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000 },
      );
    }
    this.setState({ map });
  }

  componentWillUnmount() {
    this.resize?.disconnect();
    if (this.geoWatch !== null) navigator.geolocation.clearWatch(this.geoWatch);
    this.state.map?.remove();
  }

  animateToRegion(region: Region, duration = 500) {
    const m = this.state.map;
    if (!m || !ok(region)) return;
    m.flyTo(toLL(region), zoomFor(region.latitudeDelta), { duration: duration / 1000 });
  }

  fitToCoordinates(coords: Coord[], opts?: { edgePadding?: Padding; animated?: boolean }) {
    const m = this.state.map;
    const pts = (coords ?? []).filter(ok);
    if (!m || pts.length === 0) return;
    const p = opts?.edgePadding ?? { top: 40, right: 40, bottom: 40, left: 40 };
    // Num ecrã baixo, limita a margem para o percurso nunca ficar sem espaço
    const h = m.getSize().y;
    const bottom = Math.min(p.bottom, Math.max(40, h * 0.55));
    m.fitBounds(L.latLngBounds(pts.map(toLL)), {
      paddingTopLeft: [p.left, p.top],
      paddingBottomRight: [p.right, bottom],
      animate: opts?.animated !== false,
      maxZoom: 17,
    });
  }

  animateCamera(camera: { center?: Coord; zoom?: number; pitch?: number; heading?: number }, opts?: { duration?: number }) {
    const m = this.state.map;
    if (!m) return;
    // Na web não há inclinação 3D: segue o centro e o zoom
    if (ok(camera.center)) {
      m.flyTo(toLL(camera.center), camera.zoom ?? m.getZoom(), { duration: (opts?.duration ?? 500) / 1000 });
    }
  }

  render() {
    const { map, version } = this.state;
    return (
      <View style={[this.props.style, { overflow: 'hidden' }]}>
        <div
          ref={(el) => {
            this.el = el;
          }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 }}
        />
        {map ? <MapCtx.Provider value={{ map, version }}>{this.props.children}</MapCtx.Provider> : null}
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
  const { map } = useContext(MapCtx);
  const [size, setSize] = useState({ w: 0, h: 0 });
  if (!map || !ok(coordinate)) return null;
  const p = map.latLngToContainerPoint(toLL(coordinate));
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
  const { map } = useContext(MapCtx);
  const line = useRef<L.Polyline | null>(null);
  useEffect(() => {
    if (!map) return;
    const l = L.polyline([], { color: strokeColor, weight: strokeWidth, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    line.current = l;
    return () => {
      l.remove();
      line.current = null;
    };
  }, [map, strokeColor, strokeWidth]);
  useEffect(() => {
    line.current?.setLatLngs((coordinates ?? []).filter(ok).map(toLL));
  }, [coordinates, map, strokeColor, strokeWidth]);
  return null;
}
