import assert from 'node:assert/strict'
import {
  getComfortThrottleAxis,
  getDriveGamepadInput,
  getGamepadEmergencyLatched,
  getGamepadDriveOutput,
  isDriveGamepad,
  isDriveGamepadIdentity,
  normalizeGamepadAxis,
} from '../src/gamepadControl.js'

assert.equal(normalizeGamepadAxis(0.08), 0)
assert.equal(normalizeGamepadAxis(-0.04), 0)
assert.equal(normalizeGamepadAxis(1), 1)
assert.equal(normalizeGamepadAxis(-1), -1)

assert.equal(getComfortThrottleAxis({
  currentAxis: 0,
  targetAxis: -1,
  elapsedMs: 1000,
  enabled: false,
}), -1)
const comfortAfterHalfSecond = getComfortThrottleAxis({
  currentAxis: 0,
  targetAxis: -1,
  elapsedMs: 500,
  enabled: true,
})
assert.equal(comfortAfterHalfSecond, -0.15)
const comfortAfterOneSecond = getComfortThrottleAxis({
  currentAxis: comfortAfterHalfSecond,
  targetAxis: -1,
  elapsedMs: 500,
  enabled: true,
})
assert.equal(comfortAfterOneSecond, -0.3)
const comfortAfterTwoSeconds = getComfortThrottleAxis({
  currentAxis: comfortAfterOneSecond,
  targetAxis: -1,
  elapsedMs: 1000,
  enabled: true,
})
assert.equal(comfortAfterTwoSeconds, -0.55)
const comfortAfterThreeSeconds = getComfortThrottleAxis({
  currentAxis: comfortAfterTwoSeconds,
  targetAxis: -1,
  elapsedMs: 1000,
  enabled: true,
})
assert.equal(comfortAfterThreeSeconds, -0.75)
assert.equal(getComfortThrottleAxis({
  currentAxis: comfortAfterThreeSeconds,
  targetAxis: -1,
  elapsedMs: 1000,
  enabled: true,
}), -1)
assert.equal(getComfortThrottleAxis({
  currentAxis: -0.8,
  targetAxis: -0.3,
  elapsedMs: 16,
  enabled: true,
}), -0.3)
assert.equal(getComfortThrottleAxis({
  currentAxis: -0.3,
  targetAxis: -1,
  elapsedMs: 1000,
  enabled: true,
}), -0.55)
assert.equal(getComfortThrottleAxis({
  currentAxis: -0.8,
  targetAxis: 0,
  elapsedMs: 16,
  enabled: true,
}), 0)
assert.equal(getComfortThrottleAxis({
  currentAxis: -0.8,
  targetAxis: 0.8,
  elapsedMs: 16,
  enabled: true,
}), 0)

assert.equal(getComfortThrottleAxis({
  currentAxis: 0,
  targetAxis: 1,
  elapsedMs: 4000,
  enabled: true,
}), 1)

assert.equal(isDriveGamepad({
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
}), true)
assert.equal(isDriveGamepad({
  connected: true,
  id: 'RC Car Controller (Vendor: 045e Product: 02fd)',
  mapping: '',
  axes: [0, 0, 0, 0],
}), true)
assert.equal(isDriveGamepad({
  connected: true,
  mapping: '',
  axes: [0, 0, 0, 0],
}), false)
assert.equal(isDriveGamepadIdentity({
  connected: false,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
}), true)

const remoteInput = getDriveGamepadInput({
  axes: [0.25, -0.5, 0.75, -0.25],
  buttons: Array.from({ length: 12 }, (_, index) => ({
    pressed: index === 10,
    value: index === 11 ? 1 : 0,
  })),
})
assert.deepEqual(remoteInput, {
  leftY: -0.5,
  rightX: 0.75,
  comfortPressed: true,
  emergencyPressed: true,
})
assert.equal(getGamepadEmergencyLatched({
  emergencyPressed: true,
  leftY: -1,
  rightX: 1,
}), true)
assert.equal(getGamepadEmergencyLatched({
  latched: true,
  leftY: 0.2,
  rightX: 0,
}), true)
assert.equal(getGamepadEmergencyLatched({
  latched: true,
  leftY: 0.04,
  rightX: -0.08,
}), false)

const centered = getGamepadDriveOutput({ leftY: 0, rightX: 0 })
assert.deepEqual(
  [centered.active, centered.throttlePulse, centered.steeringPulse],
  [false, 1500, 1500],
)

assert.equal(getGamepadDriveOutput({ leftY: -1, rightX: 0 }).throttlePulse, 1000)
assert.equal(getGamepadDriveOutput({ leftY: 1, rightX: 0 }).throttlePulse, 2000)
assert.equal(getGamepadDriveOutput({
  leftY: -1,
  rightX: 0,
  throttleLimitPercent: 50,
}).throttlePulse, 1250)
assert.equal(getGamepadDriveOutput({
  leftY: 1,
  rightX: 0,
  throttleLimitPercent: 50,
}).throttlePulse, 1750)
assert.equal(getGamepadDriveOutput({ leftY: -1, rightX: 0, isLimit: true }).throttlePulse, 1250)
assert.equal(getGamepadDriveOutput({ leftY: 1, rightX: 0, isLimit: true }).throttlePulse, 1700)
assert.equal(getGamepadDriveOutput({ leftY: -1, rightX: 0, motorReversed: true }).throttlePulse, 2000)
assert.equal(getGamepadDriveOutput({
  leftY: -1,
  rightX: 0,
  appliedThrottleAxis: -0.5,
}).throttlePulse, 1250)

assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 1 }).steeringPulse, 500)
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 1, steeringReversed: true }).steeringPulse, 2500)
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 0, steeringCenter: 1600 }).steeringPulse, 1600)

console.log('gamepad control mapping tests passed')
