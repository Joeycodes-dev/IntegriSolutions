/*
  IntegriScan breathalyzer firmware
  MQ-3 alcohol sensor on A0, buzzer on D8.

  Emits one JSON line per sample at 9600 baud to both the USB serial port and
  an HC-06 Bluetooth Classic (SPP) module. USB remains on D0/D1 for flashing
  and diagnostics; the HC-06 uses D3 (Arduino RX) and D4 (Arduino TX).

  Wiring (5 V Uno/Nano):
    HC-06 VCC -> Arduino 5 V
    HC-06 GND -> Arduino GND
    HC-06 TXD -> Arduino D3
    Arduino D4 -> 1 kOhm -> HC-06 RXD
    HC-06 RXD -> 2 kOhm -> GND
    HC-06 EN and STATE -> not connected

  The 1 kOhm/2 kOhm divider reduces the Arduino's 5 V TX signal to 3.3 V for
  the ZS-040 breakout. Do not connect D4 directly to HC-06 RXD. The EN and
  STATE carrier connections vary between ZS-040/FC-114 clones, so leave both
  open unless continuity testing or the exact board documentation proves that
  EN must be held at a 3.3 V normal-mode level. Never connect EN to 5 V.

  The `sn` field identifies the device and is hashed into every test record
  the app captures from it. Commands (not required by the app yet): none.
*/

#include <SoftwareSerial.h>
#include <stdio.h>
#include <stdlib.h>

const int MQ3_PIN         = A0;
const int BUZZER_PIN      = 8;
const bool PASSIVE_BUZZER = true;

const int HC06_ARDUINO_RX_PIN = 3; // Arduino D3: HC-06 TXD -> SoftwareSerial RX
const int HC06_ARDUINO_TX_PIN = 4; // Arduino D4: SoftwareSerial TX -> divider -> HC-06 RXD
const unsigned long SERIAL_BAUD = 9600;

SoftwareSerial HC06Serial(HC06_ARDUINO_RX_PIN, HC06_ARDUINO_TX_PIN);

// Keep this JSON-safe: letters, digits, and hyphens only.
const char* DEVICE_SERIAL = "MQ3-0001";

const int  NUM_SAMPLES     = 25;
const int  SAMPLE_DELAY_MS = 2;

const int  ALARM_THRESHOLD  = 350;
const int  ALARM_HYSTERESIS = 20;
const unsigned long ALARM_HOLD_MS = 0;
const unsigned long WARMUP_MS     = 60000;

const float VCC     = 5.0;
const int   ADC_MAX = 1023;
const float RL      = 1000.0;

unsigned long bootMs = 0;
unsigned long lastOverMs = 0;
bool alarm = false;
bool warming = true;
int ema = 0;
int peak = 0;

void buzzerOn()  { if (PASSIVE_BUZZER) tone(BUZZER_PIN, 2700); else digitalWrite(BUZZER_PIN, HIGH); }
void buzzerOff() { if (PASSIVE_BUZZER) noTone(BUZZER_PIN);     else digitalWrite(BUZZER_PIN, LOW); }

int readAveraged() {
  long sum = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    sum += analogRead(MQ3_PIN);
    delay(SAMPLE_DELAY_MS);
  }
  return (int)(sum / NUM_SAMPLES);
}

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
  buzzerOff();
  Serial.begin(SERIAL_BAUD);
  HC06Serial.begin(SERIAL_BAUD);
  bootMs = millis();
  ema = readAveraged();
  peak = ema;
}

void loop() {
  int raw = readAveraged();

  ema = (ema * 3 + raw) / 4;

  warming = (WARMUP_MS > 0) && (millis() - bootMs < WARMUP_MS);

  if (!warming) {
    if (ema > peak) peak = ema;
    if (ema < ALARM_THRESHOLD - 100 && peak > ema) peak -= 2;
  }

  bool over = ema > ALARM_THRESHOLD;
  if (over) {
    lastOverMs = millis();
    alarm = true;
  } else if (alarm && ema < ALARM_THRESHOLD - ALARM_HYSTERESIS) {
    if (ALARM_HOLD_MS == 0 || (millis() - lastOverMs) > ALARM_HOLD_MS) alarm = false;
  }

  if (!warming && alarm) buzzerOn(); else buzzerOff();

  float vout = raw * (VCC / ADC_MAX);
  float rs   = (vout > 0.05) ? (RL * (VCC - vout) / vout) : -1.0;

  char voltageText[10];
  char resistanceText[10];
  char line[160];
  dtostrf(vout, 0, 3, voltageText);
  dtostrf(rs, 0, 0, resistanceText);

  int length = snprintf(
    line,
    sizeof(line),
    "{\"raw\":%d,\"avg\":%d,\"peak\":%d,\"sn\":\"%s\","
    "\"vout\":%s,\"rs\":%s,\"over\":%s,\"alarm\":%s,\"warm\":%s}",
    raw,
    ema,
    peak,
    DEVICE_SERIAL,
    voltageText,
    resistanceText,
    over ? "true" : "false",
    alarm ? "true" : "false",
    warming ? "true" : "false"
  );

  if (length > 0 && length <= (int)sizeof(line) - 3) {
    line[length++] = '\r';
    line[length++] = '\n';

    // Prioritize the wireless copy, then preserve the USB debug copy.
    HC06Serial.write(reinterpret_cast<const uint8_t*>(line), length);
    Serial.write(reinterpret_cast<const uint8_t*>(line), length);
  }

  delay(200);
}
