import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from './haptics';
import { getSocket } from './socket';
import type { ChatMessage, ChatRole } from './types';

type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

const validMsg = (m: any): m is ChatMessage =>
  !!m && typeof m.id === 'string' && typeof m.rideId === 'string' && typeof m.text === 'string' &&
  (m.from === 'passenger' || m.from === 'driver') && Number.isFinite(m.at);

type State = { rideId: string | null; messages: ChatMessage[]; unread: number; typing: boolean; open: boolean };
const fresh = (rideId: string | null, open: boolean): State => ({ rideId, messages: [], unread: 0, typing: false, open });

/** Junta mensagens novas (sem repetir), por ordem de envio, só da viagem actual. */
function merge(st: State, list: ChatMessage[], countUnreadFrom?: ChatRole): State {
  const seen = new Set(st.messages.map((m) => m.id));
  const add = list.filter((m) => m.rideId === st.rideId && !seen.has(m.id));
  if (!add.length) return st;
  const incoming = countUnreadFrom ? add.filter((m) => m.from !== countUnreadFrom).length : 0;
  return {
    ...st,
    messages: [...st.messages, ...add].sort((a, b) => a.at - b.at).slice(-200),
    unread: st.open ? 0 : st.unread + incoming,
    typing: incoming > 0 ? false : st.typing,
  };
}

/**
 * Conversa em tempo real de uma viagem.
 * rideId: viagem activa (null quando não há conversa possível).
 * open: se o ecrã da conversa está aberto (para contar mensagens por ler).
 */
export function useRideChat(rideId: string | null, role: ChatRole, open: boolean) {
  const [st, setSt] = useState<State>(() => fresh(rideId, open));
  // Nova viagem: conversa nova. Abrir a conversa: tudo lido.
  if (st.rideId !== rideId) setSt(fresh(rideId, open));
  else if (st.open !== open) setSt({ ...st, open, unread: open ? 0 : st.unread });

  const rideRef = useRef(rideId);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  useEffect(() => {
    rideRef.current = rideId;
  }, [rideId]);

  const add = useCallback((list: ChatMessage[], countUnreadFrom?: ChatRole) => {
    setSt((cur) => merge(cur, list, countUnreadFrom));
  }, []);

  // Carrega o histórico (também depois de religar)
  useEffect(() => {
    if (!rideId) return;
    const s = getSocket();
    const load = () => {
      s.timeout(8000).emit('chat:history', { rideId }, (err: Error | null, res?: Ack<{ messages: ChatMessage[] }>) => {
        if (err || !res || !res.ok) return;
        add(Array.isArray(res.messages) ? res.messages.filter(validMsg) : []);
      });
    };
    load();
    s.on('connect', load);
    return () => {
      s.off('connect', load);
    };
  }, [rideId, add]);

  // Mensagens e "a escrever…" do outro lado
  useEffect(() => {
    if (!rideId) return;
    const s = getSocket();
    const onMsg = (m: ChatMessage) => {
      if (!validMsg(m) || m.rideId !== rideId) return;
      add([m], role);
      if (m.from !== role) notify('success');
    };
    const onTyping = (p: { rideId?: string; from?: ChatRole }) => {
      if (!p || p.rideId !== rideId || p.from === role) return;
      setSt((cur) => (cur.rideId === rideId ? { ...cur, typing: true } : cur));
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setSt((cur) => ({ ...cur, typing: false })), 3500);
    };
    s.on('chat:message', onMsg);
    s.on('chat:typing', onTyping);
    return () => {
      s.off('chat:message', onMsg);
      s.off('chat:typing', onTyping);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [rideId, role, add]);

  /** Envia; devolve null se correu bem, ou a mensagem de erro. */
  const send = useCallback(
    (text: string) =>
      new Promise<string | null>((resolve) => {
        const id = rideRef.current;
        const t = text.trim();
        if (!id) return resolve('A conversa já não está disponível.');
        if (!t) return resolve(null);
        const s = getSocket();
        if (!s.connected) return resolve('Sem ligação ao servidor.');
        s.timeout(8000).emit('chat:send', { rideId: id, text: t }, (err: Error | null, res?: Ack<{ message: ChatMessage }>) => {
          if (err || !res) return resolve('A mensagem não foi enviada. Tente de novo.');
          if (!res.ok) return resolve(res.error || 'A mensagem não foi enviada.');
          if (validMsg(res.message)) add([res.message]);
          resolve(null);
        });
      }),
    [add],
  );

  const sendTyping = useCallback(() => {
    const id = rideRef.current;
    const now = Date.now();
    if (!id || now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = now;
    getSocket().emit('chat:typing', { rideId: id });
  }, []);

  const same = st.rideId === rideId;
  return {
    messages: same ? st.messages : [],
    unread: same && !open ? st.unread : 0,
    typing: same && st.typing,
    send,
    sendTyping,
  };
}
