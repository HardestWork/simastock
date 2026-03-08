import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',           // on gère la mise à jour manuellement
        injectRegister: 'auto',
        includeAssets: ['pwa-192.png', 'pwa-512.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'SimaStock — Gestion Commerciale',
          short_name: 'SimaStock',
          description: 'Système de gestion boutique — ventes, livraisons, stock, caisse.',
          theme_color: '#2563eb',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          lang: 'fr',
          categories: ['business', 'finance', 'productivity'],
          icons: [
            {
              src: 'pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Livraisons',
              short_name: 'Livraisons',
              description: 'Voir les livraisons en cours',
              url: '/delivery',
              icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
            },
            {
              name: 'Point de vente',
              short_name: 'POS',
              description: 'Ouvrir le point de vente',
              url: '/pos',
              icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
            },
            {
              name: 'Caisse',
              short_name: 'Caisse',
              description: 'Tableau de bord caisse',
              url: '/cashier',
              icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
            },
          ],
        },
        workbox: {
          // Précache tous les assets statiques générés par Vite
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // Exclure les logos sources (>2MB) du précache — trop lourds pour Workbox
          globIgnores: ['logo-icon.png', 'logo-full.png'],
          // Ne jamais mettre en cache les appels API ni les médias
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/media\//, /^\/admin\//],
          runtimeCaching: [
            {
              // API → Network-first (fraîcheur données prioritaire, fallback cache 24h)
              urlPattern: /^\/api\//i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache-v1',
                networkTimeoutSeconds: 8,
                expiration: {
                  maxEntries: 300,
                  maxAgeSeconds: 60 * 60 * 24, // 24h
                },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              // Médias (photos produits, logos) → Cache-first 7j
              urlPattern: /^\/media\//i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'media-cache-v1',
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              // Google Fonts & CDN externes → Stale-while-revalidate
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'fonts-cache-v1',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
        // En dev, désactiver le SW pour éviter les interférences avec le proxy
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiProxyTarget, changeOrigin: false },
        '/media': { target: apiProxyTarget, changeOrigin: false },
      },
    },
  }
})
