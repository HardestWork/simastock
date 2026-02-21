import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
  });
}

// When a new deployment changes chunk hashes, stale tabs may fail to load
// lazy-imported modules.  Detect this and force a full page reload so the
// browser fetches the updated index.html (which references the new chunks).
window.addEventListener('error', (event) => {
  const msg = event.message ?? '';
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk')
  ) {
    // Avoid infinite reload loops
    const key = '__chunk_reload';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
    }
  }
});

// Clear the reload flag on successful load
sessionStorage.removeItem('__chunk_reload');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Une erreur est survenue.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
