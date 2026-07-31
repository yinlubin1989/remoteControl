#include <unity.h>

#include "remote_input.h"

void test_pulse_validation_and_mapping() {
  const remote_input::AxisCalibration calibration;
  TEST_ASSERT_FALSE(remote_input::isPulseValid(749));
  TEST_ASSERT_TRUE(remote_input::isPulseValid(750));
  TEST_ASSERT_TRUE(remote_input::isPulseValid(2250));
  TEST_ASSERT_FALSE(remote_input::isPulseValid(2251));
  TEST_ASSERT_EQUAL_INT16(0, remote_input::mapPulse(1500, calibration));
  TEST_ASSERT_EQUAL_INT16(0, remote_input::mapPulse(1519, calibration));
  TEST_ASSERT_EQUAL_INT16(-32767, remote_input::mapPulse(1000, calibration));
  TEST_ASSERT_EQUAL_INT16(32767, remote_input::mapPulse(2000, calibration));
}

void test_pulse_telemetry_encoding() {
  TEST_ASSERT_EQUAL_INT16(
    remote_input::PWM_TELEMETRY_INVALID_AXIS,
    remote_input::encodePulseTelemetry(1500, false)
  );
  TEST_ASSERT_EQUAL_INT16(
    remote_input::PWM_TELEMETRY_INVALID_AXIS,
    remote_input::encodePulseTelemetry(700, true)
  );
  TEST_ASSERT_EQUAL_INT16(1000, remote_input::encodePulseTelemetry(750, true));
  TEST_ASSERT_EQUAL_INT16(16000, remote_input::encodePulseTelemetry(1500, true));
  TEST_ASSERT_EQUAL_INT16(31000, remote_input::encodePulseTelemetry(2250, true));
}

void test_asymmetric_calibration_mapping() {
  const remote_input::AxisCalibration calibration {
    900,
    1470,
    2070,
    25,
  };
  TEST_ASSERT_TRUE(remote_input::isCalibrationValid(calibration));
  TEST_ASSERT_EQUAL_INT16(0, remote_input::mapPulse(1490, calibration));
  TEST_ASSERT_EQUAL_INT16(-32767, remote_input::mapPulse(900, calibration));
  TEST_ASSERT_EQUAL_INT16(32767, remote_input::mapPulse(2070, calibration));
}

void test_median_filter() {
  remote_input::PulseFilter filter;
  TEST_ASSERT_EQUAL_UINT16(1500, filter.update(1500));
  TEST_ASSERT_EQUAL_UINT16(1900, filter.update(1900));
  TEST_ASSERT_EQUAL_UINT16(1500, filter.update(1490));
  TEST_ASSERT_EQUAL_UINT16(1490, filter.update(1480));
}

void test_signal_timeout_and_report_interval() {
  TEST_ASSERT_TRUE(remote_input::signalTimedOut(100000, 0));
  TEST_ASSERT_FALSE(remote_input::signalTimedOut(100000, 1));
  TEST_ASSERT_TRUE(remote_input::signalTimedOut(100002, 1));
  TEST_ASSERT_FALSE(remote_input::signalTimedOut(4, UINT32_MAX - 5));
  TEST_ASSERT_FALSE(remote_input::reportDue(9, 0));
  TEST_ASSERT_TRUE(remote_input::reportDue(10, 0));
  TEST_ASSERT_TRUE(remote_input::reportDue(4, UINT32_MAX - 5));
}

void test_center_arming() {
  remote_input::CenterArming arming;
  TEST_ASSERT_FALSE(arming.update(true, false, 0));
  TEST_ASSERT_FALSE(arming.update(true, true, 100));
  TEST_ASSERT_FALSE(arming.update(true, true, 599));
  TEST_ASSERT_TRUE(arming.update(true, true, 600));
  TEST_ASSERT_TRUE(arming.update(true, false, 700));
  TEST_ASSERT_FALSE(arming.update(false, false, 701));
  TEST_ASSERT_FALSE(arming.update(true, true, 800));
  TEST_ASSERT_TRUE(arming.update(true, true, 1300));
}

void test_calibration_capture() {
  remote_input::CalibrationCapture capture;
  capture.begin(1500, 1490);
  capture.update(1000, 980);
  capture.update(2020, 2010);
  TEST_ASSERT_TRUE(capture.valid());
  TEST_ASSERT_EQUAL_UINT16(1000, capture.steering().minimum);
  TEST_ASSERT_EQUAL_UINT16(1500, capture.steering().center);
  TEST_ASSERT_EQUAL_UINT16(2020, capture.steering().maximum);
  TEST_ASSERT_EQUAL_UINT16(980, capture.throttle().minimum);
  TEST_ASSERT_EQUAL_UINT16(1490, capture.throttle().center);
  TEST_ASSERT_EQUAL_UINT16(2010, capture.throttle().maximum);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_pulse_validation_and_mapping);
  RUN_TEST(test_pulse_telemetry_encoding);
  RUN_TEST(test_asymmetric_calibration_mapping);
  RUN_TEST(test_median_filter);
  RUN_TEST(test_signal_timeout_and_report_interval);
  RUN_TEST(test_center_arming);
  RUN_TEST(test_calibration_capture);
  return UNITY_END();
}
