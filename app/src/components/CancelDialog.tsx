import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tap } from '../haptics';
import { theme } from '../theme';
import { Button, common } from './ui';

const REASONS = {
  passenger: ['Mudei de planos', 'O motorista está a demorar', 'O motorista pediu para cancelar', 'Pedi por engano', 'Outro motivo'],
  driver: ['O passageiro não apareceu', 'O passageiro pediu para cancelar', 'Local de recolha inacessível', 'Problema com o carro', 'Outro motivo'],
};

/** Confirmação de cancelamento com motivo (o outro lado vê quem cancelou e porquê). */
export function CancelDialog({
  visible,
  role,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  role: 'passenger' | 'driver';
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  const close = () => {
    setReason('');
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.bg} onPress={close}>
        <Pressable style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]} onPress={() => {}}>
          <View style={styles.grab} />
          <Text style={common.h2}>Cancelar a viagem?</Text>
          <Text style={common.muted}>
            {role === 'passenger' ? 'Diga-nos porquê. O motorista será avisado.' : 'Diga-nos porquê. O passageiro será avisado.'}
          </Text>
          <View style={{ gap: 8 }}>
            {REASONS[role].map((r) => {
              const on = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => {
                    tap();
                    setReason(r);
                  }}
                  style={[styles.reason, on && styles.reasonOn]}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                  <Text style={[common.body, on && { fontWeight: '700' }]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Voltar" variant="ghost" onPress={close} style={{ flex: 1 }} />
            <Button
              title="Cancelar viagem"
              variant="danger"
              disabled={!reason}
              onPress={() => {
                const r = reason;
                setReason('');
                onConfirm(r);
              }}
              style={{ flex: 1.4 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(6,33,15,0.45)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  grab: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: theme.line },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.line,
    paddingHorizontal: 14,
  },
  reasonOn: { borderColor: theme.danger, backgroundColor: theme.dangerSoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: theme.danger },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.danger },
});
