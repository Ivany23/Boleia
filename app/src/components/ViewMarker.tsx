import React, { useEffect, useState } from 'react';
import { Marker } from '../map';
import type { LatLng } from '../types';
import { toRN } from '../utils';

export function ViewMarker({
  point,
  children,
  anchor,
  dep,
  onPress,
}: {
  point: LatLng;
  children: React.ReactElement;
  anchor?: { x: number; y: number };
  dep?: string;
  /** só no telemóvel: na web o toque passa para o mapa */
  onPress?: () => void;
}) {
  const [st, setSt] = useState({ dep, track: true });

  if (st.dep !== dep) setSt({ dep, track: true });
  const track = st.track;
  useEffect(() => {
    if (!track) return;
    const t = setTimeout(() => setSt((s) => ({ ...s, track: false })), 800);
    return () => clearTimeout(t);
  }, [track, st.dep]);
  return (
    <Marker coordinate={toRN(point)} anchor={anchor ?? { x: 0.5, y: 0.5 }} tracksViewChanges={track} onPress={onPress}>
      {children}
    </Marker>
  );
}
