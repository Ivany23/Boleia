import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Appearance, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SERVER_URL } from './src/api';
import { loadProfile, loadThemePref, type ThemePref } from './src/storage';
import { applyTheme } from './src/theme';
import type { Profile } from './src/types';

/** Web: liga cedo ao servidor e à Google (o servidor gratuito pode estar a "acordar"). */
function warmUp() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  for (const href of [SERVER_URL, 'https://maps.googleapis.com', 'https://maps.gstatic.com']) {
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = href;
    l.crossOrigin = '';
    document.head.appendChild(l);
  }
  fetch(`${SERVER_URL}/api/health`).catch(() => {});
}

type Boot = { Root: React.ComponentType<{ initialProfile: Profile | null; themePref: ThemePref }>; profile: Profile | null; pref: ThemePref };

/**
 * Arranque: lê o tema e a sessão guardados, aplica as cores e SÓ DEPOIS carrega
 * os ecrãs (os estilos são criados com as cores do tema escolhido).
 */
export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => {
    warmUp();
    let alive = true;
    (async () => {
      const [pref, profile] = await Promise.all([loadThemePref(), loadProfile()]);
      const mode = pref === 'auto' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : pref;
      applyTheme(mode);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Root } = require('./src/Root') as { Root: Boot['Root'] };
      if (alive) setBoot({ Root, profile, pref });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!boot) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A7A4B' }}>
        <ActivityIndicator color="#FFC629" size="large" />
      </View>
    );
  }
  const { Root } = boot;
  return (
    <SafeAreaProvider>
      <Root initialProfile={boot.profile} themePref={boot.pref} />
    </SafeAreaProvider>
  );
}
