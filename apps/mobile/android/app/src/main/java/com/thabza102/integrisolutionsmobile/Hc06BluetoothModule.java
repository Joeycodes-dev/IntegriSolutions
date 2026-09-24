package com.thabza102.integrisolutionsmobile;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

public final class Hc06BluetoothModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "Hc06Bluetooth";
  private static final String EVENT_DATA = "Hc06Data";
  private static final String EVENT_DISCONNECTED = "Hc06Disconnected";
  private static final String EVENT_ERROR = "Hc06Error";
  private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
  private static final Pattern MAC_ADDRESS = Pattern.compile("^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$");
  private static final int READ_BUFFER_BYTES = 512;

  private final ReactApplicationContext reactContext;
  private final ExecutorService connectionExecutor = Executors.newSingleThreadExecutor();
  private final Object connectionLock = new Object();

  @Nullable
  private BluetoothSocket socket;
  @Nullable
  private BluetoothDevice connectedDevice;
  private volatile boolean disconnectRequested;
  private volatile boolean readerRunning;
  private int connectionGeneration;
  private int listenerCount;

  public Hc06BluetoothModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @NonNull
  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @Nullable
  private BluetoothAdapter getBluetoothAdapter() {
    BluetoothManager manager =
        (BluetoothManager) reactContext.getSystemService(Context.BLUETOOTH_SERVICE);
    return manager == null ? null : manager.getAdapter();
  }

  private boolean hasConnectPermission() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
        || reactContext.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
            == PackageManager.PERMISSION_GRANTED;
  }

  private String deviceName(BluetoothDevice device) {
    try {
      String name = device.getName();
      return name == null || name.trim().isEmpty() ? device.getAddress() : name.trim();
    } catch (SecurityException error) {
      return device.getAddress();
    }
  }

  private WritableMap deviceMap(BluetoothDevice device) {
    WritableMap map = Arguments.createMap();
    String name = deviceName(device);
    map.putString("id", device.getAddress());
    map.putString("address", device.getAddress());
    map.putString("name", name);

    int type = device.getType();
    if (type == BluetoothDevice.DEVICE_TYPE_CLASSIC) {
      map.putString("type", "CLASSIC");
    } else if (type == BluetoothDevice.DEVICE_TYPE_LE) {
      map.putString("type", "LOW_ENERGY");
    } else if (type == BluetoothDevice.DEVICE_TYPE_DUAL) {
      map.putString("type", "DUAL");
    } else {
      map.putString("type", "UNKNOWN");
    }

    map.putBoolean("bonded", true);
    return map;
  }

  private void emit(String eventName, WritableMap payload) {
    if (listenerCount <= 0 || !reactContext.hasActiveReactInstance()) {
      return;
    }

    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit(eventName, payload);
  }

  private void closeSocket(@Nullable BluetoothSocket target) {
    if (target == null) {
      return;
    }

    try {
      target.close();
    } catch (IOException ignored) {
      // Closing is best-effort; the read thread will also observe the closed socket.
    }
  }

  private boolean isCurrentConnection(int generation, BluetoothSocket source) {
    synchronized (connectionLock) {
      return connectionGeneration == generation && socket == source;
    }
  }

  private void startReader(BluetoothSocket source, BluetoothDevice device, int generation) {
    Thread reader = new Thread(() -> readLoop(source, device, generation), "Hc06BluetoothReader");
    reader.setDaemon(true);
    reader.start();
  }

  private void readLoop(BluetoothSocket source, BluetoothDevice device, int generation) {
    byte[] buffer = new byte[READ_BUFFER_BYTES];

    try (InputStream input = source.getInputStream()) {
      while (readerRunning && !disconnectRequested && isCurrentConnection(generation, source)) {
        int count = input.read(buffer);
        if (count < 0) {
          break;
        }
        if (count == 0) {
          continue;
        }

        WritableMap payload = Arguments.createMap();
        payload.putString("address", device.getAddress());
        payload.putString("data", new String(buffer, 0, count, StandardCharsets.UTF_8));
        emit(EVENT_DATA, payload);
      }
    } catch (IOException error) {
      if (isCurrentConnection(generation, source) && !disconnectRequested && readerRunning) {
        WritableMap payload = Arguments.createMap();
        payload.putString("address", device.getAddress());
        payload.putString("message", "HC-06 connection lost. Reconnect the device and try again.");
        emit(EVENT_ERROR, payload);
      }
    } finally {
      boolean wasCurrentSocket;
      synchronized (connectionLock) {
        wasCurrentSocket = connectionGeneration == generation && socket == source;
        if (wasCurrentSocket) {
          socket = null;
          connectedDevice = null;
          readerRunning = false;
        }
      }

      if (wasCurrentSocket && !disconnectRequested) {
        WritableMap payload = Arguments.createMap();
        payload.putString("address", device.getAddress());
        payload.putString("message", "HC-06 disconnected.");
        emit(EVENT_DISCONNECTED, payload);
      }
    }
  }

  @ReactMethod
  public void isBluetoothAvailable(Promise promise) {
    promise.resolve(getBluetoothAdapter() != null);
  }

  @ReactMethod
  public void isBluetoothEnabled(Promise promise) {
    try {
      BluetoothAdapter adapter = getBluetoothAdapter();
      promise.resolve(adapter != null && adapter.isEnabled());
    } catch (SecurityException error) {
      promise.reject("E_BLUETOOTH_PERMISSION", "Bluetooth permission was denied.", error);
    }
  }

  @ReactMethod
  public void getBondedDevices(Promise promise) {
    if (!hasConnectPermission()) {
      promise.reject(
          "E_BLUETOOTH_PERMISSION",
          "Android Bluetooth permission is required to list paired devices.");
      return;
    }

    try {
      BluetoothAdapter adapter = getBluetoothAdapter();
      if (adapter == null) {
        promise.reject("E_BLUETOOTH_UNAVAILABLE", "This Android device has no Bluetooth adapter.");
        return;
      }

      Set<BluetoothDevice> devices = adapter.getBondedDevices();
      WritableArray result = Arguments.createArray();
      for (BluetoothDevice device : devices) {
        result.pushMap(deviceMap(device));
      }
      promise.resolve(result);
    } catch (SecurityException error) {
      promise.reject("E_BLUETOOTH_PERMISSION", "Android Bluetooth permission was denied.", error);
    }
  }

  @ReactMethod
  public void connect(String address, Promise promise) {
    if (!hasConnectPermission()) {
      promise.reject(
          "E_BLUETOOTH_PERMISSION",
          "Android Bluetooth permission is required to connect to the HC-06.");
      return;
    }
    if (address == null || !MAC_ADDRESS.matcher(address).matches()) {
      promise.reject("E_HC06_ADDRESS", "The paired HC-06 has an invalid Bluetooth address.");
      return;
    }

    BluetoothAdapter adapter = getBluetoothAdapter();
    if (adapter == null || !adapter.isEnabled()) {
      promise.reject("E_BLUETOOTH_DISABLED", "Turn on Bluetooth and pair the HC-06 first.");
      return;
    }

    final int generation;
    BluetoothSocket previousToClose;
    synchronized (connectionLock) {
      generation = ++connectionGeneration;
      disconnectRequested = false;
      previousToClose = socket;
      socket = null;
      connectedDevice = null;
      readerRunning = false;
    }
    closeSocket(previousToClose);

    connectionExecutor.execute(() -> {
      BluetoothSocket candidate = null;
      try {
        BluetoothDevice device = adapter.getRemoteDevice(address);
        candidate = device.createRfcommSocketToServiceRecord(SPP_UUID);
        candidate.connect();

        boolean cancelled;
        BluetoothSocket previous;
        synchronized (connectionLock) {
          cancelled = generation != connectionGeneration;
          previous = socket;
          if (!cancelled) {
            socket = candidate;
            connectedDevice = device;
            readerRunning = true;
          }
        }

        if (cancelled) {
          closeSocket(candidate);
          promise.reject("E_HC06_CANCELLED", "HC-06 connection was cancelled.");
          return;
        }

        closeSocket(previous);
        startReader(candidate, device, generation);
        promise.resolve(deviceMap(device));
      } catch (IOException | IllegalArgumentException | SecurityException error) {
        closeSocket(candidate);
        boolean stillCurrent;
        synchronized (connectionLock) {
          stillCurrent = generation == connectionGeneration;
          if (stillCurrent && socket == candidate) {
            socket = null;
            connectedDevice = null;
            readerRunning = false;
          }
        }

        if (!stillCurrent) {
          promise.reject("E_HC06_CANCELLED", "HC-06 connection was cancelled.");
          return;
        }

        promise.reject(
            "E_HC06_CONNECT",
            "Could not connect to the HC-06. Confirm it is powered, paired, and not connected elsewhere.",
            error);
      }
    });
  }

  @ReactMethod
  public void disconnect(Promise promise) {
    disconnectRequested = true;
    BluetoothSocket current;
    synchronized (connectionLock) {
      connectionGeneration += 1;
      current = socket;
      socket = null;
      connectedDevice = null;
      readerRunning = false;
    }
    closeSocket(current);
    promise.resolve(true);
  }

  @ReactMethod
  public void openBluetoothSettings(Promise promise) {
    try {
      Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      reactContext.startActivity(intent);
      promise.resolve(true);
    } catch (Exception error) {
      promise.reject("E_BLUETOOTH_SETTINGS", "Could not open Android Bluetooth settings.", error);
    }
  }

  @ReactMethod
  public void addListener(String eventName) {
    listenerCount += 1;
  }

  @ReactMethod
  public void removeListeners(double count) {
    listenerCount = Math.max(0, listenerCount - (int) count);
  }

  @Override
  public void invalidate() {
    disconnectRequested = true;
    synchronized (connectionLock) {
      connectionGeneration += 1;
      closeSocket(socket);
      socket = null;
      connectedDevice = null;
      readerRunning = false;
    }
    connectionExecutor.shutdownNow();
    super.invalidate();
  }
}
