import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tap } from '../haptics';
import { shadow, theme } from '../theme';
import type { Fare } from '../types';
import { money, pct, type Tag } from '../utils';

type BtnProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', disabled, style }: BtnProps) {
  const bg = {
    primary: theme.primary,
    accent: theme.accent,
    ghost: 'transparent',
    danger: theme.dangerSoft,
  }[variant];
  const color = { primary: '#fff', accent: theme.ink, ghost: theme.primary, danger: theme.danger }[variant];
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === 'primary' || variant === 'accent' ? shadow(1) : null,
        style,
      ]}
    >
      <Text style={[styles.btnText, { color }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * Painel inferior com entrada animada. Se `summary` for dado, a pega permite
 * minimizar o painel para uma linha, deixando o mapa visível durante a viagem.
 */
export function Sheet({
  children,
  style,
  summary,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  summary?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const collapsible = !!summary;
  const insets = useSafeAreaInsets();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  return (
    <Animated.View
      style={[
        styles.sheet,
        shadow(3),
        { paddingBottom: Math.max(insets.bottom, 12) + 8, opacity: v, transform: [{ translateY }] },
        style,
      ]}
    >
      {collapsible ? (
        <Pressable
          onPress={() => {
            tap();
            setCollapsed((c) => !c);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 60, right: 60 }}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Mostrar detalhes' : 'Minimizar e ver o mapa'}
          style={styles.grabArea}
        >
          <View style={styles.grab} />
          <Text style={styles.grabHint}>{collapsed ? '▲ detalhes' : '▼ ver mapa'}</Text>
        </Pressable>
      ) : (
        <View style={styles.grab} />
      )}
      {collapsed ? summary : children}
    </Animated.View>
  );
}

/** Botão redondo flutuante sobre o mapa. */
export function MapButton({
  icon,
  label,
  onPress,
  active = false,
  style,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.mapBtn,
        shadow(2),
        active && { backgroundColor: theme.primary },
        { transform: [{ scale: pressed ? 0.94 : 1 }] },
        style,
      ]}
    >
      <Text style={{ fontSize: 19, color: active ? '#fff' : theme.ink }}>{icon}</Text>
    </Pressable>
  );
}

/** Barra de progresso da viagem. */
export function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={styles.progress}>
      <View style={[styles.progressFill, { width: `${Math.round(v * 100)}%` }]} />
    </View>
  );
}

/** Etiqueta no mapa (ex.: "3 min" por cima do ponto de recolha). */
export function MapPill({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.pill, shadow(1)]}>
        <Text style={styles.pillText}>{text}</Text>
      </View>
      <View style={styles.pillTip} />
    </View>
  );
}

export function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => {
            tap();
            onChange(n);
          }}
          hitSlop={6}
          style={{ padding: 4 }}
          accessibilityLabel={`${n} estrela(s)`}
        >
          <Text style={{ fontSize: 36, color: n <= value ? theme.accent : theme.line }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ConnectionBanner({ connected }: { connected: boolean }) {
  const insets = useSafeAreaInsets();
  if (connected) return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]} pointerEvents="none">
      <Text style={styles.bannerText}>Sem ligação ao servidor. A tentar ligar de novo…</Text>
    </View>
  );
}

export function DriverMarkerView({ category }: { category: string }) {
  return (
    <View style={[styles.marker, shadow(1)]}>
      <Text style={{ fontSize: 18 }}>{category === 'moto' ? '🏍️' : '🚗'}</Text>
    </View>
  );
}

export function Pin({ color, label }: { color: string; label?: string }) {
  return (
    <View style={[styles.pin, { backgroundColor: color }]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{label ?? ''}</Text>
    </View>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return (
    <View style={styles.err}>
      <Text style={{ color: theme.danger, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

const TONES = {
  night: { bg: theme.nightSoft, fg: theme.night },
  warn: { bg: theme.warnSoft, fg: theme.warn },
  accent: { bg: theme.accentSoft, fg: '#9A5A16' },
};

/** Etiquetas como "🌙 Tarifa nocturna +25%" ou "🚦 Trânsito intenso". */
export function PriceTags({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;
  return (
    <View style={styles.tags}>
      {tags.map((t) => (
        <View key={t.key} style={[styles.tag, { backgroundColor: TONES[t.tone].bg }]}>
          <Text style={{ fontSize: 12 }}>{t.icon}</Text>
          <Text style={[styles.tagText, { color: TONES[t.tone].fg }]}>{t.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** Detalhe transparente do preço: quanto é de quê, e quanto fica para o motorista. */
export function FareDetails({ fare, perspective = 'passenger' }: { fare: Fare; perspective?: 'passenger' | 'driver' }) {
  const b = fare.breakdown;
  const rows: [string, number][] = [
    ['Tarifa base', b.base],
    ['Distância (inclui combustível)', b.distance],
    ['Tempo (inclui trânsito)', b.time],
  ];
  if (b.pickup) rows.push(['Ida do motorista até si', b.pickup]);
  if (b.surcharge > 0) rows.push([`Ajuste horário/procura (${pct(fare.multiplier)})`, b.surcharge]);
  if (b.surcharge < 0) rows.push(['Desconto (pouca procura)', b.surcharge]);
  if (b.guarantee) rows.push(['Garantia de ganho do motorista', b.guarantee]);
  if (b.serviceFee) rows.push(['Taxa de serviço', b.serviceFee]);
  return (
    <View style={styles.fare}>
      {rows.map(([label, v]) => (
        <View key={label} style={styles.fareRow}>
          <Text style={styles.fareLabel}>{label}</Text>
          <Text style={styles.fareValue}>{money(v)}</Text>
        </View>
      ))}
      <View style={styles.fareLine} />
      <View style={styles.fareRow}>
        <Text style={[styles.fareLabel, { fontWeight: '800', color: theme.ink }]}>Total</Text>
        <Text style={[styles.fareValue, { fontWeight: '900' }]}>{money(fare.total)}</Text>
      </View>
      <View style={styles.fareRow}>
        <Text style={[styles.fareLabel, perspective === 'driver' && { color: theme.primary, fontWeight: '800' }]}>
          {perspective === 'driver' ? 'Você recebe' : 'Para o motorista'}
        </Text>
        <Text style={[styles.fareValue, { color: theme.primary }]}>{money(fare.driverEarnings)}</Text>
      </View>
      <View style={styles.fareRow}>
        <Text style={styles.fareLabel}>Taxa da plataforma</Text>
        <Text style={styles.fareValue}>{money(fare.platformFee)}</Text>
      </View>
    </View>
  );
}

/** Botão redondo com contador opcional (ex.: mensagens por ler). */
export function RoundButton({
  icon,
  label,
  onPress,
  badge = 0,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.round, { opacity: pressed ? 0.8 : 1 }]}
      hitSlop={6}
    >
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Círculo com as iniciais do nome. */
export function Avatar({ name, size = 52, emoji }: { name: string; size?: number; emoji?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.36, fontWeight: '800', color: theme.primaryDark }}>{initials}</Text>
      {emoji ? (
        <View style={styles.avatarEmoji}>
          <Text style={{ fontSize: 12 }}>{emoji}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const common = StyleSheet.create({
  h1: { fontSize: 21, fontWeight: '800', color: theme.ink, letterSpacing: -0.3 },
  h2: { fontSize: 16, fontWeight: '700', color: theme.ink },
  body: { fontSize: 14, color: theme.ink },
  muted: { fontSize: 12.5, color: theme.muted },
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 14 },
});

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnText: { fontSize: 16, fontWeight: '700' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 10,
  },
  grab: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: theme.line },
  grabArea: { alignSelf: 'center', alignItems: 'center', gap: 2, paddingHorizontal: 20 },
  grabHint: { fontSize: 11, fontWeight: '700', color: theme.muted },
  mapBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { height: 6, borderRadius: 3, backgroundColor: theme.line, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: theme.primary },
  pill: { backgroundColor: theme.primaryDark, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { color: theme.accent, fontWeight: '900', fontSize: 13 },
  pillTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.primaryDark,
  },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: theme.danger,
    paddingBottom: 8,
    alignItems: 'center',
  },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  err: { backgroundColor: theme.dangerSoft, borderRadius: 12, padding: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontSize: 12, fontWeight: '800' },
  fare: { backgroundColor: theme.bg, borderRadius: 14, padding: 12, gap: 6 },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  fareLabel: { fontSize: 13, color: theme.muted, flexShrink: 1 },
  fareValue: { fontSize: 13, fontWeight: '700', color: theme.ink },
  fareLine: { height: 1, backgroundColor: theme.line, marginVertical: 2 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: theme.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  avatar: { backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
