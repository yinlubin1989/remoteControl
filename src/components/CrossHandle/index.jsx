import { useState, useEffect, useRef } from 'react'
import './index.css'

const Main = ({
  onChange
}) => {
  const [armX, setArmX] = useState(50)
  const [armY, setArmY] = useState(50)

  const lastArmXPoint = useRef()
  const lastArmYPoint = useRef()

  const onTouchStart = (event) => {
    const { clientX, clientY } = event.targetTouches[0]
    lastArmXPoint.current = clientX
    lastArmYPoint.current = clientY
  }

  const limitBoundary = (position) => {
    if (position > 100) return 100
    if (position < 0) return 0
    return position
  }

  const onTouchMove = (event) => {
    const { clientWidth } = document.body
    const { clientX, clientY } = event.targetTouches[0]
    const xIncrease = clientX - lastArmXPoint.current
    const yIncrease = clientY - lastArmYPoint.current
    const updateArmX = armX + (xIncrease / clientWidth * 100)
    const updateArmY = armY + (yIncrease / clientWidth * 100)
    setArmX(limitBoundary(updateArmX))
    setArmY(limitBoundary(updateArmY))
    lastArmXPoint.current = clientX
    lastArmYPoint.current = clientY
  }

  useEffect(() => {
    onChange({ armX, armY })
  }, [armX, armY])

  return (
    <div className="CrossHandle"
      onTouchMove={onTouchMove}
      onTouchStart={onTouchStart}
    >
      <p style={{ left: `${armX}%`, top: `${armY}%` }}></p>
    </div>
  )
}

export default Main
