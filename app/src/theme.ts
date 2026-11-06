import { Platform } from 'react-native';

/** Identidade Boleia: verde (confiança) + amarelo (táxi, energia). */
const LIGHT = {
  primary: '#0A7A4B',
  primaryDark: '#06512F',
  primaryLight: '#14A363',
  primarySoft: '#E1F3E9',
  accent: '#FFC629',
  accentDark: '#D9A100',
  accentSoft: '#FFF5D6',
  night: '#2E3A6B',
  nightSoft: '#E3E7F6',
  warn: '#A86A00',
  warnSoft: '#FFF0CC',
  bg: '#F4F7F5',
  card: '#FFFFFF',
  ink: '#0E1B14',
  muted: '#5F6F66',
  line: '#E1E8E3',
  danger: '#C8452F',
  dangerSoft: '#F9E1DC',
  overlay: 'rgba(6,33,15,0.45)',
  radius: 20,
};

/** Modo nocturno: fundos escuros esverdeados, mesmo verde/amarelo da marca. */
const DARK: typeof LIGHT = {
  primary: '#1FAF6B',
  primaryDark: '#5FD39A',
  primaryLight: '#2BC47D',
  primarySoft: '#123526',
  accent: '#FFC629',
  accentDark: '#E9B10F',
  accentSoft: '#3A3013',
  night: '#AEB9F0',
  nightSoft: '#232A47',
  warn: '#F2C14E',
  warnSoft: '#3A2F12',
  bg: '#141B17',
  card: '#1C2520',
  ink: '#EEF4F0',
  muted: '#9AAAA2',
  line: '#2C3832',
  danger: '#FF7A63',
  dangerSoft: '#3A1E19',
  overlay: 'rgba(0,0,0,0.6)',
  radius: 20,
};

export type ThemeMode = 'light' | 'dark';

/**
 * Cores em uso. É um objecto mutável de propósito: applyTheme() é chamado no
 * arranque (App.tsx) ANTES de os ecrãs serem carregados, por isso os estilos
 * criados com StyleSheet.create já nascem com as cores certas.
 */
export const theme = { ...LIGHT };
export let themeMode: ThemeMode = 'light';
export const isDark = () => themeMode === 'dark';

export function applyTheme(mode: ThemeMode) {
  themeMode = mode;
  Object.assign(theme, mode === 'dark' ? DARK : LIGHT);
}

/** Sombra suave e consistente (iOS + Android). */
export const shadow = (level: 1 | 2 | 3 = 1) =>
  Platform.select({
    ios: {
      shadowColor: '#06210F',
      shadowOpacity: [0.08, 0.12, 0.18][level - 1] * (themeMode === 'dark' ? 2 : 1),
      shadowRadius: [6, 12, 20][level - 1],
      shadowOffset: { width: 0, height: [2, 4, 8][level - 1] },
    },
    default: { elevation: [3, 8, 16][level - 1] },
  });
