/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'virtual:standalone-host' {
  const host: { script: string; style: string };
  export default host;
}
