import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Displays a subtle banner at the top of the screen when the user is offline.
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-white text-sm font-medium shadow">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Mode hors ligne — les données affichées peuvent être en cache.</span>
    </div>
  );
}
