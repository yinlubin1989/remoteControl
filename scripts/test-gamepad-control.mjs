import assert from 'node:assert/strict'
import {
  decodeReceiverPwmAxis,
  getDriveGamepadInput,
  getGamepadEmergencyLatched,
  getGamepadDriveOutput,
  getReceiverPwmTelemetry,
  isDriveGamepad,
  isDriveGamepadIdentity,
  normalizeGamepadAxis,
  readGamepadSnapshot,
} from '../src/gamepadControl.js'

const toBrowserAxis = rawAxis => (
  rawAxis < 0 ? rawAxis / 32768 : rawAxis / 32767
)

assert.equal(normalizeGamepadAxis(0.08), 0)
assert.equal(normalizeGamepadAxis(-0.04), 0)
assert.equal(normalizeGamepadAxis(1), 1)
assert.equal(normalizeGamepadAxis(-1), -1)

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

assert.deepEqual(readGamepadSnapshot(), {
  status: 'unsupported',
  gamepad: null,
  id: '',
})
assert.deepEqual(readGamepadSnapshot(() => []), {
  status: 'waiting',
  gamepad: null,
  id: '',
})
assert.deepEqual(readGamepadSnapshot(() => [{
  connected: false,
  id: 'RC Car Controller',
  mapping: '',
  axes: [0, 0, 0, 0],
}]), {
  status: 'waiting',
  gamepad: null,
  id: '',
})

const connectedDriveGamepad = {
  connected: true,
  id: 'RC Car Controller',
  mapping: '',
  axes: [0, 0, 0, 0],
}
assert.deepEqual(readGamepadSnapshot(() => [null, connectedDriveGamepad]), {
  status: 'connected',
  gamepad: connectedDriveGamepad,
  id: connectedDriveGamepad.id,
})
assert.deepEqual(readGamepadSnapshot(() => [{
  connected: true,
  id: 'Unsupported Controller',
  mapping: '',
  axes: [0, 0],
}]), {
  status: 'incompatible',
  gamepad: null,
  id: 'Unsupported Controller',
})

const gamepadReadError = new Error('gamepad access blocked')
const blockedSnapshot = readGamepadSnapshot(() => {
  throw gamepadReadError
})
assert.equal(blockedSnapshot.status, 'blocked')
assert.equal(blockedSnapshot.gamepad, null)
assert.equal(blockedSnapshot.id, '')
assert.equal(blockedSnapshot.error, gamepadReadError)

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
  emergencyPressed: true,
})

assert.equal(decodeReceiverPwmAxis(-1), null)
assert.equal(decodeReceiverPwmAxis(0), null)
assert.equal(decodeReceiverPwmAxis(toBrowserAxis(1000)), 750)
assert.equal(decodeReceiverPwmAxis(toBrowserAxis(16000)), 1500)
assert.equal(decodeReceiverPwmAxis(toBrowserAxis(31000)), 2250)
assert.deepEqual(getReceiverPwmTelemetry({
  id: 'RC Car Controller (Vendor: 045e Product: 02fd)',
  axes: [toBrowserAxis(6000), 0, 0, toBrowserAxis(21000)],
}), {
  supported: true,
  valid: true,
  steeringPulse: 1000,
  throttlePulse: 1750,
})
assert.deepEqual(getReceiverPwmTelemetry({
  id: 'RC Car Controller',
  axes: [-1, 0, 0, -1],
}), {
  supported: true,
  valid: false,
  steeringPulse: null,
  throttlePulse: null,
})
assert.equal(getReceiverPwmTelemetry({
  id: 'Xbox Wireless Controller',
  axes: [0, 0, 0, 0],
}).supported, false)
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
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 1 }).steeringPulse, 500)
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 1, steeringReversed: true }).steeringPulse, 2500)
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 0, steeringCenter: 1600 }).steeringPulse, 1600)

console.log('gamepad control mapping tests passed')
