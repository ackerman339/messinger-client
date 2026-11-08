import { httpClient } from '@/clients/http-client';

export async function getIceServers(): Promise<RTCIceServer[]> {
  const { data } = await httpClient.get<{ iceServers: RTCIceServer[] }>('/turn/credentials');
  return data.iceServers;
}
