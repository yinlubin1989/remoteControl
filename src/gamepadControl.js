export const GAMEPAD_AXIS_DEAD_ZONE = 0.08

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

export const isStandardDriveGamepad = gamepad => Boolean(
  gamepad
  && gamepad.connected
  && gamepad.mapping === 'standard'
  && gamepad.axes?.length >= 3
)

export const getGamepadDriveOutput = ({
  leftY,
  rightX,
  isLimit = false,
  steeringCenter = 1500,
  steeringReversed = false,
  motorReversed = false,
}) => {
  const throttleAxis = normalizeGamepadAxis(leftY)
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
  const rawThrottlePulse = 1500 + throttleAxis * throttleScale
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
