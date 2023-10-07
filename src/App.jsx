import { useState, useEffect, useRef } from 'react'
import WSAvcPlayer from "ws-avc-player"
import io from 'socket.io-client'
import CrossHandle from './components/CrossHandle'
import SliderHandle from './components/SliderHandle'
import DiskHandle from './components/DiskHandle'
import Button from './components/Button'
import Keybords from './components/Keybords'
import Modal from './components/Modal'
import Gear from './components/Gear'
import Direction from './components/Direction'

import './App.css'

const socket = io('http://39.106.81.156:5005')
window.socket = socket

socket.on("connect", () => {
  socket.emit('setPulseLength', {
    pin: 15,
    data: 1500
  })
  setTimeout(() => {
    [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].forEach((pin) => {
      socket.emit('channelOff', { pin })
    })
  }, 500)
  socket.emit('hb')
  setInterval(() => {
    socket.emit('hb')
  }, 500)
})

function App() {
  const refSpeed = useRef()
  const gearValue = useRef()
  const [pannel, setPannel] = useState('')
  const [candle, setCandle] = useState(0)
  const [isShowLaunchPanel, setIsShowLaunchPanel] = useState(false)
  const [lgWheel, setLgWheel] = useState(50)
  const [lgThrottle, setLgThrottle] = useState(0)
  const [isLimit, setIsLimit] = useState(false)
  const [lgGear, setLgGear] = useState('D')
  const [cam, setCam] = useState(50)
  const [isFullScreen, setIsFullScreen] = useState(null)

  const videoZero = (mode = 3) => {
    if (window.wsavc) {
      window.wsavc.send({ mode })
      return
    }
    window.wsavc = new WSAvcPlayer({ useWorker: false })
    document.getElementById('screen').appendChild(window.wsavc.AvcPlayer.canvas)
    window.wsavc.connect("ws://39.106.81.156:5001/video")
    window.wsavc.ws.onopen = () => {
      window.wsavc.send({ mode })
    }
    window.wsavc.ws.addEventListener('message', () => {
      // console.log('ok')
    })
    window.wsavc.ws.onerror = () => {
      console.error('error')
    }
  }

  const lgInit = () => {
    setInterval(() => {
      const gamePads = navigator.getGamepads().find(item => item?.id?.includes?.('Xbox'))

      if (!gamePads || !gamePads?.axes) return
      const [, lgThrottle, lgWheel] = gamePads.axes

      const lgWheelValue = Math.round(lgWheel * 100)  / 2 + 50
      const lgThrottleValue = Math.round(lgThrottle * 100)  / 2 + 50
      setLgWheel(100 - lgWheelValue)
      setLgThrottle(100 - lgThrottleValue)
      if (gamePads.buttons[6].touched) {
        setLgGear('R')
      } else if (gamePads.buttons[7].touched) {
        setLgGear('D')
      }
      if (gamePads.buttons[4].touched) {
        setCam(0)
      } else if (gamePads.buttons[5].touched) {
        setCam(100)
      } else {
        setCam(50)
      }
    }, 20)
  }

  useEffect(() => { 
    gearValue.current = lgGear
  }, [lgGear])

  useEffect(() => {
    console.log(cam)
    pwmChange(2, cam)
  }, [cam])

  useEffect(() => {
    socket.emit('setPulseLength', {
      pin: 14,
      data: (((lgWheel - 50) * 0.5) + 50) * 19 + 610
    })
  }, [lgWheel])

  useEffect(() => {
    let pwm = 1500
    if (gearValue.current === 'D') {
      pwm = pwm - (lgThrottle - 50) * (isLimit ? 5 : 14)
    }
    if (gearValue.current === 'R') {
      pwm = pwm + (lgThrottle - 50) * (isLimit ? 4 : 13)
    }
    if (gearValue.current === 'N') return
    if (lgThrottle < 50) {
      pwm = 1500
    }
    if (lgThrottle == 50) {
      socket.emit('channelOff', { pin: 15 })
    } else {
      socket.emit('setPulseLength', {
        pin: 15,
        data: pwm
      })
    }
  }, [lgThrottle])

  useEffect(() => {
    videoZero()
    initKeyBoard()
    // 好盈1060这个电调需要初始化归零值...
    pwmChange(15, 50)

    lgInit()

    return () => {
      document.getElementById('screen').innerHTML = ''
    }
  }, [])

  const initKeyBoard = () => {
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        onTouchThrottle()
      }
      if (e.key === 'ArrowLeft') {
        pwmChange(14, 90)
      }
      if (e.key === 'ArrowRight') {
        pwmChange(14, 10)
      }
    })
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        onTouchEndThrottle()
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        pwmChange(14, 50)
      }
    })
  }

  const pwmChange = (pinKey, e) => {
    socket.emit('setPulseLength', {
      pin: pinKey,
      data: e * 20 + 500
    })
  }

  const speedChange = (pwm) => {
    refSpeed.current = pwm
  }

  const onTouchThrottle = () => {
    let pwm = 1500
    if (gearValue.current === 'D') {
      pwm = pwm - (refSpeed.current * 5)
    }
    if (gearValue.current === 'R') {
      pwm = pwm + (refSpeed.current * 5)
    }
    if (gearValue.current === 'N') return
    socket.emit('setPulseLength', {
      pin: 15,
      data: pwm
    })
  }

  const onTouchEndThrottle = () => {
    socket.emit('channelOff', { pin: 15 })
  }

  const gearChange = (gear) => {
    gearValue.current = gear
  }

  const onTouchBrake = () => {
    socket.emit('setPulseLength', {
      pin: 15,
      data: 1500
    })
  }

  const videoChange = () => {
    videoZero(2)
  }

  const limitChange = (e) => {
    setIsLimit(e)
  }

  useEffect(() => {
    if (isFullScreen === true) {
      document.querySelector('.App').requestFullscreen()  
    } else if (isFullScreen === false) {
      document.exitFullscreen()
    }
  }, [isFullScreen])

  const fullScreen = (e) => {
    setIsFullScreen(!isFullScreen)
  }

  const onStartLaunch = (od) => {
    setTimeout(() => {
      setCandle(od + .5)
      socket.emit('channelOn', { pin: 10 })
      if (od >= 100) {
        socket.emit('channelOff', { pin: 10 })
        setCandle(0)
        return
      };
      onStartLaunch(od + .5)
    }, 5)
  }
  
  return (
    <div className={`App ${isFullScreen ? 'fullScreen' : null}`}>
      <div id="screen" />
      <Keybords socket={socket}
        videoChange={videoChange}
        limitChange={limitChange}
        onLaunchPannel={() => setIsShowLaunchPanel(true)}
        fullScreen={fullScreen}/>
      <div className="Console">
        <SliderHandle
          onChange={speedChange}
          title="速度"
          defalutValue={0}
          width="20vw"
          className="SpeedSlider"
        />
        <a className="Start"
          onTouchStart={onTouchThrottle}
          onTouchEnd={onTouchEndThrottle}
        >油门</a>
        <a className="Brake"
          onTouchStart={onTouchBrake}
          onTouchEnd={onTouchEndThrottle}
        >stop</a>
        <Gear onChange={gearChange}/>
        <Direction onChange={e => pwmChange(14, 100 - e)}/>
      </div>
      <br />
      <Modal
        onClose={() => setIsShowLaunchPanel(false)}
        visible={isShowLaunchPanel}
      >
        <div className="launchControl">
          <a onClick={() => onStartLaunch(1)}>
            <div><p style={{
              width: `${candle}%`
            }} /></div>
            一号点火
          </a>
          <a>
            <div></div>
            二号点火
          </a>
          <a>
            <div></div>
            三号点火
          </a>
        </div>
      </Modal>
      <div className="Arm">
        {/* <SliderHandle onChange={e => {}}/> */}
        <CrossHandle onChange={e => {
          pwmChange(13, e.armX)
        }}/>
        {/* <DiskHandle onChange={e => armChange(e, 1, 2)}/>
        <SliderHandle onChange={e => {}}/> */}
      </div>
    </div>
  )
}

export default App
