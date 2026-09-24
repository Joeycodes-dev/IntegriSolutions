import {
  Linking,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from "react-native";

import type { BreathalyzerTransport } from "./breathalyzer";

const HC06_SPP_EVENTS = {
  data: "Hc06Data",
  disconnected: "Hc06Disconnected",
  error: "Hc06Error",
} as const;

const MAX_LINE_LENGTH = 4096;
const HC06_NAME_PATTERN = /(?:^|[^A-Z0-9])(?:HC[\s-]?0?6S?|ZS[\s-]?040)(?:$|[^A-Z0-9])/i;

type EventSubscription = { remove(): void };

type RuntimeEventEmitter = {
  addListener(
    eventName: string,
    listener: (event: Record<string, unknown>) => void,
  ): EventSubscription;
};

export interface Hc06NativeModule {
  isBluetoothAvailable(): Promise<boolean>;
  isBluetoothEnabled(): Promise<boolean>;
  getBondedDevices(): Promise<PairedBluetoothDevice[]>;
  connect(address: string): Promise<PairedBluetoothDevice>;
  disconnect(): Promise<boolean>;
  openBluetoothSettings(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface Hc06BluetoothRuntime {
  nativeModule: Hc06NativeModule;
  emitter: RuntimeEventEmitter;
}

export interface PairedBluetoothDevice {
  id: string;
  address: string;
  name: string;
  type: "CLASSIC" | "LOW_ENERGY" | "DUAL" | "UNKNOWN";
  bonded: boolean;
}

function getNativeRuntime(): Hc06BluetoothRuntime | null {
  const nativeModule = NativeModules.Hc06Bluetooth as
    | Hc06NativeModule
    | undefined;
  if (!nativeModule) return null;

  return {
    nativeModule,
    emitter: new NativeEventEmitter(nativeModule),
  };
}

function requireRuntime(
  runtime: Hc06BluetoothRuntime | null = getNativeRuntime(),
): Hc06BluetoothRuntime {
  if (Platform.OS !== "android" && !runtime) {
    throw new Error("HC-06 connectivity is supported by the Android app only.");
  }
  if (!runtime) {
    throw new Error(
      "The HC-06 native Bluetooth module is unavailable. Rebuild the Android development app; it cannot run in Expo Go.",
    );
  }
  return runtime;
}

export function isLikelyHc06Name(name: string): boolean {
  return HC06_NAME_PATTERN.test(name.trim());
}

function prioritizePairedDevices(devices: PairedBluetoothDevice[]): PairedBluetoothDevice[] {
  return devices
    .filter((device) => device.type !== "LOW_ENERGY")
    .filter((device) => isLikelyHc06Name(device.name))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function ensureAndroidBluetoothReady(
  runtime: Hc06BluetoothRuntime | null = getNativeRuntime(),
): Promise<void> {
  const { nativeModule } = requireRuntime(runtime);

  if (Number(Platform.Version) >= 31) {
    // The app lists already-paired devices and opens an RFCOMM socket; it
    // does not perform nearby discovery, so CONNECT is the only runtime
    // permission required for this flow.
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    const denied = Object.values(result).find(
      (status) => status !== PermissionsAndroid.RESULTS.GRANTED,
    );
    if (denied) {
      throw new Error(
        "Android Bluetooth permission is required to find and connect to the HC-06.",
      );
    }
  }

  if (!(await nativeModule.isBluetoothAvailable())) {
    throw new Error("This Android device does not have Bluetooth hardware.");
  }
  if (!(await nativeModule.isBluetoothEnabled())) {
    throw new Error("Turn on Bluetooth, then pair the HC-06 in Android settings.");
  }
}

export async function getPairedHc06Devices(
  runtime: Hc06BluetoothRuntime | null = getNativeRuntime(),
): Promise<PairedBluetoothDevice[]> {
  await ensureAndroidBluetoothReady(runtime);
  const devices = await requireRuntime(runtime).nativeModule.getBondedDevices();
  return prioritizePairedDevices(devices);
}

export async function openHc06BluetoothSettings(
  runtime: Hc06BluetoothRuntime | null = getNativeRuntime(),
): Promise<void> {
  await requireRuntime(runtime).nativeModule.openBluetoothSettings();
}

export async function openHc06AppSettings(): Promise<void> {
  await Linking.openSettings();
}

export class BluetoothLineAssembler {
  private buffer = "";

  constructor(private readonly maxLineLength = MAX_LINE_LENGTH) {}

  reset(): void {
    this.buffer = "";
  }

  push(chunk: string, emitLine: (line: string) => void): boolean {
    this.buffer += chunk;

    // Emit complete records first. A chunk may contain valid telemetry
    // followed by an oversized partial record; the valid records must not
    // be lost merely because the later partial record exceeds the bound.
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      let line = this.buffer.slice(0, newline);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim()) emitLine(line);
      newline = this.buffer.indexOf("\n");
    }

    if (this.buffer.length > this.maxLineLength) {
      this.buffer = "";
      return true;
    }

    return false;
  }
}

export function createHc06BluetoothTransport(
  device: PairedBluetoothDevice,
  runtime: Hc06BluetoothRuntime | null = getNativeRuntime(),
): BreathalyzerTransport {
  const lineAssembler = new BluetoothLineAssembler();
  const lineListeners = new Set<(line: string) => void>();
  const errorListeners = new Set<(message: string) => void>();
  let dataSubscription: EventSubscription | null = null;
  let disconnectSubscription: EventSubscription | null = null;
  let errorSubscription: EventSubscription | null = null;

  const notifyError = (message: string) => {
    for (const listener of errorListeners) listener(message);
  };

  const handleData = (event: Record<string, unknown>) => {
    if (event.address !== device.address || typeof event.data !== "string") return;
    const overflowed = lineAssembler.push(event.data, (line) => {
      for (const listener of lineListeners) listener(line);
    });
    if (overflowed) {
      notifyError("An oversized HC-06 data record was discarded. Reconnect the device.");
      lineAssembler.reset();
    }
  };

  const handleDisconnect = (event: Record<string, unknown>) => {
    if (event.address !== device.address) return;
    lineAssembler.reset();
    notifyError(
      typeof event.message === "string"
        ? event.message
        : "HC-06 disconnected. Reconnect the device and try again.",
    );
  };

  const handleNativeError = (event: Record<string, unknown>) => {
    if (event.address !== device.address) return;
    lineAssembler.reset();
    notifyError(
      typeof event.message === "string"
        ? event.message
        : "The HC-06 connection failed. Reconnect the device and try again.",
    );
  };

  const removeNativeSubscriptions = () => {
    dataSubscription?.remove();
    disconnectSubscription?.remove();
    errorSubscription?.remove();
    dataSubscription = null;
    disconnectSubscription = null;
    errorSubscription = null;
  };

  return {
    kind: "bluetooth_classic",
    label: `HC-06 Classic • ${device.name}`,
    async connect() {
      const activeRuntime = requireRuntime(runtime);
      lineAssembler.reset();
      removeNativeSubscriptions();

      dataSubscription = activeRuntime.emitter.addListener(
        HC06_SPP_EVENTS.data,
        handleData,
      );
      disconnectSubscription = activeRuntime.emitter.addListener(
        HC06_SPP_EVENTS.disconnected,
        handleDisconnect,
      );
      errorSubscription = activeRuntime.emitter.addListener(
        HC06_SPP_EVENTS.error,
        handleNativeError,
      );

      try {
        await activeRuntime.nativeModule.connect(device.address);
      } catch (error) {
        removeNativeSubscriptions();
        lineAssembler.reset();
        throw error;
      }
    },
    async disconnect() {
      removeNativeSubscriptions();
      lineAssembler.reset();
      await runtime?.nativeModule.disconnect();
    },
    onLine(listener) {
      lineListeners.add(listener);
      return () => lineListeners.delete(listener);
    },
    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
  };
}
