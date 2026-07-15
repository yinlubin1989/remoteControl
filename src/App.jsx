import { useState, useEffect, useRef, useCallback } from 'react'
import io from 'socket.io-client'
import LowLatencyVideoPlayer from './LowLatencyVideoPlayer'
import CrossHandle from './components/CrossHandle'
import SliderHandle from './components/SliderHandle'
import CarJoystick from './components/CarJoystick'
import CockpitControls from './components/CockpitControls'
import { applyCockpitSteeringCurve } from './components/CockpitControls/controlMath'
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
const STEERING_CENTER_DEFAULT = 1500
const STEERING_CENTER_MIN = 1200
const STEERING_CENTER_MAX = 1800
const STEERING_PULSE_MIN = 500
const STEERING_PULSE_MAX = 2500
const BRAKE_PWM_OFFSET = 300
const STEERING_DIRECTION_KEY = 'steering-direction'
const STEERING_CENTER_KEY = 'steering-center-pulse'
const MOTOR_DIRECTION_KEY = 'motor-direction'
const DECODER_STORAGE_KEY = 'video-decoder'
const CONTROL_MODE_STORAGE_KEY = 'car-control-mode'
const JOYSTICK_DEAD_ZONE = 4
const VALID_DECODERS = ['webcodecs', 'broadway']
const VALID_CONTROL_MODES = ['separate', 'joystick', 'cockpit']

const loadDirectionSetting = (key) => (
  window.localStorage.getItem(key) === 'reverse'
)

const loadSteeringCenter = () => {
  const saved = window.localStorage.getItem(STEERING_CENTER_KEY)
  if (saved === null || saved === '') return STEERING_CENTER_DEFAULT
  const savedValue = Number(saved)
  if (!Number.isFinite(savedValue)) return STEERING_CENTER_DEFAULT
  return Math.min(
    STEERING_CENTER_MAX,
    Math.max(STEERING_CENTER_MIN, savedValue),
  )
}

const loadVideoDecoder = () => {
  const queryDecoder = new URLSearchParams(window.location.search).get('decoder')
  if (VALID_DECODERS.includes(queryDecoder)) {
    return queryDecoder
  }

  const savedDecoder = window.localStorage.getItem(DECODER_STORAGE_KEY)
  return VALID_DECODERS.includes(savedDecoder) ? savedDecoder : 'webcodecs'
}

const applyJoystickDeadZone = (value) => {
  const offset = value - 50
  const distance = Math.abs(offset)
  if (distance <= JOYSTICK_DEAD_ZONE) return 50

  const adjustedDistance = (
    (distance - JOYSTICK_DEAD_ZONE) / (50 - JOYSTICK_DEAD_ZONE)
  ) * 50
  return 50 + Math.sign(offset) * adjustedDistance
}

let heartbeatTimer

socket.on("connect", () => {
  clearInterval(heartbeatTimer)
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
  heartbeatTimer = setInterval(() => {
    if (socket.connected) {
      socket.emit('hb')
    }
  }, 500)
})

socket.on('disconnect', () => {
  clearInterval(heartbeatTimer)
  heartbeatTimer = undefined
})

function App() {
  const refSpeed = useRef()
  const gearValue = useRef()
  const videoPlayer = useRef()
  const [pannel, setPannel] = useState('')
  const [lgWheel, setLgWheel] = useState(50)
  const [lgThrottle, setLgThrottle] = useState(0)
  const [isLimit, setIsLimit] = useState(false)
  const [controlMode, setControlMode] = useState(() => {
    const savedMode = window.localStorage.getItem(CONTROL_MODE_STORAGE_KEY)
    return VALID_CONTROL_MODES.includes(savedMode) ? savedMode : 'separate'
  })
  const [lgGear, setLgGear] = useState('D')
  const [steeringReversed, setSteeringReversed] = useState(() => (
    loadDirectionSetting(STEERING_DIRECTION_KEY)
  ))
  const [steeringCenter, setSteeringCenter] = useState(loadSteeringCenter)
  const [motorReversed, setMotorReversed] = useState(() => (
    loadDirectionSetting(MOTOR_DIRECTION_KEY)
  ))
  const [cam, setCam] = useState(50)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const steeringReversedRef = useRef(steeringReversed)
  const steeringCenterRef = useRef(steeringCenter)
  const motorReversedRef = useRef(motorReversed)
  const controlModeRef = useRef(controlMode)
  const cockpitTravelDirectionRef = useRef('D')
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
  const [wifiNetworks, setWifiNetworks] = useState({
    networks: [],
    loading: false,
    error: '',
  })
  const [wifiSwitchState, setWifiSwitchState] = useState({
    status: 'idle',
    message: '',
  })
  const [videoDecoder, setVideoDecoder] = useState(loadVideoDecoder)
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
    controlModeRef.current = controlMode
  }, [controlMode])

  useEffect(() => {
    steeringReversedRef.current = steeringReversed
    window.localStorage.setItem(
      STEERING_DIRECTION_KEY,
      steeringReversed ? 'reverse' : 'normal',
    )
    pwmChange(14, 50)
  }, [steeringReversed])

  useEffect(() => {
    steeringCenterRef.current = steeringCenter
    window.localStorage.setItem(STEERING_CENTER_KEY, steeringCenter)
    socket.emit('setPulseLength', {
      pin: 14,
      data: steeringCenter,
    })
  }, [steeringCenter])

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
    if (controlMode !== 'separate') return
    const wheelValue = getSteeringValue(lgWheel)
    socket.emit('setPulseLength', {
      pin: 14,
      data: steeringCenter + (wheelValue - 50) * 9.5,
    })
  }, [controlMode, lgWheel, steeringReversed, steeringCenter])

  useEffect(() => {
    if (controlMode !== 'separate') return
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
  }, [controlMode, lgThrottle])

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
    const updateWifiNetworks = (payload = {}) => {
      setWifiNetworks({
        networks: Array.isArray(payload.networks) ? payload.networks : [],
        loading: false,
        error: payload.error || '',
      })
    }
    const updateWifiSwitchState = (state = {}) => {
      setWifiSwitchState(state)
    }
    const requestWifiStatus = () => {
      socket.emit('wifi:status:get')
    }

    socket.on('wifi:status', updateWifiStatus)
    socket.on('wifi:networks', updateWifiNetworks)
    socket.on('wifi:switch:state', updateWifiSwitchState)
    socket.on('connect', requestWifiStatus)
    requestWifiStatus()
    const timer = setInterval(requestWifiStatus, 10000)

    return () => {
      socket.off('wifi:status', updateWifiStatus)
      socket.off('wifi:networks', updateWifiNetworks)
      socket.off('wifi:switch:state', updateWifiSwitchState)
      socket.off('connect', requestWifiStatus)
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
      decoderPreference: videoDecoder,
      onStats: setVideoStats,
    })
    videoPlayer.current.start()

    return () => {
      videoPlayer.current?.destroy()
    }
  }, [videoProfile, videoMode, customSettings, videoDecoder])

  const initKeyBoard = () => {
    window.addEventListener('keydown', (e) => {
      if (controlModeRef.current !== 'separate') return
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
      if (controlModeRef.current !== 'separate') return
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
      data: pinKey === 14
        ? getSteeringPulse(e)
        : e * 20 + 500,
    })
  }

  const getSteeringValue = (value) => {
    if (!steeringReversedRef.current) return value
    return 100 - value
  }

  const getSteeringPulse = (value) => (
    Math.min(
      STEERING_PULSE_MAX,
      Math.max(
        STEERING_PULSE_MIN,
        steeringCenterRef.current + (getSteeringValue(value) - 50) * 20,
      ),
    )
  )

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
    setWifiNetworks(current => ({
      ...current,
      loading: true,
      error: '',
    }))
    socket.emit('wifi:networks:get')
    setSettingsOpen(true)
  }

  const switchWifiNetwork = (ssid) => {
    const target = wifiNetworks.networks.find(network => network.ssid === ssid)
    if (!target || target.current || !target.available) return

    const confirmed = window.confirm(
      `切换到 ${ssid}？\n\n小车会立即进入失联保护，控制连接将短暂中断。`,
    )
    if (!confirmed) return

    setWifiSwitchState({
      status: 'requesting',
      requestedSsid: ssid,
      message: `正在确认 ${ssid} 是否可连接`,
    })
    socket.emit('wifi:switch', { ssid })
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

  const selectVideoDecoder = decoder => {
    if (!VALID_DECODERS.includes(decoder)) {
      return
    }
    window.localStorage.setItem(DECODER_STORAGE_KEY, decoder)
    setVideoDecoder(decoder)
  }

  const limitChange = (e) => {
    setIsLimit(e)
  }

  const toggleControlMode = () => {
    neutralizeCockpit()
    setControlMode(current => {
      const currentIndex = VALID_CONTROL_MODES.indexOf(current)
      const nextMode = VALID_CONTROL_MODES[
        (currentIndex + 1) % VALID_CONTROL_MODES.length
      ]
      window.localStorage.setItem(CONTROL_MODE_STORAGE_KEY, nextMode)
      return nextMode
    })
  }

  const handleJoystickChange = useCallback(({ x, y, active }) => {
    if (controlMode !== 'joystick') return

    const steering = applyJoystickDeadZone(x)
    const throttle = applyJoystickDeadZone(y)
    pwmChange(14, 100 - steering)
    if (!active || throttle === 50) {
      setThrottleNeutral()
      return
    }

    const throttlePercent = Math.abs(throttle - 50) * 2
    const pwmOffset = throttlePercent * (
      isLimit ? (throttle < 50 ? 2.5 : 2) : 5
    )
    const pwm = throttle < 50
      ? THROTTLE_NEUTRAL - pwmOffset
      : THROTTLE_NEUTRAL + pwmOffset

    socket.emit('setPulseLength', {
      pin: 15,
      data: getMotorPulse(pwm),
    })
  }, [controlMode, isLimit])

  const neutralizeCockpit = useCallback(() => {
    socket.emit('setPulseLength', {
      pin: 15,
      data: THROTTLE_NEUTRAL,
    })
    socket.emit('setPulseLength', {
      pin: 14,
      data: steeringCenterRef.current,
    })
  }, [])

  const handleCockpitSteeringChange = useCallback((value, active) => {
    if (controlMode !== 'cockpit') return
    if (!active) {
      pwmChange(14, 50)
      return
    }

    const steering = applyCockpitSteeringCurve(value)
    pwmChange(14, 100 - steering)
  }, [controlMode])

  const handleCockpitThrottleChange = useCallback((value, active) => {
    if (controlMode !== 'cockpit') return

    const throttle = applyJoystickDeadZone(value)
    if (!active || throttle === 50) {
      setThrottleNeutral()
      return
    }

    cockpitTravelDirectionRef.current = throttle < 50 ? 'D' : 'R'
    const throttlePercent = Math.abs(throttle - 50) * 2
    const pwmOffset = throttlePercent * (
      isLimit ? (throttle < 50 ? 2.5 : 2) : 5
    )
    const pwm = throttle < 50
      ? THROTTLE_NEUTRAL - pwmOffset
      : THROTTLE_NEUTRAL + pwmOffset

    socket.emit('setPulseLength', {
      pin: 15,
      data: getMotorPulse(pwm),
    })
  }, [controlMode, isLimit])

  const handleCockpitBrake = useCallback(active => {
    if (controlMode !== 'cockpit') return
    if (!active) {
      setThrottleNeutral()
      return
    }

    const pwm = cockpitTravelDirectionRef.current === 'R'
      ? THROTTLE_NEUTRAL - BRAKE_PWM_OFFSET
      : THROTTLE_NEUTRAL + BRAKE_PWM_OFFSET
    socket.emit('setPulseLength', {
      pin: 15,
      data: getMotorPulse(pwm),
    })
  }, [controlMode])

  useEffect(() => {
    if (controlMode !== 'cockpit') return undefined

    const landscapeMedia = window.matchMedia('(orientation: landscape)')
    const stopForOrientation = event => {
      if (!event.matches) neutralizeCockpit()
    }
    const stopForVisibility = () => {
      if (document.hidden) neutralizeCockpit()
    }

    window.addEventListener('blur', neutralizeCockpit)
    document.addEventListener('visibilitychange', stopForVisibility)
    if (landscapeMedia.addEventListener) {
      landscapeMedia.addEventListener('change', stopForOrientation)
    } else {
      landscapeMedia.addListener(stopForOrientation)
    }
    if (!landscapeMedia.matches) neutralizeCockpit()

    return () => {
      window.removeEventListener('blur', neutralizeCockpit)
      document.removeEventListener('visibilitychange', stopForVisibility)
      if (landscapeMedia.removeEventListener) {
        landscapeMedia.removeEventListener('change', stopForOrientation)
      } else {
        landscapeMedia.removeListener(stopForOrientation)
      }
      neutralizeCockpit()
    }
  }, [controlMode, neutralizeCockpit])

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
        controlMode === 'cockpit' ? 'cockpitMode' : '',
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
        onReset={() => {
          setDraftSettings({ ...DEFAULT_CUSTOM_SETTINGS })
          setSteeringCenter(STEERING_CENTER_DEFAULT)
        }}
        onSelectProfile={setVideoProfile}
        onSelectColor={selectVideoColor}
        activeDecoder={videoDecoder}
        onSelectDecoder={selectVideoDecoder}
        steeringReversed={steeringReversed}
        steeringCenter={steeringCenter}
        motorReversed={motorReversed}
        onSteeringCenterChange={setSteeringCenter}
        onToggleSteeringDirection={toggleSteeringDirection}
        onToggleMotorDirection={toggleMotorDirection}
        wifiNetworks={wifiNetworks}
        wifiSwitchState={wifiSwitchState}
        onSwitchWifi={switchWifiNetwork}
      />
      <Keybords
        socket={socket}
        limitChange={limitChange}
        fullScreen={fullScreen}
        isFullScreen={isFullScreen}
        openVideoSettings={openVideoSettings}
        controlMode={controlMode}
        toggleControlMode={toggleControlMode}
      />
      {controlMode === 'joystick' ? (
        <CarJoystick onChange={handleJoystickChange} />
      ) : controlMode === 'cockpit' ? (
        <CockpitControls
          onSteeringChange={handleCockpitSteeringChange}
          onThrottleChange={handleCockpitThrottleChange}
          onBrake={handleCockpitBrake}
          isLimit={isLimit}
          wifiText={wifiText}
          wifiWarning={Boolean(wifiStatus.error || wifiStatus.connected === false)}
          videoStats={videoStats}
          onExitCockpit={toggleControlMode}
        />
      ) : (
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
      )}
      {controlMode !== 'cockpit' && (
        <>
          <br />
          <div className="Arm">
            <CrossHandle onChange={e => {
              pwmChange(13, e.armX)
            }}/>
          </div>
        </>
      )}
    </div>
  )
}

export default App
