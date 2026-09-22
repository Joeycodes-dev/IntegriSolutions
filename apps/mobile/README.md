# Integriscan Mobile

React Native (Expo) mobile app used by traffic officers for roadside DUI testing.

## Getting Started

1. Install dependencies:
   `npm install`

2. Start the Expo dev server:
   `npx expo start`

3. Run on Android:
   `npm run android`

4. Run on iOS:
   `npm run ios`

## Backend & on-device OCR

- The app talks to the backend API. Point it with `EXPO_PUBLIC_API_BASE_URL`:
  - `cloudflare-version` builds: `https://integri-backend.thabza102.workers.dev/api` (set in the `eas.json` build profile env for both `preview` and `production`)
  - `main` builds: `https://integriscan-backend-seyjs.ondigitalocean.app/api`
  - Local dev: `http://<your-lan-ip>:8787/api` (the built-in fallback assumes the legacy port `4000`)
- Licence front-photo OCR runs **on-device** via `expo-ai-kit` (ML Kit Text Recognition v2 on Android, Apple Vision on iOS). It requires a dev client or EAS build — it does **not** work in Expo Go.
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

Optional local APK build (requires Android SDK, Java, and local native toolchain):
`npm run apk:local`

From the repository root, use:
- `npm run mobile:apk`
- `npm run mobile:apk:list`

## Breathalyzer (MQ-3) integration

The officer testing flow reads BAC from the breathalyzer device instead of generating it in-app.

- Device firmware (Arduino + MQ-3 on A0, buzzer on D8) prints one JSON line per sample at 9600 baud:
  `{"raw":512,"avg":498,"peak":640,"sn":"MQ3-0001","vout":2.503,"rs":998,"over":true,"alarm":true,"warm":false}`
  (source: `firmware/breathalyzer/breathalyzer.ino`)
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
transport (`ble` / `simulated`), device serial (when reported), calibration version and clean-air resistance,
session peak raw, smoothed raw and instantaneous raw at capture, and the capture timestamp.

- Legacy records (no device fields) hash exactly as before, so previously captured records stay verifiable.
- The device serial travels in the firmware payload as `"sn"`; add `"sn":"MQ3-0042"` to the Arduino JSON output
  and it is hashed into every record automatically.
- The backend rejects device payloads with an unknown transport, out-of-range sensor values, or a missing
  capture timestamp, and a record whose custody fields change after capture fails hash verification.

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

### Enabling the real device (Bluetooth)

The app currently ships with the simulated transport only; the device still talks over USB serial. To go wireless:

1. Add a BLE serial module to the Arduino (HM-10/AT-09/JDY-08) or move the sketch to an ESP32.
2. `npm install react-native-ble-plx` and rebuild the dev client (`npm run android` / `npm run ios`).
3. Add a `BreathalyzerTransport` implementation that scans for the Nordic UART service
   (`6E400001-B5A3-F393-E0A9-E50E24DCCA9E`), subscribes to TX notifications, and forwards each line to the
   session. Bluetooth Classic (HC-05) is not an option on iOS.
4. Grant Android 12+ runtime permissions `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT` and iOS
   `NSBluetoothAlwaysUsageDescription`.

Set `EXPO_PUBLIC_BREATHALYZER_SIMULATION=1` to keep the simulation available in non-dev builds (demo builds).
Simulation is always available in development.

## Notes

- The app uses React Navigation for native screen navigation.
- Make sure the backend API is reachable before testing on-device features: either the deployed Worker (<https://integri-backend.thabza102.workers.dev>) or a local `wrangler dev` on port `8787`.
