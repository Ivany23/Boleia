import { useEffect, useRef, useState } from 'react';
import type { LatLng } from './types';
import { haversine } from './utils';

/** Rumo (0 = norte, 90 = este) de a para b, em graus. */
export function bearing(a: LatLng, b: LatLng) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Diferença angular mais curta (-180..180). */
const turn = (from: number, to: number) => ((to - from + 540) % 360) - 180;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

const MIN_MOVE_M = 3; // abaixo disto é ruído do GPS: não roda o carro
const SNAP_M = 3000; // saltos enormes (ex.: GPS recuperado): sem animação

/**
 * Posição suavizada de um veículo: desliza da posição anterior para a nova
 * e roda na direcção do movimento. Devolve { point, heading }.
 */
export function useSmoothPoint(target: LatLng | null, durationMs = 1000) {
  const [shown, setShown] = useState<{ point: LatLng; heading: number } | null>(null);
  const cur = useRef<{ point: LatLng; heading: number } | null>(null);

  useEffect(() => {
    if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return;
    const start = cur.current;
    const goal: LatLng = { lat: target.lat, lng: target.lng };
    const dist = start ? haversine(start.point, goal) : 0;
    const fromHeading = start?.heading ?? 0;
    const toHeading = start && dist >= MIN_MOVE_M ? bearing(start.point, goal) : fromHeading;
    let raf = 0;

    if (!start || dist > SNAP_M || dist < 0.5) {
      // primeira posição, salto enorme ou parado: mostra logo
      raf = requestAnimationFrame(() => {
        cur.current = { point: goal, heading: toHeading };
        setShown(cur.current);
      });
      return () => cancelAnimationFrame(raf);
    }

    const t0 = Date.now();
    const dh = turn(fromHeading, toHeading);
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / durationMs);
      const k = ease(t);
      const next = {
        point: {
          lat: start.point.lat + (goal.lat - start.point.lat) * k,
          lng: start.point.lng + (goal.lng - start.point.lng) * k,
        },
        // roda mais depressa do que anda (fica natural)
        heading: (fromHeading + dh * Math.min(1, k * 1.8) + 360) % 360,
      };
      cur.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target?.lat, target?.lng, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return null;
  return shown ?? { point: target, heading: 0 };
}
