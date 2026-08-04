import { useState } from 'react'
import VoiceControls from '../VoiceControls'
import './index.css'

const Main = ({
  socket,
  fullScreen,
  isFullScreen,
  openVideoSettings,
}) => {
  const [b1, setB1] = useState(true);
  const [b2, setB2] = useState(true);
  
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
      <a onClick={fullScreen}>
        {isFullScreen ? '退出全屏' : '全屏'}
      </a>
      <a onClick={openVideoSettings}>
        设置
      </a>
      <VoiceControls socket={socket} />
    </div>
  )
}

export default Main
