import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { AccountMenu } from './components/AccountMenu';
import { ConnectionBanner } from './components/ui';
import { preloadMap } from './map';
import { DriverScreen } from './screens/DriverScreen';
import { PassengerScreen } from './screens/PassengerScreen';
import { StartScreen } from './screens/StartScreen';
import { useConnected } from './socket';
import { saveProfile, type ThemePref } from './storage';
import { isDark, theme } from './theme';
import type { Profile } from './types';

/**
 * Navegação da app:
 *  - com sessão guardada, abre directamente no ecrã do passageiro/motorista
 *    (não volta ao registo ao recarregar a página ou ao tocar em "voltar");
 *  - o botão do canto abre o menu: tema, trocar de papel, terminar sessão.
 */
export function Root({ initialProfile, themePref }: { initialProfile: Profile | null; themePref: ThemePref }) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [draft, setDraft] = useState<Partial<Profile> | null>(null); // dados para pré-preencher o registo
  const [menu, setMenu] = useState(false);
  const connected = useConnected();

  // Velocidade (site): começa já a carregar o Google Maps, mesmo no ecrã de registo
  useEffect(() => {
    preloadMap();
  }, []);

  const start = (p: Profile) => {
    setProfile(p);
    setDraft(null);
    saveProfile(p);
  };

  const content = (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {!profile ? (
        <StartScreen onStart={start} initial={draft ?? undefined} />
      ) : profile.role === 'passenger' ? (
        <PassengerScreen profile={profile} onMenu={() => setMenu(true)} />
      ) : (
        <DriverScreen profile={profile} onMenu={() => setMenu(true)} />
      )}
      {profile && (
        <AccountMenu
          visible={menu}
          profile={profile}
          themePref={themePref}
          onClose={() => setMenu(false)}
          onSwitchRole={() => {
            setMenu(false);
            setDraft({ ...profile, role: profile.role === 'driver' ? 'passenger' : 'driver' });
            setProfile(null);
          }}
          onLogout={() => {
            setMenu(false);
            setDraft(null);
            setProfile(null);
            saveProfile(null);
          }}
        />
      )}
      <ConnectionBanner connected={connected} />
      <StatusBar style={isDark() ? 'light' : 'dark'} />
    </View>
  );

  return Platform.OS === 'web' ? (
    // No computador, a app aparece centrada com largura de telemóvel
    <View style={{ flex: 1, backgroundColor: isDark() ? '#0B110E' : '#06512F', alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 480, backgroundColor: theme.bg }}>{content}</View>
    </View>
  ) : (
    content
  );
}
