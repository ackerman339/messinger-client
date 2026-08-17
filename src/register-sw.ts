/// <reference types="vite-plugin-pwa/client" />

import { registerSW } from 'virtual:pwa-register';

export const updateSW = registerSW({
  immediate: true,

  onRegisteredSW(swUrl, registration) {
    console.log('[PWA] Service Worker registered:', swUrl);
    console.log('[PWA] Registration:', registration);
  },

  onRegisterError(error) {
    console.error('[PWA] Error on register Service Worker:', error);
  },
});
