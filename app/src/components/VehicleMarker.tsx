import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useSmoothPoint } from '../motion';
import type { Category, LatLng } from '../types';
import { toRN } from '../utils';
import { CarTop } from './Vehicle';

/**
 * Veículo no mapa: desliza entre posições e roda na direcção do movimento.
 * `flat` faz o carro "deitar" no mapa e acompanhar a rotação/inclinação 3D.
 */
export function VehicleMarker({
  point,
  category,
  heading,
  size = 24,
  zIndex = 5,
}: {
  point: LatLng;
  category: Category;
  /** Se dado, a posição/rumo já vêm suavizados de fora (não volta a animar). */
  heading?: number;
  size?: number;
  zIndex?: number;
}) {
  const external = heading !== undefined;
  const smooth = useSmoothPoint(external ? null : point);
  const s = external ? { point, heading } : smooth;
  // Desenha o bitmap do marcador só no início (desempenho no Android)
  const [track, setTrack] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTrack(false), 1200);
    return () => clearTimeout(t);
  }, []);
  if (!s) return null;
  return (
    <Marker
      coordinate={toRN(s.point)}
      anchor={{ x: 0.5, y: 0.5 }}
      rotation={s.heading}
      flat
      tracksViewChanges={track}
      zIndex={zIndex}
    >
      <View style={{ padding: 2 }}>
        <CarTop category={category} width={size} />
      </View>
    </Marker>
  );
}
