import { createContext, useContext } from 'react';
import type { Room } from 'livekit-client';
import type { CallMedia } from '../types/call';
import type { GroupCall } from './types';

export type GroupCallScreen = {
  title: string;
  media: CallMedia;
};

export type GroupCallView = {
  title: string;
  call: GroupCall;
  room: Room;
  preparingMedia: boolean;
  tryingRelay?: boolean;
  initialMediaError?: string;
};

export type GroupCallContextValue = {
  available: boolean;
  active: GroupCall | null;
  view: GroupCallView | null;
  screen: GroupCallScreen | null;
  incoming: GroupCallScreen | null;
  acceptIncoming: () => void;
  dismissIncoming: () => void;
  busy: boolean;
  individualBusy: boolean;
  canEnd: boolean;
  ending: boolean;
  error: string | null;
  open: (media: CallMedia) => void;
  leave: () => void;
  end: () => void;
  clearError: () => void;
};

export const GroupCallContext = createContext<GroupCallContextValue | undefined>(
  undefined,
);

export function useGroupCall() {
  const context = useContext(GroupCallContext);
  if (!context) throw new Error('useGroupCall requires GroupCallProvider');
  return context;
}
