#pragma once

#include <cstdint>

namespace remote_input {

constexpr int16_t AXIS_MAX = 32767;
constexpr uint16_t MIN_VALID_PULSE_US = 750;
constexpr uint16_t MAX_VALID_PULSE_US = 2250;
constexpr uint16_t DEFAULT_DEAD_ZONE_US = 20;
constexpr uint16_t MIN_CALIBRATION_TRAVEL_US = 150;
constexpr uint32_t SIGNAL_TIMEOUT_US = 100000;
constexpr uint32_t CENTER_UNLOCK_MS = 500;
constexpr uint32_t REPORT_INTERVAL_MS = 10;
constexpr int16_t PWM_TELEMETRY_AXIS_SCALE = 20;
constexpr int16_t PWM_TELEMETRY_AXIS_OFFSET = 1000;
constexpr int16_t PWM_TELEMETRY_INVALID_AXIS = -32768;

struct AxisCalibration {
  AxisCalibration(
    uint16_t minimumValue = 1000,
    uint16_t centerValue = 1500,
    uint16_t maximumValue = 2000,
    uint16_t deadZoneValue = DEFAULT_DEAD_ZONE_US
  )
    : minimum(minimumValue),
      center(centerValue),
      maximum(maximumValue),
      deadZone(deadZoneValue) {}

  uint16_t minimum;
  uint16_t center;
  uint16_t maximum;
  uint16_t deadZone;
};

inline bool isPulseValid(uint32_t pulseUs) {
  return pulseUs >= MIN_VALID_PULSE_US
    && pulseUs <= MAX_VALID_PULSE_US;
}

inline int16_t encodePulseTelemetry(uint16_t pulseUs, bool signalValid) {
  if (!signalValid || !isPulseValid(pulseUs)) {
    return PWM_TELEMETRY_INVALID_AXIS;
  }

  return static_cast<int16_t>(
    PWM_TELEMETRY_AXIS_OFFSET
      + (static_cast<int32_t>(pulseUs) - MIN_VALID_PULSE_US)
        * PWM_TELEMETRY_AXIS_SCALE
  );
}

inline bool isCalibrationValid(const AxisCalibration& calibration) {
  return calibration.minimum >= MIN_VALID_PULSE_US
    && calibration.maximum <= MAX_VALID_PULSE_US
    && calibration.center > calibration.minimum
    && calibration.center < calibration.maximum
    && calibration.center - calibration.minimum
      >= MIN_CALIBRATION_TRAVEL_US
    && calibration.maximum - calibration.center
      >= MIN_CALIBRATION_TRAVEL_US;
}

inline int16_t mapPulse(
  uint16_t pulseUs,
  const AxisCalibration& calibration
) {
  const uint16_t clampedPulse = pulseUs < calibration.minimum
    ? calibration.minimum
    : pulseUs > calibration.maximum ? calibration.maximum : pulseUs;
  const int32_t offset = static_cast<int32_t>(clampedPulse)
    - calibration.center;
  const uint32_t distance = offset < 0 ? -offset : offset;
  if (distance <= calibration.deadZone) return 0;

  const int32_t availableRange = offset < 0
    ? calibration.center - calibration.minimum - calibration.deadZone
    : calibration.maximum - calibration.center - calibration.deadZone;
  if (availableRange <= 0) return 0;

  const uint32_t adjustedDistance = distance - calibration.deadZone;
  const int32_t magnitude = static_cast<int32_t>(adjustedDistance)
    * AXIS_MAX / availableRange;
  const int16_t clampedMagnitude = static_cast<int16_t>(
    magnitude > AXIS_MAX ? AXIS_MAX : magnitude
  );
  return offset < 0 ? -clampedMagnitude : clampedMagnitude;
}

inline bool isCentered(
  uint16_t pulseUs,
  const AxisCalibration& calibration
) {
  const int32_t offset = static_cast<int32_t>(pulseUs)
    - calibration.center;
  const uint32_t distance = offset < 0 ? -offset : offset;
  return distance <= calibration.deadZone;
}

inline bool signalTimedOut(uint32_t nowUs, uint32_t updatedUs) {
  return updatedUs == 0
    || static_cast<uint32_t>(nowUs - updatedUs) > SIGNAL_TIMEOUT_US;
}

inline bool reportDue(uint32_t nowMs, uint32_t lastReportMs) {
  return static_cast<uint32_t>(nowMs - lastReportMs) >= REPORT_INTERVAL_MS;
}

inline uint16_t medianPulse(
  uint16_t first,
  uint16_t second,
  uint16_t third
) {
  if (first > second) {
    const uint16_t temporary = first;
    first = second;
    second = temporary;
  }
  if (second > third) {
    const uint16_t temporary = second;
    second = third;
    third = temporary;
  }
  return first > second ? first : second;
}

class PulseFilter {
public:
  uint16_t update(uint16_t pulseUs) {
    samples_[nextIndex_] = pulseUs;
    nextIndex_ = (nextIndex_ + 1) % 3;
    if (sampleCount_ < 3) sampleCount_ += 1;
    if (sampleCount_ < 3) return pulseUs;
    return medianPulse(samples_[0], samples_[1], samples_[2]);
  }

private:
  uint16_t samples_[3] = {1500, 1500, 1500};
  uint8_t nextIndex_ = 0;
  uint8_t sampleCount_ = 0;
};

class CenterArming {
public:
  bool update(bool signalsValid, bool centered, uint32_t nowMs) {
    if (!signalsValid) {
      lock();
      return false;
    }
    if (armed_) return true;
    if (!centered) {
      centerTracking_ = false;
      return false;
    }
    if (!centerTracking_) {
      centerTracking_ = true;
      centerSinceMs_ = nowMs;
      return false;
    }
    if (
      static_cast<uint32_t>(nowMs - centerSinceMs_)
      >= CENTER_UNLOCK_MS
    ) {
      armed_ = true;
    }
    return armed_;
  }

  void lock() {
    armed_ = false;
    centerTracking_ = false;
  }

private:
  bool armed_ = false;
  bool centerTracking_ = false;
  uint32_t centerSinceMs_ = 0;
};

class CalibrationCapture {
public:
  void begin(uint16_t steeringCenter, uint16_t throttleCenter) {
    steering_ = AxisCalibration(
      steeringCenter,
      steeringCenter,
      steeringCenter,
      DEFAULT_DEAD_ZONE_US
    );
    throttle_ = AxisCalibration(
      throttleCenter,
      throttleCenter,
      throttleCenter,
      DEFAULT_DEAD_ZONE_US
    );
  }

  void update(uint16_t steeringPulseUs, uint16_t throttlePulseUs) {
    if (steeringPulseUs < steering_.minimum) {
      steering_.minimum = steeringPulseUs;
    }
    if (steeringPulseUs > steering_.maximum) {
      steering_.maximum = steeringPulseUs;
    }
    if (throttlePulseUs < throttle_.minimum) {
      throttle_.minimum = throttlePulseUs;
    }
    if (throttlePulseUs > throttle_.maximum) {
      throttle_.maximum = throttlePulseUs;
    }
  }

  bool valid() const {
    return isCalibrationValid(steering_)
      && isCalibrationValid(throttle_);
  }

  const AxisCalibration& steering() const {
    return steering_;
  }

  const AxisCalibration& throttle() const {
    return throttle_;
  }

private:
  AxisCalibration steering_;
  AxisCalibration throttle_;
};

}
