import { useCallContext } from '@context/call-context';

export function useCallState() {
  const { call } = useCallContext();
  return call;
}
