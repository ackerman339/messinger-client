function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function subscribeToPush() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker is not supported');
  }

  if (!('PushManager' in window)) {
    throw new Error('Push API is not supported');
  }

  if (Notification.permission !== 'granted') {
    throw new Error('Notification permission has not been granted');
  }

  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription) {
    return existingSubscription;
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  if (!publicKey) {
    throw new Error('VITE_VAPID_PUBLIC_KEY is not configured');
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  return subscription;
}
