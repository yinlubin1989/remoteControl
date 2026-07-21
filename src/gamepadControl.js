export const GAMEPAD_AXIS_DEAD_ZONE = 0.08
export const GAMEPAD_COMFORT_FULL_RAMP_MS = 4000

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

export const getComfortThrottleAxis = ({
  currentAxis = 0,
  targetAxis = 0,
  elapsedMs = 0,
  enabled = false,
}) => {
  const current = clamp(currentAxis, -1, 1)
  const target = clamp(targetAxis, -1, 1)
  if (!enabled) return target
  if (target === 0) return 0
  if (current !== 0 && Math.sign(current) !== Math.sign(target)) return 0
  if (Math.abs(target) <= Math.abs(current)) return target

  const currentProgress = Math.sqrt(Math.abs(current))
  const progressStep = Math.max(0, elapsedMs) / GAMEPAD_COMFORT_FULL_RAMP_MS
  const nextProgress = Math.min(1, currentProgress + progressStep)
  const nextMagnitude = Math.min(Math.abs(target), nextProgress ** 2)
  return Math.sign(target) * nextMagnitude
}

export const getGamepadDriveOutput = ({
  leftY,
  rightX,
  appliedThrottleAxis,
  isLimit = false,
  steeringCenter = 1500,
  steeringReversed = false,
  motorReversed = false,
}) => {
  const throttleAxis = Number.isFinite(appliedThrottleAxis)
    ? clamp(appliedThrottleAxis, -1, 1)
    : normalizeGamepadAxis(leftY)
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
