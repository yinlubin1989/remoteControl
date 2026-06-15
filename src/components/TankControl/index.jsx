import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TANK_LEFT_PIN,
  TANK_RIGHT_PIN,
  emitTankStop,
  mixTankDrive,
  toMotorPwm
} from '../../utils/tankDrive'
import './index.css'

const LEFT_REVERSED_KEY = 'tank-left-reversed'
const RIGHT_REVERSED_KEY = 'tank-right-reversed'

const readBoolean = (key, fallback) => {
  const value = window.localStorage.getItem(key)
  return value === null ? fallback : value === 'true'
}

const TankControl = ({ socket }) => {
  const padRef = useRef(null)
  const [stick, setStick] = useState({ x: 0, y: 0 })
  const [leftReversed, setLeftReversed] = useState(() => readBoolean(LEFT_REVERSED_KEY, false))
  const [rightReversed, setRightReversed] = useState(() => readBoolean(RIGHT_REVERSED_KEY, true))

  const stop = useCallback(() => {
    setStick({ x: 0, y: 0 })
    emitTankStop(socket)
  }, [socket])

  const drive = useCallback((x, y) => {
    const { left, right } = mixTankDrive(x, -y)
    socket.emit('setPulseLength', {
      pin: TANK_LEFT_PIN,
      data: toMotorPwm(left, leftReversed)
    })
    socket.emit('setPulseLength', {
      pin: TANK_RIGHT_PIN,
      data: toMotorPwm(right, rightReversed)
    })
  }, [leftReversed, rightReversed, socket])

  const updateStick = event => {
    const rect = padRef.current.getBoundingClientRect()
    const radius = rect.width / 2
    const rawX = (event.clientX - rect.left - radius) / radius
    const rawY = (event.clientY - rect.top - radius) / radius
    const magnitude = Math.hypot(rawX, rawY)
    const scale = magnitude > 1 ? 1 / magnitude : 1
    const nextStick = { x: rawX * scale, y: rawY * scale }

    setStick(nextStick)
    drive(nextStick.x, nextStick.y)
  }

  const onPointerDown = event => {
    event.currentTarget.setPointerCapture(event.pointerId)
    updateStick(event)
  }

  useEffect(() => {
    window.localStorage.setItem(LEFT_REVERSED_KEY, String(leftReversed))
    window.localStorage.setItem(RIGHT_REVERSED_KEY, String(rightReversed))
    stop()
  }, [leftReversed, rightReversed])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) stop()
    }

    socket.on('connect', stop)
    socket.on('disconnect', stop)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', onVisibilityChange)
    stop()

    return () => {
      socket.off('connect', stop)
      socket.off('disconnect', stop)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }, [socket, stop])

  return (
    <section className="TankControl" aria-label="履带车控制">
      <header className="TankHeader">
        <div>
          <span className="TankEyebrow">DUAL MOTOR DRIVE</span>
          <h1>履带差速控制</h1>
        </div>
        <button className="TankStop" type="button" onPointerDown={stop}>双侧停止</button>
      </header>

      <div className="TankLayout">
        <div
          ref={padRef}
          className="TankPad"
          role="application"
          aria-label="履带摇杆"
          onPointerDown={onPointerDown}
          onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updateStick(event)
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
        >
          <span className="TankAxis TankAxisX" />
          <span className="TankAxis TankAxisY" />
          <span className="TankDirection TankDirectionForward">前</span>
          <span className="TankDirection TankDirectionBack">后</span>
          <span className="TankDirection TankDirectionLeft">左</span>
          <span className="TankDirection TankDirectionRight">右</span>
          <span
            className="TankStick"
            style={{
              left: `${50 + stick.x * 42}%`,
              top: `${50 + stick.y * 42}%`
            }}
          />
        </div>

        <div className="TankSettings">
          <div className="TankStatus">
            <span>CH 14</span>
            <strong>左履带</strong>
            <b>{toMotorPwm(mixTankDrive(stick.x, -stick.y).left, leftReversed)} μs</b>
          </div>
          <div className="TankStatus">
            <span>CH 15</span>
            <strong>右履带</strong>
            <b>{toMotorPwm(mixTankDrive(stick.x, -stick.y).right, rightReversed)} μs</b>
          </div>
          <label className="TankToggle">
            <input
              type="checkbox"
              checked={leftReversed}
              onChange={event => setLeftReversed(event.target.checked)}
            />
            <span />左电机反向
          </label>
          <label className="TankToggle">
            <input
              type="checkbox"
              checked={rightReversed}
              onChange={event => setRightReversed(event.target.checked)}
            />
            <span />右电机反向
          </label>
          <p>按住摇杆行驶，松开立即回中停止。横向拉满可原地转向。</p>
        </div>
      </div>
    </section>
  )
}

export default TankControl
