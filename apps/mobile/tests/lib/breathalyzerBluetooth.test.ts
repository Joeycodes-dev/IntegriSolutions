import {
  BluetoothLineAssembler,
  createHc06BluetoothTransport,
  isLikelyHc06Name,
  type Hc06BluetoothRuntime,
  type PairedBluetoothDevice,
} from '../../src/services/breathalyzerBluetooth';

const device: PairedBluetoothDevice = {
  id: 'AA:BB:CC:DD:EE:FF',
  address: 'AA:BB:CC:DD:EE:FF',
  name: 'HC-06',
  type: 'CLASSIC',
  bonded: true,
};

function createRuntime() {
  const listeners = new Map<
    string,
    Set<(event: Record<string, unknown>) => void>
  >();
  const nativeModule = {
    isBluetoothAvailable: jest.fn().mockResolvedValue(true),
    isBluetoothEnabled: jest.fn().mockResolvedValue(true),
    getBondedDevices: jest.fn().mockResolvedValue([device]),
    connect: jest.fn().mockResolvedValue(device),
    disconnect: jest.fn().mockResolvedValue(true),
    openBluetoothSettings: jest.fn().mockResolvedValue(true),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
  const runtime: Hc06BluetoothRuntime = {
    nativeModule,
    emitter: {
      addListener(eventName, listener) {
        const eventListeners = listeners.get(eventName) ?? new Set();
        eventListeners.add(listener);
        listeners.set(eventName, eventListeners);
        return {
          remove() {
            eventListeners.delete(listener);
          },
        };
      },
    },
  };

  return {
    runtime,
    emit(eventName: string, event: Record<string, unknown>) {
      for (const listener of listeners.get(eventName) ?? []) listener(event);
    },
  };
}

describe('HC-06 Bluetooth transport', () => {
  it('recognizes common HC-06 carrier names', () => {
    expect(isLikelyHc06Name('HC-06')).toBe(true);
    expect(isLikelyHc06Name('HC-06S')).toBe(true);
    expect(isLikelyHc06Name('ZS-040')).toBe(true);
    expect(isLikelyHc06Name('Officer Radio')).toBe(false);
  });

  it('reassembles JSON split across arbitrary SPP chunks', () => {
    const assembler = new BluetoothLineAssembler();
    const lines: string[] = [];

    expect(
      assembler.push('{"raw":120,"avg":118,"peak":', (line) => lines.push(line)),
    ).toBe(false);
    expect(assembler.push('120,"warm":false}', (line) => lines.push(line))).toBe(false);
    expect(assembler.push('\r\n', (line) => lines.push(line))).toBe(false);

    expect(lines).toEqual(['{"raw":120,"avg":118,"peak":120,"warm":false}']);
  });

  it('emits multiple complete records and retains a partial trailing record', () => {
    const assembler = new BluetoothLineAssembler();
    const lines: string[] = [];
    const emit = (line: string) => lines.push(line);

    assembler.push('{"raw":1}\r\n{"raw":2}\r\n{"raw":', emit);

    expect(lines).toEqual(['{"raw":1}', '{"raw":2}']);
    assembler.push('3}\n', emit);
    expect(lines).toEqual(['{"raw":1}', '{"raw":2}', '{"raw":3}']);
  });

  it('drops an oversized incomplete record to bound memory', () => {
    const assembler = new BluetoothLineAssembler(16);
    const lines: string[] = [];

    expect(
      assembler.push('{"raw":123456789012345', (line) => lines.push(line)),
    ).toBe(true);
    assembler.push('}\n', (line) => lines.push(line));

    expect(lines).toEqual(['}']);
  });

  it('preserves complete records before discarding an oversized fragment', async () => {
    const { runtime, emit } = createRuntime();
    const transport = createHc06BluetoothTransport(device, runtime);
    const lines: string[] = [];
    const errors: string[] = [];
    transport.onLine((line) => lines.push(line));
    transport.onError?.((message) => errors.push(message));

    await transport.connect();
    emit('Hc06Data', {
      address: device.address,
      data: `{"raw":1}\n${'x'.repeat(5000)}`,
    });

    expect(lines).toEqual(['{"raw":1}']);
    expect(errors).toHaveLength(1);
  });

  it('connects, forwards complete SPP lines, and reports disconnects', async () => {
    const { runtime, emit } = createRuntime();
    const transport = createHc06BluetoothTransport(device, runtime);
    const lines: string[] = [];
    const errors: string[] = [];
    transport.onLine((line) => lines.push(line));
    transport.onError?.((message) => errors.push(message));

    await transport.connect();
    emit('Hc06Data', {
      address: device.address,
      data: '{"raw":120,"avg":118,"peak":120,"warm":false}\r\n',
    });
    emit('Hc06Disconnected', {
      address: device.address,
      message: 'HC-06 disconnected.',
    });

    expect(runtime.nativeModule.connect).toHaveBeenCalledWith(device.address);
    expect(lines).toEqual(['{"raw":120,"avg":118,"peak":120,"warm":false}']);
    expect(errors).toEqual(['HC-06 disconnected.']);

    await transport.disconnect();
    expect(runtime.nativeModule.disconnect).toHaveBeenCalledTimes(1);
  });
});
