import { differenceInDays, format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function getSupportedAudioMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

export function formatLastSeen(date: string | Date) {
  const lastSeen = new Date(date);
  const days = differenceInDays(new Date(), lastSeen);

  if (days === 0) {
    return formatDistanceToNow(lastSeen, {
      locale: es,
    });
  }

  if (days === 1) {
    return `ayer a las ${format(lastSeen, 'HH:mm')}`;
  }

  if (days < 7) {
    return format(lastSeen, "EEEE 'a las' HH:mm", {
      locale: es,
    });
  }

  return format(lastSeen, "d 'de' MMMM 'a las' HH:mm", {
    locale: es,
  });
}
