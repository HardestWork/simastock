/** Heartbeat hook — sends POST every 60s to track user activity. */
import { useEffect, useRef } from 'react';
import apiClient from '@/api/client';
import { useAuthStore } from '@/auth/auth-store';

const HEARTBEAT_INTERVAL = 60_000; // 60 seconds

export function useHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) return;

    const sendHeartbeat = async () => {
      try {
        await apiClient.post('ai/activity/heartbeat/');
      } catch {
        // Silently ignore — non-critical
      }
    };

    // Send immediately on mount
    sendHeartbeat();

    // Then every 60s
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAuthenticated]);
}
