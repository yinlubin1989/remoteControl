export const GAMEPAD_AXIS_DEAD_ZONE = 0.08
export const REMOTE_CONTROL_GAMEPAD_NAME = 'RC Car Controller'
export const PWM_TELEMETRY_AXIS_SCALE = 20

const PWM_TELEMETRY_AXIS_OFFSET = 1000
const PWM_TELEMETRY_MIN_US = 750
const PWM_TELEMETRY_MAX_US = 2250

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const normalizeGamepadAxis = (
  value,
  deadZone = GAMEPAD_AXIS_DEAD_ZONE,
) => {
  const axis = Number.isFinite(value) ? clamp(value, -1, 1) : 0
  const distance = Math.abs(axis)
  if (distance <= deadZone) return 0

  return Math.sign(axis) * (
    (distance - deadZone) / (1 - deadZone)
  )
}

export const isDriveGamepadIdentity = gamepad => Boolean(
  gamepad
  && (
    (gamepad.mapping === 'standard' && gamepad.axes?.length >= 3)
    || (
      gamepad.id?.includes(REMOTE_CONTROL_GAMEPAD_NAME)
      && gamepad.axes?.length >= 4
    )
  )
)

export const isDriveGamepad = gamepad => Boolean(
  gamepad?.connected && isDriveGamepadIdentity(gamepad)
)

const isButtonPressed = button => Boolean(
  button?.pressed || button?.value > 0.5
)

export const getDriveGamepadInput = gamepad => ({
  leftY: gamepad?.axes?.[1] || 0,
  rightX: gamepad?.axes?.[2] || 0,
  emergencyPressed: isButtonPressed(gamepad?.buttons?.[11]),
})

export const decodeReceiverPwmAxis = axisValue => {
  if (!Number.isFinite(axisValue)) return null
  const axis = clamp(axisValue, -1, 1)
  if (axis <= 0) return null

  const rawAxis = axis * 32767
  return clamp(
    Math.round(
      PWM_TELEMETRY_MIN_US
        + (rawAxis - PWM_TELEMETRY_AXIS_OFFSET)
          / PWM_TELEMETRY_AXIS_SCALE,
    ),
    PWM_TELEMETRY_MIN_US,
    PWM_TELEMETRY_MAX_US,
  )
}

export const getReceiverPwmTelemetry = gamepad => {
  const supported = Boolean(
    gamepad?.id?.includes(REMOTE_CONTROL_GAMEPAD_NAME)
    && gamepad.axes?.length >= 4,
  )
  if (!supported) {
    return {
      supported: false,
      valid: false,
      steeringPulse: null,
      throttlePulse: null,
    }
  }

  const steeringPulse = decodeReceiverPwmAxis(gamepad.axes[0])
  const throttlePulse = decodeReceiverPwmAxis(gamepad.axes[3])
  return {
    supported: true,
    valid: steeringPulse !== null && throttlePulse !== null,
    steeringPulse,
    throttlePulse,
  }
}

export const getGamepadEmergencyLatched = ({
  latched = false,
  emergencyPressed = false,
  leftY = 0,
  rightX = 0,
}) => {
  if (emergencyPressed) return true
  if (!latched) return false
  return normalizeGamepadAxis(leftY) !== 0
    || normalizeGamepadAxis(rightX) !== 0
}

export const getGamepadDriveOutput = ({
  leftY,
  rightX,
  throttleLimitPercent = 100,
  isLimit = false,
  steeringCenter = 1500,
  steeringReversed = false,
  motorReversed = false,
}) => {
  const throttleAxis = normalizeGamepadAxis(leftY)
  const throttleLimit = clamp(throttleLimitPercent, 0, 100) / 100
  const steeringAxis = normalizeGamepadAxis(rightX)
  const steeringSign = steeringReversed ? 1 : -1
  const steeringPulse = clamp(
    Math.round(steeringCenter + steeringAxis * steeringSign * 1000),
    500,
    2500,
  )

  const throttleScale = isLimit
    ? throttleAxis < 0 ? 250 : 200
    : 500
  const rawThrottlePulse = 1500 + throttleAxis * throttleLimit * throttleScale
  const throttlePulse = Math.round(
    motorReversed
      ? 1500 - (rawThrottlePulse - 1500)
      : rawThrottlePulse,
  )

  return {
    active: throttleAxis !== 0 || steeringAxis !== 0,
    steeringAxis,
    throttleAxis,
    steeringPulse,
    throttlePulse,
  }
}
