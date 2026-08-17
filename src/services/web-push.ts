import { httpClient } from '../clients/http-client';

export const webPushService = {
  subscribe: async (subscription: PushSubscription) => {
    const json = subscription.toJSON();

    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error('Invalid push subscription');
    }

    await httpClient.post('/push/subscribe-web', {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    });
  },

  unsubscribe: async (endpoint: string) => {
    await httpClient.delete('/push/unsubscribe-web', {
      params: { endpoint },
    });
  },
};
