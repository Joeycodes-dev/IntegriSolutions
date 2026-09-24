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
  - Production: `https://integri-backend.smuurt.workers.dev/api` (set in the `eas.json` build profile env for both `preview` and `production`)
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

Local APK build (requires Android SDK, Java 17+, and the local native toolchain):
`npm run apk:local`

This produces `android/app/build/outputs/apk/release/app-release.apk`, which can be copied directly to a phone and installed without waiting for the EAS build queue.

From the repository root, use:
- `npm run mobile:apk`
- `npm run mobile:apk:list`
- `npm run mobile:apk:local`

## Breathalyzer (MQ-3) integration

The officer testing flow reads BAC from the breathalyzer device instead of generating it in-app.

- Device firmware (Arduino + MQ-3 on A0, buzzer on D8) prints one JSON line per sample at 9600 baud to USB serial and an HC-06 Bluetooth Classic SPP link:
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

### HC-06 Android connectivity

The Android app now includes a native RFCOMM/SPP transport for the HC-06. It uses Android's standard Serial Port Profile UUID and does not depend on a BLE library. Because it is native code, the app must be rebuilt; Expo Go cannot load it.

1. Build/run the Android development app with `npm run android` or an EAS development build.
2. Pair the HC-06 from Android Bluetooth settings. Common default names are `HC-06`, `HC-06S`, or `ZS-040`; common PINs are `1234` and `0000`.
3. In the officer workflow, tap **Connect HC-06**.
4. Select the paired device from the picker. If it was paired after the picker opened, use **Refresh paired devices** or **Open Bluetooth settings**.
5. The app opens the SPP socket at the firmware's `9600` baud stream rate, splits fragmented CRLF records, and forwards complete lines to `BreathalyzerSession`.

Physical HC-06 captures use the explicit custody transport `bluetooth_classic`; they are never mislabeled as BLE. The backend accepts that value, and supervisor/PDF evidence labels it **Bluetooth Classic (SPP)**. The current custody schema still relies on the firmware `sn`; the selected Bluetooth MAC is not a cryptographic identity, so assign a unique serial to every physical unit and add device attestation before enforcement deployment.

Android declares `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`; the paired-device flow requests `BLUETOOTH_CONNECT` at runtime (Android 12+) and uses legacy Bluetooth permissions on older versions. The module must be paired through system settings before the app can connect.

Set `EXPO_PUBLIC_BREATHALYZER_SIMULATION=1` to keep the **Simulate MQ-3 device** fallback available in non-dev builds. Simulation is always available in development and is marked distinctly in custody evidence.

> **Beta builds:** the `preview` and `production` EAS profiles in `eas.json` currently set
> `EXPO_PUBLIC_BREATHALYZER_SIMULATION=1` so testers can fall back to simulation when the HC-06 is unavailable.
> Keep this explicit until hardware rollout is complete, and before any public store submission. Simulated
> sessions are visibly marked and synced records carry `transport: "simulated"`.
>
> Simulator behaviour (30 s breath cycle): after connecting, capture within the clean-air window
> (~3–10 s, after the 3 s warm-up) for a low/PASS reading, or wait for the rise (~15–20 s in) to capture the
> ~0.075 g/100 ml target. The session peak persists until a new subject is started, so scan a new licence
> before each test.

## Notes

- The app uses React Navigation for native screen navigation.
- Make sure the backend API is reachable before testing on-device features: either the deployed Worker (<https://integri-backend.smuurt.workers.dev>) or a local `wrangler dev` on port `8787`.
