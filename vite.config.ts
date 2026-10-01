import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const repoName = 'test-programming-language';
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const base = isGitHubPages ? `/${repoName}/` : '/';
const appId = `${base}language-lab`;
const startUrl = `${base}?source=pwa`;

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'language-lab.webmanifest',
      includeAssets: [
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-192x192.png',
        'pwa-maskable-512x512.png'
      ],
      manifest: {
        id: appId,
        name: 'Language Lab',
        short_name: 'Language Lab',
        description: 'A mobile-friendly IDE for an executable pseudocode programming language.',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        start_url: startUrl,
        scope: base,
        file_handlers: [{ action: `${base}?runner=1`, accept: { 'text/x-language-lab': ['.lang'] } }],
        shortcuts: [{ name: 'Run a .lang file', short_name: 'Run File', url: `${base}?runner=1` }],
        icons: [
          { src: `${base}pwa-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}pwa-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}pwa-maskable-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: `${base}pwa-maskable-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2,webmanifest}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
