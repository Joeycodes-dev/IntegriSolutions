# IntegriScan breathalyzer: technical specification

| Item | Value |
| --- | --- |
| Document status | Draft v0.1 for engineering review. Not approved for enforcement or evidential use. |
| Date | 2026-10-13 |
| Firmware revision | `firmware/breathalyzer/breathalyzer.ino` at commit `1d86a91` (working tree clean for `firmware/` on 2026-10-13) |
| App revision | `apps/mobile` breathalyzer services at `f6c4ff7`; Android native module `Hc06BluetoothModule.java` at `1d86a91`. Working tree clean for these paths on 2026-10-13. |
| Companion artefacts | `diagrams/01`–`06` (draw.io, editable PNG) and `wireframes/01`–`02` (draw.io, editable PNG) in this folder |

This document describes the device as it is built and coded today. Where the code, the README files, the datasheet and the console copy disagree, the disagreement is recorded in §11 and §12 instead of being smoothed over.

---

## 1. Purpose and scope

The breathalyzer is a prototype. An MQ-3 alcohol sensor is read by an Arduino Uno or Nano. The firmware streams one JSON record per sample over a Bluetooth Classic (SPP) module. The IntegriScan Android app reads that stream, converts it to an estimated blood alcohol concentration (BAC), and attaches the reading to a roadside test record.

**In scope:** hardware connections, firmware behaviour, the telemetry protocol, the app-side processing chain, the console user interface, and bench verification.

**Out of scope:** sensor physics research, statutory approval, enclosure design, back-end storage and retention, and the supervisor web application except where it consumes device evidence.

**Not evidential.** The firmware README and the app README both say the output is an uncalibrated screening estimate. Do not use it for an enforcement decision until the items in §11 marked **Blocker** are closed and the conversion model has been validated against an approved reference (§8.3).

**Platform.** The only working device path is Android with the HC-06 (§6.11). iOS has no supported path.

---

## 2. System overview

Diagram: `diagrams/01-system-architecture.drawio`.

```
MQ-3 module ──AO──▶ Arduino A0 ─┐                       ┌─ Hc06BluetoothModule (Java)
                  firmware      │  D4 ─▶ 1 kΩ ─▶ RXD    │      RFCOMM SPP socket
                  JSON + CRLF   │  (2 kΩ RXD→GND)       ▼
                  9600 baud ────┘  HC-06 ◀══ SPP ══════▶ breathalyzerBluetooth.ts (line assembler)
                                   TXD ─▶ D3                    │
                                                                ▼
                 Buzzer ◀── D8 ── firmware latch          BreathalyzerSession (breathalyzer.ts)
                                                                │ parse · session peak · 3 s gate
                                                                ▼
                                          Console (DeviceSettingsModal) and roadside test
                                                                │ capture()
                                                                ▼
                              Local SQLite (pending_sync) ─▶ sync.ts ─▶ backend (Cloudflare Worker, Supabase)
```

Telemetry is **one-way**. The firmware parses no commands, and the app sends none. The console's diagnostic report says the same (`buildDeviceDiagnosticReport`, firmware note).

---

## 3. Hardware

Diagram: `diagrams/02-hardware-wiring.drawio`. The HC-06-only detail remains in `diagrams/hc06-arduino-wiring.drawio`.

### 3.1 Bill of materials

| Item | What the repository specifies | Verify on the physical unit |
| --- | --- | --- |
| Arduino Uno or ATmega328P Nano | 5 V board, AVR core (`README.md`) | Board type matches `--fqbn arduino:avr:uno` or `arduino:avr:nano` |
| MQ-3 alcohol sensor module | Analogue output on A0. The firmware assumes a load resistor RL = 1 000 Ω (`breathalyzer.ino`, `RL`). | Module part number, its load resistor, and whether it has a DO pin. Record all three. The repository does not record the module. |
| HC-06 carrier (ZS-040 / FC-114) | Six-pin carrier, 3.6–6 V supply, 3.3 V logic. Labels: STATE, RXD, TXD, GND, VCC, EN (photo `Project Plan/hc06a.jpg`). | Carrier labels match the photo. EN behaviour varies by clone (§3.3). |
| Passive buzzer | Driven by `tone(8, 2700)` (`PASSIVE_BUZZER = true`) | Type and current draw. The repository does not record them. |
| Resistors | 1 kΩ (D4 → RXD), 2 kΩ (RXD → GND) | Tolerance and power rating are not recorded. |
| Decoupling (optional, recommended) | 100 nF ceramic and 10–100 µF electrolytic across HC-06 VCC and GND (`README.md`) | Fitted close to the module |
| Wire, USB cable, 5 V supply | USB or regulated 5 V with adequate rating (§3.3) | Supply rating |

### 3.2 Pin map

| Arduino pin | Direction | Connects to | Notes |
| --- | --- | --- | --- |
| A0 | Analogue input | MQ-3 AO | 10-bit ADC. Each record is the mean of 25 reads. |
| D3 | Input (SoftwareSerial RX) | HC-06 TXD | Direct connection. The module's 3.3 V output is read as HIGH. The ATmega328P's minimum HIGH input at VCC = 5 V is 0.6·VCC ≈ 3.0 V, so the margin is about 0.3 V. |
| D4 | Output (SoftwareSerial TX) | 1 kΩ, then HC-06 RXD. 2 kΩ from RXD to GND. | Never connect D4 straight to RXD. |
| D8 | Output | Passive buzzer (+) | `tone()` while the alarm is latched and the device is ready. |
| D0 / D1 | Hardware UART (USB) | Host PC | The same record as the HC-06 stream. Used for flashing and bench logs. |
| 5 V | Power | HC-06 VCC, MQ-3 VCC | Shared 5 V net |
| GND | Ground | All module grounds and the buzzer | One common ground net |

The sketch stores the SoftwareSerial pins as numeric constants `3` and `4` because some board cores do not expose the `D3` and `D4` aliases (`README.md`).

### 3.3 Electrical design

- **Level shift.** The divider is 5 V × 2 kΩ / (1 kΩ + 2 kΩ) ≈ 3.33 V at RXD. The HC-06 receives 3.3 V logic. A direct 5 V signal can damage the module.
- **EN pin.** Leave open unless the exact carrier's documentation or a continuity test requires a 3.3 V normal-mode level. Never connect EN to 5 V (`breathalyzer.ino` header, `README.md`).
- **Heater and power budget.** The MQ-3 heater is 33 Ω ±5 % at room temperature, so about 150 mA at 5 V. The datasheet gives heating consumption below 750 mW (§3.4). The HC-06 draws about 30–50 mA (`README.md`). Plan for at least 250 mA from the 5 V source, plus margin. USB 2.0 hosts supply up to 500 mA per port.
- **Pin current.** The ATmega328P absolute maximum is 40 mA per I/O pin. Keep drive currents well below that. If the buzzer needs more, use a transistor driver.
- **Ground.** All grounds share one net (diagram 02).
- **Warm-up of the sensor.** The firmware does not check the heater. A cold heater produces unstable readings. See §4.7 and §11 (KI-06).

### 3.4 MQ-3 sensor reference

Source: Hanwei Electronics, *MQ-3 Technical Data* (copy used for this review: `https://cdn.sparkfun.com/assets/6/a/1/7/b/MQ-3.pdf`).

| Parameter | Datasheet value | Note for this project |
| --- | --- | --- |
| Circuit voltage Vc | 5 V ±0.1 V, AC or DC | Matches the 5 V rail |
| Heater voltage VH | 5 V ±0.1 V, AC or DC | |
| Load resistance RL (standard condition) | 200 kΩ. Sensitivity calibration recommends 100 kΩ to 470 kΩ. | **Firmware and app assume 1 kΩ.** See KI-05. |
| Heater resistance RH | 33 Ω ±5 % at room temperature | About 150 mA at 5 V |
| Heating consumption PH | Less than 750 mW | |
| Detecting range | 0.05 mg/L to 10 mg/L alcohol | About 0.0105 to 2.1 g/100 mL with the 0.21 factor. The default model is extrapolated below 0.05 mg/L. |
| Preheat time | **Over 24 hours** under standard detecting conditions | The firmware's 60 s warm-up is far shorter. See KI-06. |
| Rs at 0.4 mg/L | 1 MΩ to 8 MΩ (as printed) | Not comparable with the firmware's default R0 of 7 532 Ω. See KI-05. |
| Concentration slope α (0.4 / 1 mg/L) | ≤ 0.6 | Printed as Rs(0.4 mg/L) / Rs(1 mg/L). This is a ratio of two resistances, not the exponent used in the app's power law (§6.5), so the two values are not directly comparable. |
| Operating range | −10 °C to 50 °C; humidity below 95 % RH; oxygen above 2 % (21 % standard) | Not measured in this project |
| Ro | Resistance at 0.4 mg/L alcohol, from the datasheet's sensitivity curve. The clean-air line on the chart sits near Rs/Ro ≈ 50–60. | The default `cleanAirRatio = 60` follows this. |

### 3.5 Enclosure

Not defined in the repository. A future enclosure needs its own mechanical, sensor-inlet and acoustic-alarm review.

---

## 4. Firmware

Source: `firmware/breathalyzer/breathalyzer.ino`. Flow: diagram `04-firmware-loop-timing.drawio`. States: diagram `03-firmware-state-machine.drawio`.

### 4.1 Build and target

- Arduino AVR core, Uno or Nano. Uses `SoftwareSerial`, `tone()`, `dtostrf()` and `snprintf()`. These are AVR-specific. The sketch has not been validated on any other core.
- Compile and upload: see `README.md` (`arduino-cli compile --fqbn arduino:avr:uno firmware/breathalyzer`).

### 4.2 Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `MQ3_PIN` | A0 | Sensor input |
| `BUZZER_PIN` | 8 | Buzzer drive |
| `PASSIVE_BUZZER` | true | Use `tone()` and `noTone()` |
| `HC06_ARDUINO_RX_PIN` | 3 | SoftwareSerial RX, from HC-06 TXD |
| `HC06_ARDUINO_TX_PIN` | 4 | SoftwareSerial TX, to HC-06 RXD through the divider |
| `SERIAL_BAUD` | 9600 | Rate for USB serial and for the HC-06 UART |
| `DEVICE_SERIAL` | `"MQ3-0001"` | Serial in every record. The same value is used on every unit (KI-04). |
| `NUM_SAMPLES` | 25 | ADC reads per record |
| `SAMPLE_DELAY_MS` | 2 | Gap between reads |
| `ALARM_THRESHOLD` | 350 | ADC counts. The latch sets above this value. |
| `ALARM_HYSTERESIS` | 20 | The latch clears below 330 |
| `ALARM_HOLD_MS` | 0 | No hold time. The latch clears as soon as the level is below 330. |
| `WARMUP_MS` | 60 000 | Warm-up flag window after boot |
| `VCC` / `ADC_MAX` | 5.0 V / 1023 | Conversion constants |
| `RL` | 1 000.0 Ω | Load resistor assumed in `rs` (KI-05) |
| Tone | 2 700 Hz | Alarm frequency |
| Record buffer | 160 bytes | A JSON record longer than 157 bytes is not sent |

### 4.3 Boot and main loop

1. **`setup()`**: configure D8 and turn the buzzer off. Start `Serial` and `HC06Serial` at 9600. Record `bootMs`. Take one 25-sample average and set `ema` and `peak` to it.
2. **`loop()`**, once per record:
   1. `raw` = mean of 25 ADC reads with 2 ms gaps (about 50–75 ms).
   2. `ema = (3·ema + raw) / 4` in integer arithmetic.
   3. `warming` = `millis() − bootMs < 60 000`.
   4. If not warming: `peak = max(peak, ema)`. While `ema < 250` and `peak > ema`, `peak` decreases by 2.
   5. `over = ema > 350`. If `over`, set `alarm = true`. Otherwise, if `alarm` and `ema < 330`, set `alarm = false`.
   6. Buzzer: `tone(D8, 2700)` only when `!warming && alarm`. Otherwise `noTone(D8)`.
   7. Convert: `vout = raw × 5 / 1023`, `rs = 1000 × (5 − vout) / vout`, or −1 if `vout ≤ 0.05`.
   8. Format the JSON line (§5) and append CRLF.
   9. `HC06Serial.write()` (blocking SoftwareSerial), then `Serial.write()` (USB copy).
   10. `delay(200)`.

Note that the firmware evaluates `over` and `alarm` even while warming. Only the buzzer is suppressed during warm-up.

### 4.4 Signal processing

- The EMA moves 25 % of the gap towards each new record. After a step change, it reaches 50 % after about 2.4 records and 90 % after about 8 records. Its time constant is about 3.5 records.
- With a record period of about 0.37–0.44 s (§4.6), the time constant is about 1.3–1.5 s, and 90 % of a step takes about 3–3.5 s.
- A breath peak shorter than about 1.5 s is attenuated and delayed. The session peak uses the smoothed average, not the raw sample (KI-03).

### 4.5 Device peak

`peak` is the highest `ema` seen after warm-up. It falls by 2 counts per record while `ema < 250`. It is shown in the app as DEVICE PEAK and does not drive the BAC estimate.

### 4.6 Timing budget (estimate)

| Stage | Estimate | Basis |
| --- | --- | --- |
| 25 ADC reads with `delay(2)` | 50–75 ms | 25 × about 2–3 ms |
| `delay(200)` | 200 ms | Sketch |
| SoftwareSerial TX of about 112 bytes | ≈117 ms | 112 bytes × 10 bits ÷ 9600 baud, blocking |
| USB TX back-pressure | 0–50 ms | Only when the 64-byte hardware buffer is full |
| **Record period** | **≈0.37–0.44 s** | **≈2.3–2.7 records per second** |

`README.md` says about two readings per second, which agrees within the uncertainty. Confirm with serial timestamps (TC-12). The 200 ms delay is only one part of the period. Any document that says "one line every 200 ms" is wrong (§12).

### 4.7 Warm-up gate

`warm` is `true` for the first 60 seconds after boot and `false` afterwards. The app uses this flag to keep warm-up samples out of the session peak and to refuse capture (§6.4, §6.7).

The 60 s window is a **UI gate**. It is not a stabilisation test. The datasheet preheat is over 24 hours (§3.4). The firmware does not check the heater or the sensor's stability (KI-06).

### 4.8 Alarm latch and buzzer

Diagram `03-firmware-state-machine.drawio` shows the two independent regions and the truth table.

- The latch sets when `ema > 350`, and clears when `ema < 330`. The hold time is zero.
- The buzzer sounds only when the device is ready (`!warming`) **and** the latch is set. The alarm can latch during warm-up, but the buzzer stays off.
- The buzzer cannot be configured from the app. The firmware never reads commands (KI-02).

### 4.9 Output

- One line per record: a JSON object (§5), then `\r\n`. The line goes to HC-06 first and then to USB.
- A record that does not fit the buffer is dropped without a message.
- No checksum, sequence number or protocol version is included.

---

## 5. Telemetry protocol

### 5.1 Link

| Property | Value |
| --- | --- |
| Profile | Bluetooth Classic Serial Port Profile (SPP) over RFCOMM |
| Service UUID | `00001101-0000-1000-8000-00805F9B34FB` (`Hc06BluetoothModule.java`) |
| Module role | Slave. The phone opens the RFCOMM socket. |
| UART between firmware and HC-06 | 9600 baud, 8 data bits, no parity, 1 stop bit (8N1). This is the HC-06's UART rate, set in the firmware. |
| Direction | Firmware → phone only |
| Pairing | Done once in Android Bluetooth settings. Default PINs `1234` or `0000` (`README.md`). |

RFCOMM has no baud-rate setting. The app does not "open the socket at 9600 baud". The mobile README's wording to that effect is wrong (§12).

### 5.2 Framing and encoding

- Each record is one JSON object on one line, ASCII, terminated by CR LF (`0x0D 0x0A`).
- Length: 110 bytes plus CRLF (112 bytes) for the README example. Realistic values give 102–112 bytes including CRLF.
- The app discards any run longer than 4 096 bytes without a newline and asks the officer to reconnect (§6.3).

### 5.3 Field dictionary

| Field | JSON type | Unit / range | Source in firmware | Used by the app for |
| --- | --- | --- | --- | --- |
| `raw` | integer | ADC counts, 0–1023 | Mean of 25 reads in this record | RAW ADC tile, conversion, SIGNAL VOLTAGE tile. Missing or non-numeric `raw` rejects the line. |
| `avg` | integer | ADC counts, EMA of `raw` | `(3·ema + raw) / 4` | Smoothed average. Live BAC. Session peak. Clean-air baseline. Missing `avg` falls back to `raw`. |
| `peak` | integer | ADC counts | Device peak (§4.5) | DEVICE PEAK tile only. Missing `peak` falls back to `raw`. |
| `sn` | string | Letters, digits and hyphens | Constant `"MQ3-0001"` in this revision | Serial shown in the header and stored in the record. Trimmed. Null if absent. |
| `vout` | number | Volts, three decimals | `raw × 5 / 1023` | Parsed but not used for calculation. The app recomputes from `raw`. |
| `rs` | integer | Ω, or −1 | `1000 × (5 − vout) / vout`, or −1 if `vout ≤ 0.05` | Parsed but not used for calculation. The app recomputes from `raw`. |
| `over` | boolean | — | `ema > 350` | THRESHOLD chip. Clean-air baseline is refused when true. |
| `alarm` | boolean | — | Latch state (§4.8) | ALARM chip. Clean-air baseline is refused when true. |
| `warm` | boolean | — | `millis() − bootMs < 60 000` | WARMING chip. Gates the session peak and capture. Missing `warm` is read as `false` (KI-07). |

### 5.4 Worked example

Record from the README:

```json
{"raw":120,"avg":118,"peak":120,"sn":"MQ3-0001","vout":0.587,"rs":7525,"over":false,"alarm":false,"warm":true}
```

- `vout` = 120 × 5 / 1023 = 0.5865 V, shown as 0.587.
- `rs` = 1000 × (5 − 0.5865) / 0.5865 ≈ 7 525 Ω. The firmware uses the unrounded voltage.
- `warm: true`, so the app excludes this record from the session peak.

### 5.5 What the app accepts

Implemented in `parseBreathalyzerLine` (`apps/mobile/src/services/breathalyzer.ts`):

- Takes the text between the first `{` and the last `}`. Stray text around the object is tolerated.
- Requires a finite `raw`.
- Booleans count as true only when they are exactly `true`.
- No range check is applied to any field. No checksum is checked. A missing `warm` counts as `false` (KI-07).

### 5.6 Compatibility

There is no protocol version field. Any change to field names, units or framing needs a coordinated firmware and app release. Renaming or re-scaling a field will silently break the app's parser.

---

## 6. Android application integration

Diagrams: `01-system-architecture`, `05-telemetry-and-capture-sequence`, `06-measurement-pipeline`. Wireframes: `01-console-tabs`, `02-console-states-and-gates`.

### 6.1 Components

| Layer | File | Role |
| --- | --- | --- |
| Native | `apps/mobile/android/app/src/main/java/com/thabza102/integrisolutionsmobile/Hc06BluetoothModule.java` | Bonded-device list, RFCOMM connect, reader thread, events |
| Native | Same package: `Hc06BluetoothPackage.java`, `MainApplication.kt` | Module registration (`MainApplication.kt` adds `Hc06BluetoothPackage()`) |
| Transport | `apps/mobile/src/services/breathalyzerBluetooth.ts` | Name filter, native event subscription, line assembly |
| Session | `apps/mobile/src/services/breathalyzer.ts` | `BreathalyzerSession`, parsing, session peak, freshness, capture, conversion |
| Simulator | `apps/mobile/src/services/breathalyzerSimulator.ts` | Labelled test transport |
| Storage | `breathalyzerStorage.ts`, `breathalyzerDeviceStorage.ts` | Calibration, preferences and history in SecureStore |
| Presentation | `apps/mobile/src/lib/deviceSettings.ts` | Readiness checks, formatting, diagnostic report |
| Console | `apps/mobile/src/components/DeviceSettingsModal.tsx` | Tabs, controls and locks |
| Roadside test | `apps/mobile/src/screens/OfficerDashboardScreen.tsx` | Capture gate, 1 s expiry poll, audit events |

### 6.2 Native bridge (`Hc06BluetoothModule.java`)

- Methods: `isBluetoothAvailable`, `isBluetoothEnabled`, `getBondedDevices`, `connect(address)`, `disconnect`, `openBluetoothSettings`.
- `connect` checks the MAC address format and that Bluetooth is enabled. It then creates an RFCOMM socket to the SPP UUID and connects on a single-thread executor. A generation counter discards stale connects.
- After connecting, a daemon thread reads 512-byte chunks, decodes them as UTF-8, and emits `Hc06Data` with the MAC address.
- Events and messages:
  - `Hc06Data` — `{ address, data }`
  - `Hc06Disconnected` — "HC-06 disconnected."
  - `Hc06Error` — "HC-06 connection lost. Reconnect the device and try again."
  - Connect failure: "Could not connect to the HC-06. Confirm it is powered, paired, and not connected elsewhere."
- Permissions: runtime request for `BLUETOOTH_CONNECT` on Android 12 and later. Legacy `BLUETOOTH` and `BLUETOOTH_ADMIN` are capped at API 30. `BLUETOOTH_SCAN` is declared in the manifest, but the app never runs discovery (`breathalyzerBluetooth.ts`).

### 6.3 Transport (`breathalyzerBluetooth.ts`)

- The picker lists only bonded devices. It excludes LOW_ENERGY devices and keeps names matching `HC-06`, `HC06`, `HC-06S`, `ZS-040` (case-insensitive). The name match is for convenience and gives no security.
- `connect()` clears the line buffer, subscribes to the three native events, and then calls the native `connect`. If the native connect fails, the subscriptions are removed.
- The line assembler splits on `\n`, strips a trailing `\r`, drops empty lines and holds partial lines. If more than 4 096 bytes arrive without a newline, the buffer is discarded and the officer is asked to reconnect.
- Events are matched by MAC address, so a stale event from another device is ignored.
- Transport label: `HC-06 Classic • <name>`. Transport kind: `bluetooth_classic`.

### 6.4 Session (`BreathalyzerSession`)

| Concept | Rule (as coded) |
| --- | --- |
| Connection state | `idle`, `connecting`, `connected` or `error` |
| Subscription order | Line and error listeners are registered before the native connect is awaited, so an immediate disconnect cannot be mistaken for a stale callback. |
| Session peak | The maximum `avg` over records with `warm = false`. It resets on a new subject, on connect, and on disconnect. |
| Freshness | A sample is fresh when it arrived 0–3 000 ms ago (`MAX_BREATHALYZER_READING_AGE_MS`). |
| Stale expiry | The dashboard calls `expireIfStale()` every 1 s. If the last sample is older than 3 s, the transport is disposed and the state becomes `error` with "HC-06 stopped sending live data. Reconnect the device and try again." |
| Capture | `capture()` requires `connected`, a non-null session peak and a fresh sample. It converts the session peak to BAC with the active profile and returns the captured reading. |
| New subject | `startNewSubject()` clears the session peak, the sample count and the last-received time. The next sample restarts the freshness check. |

Live BAC uses `avg`. Peak BAC uses the session peak. Both use the active calibration profile.

### 6.5 Measurement chain (default profile)

Diagram: `06-measurement-pipeline.drawio`.

| Step | Formula | Default constants |
| --- | --- | --- |
| 1. Voltage | `V = raw × 5 / 1023` | `MQ3_VCC = 5`, `MQ3_ADC_MAX = 1023` |
| 2. Sensor resistance | `Rs = RL × (5 − V) / V` | `RL = 1 000 Ω` (`loadResistorOhms`) |
| 3. Ratio | `ratio = Rs / R0 × 60` | `R0 = 7 532 Ω` (`cleanAirResistanceOhms`), `cleanAirRatio = 60` |
| 4. Concentration | `mg/L = 0.45 × ratio^(−0.7)` | `mgPerLAtRatioOne = 0.45`, `curveSlope = −0.70` |
| 5. BAC | `g/100 mL = mg/L × 0.21` | `BREATH_TO_BLOOD_FACTOR = 0.21` (2 100:1) |

The profile is labelled `mq3-default-v1`. The mobile README says the constants A and B "are fitted against a reference measurement", and that until then the reading is "a screening estimate, not evidential-grade". Nothing in the repository documents how the defaults were derived.

**Worked values under the default profile.** These were computed by running the app's own functions (`breathalyzer.ts`), not by hand.

| Raw ADC | V | Rs (Ω) | Ratio | mg/L | g/100 mL | Meaning |
| --- | --- | --- | --- | --- | --- | --- |
| 120 | 0.587 | 7 525 | 59.9 | 0.0256 | **0.0054** | Clean-air baseline. The output is not zero. |
| 263 | 1.285 | 2 890 | 23.0 | 0.0501 | **0.0105** | Datasheet detecting floor (0.05 mg/L). Below this the model is extrapolated. |
| 330 | 1.613 | 2 100 | 16.7 | 0.0626 | 0.0132 | Firmware latch clears below this |
| 350 | 1.711 | 1 923 | 15.3 | 0.0666 | 0.0140 | Firmware latch sets above this |
| ≈475 | 2.322 | 1 154 | 9.19 | 0.0953 | **0.0200** | Professional driver limit |
| ≈780 | ≈3.81 | ≈312 | ≈2.5 | ≈0.238 | **0.050** | General driver limit |
| 872 | 4.262 | 173 | 1.38 | 0.359 | **0.075** | Matches PEAK BAC 0.075 in the device screenshot |
| ≈883 | ≈4.32 | ≈159 | ≈1.26 | ≈0.382 | **0.080** | Console preview target |
| 1000 | 4.888 | 23 | 0.18 | 1.48 | 0.310 | Top of the range, far outside any calibration |

Two properties follow from the model:

- **Clean air is not zero.** A sensor with `Rs = R0` has ratio 60, so the model reads about 0.005 g/100 mL. Re-running the clean-air baseline re-anchors R0 but does not remove this floor (KI-08).
- **Ratios cancel RL only after a clean-air baseline.** After a baseline is taken with the same RL, `(Rs/R0)` no longer depends on RL. The default R0 of 7 532 Ω is only meaningful for an RL of 1 kΩ (KI-05).

### 6.6 Calibration

- **Storage.** The active profile is kept in SecureStore (`breathalyzerStorage.ts`). The history (`integriscan.breathalyzer.calibrationHistory`) holds the last 20 changes. Calibration lives on the phone, not on the device.
- **Clean-air baseline** (Calibrate tab, "Set clean-air baseline"). Sets `R0` to the `Rs` computed from the current `avg`. The version becomes `<base>+clean-air`. It is refused when there is no average, when `over` or `alarm` is true, or when `Rs` is out of range.
- **Manual profile** (Calibrate tab, "Apply measurement profile"). Edits load resistance, clean-air resistance, mg/L at ratio 1, curve slope and clean-air ratio. Validation: load resistance and clean-air resistance above zero, mg/L above zero, slope non-zero, ratio above zero. The version becomes `<base>+manual-<stamp>`. The change is written to history and audited as `test.device.calibrated`.
- **Restore defaults** ("Restore default calibration"). Replaces the active profile with `DEFAULT_BREATHALYZER_CALIBRATION`, clears the stored profile, and records a `reset` entry.
- **Locks.** While the dashboard is in its reading step (`lockDeviceMutations`), Set clean-air baseline is disabled, and manual apply and restore are refused with a message.

### 6.7 Capture readiness and capture gates

**Readiness** (`buildCaptureReadiness`, shown in the Activity tab):

| Check | Passes when |
| --- | --- |
| Device connection | `connection = connected` |
| Live telemetry stream | The latest sample is fresh (≤3 s) |
| Sensor warm-up | Connected and `warm = false` |
| Breath sample | At least one sample received and an average exists |
| Session peak | The session peak is set |

**Capture gate** (`OfficerDashboardScreen.handleCaptureReading`), checked in this order:

| Condition | Officer sees |
| --- | --- |
| Not connected, or no samples | "No reading": Connect the breathalyzer and take a breath sample before capturing. |
| `warm = true` | "Sensor warming up": Wait for the breathalyzer to finish warming up before capturing a reading. |
| Last sample older than 3 s | "Reading is stale": The breathalyzer has stopped sending live data. Reconnect it and take a fresh sample. |
| `capture()` returns null | "No reading": No breath sample has been recorded yet. Blow into the breathalyzer until the reading stabilises. |

On success, `bacReading` is set to the BAC with three decimals, and `test.device.captured` is audited.

### 6.8 Classification

`classifyBacReading` (`driverPolicy.ts`) returns **FAIL** when the BAC is greater than or equal to the limit, and **PASS** otherwise. Defaults:

| Driver category | Limit (g/100 mL) |
| --- | --- |
| General | 0.050 |
| Professional | 0.020 |

The runtime configuration can override these. The console's Policy limits card shows the values in use.

### 6.9 Evidence and audit

- The record carries a device-evidence payload (`toDeviceEvidence`): transport, serial, calibration version, clean-air resistance, session peak raw, average raw, raw at capture, and the capture time.
- The mobile README says these fields are hashed into the record's SHA-256 hash, and that a record whose custody fields change after capture fails verification. The backend rejects unknown transports, out-of-range sensor values and missing capture times.
- Audit actions: `test.device.connected`, `test.device.disconnected`, `test.device.captured`, `test.device.calibrated`, `test.device.diagnostic`.
- Serial and calibration version are the only identifiers. The serial is a constant in firmware (KI-04), and the Bluetooth MAC address is not a cryptographic identity (`mobile README`).

### 6.10 Simulator

- Transport kind `simulated`, label "Simulated MQ-3 device". It emits JSON lines every 250 ms, with a 3 s warm-up and a 30 s breath cycle.
- The dashboard's simulator uses a target of 0.075 g/100 mL. The transport's own default is 0.062.
- Shown only when `__DEV__` is true or `EXPO_PUBLIC_BREATHALYZER_SIMULATION === '1'` (`DeviceSettingsModal.tsx`, `OfficerDashboardScreen.tsx`).
- The `production` and `preview` EAS profiles set that flag (`apps/mobile/eas.json`). Store builds therefore show the option (KI-01).
- No code path selects the simulator automatically. It starts only from a tap.
- Simulated captures are labelled and their records carry `transport: "simulated"`.

### 6.11 Platform support

- `requireRuntime()` throws "HC-06 connectivity is supported by the Android app only." on any platform other than Android without the native module.
- No iOS transport exists. The `ble` transport kind appears in types and labels, but nothing implements it.
- A standard iOS app cannot open an arbitrary Bluetooth Classic SPP link. Supporting iOS would need either a BLE design with different firmware hardware, or an MFi-licensed accessory. Neither is in the repository (KI-09).

---

## 7. Console user interface

Wireframes: `wireframes/01-console-tabs.drawio` (four tabs) and `wireframes/02-console-states-and-gates.drawio` (header states and gate messages).

| Tab | Purpose | Key controls | Locks and rules |
| --- | --- | --- | --- |
| Device | Current device, readiness, next action | Connect a device; Disconnect breathalyzer; Open complete live activity; Share a breathalyser diagnostic report | Disconnect is disabled during the reading step. Confirm dialog when "Confirm before disconnect" is on. |
| Connect | Pair and select an HC-06 | Scan paired devices; Pair a new HC-06; Check app permissions; Connect simulated MQ-3 device (when enabled); Remember and auto-connect; Confirm before disconnect; Forget saved breathalyzer | Auto-connect runs once when the console loads, and only if the saved device is still paired. |
| Calibrate | Clean-air baseline and conversion profile | Set clean-air baseline; Apply measurement profile; Restore default calibration; Conversion preview; Clear calibration history | Locked during the reading step. Manual edits have no role check (KI-10). |
| Activity | Readiness, live telemetry, diagnostics, custody | Run three second stream diagnostic; Reset subject peak; Preview a test capture; Share diagnostic report | Reset subject peak is locked during the reading step. Preview writes nothing. |

Header states (from `statusFromSnapshot`): **Offline**, **Connecting**, **Warming**, **Live**, **Attention**. Live values are cleared on any error or disconnect (`resetLiveState`).

---

## 8. Verification

### 8.1 Automated tests in the repository

| Area | Test files |
| --- | --- |
| Protocol, calibration maths, session | `apps/mobile/tests/lib/breathalyzer.test.ts` |
| HC-06 transport and line assembly | `apps/mobile/tests/lib/breathalyzerBluetooth.test.ts` |
| Device settings, readiness, storage | `apps/mobile/tests/lib/deviceSettings.test.ts`, `breathalyzerDeviceStorage.test.ts`, `apps/mobile/tests/components/DeviceSettingsModal.test.tsx` |
| Custody and integrity | `apps/mobile/tests/lib/deviceCustody.test.ts`, `backend/tests/utilities/deviceCustody.contract.test.ts`, `backend/tests/utilities/testIntegrity.test.ts` |
| Evidence PDF and display | `apps/web/tests/lib/generateEvidencePdf.layout.test.ts`, `apps/web/tests/components/DeviceCustodyPanel.test.tsx` |

Run the mobile breathalyzer tests with `npm --prefix apps/mobile test -- breathalyzer` from the repository root.

No automated test covers the firmware. Nothing in the repository exercises the sketch on hardware.

### 8.2 Bench acceptance tests

These run on the bench, with no alcohol involved. For the threshold tests, disconnect the MQ-3 AO from A0. Connect a potentiometer across 5 V and GND with its wiper on A0. Never drive A0 outside 0–5 V.

| ID | Purpose | Steps | Expected result |
| --- | --- | --- | --- |
| TC-01 | Record format | Open USB serial at 9600 baud for 60 s. | One line per record, each valid JSON with keys `raw, avg, peak, sn, vout, rs, over, alarm, warm`, terminated by CRLF. `sn` is `MQ3-0001`. |
| TC-02 | Warm-up gate | Set A0 to about 1.8 V (raw ≈ 370) from boot. | For 60 s: `warm: true`, `over` and possibly `alarm` true, and the buzzer silent. After 60 s the buzzer sounds if the latch is set. |
| TC-03 | Latch thresholds | After warm-up, ramp A0 from 1.0 V to 2.0 V and back. | Latch and buzzer set near 1.71 V (raw ≈ 350). Latch clears near 1.61 V (raw ≈ 330). Allow about 8 records to settle after each step. |
| TC-04 | Level shift | Measure RXD with D4 idle HIGH. | 3.2–3.4 V. Never 5 V. |
| TC-05 | Pairing and stream | Pair the HC-06 in Android. Connect from the Connect tab. | "Live" pill appears. Samples increase. The header shows the serial `MQ3-0001`. |
| TC-06 | Stale stream | While connected, power the device off for 5 s. | Hard disconnect: state becomes Attention with the native message. Stalled stream (device on, no data): stale message after 3 s. Capture is refused with "Reading is stale". |
| TC-07 | Clean-air baseline | After warm-up, in clean air, press Set clean-air baseline. | "Baseline updated" with the new Ω value. A history entry is added. Live BAC settles near 0.005 (KI-08). |
| TC-08 | Conversion | With A0 at 4.26 V (raw ≈ 872) after warm-up, check PEAK BAC. | 0.075 under the default profile. |
| TC-09 | Locks | Start a roadside reading. Try Disconnect, Apply profile, Reset subject peak. | Each shows its locked message (§6.7, §7). |
| TC-10 | Simulator in a store build | Install the production build. Open the Connect tab. | **Currently fails**: the simulator option is shown (KI-01). It must be absent for any enforcement sign-off. |
| TC-11 | Parser: missing `warm` | Send `{"raw":300,"avg":300,"peak":300,"over":false,"alarm":false}` during warm-up. | **Currently fails**: the app treats the record as warm complete and admits it into the session peak (KI-07). The target behaviour is to reject or treat it as warming. |
| TC-12 | Record period | Timestamp 100 records. | Mean period 0.37–0.44 s. A mean above 0.6 s needs investigation. |
| TC-13 | Alarm tone | With the latch set after warm-up, listen to the buzzer for 30 s. | Steady 2.7 kHz tone, no dropouts. Record any gaps that line up with record transmissions (KI-11). |

### 8.3 Reference testing (not yet performed)

The conversion model cannot be validated on the bench. Acceptance for any use beyond development needs:

- an approved, calibrated reference system, traceable to a recognised standard;
- a test plan agreed with the approving body, covering temperature, humidity and repeatability;
- results analysed against the reference across the full range from 0.02 to 0.10 g/100 mL;
- sign-off of the fitted constants A and B, and of R0 handling;
- **no** human breath, automotive exhaust, methanol or improvised flammable substances as calibration sources. This instruction comes from `firmware/breathalyzer/README.md`.

---

## 9. Operating procedure (development and trials)

1. **Power and warm-up.** Power the module from the same 5 V source as the Arduino. Allow the heater to run for the datasheet preheat before any measurement that matters (§3.4). The firmware's 60 s warm-up is a UI gate only.
2. **Connect.** Pair the HC-06 in Android settings. Open the Connect tab and tap the paired device. Confirm the "Live" pill and the serial.
3. **Clean-air baseline.** In fresh air, away from alcohol, wait until the readiness checks show warm-up complete. Tap Set clean-air baseline. Record the new R0 and the time.
4. **Roadside sequence (as the app shows it).** Scan the licence (scan step), then move to the reading step, which locks the device controls. Confirm the readiness checks pass. Have the subject give a sustained breath. Capture the reading, then save. Capture needs a sample from the last 3 s.
5. **New subject.** Start a new subject before each test so the session peak is cleared.
6. **After use.** Disconnect from the Device tab, or close the console. Closing the console does not disconnect.

---

## 10. Safety, legal and data notes

- The device output is a screening estimate. It must not be used for an enforcement decision until the blocker items in §11 are closed and §8.3 has been completed.
- Use of this device under any statutory breath-testing regime needs that regime's own approval and validation. This document does not cover that.
- I did not find a retention period for device evidence in the repository. Records keep their custody fields. Setting one is outside this document.

---

## 11. Known issues and open risks

Severity: **Blocker** = must close before any enforcement or store use. **High** = must close before trials that inform decisions. **Medium** = close before a wider rollout. **Low** = tidy-up.

| ID | Severity | Area | Finding | Evidence | Action |
| --- | --- | --- | --- | --- | --- |
| KI-01 | Blocker | Build | Production and preview EAS profiles set `EXPO_PUBLIC_BREATHALYZER_SIMULATION=1`, which shows the simulator in store builds. The README asks for this to be removed before store submission. | `apps/mobile/eas.json` lines 7, 17; `DeviceSettingsModal.tsx` 78–79; `OfficerDashboardScreen.tsx` 175–176 | Remove the flag from production. Keep the simulator for dev builds only. |
| KI-02 | Blocker | Scope | The output is an uncalibrated screening estimate. The console says "evidential reading" and "Capture readiness: All checks must pass before an evidential reading is captured." | `DeviceSettingsModal.tsx` 1497; `apps/mobile/README.md` 108–110; `firmware/breathalyzer/README.md` 145–146 | Correct the copy. Keep the "not evidential" statement visible in the console. |
| KI-03 | Blocker | Model | The conversion constants (R0, 0.45 mg/L at ratio 1, slope −0.70, clean-air ratio 60) are defaults. The README says A and B must be fitted against a reference. Nothing in the repository validates them. | `breathalyzer.ts` 10–17; `apps/mobile/README.md` 108–110 | Complete §8.3 before any use beyond development. |
| KI-04 | Blocker | Identity | Every unit reports `sn = "MQ3-0001"`. The serial is not authenticated, and the Bluetooth MAC is not an identity (`apps/mobile/README.md`). | `breathalyzer.ino` 42; mobile README 122 | Give each unit a unique, controlled serial. Add device attestation or signed telemetry. |
| KI-05 | Blocker | Hardware | The firmware and app assume RL = 1 kΩ. The datasheet's standard RL is 200 kΩ (100–470 kΩ). Its Rs at 0.4 mg/L (1–8 MΩ) is quoted at RL = 200 kΩ, so it is not directly comparable with R0 = 7 532 Ω. The default R0 is only valid if the module's load resistor is 1 kΩ. | `breathalyzer.ino` `RL`; `breathalyzer.ts` `loadResistorOhms`; datasheet §A and §C | Measure the actual module. Record RL in the BOM. Take a clean-air baseline on each module before use. |
| KI-06 | Blocker | Sensor | The 60 s warm-up does not meet the datasheet preheat of over 24 hours. The firmware does not check the heater or the sensor's drift. | `breathalyzer.ino` `WARMUP_MS`; datasheet preheat | Define a measured stabilisation test. Gate on it, not on 60 s. |
| KI-07 | High | Parsing | A missing `warm` field is read as `false`, so a malformed warm-up record could enter the session peak. The firmware always sends `warm`, so the risk is low but the default is unsafe. | `breathalyzer.ts` 131–133; test TC-11 | Treat a missing `warm` as warming (fail-closed). Reject records without `raw`, `avg` or `warm`. |
| KI-08 | High | Model | Clean air reads about 0.005 g/100 mL under the default profile. The power law has no zero point. The datasheet's detecting range starts at 0.05 mg/L (≈0.0105 g/100 mL). | §6.5 table; datasheet §C | Document the floor, or change the model with the reference data (§8.3). Do not report readings below 0.0105 as measurements. |
| KI-09 | High | Platform | No iOS transport exists. The HC-06 is Bluetooth Classic, which iOS apps cannot use. | `breathalyzerBluetooth.ts` 68–70; firmware README 125–127 | Confirm whether iOS is a requirement. If it is, the hardware needs a BLE or MFi design. |
| KI-10 | High | Access | Manual calibration edits have no role check in `DeviceSettingsModal`. Any signed-in officer using the console can change the conversion profile. Changes are audited. | `DeviceSettingsModal.tsx` 576–620 | Decide whether this is supervisor-only, then enforce it in the app and backend. |
| KI-11 | Medium | Firmware | `SoftwareSerial` disables interrupts while it transmits each byte. This can distort the `tone()` output on D8 during each record. Not measured. | Arduino SoftwareSerial and tone() behaviour; TC-13 | Check the tone on the bench. If it is distorted, move the alarm tone to a hardware-timer-safe driver or change the telemetry UART. |
| KI-12 | Medium | Firmware | The breath-peak filter attenuates and delays short peaks (time constant ≈1.3–1.5 s). The session peak uses the smoothed average. | §4.4; `breathalyzer.ts` `handleLine` | Characterise the sensor's response to a controlled breath profile. Decide whether a raw-peak path is needed. |
| KI-13 | Medium | Sensor | No plausibility check. The app accepts any finite `raw`, and the firmware cannot detect an open or shorted AO. A floating A0 gives arbitrary readings. | `parseBreathalyzerLine`; `breathalyzer.ino` | Add an Rs plausibility range and a stuck-value check. Flag them in the readiness checks. |
| KI-14 | Medium | Calibration | The profile is stored on the phone, not the device. Two phones paired with one HC-06 can use different profiles. The record stores the version, so this is traceable but not enforced. | `breathalyzerStorage.ts`; `toDeviceEvidence` | Decide whether the profile belongs with the device serial. Enforce a version match at capture. |
| KI-15 | Medium | Firmware | `dtostrf`, `tone()` and SoftwareSerial are AVR-specific. Porting needs re-validation. | `breathalyzer.ino` | Note the target in the build instructions. Re-validate on any new board. |
| KI-16 | Medium | Hardware | Heater power and decoupling are not in the firmware or BOM. The 5 V source and wiring carry the load. | §3.3 | Specify the 5 V source and the decoupling in the BOM. |
| KI-17 | Low | Documentation | Several documents disagree with the code. See §12. | §12 | Correct or retire them. |
| KI-18 | Low | Firmware | Records that do not fit the buffer are dropped silently. | `breathalyzer.ino` 132 | Count dropped records and report the count. |

---

## 12. Discrepancies found in existing documents

| Document | Statement | Finding | Recommendation |
| --- | --- | --- | --- |
| `Project Plan/diagrams/Breathalyzer_Telemetry_Sequence.drawio` | "one JSON line roughly every 200 ms (about 2 Hz)" | The 200 ms delay is only one part of a 0.37–0.44 s record period. The two figures contradict each other. | Replace with `diagrams/04` and `diagrams/05`, or correct the text. |
| `Project Plan/diagrams/Breathalyzer_Hardware_Schematic.drawio` | "Heating element: 60 s WARMUP_MS stabilisation window" | The 60 s is a UI gate. It is not a stabilisation time. The datasheet preheat is over 24 hours. | Correct the label (KI-06). |
| `Project Plan/diagrams/Breathalyzer_Hardware_Schematic.drawio` | "Load resistor RL: firmware models RL = 1000 Ω" | Accurate about the firmware, but the datasheet's standard RL is 200 kΩ (KI-05). | Add the verification requirement. |
| `apps/mobile/README.md` line 120 | "opens the SPP socket at the firmware's 9600 baud stream rate" | RFCOMM has no baud parameter. 9600 is the HC-06 UART rate set in the firmware. | Reword. |
| `apps/mobile/README.md` lines 102–106 | Conversion chain | Consistent with the code. | None |
| `apps/mobile/README.md` line 126 | "keep the **Simulate MQ-3 device** fallback" | The code never falls back to the simulator automatically. "Fallback" implies it does. | Call it "Simulate MQ-3 device (manual)". |
| `firmware/breathalyzer/README.md` lines 134–138 | "not yet committed/deployed" | Both the native module (`1d86a91`) and the breathalyzer services (`f6c4ff7`) are committed and clean. Deployment status is not in the repository. | Reword to state the deployment status only. |
| `firmware/breathalyzer/README.md` line 22 | "roughly 120-byte record" | 110 bytes plus CRLF for the README example. | Correct the figure. |
| `firmware/breathalyzer/README.md` line 127 | "roughly 2 Hz sample rate" | Consistent with the 0.37–0.44 s estimate (§4.6), and the item is still open. | Keep. Add the measured period once TC-12 is run. |
| `apps/mobile/src/components/DeviceSettingsModal.tsx` 1497 | "before an evidential reading is captured" | Contradicts the README's "not an evidential or legally certified breathalyzer measurement" (KI-02). | Correct the copy. |
| `apps/mobile/eas.json` 7, 17 | Simulation flag set in production | Contradicts the mobile README's instruction to remove it before public store submission (KI-01). | Remove the flag from production. |

---

## 13. Glossary

| Term | Meaning |
| --- | --- |
| ADC | Analogue-to-digital converter. The Arduino's 10-bit converter gives counts from 0 to 1023. |
| AO / DO | MQ-3 module analogue output and digital output. |
| BAC | Blood alcohol concentration, in g/100 mL (the app's `bacGdl`, same as g/dL). |
| EMA | Exponential moving average. Here `ema = (3·ema + raw) / 4`. |
| HC-06 | Bluetooth Classic serial module (ZS-040 / FC-114 carriers). |
| Latch | The alarm flag that stays set until the level falls below 330. |
| R0 | The clean-air sensor resistance used as the reference for the ratio. |
| Rs | The sensor's resistance at the current gas concentration. |
| RFCOMM / SPP | The Bluetooth Classic serial emulation used between the phone and the HC-06. |
| RL | The load resistor in series with the sensor, across which the output voltage is read. |
| Session peak | The highest non-warm `avg` since the subject was started. |
| Warm | The firmware's 60 s warm-up flag. It does not mean the sensor is stable. |

---

## 14. Sources

Repository files (revision noted in the header):

- `firmware/breathalyzer/breathalyzer.ino`, `firmware/breathalyzer/README.md`, `firmware/breathalyzer/diagrams/hc06-arduino-wiring.drawio`
- `apps/mobile/src/services/breathalyzer.ts`, `breathalyzerBluetooth.ts`, `breathalyzerSimulator.ts`, `breathalyzerDeviceStorage.ts`, `breathalyzerStorage.ts`
- `apps/mobile/src/lib/deviceSettings.ts`, `driverPolicy.ts`
- `apps/mobile/src/components/DeviceSettingsModal.tsx`, `apps/mobile/src/screens/OfficerDashboardScreen.tsx`
- `apps/mobile/android/app/src/main/java/com/thabza102/integrisolutionsmobile/Hc06BluetoothModule.java`, `Hc06BluetoothPackage.java`, `MainApplication.kt`, `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `apps/mobile/README.md`, `apps/mobile/eas.json`
- `Project Plan/screenshots/*` (console screenshots used for the wireframes), `Project Plan/hc06a.jpg`, `hc06b.jpg`

External:

- Hanwei Electronics, *TECHNICAL DATA MQ-3 GAS SENSOR*. Copy: `https://cdn.sparkfun.com/assets/6/a/1/7/b/MQ-3.pdf`. Manufacturer: `http://www.hwsensor.com`.
- Bluetooth SPP service UUID `00001101-0000-1000-8000-00805F9B34FB` (Bluetooth SIG assigned number).
