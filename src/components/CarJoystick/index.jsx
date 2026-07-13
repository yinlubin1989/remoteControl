import { useEffect, useRef, useState } from 'react'
import './index.css'

const CENTER = 50

const CarJoystick = ({ onChange }) => {
  const controlRef = useRef(null)
  const activePointerRef = useRef(null)
  const [position, setPosition] = useState({ x: CENTER, y: CENTER })
  const [active, setActive] = useState(false)

  const updatePosition = (clientX, clientY) => {
    const bounds = controlRef.current?.getBoundingClientRect()
    if (!bounds) return

    const radius = bounds.width / 2
    let offsetX = clientX - (bounds.left + radius)
    let offsetY = clientY - (bounds.top + radius)
    const distance = Math.hypot(offsetX, offsetY)

    if (distance > radius) {
      const scale = radius / distance
      offsetX *= scale
      offsetY *= scale
    }

    setPosition({
      x: CENTER + (offsetX / radius) * CENTER,
      y: CENTER + (offsetY / radius) * CENTER,
    })
  }

  const release = (event) => {
    if (
      activePointerRef.current !== null
      && event.pointerId !== activePointerRef.current
    ) return

    activePointerRef.current = null
    setActive(false)
    setPosition({ x: CENTER, y: CENTER })
  }

  const onPointerDown = (event) => {
    activePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setActive(true)
    updatePosition(event.clientX, event.clientY)
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
