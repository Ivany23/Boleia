import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, View, type ImageSourcePropType } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { Category } from '../types';
import { categoryColors } from '../theme';

// ---------------------------------------------------------------------------
// Veículos 3D (Microsoft Fluent Emoji 3D, licença MIT: assets/vehicles/LICENSE.txt)
// ---------------------------------------------------------------------------

const IMAGES: Record<Category, ImageSourcePropType> = {
  moto: require('../../assets/vehicles/moto.png'),
  economico: require('../../assets/vehicles/economico.png'),
  conforto: require('../../assets/vehicles/conforto.png'),
};

const NATIVE = Platform.OS !== 'web';

/** "Reduzir movimento" ligado no telemóvel/computador: sem animações contínuas. */
function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setReduce(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduce(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/**
 * Veículo 3D a flutuar suavemente (sobe e desce, com a sombra no chão a
 * acompanhar). `active` levanta-o um pouco mais e aumenta-o (categoria escolhida).
 */
export function Vehicle3D({
  category,
  size = 64,
  float = true,
  active = false,
  delay = 0,
}: {
  category: Category;
  size?: number;
  float?: boolean;
  active?: boolean;
  /** desfasamento (ms) para vários veículos não flutuarem todos ao mesmo tempo */
  delay?: number;
}) {
  const reduce = useReduceMotion();
  const [bob] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(active ? 1 : 0));

  useEffect(() => {
    if (!float || reduce) {
      bob.setValue(0);
      return;
    }
    const half = 1500;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(bob, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [bob, float, reduce, delay]);

  useEffect(() => {
    Animated.spring(lift, {
      toValue: active ? 1 : 0,
      friction: 7,
      tension: 80,
      useNativeDriver: NATIVE,
    }).start();
  }, [active, lift]);

  const amp = size * 0.06;
  const translateY = Animated.add(
    bob.interpolate({ inputRange: [0, 1], outputRange: [0, -amp] }),
    lift.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.05] }),
  );
  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const shadowScale = bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] });
  const shadowOpacity = bob.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.16] });

  return (
    <View style={{ width: size, height: size * 0.82, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Animated.View
        style={{
          position: 'absolute',
          bottom: size * 0.04,
          width: size * 0.62,
          height: Math.max(3, size * 0.07),
          borderRadius: size,
          backgroundColor: '#0B1F16',
          opacity: shadowOpacity,
          transform: [{ scaleX: shadowScale }],
        }}
      />
      <Animated.Image
        source={IMAGES[category]}
        resizeMode="contain"
        fadeDuration={0}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, marginBottom: -size * 0.02, transform: [{ translateY }, { scale }] }}
      />
    </View>
  );
}

/** Insígnia da categoria: veículo 3D (parado) num círculo da cor da categoria. */
export function VehicleBadge({ category, size = 48 }: { category: Category; size?: number }) {
  const c = categoryColors(category);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image source={IMAGES[category]} resizeMode="contain" fadeDuration={0} style={{ width: size * 0.78, height: size * 0.78 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Veículos no mapa, vistos de cima (frente para cima), na cor da categoria.
// O volume vem da sombra projectada, do gradiente lateral e dos reflexos.
// ---------------------------------------------------------------------------

const PALETTE: Record<Category, { light: string; mid: string; dark: string }> = {
  moto: { light: '#FDBA8C', mid: '#EA580C', dark: '#9A3412' }, // laranja
  economico: { light: '#FFE08A', mid: '#F2A60D', dark: '#A86A00' }, // âmbar (táxi)
  conforto: { light: '#93C5FD', mid: '#2563EB', dark: '#1E3A8A' }, // azul
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
          <Stop offset="0" stopColor="#7FA6BC" />
          <Stop offset="1" stopColor="#1B2A33" />
        </LinearGradient>
        <RadialGradient id={`roof-${id}`} cx="0.4" cy="0.35" r="0.8">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.6} />
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
      {category === 'economico' && <Rect x="15" y="37.5" width="10" height="6" rx="1.5" fill="#1F2937" />}
      {category === 'economico' && <Rect x="17" y="39.5" width="6" height="2" rx="1" fill="#FFE08A" />}
    </Svg>
  );
}

export function MotoTop({ width = 20 }: { width?: number }) {
  const c = PALETTE.moto;
  return (
    <Svg width={width} height={width * 2} viewBox="0 0 24 48">
      <Defs>
        <RadialGradient id="mshadow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#000" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="helmet" cx="0.35" cy="0.35" r="0.7">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#B8C4CC" />
        </RadialGradient>
        <LinearGradient id="mbody" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={c.dark} />
          <Stop offset="0.5" stopColor={c.light} />
          <Stop offset="1" stopColor={c.dark} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="13" cy="25" rx="11" ry="22" fill="url(#mshadow)" />
      {/* rodas */}
      <Rect x="9.5" y="2" width="5" height="10" rx="2.5" fill="#1B1F1D" />
      <Rect x="9.5" y="36" width="5" height="10" rx="2.5" fill="#1B1F1D" />
      {/* guiador */}
      <Rect x="3" y="12" width="18" height="3" rx="1.5" fill="#2A302D" />
      {/* corpo */}
      <Rect x="7.5" y="10" width="9" height="28" rx="4.5" fill="url(#mbody)" />
      <G>
        {/* ombros do condutor + capacete */}
        <Ellipse cx="12" cy="25" rx="8" ry="5" fill="#1F2937" />
        <Circle cx="12" cy="22" r="5" fill="url(#helmet)" />
      </G>
      <Ellipse cx="12" cy="3.5" rx="2" ry="1" fill="#FFFBE6" />
    </Svg>
  );
}

