import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="rounds" />
        <Stack.Screen name="discover" />
        <Stack.Screen name="matches" />
        <Stack.Screen name="chats" />
        <Stack.Screen name="feed" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="upgrade" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="support" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="group-chat/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="round-chat/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="golfer/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="delete-account" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
