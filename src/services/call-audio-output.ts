interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

type AudioRoute = 'speaker' | 'earpiece';
type PhoneOutputs = Record<AudioRoute, string>;

export interface AudioOutputSnapshot {
  canToggle: boolean;
  route?: AudioRoute;
  busy: boolean;
  error?: string;
}

function normalizeLabel(label: string) {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Browser labels have no standard device type. Recognize explicit built-in names only. */
function getOutputRoute(device: AudioOutputDevice): AudioRoute | undefined {
  if (!device.deviceId || device.deviceId === 'default' || device.deviceId === 'communications')
    return;
  const label = normalizeLabel(device.label);
  if (
    /^(?:(?:built in|internal|integrated|iphone) )?(?:speaker|speakers|loudspeaker|speakerphone|altavoz|altavoces)(?: (?:built in|internal|integrated|integrado|integrados|interno|internos))?$/.test(
      label,
    )
  )
    return 'speaker';
  if (
    /^(?:(?:built in|internal|integrated|iphone) )?(?:earpiece|receiver|handset|auricular interno|receptor|auricular del telefono)(?: (?:built in|internal|integrated|integrado|interno))?$/.test(
      label,
    )
  )
    return 'earpiece';
}

function findOutput(devices: AudioOutputDevice[], route: AudioRoute) {
  const matches = devices.filter((device) => getOutputRoute(device) === route);
  // Ambiguous labels should not silently select an unrelated output.
  return matches.length === 1 ? matches[0].deviceId : undefined;
}

/** A phone toggle is available only with two distinct, identifiable output IDs. */
export function getPhoneAudioOutputs(devices: AudioOutputDevice[]): PhoneOutputs | undefined {
  const speaker = findOutput(devices, 'speaker');
  const earpiece = findOutput(devices, 'earpiece');
  if (speaker && earpiece && speaker !== earpiece) return { speaker, earpiece };
}

/** Owns capability detection and routes only the remote media element. */
export function createCallAudioOutput() {
  const mediaDevices = navigator.mediaDevices;
  const supported =
    typeof HTMLMediaElement !== 'undefined' &&
    typeof HTMLMediaElement.prototype.setSinkId === 'function';
  let snapshot: AudioOutputSnapshot = { canToggle: false, busy: false };
  let element: HTMLMediaElement | null = null;
  let devices: AudioOutputDevice[] = [];
  let phoneOutputs: PhoneOutputs | undefined;
  let desired: AudioRoute = 'speaker';
  let selectedId: string | undefined;
  let active = false;
  let generation = 0;
  let refreshId = 0;
  const listeners = new Set<() => void>();

  function publish(patch: Partial<AudioOutputSnapshot> = {}) {
    const route =
      phoneOutputs && selectedId === phoneOutputs.speaker
        ? 'speaker'
        : phoneOutputs && selectedId === phoneOutputs.earpiece
          ? 'earpiece'
          : undefined;
    snapshot = { ...snapshot, ...patch, route, canToggle: supported && !!phoneOutputs && !!route };
    listeners.forEach((listener) => listener());
  }

  function targetId() {
    return phoneOutputs?.[desired] ?? findOutput(devices, 'speaker') ?? '';
  }

  async function routeOutput() {
    if (!active || !element || !supported || snapshot.busy) return;
    const current = element;
    const currentGeneration = generation;
    const target = targetId();
    if (selectedId === target) return;
    publish({ busy: true, error: undefined });
    try {
      await current.setSinkId(target);
      if (active && generation === currentGeneration && current === element) {
        selectedId = target;
        publish();
      }
    } catch (error) {
      if (active && generation === currentGeneration && current === element) {
        if (target === targetId()) desired = snapshot.route ?? 'speaker';
        publish({
          error:
            error instanceof DOMException && error.name === 'NotAllowedError'
              ? 'El navegador no permitió cambiar la salida de audio.'
              : 'No se pudo cambiar la salida de audio. Vuelve a intentarlo.',
        });
      }
    } finally {
      if (active && generation === currentGeneration) {
        publish({ busy: false });
        // Serialize hot-plug and element changes that happened during setSinkId.
        if (current !== element || target !== targetId()) await routeOutput();
      }
    }
  }

  async function toggle() {
    if (!snapshot.canToggle || snapshot.busy) return;
    desired = snapshot.route === 'speaker' ? 'earpiece' : 'speaker';
    await routeOutput();
  }

  async function refresh() {
    if (!active || !supported || !mediaDevices?.enumerateDevices) return;
    const id = ++refreshId;
    try {
      const available = await mediaDevices.enumerateDevices();
      if (!active || id !== refreshId) return;
      devices = available.filter((device) => device.kind === 'audiooutput');
      phoneOutputs = getPhoneAudioOutputs(devices);
      if (!phoneOutputs) desired = 'speaker';
      publish();
      await routeOutput();
    } catch {
      if (active && id === refreshId) {
        // A stale pair must not leave the toggle visible after detection fails.
        devices = [];
        phoneOutputs = undefined;
        desired = 'speaker';
        publish();
        await routeOutput();
      }
    }
  }

  function attach(next: HTMLMediaElement | null) {
    if (element === next) return;
    element = next;
    selectedId = undefined;
    publish();
    if (next && active) void routeOutput();
  }

  function start() {
    active = true;
    generation++;
    const onChange = () => {
      void refresh();
    };
    mediaDevices?.addEventListener?.('devicechange', onChange);
    void refresh();
    return () => {
      active = false;
      generation++;
      refreshId++;
      devices = [];
      phoneOutputs = undefined;
      desired = 'speaker';
      selectedId = undefined;
      mediaDevices?.removeEventListener?.('devicechange', onChange);
      publish({ busy: false, error: undefined });
    };
  }

  return {
    attach,
    start,
    refresh,
    toggle,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
