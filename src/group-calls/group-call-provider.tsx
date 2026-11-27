import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LocalTrack, Room } from 'livekit-client';
import { isAxiosError } from 'axios';

import { useChatContext } from '../context/chat-context';
import { useUserContext } from '../context/user-context';
import { useCallContext } from '../context/call-context';
import { isTerminal } from '../types/call';
import { wsClient } from '../clients/websocket-client';
import type { CallMedia } from '../types/call';
import { groupCallApi } from './api';
import { recoverGroupRoom, trackGroupMedia } from './group-room-recovery';
import { GroupCallContext } from './group-call-context';
import type { GroupCallScreen, GroupCallView } from './group-call-context';
import { releaseGroupCall, reserveGroupCall } from './occupancy';
import {
  connectGroupRoom,
  createGroupRoom,
  subscribeToForeground,
} from './room-platform';
import type { GroupCall, GroupCallAction, GroupCallTarget } from './types';
import { useGroupCallAlerts } from './group-call-alerts';
import type { Conversation } from '../types/conversation';
import { prepareGroupMedia, publishGroupMedia } from './group-media';

type Session = {
  call?: GroupCallTarget;
  room?: Room;
  abort: AbortController;
  tracks: LocalTrack[];
  opening?: Promise<void>;
  recovery?: Promise<void>;
  close?: Promise<void>;
  attemptedConnection: boolean;
  joined: boolean;
  closing: boolean;
};

function canUseGroup(conversation: Conversation | null | undefined, userId?: string) {
  return (
    !!conversation &&
    conversation.type === 'GROUP' &&
    !conversation.invitation &&
    !conversation.isDeleted &&
    conversation.members.some(
      (member) => member.userId === userId && !member.softDeletedAt,
    )
  );
}

function connectionError(error: unknown, connectingMedia: boolean) {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status === 404) return 'La llamada ya no está disponible.';
  if (status === 403) return 'Ya no tienes acceso a la llamada.';
  if (status === 503) return 'El servicio de llamadas no está disponible.';
  return connectingMedia
    ? 'No se pudo establecer la conexión de audio y video. Vuelve a intentarlo.'
    : 'No se pudo abrir la llamada grupal. Vuelve a intentarlo.';
}

export function GroupCallProvider({ children }: { children: ReactNode }) {
  const { activeConversation, conversations } = useChatContext();
  const { user } = useUserContext();
  const { call } = useCallContext();
  const individualBusy =
    !!call && (call.status === 'requesting' || !isTerminal(call.status));
  const userId = user?.id;
  const groupEnabled = true;
  const available = groupEnabled && canUseGroup(activeConversation, userId);
  const groupId = available ? activeConversation?.id : undefined;

  const sessionRef = useRef<Session | null>(null);
  const statusVersions = useRef(new Map<string, number>());
  const closedCalls = useRef(new Set<string>());
  const mounted = useRef(false);
  const [activeCalls, setActiveCalls] = useState<Map<string, GroupCall>>(() => new Map());
  const [view, setView] = useState<GroupCallView | null>(null);
  const [screen, setScreen] = useState<GroupCallScreen | null>(null);
  const [invitation, setInvitation] = useState<
    (GroupCall & { groupName?: string }) | null
  >(null);
  const [ringbackUntil, setRingbackUntil] = useState<number | null>(null);
  const dismissedRings = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => {
    setScreen(null);
    setError(null);
  }, []);
  const [statusRequest, setStatusRequest] = useState(0);

  const stopSession = useCallback(
    (session: Session, notifyServer = false, failure?: string) => {
      if (session.close) return session.close;
      session.closing = true;
      session.abort.abort();
      session.tracks.forEach((track) => track.stop());
      if (mounted.current) {
        setView(null);
        setRingbackUntil(null);
        setError(failure ?? null);
        if (!failure) setScreen(null);
      }
      session.close = (async () => {
        // Cancel an in-flight Room.connect before waiting for the opening task.
        await session.room?.disconnect().catch(() => {});
        await session.opening?.catch(() => {});
        await session.recovery?.catch(() => {});
        if (notifyServer && session.attemptedConnection && session.call) {
          await groupCallApi.leave(session.call).catch(() => {});
        }
      })().finally(() => {
        if (sessionRef.current === session) {
          sessionRef.current = null;
          releaseGroupCall();
          if (mounted.current) {
            setBusy(false);
            setEnding(false);
            setStatusRequest((value) => value + 1);
          }
        }
      });
      return session.close;
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const session = sessionRef.current;
      if (session) void stopSession(session, true);
    };
  }, [stopSession]);

  useEffect(() => {
    if (!groupId) return;
    const conversationId = groupId;
    let pending: AbortController | undefined;
    function refresh() {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      const version = statusVersions.current.get(conversationId);
      void groupCallApi.getActive(conversationId, controller.signal).then(
        (call) => {
          if (
            controller.signal.aborted ||
            version !== statusVersions.current.get(conversationId)
          )
            return;
          setActiveCalls((current) => {
            const next = new Map(current);
            if (call && !closedCalls.current.has(call.id)) next.set(conversationId, call);
            else next.delete(conversationId);
            return next;
          });
        },
        () => {},
      );
    }
    const unsubscribeForeground = subscribeToForeground(refresh);
    refresh();
    return () => {
      pending?.abort();
      unsubscribeForeground();
    };
  }, [groupId, statusRequest]);

  const updateCall = useCallback((call: GroupCall) => {
    const { conversationId } = call;
    const versions = statusVersions.current;
    versions.set(conversationId, (versions.get(conversationId) ?? 0) + 1);
    setActiveCalls((current) => {
      const existing = current.get(conversationId);
      if (existing && Date.parse(existing.createdAt) > Date.parse(call.createdAt))
        return current;
      const next = new Map(current);
      next.set(conversationId, call);
      return next;
    });
  }, []);

  const clearCall = useCallback(
    ({ id, conversationId }: Pick<GroupCall, 'id' | 'conversationId'>) => {
      const closed = closedCalls.current;
      closed.add(id);
      // Keep recently closed rooms from being restored by a late join or status response.
      if (closed.size > 128) {
        const oldest = closed.values().next().value;
        if (oldest) closed.delete(oldest);
      }
      const versions = statusVersions.current;
      versions.set(conversationId, (versions.get(conversationId) ?? 0) + 1);
      setActiveCalls((current) => {
        if (current.get(conversationId)?.id !== id) return current;
        const next = new Map(current);
        next.delete(conversationId);
        return next;
      });
      setInvitation((current) => (current?.id === id ? null : current));
    },
    [],
  );

  useEffect(() => {
    const offStarted = wsClient.on('GROUP_CALL_STARTED', ({ call, groupName }) => {
      if (closedCalls.current.has(call.id)) return;
      updateCall(call);
      if (
        groupEnabled &&
        userId &&
        call.startedBy !== userId &&
        !!call.ringingUntil &&
        Date.parse(call.ringingUntil) > Date.now() &&
        !dismissedRings.current.has(call.id) &&
        !individualBusy &&
        !sessionRef.current
      ) {
        setInvitation({ ...call, groupName });
      }
    });
    const offEnded = wsClient.on('GROUP_CALL_ENDED', ({ call }) => {
      clearCall(call);
      const session = sessionRef.current;
      if (session?.call?.id === call.id) void stopSession(session);
    });
    const offRingClosed = wsClient.on('GROUP_CALL_RING_CLOSED', ({ callId }) => {
      const dismissed = dismissedRings.current;
      dismissed.add(callId);
      if (dismissed.size > 128) {
        const oldest = dismissed.values().next().value;
        if (oldest) dismissed.delete(oldest);
      }
      setInvitation((current) => (current?.id === callId ? null : current));
      if (sessionRef.current?.call?.id === callId) setRingbackUntil(null);
    });
    return () => {
      offStarted();
      offEnded();
      offRingClosed();
    };
  }, [clearCall, groupEnabled, individualBusy, stopSession, updateCall, userId]);

  const selectedCall = (groupId && activeCalls.get(groupId)) || null;
  const invitedGroup = invitation
    ? activeConversation?.id === invitation.conversationId
      ? activeConversation
      : conversations.get(invitation.conversationId)
    : undefined;
  const incoming =
    invitation &&
    activeCalls.get(invitation.conversationId)?.id === invitation.id &&
    !screen &&
    !individualBusy &&
    !busy &&
    canUseGroup(invitedGroup, userId)
      ? {
          title: invitedGroup?.name || invitation.groupName || 'Grupo',
          media: invitation.media,
        }
      : null;
  const sessionGroup = view
    ? activeConversation?.id === view.call.conversationId
      ? activeConversation
      : conversations.get(view.call.conversationId)
    : undefined;
  const ownRole = sessionGroup?.members.find(
    (entry) => entry.userId === user?.id && !entry.softDeletedAt,
  )?.role;
  const canEnd =
    !!view && !!user && (view.call.startedBy === user.id || ownRole === 'OWNER');

  function connect(
    conversationId: string,
    title: string,
    media: CallMedia,
    target: GroupCallTarget | null,
    fromNotification = false,
  ) {
    if (individualBusy || sessionRef.current || !reserveGroupCall()) return;
    setBusy(true);
    setError(null);
    setInvitation(null);
    setScreen({ title, media: target?.media ?? media });
    if (!target) setRingbackUntil(Date.now() + 60_000);
    const session: Session = {
      call: target ?? undefined,
      abort: new AbortController(),
      tracks: [],
      attemptedConnection: false,
      joined: false,
      closing: false,
    };
    sessionRef.current = session;

    session.opening = (async () => {
      const { signal } = session.abort;
      const prepared = await prepareGroupMedia(media === 'video', signal);
      if (signal.aborted) {
        prepared.tracks.forEach((track) => track.stop());
        return;
      }
      session.tracks = prepared.tracks;
      const room = await createGroupRoom(
        (reason) => {
          if (session.closing) return;
          if (reason === 'room-ended' && session.call) clearCall(session.call);
          if (!session.joined && reason !== 'room-ended') return;
          if (reason !== 'unexpected') {
            void stopSession(session);
            return;
          }
          const { call, abort: { signal } } = session;
          if (!call || session.recovery) return;
          setView((current) => current && { ...current, reconnecting: true });
          session.recovery = recoverGroupRoom(
            room,
            call,
            getMedia(),
            signal,
            (url, token) => connectGroupRoom(room, url, token, signal, () => {}),
          ).then((initialMediaError) => {
            if (signal.aborted) return;
            setView((current) => current && {
              ...current,
              reconnecting: false,
              initialMediaError: initialMediaError ?? current.initialMediaError,
            });
          }).finally(() => {
            session.recovery = undefined;
          });
          void session.recovery.catch((error: unknown) => {
            if (signal.aborted) return;
            const status = isAxiosError(error) ? error.response?.status : undefined;
            if (status === 404) clearCall(call);
            void stopSession(
              session,
              false,
              status === 403 || status === 404
                ? connectionError(error, true)
                : 'Se perdió la conexión de audio y video.',
            );
          });
        },
        () => {
          if (!session.closing) setRingbackUntil(null);
        },
      );
      if (session.closing) {
        await room.disconnect();
        return;
      }
      session.room = room;
      const getMedia = trackGroupMedia(room);
      const access = target
        ? await groupCallApi.join(target, fromNotification, session.abort.signal)
        : await groupCallApi.start(conversationId, media);
      if (session.closing) return;
      session.call = access.call;
      setRingbackUntil(
        access.created && access.call.ringingUntil && !dismissedRings.current.has(access.call.id)
          ? Date.parse(access.call.ringingUntil)
          : null,
      );
      if (closedCalls.current.has(access.call.id)) {
        throw new Error('The room ended before its access response arrived');
      }
      updateCall(access.call);
      setScreen({ title, media: access.call.media });
      if (access.call.media === 'audio') {
        for (const track of prepared.tracks) {
          if (track.kind === 'video') track.stop();
        }
        prepared.tracks = prepared.tracks.filter((track) => track.kind === 'audio');
        session.tracks = prepared.tracks;
      }
      const view = { title, call: access.call, room, preparingMedia: true };
      setView(view);
      session.attemptedConnection = true;
      await connectGroupRoom(room, access.url, access.token, signal, () => {
        setView({ ...view, tryingRelay: true });
      });
      if (signal.aborted) return;
      session.joined = true;
      if (room.remoteParticipants.size) setRingbackUntil(null);
      setView(view);
      void publishGroupMedia(room, prepared, signal).then((initialMediaError) => {
        if (!signal.aborted)
          setView((current) => current && { ...current, preparingMedia: false, initialMediaError });
      });
    })();
    void session.opening.catch((cause: unknown) => {
      if (session.closing) return;
      const status = isAxiosError(cause) ? cause.response?.status : undefined;
      if (target && status === 404) clearCall(target);
      const alreadyClosed = session.call && closedCalls.current.has(session.call.id);
      void stopSession(
        session,
        session.attemptedConnection && !alreadyClosed,
        alreadyClosed
          ? 'La llamada ya no está disponible.'
          : connectionError(cause, !!session.room && !!session.call),
      );
    });
  }

  function open(media: CallMedia) {
    if (groupId && activeConversation) {
      connect(groupId, activeConversation.name || 'Grupo', media, selectedCall);
    }
  }

  function acceptIncoming() {
    if (invitation && incoming) {
      connect(
        invitation.conversationId,
        incoming.title,
        invitation.media,
        invitation,
        true,
      );
    }
  }

  function dismissIncoming() {
    if (!invitation) return;
    dismissedRings.current.add(invitation.id);
    setInvitation(null);
    void groupCallApi.decline(invitation).catch(() => {});
  }

  function onNotificationAction(action: GroupCallAction) {
    if (!userId || !groupEnabled) return;
    if (action.action === 'reject') {
      dismissedRings.current.add(action.id);
      setInvitation((current) => (current?.id === action.id ? null : current));
      void groupCallApi.decline(action).catch(() => {});
      return;
    }
    const group = conversations.get(action.conversationId);
    connect(
      action.conversationId,
      group?.name || action.groupName || 'Grupo',
      action.media,
      action,
      true,
    );
  }

  const invitationDeadline = invitation?.ringingUntil;
  useEffect(() => {
    if (!invitationDeadline) return;
    const timer = setTimeout(
      () => setInvitation(null),
      Math.max(0, Date.parse(invitationDeadline) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [invitationDeadline, invitation?.id]);

  useEffect(() => {
    if (!ringbackUntil) return;
    const timer = setTimeout(
      () => setRingbackUntil(null),
      Math.max(0, ringbackUntil - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [ringbackUntil]);

  useGroupCallAlerts({
    incoming:
      incoming && invitation ? { ...invitation, groupName: incoming.title } : null,
    outgoing: !!ringbackUntil && !individualBusy,
    enabled: !!userId && groupEnabled,
    onAction: onNotificationAction,
  });

  function leave() {
    const session = sessionRef.current;
    if (session) void stopSession(session, true);
  }

  function end() {
    const session = sessionRef.current;
    if (!session?.call || session.closing || !canEnd || ending) return;
    const call = session.call;
    setEnding(true);
    void groupCallApi.end(call).then(
      () => {
        if (mounted.current) clearCall(call);
        void stopSession(session);
      },
      () => {
        if (session.closing) return;
        setEnding(false);
        setError('No se pudo finalizar la llamada para todos.');
      },
    );
  }

  return (
    <GroupCallContext.Provider
      value={{
        available,
        active: selectedCall,
        view,
        screen,
        incoming,
        acceptIncoming,
        dismissIncoming,
        busy,
        individualBusy,
        canEnd,
        ending,
        error,
        open,
        leave,
        end,
        clearError,
      }}
    >
      {children}
    </GroupCallContext.Provider>
  );
}
