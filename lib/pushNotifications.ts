import { supabase } from '@/lib/supabase';

type EnablePushArgs = {
  userId?: string | null;
  teacherId?: string | null;
  role?: string;
  deviceName?: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null) {
  if (!buffer) return '';

  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window.btoa(binary);
}

export async function enableJsmsPushNotifications(args: EnablePushArgs = {}) {
  if (typeof window === 'undefined') {
    throw new Error('Push notifications only work in the browser.');
  }

  if (!('Notification' in window)) {
    throw new Error('This browser does not support notifications.');
  }

  if (!('serviceWorker' in navigator)) {
    throw new Error('This browser does not support service workers.');
  }

  if (!('PushManager' in window)) {
    throw new Error('This browser does not support push notifications.');
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!publicKey) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing in .env.local.');
  }

  let permission = Notification.permission;

  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = json.keys?.p256dh || arrayBufferToBase64(subscription.getKey('p256dh'));
  const auth = json.keys?.auth || arrayBufferToBase64(subscription.getKey('auth'));

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Browser subscription was created but keys are missing.');
  }

  const { data, error } = await supabase.rpc('save_jsms_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_id: args.userId || null,
    p_teacher_id: args.teacherId || null,
    p_role: args.role || 'admin',
    p_user_agent: navigator.userAgent,
    p_device_name: args.deviceName || 'Browser device',
  });

  if (error) {
    console.error('save_jsms_push_subscription error:', error);
    throw new Error(error.message);
  }

  console.log('JSMS push subscription saved:', data);

  return {
    ok: true,
    subscriptionId: data,
    endpoint,
  };
}

export async function sendPendingJsmsPushNotifications() {
  const { data, error } = await supabase.functions.invoke('send-jsms-push', {
    body: {},
  });

  if (error) {
    console.error('send-jsms-push invoke error:', error);
    throw new Error(error.message);
  }

  return data;
}
