/**
 * Banner that prompts the user to enable push notifications.
 *
 * Shown automatically when:
 * - Browser supports Push + ServiceWorker
 * - Permission is "default" (not yet asked)
 * - User hasn't dismissed it in this session
 */
import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const DISMISSED_KEY = 'push-banner-dismissed';

export default function PushPermissionBanner() {
  const { isSupported, isSubscribed, permission, loading, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === '1');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show banner only if supported, not subscribed, never asked, and not dismissed
    if (isSupported && !isSubscribed && permission === 'default' && !dismissed) {
      // Small delay so it doesn't flash immediately on page load
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
    setVisible(false);
  }, [isSupported, isSubscribed, permission, dismissed]);

  if (!visible) return null;

  const handleEnable = async () => {
    await subscribe();
    setVisible(false);
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  return (
    <div className="mx-3 sm:mx-4 md:mx-6 mt-3 animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3 bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30 rounded-xl px-4 py-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 dark:bg-primary/30 flex items-center justify-center">
          <Bell size={20} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Activer les notifications
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Recevez des alertes en temps reel : stock bas, ventes, ecarts de caisse...
          </p>
        </div>
        <button
          onClick={handleEnable}
          disabled={loading}
          className="flex-shrink-0 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Activation...' : 'Activer'}
        </button>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition"
          title="Plus tard"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
