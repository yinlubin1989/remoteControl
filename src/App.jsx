import { useState, useEffect, useRef } from 'react'
import WSAvcPlayer from "ws-avc-player"
import io from 'socket.io-client'
import CrossHandle from './components/CrossHandle'
import SliderHandle from './components/SliderHandle'
import DiskHandle from './components/DiskHandle'
import Gear from './components/Gear'
import Direction from './components/Direction'

import './App.css'

const socket = io('http://39.106.81.156:5005')
window.socket = socket

socket.on("connect", () => {
  // socket.emit('setPulseLength', {
  //   pin: 15,
  //   data: 1500
  // })
  socket.emit('hb')
  setInterval(() => {
    socket.emit('hb')
  }, 500)
})

function App() {
  const refSpeed = useRef()
  const gearValue = useRef()
  const [lgWheel, setLgWheel] = useState(50)
  const [lgThrottle, setLgThrottle] = useState(0)
  const videoZero = () => {
    window.wsavc = new WSAvcPlayer({ useWorker: false })
    document.getElementById('screen').appendChild(window.wsavc.AvcPlayer.canvas)
    window.wsavc.connect("ws://39.106.81.156:5001/video")
    window.wsavc.ws.onopen = () => {
      window.wsavc.send({ mode: 3 })
    }
    window.wsavc.ws.addEventListener('message', () => {
      // console.log('ok')
    })
    window.wsavc.ws.onerror = () => {
      console.error('error')
    }
  }

  const lgInit = () => {
    // window.addEventListener('gamepadconnected', function(e) {
    //   navigator.getGamepads().forEach((item) => {
    //     if (item?.id?.includes?.('G29')) {
    //       gamePad.current = item
    //     }
    //   })
    // })
    setInterval(() => {
      const [gamePads] = navigator.getGamepads()

      if (!gamePads) return
      const [lgWheel, ,lgThrottle] = gamePads.axes
      const lgWheelValue = Math.round(lgWheel * 100)  / 2 + 50
      const lgThrottleValue = Math.round(lgThrottle * 100)  / 2 + 50
      setLgWheel(100 - lgWheelValue)
      setLgThrottle(100 - lgThrottleValue)
      const [,,,,addGear] = gamePads.buttons
      console.log(addGear)
    }, 100)
  }

  useEffect(() => {
    pwmChange(15, lgWheel)
  }, [lgWheel])

  useEffect(() => {
    let pwm = 1500
    if (gearValue.current === 'D') {
      pwm = pwm - (lgThrottle * 5)
    }
    if (gearValue.current === 'R') {
      pwm = pwm + (lgThrottle * 5)
    }
    if (gearValue.current === 'N') return

    console.log(pwm)
    socket.emit('setPulseLength', {
      pin: 0,
      data: pwm
    })
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
        pwmChange(15, 100)
      }
      if (e.key === 'ArrowRight') {
        pwmChange(15, 0)
      }
    })
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        onTouchEndThrottle()
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        pwmChange(15, 50)
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

  return (
    <div className="App">
      <div id="screen" />
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
        <Direction onChange={e => pwmChange(15, 100 - e)}/>
      </div>
      <br />
      {/* <div className="Arm">
        <SliderHandle onChange={e => {}}/>
        <CrossHandle onChange={e => armChange(e, 1, 2)}/>
        <DiskHandle onChange={e => armChange(e, 1, 2)}/>
        <SliderHandle onChange={e => {}}/>
      </div> */}
    </div>
  )
}

export default App
