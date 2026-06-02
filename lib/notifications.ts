import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId() {
  return (
    (Constants.expoConfig?.extra as any)?.eas?.projectId ||
    (Constants.easConfig as any)?.projectId ||
    null
  );
}

export async function registerForPushNotifications(userId: string) {
  if (!userId || !Device.isDevice) return { token: null, error: null };

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'TeeMate alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#D7FF45',
      });
    }

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return { token: null, error: null };

    const projectId = getProjectId();
    const tokenResult = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResult.data;

    const { error } = await supabase.from('user_push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_push_token' }
    );

    return { token, error };
  } catch (error: any) {
    console.log('Push registration error:', error?.message ?? error);
    return { token: null, error };
  }
}

export async function sendPushNotification(input: {
  recipientIds: string[];
  actorId: string;
  title: string;
  body: string;
  type: 'message' | 'group_message' | 'connection_request' | 'match' | 'group_invite' | 'round_update';
  data?: Record<string, any>;
}) {
  const recipientIds = [...new Set(input.recipientIds.filter((id) => id && id !== input.actorId))];
  if (!recipientIds.length) return { data: null, error: null };

  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: {
      recipientIds,
      actorId: input.actorId,
      title: input.title,
      body: input.body,
      type: input.type,
      data: input.data ?? {},
    },
  });

  if (error) console.log('Push send error:', error.message);
  return { data, error };
}
