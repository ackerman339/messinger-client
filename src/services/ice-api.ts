import { httpClient } from '@/clients/http-client';

export async function getIceServers(timeout?: number): Promise<RTCIceServer[]> {
  const { data } = await httpClient.get<{ iceServers: RTCIceServer[] }>(
    '/turn/credentials',
    { timeout },
  );
  return data.iceServers;
}
