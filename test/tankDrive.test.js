import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTOR_STOP_PWM,
  TANK_LEFT_PIN,
  TANK_RIGHT_PIN,
  emitTankStop,
  mixTankDrive,
  toMotorPwm
} from '../src/utils/tankDrive.js'

test('stops both motors at the joystick center', () => {
  assert.deepEqual(mixTankDrive(0, 0), { left: 0, right: 0 })
  assert.equal(toMotorPwm(0), MOTOR_STOP_PWM)
})

test('drives both tracks forward and backward', () => {
  assert.deepEqual(mixTankDrive(0, 1), { left: 1, right: 1 })
  assert.deepEqual(mixTankDrive(0, -1), { left: -1, right: -1 })
})

test('supports in-place left and right turns', () => {
  assert.deepEqual(mixTankDrive(1, 0), { left: 1, right: -1 })
  assert.deepEqual(mixTankDrive(-1, 0), { left: -1, right: 1 })
})

test('normalizes diagonal input without exceeding motor bounds', () => {
  assert.deepEqual(mixTankDrive(1, 1), { left: 1, right: 0 })
  assert.deepEqual(mixTankDrive(-1, 1), { left: 0, right: 1 })
  const mixed = mixTankDrive(4, -3)
  assert.ok(Math.abs(mixed.left) <= 1)
  assert.ok(Math.abs(mixed.right) <= 1)
})

test('maps motor commands to the configured PWM range and polarity', () => {
  assert.equal(toMotorPwm(1), 2000)
  assert.equal(toMotorPwm(-1), 1000)
  assert.equal(toMotorPwm(1, true), 1000)
  assert.equal(toMotorPwm(-1, true), 2000)
  assert.equal(toMotorPwm(9), 2000)
})

test('emits a neutral command for both tank channels', () => {
  const commands = []
  const socket = { emit: (event, command) => commands.push({ event, command }) }

  emitTankStop(socket)

  assert.deepEqual(commands, [
    { event: 'setPulseLength', command: { pin: TANK_LEFT_PIN, data: MOTOR_STOP_PWM } },
    { event: 'setPulseLength', command: { pin: TANK_RIGHT_PIN, data: MOTOR_STOP_PWM } }
  ])
})
