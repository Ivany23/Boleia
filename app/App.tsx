import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionBanner } from './src/components/ui';
import { DriverScreen } from './src/screens/DriverScreen';
import { PassengerScreen } from './src/screens/PassengerScreen';
import { StartScreen } from './src/screens/StartScreen';
import { useConnected } from './src/socket';
import type { Profile } from './src/types';

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const connected = useConnected();

  const content = (
    <View style={{ flex: 1 }}>
      {!profile ? (
        <StartScreen onStart={setProfile} />
      ) : profile.role === 'passenger' ? (
        <PassengerScreen profile={profile} onExit={() => setProfile(null)} />
      ) : (
        <DriverScreen profile={profile} onExit={() => setProfile(null)} />
      )}
      <ConnectionBanner connected={connected} />
      <StatusBar style="dark" />
    </View>
  );

  return (
    <SafeAreaProvider>
      {Platform.OS === 'web' ? (
        // No computador, a app aparece centrada com largura de telemóvel
        <View style={{ flex: 1, backgroundColor: '#06512F', alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: 480, backgroundColor: '#F4F7F5' }}>{content}</View>
        </View>
      ) : (
        content
      )}
    </SafeAreaProvider>
  );
}
