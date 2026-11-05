import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { Category } from '../types';

/**
 * Veículos vistos de cima (frente para cima). O "3D" vem da sombra projectada,
 * do gradiente lateral da carroçaria e dos reflexos no tejadilho e nos vidros.
 */
const PALETTE: Record<Category, { light: string; mid: string; dark: string }> = {
  economico: { light: '#FFE27A', mid: '#FFC629', dark: '#C79300' }, // amarelo táxi
  conforto: { light: '#2FC07E', mid: '#0A7A4B', dark: '#04452A' }, // verde Boleia
  moto: { light: '#2FC07E', mid: '#0A7A4B', dark: '#04452A' },
};

export function CarTop({ category = 'economico', width = 26 }: { category?: Category; width?: number }) {
  if (category === 'moto') return <MotoTop width={width * 0.8} />;
  const c = PALETTE[category];
  const id = category; // ids únicos por cor
  return (
    <Svg width={width} height={width * 1.8} viewBox="0 0 40 72">
      <Defs>
        <LinearGradient id={`body-${id}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={c.dark} />
          <Stop offset="0.22" stopColor={c.mid} />
          <Stop offset="0.5" stopColor={c.light} />
          <Stop offset="0.78" stopColor={c.mid} />
          <Stop offset="1" stopColor={c.dark} />
        </LinearGradient>
        <LinearGradient id={`glass-${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5B7A8C" />
          <Stop offset="1" stopColor="#1B2A33" />
        </LinearGradient>
        <RadialGradient id={`roof-${id}`} cx="0.4" cy="0.35" r="0.8">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`shadow-${id}`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#000" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* sombra projectada (ligeiramente deslocada = sensação de altura) */}
      <Ellipse cx="22" cy="39" rx="19" ry="34" fill={`url(#shadow-${id})`} />
      {/* espelhos */}
      <Rect x="1.5" y="22" width="5" height="4" rx="2" fill={c.dark} />
      <Rect x="33.5" y="22" width="5" height="4" rx="2" fill={c.dark} />
      {/* carroçaria */}
      <Rect x="5" y="3" width="30" height="65" rx="11" fill={`url(#body-${id})`} />
      {/* pára-brisas e vidro traseiro */}
      <Path d="M9 21 Q20 15 31 21 L29 29 Q20 26 11 29 Z" fill={`url(#glass-${id})`} />
      <Path d="M11 53 Q20 55.5 29 53 L30 59 Q20 62 10 59 Z" fill={`url(#glass-${id})`} />
      {/* tejadilho com reflexo */}
      <Rect x="10.5" y="29.5" width="19" height="23" rx="5" fill={c.mid} />
      <Rect x="10.5" y="29.5" width="19" height="23" rx="5" fill={`url(#roof-${id})`} />
      {/* faróis e farolins */}
      <Ellipse cx="11" cy="5.5" rx="3.2" ry="1.6" fill="#FFFBE6" />
      <Ellipse cx="29" cy="5.5" rx="3.2" ry="1.6" fill="#FFFBE6" />
      <Rect x="8" y="65" width="6" height="2" rx="1" fill="#E5484D" />
      <Rect x="26" y="65" width="6" height="2" rx="1" fill="#E5484D" />
      {/* sinal de táxi no tejadilho */}
      {category === 'economico' && <Rect x="16" y="38" width="8" height="5" rx="1.5" fill="#0A7A4B" />}
    </Svg>
  );
}

export function MotoTop({ width = 20 }: { width?: number }) {
  return (
    <Svg width={width} height={width * 2} viewBox="0 0 24 48">
      <Defs>
        <RadialGradient id="mshadow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#000" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="helmet" cx="0.35" cy="0.35" r="0.7">
          <Stop offset="0" stopColor="#FFE27A" />
          <Stop offset="1" stopColor="#C79300" />
        </RadialGradient>
      </Defs>
      <Ellipse cx="13" cy="25" rx="11" ry="22" fill="url(#mshadow)" />
      {/* rodas */}
      <Rect x="9.5" y="2" width="5" height="10" rx="2.5" fill="#1B1F1D" />
      <Rect x="9.5" y="36" width="5" height="10" rx="2.5" fill="#1B1F1D" />
      {/* guiador */}
      <Rect x="3" y="12" width="18" height="3" rx="1.5" fill="#2A302D" />
      {/* corpo */}
      <Rect x="7.5" y="10" width="9" height="28" rx="4.5" fill="#0A7A4B" />
      <G>
        {/* ombros do condutor + capacete amarelo */}
        <Ellipse cx="12" cy="25" rx="8" ry="5" fill="#0E3B27" />
        <Circle cx="12" cy="22" r="5" fill="url(#helmet)" />
      </G>
      <Ellipse cx="12" cy="3.5" rx="2" ry="1" fill="#FFFBE6" />
    </Svg>
  );
}

/** Ícone de categoria (veículo deitado dentro de um círculo, para listas). */
export function VehicleBadge({ category, size = 48 }: { category: Category; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: category === 'economico' ? '#FFF5D6' : '#E1F3E9',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <View style={{ transform: [{ rotate: '90deg' }] }}>
        <CarTop category={category} width={size * 0.42} />
      </View>
    </View>
  );
}
