import React, { useEffect, useState } from 'react';
import { Marker } from '../map';
import type { LatLng } from '../types';
import { toRN } from '../utils';

/** Marker with a custom view; tracks view changes briefly so the bitmap renders, then stops (perf). */
export function ViewMarker({
  point,
  children,
  anchor,
  dep,
}: {
  point: LatLng;
  children: React.ReactElement;
  anchor?: { x: number; y: number };
  dep?: string;
}) {
  const [st, setSt] = useState({ dep, track: true });
  // Quando o conteúdo muda, volta a desenhar o marcador durante um instante
  if (st.dep !== dep) setSt({ dep, track: true });
  const track = st.track;
  useEffect(() => {
    if (!track) return;
    const t = setTimeout(() => setSt((s) => ({ ...s, track: false })), 800);
    return () => clearTimeout(t);
  }, [track, st.dep]);
  return (
    <Marker coordinate={toRN(point)} anchor={anchor ?? { x: 0.5, y: 0.5 }} tracksViewChanges={track}>
      {children}
    </Marker>
  );
}
