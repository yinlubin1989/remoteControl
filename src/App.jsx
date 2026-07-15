import { useState, useEffect, useRef, useCallback } from 'react'
import io from 'socket.io-client'
import LowLatencyVideoPlayer from './LowLatencyVideoPlayer'
import CrossHandle from './components/CrossHandle'
import SliderHandle from './components/SliderHandle'
import CarJoystick from './components/CarJoystick'
import CockpitControls from './components/CockpitControls'
import { applyCockpitSteeringCurve } from './components/CockpitControls/controlMath'
import {
  getGamepadDriveOutput,
  isStandardDriveGamepad,
} from './gamepadControl'
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

const getGamepadDisplayName = id => (
  id
    .replace(/\s*\(STANDARD GAMEPAD.*\)$/i, '')
    .replace(/\s*\(Vendor:.*\)$/i, '')
    .trim()
    || '标准手柄'
)

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
  const gearValue = useRef('D')
  const videoPlayer = useRef()
  const [pannel, setPannel] = useState('')
  const [isLimit, setIsLimit] = useState(false)
  const [controlMode, setControlMode] = useState(() => {
    const savedMode = window.localStorage.getItem(CONTROL_MODE_STORAGE_KEY)
    return VALID_CONTROL_MODES.includes(savedMode) ? savedMode : 'separate'
  })
  const [steeringReversed, setSteeringReversed] = useState(() => (
    loadDirectionSetting(STEERING_DIRECTION_KEY)
  ))
  const [steeringCenter, setSteeringCenter] = useState(loadSteeringCenter)
  const [motorReversed, setMotorReversed] = useState(() => (
    loadDirectionSetting(MOTOR_DIRECTION_KEY)
  ))
  const [isFullScreen, setIsFullScreen] = useState(false)
  const steeringReversedRef = useRef(steeringReversed)
  const steeringCenterRef = useRef(steeringCenter)
  const motorReversedRef = useRef(motorReversed)
  const controlModeRef = useRef(controlMode)
  const isLimitRef = useRef(isLimit)
  const gamepadActiveRef = useRef(false)
  const cockpitTravelDirectionRef = useRef('D')
  const [gamepadState, setGamepadState] = useState(() => ({
    status: typeof navigator.getGamepads === 'function'
      ? 'disconnected'
      : 'unsupported',
    id: '',
  }))
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
  const gamepadName = gamepadState.id
    ? getGamepadDisplayName(gamepadState.id)
    : ''
  const gamepadText = gamepadState.status === 'active'
    ? `手柄接管中 · ${gamepadName}`
    : gamepadState.status === 'connected'
      ? `手柄已连接 · ${gamepadName}`
      : gamepadState.status === 'incompatible'
        ? `手柄不兼容 · ${gamepadName}`
        : gamepadState.status === 'unsupported'
          ? '浏览器不支持手柄'
          : gamepadName
            ? `手柄已断开 · ${gamepadName}`
            : '手柄未连接'

  useEffect(() => {
    controlModeRef.current = controlMode
  }, [controlMode])

  useEffect(() => {
    isLimitRef.current = isLimit
  }, [isLimit])

  useEffect(() => {
    steeringReversedRef.current = steeringReversed
    window.localStorage.setItem(
      STEERING_DIRECTION_KEY,
      steeringReversed ? 'reverse' : 'normal',
    )
    if (!gamepadActiveRef.current) pwmChange(14, 50)
  }, [steeringReversed])

  useEffect(() => {
    steeringCenterRef.current = steeringCenter
    window.localStorage.setItem(STEERING_CENTER_KEY, steeringCenter)
    if (!gamepadActiveRef.current) {
      socket.emit('setPulseLength', {
        pin: 14,
        data: steeringCenter,
      })
    }
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
    const removeKeyboardListeners = initKeyBoard()
    // 好盈1060这个电调需要初始化归零值...
    pwmChange(15, 50)
    pwmChange(2, 50)

    return () => {
      removeKeyboardListeners()
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
    const onKeyDown = (e) => {
      if (
        controlModeRef.current !== 'separate'
        || gamepadActiveRef.current
      ) return
      if (e.key === ' ') {
        onTouchThrottle()
      }
      if (e.key === 'ArrowLeft') {
        pwmChange(14, 90)
      }
      if (e.key === 'ArrowRight') {
        pwmChange(14, 10)
      }
    }
    const onKeyUp = (e) => {
      if (
        controlModeRef.current !== 'separate'
        || gamepadActiveRef.current
      ) return
      if (e.key === ' ') {
        onTouchEndThrottle()
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        pwmChange(14, 50)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
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
    if (gamepadActiveRef.current) return
    socket.emit('setPulseLength', {
      pin: 15,
      data: getMotorPulse(THROTTLE_NEUTRAL)
    })
  }

  const speedChange = (pwm) => {
    refSpeed.current = pwm
  }

  const onTouchThrottle = () => {
    if (gamepadActiveRef.current) return
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
    if (gamepadActiveRef.current) return
    setThrottleNeutral()
  }

  const gearChange = (gear) => {
    gearValue.current = gear
  }

  const onTouchBrake = () => {
    if (gamepadActiveRef.current) return
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
    if (controlMode !== 'joystick' || gamepadActiveRef.current) return

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
    if (gamepadActiveRef.current) return
    socket.emit('setPulseLength', {
      pin: 15,
      data: THROTTLE_NEUTRAL,
    })
    socket.emit('setPulseLength', {
      pin: 14,
      data: steeringCenterRef.current,
    })
  }, [])

  useEffect(() => {
    if (typeof navigator.getGamepads !== 'function') return undefined

    let animationFrame
    let suspended = document.hidden
    let lastEmitAt = 0
    let lastSteeringPulse
    let lastThrottlePulse
    let lastGamepadId = ''

    const updateStatus = (status, id = '') => {
      setGamepadState(current => (
        current.status === status && current.id === id
          ? current
          : { status, id }
      ))
    }

    const neutralizeGamepad = (status, id = '') => {
      if (id) lastGamepadId = id
      if (gamepadActiveRef.current) {
        socket.emit('setPulseLength', {
          pin: 15,
          data: THROTTLE_NEUTRAL,
        })
        socket.emit('setPulseLength', {
          pin: 14,
          data: steeringCenterRef.current,
        })
      }
      gamepadActiveRef.current = false
      lastSteeringPulse = undefined
      lastThrottlePulse = undefined
      updateStatus(status, id)
    }

    const readGamepads = () => Array.from(navigator.getGamepads() || [])
      .filter(gamepad => gamepad?.connected)

    const pollGamepad = timestamp => {
      const connectedGamepads = readGamepads()
      const gamepad = connectedGamepads.find(isStandardDriveGamepad)

      if (!gamepad) {
        const incompatible = connectedGamepads[0]
        neutralizeGamepad(
          incompatible ? 'incompatible' : 'disconnected',
          incompatible?.id || lastGamepadId,
        )
        animationFrame = window.requestAnimationFrame(pollGamepad)
        return
      }

      if (suspended) {
        neutralizeGamepad('connected', gamepad.id)
        animationFrame = window.requestAnimationFrame(pollGamepad)
        return
      }

      const output = getGamepadDriveOutput({
        leftY: gamepad.axes[1],
        rightX: gamepad.axes[2],
        isLimit: isLimitRef.current,
        steeringCenter: steeringCenterRef.current,
        steeringReversed: steeringReversedRef.current,
        motorReversed: motorReversedRef.current,
      })
      lastGamepadId = gamepad.id

      if (!output.active) {
        neutralizeGamepad('connected', gamepad.id)
        animationFrame = window.requestAnimationFrame(pollGamepad)
        return
      }

      gamepadActiveRef.current = true
      updateStatus('active', gamepad.id)

      if (timestamp - lastEmitAt >= 33) {
        if (output.steeringPulse !== lastSteeringPulse) {
          socket.emit('setPulseLength', {
            pin: 14,
            data: output.steeringPulse,
          })
          lastSteeringPulse = output.steeringPulse
        }
        if (output.throttlePulse !== lastThrottlePulse) {
          socket.emit('setPulseLength', {
            pin: 15,
            data: output.throttlePulse,
          })
          lastThrottlePulse = output.throttlePulse
        }
        lastEmitAt = timestamp
      }

      animationFrame = window.requestAnimationFrame(pollGamepad)
    }

    const suspendGamepad = () => {
      suspended = true
      const gamepad = readGamepads().find(isStandardDriveGamepad)
      neutralizeGamepad(
        gamepad ? 'connected' : 'disconnected',
        gamepad?.id || lastGamepadId,
      )
    }
    const resumeGamepad = () => {
      suspended = document.hidden
    }
    const onVisibilityChange = () => {
      if (document.hidden) suspendGamepad()
      else resumeGamepad()
    }
    const onGamepadDisconnected = event => {
      if (event.gamepad?.mapping === 'standard') {
        neutralizeGamepad('disconnected', event.gamepad.id)
      }
    }

    window.addEventListener('blur', suspendGamepad)
    window.addEventListener('focus', resumeGamepad)
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected)
    document.addEventListener('visibilitychange', onVisibilityChange)
    animationFrame = window.requestAnimationFrame(pollGamepad)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('blur', suspendGamepad)
      window.removeEventListener('focus', resumeGamepad)
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      neutralizeGamepad('disconnected', lastGamepadId)
    }
  }, [])

  const handleCockpitSteeringChange = useCallback((value, active) => {
    if (controlMode !== 'cockpit' || gamepadActiveRef.current) return
    if (!active) {
      pwmChange(14, 50)
      return
    }

    const steering = applyCockpitSteeringCurve(value)
    pwmChange(14, 100 - steering)
  }, [controlMode])

  const handleCockpitThrottleChange = useCallback((value, active) => {
    if (controlMode !== 'cockpit' || gamepadActiveRef.current) return

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
    if (controlMode !== 'cockpit' || gamepadActiveRef.current) return
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
          <span
            className={`GamepadStatus GamepadStatus--${gamepadState.status}`}
            title={gamepadState.id || gamepadText}
          >
            <i aria-hidden="true" />
            {gamepadText}
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
          <Direction onChange={e => {
            if (!gamepadActiveRef.current) pwmChange(14, 100 - e)
          }}/>
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
