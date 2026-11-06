import * as Location from 'expo-location';
import { reverseGeocode } from './api';
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

export async function currentPosition(): Promise<{ pos: LatLng; fromGps: boolean }> {
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { pos: { lat: p.coords.latitude, lng: p.coords.longitude }, fromGps: true };
  } catch {
    try {
      const p = await Location.getLastKnownPositionAsync();
      if (p) return { pos: { lat: p.coords.latitude, lng: p.coords.longitude }, fromGps: true };
    } catch {
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
  }
  try {
    const r = await reverseGeocode(p);
    if (r.address && r.address !== 'Ponto no mapa') return r.address;
  } catch {
  }
  return 'A minha localização';
}
