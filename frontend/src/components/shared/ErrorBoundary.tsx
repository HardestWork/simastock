/** Error boundary component with retry support and stale-chunk auto-reload. */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const RELOAD_KEY = 'eb_chunk_reload';

function isChunkLoadError(error: Error): boolean {
  const msg = error.message ?? '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    error.name === 'ChunkLoadError'
  );
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);

    // Auto-reload once when a stale chunk is detected (new deploy).
    if (isChunkLoadError(error)) {
      const lastReload = sessionStorage.getItem(RELOAD_KEY);
      const now = Date.now();
      // Prevent infinite reload loops: only reload if last reload was >30 s ago.
      if (!lastReload || now - Number(lastReload) > 30_000) {
        sessionStorage.setItem(RELOAD_KEY, String(now));
        window.location.reload();
        return;
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleHardReload = () => {
    sessionStorage.removeItem(RELOAD_KEY);
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isChunk = this.state.error ? isChunkLoadError(this.state.error) : false;

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-8">
          <AlertTriangle size={48} className="text-danger mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {isChunk ? 'Mise a jour detectee' : 'Une erreur est survenue'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md">
            {isChunk
              ? 'Une nouvelle version est disponible. Rechargez la page pour continuer.'
              : (this.state.error?.message ?? 'Erreur inattendue.')}
          </p>
          {isChunk ? (
            <button
              onClick={this.handleHardReload}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
            >
              <RefreshCw size={16} />
              Recharger la page
            </button>
          ) : (
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
            >
              Reessayer
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
