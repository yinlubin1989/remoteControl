import { useState, useEffect, useRef } from 'react'
import VoiceControls from '../VoiceControls'
import './index.css'

const CONTROL_MODE_LABELS = {
  separate: '分离',
  joystick: '摇杆',
  cockpit: '驾驶舱',
}

const NEXT_CONTROL_MODE = {
  separate: 'joystick',
  joystick: 'cockpit',
  cockpit: 'separate',
}

const Main = ({
  socket,
  limitChange,
  fullScreen,
  isFullScreen,
  openVideoSettings,
  controlMode,
  toggleControlMode,
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
      <a
        className="ControlModeSwitch"
        onClick={toggleControlMode}
        title={`切换到${CONTROL_MODE_LABELS[NEXT_CONTROL_MODE[controlMode]]}模式`}
      >
        模式·{CONTROL_MODE_LABELS[controlMode]}
      </a>
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
