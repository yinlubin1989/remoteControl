#include <unity.h>

#include "remote_input.h"

void test_axis_mapping() {
  const remote_input::AxisCalibration calibration;
  TEST_ASSERT_EQUAL_INT16(0, remote_input::mapAxis(2048, calibration));
  TEST_ASSERT_EQUAL_INT16(0, remote_input::mapAxis(2148, calibration));
  TEST_ASSERT_EQUAL_INT16(-32767, remote_input::mapAxis(0, calibration));
  TEST_ASSERT_EQUAL_INT16(32767, remote_input::mapAxis(4095, calibration));
  TEST_ASSERT_LESS_THAN_INT16(0, remote_input::mapAxis(1000, calibration));
  TEST_ASSERT_GREATER_THAN_INT16(0, remote_input::mapAxis(3000, calibration));
}

void test_button_debounce() {
  remote_input::DebouncedButton button;
  TEST_ASSERT_FALSE(button.update(true, 0));
  TEST_ASSERT_FALSE(button.update(false, 10));
  TEST_ASSERT_FALSE(button.update(true, 20));
  TEST_ASSERT_FALSE(button.update(true, 44));
  TEST_ASSERT_TRUE(button.update(true, 45));
  TEST_ASSERT_TRUE(button.update(false, 50));
  TEST_ASSERT_TRUE(button.update(false, 74));
  TEST_ASSERT_FALSE(button.update(false, 75));
}

void test_report_interval() {
  TEST_ASSERT_FALSE(remote_input::reportDue(9, 0));
  TEST_ASSERT_TRUE(remote_input::reportDue(10, 0));
  TEST_ASSERT_TRUE(remote_input::reportDue(4, UINT32_MAX - 5));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_axis_mapping);
  RUN_TEST(test_button_debounce);
  RUN_TEST(test_report_interval);
  return UNITY_END();
}
