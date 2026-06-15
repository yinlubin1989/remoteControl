import { useEffect, useRef } from 'react'
import './index.css'

const clamp = value => Math.max(0, Math.min(100, value))

const SliderHandle = ({
  onChange, width = '10vw', defalutValue = 50, title, className = ''
}) => {
  const lineRef = useRef(null)
  const valueLabelRef = useRef(null)
  const valueRef = useRef(defalutValue)
  const pendingValueRef = useRef(defalutValue)
  const lastYRef = useRef(0)
  const activePointerRef = useRef(null)
  const frameRef = useRef(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onChangeRef.current(defalutValue)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const scheduleUpdate = value => {
    pendingValueRef.current = value
    if (frameRef.current !== null) return

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const nextValue = pendingValueRef.current
      if (lineRef.current) lineRef.current.style.bottom = `${nextValue}%`
      if (valueLabelRef.current) valueLabelRef.current.textContent = Math.floor(nextValue)
      onChangeRef.current(nextValue)
    })
  }

  const onPointerDown = event => {
    lastYRef.current = event.clientY
    activePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = event => {
    if (activePointerRef.current !== event.pointerId) return
    const nextValue = clamp(valueRef.current + (lastYRef.current - event.clientY) / document.body.clientWidth * 100)
    valueRef.current = nextValue
    lastYRef.current = event.clientY
    scheduleUpdate(nextValue)
  }

  const endDrag = () => {
    activePointerRef.current = null
  }

  return (
    <div
      className={`SliderHandle ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      style={{ width }}
    >
      <span className="title">{title}</span>
      <p ref={lineRef} style={{ bottom: `${defalutValue}%` }}>
        <span ref={valueLabelRef}>{Math.floor(defalutValue)}</span>
      </p>
    </div>
  )
}

export default SliderHandle
