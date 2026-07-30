import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/colors';
import NavBar from '../components/NavBar';
import ErrorBoundary from '../components/ErrorBoundary';

function useWebChrome() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.title = 'Labor Day Cabin Finder';

    const style = document.createElement('style');
    style.textContent = `
      [data-hover="card"] { transition: box-shadow .15s ease, border-color .15s ease, transform .15s ease; }
      [data-hover="card"]:hover { box-shadow: 0 6px 20px rgba(31,42,39,.13); border-color: ${Colors.primaryLight} !important; transform: translateY(-2px); }
      [data-hover="chip"] { transition: transform .1s ease, filter .15s ease; }
      [data-hover="chip"]:hover { transform: scale(1.05); filter: brightness(.96); }
      [data-hover="btn"] { transition: transform .1s ease, opacity .15s ease; }
      [data-hover="btn"]:hover { transform: scale(1.04); opacity: .9; }
      [data-hover="icon"] { transition: transform .15s ease; }
      [data-hover="icon"]:hover { transform: scale(1.15); }
      [data-hover="nav"] { transition: background-color .15s ease; }
      [data-hover="nav"]:hover { background-color: ${Colors.secondary}; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);
}

export default function RootLayout() {
  useWebChrome();

  const headerOptions = {
    headerShown: true,
    headerBackTitle: 'Back',
    headerStyle: { backgroundColor: Colors.background },
    headerTintColor: Colors.primary,
  } as const;

  return (
    <ErrorBoundary>
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <StatusBar style="dark" />
        {Platform.OS === 'web' && <NavBar />}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="trip" options={{ ...headerOptions, headerTitle: 'The Trip' }} />
          <Stack.Screen name="keeps" options={{ ...headerOptions, headerTitle: 'Keeps' }} />
          <Stack.Screen name="banned" options={{ ...headerOptions, headerTitle: 'Banned' }} />
          <Stack.Screen name="profile" options={{ ...headerOptions, headerTitle: 'You' }} />
          <Stack.Screen name="listing/[id]" options={{ ...headerOptions, headerTitle: '' }} />
          <Stack.Screen name="admin" options={{ ...headerOptions, headerTitle: 'Admin' }} />
        </Stack>
      </View>
    </ErrorBoundary>
  );
}
