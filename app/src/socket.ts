import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 8000,
    });
  }
  return socket;
}

function subscribe(cb: () => void) {
  const s = getSocket();
  s.on('connect', cb);
  s.on('disconnect', cb);
  s.on('connect_error', cb);
  return () => {
    s.off('connect', cb);
    s.off('disconnect', cb);
    s.off('connect_error', cb);
  };
}

export function useConnected(): boolean {
  return useSyncExternalStore(subscribe, () => getSocket().connected);
}
