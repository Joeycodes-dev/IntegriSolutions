# Integriscan Mobile

React Native (Expo) mobile app used by traffic officers for roadside DUI testing.

## Getting Started

1. Install dependencies:
   `npm install`

2. Start the Expo dev server:
   `npx expo start`

3. Run on Android:
   `npm run android`

iOS is **not a supported target**. The app is an Expo project and the `ios` script still exists, but the
breathalyser transport cannot work there — see [Platform support](#platform-support) below.

## Platform support

| Platform | Status | Notes |
|----------|--------|-------|
| **Android** | **Supported** | Current target. Includes the native Bluetooth Classic (SPP) bridge for the HC-06. |
| iOS | Roadmap | Officer capture and the breathalyser device are not supported. |
| Web | Limited | Supervisor/review screens and barcode scanning only. Front-photo OCR and breathalyser capture are disabled (`scanService.web.ts`). |

iOS is a future roadmap item, not a current platform. The HC-06 speaks Bluetooth Classic SPP over RFCOMM,
and iOS apps cannot open arbitrary Bluetooth Classic SPP links, so `breathalyzerBluetooth.ts` throws
`HC-06 connectivity is supported by the Android app only.` on iOS. The `ble` transport kind exists in the
type definitions but has no implementation. Reaching iOS would require BLE hardware with matching firmware,
or an MFi-licensed accessory.

## Backend & on-device OCR

- The app talks to the backend API. Point it with `EXPO_PUBLIC_API_BASE_URL`:
  - Production: `https://integri-backend.smuurt.workers.dev/api` (set in the `eas.json` build profile env for both `preview` and `production`)
  - Local dev: `http://<your-lan-ip>:8787/api` (the built-in fallback assumes the legacy port `4000`)

### Mobile build-time environment

Only `EXPO_PUBLIC_*` values are embedded into the app bundle.

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Yes | Backend API used by login, sync, alerts, chat, scans, and reports. |
| `EXPO_PUBLIC_BREATHALYZER_SIMULATION` | No | Set to `1` to show the **Simulate MQ-3 device** button in non-development builds. Currently set for `preview` **and** `production` — see the warning below. |
| `EXPO_PUBLIC_SUPABASE_URL` | No | Enables Supabase realtime chat/unread updates. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | No | Public anon key paired with `EXPO_PUBLIC_SUPABASE_URL` for realtime only. |

Without the Supabase pair, chat and unread counts still work through REST polling every 12 seconds. The backend `SUPABASE_SERVICE_ROLE_KEY` is a server secret and must never be included in the mobile app. Web-only `VITE_*` values do not affect Android builds.
- Licence front-photo OCR runs **on-device** via `expo-ai-kit` (ML Kit Text Recognition v2 on Android; the iOS path uses Apple Vision but is not a supported target). It requires a dev client or EAS build — it does **not** work in Expo Go.
- The recognised text is posted to `POST /api/scan` (`{ text, retry }`), which parses the licence fields; the PDF417 barcode flow is unchanged.
- Front-photo scanning is disabled on the web target (`scanService.web.ts`); only barcode scanning is available there.

## Build Installable APK (No Expo Dev Server)

You can build an Android APK that installs directly on devices and does not require running `expo start`.

1. Sign in to Expo/EAS (one time):
   `npx eas login`

2. Build APK in the cloud:
   `npm run apk`

3. View recent Android builds:
   `npm run apk:list`

4. Download and install the APK from the build URL shown in the terminal.

NOTE: Just use: npx eas-cli build --platform android --profile preview --non-interactive --no-wait

Local APK build (requires Android SDK, Java 17+, and the local native toolchain):
`npm run apk:local`

This produces `android/app/build/outputs/apk/release/app-release.apk`, which can be copied directly to a phone and installed without waiting for the EAS build queue. Local APK builds use the Cloudflare backend URL from `eas.json` and enable the **Simulate MQ-3 device** button. Set `EXPO_PUBLIC_API_BASE_URL` before running the command to target a different backend.

From the repository root, use:
- `npm run mobile:apk`
- `npm run mobile:apk:list`
- `npm run mobile:apk:local`

## Breathalyzer (MQ-3) integration

The officer testing flow reads BAC from the breathalyzer device instead of generating it in-app.

Full hardware, protocol, timing and verification detail lives in
[`firmware/breathalyzer/docs/TECHNICAL_SPECIFICATION.md`](../../firmware/breathalyzer/docs/TECHNICAL_SPECIFICATION.md),
with diagrams and console wireframes alongside it.

- Device firmware (Arduino + MQ-3 on A0, passive buzzer on D8, HC-06 on D3 RX / D4 TX through a 1 kΩ/2 kΩ divider) prints one JSON line per sample at 9600 baud to USB serial and the HC-06 Bluetooth Classic SPP link:
  `{"raw":512,"avg":498,"peak":640,"sn":"MQ3-0001","vout":2.503,"rs":998,"over":true,"alarm":true,"warm":false}`
  (source: `firmware/breathalyzer/breathalyzer.ino`; wiring and flashing: `firmware/breathalyzer/README.md`)
- `src/services/breathalyzer.ts` parses those lines, converts raw counts to BAC and holds the session state
  (live BAC, session peak, captured reading, calibration).
- `src/services/breathalyzerSimulator.ts` emits the same payload shape for development without hardware.
- `src/services/breathalyzerStorage.ts` persists calibration between launches.
- The reading panel lives in `src/screens/OfficerDashboardScreen.tsx` (reading step). Capture is locked to the
  device: officers press **Capture reading** and the value cannot be edited manually.

Capture uses the **session peak** (highest smoothed reading since the subject session started), because breath
alcohol is the peak of the exhale, not the settling value.

### Chain of custody

Every device-captured reading carries custody fields into the SHA-256 record hash and the synced record:
transport (`bluetooth_classic` / `simulated`), device serial (when reported), calibration version and
clean-air resistance, session peak raw, smoothed raw and instantaneous raw at capture, and the capture
timestamp. The backend accepts `ble`, `bluetooth_classic` and `simulated`, but only `bluetooth_classic`
and `simulated` can currently be produced by the app.

- Legacy records (no device fields) hash exactly as before, so previously captured records stay verifiable.
- The device serial travels in the firmware payload as `"sn"`; add `"sn":"MQ3-0042"` to the Arduino JSON output
  and it is hashed into every record automatically.
- The backend rejects device payloads with an unknown transport, out-of-range sensor values, or a missing
  capture timestamp, and a record whose custody fields change after capture fails hash verification.

**The firmware ships one shared serial.** `breathalyzer.ino` hard-codes `DEVICE_SERIAL = "MQ3-0001"`, so every
unit built from it reports the same serial. The Bluetooth MAC address is not a cryptographic identity. Assign a
unique, controlled serial to each physical unit before enforcement deployment.

Sending device readings requires the Supabase migration `backend/sql/migration_add_device_custody_columns.sql`
to be applied first. Records captured before that migration keep syncing without the device columns.

### Conversion chain

1. `Vout = raw * 5 / 1023`
2. `Rs = RL * (5 - Vout) / Vout` (`RL` = module load resistor, default 1 kΩ)
3. `ratio = (Rs / R0) * 60` (`R0` = sensor resistance in clean air, 60 = MQ-3 clean-air ratio)
4. `C (mg/L) = A * ratio^B` (defaults `A = 0.45`, `B = -0.7`)
5. `BAC (g/100ml) = C * 0.21` (2100:1 blood-to-breath partition ratio)

Calibration lives in `DEFAULT_BREATHALYZER_CALIBRATION`. The **Set clean-air baseline** button records `R0` from
the current clean-air reading and persists it; `A` and `B` are fitted against a reference measurement. Until
that is done the reading is a screening estimate, not evidential-grade.

Three caveats worth knowing before you rely on these numbers (full analysis in the
[field-device specification](../../firmware/breathalyzer/docs/TECHNICAL_SPECIFICATION.md)):

- **`RL = 1 kΩ` is an assumption, not a datasheet value.** The MQ-3 datasheet specifies a 200 kΩ standard load
  resistance (100–470 kΩ for sensitivity calibration). The default `R0` of 7532 Ω is only meaningful if the
  module actually has a 1 kΩ load resistor. Measure the module. The same applies to the firmware's own `rs` field.
- **Clean air does not read zero.** With the default profile a clean-air sensor reads about 0.0054 g/100ml,
  because the model has no zero point. Re-running the clean-air baseline re-anchors `R0` but does not remove the
  floor. The MQ-3's documented detecting range starts at 0.05 mg/L (≈0.0105 g/100ml), so the default profile is
  extrapolated below that.
- **The firmware's 60 s `warm` flag is a UI gate, not a stabilisation test.** The MQ-3 datasheet preheat is over
  24 hours. The app uses the flag to exclude warm-up samples from the session peak, which is useful, but it says
  nothing about sensor readiness.

Reference points under the default profile, computed by running `breathalyzer.ts` directly:

| Raw ADC | BAC (g/100ml) | Meaning |
|---|---|---|
| 120 | 0.0054 | Clean-air baseline |
| 263 | 0.0105 | Datasheet detecting floor |
| 350 | 0.0140 | Firmware `ALARM_THRESHOLD` (an ADC count, not a legal limit) |
| ~475 | 0.0200 | Professional driver limit |
| ~780 | 0.0500 | General driver limit |
| 872 | 0.0754 | Simulator target |

The firmware alarm threshold (350) is an ADC count and does not correspond to either legal limit. Legal
classification is done separately in `driverPolicy.ts` against the effective limit for the driver's category.

### HC-06 Android connectivity

The Android app now includes a native RFCOMM/SPP transport for the HC-06. It uses Android's standard Serial Port Profile UUID and does not depend on a BLE library. Because it is native code, the app must be rebuilt; Expo Go cannot load it.

1. Build/run the Android development app with `npm run android` or an EAS development build.
2. Pair the HC-06 from Android Bluetooth settings. Common default names are `HC-06`, `HC-06S`, or `ZS-040`; common PINs are `1234` and `0000`.
3. In the officer workflow, tap **Connect HC-06**.
4. Select the paired device from the picker. If it was paired after the picker opened, use **Refresh paired devices** or **Open Bluetooth settings**.
5. The app opens an RFCOMM socket to the SPP service record UUID `00001101-0000-1000-8000-00805F9B34FB`, splits fragmented CRLF records, and forwards complete lines to `BreathalyzerSession`.

Note on the two speeds involved: `9600` is the **UART** rate between the HC-06 and the Arduino, set in the
firmware. RFCOMM itself has no baud-rate setting — it is a packet transport over Bluetooth. The phone does not
and cannot configure a baud rate on the socket.

The bridge is `apps/mobile/android/app/src/main/java/com/thabza102/integrisolutionsmobile/Hc06BluetoothModule.java`.
It lists bonded devices (the app performs no nearby discovery), connects on a single-thread executor, and reads
512-byte chunks on a daemon thread, emitting `Hc06Data` / `Hc06Disconnected` / `Hc06Error`.

Physical HC-06 captures use the explicit custody transport `bluetooth_classic`; they are never mislabeled as BLE. The backend accepts that value, and supervisor/PDF evidence labels it **Bluetooth Classic (SPP)**. The current custody schema still relies on the firmware `sn`; the selected Bluetooth MAC is not a cryptographic identity, so assign a unique serial to every physical unit and add device attestation before enforcement deployment.

Android declares `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`; the paired-device flow requests `BLUETOOTH_CONNECT` at runtime (Android 12+) and uses legacy Bluetooth permissions on older versions. The module must be paired through system settings before the app can connect.

> **Warning — the simulator is currently exposed in store builds.** The `preview` **and** `production`
> EAS profiles in `eas.json` set `EXPO_PUBLIC_BREATHALYZER_SIMULATION=1`, so a production build shows the
> **Simulate MQ-3 device** button and an officer can capture a synthetic reading. Remove that flag from the
> `production` profile before any store submission. Simulated sessions are visibly marked and their records
> carry `transport: "simulated"`, but the safest control is not offering the option at all.

The simulator is always available in development builds (`__DEV__`) and is **always explicitly selected** —
there is no automatic fallback to it after an HC-06 failure. A failed hardware connection produces an error the
officer must resolve by reconnecting or retrying.

> Simulator behaviour (30 s breath cycle, 250 ms sample interval, 3 s warm-up): after connecting, capture
> within the clean-air window (~3–10 s) for a low/PASS reading, or wait for the rise (~15–20 s in) to capture the
> ~0.075 g/100ml target. The session peak persists until a new subject is started, so scan a new licence before
> each test.

### Not evidential

The console's "Capture readiness" card describes its checks as gating "an evidential reading". That wording is
misleading: this is an **uncalibrated screening prototype**, not a certified instrument. The readiness checks
verify that the connection, stream, warm-up flag and session peak are all present — they do not validate the
measurement against any reference. See the [specification's known issues](../../firmware/breathalyzer/docs/TECHNICAL_SPECIFICATION.md)
before any enforcement use.

## Notes

- The app uses React Navigation for native screen navigation.
- Make sure the backend API is reachable before testing on-device features: either the deployed Worker (<https://integri-backend.smuurt.workers.dev>) or a local `wrangler dev` on port `8787`.
