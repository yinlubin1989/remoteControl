import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import LowLatencyVideoPlayer from './LowLatencyVideoPlayer'
import CrossHandle from './components/CrossHandle'
import SliderHandle from './components/SliderHandle'
import DiskHandle from './components/DiskHandle'
import Keybords from './components/Keybords'
import Gear from './components/Gear'
import Direction from './components/Direction'
import VideoSettingsModal from './components/VideoSettingsModal'

import './App.css'

const DEFAULT_CUSTOM_SETTINGS = {
  width: 320,
  fps: 60,
  bitrateKbps: 650,
  contrast: 40,
  brightness: 55,
  saturation: 0,
  aspect: '20:9',
  blackWhite: true,
}

const loadCustomSettings = () => {
  try {
    return {
      ...DEFAULT_CUSTOM_SETTINGS,
      ...JSON.parse(window.localStorage.getItem('video-custom-settings') || '{}'),
    }
  } catch (error) {
    return { ...DEFAULT_CUSTOM_SETTINGS }
  }
}

const isIOSDevice = () => (
  /iPad|iPhone|iPod/.test(window.navigator.userAgent)
  || (
    window.navigator.platform === 'MacIntel'
    && window.navigator.maxTouchPoints > 1
  )
)

const socket = io()
window.socket = socket
const THROTTLE_NEUTRAL = 1500
const BRAKE_PWM_OFFSET = 300
const STEERING_DIRECTION_KEY = 'steering-direction'
const MOTOR_DIRECTION_KEY = 'motor-direction'

const loadDirectionSetting = (key) => (
  window.localStorage.getItem(key) === 'reverse'
)

socket.on("connect", () => {
  socket.emit('setPulseLength', {
    pin: 15,
    data: THROTTLE_NEUTRAL
  })
  setTimeout(() => {
    [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].forEach((pin) => {
      if (pin === 15) return
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
  const videoPlayer = useRef()
  const [pannel, setPannel] = useState('')
  const [lgWheel, setLgWheel] = useState(50)
  const [lgThrottle, setLgThrottle] = useState(0)
  const [isLimit, setIsLimit] = useState(false)
  const [lgGear, setLgGear] = useState('D')
  const [steeringReversed, setSteeringReversed] = useState(() => (
    loadDirectionSetting(STEERING_DIRECTION_KEY)
  ))
  const [motorReversed, setMotorReversed] = useState(() => (
    loadDirectionSetting(MOTOR_DIRECTION_KEY)
  ))
  const [cam, setCam] = useState(50)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const steeringReversedRef = useRef(steeringReversed)
  const motorReversedRef = useRef(motorReversed)
  const [videoProfile, setVideoProfile] = useState(() => {
    const savedProfile = window.localStorage.getItem('video-profile')
    return ['low', 'wide', 'clear', 'full', 'custom'].includes(savedProfile)
      ? savedProfile
      : 'clear'
  })
  const [videoColor, setVideoColor] = useState(() => (
    window.localStorage.getItem('video-color') === 'color' ? 'color' : 'bw'
  ))
  const [customSettings, setCustomSettings] = useState(loadCustomSettings)
  const [draftSettings, setDraftSettings] = useState(customSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [videoStats, setVideoStats] = useState({
    decoder: 'connecting',
    fps: 0,
    queue: 0,
    dropped: 0,
    status: 'connecting',
  })
  const [wifiStatus, setWifiStatus] = useState({})
  const decoderPreference = new URLSearchParams(window.location.search).get('decoder') || 'auto'
  const videoMode = videoColor === 'color'
    ? 0
    : videoProfile === 'custom' ? 1 : 2
  const wifiText = wifiStatus.error
    ? 'WiFi 异常'
    : wifiStatus.connected === false
      ? 'WiFi 未连接'
      : wifiStatus.ssid
        ? `WiFi ${wifiStatus.ssid}${wifiStatus.signal ? ` ${wifiStatus.signal}dBm` : ''}`
        : 'WiFi --'

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
    steeringReversedRef.current = steeringReversed
    window.localStorage.setItem(
      STEERING_DIRECTION_KEY,
      steeringReversed ? 'reverse' : 'normal',
    )
    pwmChange(14, 50)
  }, [steeringReversed])

  useEffect(() => {
    motorReversedRef.current = motorReversed
    window.localStorage.setItem(
      MOTOR_DIRECTION_KEY,
      motorReversed ? 'reverse' : 'normal',
    )
    setThrottleNeutral()
  }, [motorReversed])

  useEffect(() => {
    console.log(cam)
    pwmChange(2, cam)
  }, [cam])

  useEffect(() => {
    const wheelValue = getSteeringValue(lgWheel)
    socket.emit('setPulseLength', {
      pin: 14,
      data: (((wheelValue - 50) * 0.5) + 50) * 19 + 610
    })
  }, [lgWheel, steeringReversed])

  useEffect(() => {
    let pwm = THROTTLE_NEUTRAL
    if (gearValue.current === 'D') {
      pwm = pwm - (lgThrottle - 50) * (isLimit ? 5 : 14)
    }
    if (gearValue.current === 'R') {
      pwm = pwm + (lgThrottle - 50) * (isLimit ? 4 : 13)
    }
    if (gearValue.current === 'N') return
    if (lgThrottle < 50) {
      pwm = THROTTLE_NEUTRAL
    }
    if (lgThrottle === 50) {
      setThrottleNeutral()
    } else {
      socket.emit('setPulseLength', {
        pin: 15,
        data: getMotorPulse(pwm)
      })
    }
  }, [lgThrottle])

  useEffect(() => {
    initKeyBoard()
    // 好盈1060这个电调需要初始化归零值...
    pwmChange(15, 50)

    lgInit()

    return () => {
      videoPlayer.current?.destroy()
    }
  }, [])

  useEffect(() => {
    const updateWifiStatus = (status = {}) => {
      setWifiStatus(status)
    }
    const requestWifiStatus = () => {
      socket.emit('wifi:status:get')
    }

    socket.on('wifi:status', updateWifiStatus)
    requestWifiStatus()
    const timer = setInterval(requestWifiStatus, 10000)

    return () => {
      socket.off('wifi:status', updateWifiStatus)
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const screen = document.getElementById('screen')
    window.localStorage.setItem('video-profile', videoProfile)
    window.localStorage.setItem('video-color', videoColor)
    videoPlayer.current?.destroy()
    videoPlayer.current = new LowLatencyVideoPlayer({
      container: screen,
      profile: videoProfile,
      mode: videoMode,
      customSettings,
      decoderPreference,
      onStats: setVideoStats,
    })
    videoPlayer.current.start()

    return () => {
      videoPlayer.current?.destroy()
    }
  }, [videoProfile, videoMode, customSettings])

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
    const value = pinKey === 14 ? getSteeringValue(e) : e
    socket.emit('setPulseLength', {
      pin: pinKey,
      data: value * 20 + 500
    })
  }

  const getSteeringValue = (value) => {
    if (!steeringReversedRef.current) return value
    return 100 - value
  }

  const getMotorPulse = (pwm) => {
    if (!motorReversedRef.current) return pwm
    return THROTTLE_NEUTRAL - (pwm - THROTTLE_NEUTRAL)
  }

  const setThrottleNeutral = () => {
    socket.emit('setPulseLength', {
      pin: 15,
      data: getMotorPulse(THROTTLE_NEUTRAL)
    })
  }

  const speedChange = (pwm) => {
    refSpeed.current = pwm
  }

  const onTouchThrottle = () => {
    let pwm = THROTTLE_NEUTRAL
    if (gearValue.current === 'D') {
      pwm = pwm - (refSpeed.current * 5)
    }
    if (gearValue.current === 'R') {
      pwm = pwm + (refSpeed.current * 5)
    }
    if (gearValue.current === 'N') return
    socket.emit('setPulseLength', {
      pin: 15,
      data: getMotorPulse(pwm)
    })
  }

  const onTouchEndThrottle = () => {
    setThrottleNeutral()
  }

  const gearChange = (gear) => {
    gearValue.current = gear
  }

  const onTouchBrake = () => {
    let pwm = THROTTLE_NEUTRAL
    if (gearValue.current === 'D') {
      pwm = THROTTLE_NEUTRAL + BRAKE_PWM_OFFSET
    }
    if (gearValue.current === 'R') {
      pwm = THROTTLE_NEUTRAL - BRAKE_PWM_OFFSET
    }
    if (gearValue.current === 'N') return
    socket.emit('setPulseLength', {
      pin: 15,
      data: getMotorPulse(pwm)
    })
  }

  const toggleSteeringDirection = () => {
    setSteeringReversed(current => !current)
  }

  const toggleMotorDirection = () => {
    setMotorReversed(current => !current)
  }

  const openVideoSettings = () => {
    setDraftSettings({
      ...customSettings,
      blackWhite: videoColor === 'bw',
    })
    setSettingsOpen(true)
  }

  const applyVideoSettings = () => {
    window.localStorage.setItem(
      'video-custom-settings',
      JSON.stringify(draftSettings),
    )
    setCustomSettings(draftSettings)
    setVideoColor(draftSettings.blackWhite ? 'bw' : 'color')
    setVideoProfile('custom')
    setSettingsOpen(false)
  }

  const selectVideoColor = color => {
    setVideoColor(color)
    setDraftSettings(current => ({
      ...current,
      blackWhite: color === 'bw',
    }))
  }

  const limitChange = (e) => {
    setIsLimit(e)
  }

  const usePseudoFullscreen = isIOSDevice() || (
    new URLSearchParams(window.location.search).get('fullscreen') === 'pseudo'
  )

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!usePseudoFullscreen && !document.fullscreenElement) {
        setIsFullScreen(false)
      }
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.documentElement.classList.remove('VideoPseudoFullscreenOpen')
    }
  }, [usePseudoFullscreen])

  useEffect(() => {
    document.documentElement.classList.toggle(
      'VideoPseudoFullscreenOpen',
      usePseudoFullscreen && isFullScreen,
    )
  }, [isFullScreen, usePseudoFullscreen])

  const fullScreen = async () => {
    const entering = !isFullScreen
    setIsFullScreen(entering)

    if (usePseudoFullscreen) {
      return
    }

    try {
      if (entering) {
        const app = document.querySelector('.App')
        await app?.requestFullscreen?.()
      } else if (document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch (error) {
      setIsFullScreen(entering)
    }
  }
  
  return (
    <div
      className={[
        'App',
        isFullScreen ? 'fullScreen' : '',
        isFullScreen && usePseudoFullscreen ? 'pseudoFullScreen' : '',
      ].filter(Boolean).join(' ')}
    >
      <div
        id="screen"
        className={videoProfile === 'full' ? 'FullFrame' : ''}
      />
      <div className="VideoPanel">
        <div className="VideoStats">
          <span>{videoColor === 'color' ? '彩色' : '黑白'}</span>
          <span>{videoStats.decoder}</span>
          <span>{videoStats.fps} fps</span>
          <span>queue {videoStats.queue}</span>
          <span>drop {videoStats.dropped}</span>
          <span>{videoStats.status}</span>
          <span
            className={[
              'WifiStatus',
              wifiStatus.error || wifiStatus.connected === false ? 'warn' : '',
              wifiStatus.ssid ? 'online' : '',
            ].filter(Boolean).join(' ')}
            title={wifiStatus.error || ''}
          >
            {wifiText}
          </span>
        </div>
      </div>
      <VideoSettingsModal
        open={settingsOpen}
        value={draftSettings}
        activeProfile={videoProfile}
        activeColor={videoColor}
        customFps={customSettings.fps}
        onChange={setDraftSettings}
        onApply={applyVideoSettings}
        onClose={() => setSettingsOpen(false)}
        onReset={() => setDraftSettings({ ...DEFAULT_CUSTOM_SETTINGS })}
        onSelectProfile={setVideoProfile}
        onSelectColor={selectVideoColor}
        steeringReversed={steeringReversed}
        motorReversed={motorReversed}
        onToggleSteeringDirection={toggleSteeringDirection}
        onToggleMotorDirection={toggleMotorDirection}
      />
      <Keybords
        socket={socket}
        limitChange={limitChange}
        fullScreen={fullScreen}
        isFullScreen={isFullScreen}
        openVideoSettings={openVideoSettings}
      />
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
          onTouchCancel={onTouchEndThrottle}
        >油门</a>
        <a className="Brake"
          onTouchStart={onTouchBrake}
          onTouchEnd={onTouchEndThrottle}
          onTouchCancel={onTouchEndThrottle}
        >stop</a>
        <Gear onChange={gearChange}/>
        <Direction onChange={e => pwmChange(14, 100 - e)}/>
      </div>
      <br />
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
