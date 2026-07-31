export const GAMEPAD_AXIS_DEAD_ZONE = 0.08
export const GAMEPAD_COMFORT_FULL_RAMP_MS = 4000
export const REMOTE_CONTROL_GAMEPAD_NAME = 'RC Car Controller'
export const PWM_TELEMETRY_AXIS_SCALE = 32

const PWM_TELEMETRY_INVALID_THRESHOLD = -0.95
const PWM_TELEMETRY_MIN_US = 750
const PWM_TELEMETRY_MAX_US = 2250

const GAMEPAD_COMFORT_RAMP_POINTS = [
  { elapsedMs: 0, magnitude: 0 },
  { elapsedMs: 500, magnitude: 0.15 },
  { elapsedMs: 1000, magnitude: 0.3 },
  { elapsedMs: 2000, magnitude: 0.55 },
  { elapsedMs: 3000, magnitude: 0.75 },
  { elapsedMs: GAMEPAD_COMFORT_FULL_RAMP_MS, magnitude: 1 },
]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const getComfortRampMagnitude = elapsedMs => {
  const elapsed = Math.max(0, elapsedMs)
  const nextPointIndex = GAMEPAD_COMFORT_RAMP_POINTS.findIndex(
    point => point.elapsedMs >= elapsed,
  )
  if (nextPointIndex === 0) return GAMEPAD_COMFORT_RAMP_POINTS[0].magnitude
  if (nextPointIndex === -1) return 1

  const startPoint = GAMEPAD_COMFORT_RAMP_POINTS[nextPointIndex - 1]
  const endPoint = GAMEPAD_COMFORT_RAMP_POINTS[nextPointIndex]
  const segmentProgress = (elapsed - startPoint.elapsedMs)
    / (endPoint.elapsedMs - startPoint.elapsedMs)
  return startPoint.magnitude
    + (endPoint.magnitude - startPoint.magnitude) * segmentProgress
}

const getComfortRampElapsedMs = magnitude => {
  const currentMagnitude = clamp(magnitude, 0, 1)
  const nextPointIndex = GAMEPAD_COMFORT_RAMP_POINTS.findIndex(
    point => point.magnitude >= currentMagnitude,
  )
  if (nextPointIndex === 0) return 0
  if (nextPointIndex === -1) return GAMEPAD_COMFORT_FULL_RAMP_MS

  const startPoint = GAMEPAD_COMFORT_RAMP_POINTS[nextPointIndex - 1]
  const endPoint = GAMEPAD_COMFORT_RAMP_POINTS[nextPointIndex]
  const segmentProgress = (currentMagnitude - startPoint.magnitude)
    / (endPoint.magnitude - startPoint.magnitude)
  return startPoint.elapsedMs
    + (endPoint.elapsedMs - startPoint.elapsedMs) * segmentProgress
}

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
  comfortPressed: isButtonPressed(gamepad?.buttons?.[10]),
  emergencyPressed: isButtonPressed(gamepad?.buttons?.[11]),
})

export const decodeReceiverPwmAxis = axisValue => {
  if (!Number.isFinite(axisValue)) return null
  const axis = clamp(axisValue, -1, 1)
  if (axis <= PWM_TELEMETRY_INVALID_THRESHOLD) return null

  const rawAxis = axis < 0 ? axis * 32768 : axis * 32767
  return clamp(
    Math.round(1500 + rawAxis / PWM_TELEMETRY_AXIS_SCALE),
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

  const currentElapsedMs = getComfortRampElapsedMs(Math.abs(current))
  const nextMagnitude = Math.min(
    Math.abs(target),
    getComfortRampMagnitude(currentElapsedMs + elapsedMs),
  )
  return Math.sign(target) * nextMagnitude
}

export const getGamepadDriveOutput = ({
  leftY,
  rightX,
  appliedThrottleAxis,
  throttleLimitPercent = 100,
  isLimit = false,
  steeringCenter = 1500,
  steeringReversed = false,
  motorReversed = false,
}) => {
  const throttleAxis = Number.isFinite(appliedThrottleAxis)
    ? clamp(appliedThrottleAxis, -1, 1)
    : normalizeGamepadAxis(leftY)
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
