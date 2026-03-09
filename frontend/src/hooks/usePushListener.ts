/**
 * Listens for push notifications received via BroadcastChannel
 * while the app is open, and shows in-app toasts + invalidates
 * alert query caches.
 */
import { useEffect } from 'react';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';

export function usePushListener() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;

    const bc = new BroadcastChannel('push-notifications');

    bc.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        const { title, body } = event.data.payload ?? {};
        if (title) {
          toast.info(`${title}${body ? ` — ${body}` : ''}`);
        }
        // Invalidate unread count and alert list caches
        queryClient.invalidateQueries({ queryKey: ['alerts', 'unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['alerts'] });
      }
    };

    return () => bc.close();
  }, [queryClient]);
}
