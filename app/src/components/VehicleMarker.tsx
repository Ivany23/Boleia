import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Marker } from '../map';
import { useSmoothPoint } from '../motion';
import type { Category, LatLng } from '../types';
import { toRN } from '../utils';
import { CarTop } from './Vehicle';

export function VehicleMarker({
  point,
  category,
  heading,
  size = 24,
  zIndex = 5,
}: {
  point: LatLng;
  category: Category;

  heading?: number;
  size?: number;
  zIndex?: number;
}) {
  const external = heading !== undefined;
  const smooth = useSmoothPoint(external ? null : point);
  const s = external ? { point, heading } : smooth;

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
