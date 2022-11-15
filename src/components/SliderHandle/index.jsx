import { useState, useEffect, useRef } from 'react'
import './index.css'

const Main = ({
  onChange, width = '10vw', defalutValue = 50, title, className
}) => {
  const [armY, setArmY] = useState(defalutValue)

  const lastArmYPoint = useRef();

  const onTouchStart = (event) => {
    const { clientY } = event.targetTouches[0]
    lastArmYPoint.current = clientY;
  }

  const limitBoundary = (position) => {
    if (position > 100) return 100
    if (position < 0) return 0
    return position
  }

  const onTouchMove = (event) => {
    const { clientWidth } = document.body
    const { clientY } = event.targetTouches[0]
    const yIncrease = lastArmYPoint.current - clientY
    const updateArmY = armY + (yIncrease / clientWidth * 100)
    setArmY(limitBoundary(updateArmY))
    lastArmYPoint.current = clientY
  }

  useEffect(() => {
    onChange(armY)
  }, [armY])

  return (
    <div className={`SliderHandle ${className}`}
      onTouchMove={onTouchMove}
      onTouchStart={onTouchStart}
      style={{
        width
      }}
    >
      <span className='title'>{title}</span>
      <p style={{ bottom: `${armY}%` }}>
        <span>{Math.floor(JSON.stringify(armY))}</span>
      </p>
    </div>
  )
}

export default Main
