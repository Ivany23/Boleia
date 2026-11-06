import { Platform } from 'react-native';
import type { Category } from './types';

/**
 * Identidade Boleia: verde profissional + âmbar + azul, com uma cor própria
 * para cada tipo de veículo (Mota laranja, Económico âmbar, Conforto azul)
 * e tons suaves de apoio (violeta para paragens, areia para estradas de terra).
 */
const LIGHT = {
  primary: '#0A7A4B',
  primaryDark: '#075232',
  primaryLight: '#16A35F',
  primarySoft: '#E6F4EC',
  accent: '#F2A60D',
  accentDark: '#C77F00',
  accentSoft: '#FFF5DC',
  info: '#2563EB',
  infoSoft: '#EAF1FF',
  violet: '#7C3AED',
  violetSoft: '#F1EBFF',
  sand: '#B7791F',
  sandSoft: '#FCF1DC',
  night: '#3B4A8C',
  nightSoft: '#E6EAFB',
  warn: '#A86A00',
  warnSoft: '#FFF1CF',
  catMoto: '#EA580C',
  catMotoSoft: '#FFEDE3',
  catEco: '#D99100',
  catEcoSoft: '#FFF4D6',
  catComfort: '#2563EB',
  catComfortSoft: '#E7EFFF',
  bg: '#F3F6F8',
  card: '#FFFFFF',
  ink: '#15211B',
  muted: '#5F6E69',
  line: '#E1E7EA',
  danger: '#D1442F',
  dangerSoft: '#FCE6E1',
  overlay: 'rgba(15,28,21,0.42)',
  heroFrom: '#0B8A55',
  heroTo: '#0B5E8A',
  radius: 16,
};

/** Modo nocturno (só quando a pessoa o escolhe no menu). */
const DARK: typeof LIGHT = {
  primary: '#22B573',
  primaryDark: '#6BDCA5',
  primaryLight: '#2FC983',
  primarySoft: '#123024',
  accent: '#F5B731',
  accentDark: '#E0A21C',
  accentSoft: '#33280F',
  info: '#60A5FA',
  infoSoft: '#16233F',
  violet: '#A78BFA',
  violetSoft: '#251C3D',
  sand: '#E0A85A',
  sandSoft: '#33270F',
  night: '#AEB9F0',
  nightSoft: '#232A47',
  warn: '#F2C14E',
  warnSoft: '#3A2F12',
  catMoto: '#FB8A4C',
  catMotoSoft: '#3A1F12',
  catEco: '#F5B731',
  catEcoSoft: '#33280F',
  catComfort: '#60A5FA',
  catComfortSoft: '#16233F',
  bg: '#111816',
  card: '#1A2420',
  ink: '#EDF4F0',
  muted: '#93A39B',
  line: '#2A3631',
  danger: '#FF7A63',
  dangerSoft: '#3A1E19',
  overlay: 'rgba(0,0,0,0.6)',
  heroFrom: '#0E6B45',
  heroTo: '#123F66',
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

/** Cor principal e fundo suave de cada categoria de veículo. */
export function categoryColors(c: Category | undefined) {
  if (c === 'moto') return { fg: theme.catMoto, soft: theme.catMotoSoft };
  if (c === 'conforto') return { fg: theme.catComfort, soft: theme.catComfortSoft };
  return { fg: theme.catEco, soft: theme.catEcoSoft };
}

/** Sombra suave e consistente (iOS + Android + web). */
export const shadow = (level: 1 | 2 | 3 = 1) =>
  Platform.select({
    ios: {
      shadowColor: '#0B2A1C',
      shadowOpacity: [0.08, 0.12, 0.16][level - 1] * (themeMode === 'dark' ? 2 : 1),
      shadowRadius: [6, 12, 22][level - 1],
      shadowOffset: { width: 0, height: [2, 4, 8][level - 1] },
    },
    web: {
      boxShadow: [
        '0 1px 3px rgba(11,42,28,0.08), 0 2px 8px rgba(11,42,28,0.06)',
        '0 2px 6px rgba(11,42,28,0.10), 0 6px 18px rgba(11,42,28,0.08)',
        '0 -2px 10px rgba(11,42,28,0.06), 0 -10px 34px rgba(11,42,28,0.10)',
      ][level - 1],
    },
    default: { elevation: [3, 8, 16][level - 1] },
  });
