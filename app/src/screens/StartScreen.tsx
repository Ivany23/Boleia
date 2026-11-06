import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Logo } from '../components/Logo';
import { Button, common } from '../components/ui';
import { CarTop, VehicleBadge } from '../components/Vehicle';
import { Icon } from '../components/Icon';
import { tap } from '../haptics';
import { getPermission } from '../location';
import { shadow, theme } from '../theme';
import type { Category, Profile } from '../types';
import { CATEGORIES, formatPhone, normalizePhone } from '../utils';

export function StartScreen({ onStart, initial }: { onStart: (p: Profile) => void; initial?: Partial<Profile> }) {
  const insets = useSafeAreaInsets();
  // ao trocar de papel (menu), os dados já conhecidos vêm preenchidos
  const [role, setRole] = useState<'passenger' | 'driver'>(initial?.role ?? 'passenger');
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ? formatPhone(initial.phone) : '');
  const [car, setCar] = useState(initial?.car ?? '');
  const [plate, setPlate] = useState(initial?.plate ?? '');
  const [category, setCategory] = useState<Category>(initial?.category ?? 'economico');
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isDriver = role === 'driver';

  async function go(skipPermission = false) {
    setError('');
    if (!name.trim()) return setError('Escreva o seu nome para continuar.');
    const whatsapp = normalizePhone(phone);
    if (!whatsapp) return setError('Escreva um número de WhatsApp válido de Moçambique (ex.: 84 123 4567).');
    if (isDriver && (!car.trim() || !plate.trim())) {
      return setError('Indique o carro e a matrícula.');
    }
    if (!skipPermission) {
      setBusy(true);
      const perm = await getPermission();
      setBusy(false);
      if (perm === 'denied') {
        setDenied(true);
        return;
      }
    }
    onStart({
      role,
      name: name.trim(),
      phone: whatsapp,
      ...(isDriver ? { car: car.trim(), plate: plate.trim().toUpperCase(), category } : {}),
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cabeçalho verde com estrada amarela e carro */}
        <View style={[styles.hero, { paddingTop: insets.top + 20 }]}>
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 260" preserveAspectRatio="none">
            <Path d="M-20 230 C 90 170, 170 250, 260 170 S 380 90, 430 60" stroke={theme.accent} strokeWidth={26} fill="none" opacity={0.95} />
            <Path
              d="M-20 230 C 90 170, 170 250, 260 170 S 380 90, 430 60"
              stroke="#fff"
              strokeWidth={2.5}
              strokeDasharray="14 12"
              fill="none"
              opacity={0.9}
            />
          </Svg>
          <Logo size={42} light />
          <Text style={styles.tagline}>A sua boleia em Maputo e Matola.{'\n'}Preço justo, sem surpresas.</Text>
          <View style={styles.heroCar}>
            <CarTop category="economico" width={22} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 18 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <RoleCard
              title="Passageiro"
              subtitle="Pedir uma boleia"
              active={!isDriver}
              onPress={() => setRole('passenger')}
              icon={<Icon name="person" size={26} color={!isDriver ? '#fff' : theme.ink} />}
            />
            <RoleCard
              title="Motorista"
              subtitle="Ganhar a conduzir"
              active={isDriver}
              onPress={() => setRole('driver')}
              icon={<VehicleBadge category="economico" size={44} />}
            />
          </View>

          <View style={[common.card, shadow(1), { gap: 10 }]}>
            <Text style={styles.label}>O seu nome</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ex.: Ana Machava"
              placeholderTextColor={theme.muted}
              autoComplete="name"
              returnKeyType="done"
            />
            <Text style={styles.label}>Número de WhatsApp</Text>
            <View style={styles.phoneRow}>
              <View style={styles.phonePrefix}>
                <Text style={styles.phonePrefixText}>+258</Text>
              </View>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/[^\d\s+]/g, '').slice(0, 16))}
                placeholder="84 123 4567"
                placeholderTextColor={theme.muted}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={16}
              />
            </View>
            <Text style={[common.muted, { fontSize: 12 }]}>
              Guardamos só o seu nome e este número, para o contactar sobre as suas viagens.
            </Text>
            {isDriver && (
              <>
                <Text style={styles.label}>Carro</Text>
                <TextInput style={styles.input} value={car} onChangeText={setCar} placeholder="Ex.: Toyota Vitz branco" placeholderTextColor={theme.muted} />
                <Text style={styles.label}>Matrícula</Text>
                <TextInput
                  style={[styles.input, { letterSpacing: 1.5, fontWeight: '700' }]}
                  value={plate}
                  onChangeText={setPlate}
                  autoCapitalize="characters"
                  placeholder="AAA 123 MC"
                  placeholderTextColor={theme.muted}
                />
                <Text style={styles.label}>Categoria</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CATEGORIES.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        tap();
                        setCategory(c.id);
                      }}
                      style={[styles.chip, category === c.id && styles.chipOn]}
                    >
                      <VehicleBadge category={c.id} size={40} />
                      <Text style={[styles.chipText, category === c.id && { color: theme.primaryDark }]}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </View>

          <View style={[common.row, { gap: 10 }]}>
            <Icon name="location" size={18} color={theme.primary} />
            <Text style={[common.muted, { flex: 1 }]}>
              Usamos a sua localização para mostrar motoristas perto de si e o percurso da viagem.
            </Text>
          </View>

          {error ? <Text style={{ color: theme.danger, fontWeight: '600' }}>{error}</Text> : null}

          {denied && (
            <View style={[common.card, { backgroundColor: theme.accentSoft, gap: 8 }]}>
              <Text style={common.h2}>Localização desligada</Text>
              <Text style={common.body}>
                Abra as Definições do telemóvel, escolha Aplicações (ou Expo Go), depois Permissões e Localização, e permita
                o acesso enquanto a app está em uso.
              </Text>
              <Button title="Abrir definições" variant="accent" onPress={() => Linking.openSettings().catch(() => {})} />
              <Button title="Tentar de novo" variant="ghost" onPress={() => go()} />
              <Button title="Continuar sem GPS (centro de Maputo)" variant="ghost" onPress={() => go(true)} />
            </View>
          )}

          <Button
            title={busy ? 'A pedir permissão…' : isDriver ? 'Começar a conduzir' : 'Continuar'}
            variant="accent"
            onPress={() => go()}
            disabled={busy}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RoleCard({
  title,
  subtitle,
  icon,
  active,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.role, active ? styles.roleOn : shadow(1)]}
    >
      {icon}
      <Text style={[styles.roleText, active && { color: '#fff' }]}>{title}</Text>
      <Text style={[styles.roleSub, active && { color: '#CFEBDC' }]}>{subtitle}</Text>
      {active && (
        <View style={styles.check}>
          <Icon name="check" size={12} color={theme.primaryDark} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: theme.primary,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: 22,
    paddingBottom: 70,
    gap: 12,
    overflow: 'hidden',
  },
  tagline: { color: '#E1F3E9', fontSize: 15, lineHeight: 22, fontWeight: '500' },
  heroCar: { position: 'absolute', right: 70, bottom: 58, transform: [{ rotate: '-62deg' }] },
  role: {
    flex: 1,
    minHeight: 104,
    borderRadius: 18,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 12,
  },
  roleOn: { backgroundColor: theme.primary },
  roleText: { fontSize: 16, fontWeight: '600', color: theme.ink },
  roleSub: { fontSize: 12, color: theme.muted },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '600', color: theme.muted },
  phoneRow: { flexDirection: 'row', gap: 8 },
  phonePrefix: { minHeight: 48, borderRadius: 12, backgroundColor: theme.bg, paddingHorizontal: 12, justifyContent: 'center' },
  phonePrefixText: { fontSize: 16, fontWeight: '600', color: theme.ink },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: theme.bg, paddingHorizontal: 14, fontSize: 15, color: theme.ink },
  chip: {
    flex: 1,
    minHeight: 84,
    borderRadius: 16,
    backgroundColor: theme.bg,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  chipOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.ink },
});
