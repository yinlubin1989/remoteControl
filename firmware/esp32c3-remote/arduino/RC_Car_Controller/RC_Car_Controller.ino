#include <Arduino.h>
#include <BleCompositeHID.h>
#include <Preferences.h>
#include <XboxGamepadDevice.h>

#include "remote_input.h"

namespace {

constexpr uint8_t STEERING_PWM_PIN = 0;
constexpr uint8_t THROTTLE_PWM_PIN = 1;
constexpr uint32_t CENTER_CALIBRATION_MS = 2000;
constexpr uint32_t ENDPOINT_CALIBRATION_MS = 8000;
constexpr uint32_t STATUS_PRINT_INTERVAL_MS = 1000;
constexpr uint8_t CALIBRATION_VERSION = 1;

struct PwmCapture {
  explicit PwmCapture(uint8_t inputPin)
    : pin(inputPin) {}

  uint8_t pin;
  volatile uint32_t riseUs = 0;
  volatile uint16_t widthUs = 1500;
  volatile uint32_t updatedUs = 0;
};

struct ReceiverInput {
  ReceiverInput(
    bool steeringSignalValid = false,
    bool throttleSignalValid = false,
    uint16_t steeringPulse = 1500,
    uint16_t throttlePulse = 1500
  )
    : valid(steeringSignalValid && throttleSignalValid),
      steeringValid(steeringSignalValid),
      throttleValid(throttleSignalValid),
      steeringPulseUs(steeringPulse),
      throttlePulseUs(throttlePulse) {}

  bool valid;
  bool steeringValid;
  bool throttleValid;
  uint16_t steeringPulseUs;
  uint16_t throttlePulseUs;
};

enum class CalibrationPhase {
  WaitingForSignal,
  SamplingCenter,
  SamplingEndpoints,
  Ready,
};

BleCompositeHID compositeHID("RC Car Controller", "ESP32-C3 Remote", 100);
XboxGamepadDevice* gamepad = nullptr;
Preferences preferences;
PwmCapture steeringCapture {STEERING_PWM_PIN};
PwmCapture throttleCapture {THROTTLE_PWM_PIN};
portMUX_TYPE captureMux = portMUX_INITIALIZER_UNLOCKED;
remote_input::PulseFilter steeringFilter;
remote_input::PulseFilter throttleFilter;
remote_input::CenterArming centerArming;
remote_input::CalibrationCapture calibrationCapture;
remote_input::AxisCalibration steeringCalibration;
remote_input::AxisCalibration throttleCalibration;
CalibrationPhase calibrationPhase = CalibrationPhase::WaitingForSignal;
String serialCommand;
bool lastConnected = false;
uint32_t lastReportMs = 0;
uint32_t lastStatusPrintMs = 0;
uint32_t calibrationPhaseStartedMs = 0;
uint32_t steeringCenterSum = 0;
uint32_t throttleCenterSum = 0;
uint32_t centerSampleCount = 0;
uint32_t lastSteeringUpdateUs = 0;
uint32_t lastThrottleUpdateUs = 0;
uint16_t filteredSteeringPulseUs = 1500;
uint16_t filteredThrottlePulseUs = 1500;

void ARDUINO_ISR_ATTR capturePwmEdge(void* argument) {
  auto* capture = static_cast<PwmCapture*>(argument);
  const uint32_t nowUs = micros();
  if (digitalRead(capture->pin) == HIGH) {
    capture->riseUs = nowUs;
    return;
  }

  const uint32_t widthUs = nowUs - capture->riseUs;
  if (
    widthUs < remote_input::MIN_VALID_PULSE_US
    || widthUs > remote_input::MAX_VALID_PULSE_US
  ) {
    return;
  }

  portENTER_CRITICAL_ISR(&captureMux);
  capture->widthUs = static_cast<uint16_t>(widthUs);
  capture->updatedUs = nowUs;
  portEXIT_CRITICAL_ISR(&captureMux);
}

ReceiverInput readReceiverInput(uint32_t nowUs) {
  uint16_t steeringWidthUs;
  uint16_t throttleWidthUs;
  uint32_t steeringUpdatedUs;
  uint32_t throttleUpdatedUs;

  portENTER_CRITICAL(&captureMux);
  steeringWidthUs = steeringCapture.widthUs;
  throttleWidthUs = throttleCapture.widthUs;
  steeringUpdatedUs = steeringCapture.updatedUs;
  throttleUpdatedUs = throttleCapture.updatedUs;
  portEXIT_CRITICAL(&captureMux);

  if (steeringUpdatedUs != lastSteeringUpdateUs) {
    filteredSteeringPulseUs = steeringFilter.update(steeringWidthUs);
    lastSteeringUpdateUs = steeringUpdatedUs;
  }
  if (throttleUpdatedUs != lastThrottleUpdateUs) {
    filteredThrottlePulseUs = throttleFilter.update(throttleWidthUs);
    lastThrottleUpdateUs = throttleUpdatedUs;
  }

  const bool steeringValid = !remote_input::signalTimedOut(
    nowUs,
    steeringUpdatedUs
  );
  const bool throttleValid = !remote_input::signalTimedOut(
    nowUs,
    throttleUpdatedUs
  );
  return ReceiverInput(
    steeringValid,
    throttleValid,
    filteredSteeringPulseUs,
    filteredThrottlePulseUs
  );
}

bool loadCalibration() {
  preferences.begin("rc-pwm", true);
  const uint8_t version = preferences.getUChar("version", 0);
  steeringCalibration.minimum = preferences.getUShort("stMin", 0);
  steeringCalibration.center = preferences.getUShort("stCenter", 0);
  steeringCalibration.maximum = preferences.getUShort("stMax", 0);
  steeringCalibration.deadZone = preferences.getUShort(
    "stDead",
    remote_input::DEFAULT_DEAD_ZONE_US
  );
  throttleCalibration.minimum = preferences.getUShort("thMin", 0);
  throttleCalibration.center = preferences.getUShort("thCenter", 0);
  throttleCalibration.maximum = preferences.getUShort("thMax", 0);
  throttleCalibration.deadZone = preferences.getUShort(
    "thDead",
    remote_input::DEFAULT_DEAD_ZONE_US
  );
  preferences.end();

  return version == CALIBRATION_VERSION
    && remote_input::isCalibrationValid(steeringCalibration)
    && remote_input::isCalibrationValid(throttleCalibration);
}

void saveCalibration() {
  preferences.begin("rc-pwm", false);
  preferences.putUChar("version", CALIBRATION_VERSION);
  preferences.putUShort("stMin", steeringCalibration.minimum);
  preferences.putUShort("stCenter", steeringCalibration.center);
  preferences.putUShort("stMax", steeringCalibration.maximum);
  preferences.putUShort("stDead", steeringCalibration.deadZone);
  preferences.putUShort("thMin", throttleCalibration.minimum);
  preferences.putUShort("thCenter", throttleCalibration.center);
  preferences.putUShort("thMax", throttleCalibration.maximum);
  preferences.putUShort("thDead", throttleCalibration.deadZone);
  preferences.end();
}

void clearCalibration() {
  preferences.begin("rc-pwm", false);
  preferences.clear();
  preferences.end();
  calibrationPhase = CalibrationPhase::WaitingForSignal;
  steeringCenterSum = 0;
  throttleCenterSum = 0;
  centerSampleCount = 0;
  centerArming.lock();
  Serial.println("Calibration cleared.");
  Serial.println("Center the steering wheel and throttle trigger.");
}

void printCalibration() {
  Serial.printf(
    "Steering min/center/max: %u/%u/%u\n",
    steeringCalibration.minimum,
    steeringCalibration.center,
    steeringCalibration.maximum
  );
  Serial.printf(
    "Throttle min/center/max: %u/%u/%u\n",
    throttleCalibration.minimum,
    throttleCalibration.center,
    throttleCalibration.maximum
  );
}

void updateCalibration(
  const ReceiverInput& input,
  uint32_t nowMs
) {
  if (calibrationPhase == CalibrationPhase::Ready) return;

  if (!input.valid) {
    calibrationPhase = CalibrationPhase::WaitingForSignal;
    steeringCenterSum = 0;
    throttleCenterSum = 0;
    centerSampleCount = 0;
    if (
      static_cast<uint32_t>(nowMs - lastStatusPrintMs)
      >= STATUS_PRINT_INTERVAL_MS
    ) {
      Serial.printf(
        "PWM CH1: %s (%u us), CH2: %s (%u us)\n",
        input.steeringValid ? "OK" : "--",
        input.steeringPulseUs,
        input.throttleValid ? "OK" : "--",
        input.throttlePulseUs
      );
      lastStatusPrintMs = nowMs;
    }
    return;
  }

  if (calibrationPhase == CalibrationPhase::WaitingForSignal) {
    calibrationPhase = CalibrationPhase::SamplingCenter;
    calibrationPhaseStartedMs = nowMs;
    steeringCenterSum = 0;
    throttleCenterSum = 0;
    centerSampleCount = 0;
    Serial.println("Hold steering and throttle at center for 2 seconds.");
  }

  if (calibrationPhase == CalibrationPhase::SamplingCenter) {
    steeringCenterSum += input.steeringPulseUs;
    throttleCenterSum += input.throttlePulseUs;
    centerSampleCount += 1;
    if (
      static_cast<uint32_t>(nowMs - calibrationPhaseStartedMs)
      < CENTER_CALIBRATION_MS
    ) {
      return;
    }

    const uint16_t steeringCenter = static_cast<uint16_t>(
      steeringCenterSum / centerSampleCount
    );
    const uint16_t throttleCenter = static_cast<uint16_t>(
      throttleCenterSum / centerSampleCount
    );
    calibrationCapture.begin(steeringCenter, throttleCenter);
    calibrationPhase = CalibrationPhase::SamplingEndpoints;
    calibrationPhaseStartedMs = nowMs;
    Serial.println(
      "For 8 seconds, move steering fully left/right and throttle fully "
      "forward/reverse."
    );
    return;
  }

  calibrationCapture.update(
    input.steeringPulseUs,
    input.throttlePulseUs
  );
  if (
    static_cast<uint32_t>(nowMs - calibrationPhaseStartedMs)
    < ENDPOINT_CALIBRATION_MS
  ) {
    return;
  }

  if (!calibrationCapture.valid()) {
    Serial.println("Calibration failed: full travel was not detected.");
    Serial.println("Center both controls and try again.");
    calibrationPhase = CalibrationPhase::WaitingForSignal;
    return;
  }

  steeringCalibration = calibrationCapture.steering();
  throttleCalibration = calibrationCapture.throttle();
  saveCalibration();
  calibrationPhase = CalibrationPhase::Ready;
  centerArming.lock();
  Serial.println("Calibration saved.");
  printCalibration();
  Serial.println("Return both controls to center to unlock.");
}

void processSerialCommands() {
  while (Serial.available() > 0) {
    const char character = static_cast<char>(Serial.read());
    if (character == '\r') continue;
    if (character != '\n') {
      serialCommand += character;
      continue;
    }

    serialCommand.trim();
    serialCommand.toUpperCase();
    if (serialCommand == "CALIBRATE") clearCalibration();
    else if (serialCommand == "STATUS") printCalibration();
    serialCommand = "";
  }
}

void sendControllerReport(
  const ReceiverInput& input,
  uint32_t nowMs
) {
  int16_t steeringAxis = 0;
  int16_t throttleAxis = 0;
  const bool calibrationReady = calibrationPhase == CalibrationPhase::Ready;
  const bool centered = calibrationReady
    && remote_input::isCentered(
      input.steeringPulseUs,
      steeringCalibration
    )
    && remote_input::isCentered(
      input.throttlePulseUs,
      throttleCalibration
    );
  const bool armed = centerArming.update(
    calibrationReady && input.valid,
    centered,
    nowMs
  );

  if (armed) {
    steeringAxis = remote_input::mapPulse(
      input.steeringPulseUs,
      steeringCalibration
    );
    throttleAxis = remote_input::mapPulse(
      input.throttlePulseUs,
      throttleCalibration
    );
  }

  const int16_t steeringPulseAxis = remote_input::encodePulseTelemetry(
    input.steeringPulseUs,
    input.steeringValid
  );
  const int16_t throttlePulseAxis = remote_input::encodePulseTelemetry(
    input.throttlePulseUs,
    input.throttleValid
  );
  gamepad->setLeftThumb(steeringPulseAxis, throttleAxis);
  gamepad->setRightThumb(steeringAxis, throttlePulseAxis);
  gamepad->sendGamepadReport();
  lastReportMs = nowMs;
}

}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(STEERING_PWM_PIN, INPUT);
  pinMode(THROTTLE_PWM_PIN, INPUT);
  attachInterruptArg(
    STEERING_PWM_PIN,
    capturePwmEdge,
    &steeringCapture,
    CHANGE
  );
  attachInterruptArg(
    THROTTLE_PWM_PIN,
    capturePwmEdge,
    &throttleCapture,
    CHANGE
  );

  if (loadCalibration()) {
    calibrationPhase = CalibrationPhase::Ready;
    Serial.println("Saved receiver calibration loaded.");
    printCalibration();
    Serial.println("Return both controls to center to unlock.");
  } else {
    Serial.println("No valid receiver calibration found.");
    Serial.println("Turn on the X6 transmitter and center both controls.");
  }
  Serial.println("Send CALIBRATE to repeat setup or STATUS to show values.");

  auto* configuration = new XboxOneSControllerDeviceConfiguration();
  BLEHostConfiguration hostConfiguration = configuration->getIdealHostConfiguration();
  gamepad = new XboxGamepadDevice(configuration);
  compositeHID.addDevice(gamepad);

  Serial.println("Advertising as RC Car Controller...");
  compositeHID.begin(hostConfiguration);
}

void loop() {
  const uint32_t nowUs = micros();
  const uint32_t nowMs = millis();
  const ReceiverInput input = readReceiverInput(nowUs);
  processSerialCommands();
  updateCalibration(input, nowMs);

  const bool connected = compositeHID.isConnected();
  if (connected != lastConnected) {
    Serial.println(connected ? "Controller connected" : "Controller disconnected");
    if (!connected) centerArming.lock();
    lastConnected = connected;
  }

  if (connected && remote_input::reportDue(nowMs, lastReportMs)) {
    sendControllerReport(input, nowMs);
  }
  delay(1);
}
