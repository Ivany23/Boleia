import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { autocomplete, placeDetails } from '../api';
import { ErrorNote } from '../components/ui';
import { theme } from '../theme';
import type { LatLng, Place, Suggestion } from '../types';
import { newSession } from '../utils';

type Props = {
  title: string;
  near?: LatLng;
  onSelect: (p: Place) => void;
  onClose: () => void;
  onUseCurrent?: () => void;
  /** Fecha a pesquisa e deixa marcar o local arrastando o mapa. */
  onPickOnMap?: () => void;
};

export function PlaceSearch({ title, near, onSelect, onClose, onUseCurrent, onPickOnMap }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  // Resultado da última pesquisa concluída (para a consulta `q`)
  const [result, setResult] = useState<{ q: string; items: Suggestion[]; error: string }>({ q: '', items: [], error: '' });
  const [pickError, setPickError] = useState('');
  const [picking, setPicking] = useState(false);
  const session = useRef(newSession()); // one token per search session
  const reqId = useRef(0);

  const q = text.trim();
  const short = q.length < 2;
  const items = short ? [] : result.items;
  const loading = !short && result.q !== q;
  const error = pickError || (short ? '' : result.error);

  useEffect(() => {
    const id = ++reqId.current;
    if (short) return;
    const t = setTimeout(async () => {
      try {
        const r = await autocomplete(q, session.current, near);
        if (id === reqId.current) setResult({ q, items: r, error: '' });
      } catch (e: any) {
        if (id === reqId.current) setResult({ q, items: [], error: e?.message ?? 'Erro na pesquisa.' });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, short, near?.lat, near?.lng]);

  async function pick(s: Suggestion) {
    if (picking) return;
    setPicking(true);
    setPickError('');
    try {
      const p = await placeDetails(s.placeId, session.current);
      onSelect(p);
    } catch (e: any) {
      setPickError(e?.message ?? 'Não foi possível obter este local.');
      setPicking(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.back}>
          <Text style={{ fontSize: 22, color: theme.ink }}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.inputWrap}>
        <TextInput
          autoFocus
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (pickError) setPickError('');
          }}
          placeholder="Procurar morada ou local"
          placeholderTextColor={theme.muted}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
        />
        {loading && <ActivityIndicator color={theme.primary} />}
      </View>
      {onUseCurrent && (
        <Pressable onPress={onUseCurrent} style={styles.item}>
          <Text style={{ fontSize: 20, marginRight: 12 }}>📍</Text>
          <Text style={styles.main}>Usar a minha localização</Text>
        </Pressable>
      )}
      {onPickOnMap && (
        <Pressable onPress={onPickOnMap} style={styles.item} accessibilityRole="button">
          <Text style={{ fontSize: 20, marginRight: 12 }}>🗺️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.main}>Escolher no mapa</Text>
            <Text style={styles.sec}>Arraste o mapa ou toque no local</Text>
          </View>
        </Pressable>
      )}
      {error ? (
        <View style={{ paddingHorizontal: 18 }}>
          <ErrorNote text={error} />
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(s) => s.placeId}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !short && !loading && !error ? (
            <Text style={styles.empty}>Sem resultados. Tente outro nome.</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} style={styles.item}>
            <Text style={{ fontSize: 20, marginRight: 12 }}>📌</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.main} numberOfLines={1}>{item.main}</Text>
              {item.secondary ? <Text style={styles.sec} numberOfLines={1}>{item.secondary}</Text> : null}
            </View>
          </Pressable>
        )}
      />
      {picking && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: theme.card, zIndex: 50 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, minHeight: 48 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: theme.ink },
  inputWrap: { flexDirection: 'row', alignItems: 'center', margin: 14, paddingRight: 14, backgroundColor: theme.bg, borderRadius: 16 },
  input: { flex: 1, minHeight: 52, paddingHorizontal: 16, fontSize: 17, color: theme.ink },
  item: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: theme.line },
  main: { fontSize: 16, fontWeight: '700', color: theme.ink },
  sec: { fontSize: 13, color: theme.muted, marginTop: 2 },
  empty: { textAlign: 'center', color: theme.muted, marginTop: 30 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
});
