import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
  server: { fs: { allow: ['..'] }, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 6000, assetsInlineLimit: 0 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false, // public/manifest.webmanifest is authored by hand (ui owner)
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,woff2}', 'icons/*.png'],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/ws/],
        runtimeCaching: [
          { urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/.*\.(glb|ktx2|bin|png|jpe?g|webp|json)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'aetherion-assets-v2', cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 160, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true } } },
        ],
      },
    }),
  ],
});
