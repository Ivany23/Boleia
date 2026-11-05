import { Platform } from 'react-native';

/** Identidade Boleia: verde (confiança) + amarelo (táxi, energia). */
export const theme = {
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
  radius: 20,
};

/** Sombra suave e consistente (iOS + Android). */
export const shadow = (level: 1 | 2 | 3 = 1) =>
  Platform.select({
    ios: {
      shadowColor: '#06210F',
      shadowOpacity: [0.08, 0.12, 0.18][level - 1],
      shadowRadius: [6, 12, 20][level - 1],
      shadowOffset: { width: 0, height: [2, 4, 8][level - 1] },
    },
    default: { elevation: [3, 8, 16][level - 1] },
  });
