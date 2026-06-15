import { useEffect, useRef } from 'react'
import './index.css'

const COMMAND_INTERVAL_MS = 1000 / 30
const clamp = value => Math.max(0, Math.min(100, value))

const Direction = ({ onChange }) => {
  const handleRef = useRef(null)
  const valueRef = useRef(50)
  const pendingValueRef = useRef(50)
  const lastXRef = useRef(0)
  const activePointerRef = useRef(null)
  const frameRef = useRef(null)
  const commandTimerRef = useRef(null)
  const lastCommandTimeRef = useRef(0)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    if (commandTimerRef.current !== null) clearTimeout(commandTimerRef.current)
  }, [])

  const sendLatestValue = () => {
    lastCommandTimeRef.current = performance.now()
    onChangeRef.current(pendingValueRef.current)
  }

  const scheduleUpdate = value => {
    pendingValueRef.current = value
    if (frameRef.current !== null) return

    frameRef.current = requestAnimationFrame(timestamp => {
      frameRef.current = null
      if (handleRef.current) handleRef.current.style.transform = `translate3d(${(pendingValueRef.current - 50) * 0.5}vw, -50%, 0)`

      const elapsed = timestamp - lastCommandTimeRef.current
      if (elapsed >= COMMAND_INTERVAL_MS) {
        sendLatestValue()
      } else if (commandTimerRef.current === null) {
        commandTimerRef.current = setTimeout(() => {
          commandTimerRef.current = null
          sendLatestValue()
        }, COMMAND_INTERVAL_MS - elapsed)
      }
    })
  }

  const reset = () => {
    activePointerRef.current = null
    if (commandTimerRef.current !== null) {
      clearTimeout(commandTimerRef.current)
      commandTimerRef.current = null
    }
    valueRef.current = 50
    pendingValueRef.current = 50
    if (handleRef.current) handleRef.current.style.transform = 'translate3d(0, -50%, 0)'
    onChangeRef.current(50)
  }

  const onPointerDown = event => {
    lastXRef.current = event.clientX
    activePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = event => {
    if (activePointerRef.current !== event.pointerId) return
    const nextValue = clamp(valueRef.current + (event.clientX - lastXRef.current) / document.body.clientWidth * 150)
    valueRef.current = nextValue
    lastXRef.current = event.clientX
    scheduleUpdate(nextValue)
  }

  return (
    <div
      className="Direction"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <p ref={handleRef} />
    </div>
  )
}

export default Direction
