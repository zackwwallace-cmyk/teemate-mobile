import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function routeFromNotification(response: Notifications.NotificationResponse | null | undefined) {
  const rawRoute = response?.notification.request.content.data?.route;
  if (typeof rawRoute !== 'string' || !rawRoute.startsWith('/')) return '/chats';

  const allowedPrefixes = ['/chat/', '/group-chat/', '/round-chat/', '/golfer/'];
  const allowedRoutes = ['/chats', '/discover', '/rounds', '/feed', '/profile', '/support'];
  if (allowedRoutes.includes(rawRoute) || allowedPrefixes.some((prefix) => rawRoute.startsWith(prefix))) return rawRoute;

  return '/chats';
}

function NotificationRouter() {
  const router = useRouter();
  const lastHandledId = useRef<string | null>(null);

  function openNotificationRoute(response: Notifications.NotificationResponse | null | undefined) {
    const notificationId = response?.notification.request.identifier ?? null;
    if (notificationId && lastHandledId.current === notificationId) return;
    if (notificationId) lastHandledId.current = notificationId;

    const route = routeFromNotification(response);
    router.push(route as any);
  }

  useEffect(() => {
    let active = true;

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) openNotificationRoute(response);
      })
      .catch((error) => console.log('Notification route restore error:', error?.message ?? error));

    const subscription = Notifications.addNotificationResponseReceivedListener(openNotificationRoute);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NotificationRouter />
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
