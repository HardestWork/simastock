/**
 * Hook to manage Web Push notification subscription lifecycle.
 *
 * Provides `subscribe()` / `unsubscribe()` + state about browser support,
 * current permission, and active subscription status.
 */
import { useState, useEffect, useCallback } from 'react';
import apiClient from '@/api/client';

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);

    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    if (supported) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      const reg = await navigator.serviceWorker.ready;

      // Fetch VAPID public key from backend
      const { data } = await apiClient.get<{ vapid_public_key: string }>('push/vapid-key/');
      if (!data.vapid_public_key) return false;

      const applicationServerKey = urlBase64ToArrayBuffer(data.vapid_public_key);

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Register subscription on backend
      await apiClient.post('push/subscribe/', subscription.toJSON());
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Push subscribe error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await apiClient.post('push/unsubscribe/', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error('Push unsubscribe error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe };
}
