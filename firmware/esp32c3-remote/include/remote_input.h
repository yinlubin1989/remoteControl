#pragma once

#include <cstdint>

namespace remote_input {

constexpr int16_t AXIS_MAX = 32767;
constexpr uint32_t BUTTON_DEBOUNCE_MS = 25;
constexpr uint32_t REPORT_INTERVAL_MS = 10;

struct AxisCalibration {
  int minimum = 0;
  int center = 2048;
  int maximum = 4095;
  int deadZone = 120;
};

inline int16_t mapAxis(int rawValue, const AxisCalibration& calibration) {
  const int clampedValue = rawValue < calibration.minimum
    ? calibration.minimum
    : rawValue > calibration.maximum ? calibration.maximum : rawValue;
  const int offset = clampedValue - calibration.center;
  const int distance = offset < 0 ? -offset : offset;
  if (distance <= calibration.deadZone) return 0;

  const int availableRange = offset < 0
    ? calibration.center - calibration.minimum - calibration.deadZone
    : calibration.maximum - calibration.center - calibration.deadZone;
  if (availableRange <= 0) return 0;

  const int adjustedDistance = distance - calibration.deadZone;
  const int32_t magnitude = static_cast<int32_t>(adjustedDistance)
    * AXIS_MAX / availableRange;
  const int16_t clampedMagnitude = static_cast<int16_t>(
    magnitude > AXIS_MAX ? AXIS_MAX : magnitude
  );
  return offset < 0 ? -clampedMagnitude : clampedMagnitude;
}

inline bool reportDue(uint32_t nowMs, uint32_t lastReportMs) {
  return static_cast<uint32_t>(nowMs - lastReportMs) >= REPORT_INTERVAL_MS;
}

class DebouncedButton {
public:
  bool update(bool rawPressed, uint32_t nowMs) {
    if (rawPressed != candidatePressed_) {
      candidatePressed_ = rawPressed;
      candidateSinceMs_ = nowMs;
    }
    if (
      stablePressed_ != candidatePressed_
      && static_cast<uint32_t>(nowMs - candidateSinceMs_) >= BUTTON_DEBOUNCE_MS
    ) {
      stablePressed_ = candidatePressed_;
    }
    return stablePressed_;
  }

  bool pressed() const {
    return stablePressed_;
  }

private:
  bool candidatePressed_ = false;
  bool stablePressed_ = false;
  uint32_t candidateSinceMs_ = 0;
};

}
