import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
  server: { fs: { allow: ['..'] }, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 6000, assetsInlineLimit: 0 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // public/manifest.webmanifest is authored by hand (ui owner)
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/ws/],
        runtimeCaching: [
          { urlPattern: /\/assets\/.*\.(glb|ktx2|bin|png|jpg)$/, handler: 'CacheFirst',
            options: { cacheName: 'aetherion-models', expiration: { maxEntries: 400 } } },
        ],
      },
    }),
  ],
});
