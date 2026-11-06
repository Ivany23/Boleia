import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from './theme';
import type { Profile } from './types';
import { normalizePhone } from './utils';

/**
 * Guardado no telemóvel / browser (nunca no servidor):
 *  - a sessão (nome, WhatsApp, papel, carro): para não voltar ao registo;
 *  - a preferência de tema (claro / escuro / automático). Por omissão: CLARO.
 */
const PROFILE_KEY = 'boleia.profile.v1';
const THEME_KEY = 'boleia.theme.v1';

export type ThemePref = ThemeMode | 'auto';

const validProfile = (p: any): p is Profile =>
  !!p &&
  (p.role === 'passenger' || p.role === 'driver') &&
  typeof p.name === 'string' &&
  p.name.trim().length > 0 &&
  typeof p.phone === 'string' &&
  !!normalizePhone(p.phone) &&
  (p.role === 'passenger' || (typeof p.car === 'string' && typeof p.plate === 'string'));

export async function loadProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return validProfile(p) ? p : null;
  } catch {
    return null;
  }
}

export async function saveProfile(p: Profile | null) {
  try {
    if (p) await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    else await AsyncStorage.removeItem(PROFILE_KEY);
  } catch {
    // sem armazenamento (ex.: modo privado): a app funciona na mesma
  }
}

/** Tema guardado; sem escolha feita, a app abre SEMPRE em modo claro. */
export async function loadThemePref(): Promise<ThemePref> {
  try {
    const v = await AsyncStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'auto' ? v : 'light';
  } catch {
    return 'light';
  }
}

export async function saveThemePref(v: ThemePref) {
  try {
    await AsyncStorage.setItem(THEME_KEY, v);
  } catch {
    // ignora
  }
}
