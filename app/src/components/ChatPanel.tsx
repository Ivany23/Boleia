import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tap } from '../haptics';
import { shadow, theme } from '../theme';
import type { ChatMessage, ChatRole } from '../types';
import { clockTime } from '../utils';
import { Avatar } from './ui';

const QUICK: Record<ChatRole, string[]> = {
  passenger: ['Estou à espera no local', 'Onde está?', 'Já estou a sair', 'Pode esperar 2 min?', 'Obrigado!'],
  driver: ['Estou a caminho', 'Cheguei ao local', 'Há muito trânsito, chego em breve', 'Onde está exactamente?', 'Obrigado!'],
};

/**
 * Espaço ocupado pelo teclado por cima da janela. Funciona quer o Android
 * redimensione a janela (inset ≈ 0) quer não (inset = altura do teclado).
 */
function useKeyboardInset() {
  const { height } = useWindowDimensions();
  const [kbTop, setKbTop] = useState<number | null>(null);
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEv, (e) => {
      const top = e?.endCoordinates?.screenY;
      setKbTop(Number.isFinite(top) ? top : null);
    });
    const b = Keyboard.addListener(hideEv, () => setKbTop(null));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  // Calculado com a altura ACTUAL da janela: se o sistema já a encolheu, dá ~0.
  return kbTop === null ? 0 : Math.max(0, Math.round(height - kbTop));
}

type Props = {
  role: ChatRole;
  otherName: string;
  otherDetail?: string;
  otherEmoji?: string;
  messages: ChatMessage[];
  typing: boolean;
  send: (text: string) => Promise<string | null>;
  sendTyping: () => void;
  onClose: () => void;
};

export function ChatPanel({ role, otherName, otherDetail, otherEmoji, messages, typing, send, sendTyping, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardInset();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Botão "voltar" do Android fecha a conversa (e não sai da app)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, typing, kb]);

  async function submit(value: string) {
    const v = value.trim();
    if (!v || sending) return;
    setSending(true);
    setError('');
    const err = await send(v);
    setSending(false);
    if (err) setError(err);
    else if (value === text) setText('');
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={[styles.header, shadow(1)]}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.back} accessibilityLabel="Fechar conversa">
          <Text style={{ fontSize: 26, color: theme.ink }}>‹</Text>
        </Pressable>
        <Avatar name={otherName} size={40} emoji={otherEmoji} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.name} numberOfLines={1}>{otherName}</Text>
          <Text style={styles.detail} numberOfLines={1}>
            {typing ? 'a escrever…' : otherDetail ?? (role === 'passenger' ? 'O seu motorista' : 'O seu passageiro')}
          </Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14, gap: 6, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 34 }}>💬</Text>
            <Text style={styles.emptyTitle}>Combine os detalhes da recolha</Text>
            <Text style={styles.emptyText}>
              As mensagens só ficam disponíveis durante esta viagem. Nunca partilhe códigos ou senhas.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const mine = item.from === role;
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[styles.msg, mine && { color: '#fff' }]}>{item.text}</Text>
              <Text style={[styles.time, mine && { color: '#CFE8DD' }]}>{clockTime(item.at)}</Text>
            </View>
          );
        }}
        ListFooterComponent={
          typing ? (
            <View style={[styles.bubble, styles.theirs, { paddingVertical: 10 }]}>
              <Text style={styles.msg}>• • •</Text>
            </View>
          ) : undefined
        }
      />

      <View style={{ paddingBottom: kb > 0 ? kb : Math.max(insets.bottom, 10), backgroundColor: theme.card }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 10 }}
        >
          {QUICK[role].map((q) => (
            <Pressable
              key={q}
              onPress={() => {
                tap();
                submit(q);
              }}
              disabled={sending}
              style={({ pressed }) => [styles.quick, { opacity: pressed || sending ? 0.6 : 1 }]}
            >
              <Text style={styles.quickText}>{q}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (v.trim()) sendTyping();
            }}
            placeholder="Escreva uma mensagem"
            placeholderTextColor={theme.muted}
            style={styles.input}
            multiline
            maxLength={500}
          />
          <Pressable
            onPress={() => submit(text)}
            disabled={!text.trim() || sending}
            style={[styles.send, { opacity: !text.trim() || sending ? 0.4 : 1 }]}
            accessibilityLabel="Enviar"
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: theme.bg, zIndex: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: theme.card,
  },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800', color: theme.ink },
  detail: { fontSize: 13, color: theme.muted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.ink, textAlign: 'center' },
  emptyText: { fontSize: 13, color: theme.muted, textAlign: 'center' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: theme.primary, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: theme.card, borderBottomLeftRadius: 6 },
  msg: { fontSize: 15, color: theme.ink },
  time: { fontSize: 10, color: theme.muted, alignSelf: 'flex-end', marginTop: 2 },
  quick: { borderRadius: 999, borderWidth: 1, borderColor: theme.primary, paddingHorizontal: 12, paddingVertical: 7 },
  quickText: { color: theme.primary, fontWeight: '700', fontSize: 13 },
  error: { color: theme.danger, fontSize: 13, paddingHorizontal: 14, paddingTop: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10 },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 23,
    backgroundColor: theme.bg,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    color: theme.ink,
  },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
});
