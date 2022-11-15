import { useState, useEffect, useRef } from 'react'
import './index.css'

const Main = ({
  onChange
}) => {
  const lastArmXPoint = useRef();
  const [armX, setArmX] = useState(50)
  const limitBoundary = (position) => {
    if (position > 100) return 100
    if (position < 0) return 0
    return position
  }
  const onTouchStart = (e) => {
    const { clientX } = e.targetTouches[0]
    lastArmXPoint.current = clientX
  }  
  const onTouchMove = (e) => {
    const { clientWidth } = document.body
    const { clientX } = e.targetTouches[0]
    const xIncrease = clientX - lastArmXPoint.current
    const updateArmX = armX + (xIncrease / clientWidth * 150)
    setArmX(limitBoundary(updateArmX))
    lastArmXPoint.current = clientX
  }
  const onTouchEnd = () => {
    setArmX(50)
  }
  useEffect(() => {
    onChange(armX)
  }, [armX])
  return (
    <div className="Direction"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <p style={{ left: `${armX}%` }} />
    </div>
  )
}

export default Main
