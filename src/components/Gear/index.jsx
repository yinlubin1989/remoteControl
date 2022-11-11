import { useState, useEffect, useRef } from 'react'
import './index.css'

const Main = ({
  onChange
}) => {
  const startPoint = useRef()
  const endPoint = useRef()
  const [gearIndex, setGearIndex] = useState(0)
  const gears = ['N', 'R', 'D']
  const onTouchStart = (e) => {
    const { clientY } = e.targetTouches[0]
    startPoint.current = clientY
  }
  const onTouchMove = (e) => {
    const { clientY } = e.targetTouches[0]
    endPoint.current = clientY
  }
  const onTouchEnd = () => {
    let direction = endPoint.current > startPoint.current ? 1 : -1
    if (
      direction > 0 && gearIndex === gears.length - 1 ||
      direction < 0 && gearIndex === 0
    ) {
      direction = 0
    }
    setGearIndex(gearIndex + direction)
    
  }
  return (
    <ul className="Gear"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {gears.map((item, index) => (
        <li key={index}
          className={gearIndex == index ? 'active': ''}
        >{item}</li>
      ))}
    </ul>
  )
}

export default Main
