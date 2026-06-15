export const TANK_LEFT_PIN = 14
export const TANK_RIGHT_PIN = 15
export const MOTOR_STOP_PWM = 1500
export const MOTOR_PWM_RANGE = 500

const clamp = value => Math.max(-1, Math.min(1, value))

export const mixTankDrive = (turn, forward) => {
  const safeTurn = clamp(turn)
  const safeForward = clamp(forward)
  const left = safeForward + safeTurn
  const right = safeForward - safeTurn
  const scale = Math.max(1, Math.abs(left), Math.abs(right))

  return {
    left: left / scale,
    right: right / scale
  }
}

export const toMotorPwm = (value, reversed = false) => {
  const direction = reversed ? -1 : 1
  return Math.round(MOTOR_STOP_PWM + clamp(value) * MOTOR_PWM_RANGE * direction)
}

export const emitTankStop = socket => {
  socket.emit('setPulseLength', { pin: TANK_LEFT_PIN, data: MOTOR_STOP_PWM })
  socket.emit('setPulseLength', { pin: TANK_RIGHT_PIN, data: MOTOR_STOP_PWM })
}
