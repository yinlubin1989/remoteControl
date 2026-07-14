import { useEffect, useRef, useState } from 'react'
import { applyCockpitSteeringCurve } from './controlMath'
import './index.css'

const CENTER = 50
const STEERING_GESTURE_RATIO = 0.5

const clamp = value => Math.min(100, Math.max(0, value))

const CockpitControls = ({
  onSteeringChange,
  onThrottleChange,
  onBrake,
  isLimit,
  wifiText,
  wifiWarning,
  videoStats,
  onExitCockpit,
}) => {
  const steeringPointerRef = useRef(null)
  const steeringStartRef = useRef(null)
  const throttlePointerRef = useRef(null)
  const throttleStartRef = useRef(null)
  const throttleZoneRef = useRef(0)
  const [steering, setSteering] = useState(CENTER)
  const [throttle, setThrottle] = useState(CENTER)
  const [steeringActive, setSteeringActive] = useState(false)
  const [throttleActive, setThrottleActive] = useState(false)
  const [braking, setBraking] = useState(false)
  const [isLandscape, setIsLandscape] = useState(() => (
    window.matchMedia('(orientation: landscape)').matches
  ))

  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape)')
    const updateOrientation = event => setIsLandscape(event.matches)
    if (media.addEventListener) {
      media.addEventListener('change', updateOrientation)
    } else {
      media.addListener(updateOrientation)
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', updateOrientation)
      } else {
        media.removeListener(updateOrientation)
      }
    }
  }, [])

  useEffect(() => {
    onSteeringChange(steering, steeringActive)
  }, [onSteeringChange, steering, steeringActive])

  useEffect(() => {
    onThrottleChange(throttle, throttleActive)
  }, [onThrottleChange, throttle, throttleActive])

  useEffect(() => {
    if (!isLandscape) {
      steeringPointerRef.current = null
      throttlePointerRef.current = null
      steeringStartRef.current = null
      throttleStartRef.current = null
      setSteeringActive(false)
      setThrottleActive(false)
      setBraking(false)
      setSteering(CENTER)
      setThrottle(CENTER)
      onBrake(false)
    }
  }, [isLandscape, onBrake])

  useEffect(() => {
    const resetControls = () => {
      steeringPointerRef.current = null
      throttlePointerRef.current = null
      steeringStartRef.current = null
      throttleStartRef.current = null
      throttleZoneRef.current = 0
      setSteeringActive(false)
      setThrottleActive(false)
      setBraking(false)
      setSteering(CENTER)
      setThrottle(CENTER)
      onBrake(false)
    }
    const resetWhenHidden = () => {
      if (document.hidden) resetControls()
    }

    window.addEventListener('blur', resetControls)
    document.addEventListener('visibilitychange', resetWhenHidden)
    return () => {
      window.removeEventListener('blur', resetControls)
      document.removeEventListener('visibilitychange', resetWhenHidden)
    }
  }, [onBrake])

  const startSteering = event => {
    steeringPointerRef.current = event.pointerId
    steeringStartRef.current = {
      clientX: event.clientX,
      value: steering,
      width: event.currentTarget.getBoundingClientRect().width,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setSteeringActive(true)
  }

  const moveSteering = event => {
    if (event.pointerId !== steeringPointerRef.current) return
    const start = steeringStartRef.current
    if (!start) return

    const change = (
      (event.clientX - start.clientX) / start.width
    ) * 100 * STEERING_GESTURE_RATIO
    setSteering(clamp(start.value + change))
  }

  const releaseSteering = event => {
    if (
      steeringPointerRef.current !== null
      && event.pointerId !== steeringPointerRef.current
    ) return

    steeringPointerRef.current = null
    steeringStartRef.current = null
    setSteeringActive(false)
    setSteering(CENTER)
  }

  const startThrottle = event => {
    throttlePointerRef.current = event.pointerId
    throttleStartRef.current = {
      clientY: event.clientY,
      value: throttle,
      height: event.currentTarget.getBoundingClientRect().height,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setThrottleActive(true)
  }

  const moveThrottle = event => {
    if (event.pointerId !== throttlePointerRef.current) return
    const start = throttleStartRef.current
    if (!start) return

    const change = (
      (event.clientY - start.clientY) / start.height
    ) * 100
    const nextThrottle = clamp(start.value + change)
    const nextZone = nextThrottle < 48 ? -1 : nextThrottle > 52 ? 1 : 0

    if (
      nextZone === 0
      && throttleZoneRef.current !== 0
      && window.navigator.vibrate
    ) {
      window.navigator.vibrate(8)
    }
    throttleZoneRef.current = nextZone
    setThrottle(nextThrottle)
  }

  const releaseThrottle = event => {
    if (
      throttlePointerRef.current !== null
      && event.pointerId !== throttlePointerRef.current
    ) return

    throttlePointerRef.current = null
    throttleStartRef.current = null
    throttleZoneRef.current = 0
    setThrottleActive(false)
    setThrottle(CENTER)
  }

  const startBrake = event => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setBraking(true)
    onBrake(true)
  }

  const releaseBrake = () => {
    setBraking(false)
    onBrake(false)
  }

  if (!isLandscape) {
    return (
      <div className="CockpitRotatePrompt" role="status">
        <div className="CockpitRotatePhone" aria-hidden="true">
          <span />
        </div>
        <strong>请旋转手机</strong>
        <span>驾驶舱仅在横屏启用 · 车辆已保持中立</span>
        <button type="button" onClick={onExitCockpit}>退出驾驶舱</button>
      </div>
    )
  }

  const steeringPercent = Math.round(
    (applyCockpitSteeringCurve(steering) - CENTER) * 2,
  )
  const throttlePercent = Math.round(Math.abs(throttle - CENTER) * 2)
  const throttleLabel = throttle < CENTER
    ? `前进 ${throttlePercent}%`
    : throttle > CENTER
      ? `倒车 ${throttlePercent}%`
      : '空挡 0%'

  return (
    <section className="CockpitControls" aria-label="横屏高速驾驶舱">
      <div className="CockpitTelemetry">
        <span className={wifiWarning ? 'warning' : ''}>{wifiText}</span>
        <span>{videoStats.fps} FPS</span>
        <span>DROP {videoStats.dropped}</span>
        <span className={isLimit ? 'limited' : ''}>
          {isLimit ? 'LIMIT ON' : 'LIMIT OFF'}
        </span>
      </div>

      <div className={`CockpitThrottle${throttleActive ? ' active' : ''}`}>
        <div className="CockpitControlLabel">
          <span>THROTTLE</span>
          <strong>{throttleLabel}</strong>
        </div>
        <div
          className="CockpitThrottleTouch"
          onPointerDown={startThrottle}
          onPointerMove={moveThrottle}
          onPointerUp={releaseThrottle}
          onPointerCancel={releaseThrottle}
        >
          <span className="CockpitThrottleMark forward">前进</span>
          <span className="CockpitThrottleMark neutral">N</span>
          <span className="CockpitThrottleMark reverse">倒车</span>
          <div className="CockpitThrottleTrack">
            <span className="CockpitThrottleFill forward" style={{ height: `${Math.max(0, CENTER - throttle)}%` }} />
            <span className="CockpitThrottleFill reverse" style={{ height: `${Math.max(0, throttle - CENTER)}%` }} />
            <div className="CockpitThrottleKnob" style={{ top: `${throttle}%` }}>
              <i />
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`CockpitEmergency${braking ? ' active' : ''}`}
        onPointerDown={startBrake}
        onPointerUp={releaseBrake}
        onPointerCancel={releaseBrake}
      >
        <span>EMERGENCY</span>
        <strong>急停</strong>
      </button>

      <div className={`CockpitSteering${steeringActive ? ' active' : ''}`}>
        <div className="CockpitControlLabel">
          <span>STEERING</span>
          <strong>
            {steeringPercent === 0
              ? '回中 0%'
              : `${steeringPercent < 0 ? '左' : '右'} ${Math.abs(steeringPercent)}%`}
          </strong>
        </div>
        <div
          className="CockpitSteeringTouch"
          onPointerDown={startSteering}
          onPointerMove={moveSteering}
          onPointerUp={releaseSteering}
          onPointerCancel={releaseSteering}
        >
          <div
            className="CockpitWheel"
            style={{ transform: `rotate(${steeringPercent * 0.9}deg)` }}
          >
            <span className="CockpitWheelGrip top" />
            <span className="CockpitWheelGrip left" />
            <span className="CockpitWheelGrip right" />
            <span className="CockpitWheelSpoke horizontal" />
            <span className="CockpitWheelSpoke vertical" />
            <span className="CockpitWheelHub">RC</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default CockpitControls
