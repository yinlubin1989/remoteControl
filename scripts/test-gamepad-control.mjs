import assert from 'node:assert/strict'
import {
  getGamepadDriveOutput,
  isStandardDriveGamepad,
  normalizeGamepadAxis,
} from '../src/gamepadControl.js'

assert.equal(normalizeGamepadAxis(0.08), 0)
assert.equal(normalizeGamepadAxis(-0.04), 0)
assert.equal(normalizeGamepadAxis(1), 1)
assert.equal(normalizeGamepadAxis(-1), -1)

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

assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 1 }).steeringPulse, 500)
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 1, steeringReversed: true }).steeringPulse, 2500)
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 0, steeringCenter: 1600 }).steeringPulse, 1600)

console.log('gamepad control mapping tests passed')
