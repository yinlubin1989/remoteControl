import { useEffect, useRef, useState } from 'react'
import './index.css'

const CENTER = 50
const GESTURE_TO_JOYSTICK_RATIO = 0.5

const CarJoystick = ({ onChange }) => {
  const controlRef = useRef(null)
  const activePointerRef = useRef(null)
  const gestureStartRef = useRef(null)
  const [position, setPosition] = useState({ x: CENTER, y: CENTER })
  const [active, setActive] = useState(false)

  const updatePosition = (clientX, clientY) => {
    const bounds = controlRef.current?.getBoundingClientRect()
    const gestureStart = gestureStartRef.current
    if (!bounds || !gestureStart) return

    let offsetX = gestureStart.position.x - CENTER + (
      (clientX - gestureStart.clientX) / bounds.width
    ) * 100 * GESTURE_TO_JOYSTICK_RATIO
    let offsetY = gestureStart.position.y - CENTER + (
      (clientY - gestureStart.clientY) / bounds.height
    ) * 100 * GESTURE_TO_JOYSTICK_RATIO
    const distance = Math.hypot(offsetX, offsetY)

    if (distance > CENTER) {
      const scale = CENTER / distance
      offsetX *= scale
      offsetY *= scale
    }

    setPosition({
      x: CENTER + offsetX,
      y: CENTER + offsetY,
    })
  }

  const release = (event) => {
    if (
      activePointerRef.current !== null
      && event.pointerId !== activePointerRef.current
    ) return

    activePointerRef.current = null
    gestureStartRef.current = null
    setActive(false)
    setPosition({ x: CENTER, y: CENTER })
  }

  const onPointerDown = (event) => {
    activePointerRef.current = event.pointerId
    gestureStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      position,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setActive(true)
  }

  const onPointerMove = (event) => {
    if (event.pointerId !== activePointerRef.current) return
    updatePosition(event.clientX, event.clientY)
  }

  useEffect(() => {
    onChange({ ...position, active })
  }, [active, onChange, position])

  return (
    <section className="CarJoystickPanel" aria-label="单摇杆小车控制">
      <header className="CarJoystickHeader">
        <div>
          <span>DRIVE VECTOR</span>
          <strong>单摇杆驾驶</strong>
        </div>
        <small>{active ? '控制中' : '松手回中'}</small>
      </header>
      <div className="CarJoystickStage">
        <span className="CarJoystickDirection forward">前进</span>
        <span className="CarJoystickDirection reverse">倒车</span>
        <span className="CarJoystickDirection left">左</span>
        <span className="CarJoystickDirection right">右</span>
        <div
          ref={controlRef}
          className={`CarJoystick${active ? ' active' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <div className="CarJoystickAxis horizontal" />
          <div className="CarJoystickAxis vertical" />
          <div
            className="CarJoystickKnob"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          >
            <span />
          </div>
        </div>
      </div>
    </section>
  )
}

export default CarJoystick
