import { Platform } from 'react-native';

/** Identidade Boleia: verde profissional + grafite + âmbar refinado + azul para localização. */
const LIGHT = {
  primary: '#0A7A4B',
  primaryDark: '#075232',
  primaryLight: '#14A363',
  primarySoft: '#E8F5EE',
  accent: '#E5A110',
  accentDark: '#BD8205',
  accentSoft: '#FFF6E0',
  info: '#2563EB',
  infoSoft: '#EFF6FF',
  night: '#2E3A6B',
  nightSoft: '#E3E7F6',
  warn: '#A86A00',
  warnSoft: '#FFF0CC',
  bg: '#F5F7F6',
  card: '#FFFFFF',
  ink: '#18241E',
  muted: '#62736A',
  line: '#E2E8E4',
  danger: '#C8452F',
  dangerSoft: '#F9E1DC',
  overlay: 'rgba(15,28,21,0.45)',
  radius: 16,
};

/** Modo nocturno: fundos grafite/escuros com toques refinados. */
const DARK: typeof LIGHT = {
  primary: '#1FAF6B',
  primaryDark: '#5FD39A',
  primaryLight: '#2BC47D',
  primarySoft: '#132F23',
  accent: '#F2B024',
  accentDark: '#C98C0A',
  accentSoft: '#33270E',
  info: '#3B82F6',
  infoSoft: '#172554',
  night: '#AEB9F0',
  nightSoft: '#232A47',
  warn: '#F2C14E',
  warnSoft: '#3A2F12',
  bg: '#121815',
  card: '#1A231F',
  ink: '#EDF4F0',
  muted: '#8E9E96',
  line: '#28342E',
  danger: '#FF7A63',
  dangerSoft: '#3A1E19',
  overlay: 'rgba(0,0,0,0.6)',
  radius: 16,
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
