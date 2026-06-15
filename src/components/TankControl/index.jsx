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
const COMMAND_INTERVAL_MS = 1000 / 30

const readBoolean = (key, fallback) => {
  const value = window.localStorage.getItem(key)
  return value === null ? fallback : value === 'true'
}

const TankControl = ({ socket }) => {
  const padRef = useRef(null)
  const stickRef = useRef(null)
  const leftStatusRef = useRef(null)
  const rightStatusRef = useRef(null)
  const padBoundsRef = useRef(null)
  const activePointerRef = useRef(null)
  const inputRef = useRef({ x: 0, y: 0 })
  const frameRef = useRef(null)
  const commandTimerRef = useRef(null)
  const lastCommandTimeRef = useRef(0)
  const [leftReversed, setLeftReversed] = useState(() => readBoolean(LEFT_REVERSED_KEY, false))
  const [rightReversed, setRightReversed] = useState(() => readBoolean(RIGHT_REVERSED_KEY, true))

  const updateOutputDisplay = useCallback((leftPwm, rightPwm) => {
    if (leftStatusRef.current) leftStatusRef.current.textContent = `${leftPwm} μs`
    if (rightStatusRef.current) rightStatusRef.current.textContent = `${rightPwm} μs`
  }, [])

  const updateStickPosition = useCallback((x, y) => {
    if (!stickRef.current || !padBoundsRef.current) return
    const travel = padBoundsRef.current.width * 0.42
    stickRef.current.style.transform = `translate3d(calc(-50% + ${x * travel}px), calc(-50% + ${y * travel}px), 0)`
  }, [])

  const stop = useCallback(() => {
    activePointerRef.current = null
    inputRef.current = { x: 0, y: 0 }
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    if (commandTimerRef.current !== null) {
      clearTimeout(commandTimerRef.current)
      commandTimerRef.current = null
    }
    updateStickPosition(0, 0)
    updateOutputDisplay(1500, 1500)
    emitTankStop(socket)
  }, [socket, updateOutputDisplay, updateStickPosition])

  const sendDriveCommand = useCallback((x, y) => {
    const { left, right } = mixTankDrive(x, -y)
    const leftPwm = toMotorPwm(left, leftReversed)
    const rightPwm = toMotorPwm(right, rightReversed)
    socket.emit('setPulseLength', {
      pin: TANK_LEFT_PIN,
      data: leftPwm
    })
    socket.emit('setPulseLength', {
      pin: TANK_RIGHT_PIN,
      data: rightPwm
    })
    updateOutputDisplay(leftPwm, rightPwm)
  }, [leftReversed, rightReversed, socket, updateOutputDisplay])

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) return

    frameRef.current = requestAnimationFrame(timestamp => {
      frameRef.current = null
      const { x, y } = inputRef.current
      updateStickPosition(x, y)

      const elapsed = timestamp - lastCommandTimeRef.current
      if (elapsed >= COMMAND_INTERVAL_MS) {
        lastCommandTimeRef.current = timestamp
        sendDriveCommand(x, y)
      } else if (commandTimerRef.current === null) {
        commandTimerRef.current = setTimeout(() => {
          commandTimerRef.current = null
          lastCommandTimeRef.current = performance.now()
          const latestInput = inputRef.current
          sendDriveCommand(latestInput.x, latestInput.y)
        }, COMMAND_INTERVAL_MS - elapsed)
      }
    })
  }, [sendDriveCommand, updateStickPosition])

  const updateStick = event => {
    const coalescedEvents = event.nativeEvent?.getCoalescedEvents?.()
    const pointerEvent = coalescedEvents?.[coalescedEvents.length - 1] || event
    const rect = padBoundsRef.current || padRef.current.getBoundingClientRect()
    const radius = rect.width / 2
    const rawX = (pointerEvent.clientX - rect.left - radius) / radius
    const rawY = (pointerEvent.clientY - rect.top - radius) / radius
    const magnitude = Math.hypot(rawX, rawY)
    const scale = magnitude > 1 ? 1 / magnitude : 1
    inputRef.current = { x: rawX * scale, y: rawY * scale }
    scheduleUpdate()
  }

  const onPointerDown = event => {
    padBoundsRef.current = event.currentTarget.getBoundingClientRect()
    activePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
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
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      if (commandTimerRef.current !== null) clearTimeout(commandTimerRef.current)
      stop()
    }
  }, [socket, stop])

  return (
    <section className="TankControl" aria-label="履带车控制">
      <header className="TankHeader">
        <h1>履带控制</h1>
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
            if (activePointerRef.current === event.pointerId) updateStick(event)
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
            ref={stickRef}
            className="TankStick"
          />
        </div>

        <div className="TankSettings">
          <div className="TankStatus">
            <span>CH 14</span>
            <strong>左履带</strong>
            <b ref={leftStatusRef}>1500 μs</b>
          </div>
          <div className="TankStatus">
            <span>CH 15</span>
            <strong>右履带</strong>
            <b ref={rightStatusRef}>1500 μs</b>
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
