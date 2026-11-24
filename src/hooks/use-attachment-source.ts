import { useEffect, useState } from 'react';
import { useUserContext } from '@/context/user-context';
import { loadAttachment } from '@/services/attachment-cache';

type LocalSource = { blob: Blob; url: string };
type AttachmentState = { key: string; source?: LocalSource; error?: true };

export function useAttachmentSource(attachmentId: string, contentType: string, enabled = true) {
  const { user } = useUserContext();
  const accountId = user?.id;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AttachmentState>();
  const key = JSON.stringify([accountId, attachmentId, contentType, attempt]);
  const current = state?.key === key ? state : undefined;

  useEffect(() => {
    if (!enabled || !accountId) return;
    let active = true;
    let objectUrl: string | undefined;
    let failed = false;

    function retryAfterReconnect() {
      if (failed) setAttempt((previous) => previous + 1);
    }

    window.addEventListener('online', retryAfterReconnect);
    void loadAttachment(accountId, attachmentId, contentType).then(
      (blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ key, source: { blob, url: objectUrl } });
      },
      () => {
        if (!active) return;
        failed = true;
        setState({ key, error: true });
      },
    );

    return () => {
      active = false;
      window.removeEventListener('online', retryAfterReconnect);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accountId, attachmentId, contentType, enabled, key]);

  return {
    source: enabled ? current?.source : undefined,
    error: enabled && current?.error === true,
    retry: () => setAttempt((previous) => previous + 1),
  };
}
