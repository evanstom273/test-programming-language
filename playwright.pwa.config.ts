import { defineConfig } from '@playwright/test';

// Unlike the development server, this serves the production service worker and
// the exact subpath configuration used by GitHub Pages.
export default defineConfig({
  testDir: './tests/pwa',
  workers: 1,
  timeout: 60_000,
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    env: { GITHUB_PAGES: 'true' },
    url: 'http://127.0.0.1:4175/test-programming-language/',
    reuseExistingServer: false
  }
});
