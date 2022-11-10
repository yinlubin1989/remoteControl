import { useState, useEffect, useRef } from 'react'
import './index.css'

const Main = ({
  onChange
}) => {
  const [armY, setArmY] = useState(50);

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
    const yIncrease = clientY - lastArmYPoint.current
    const updateArmY = armY + (yIncrease / clientWidth * 100)
    setArmY(limitBoundary(updateArmY))
    lastArmYPoint.current = clientY
  }

  useEffect(() => {
    onChange({ armY })
  }, [armY])

  return (
    <div className="SliderHandle"
      onTouchMove={onTouchMove}
      onTouchStart={onTouchStart}
    >
      <p style={{ top: `${armY}%` }}></p>
    </div>
  )
}

export default Main
