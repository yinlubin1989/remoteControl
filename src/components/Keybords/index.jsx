import { useState, useEffect, useRef } from 'react'
import './index.css'

const Main = ({
  socket, videoChange, limitChange
}) => {
  const [b1, setB1] = useState(true);
  const [b2, setB2] = useState(true);
  const [b3, setB3] = useState(true);
  useEffect(() => {
    limitChange(!b3)
  }, [b3])
  
  return (
    <div className="Keyboards">
      <a className={b1 ? 'off' : ''}
        onClick={() => {
          socket.emit(
            b1 ? 'channelOn' : 'channelOff',
            { pin: 1 }
          )
          setB1(!b1)
        }}
      >前灯</a>
      <a className={b2 ? 'off' : ''}
        onClick={() => {
          socket.emit(
            b2 ? 'channelOn' : 'channelOff',
            { pin: 0 }
          )
          setB2(!b2)
        }}
      >后灯</a>
      <a className={b3 ? 'off' : ''}
        onClick={() => {
          setB3(!b3)
        }}
      >限速</a>
      <a onClick={videoChange}>
        图传
      </a>
    </div>
  )
}

export default Main
