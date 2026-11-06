import React from 'react';
import { DevSettings, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tap } from '../haptics';
import { saveThemePref, type ThemePref } from '../storage';
import { theme } from '../theme';
import type { Profile } from '../types';
import { formatPhone } from '../utils';
import { Avatar, common } from './ui';
import { Icon } from './Icon';

export function reloadApp() {
  if (Platform.OS === 'web') {
    window.location.reload();
    return;
  }
  try {
    DevSettings.reload();
  } catch {
  }
}

const THEMES: { id: ThemePref; label: string; icon: 'sun' | 'moon' | 'palette' }[] = [
  { id: 'light', label: 'Claro', icon: 'sun' },
  { id: 'dark', label: 'Escuro', icon: 'moon' },
  { id: 'auto', label: 'Do telemóvel', icon: 'palette' },
];

export function AccountMenu({
  visible,
  profile,
  themePref,
  onClose,
  onSwitchRole,
  onLogout,
}: {
  visible: boolean;
  profile: Profile;
  themePref: ThemePref;
  onClose: () => void;
  onSwitchRole: () => void;
  onLogout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isDriver = profile.role === 'driver';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose}>
        <Pressable style={[styles.card, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]} onPress={() => {}}>
          <View style={styles.grab} />
          <View style={[common.row, { gap: 12 }]}>
            <Avatar name={profile.name} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={common.h2} numberOfLines={1}>{profile.name}</Text>
              <Text style={common.muted}>
                {isDriver ? 'Motorista' : 'Passageiro'} · WhatsApp {formatPhone(profile.phone)}
              </Text>
            </View>
          </View>

          <View style={[common.row, { gap: 6, marginTop: 6 }]}>
            <Icon name="palette" size={15} color={theme.muted} />
            <Text style={styles.section}>Aparência</Text>
          </View>
          <View style={styles.segment}>
            {THEMES.map((t) => {
              const on = themePref === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={async () => {
                    if (on) return;
                    tap();
                    await saveThemePref(t.id);
                    reloadApp();
                  }}
                  style={[styles.segItem, on && styles.segOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Icon name={t.icon} size={14} color={on ? '#fff' : theme.muted} />
                  <Text style={[styles.segText, on && { color: '#fff' }]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={styles.row}
            onPress={() => {
              tap();
              onSwitchRole();
            }}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.infoSoft }]}>
              <Icon name="swap" size={17} color={theme.info} />
            </View>
            <Text style={styles.rowText}>{isDriver ? 'Usar como passageiro' : 'Conduzir com a Boleia (motorista)'}</Text>
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => {
              tap();
              onLogout();
            }}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.dangerSoft }]}>
              <Icon name="logout" size={17} color={theme.danger} />
            </View>
            <Text style={[styles.rowText, { color: theme.danger }]}>Terminar sessão</Text>
          </Pressable>
          <Pressable style={[styles.row, { justifyContent: 'center' }]} onPress={onClose}>
            <Text style={[styles.rowText, { color: theme.muted }]}>Fechar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
  card: { backgroundColor: theme.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10 },
  grab: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: theme.line, marginBottom: 4 },
  section: { fontSize: 13, fontWeight: '600', color: theme.muted },
  segment: { flexDirection: 'row', backgroundColor: theme.bg, borderRadius: 12, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  segOn: { backgroundColor: theme.primary },
  segText: { fontSize: 13, fontWeight: '600', color: theme.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderBottomWidth: 1, borderBottomColor: theme.line },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontSize: 14.5, fontWeight: '500', color: theme.ink },
});
