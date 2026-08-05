import assert from 'node:assert/strict'
import {
  createReceiverCalibrationFromCenter,
  DEFAULT_RECEIVER_CALIBRATION,
  decodeReceiverPwmAxis,
  getDriveGamepadInput,
  getGamepadEmergencyLatched,
  getGamepadDriveOutput,
  getReceiverCalibrationError,
  getReceiverPwmTelemetry,
  isDriveGamepad,
  isDriveGamepadIdentity,
  isReceiverCalibrationValid,
  mapReceiverPwmToGamepadAxis,
  normalizeGamepadAxis,
  parseReceiverCalibrationSettings,
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

const receiverDriveInput = getDriveGamepadInput({
  id: 'RC Car Controller',
  axes: [toBrowserAxis(8500), 0, 0, toBrowserAxis(23500)],
  buttons: [],
})
assert.deepEqual(receiverDriveInput, {
  leftY: 1,
  rightX: -1,
  emergencyPressed: false,
})
assert.deepEqual(
  getGamepadDriveOutput(receiverDriveInput),
  {
    active: true,
    steeringAxis: -1,
    throttleAxis: 1,
    steeringPulse: 2500,
    throttlePulse: 2000,
  },
)
assert.deepEqual(getDriveGamepadInput({
  id: 'RC Car Controller',
  axes: [toBrowserAxis(16000), 0.8, -0.8, toBrowserAxis(16000)],
  buttons: [],
}), {
  leftY: 0,
  rightX: 0,
  emergencyPressed: false,
})
assert.deepEqual(getDriveGamepadInput({
  id: 'RC Car Controller',
  axes: [toBrowserAxis(8500), 0.8, -0.8, -1],
  buttons: [],
}), {
  leftY: 0,
  rightX: 0,
  emergencyPressed: false,
})
const calibratedReceiverInput = getDriveGamepadInput({
  id: 'RC Car Controller',
  axes: [toBrowserAxis(13990), 0.8, -0.8, toBrowserAxis(17635)],
  buttons: [],
}, {
  receiverSteeringCalibration: {
    negativePulse: 866,
    centerPulse: 1366,
    positivePulse: 1866,
  },
  receiverThrottleCalibration: {
    negativePulse: 1109,
    centerPulse: 1609,
    positivePulse: 2109,
  },
})
assert.deepEqual(calibratedReceiverInput, {
  leftY: 0,
  rightX: 0,
  emergencyPressed: false,
})
const calibratedReceiverOutput = getGamepadDriveOutput({
  ...calibratedReceiverInput,
  steeringCenter: 1620,
})
assert.deepEqual(
  [
    calibratedReceiverOutput.steeringPulse,
    calibratedReceiverOutput.throttlePulse,
  ],
  [1620, 1500],
)
const calibratedReceiverEndpointInput = getDriveGamepadInput({
  id: 'RC Car Controller',
  axes: [toBrowserAxis(21490), 0, 0, toBrowserAxis(10135)],
  buttons: [],
}, {
  receiverSteeringCalibration: {
    negativePulse: 866,
    centerPulse: 1366,
    positivePulse: 1866,
  },
  receiverThrottleCalibration: {
    negativePulse: 1109,
    centerPulse: 1609,
    positivePulse: 2109,
  },
})
assert.deepEqual(calibratedReceiverEndpointInput, {
  leftY: -1,
  rightX: 1,
  emergencyPressed: false,
})
assert.deepEqual(
  getGamepadDriveOutput(calibratedReceiverEndpointInput),
  {
    active: true,
    steeringAxis: 1,
    throttleAxis: -1,
    steeringPulse: 500,
    throttlePulse: 1000,
  },
)

assert.equal(decodeReceiverPwmAxis(-1), null)
assert.equal(decodeReceiverPwmAxis(0), null)
assert.equal(decodeReceiverPwmAxis(toBrowserAxis(1000)), 500)
assert.equal(decodeReceiverPwmAxis(toBrowserAxis(16000)), 1500)
assert.equal(decodeReceiverPwmAxis(toBrowserAxis(31000)), 2500)
assert.deepEqual(getReceiverPwmTelemetry({
  id: 'RC Car Controller (Vendor: 045e Product: 02fd)',
  axes: [toBrowserAxis(8500), 0, 0, toBrowserAxis(19750)],
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

assert.equal(isReceiverCalibrationValid(DEFAULT_RECEIVER_CALIBRATION), true)
assert.equal(
  mapReceiverPwmToGamepadAxis(1000, DEFAULT_RECEIVER_CALIBRATION),
  -1,
)
assert.equal(
  mapReceiverPwmToGamepadAxis(1500, DEFAULT_RECEIVER_CALIBRATION),
  0,
)
assert.equal(
  mapReceiverPwmToGamepadAxis(2000, DEFAULT_RECEIVER_CALIBRATION),
  1,
)
assert.equal(
  mapReceiverPwmToGamepadAxis(700, DEFAULT_RECEIVER_CALIBRATION),
  -1,
)
assert.equal(
  mapReceiverPwmToGamepadAxis(2300, DEFAULT_RECEIVER_CALIBRATION),
  1,
)

const asymmetricCalibration = {
  negativePulse: 900,
  centerPulse: 1490,
  positivePulse: 2070,
}
assert.equal(
  mapReceiverPwmToGamepadAxis(1195, asymmetricCalibration),
  -0.5,
)
assert.equal(
  mapReceiverPwmToGamepadAxis(1780, asymmetricCalibration),
  0.5,
)

const reversedCalibration = {
  negativePulse: 2000,
  centerPulse: 1500,
  positivePulse: 1000,
}
assert.equal(isReceiverCalibrationValid(reversedCalibration), true)
assert.equal(mapReceiverPwmToGamepadAxis(2000, reversedCalibration), -1)
assert.equal(mapReceiverPwmToGamepadAxis(1750, reversedCalibration), -0.5)
assert.equal(mapReceiverPwmToGamepadAxis(1000, reversedCalibration), 1)
assert.equal(mapReceiverPwmToGamepadAxis(1250, reversedCalibration), 0.5)

const sameSideCalibration = {
  negativePulse: 1800,
  centerPulse: 1500,
  positivePulse: 2100,
}
assert.equal(isReceiverCalibrationValid(sameSideCalibration), false)
assert.match(getReceiverCalibrationError(sameSideCalibration), /中位两侧/)
assert.equal(mapReceiverPwmToGamepadAxis(1800, sameSideCalibration), 0)
assert.match(getReceiverCalibrationError({
  negativePulse: 1400,
  centerPulse: 1500,
  positivePulse: 2000,
}), /150/)
assert.match(getReceiverCalibrationError({
  negativePulse: 400,
  centerPulse: 1500,
  positivePulse: 2000,
}), /500–2500/)
assert.match(getReceiverCalibrationError({
  negativePulse: null,
  centerPulse: 1500,
  positivePulse: 2000,
}), /三个位置/)

assert.deepEqual(createReceiverCalibrationFromCenter(1366), {
  negativePulse: 866,
  centerPulse: 1366,
  positivePulse: 1866,
})
assert.deepEqual(
  createReceiverCalibrationFromCenter(500),
  DEFAULT_RECEIVER_CALIBRATION,
)
assert.deepEqual(parseReceiverCalibrationSettings(null, {
  steering: '1366',
  throttle: '1609',
}), {
  steering: {
    negativePulse: 866,
    centerPulse: 1366,
    positivePulse: 1866,
  },
  throttle: {
    negativePulse: 1109,
    centerPulse: 1609,
    positivePulse: 2109,
  },
})
assert.deepEqual(parseReceiverCalibrationSettings(JSON.stringify({
  version: 1,
  steering: reversedCalibration,
  throttle: asymmetricCalibration,
})), {
  steering: reversedCalibration,
  throttle: asymmetricCalibration,
})
assert.deepEqual(
  parseReceiverCalibrationSettings('{bad json'),
  {
    steering: DEFAULT_RECEIVER_CALIBRATION,
    throttle: DEFAULT_RECEIVER_CALIBRATION,
  },
)
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
  throttleLimitPercent: 0,
  isLimit: true,
}).throttlePulse, 1000)
assert.equal(getGamepadDriveOutput({
  leftY: 1,
  rightX: 0,
  throttleLimitPercent: 0,
  isLimit: true,
}).throttlePulse, 2000)
assert.equal(getGamepadDriveOutput({ leftY: -0.54, rightX: 0 }).throttlePulse, 1250)
assert.equal(getGamepadDriveOutput({ leftY: 0.54, rightX: 0 }).throttlePulse, 1750)
assert.equal(getGamepadDriveOutput({ leftY: -1, rightX: 0, motorReversed: true }).throttlePulse, 2000)
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 1 }).steeringPulse, 500)
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 1, steeringReversed: true }).steeringPulse, 2500)
assert.equal(getGamepadDriveOutput({ leftY: 0, rightX: 0, steeringCenter: 1600 }).steeringPulse, 1600)

console.log('gamepad control mapping tests passed')
