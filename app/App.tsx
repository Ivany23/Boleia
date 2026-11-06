import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Appearance, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SERVER_URL } from './src/api';
import { loadProfile, loadThemePref, type ThemePref } from './src/storage';
import { applyTheme } from './src/theme';
import type { Profile } from './src/types';

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

  if (!document.getElementById('boleia-css')) {
    const st = document.createElement('style');
    st.id = 'boleia-css';
    st.textContent = [
      'html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}',
      '[role="button"],[role="radio"],[role="search"]{transition:background-color .22s ease,border-color .22s ease,opacity .22s ease,box-shadow .22s ease;cursor:pointer}',
      '.leaflet-container{font-family:inherit}',
      '.leaflet-control-attribution{font-size:10px;opacity:.75}',
      '@media (prefers-reduced-motion: reduce){*{transition:none!important}}',
    ].join('\n');
    document.head.appendChild(st);
  }
}

type Boot = { Root: React.ComponentType<{ initialProfile: Profile | null; themePref: ThemePref }>; profile: Profile | null; pref: ThemePref };

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
        <ActivityIndicator color="#FFFFFF" size="large" />
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
