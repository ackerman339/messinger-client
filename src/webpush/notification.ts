export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return;
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    console.warn('Notification permission was denied');
    return 'denied';
  }

  const permission = await Notification.requestPermission();

  return permission;
}
