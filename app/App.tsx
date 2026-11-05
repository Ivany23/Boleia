import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { View } from 'react-native';
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

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
