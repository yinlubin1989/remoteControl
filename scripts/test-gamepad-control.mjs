import assert from 'node:assert/strict'
import {
  getComfortThrottleAxis,
  getGamepadDriveOutput,
  isStandardDriveGamepad,
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
assert.equal(getComfortThrottleAxis({
  currentAxis: 0,
  targetAxis: -1,
  elapsedMs: 1000,
  enabled: true,
}), -0.5)
assert.equal(getComfortThrottleAxis({
  currentAxis: -0.5,
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
  elapsedMs: 2000,
  enabled: true,
}), 1)

assert.equal(isStandardDriveGamepad({
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
}), true)
assert.equal(isStandardDriveGamepad({
  connected: true,
  mapping: '',
  axes: [0, 0, 0, 0],
}), false)

const centered = getGamepadDriveOutput({ leftY: 0, rightX: 0 })
assert.deepEqual(
  [centered.active, centered.throttlePulse, centered.steeringPulse],
  [false, 1500, 1500],
)

assert.equal(getGamepadDriveOutput({ leftY: -1, rightX: 0 }).throttlePulse, 1000)
assert.equal(getGamepadDriveOutput({ leftY: 1, rightX: 0 }).throttlePulse, 2000)
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
