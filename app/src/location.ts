import * as Location from 'expo-location';
import type { LatLng } from './types';
import { MAPUTO } from './utils';

export async function getPermission(): Promise<'granted' | 'denied'> {
  try {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.granted) return 'granted';
    const r = await Location.requestForegroundPermissionsAsync();
    return r.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Current position, falling back to last known, then Maputo centre. */
export async function currentPosition(): Promise<{ pos: LatLng; fromGps: boolean }> {
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { pos: { lat: p.coords.latitude, lng: p.coords.longitude }, fromGps: true };
  } catch {
    try {
      const p = await Location.getLastKnownPositionAsync();
      if (p) return { pos: { lat: p.coords.latitude, lng: p.coords.longitude }, fromGps: true };
    } catch {
      // ignore
    }
    return { pos: MAPUTO, fromGps: false };
  }
}

export async function addressOf(p: LatLng): Promise<string> {
  try {
    const r = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
    const a = r?.[0];
    if (a) {
      const street = [a.street ?? a.name, a.streetNumber].filter(Boolean).join(' ');
      const parts = [street, a.district ?? a.subregion, a.city].filter(
        (x, i, arr) => !!x && arr.indexOf(x) === i,
      );
      if (parts.length) return parts.join(', ');
    }
  } catch {
    // ignore
  }
  return 'A minha localização';
}
