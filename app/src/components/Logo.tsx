import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { theme } from '../theme';

export function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={theme.primaryLight} />
          <Stop offset="1" stopColor={theme.primaryDark} />
        </LinearGradient>
        <LinearGradient id="pin" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFD95A" />
          <Stop offset="1" stopColor={theme.accent} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" rx="24" fill="url(#bg)" />

      <Rect x="14" y="34" width="20" height="6" rx="3" fill={theme.accent} opacity={0.95} />
      <Rect x="20" y="46" width="14" height="6" rx="3" fill={theme.accent} opacity={0.7} />
      <Rect x="26" y="58" width="8" height="6" rx="3" fill={theme.accent} opacity={0.45} />

      <Path d="M58 22 a22 22 0 0 1 18.5 33.9 L58 84 L39.5 55.9 A22 22 0 0 1 58 22 Z" fill="url(#pin)" />
      <Circle cx="58" cy="44" r="8.5" fill={theme.primaryDark} />
    </Svg>
  );
}

export function Logo({ size = 44, light = false }: { size?: number; light?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.25 }}>
      <LogoMark size={size} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text
          style={{
            fontSize: size * 0.82,
            fontWeight: '900',
            letterSpacing: -size * 0.03,
            color: light ? '#fff' : theme.ink,
          }}
        >
          boleia
        </Text>
        <View
          style={{
            width: size * 0.18,
            height: size * 0.18,
            borderRadius: size * 0.09,
            backgroundColor: theme.accent,
            marginLeft: 2,
            marginBottom: size * 0.2,
          }}
        />
      </View>
    </View>
  );
}
