// mobile/lib/notifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// ✅ Konfiguration für eingehende Notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Token abrufen & in Supabase speichern
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.log('Push Notifications benötigen ein physisches Gerät');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push-Benachrichtigungen nicht erlaubt');
    return;
  }

  // Expo Push Token abrufen
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  // ✅ Token in Supabase-Profil speichern
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (userId) {
    await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return token;
}
