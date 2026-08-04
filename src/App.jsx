import { useState, useEffect, useRef, useCallback } from 'react'
import io from 'socket.io-client'
import LowLatencyVideoPlayer from './LowLatencyVideoPlayer'
import CrossHandle from './components/CrossHandle'
import SliderHandle from './components/SliderHandle'
import {
  getDriveGamepadInput,
  getGamepadEmergencyLatched,
  getGamepadDriveOutput,
  getReceiverPwmTelemetry,
  isDriveGamepadIdentity,
  readGamepadSnapshot,
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

const DEFAULT_VIDEO_STATS = {
  decoder: 'connecting',
  fps: 0,
  queue: 0,
  dropped: 0,
  status: 'connecting',
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
const RECEIVER_STEERING_CENTER_KEY = 'receiver-steering-center-pulse'
const RECEIVER_THROTTLE_CENTER_KEY = 'receiver-throttle-center-pulse'
const RECEIVER_INPUT_CENTER_DEFAULT = 1500
const RECEIVER_INPUT_CENTER_MIN = 500
const RECEIVER_INPUT_CENTER_MAX = 2500
const DECODER_STORAGE_KEY = 'video-decoder'
const VALID_DECODERS = ['webcodecs', 'broadway']
const GAMEPAD_DISCOVERY_INTERVAL_MS = 250
const EMPTY_RECEIVER_PWM_STATE = {
  supported: false,
  valid: false,
  steeringPulse: null,
  throttlePulse: null,
}

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

const loadReceiverInputCenter = key => {
  const saved = window.localStorage.getItem(key)
  if (saved === null || saved === '') return RECEIVER_INPUT_CENTER_DEFAULT
  const savedValue = Number(saved)
  if (!Number.isFinite(savedValue)) return RECEIVER_INPUT_CENTER_DEFAULT
  return Math.min(
    RECEIVER_INPUT_CENTER_MAX,
    Math.max(RECEIVER_INPUT_CENTER_MIN, Math.round(savedValue)),
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
  const refSpeed = useRef(0)
  const gearValue = useRef('D')
  const videoPlayer = useRef()
  const [pannel, setPannel] = useState('')
  const [steeringReversed, setSteeringReversed] = useState(() => (
    loadDirectionSetting(STEERING_DIRECTION_KEY)
  ))
  const [steeringCenter, setSteeringCenter] = useState(loadSteeringCenter)
  const [receiverInputCenters, setReceiverInputCenters] = useState(() => ({
    steering: loadReceiverInputCenter(RECEIVER_STEERING_CENTER_KEY),
    throttle: loadReceiverInputCenter(RECEIVER_THROTTLE_CENTER_KEY),
  }))
  const [motorReversed, setMotorReversed] = useState(() => (
    loadDirectionSetting(MOTOR_DIRECTION_KEY)
  ))
  const [isFullScreen, setIsFullScreen] = useState(false)
  const steeringReversedRef = useRef(steeringReversed)
  const steeringCenterRef = useRef(steeringCenter)
  const receiverInputCentersRef = useRef(receiverInputCenters)
  const motorReversedRef = useRef(motorReversed)
  const gamepadActiveRef = useRef(false)
  const [gamepadState, setGamepadState] = useState(() => ({
    status: typeof navigator.getGamepads === 'function'
      ? 'waiting'
      : 'unsupported',
    id: '',
  }))
  const [receiverPwmState, setReceiverPwmState] = useState(
    EMPTY_RECEIVER_PWM_STATE,
  )
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
  const [videoStats, setVideoStats] = useState(() => ({
    ...DEFAULT_VIDEO_STATS,
  }))
  const [videoRefreshVersion, setVideoRefreshVersion] = useState(0)
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
    : gamepadState.status === 'emergency'
      ? `遥控器急停 · 回中解锁 · ${gamepadName}`
      : gamepadState.status === 'connected'
        ? `手柄已连接 · ${gamepadName}`
        : gamepadState.status === 'waiting'
          ? '等待手柄输入 · 请拨动遥控器'
          : gamepadState.status === 'incompatible'
            ? `手柄不兼容 · ${gamepadName}`
            : gamepadState.status === 'unsupported'
              ? '浏览器不支持手柄'
              : gamepadState.status === 'blocked'
                ? '手柄访问受限'
                : gamepadName
                  ? `手柄已断开 · ${gamepadName}`
                  : '手柄已断开'
  const gamepadTitle = gamepadState.status === 'waiting'
    ? '如未识别，请先将方向和油门回中，再拨动方向或油门'
    : gamepadState.id || gamepadText

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
  }, [
    videoProfile,
    videoMode,
    customSettings,
    videoDecoder,
    videoRefreshVersion,
  ])

  const refreshVideo = useCallback(() => {
    setVideoStats({ ...DEFAULT_VIDEO_STATS })
    setVideoRefreshVersion(current => current + 1)
  }, [])

  const initKeyBoard = () => {
    const onKeyDown = (e) => {
      if (gamepadActiveRef.current) return
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
      if (gamepadActiveRef.current) return
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

  const setReceiverInputCenter = (channel, pulse) => {
    if (!Number.isFinite(pulse)) return
    const center = Math.min(
      RECEIVER_INPUT_CENTER_MAX,
      Math.max(RECEIVER_INPUT_CENTER_MIN, Math.round(pulse)),
    )
    const next = {
      ...receiverInputCentersRef.current,
      [channel]: center,
    }
    receiverInputCentersRef.current = next
    setReceiverInputCenters(next)
    window.localStorage.setItem(
      channel === 'steering'
        ? RECEIVER_STEERING_CENTER_KEY
        : RECEIVER_THROTTLE_CENTER_KEY,
      center,
    )
  }

  useEffect(() => {
    let animationFrame
    let discoveryTimer
    let monitoring = false
    let destroyed = false
    let lastEmitAt = 0
    let lastSteeringPulse
    let lastThrottlePulse
    let lastGamepadId = ''
    let emergencyLatched = false
    let confirmedDisconnected = false

    const updateReceiverPwm = gamepad => {
      const next = getReceiverPwmTelemetry(gamepad)
      setReceiverPwmState(current => (
        current.supported === next.supported
        && current.valid === next.valid
        && current.steeringPulse === next.steeringPulse
        && current.throttlePulse === next.throttlePulse
          ? current
          : next
      ))
    }

    const updateStatus = (status, id = '') => {
      setGamepadState(current => (
        current.status === status && current.id === id
          ? current
          : { status, id }
      ))
    }

    const neutralizeGamepad = (status, id = '') => {
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

    const readSnapshot = () => readGamepadSnapshot(
      typeof navigator.getGamepads === 'function'
        ? () => navigator.getGamepads()
        : undefined,
    )

    const cancelScheduledMonitoring = () => {
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = undefined
      }
      if (discoveryTimer !== undefined) {
        window.clearTimeout(discoveryTimer)
        discoveryTimer = undefined
      }
    }

    const engageEmergencyStop = id => {
      socket.emit('setPulseLength', {
        pin: 15,
        data: THROTTLE_NEUTRAL,
      })
      socket.emit('setPulseLength', {
        pin: 14,
        data: steeringCenterRef.current,
      })
      gamepadActiveRef.current = false
      lastThrottlePulse = THROTTLE_NEUTRAL
      lastSteeringPulse = steeringCenterRef.current
      updateStatus('emergency', id)
    }

    const unavailableStatus = snapshot => (
      snapshot.status === 'waiting' && confirmedDisconnected
        ? 'disconnected'
        : snapshot.status
    )

    const handleUnavailableSnapshot = snapshot => {
      updateReceiverPwm(null)
      emergencyLatched = false
      neutralizeGamepad(
        unavailableStatus(snapshot),
        snapshot.id || lastGamepadId,
      )
    }

    const scheduleControlFrame = callback => {
      if (destroyed || !monitoring || document.hidden) return
      animationFrame = window.requestAnimationFrame(callback)
    }

    const scheduleDiscovery = (delay = GAMEPAD_DISCOVERY_INTERVAL_MS) => {
      if (destroyed || !monitoring || document.hidden) return
      if (discoveryTimer !== undefined) {
        window.clearTimeout(discoveryTimer)
      }
      discoveryTimer = window.setTimeout(() => {
        discoveryTimer = undefined
        scanGamepad()
      }, delay)
    }

    const pollGamepad = timestamp => {
      animationFrame = undefined
      if (destroyed || !monitoring || document.hidden) return

      const snapshot = readSnapshot()
      if (snapshot.status !== 'connected') {
        handleUnavailableSnapshot(snapshot)
        if (snapshot.status !== 'unsupported') scheduleDiscovery()
        return
      }

      const gamepad = snapshot.gamepad
      confirmedDisconnected = false
      lastGamepadId = gamepad.id || lastGamepadId
      updateReceiverPwm(gamepad)

      const input = getDriveGamepadInput(
        gamepad,
        {
          receiverSteeringCenter:
            receiverInputCentersRef.current.steering,
          receiverThrottleCenter:
            receiverInputCentersRef.current.throttle,
        },
      )
      const wasEmergencyLatched = emergencyLatched
      emergencyLatched = getGamepadEmergencyLatched({
        latched: emergencyLatched,
        emergencyPressed: input.emergencyPressed,
        leftY: input.leftY,
        rightX: input.rightX,
      })
      if (emergencyLatched) {
        if (!wasEmergencyLatched) engageEmergencyStop(gamepad.id)
        else updateStatus('emergency', gamepad.id)
        scheduleControlFrame(pollGamepad)
        return
      }
      if (wasEmergencyLatched) {
        neutralizeGamepad('connected', gamepad.id)
        scheduleControlFrame(pollGamepad)
        return
      }

      const output = getGamepadDriveOutput({
        leftY: input.leftY,
        rightX: input.rightX,
        steeringCenter: steeringCenterRef.current,
        steeringReversed: steeringReversedRef.current,
        motorReversed: motorReversedRef.current,
      })
      if (!output.active) {
        neutralizeGamepad('connected', gamepad.id)
        scheduleControlFrame(pollGamepad)
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

      scheduleControlFrame(pollGamepad)
    }

    function scanGamepad() {
      if (destroyed || !monitoring || document.hidden) return

      const snapshot = readSnapshot()
      if (snapshot.status !== 'connected') {
        handleUnavailableSnapshot(snapshot)
        if (snapshot.status !== 'unsupported') scheduleDiscovery()
        return
      }

      confirmedDisconnected = false
      lastGamepadId = snapshot.id || lastGamepadId
      updateReceiverPwm(snapshot.gamepad)
      neutralizeGamepad('connected', snapshot.id)
      scheduleControlFrame(pollGamepad)
    }

    const startMonitoring = () => {
      if (destroyed || document.hidden) return
      monitoring = true
      cancelScheduledMonitoring()
      scheduleDiscovery(0)
    }

    const stopMonitoring = () => {
      monitoring = false
      cancelScheduledMonitoring()
      emergencyLatched = false
      neutralizeGamepad(
        confirmedDisconnected ? 'disconnected' : 'waiting',
        lastGamepadId,
      )
    }

    const onVisibilityChange = () => {
      if (document.hidden) stopMonitoring()
      else startMonitoring()
    }
    const onGamepadConnected = event => {
      if (isDriveGamepadIdentity(event.gamepad)) {
        confirmedDisconnected = false
        lastGamepadId = event.gamepad.id || lastGamepadId
        updateReceiverPwm(event.gamepad)
        updateStatus('connected', event.gamepad.id)
      } else if (event.gamepad?.connected) {
        updateStatus('incompatible', event.gamepad.id)
      }
      startMonitoring()
    }
    const onGamepadDisconnected = event => {
      if (isDriveGamepadIdentity(event.gamepad)) {
        confirmedDisconnected = true
        emergencyLatched = false
        neutralizeGamepad('disconnected', event.gamepad.id)
      }
      startMonitoring()
    }

    window.addEventListener('blur', stopMonitoring)
    window.addEventListener('focus', startMonitoring)
    window.addEventListener('pageshow', startMonitoring)
    window.addEventListener('pagehide', stopMonitoring)
    window.addEventListener('gamepadconnected', onGamepadConnected)
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected)
    document.addEventListener('visibilitychange', onVisibilityChange)
    startMonitoring()

    return () => {
      destroyed = true
      monitoring = false
      cancelScheduledMonitoring()
      window.removeEventListener('blur', stopMonitoring)
      window.removeEventListener('focus', startMonitoring)
      window.removeEventListener('pageshow', startMonitoring)
      window.removeEventListener('pagehide', stopMonitoring)
      window.removeEventListener('gamepadconnected', onGamepadConnected)
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      neutralizeGamepad('waiting', lastGamepadId)
    }
  }, [])

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
          <span
            className={`GamepadStatus GamepadStatus--${gamepadState.status}`}
            title={gamepadTitle}
          >
            <i aria-hidden="true" />
            {gamepadText}
          </span>
          {receiverPwmState.supported && (
            <span
              className={[
                'ReceiverPwmStatus',
                receiverPwmState.valid ? 'valid' : 'invalid',
              ].join(' ')}
              title="点击方向或油门当前值，将其设为遥控器输入中位"
            >
              PWM · 方向&nbsp;
              <button
                className="ReceiverPwmValue"
                type="button"
                disabled={receiverPwmState.steeringPulse === null}
                onClick={() => setReceiverInputCenter(
                  'steering',
                  receiverPwmState.steeringPulse,
                )}
                title="将当前方向PWM设为遥控器输入中位"
              >
                {receiverPwmState.steeringPulse ?? '--'} μs
              </button>
              <small>中{receiverInputCenters.steering}</small>
              &nbsp;· 油门&nbsp;
              <button
                className="ReceiverPwmValue"
                type="button"
                disabled={receiverPwmState.throttlePulse === null}
                onClick={() => setReceiverInputCenter(
                  'throttle',
                  receiverPwmState.throttlePulse,
                )}
                title="将当前油门PWM设为遥控器输入中位，车辆输出仍为1500μs"
              >
                {receiverPwmState.throttlePulse ?? '--'} μs
              </button>
              <small>中{receiverInputCenters.throttle}</small>
            </span>
          )}
        </div>
        <button
          className="VideoRefreshButton"
          type="button"
          onClick={refreshVideo}
          title="重新连接视频图传"
        >
          <span aria-hidden="true">↻</span>
          刷新图传
        </button>
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
        <Direction onChange={e => {
          if (!gamepadActiveRef.current) pwmChange(14, 100 - e)
        }}/>
      </div>
      <br />
      <div className="Arm">
        <CrossHandle onChange={e => {
          pwmChange(13, e.armX)
        }}/>
      </div>
    </div>
  )
}

export default App
