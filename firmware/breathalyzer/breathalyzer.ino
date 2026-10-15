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

  Hardware wiring and the first nine JSON fields are byte-for-byte compatible
  with the original revision, so an existing app build keeps working. This
  revision adds (all additive, nothing renamed or rescaled):

    * EEPROM-persisted, CRC-guarded device configuration (load resistance RL,
      clean-air R0, alarm threshold, buzzer enable, device serial). Config is
      only *read* and validated on boot; it is only *written* when a command
      changes a value, to respect the ~100k EEPROM write-cycle budget.
    * A 2 s hardware watchdog (AVR) enabled at the end of setup() and fed at
      the top of loop() and inside the sampling burst.
    * A bandgap VCC measurement (readVccMv) so vout and rs use the real supply
      rail instead of a hard-coded 5.000 V.
    * ADC burst statistics (min/max/spread) and sensor fault detection
      (short / rail / vcc / stuck) surfaced in the new `fault` field.
    * A clean-air baseline tracker and a WARM/BLOW/PEAK/IDLE breath state
      machine surfaced in the new `state` field.
    * An edge-triggered buzzer that beeps once per alarm latch for at most
      2 s (BUZZER_MAX_ON_MS) and re-arms only after the alarm clears; tone() /
      noTone() are only called when the desired buzzer state actually changes.
    * A bidirectional command parser over both the HC-06 and USB ports
      (RST, CAL AIR, CAL, RL, ALM, BEEP, SN, FACTORY, PING).
    * Extended telemetry: seq, up, vcc, spread, r0, fault, state and a 2-digit
      uppercase hex XOR checksum in crc.
*/

#include <SoftwareSerial.h>
#include <EEPROM.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>

#if defined(__AVR__)
#include <avr/wdt.h>
#define HAVE_WATCHDOG 1
#else
#define HAVE_WATCHDOG 0
#endif

// ---------------------------------------------------------------------------
// Hardware mapping (unchanged from the original revision).
// ---------------------------------------------------------------------------
const int MQ3_PIN         = A0;
const int BUZZER_PIN      = 8;
const bool PASSIVE_BUZZER = true;

const int HC06_ARDUINO_RX_PIN = 3; // Arduino D3: HC-06 TXD -> SoftwareSerial RX
const int HC06_ARDUINO_TX_PIN = 4; // Arduino D4: SoftwareSerial TX -> divider -> HC-06 RXD
const unsigned long SERIAL_BAUD = 9600;

const int BUZZER_FREQ = 2700;

SoftwareSerial HC06Serial(HC06_ARDUINO_RX_PIN, HC06_ARDUINO_TX_PIN);

// ---------------------------------------------------------------------------
// Sampling, alarm and warm-up tuning.
// ---------------------------------------------------------------------------
const int  NUM_SAMPLES     = 25;
const int  SAMPLE_DELAY_MS = 2;

const int  ALARM_HYSTERESIS = 20;
const unsigned long ALARM_HOLD_MS = 1500;          // Minimum latch hold (anti-chatter).
const unsigned long BUZZER_MAX_ON_MS = 2000;       // Each alarm beeps once for at most this long.
const unsigned long WARMUP_MS     = 60000;         // Fixed warm-up floor.
const unsigned long WARMUP_STABLE_CEILING_MS = 90000; // Hard ceiling for the post-60 s stability wait.
const unsigned long PEAK_HOLD_MS = 8000;           // Post-blow PEAK hold window.

const float ADC_MAX = 1023;

// The old delay(200) is replaced by this pumped inter-record wait so the
// watchdog stays fed and commands keep being serviced between records.
const unsigned long RECORD_INTERVAL_MS = 200;

// VCC sanity band applied to the bandgap reading.
const long VCC_MS_MIN = 3500;
const long VCC_MS_MAX = 6000;
const long VCC_FAULT_MIN = 4500;
const long VCC_FAULT_MAX = 5500;
const long VCC_FALLBACK_MV = 5000;

// ---------------------------------------------------------------------------
// Sampling burst statistics.
//
// Declared up here, before any function, because the Arduino IDE lifts
// function bodies above the type definitions it finds and then builds the
// prototypes from what is left. A struct that sits directly above its only
// user (readBurst) gets separated from it, and the generated prototype for
// readBurst() fails with "'BurstResult' does not name a type". Keeping every
// type above every function makes the sketch safe to compile in both the IDE
// and arduino-cli.
// ---------------------------------------------------------------------------
struct BurstResult {
  int raw;
  int minRaw;
  int maxRaw;
  int spread;
};

// ---------------------------------------------------------------------------
// EEPROM device configuration.
// ---------------------------------------------------------------------------
const uint16_t CONFIG_MAGIC   = 0x4953; // 'IS'
const uint8_t  CONFIG_VERSION = 1;
const uint16_t CONFIG_RL_MIN = 100;
const uint32_t CONFIG_RL_MAX = 500000;
const uint16_t CONFIG_R0_MIN = 100;
const uint32_t CONFIG_R0_MAX = 500000;
const int      CONFIG_ALARM_MIN = 50;
const int      CONFIG_ALARM_MAX = 1000;

struct DeviceConfig {
  uint16_t magic;
  uint8_t  version;
  uint8_t  buzzerEnabled;
  char     serial[16];
  long     rlOhms;
  long     r0Ohms;
  int      alarmThreshold;
  uint16_t crc;
};

DeviceConfig config;

// ---------------------------------------------------------------------------
// Runtime state.
// ---------------------------------------------------------------------------
unsigned long bootMs = 0;
unsigned long lastOverMs = 0;
unsigned long seq = 0;

bool   alarm = false;
bool   warming = true;
int    ema = 0;
int    peak = 0;
int    baselineEma = 0;
int    prevRaw = -1;
int    stuckCount = 0;
float  sensorRs = -1.0f;
bool   buzzerState = false;
bool   buzzerArmed = true;          // Re-armed only once the alarm clears.
unsigned long buzzerStartMs = 0;
unsigned long blowPeakMs = 0;

enum BreathState { ST_IDLE, ST_BLOW, ST_PEAK };
BreathState breathState = ST_IDLE;

// ---------------------------------------------------------------------------
// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no final XOR).
// ---------------------------------------------------------------------------
uint16_t crc16(const uint8_t* data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint16_t)data[i] << 8;
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) crc = (uint16_t)((crc << 1) ^ 0x1021);
      else              crc = (uint16_t)(crc << 1);
    }
  }
  return crc;
}

// ---------------------------------------------------------------------------
// Watchdog helper: a no-op on non-AVR targets.
// ---------------------------------------------------------------------------
static inline void wdtFeed() {
#if HAVE_WATCHDOG
  wdt_reset();
#endif
}

// ---------------------------------------------------------------------------
// Buzzer (kept at the original 2700 Hz on D8).
// ---------------------------------------------------------------------------
void buzzerOn()  { if (PASSIVE_BUZZER) tone(BUZZER_PIN, BUZZER_FREQ); else digitalWrite(BUZZER_PIN, HIGH); }
void buzzerOff() { if (PASSIVE_BUZZER) noTone(BUZZER_PIN);     else digitalWrite(BUZZER_PIN, LOW); }

// ---------------------------------------------------------------------------
// Configuration defaults, validation and EEPROM persistence.
// ---------------------------------------------------------------------------
void setDefaultConfig(DeviceConfig& c) {
  memset(&c, 0, sizeof(c));          // also clears struct padding for a stable CRC
  c.magic          = CONFIG_MAGIC;
  c.version        = CONFIG_VERSION;
  c.buzzerEnabled  = 1;
  strncpy(c.serial, "MQ3-0001", sizeof(c.serial) - 1);
  c.serial[sizeof(c.serial) - 1] = '\0';
  c.rlOhms         = 1000;
  c.r0Ohms         = 7532;
  c.alarmThreshold = 350;
  c.crc            = 0;
}

bool isSerialChar(char c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
         (c >= '0' && c <= '9') || c == '-';
}

// Defensive cleanup of a config that already passed CRC (or a default): keep
// every field inside its valid range and force the serial to a sanitized,
// null-terminated [A-Za-z0-9-] token.
void sanitizeConfig(DeviceConfig& c) {
  if (c.buzzerEnabled > 1) c.buzzerEnabled = 1;
  if (c.rlOhms < (long)CONFIG_RL_MIN) c.rlOhms = (long)CONFIG_RL_MIN;
  if (c.rlOhms > (long)CONFIG_RL_MAX) c.rlOhms = (long)CONFIG_RL_MAX;
  if (c.r0Ohms < (long)CONFIG_R0_MIN) c.r0Ohms = (long)CONFIG_R0_MIN;
  if (c.r0Ohms > (long)CONFIG_R0_MAX) c.r0Ohms = (long)CONFIG_R0_MAX;
  if (c.alarmThreshold < CONFIG_ALARM_MIN) c.alarmThreshold = CONFIG_ALARM_MIN;
  if (c.alarmThreshold > CONFIG_ALARM_MAX) c.alarmThreshold = CONFIG_ALARM_MAX;

  c.serial[sizeof(c.serial) - 1] = '\0';
  char clean[sizeof(c.serial)];
  uint8_t j = 0;
  for (uint8_t i = 0; c.serial[i] != '\0'; i++) {
    if (isSerialChar(c.serial[i]) && j < sizeof(clean) - 1) clean[j++] = c.serial[i];
  }
  clean[j] = '\0';
  if (j == 0) strcpy(clean, "MQ3-0001");
  strcpy(c.serial, clean);
}

uint16_t configCrc(const DeviceConfig& c) {
  return crc16(reinterpret_cast<const uint8_t*>(&c), offsetof(DeviceConfig, crc));
}

void loadConfig() {
  EEPROM.get(0, config);
  bool valid = config.magic == CONFIG_MAGIC &&
               config.version == CONFIG_VERSION &&
               config.crc == configCrc(config);
  if (valid) {
    sanitizeConfig(config);
  } else {
    // Keep defaults in RAM only: do NOT write on every boot, so the defaults
    // are persisted purely by a config command that changes a value.
    setDefaultConfig(config);
  }
}

void saveConfig() {
  sanitizeConfig(config);
  config.crc = configCrc(config);
  EEPROM.put(0, config);
}

bool setSerialField(const char* s) {
  size_t n = strlen(s);
  if (n < 1 || n > 15) return false;
  for (size_t i = 0; i < n; i++) {
    if (!isSerialChar(s[i])) return false;
  }
  memset(config.serial, 0, sizeof(config.serial));
  strncpy(config.serial, s, sizeof(config.serial) - 1);
  return true;
}

// ---------------------------------------------------------------------------
// Bandgap VCC measurement (ATmega328P / ATmega168 only; 5 V fallback else).
// ---------------------------------------------------------------------------
long readVccMv() {
#if defined(__AVR_ATmega328P__) || defined(__AVR_ATmega168__)
  // Measure the internal 1.1 V bandgap reference against AVCC.
  ADMUX = _BV(REFS0) | _BV(MUX3) | _BV(MUX2) | _BV(MUX1);
  delay(2);                          // let the bandgap buffer settle
  ADCSRA |= _BV(ADSC);               // start a conversion
  while (ADCSRA & _BV(ADSC)) { }     // wait for it to finish
  int adc = (int)ADC;
  if (adc <= 0) return VCC_FALLBACK_MV;
  long mv = 1125300L / (long)adc;    // 1.100 * 1023 * 1000 / adc, in mV
  if (mv < VCC_MS_MIN || mv > VCC_MS_MAX) return VCC_FALLBACK_MV;
  return mv;
#else
  return VCC_FALLBACK_MV;
#endif
}

// ---------------------------------------------------------------------------
// ADC burst sampling with min/max/spread statistics.
// ---------------------------------------------------------------------------
BurstResult readBurst() {
  long sum = 0;
  int mn = (int)ADC_MAX;
  int mx = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    int v = analogRead(MQ3_PIN);
    sum += v;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    wdtFeed();                       // keep the watchdog fed during the burst
    delay(SAMPLE_DELAY_MS);
  }
  BurstResult r;
  r.raw    = (int)(sum / NUM_SAMPLES);
  r.minRaw = mn;
  r.maxRaw = mx;
  r.spread = mx - mn;
  return r;
}

// ---------------------------------------------------------------------------
// Breath state name for telemetry.
// ---------------------------------------------------------------------------
const char* breathStateName() {
  if (warming) return "WARM";
  switch (breathState) {
    case ST_BLOW: return "BLOW";
    case ST_PEAK: return "PEAK";
    default:      return "IDLE";
  }
}

// ---------------------------------------------------------------------------
// Bidirectional command parser (non-blocking, newline terminated).
// ---------------------------------------------------------------------------
char cmdBuf[40];
uint8_t cmdLen = 0;

void handleCommand(char* cmd); // forward declaration (pollStream dispatches to it)

void pollStream(Stream& s) {
  while (s.available() > 0) {
    int c = s.read();
    if (c < 0) return;
    char ch = (char)c;
    if (ch == '\r' || ch == '\n') {
      if (cmdLen > 0) {
        cmdBuf[cmdLen] = '\0';
        handleCommand(cmdBuf);
        cmdLen = 0;
      }
    } else if (ch >= 32 && ch <= 126) {
      if (cmdLen < sizeof(cmdBuf) - 1) {
        cmdBuf[cmdLen++] = ch;
      } else {
        cmdLen = 0; // overflow: discard until the next newline
      }
    }
    // other control bytes are ignored
  }
}

void pollSerialCommands() {
  pollStream(HC06Serial);
  pollStream(Serial);
}

void handleCommand(char* cmd) {
  // trim leading / trailing whitespace
  while (*cmd == ' ' || *cmd == '\t') cmd++;
  size_t n = strlen(cmd);
  while (n > 0 && (cmd[n - 1] == ' ' || cmd[n - 1] == '\t')) cmd[--n] = '\0';
  if (n == 0) return;

  if (strcmp(cmd, "PING") == 0) {
    return; // no-op health check
  }
  if (strcmp(cmd, "RST") == 0) {
    peak = ema;
    alarm = false;
    baselineEma = ema;
    breathState = ST_IDLE;
    blowPeakMs = 0;
    stuckCount = 0;
    return;
  }
  if (strcmp(cmd, "FACTORY") == 0) {
    setDefaultConfig(config);
    saveConfig();
    return;
  }

  char* sp = strchr(cmd, ' ');
  char* arg = (char*)"";
  if (sp) {
    *sp = '\0';
    arg = sp + 1;
    while (*arg == ' ') arg++;
  }

  if (strcmp(cmd, "CAL") == 0) {
#ifdef FW_DEBUG
    fprintf(stderr, "DBG CAL arg=[%s] warming=%d sensorRs=%.1f\n", arg, (int)warming, (double)sensorRs);
#endif
    if (strcmp(arg, "AIR") == 0) {
      if (!warming && sensorRs > 0.0f) {
        config.r0Ohms = (long)(sensorRs + 0.5f);
        saveConfig();
      }
    } else {
      long v = atol(arg);
      if (v >= CONFIG_R0_MIN && v <= (long)CONFIG_R0_MAX) {
        config.r0Ohms = (long)v;
        saveConfig();
      }
    }
  } else if (strcmp(cmd, "RL") == 0) {
    long v = atol(arg);
    if (v >= CONFIG_RL_MIN && v <= (long)CONFIG_RL_MAX) {
      config.rlOhms = (long)v;
      saveConfig();
    }
  } else if (strcmp(cmd, "ALM") == 0) {
    long v = atol(arg);
    if (v >= CONFIG_ALARM_MIN && v <= CONFIG_ALARM_MAX) {
      config.alarmThreshold = (int)v;
      saveConfig();
    }
  } else if (strcmp(cmd, "BEEP") == 0) {
    long v = atol(arg);
    if (v == 0 || v == 1) {
      config.buzzerEnabled = (uint8_t)v;
      saveConfig(); // edge trigger applies the change on the next record
    }
  } else if (strcmp(cmd, "SN") == 0) {
    if (setSerialField(arg)) {
      saveConfig();
    }
  }
}

// ---------------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------------
// Buzzer: each alarm latch beeps once for at most BUZZER_MAX_ON_MS, then stays
// silent until the alarm clears and latches again. Edge-triggered: tone() /
// noTone() are only touched when the desired state changes, which avoids
// rephasing the waveform on every record (KI-11).
// ---------------------------------------------------------------------------
void updateBuzzer(unsigned long now) {
  bool alarmActive = !warming && alarm && (config.buzzerEnabled != 0);
  bool desired = false;
  if (!alarmActive) {
    buzzerArmed = true;
  } else {
    if (buzzerArmed) {
      buzzerArmed = false;
      buzzerStartMs = now;
    }
    desired = (now - buzzerStartMs) < BUZZER_MAX_ON_MS;
  }
  if (desired != buzzerState) {
    buzzerState = desired;
    if (buzzerState) buzzerOn(); else buzzerOff();
  }
}

// ---------------------------------------------------------------------------
void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
  buzzerOff();

  loadConfig();

  Serial.begin(SERIAL_BAUD);
  HC06Serial.begin(SERIAL_BAUD);

  bootMs = millis();
  lastOverMs = bootMs;
  blowPeakMs = bootMs;

  BurstResult initBurst = readBurst();
  ema = initBurst.raw;
  peak = ema;
  baselineEma = ema;
  prevRaw = -1;
  stuckCount = 0;
  sensorRs = -1.0f;
  warming = true;
  alarm = false;
  breathState = ST_IDLE;
  buzzerState = false;
  buzzerArmed = true;
  buzzerStartMs = bootMs;

#if HAVE_WATCHDOG
  wdt_enable(WDTO_2S);
#endif
}

// ---------------------------------------------------------------------------
// Main loop: one record per iteration.
// ---------------------------------------------------------------------------
void loop() {
  wdtFeed();
  pollSerialCommands();

  unsigned long now = millis();
  unsigned long uptimeMs = now - bootMs;

  int vccMv = (int)readVccMv();
  float vccVolts = vccMv / 1000.0f;

  BurstResult burst = readBurst();
  int raw = burst.raw;
  int spread = burst.spread;

  int prevEma = ema;
  ema = (ema * 3 + raw) / 4;

  bool wasWarming = warming;
  warming = (uptimeMs < WARMUP_MS) ||
            (uptimeMs < WARMUP_STABLE_CEILING_MS && abs(ema - prevEma) > 8);

  // Stuck-sensor detector: identical raw with zero spread while warm-complete.
  if (!warming && raw == prevRaw && spread == 0) {
    if (stuckCount < 1000) stuckCount++;
  } else {
    stuckCount = 0;
  }
  prevRaw = raw;

  // Clean-air baseline tracker.
  if (!warming) {
    if (wasWarming) {
      baselineEma = ema;                          // freeze the baseline on warm-up completion
    } else if (ema <= baselineEma + 8) {
      baselineEma += (ema - baselineEma) / 8;     // slow follow of slow clean-air drift
    }
  }

  // Device peak.
  if (!warming) {
    if (ema > peak) {
      peak = ema;
      blowPeakMs = now;
    }
    if (ema < config.alarmThreshold - 100 && peak > ema) {
      peak -= 2;
    }
  }

  // Breath state machine.
  if (warming) {
    breathState = ST_IDLE;
  } else {
    bool blowNow = (ema >= baselineEma + 20) && (ema >= prevEma - 2);
    if (blowNow) {
      breathState = ST_BLOW;
      blowPeakMs = now;
    } else if (breathState == ST_BLOW ||
               (peak >= baselineEma + 20 && (now - blowPeakMs) <= PEAK_HOLD_MS)) {
      breathState = ST_PEAK;
    } else {
      breathState = ST_IDLE;
    }
  }

  // Alarm latch with a 1.5 s minimum hold.
  bool over = ema > config.alarmThreshold;
  if (over) {
    lastOverMs = now;
    alarm = true;
  } else if (alarm && ema < config.alarmThreshold - ALARM_HYSTERESIS) {
    if ((now - lastOverMs) > ALARM_HOLD_MS) alarm = false;
  }

  // Conversion using the real rail and the configured load resistance.
  float vout = raw * (vccVolts / ADC_MAX);
  if (vout > 0.05f && vout < vccVolts - 0.01f) {
    sensorRs = config.rlOhms * (vccVolts - vout) / vout;
  } else {
    sensorRs = -1.0f;
  }

  const char* faultStr;
  if (raw == 0 || vout <= 0.05f)         faultStr = "short";
  else if (raw >= 1020)                  faultStr = "rail";
  else if (vccMv < VCC_FAULT_MIN || vccMv > VCC_FAULT_MAX) faultStr = "vcc";
  else if (!warming && stuckCount >= 25)  faultStr = "stuck";
  else                                    faultStr = "ok";

  updateBuzzer(now);

  seq++;

  char voltageText[12];
  char resistanceText[12];
  char line[256];
  dtostrf(vout, 0, 3, voltageText);
  dtostrf(sensorRs, 0, 0, resistanceText);

  int length = snprintf(line, sizeof(line),
    "{\"raw\":%d,\"avg\":%d,\"peak\":%d,\"sn\":\"%s\","
    "\"vout\":%s,\"rs\":%s,\"over\":%s,\"alarm\":%s,\"warm\":%s,"
    "\"seq\":%lu,\"up\":%lu,\"vcc\":%d,\"spread\":%d,\"r0\":%ld,"
    "\"fault\":\"%s\",\"state\":\"%s\"",
    raw, ema, peak, config.serial,
    voltageText, resistanceText,
    over ? "true" : "false",
    alarm ? "true" : "false",
    warming ? "true" : "false",
    seq, uptimeMs, vccMv, spread,
    config.r0Ohms,
    faultStr, breathStateName());

  if (length > 0 && length < (int)sizeof(line) - 20) {
    // XOR checksum over every byte after the opening '{' through the end of
    // the "state":"..." value.
    uint8_t x = 0;
    for (int i = 1; i < length; i++) x ^= (uint8_t)line[i];
    int tail = snprintf(line + length, sizeof(line) - length,
                        ",\"crc\":\"%02X\"}\r\n", (unsigned)x);
    if (tail > 0 && (size_t)(length + tail) <= sizeof(line)) {
      length += tail;
      // Prioritize the wireless copy, then preserve the USB debug copy.
      HC06Serial.write(reinterpret_cast<const uint8_t*>(line), length);
      Serial.write(reinterpret_cast<const uint8_t*>(line), length);
    }
  }

  // Non-blocking inter-record wait: keep servicing commands and the watchdog
  // instead of the old blocking delay(200).
  unsigned long waitUntil = millis() + RECORD_INTERVAL_MS;
  while ((long)(millis() - waitUntil) < 0) {
    pollSerialCommands();
    updateBuzzer(millis());   // cut the beep off on time, not at the next record
    wdtFeed();
    delay(5);
  }
}
