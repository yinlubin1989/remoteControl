#include <Arduino.h>
#include <BleCompositeHID.h>
#include <XboxGamepadDevice.h>

#include "remote_input.h"

namespace {

constexpr uint8_t LEFT_X_PIN = 0;
constexpr uint8_t LEFT_Y_PIN = 1;
constexpr uint8_t RIGHT_X_PIN = 3;
constexpr uint8_t RIGHT_Y_PIN = 4;
constexpr uint8_t LEFT_BUTTON_PIN = 5;
constexpr uint8_t RIGHT_BUTTON_PIN = 6;

constexpr size_t AXIS_COUNT = 4;
constexpr size_t FILTER_SIZE = 8;
constexpr size_t CALIBRATION_SAMPLES = 128;
constexpr uint32_t CALIBRATION_SAMPLE_DELAY_MS = 4;

const uint8_t AXIS_PINS[AXIS_COUNT] = {
  LEFT_X_PIN,
  LEFT_Y_PIN,
  RIGHT_X_PIN,
  RIGHT_Y_PIN,
};

class MovingAverage {
public:
  void begin(int initialValue) {
    sum_ = static_cast<int32_t>(initialValue) * FILTER_SIZE;
    for (size_t index = 0; index < FILTER_SIZE; index += 1) {
      samples_[index] = initialValue;
    }
  }

  int update(int nextValue) {
    sum_ -= samples_[nextIndex_];
    samples_[nextIndex_] = nextValue;
    sum_ += nextValue;
    nextIndex_ = (nextIndex_ + 1) % FILTER_SIZE;
    return static_cast<int>(sum_ / FILTER_SIZE);
  }

private:
  int samples_[FILTER_SIZE] = {};
  int32_t sum_ = 0;
  size_t nextIndex_ = 0;
};

BleCompositeHID compositeHID("RC Car Controller", "ESP32-C3 Remote", 100);
XboxGamepadDevice* gamepad = nullptr;
remote_input::AxisCalibration calibrations[AXIS_COUNT];
MovingAverage filters[AXIS_COUNT];
remote_input::DebouncedButton leftButton;
remote_input::DebouncedButton rightButton;
bool lastLeftButtonPressed = false;
bool lastRightButtonPressed = false;
bool lastConnected = false;
uint32_t lastReportMs = 0;

void calibrateAxes() {
  int32_t sums[AXIS_COUNT] = {};
  Serial.println("Keep both joysticks centered while calibrating...");

  for (size_t sample = 0; sample < CALIBRATION_SAMPLES; sample += 1) {
    for (size_t axis = 0; axis < AXIS_COUNT; axis += 1) {
      sums[axis] += analogRead(AXIS_PINS[axis]);
    }
    delay(CALIBRATION_SAMPLE_DELAY_MS);
  }

  for (size_t axis = 0; axis < AXIS_COUNT; axis += 1) {
    calibrations[axis].center = static_cast<int>(sums[axis] / CALIBRATION_SAMPLES);
    filters[axis].begin(calibrations[axis].center);
    Serial.printf(
      "Axis GPIO %u center: %d\n",
      AXIS_PINS[axis],
      calibrations[axis].center
    );
  }
}

void updateButton(
  bool pressed,
  bool& previousPressed,
  uint16_t xboxButton
) {
  if (pressed == previousPressed) return;
  if (pressed) gamepad->press(xboxButton);
  else gamepad->release(xboxButton);
  previousPressed = pressed;
}

void sendControllerReport(uint32_t nowMs) {
  int16_t axes[AXIS_COUNT];
  for (size_t axis = 0; axis < AXIS_COUNT; axis += 1) {
    const int filteredValue = filters[axis].update(analogRead(AXIS_PINS[axis]));
    axes[axis] = remote_input::mapAxis(filteredValue, calibrations[axis]);
  }

  const bool leftPressed = leftButton.update(
    digitalRead(LEFT_BUTTON_PIN) == LOW,
    nowMs
  );
  const bool rightPressed = rightButton.update(
    digitalRead(RIGHT_BUTTON_PIN) == LOW,
    nowMs
  );
  updateButton(leftPressed, lastLeftButtonPressed, XBOX_BUTTON_LS);
  updateButton(rightPressed, lastRightButtonPressed, XBOX_BUTTON_RS);

  gamepad->setLeftThumb(axes[0], axes[1]);
  gamepad->setRightThumb(axes[2], axes[3]);
  gamepad->sendGamepadReport();
  lastReportMs = nowMs;
}

}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(LEFT_BUTTON_PIN, INPUT_PULLUP);
  pinMode(RIGHT_BUTTON_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  for (const uint8_t pin : AXIS_PINS) {
    analogSetPinAttenuation(pin, ADC_11db);
  }
  calibrateAxes();

  auto* configuration = new XboxOneSControllerDeviceConfiguration();
  BLEHostConfiguration hostConfiguration = configuration->getIdealHostConfiguration();
  gamepad = new XboxGamepadDevice(configuration);
  compositeHID.addDevice(gamepad);

  Serial.println("Advertising as RC Car Controller...");
  compositeHID.begin(hostConfiguration);
}

void loop() {
  const uint32_t nowMs = millis();
  const bool connected = compositeHID.isConnected();
  if (connected != lastConnected) {
    Serial.println(connected ? "Controller connected" : "Controller disconnected");
    lastConnected = connected;
  }

  if (connected && remote_input::reportDue(nowMs, lastReportMs)) {
    sendControllerReport(nowMs);
  }
  delay(1);
}
