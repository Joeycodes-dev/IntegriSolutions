/*
  IntegriScan breathalyzer firmware
  MQ-3 alcohol sensor on A0, buzzer on D8.

  Emits one JSON line per sample at 9600 baud. The `sn` field identifies the
  device and is hashed into every test record the app captures from it.

  Commands (not required by the app yet): none.
*/

const int MQ3_PIN         = A0;
const int BUZZER_PIN      = 8;
const bool PASSIVE_BUZZER = true;

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
  Serial.begin(9600);
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

  Serial.print("{\"raw\":");    Serial.print(raw);
  Serial.print(",\"avg\":");    Serial.print(ema);
  Serial.print(",\"peak\":");   Serial.print(peak);
  Serial.print(",\"sn\":\"");   Serial.print(DEVICE_SERIAL); Serial.print("\"");
  Serial.print(",\"vout\":");   Serial.print(vout, 3);
  Serial.print(",\"rs\":");     Serial.print(rs, 0);
  Serial.print(",\"over\":");   Serial.print(over ? "true" : "false");
  Serial.print(",\"alarm\":");  Serial.print(alarm ? "true" : "false");
  Serial.print(",\"warm\":");   Serial.print(warming ? "true" : "false");
  Serial.println("}");

  delay(200);
}
