import { useEffect, useRef, useState } from 'react'
import CrossHandle from '../CrossHandle'
import Direction from '../Direction'
import Gear from '../Gear'
import SliderHandle from '../SliderHandle'

const WheelControl = ({ socket, isLimit }) => {
  const speed = useRef(0)
  const gear = useRef('D')
  const [wheel, setWheel] = useState(50)
  const [throttle, setThrottle] = useState(0)
  const [camera, setCamera] = useState(50)

  const setPwm = (pin, value) => {
    socket.emit('setPulseLength', {
      pin,
      data: value * 20 + 500
    })
  }

  const stopDrive = () => socket.emit('channelOff', { pin: 15 })

  const startDrive = () => {
    if (gear.current === 'N') return

    const direction = gear.current === 'D' ? -1 : 1
    socket.emit('setPulseLength', {
      pin: 15,
      data: 1500 + direction * speed.current * 5
    })
  }

  useEffect(() => {
    const resetDrive = () => {
      socket.emit('setPulseLength', { pin: 14, data: 1500 })
      socket.emit('setPulseLength', { pin: 15, data: 1500 })
    }

    resetDrive()

    const onKeyDown = event => {
      if (event.key === ' ') startDrive()
      if (event.key === 'ArrowLeft') setPwm(14, 90)
      if (event.key === 'ArrowRight') setPwm(14, 10)
    }
    const onKeyUp = event => {
      if (event.key === ' ') stopDrive()
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setPwm(14, 50)
    }
    const gamepadTimer = setInterval(() => {
      const gamepad = [...(navigator.getGamepads?.() || [])].find(item => item?.id?.includes?.('Xbox'))
      if (!gamepad?.axes) return

      const [, gamepadThrottle, gamepadWheel] = gamepad.axes
      setWheel(50 - Math.round(gamepadWheel * 100) / 2)
      setThrottle(50 - Math.round(gamepadThrottle * 100) / 2)
      if (gamepad.buttons[6].touched) gear.current = 'R'
      if (gamepad.buttons[7].touched) gear.current = 'D'
      setCamera(gamepad.buttons[4].touched ? 0 : gamepad.buttons[5].touched ? 100 : 50)
    }, 20)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    socket.on('connect', resetDrive)

    return () => {
      clearInterval(gamepadTimer)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      socket.off('connect', resetDrive)
      resetDrive()
    }
  }, [])

  useEffect(() => setPwm(2, camera), [camera])

  useEffect(() => {
    socket.emit('setPulseLength', {
      pin: 14,
      data: ((wheel - 50) * 0.5 + 50) * 19 + 610
    })
  }, [wheel])

  useEffect(() => {
    if (gear.current === 'N') return

    let pwm = 1500
    if (gear.current === 'D') pwm -= (throttle - 50) * (isLimit ? 5 : 14)
    if (gear.current === 'R') pwm += (throttle - 50) * (isLimit ? 4 : 13)
    if (throttle < 50) pwm = 1500

    if (throttle === 50) stopDrive()
    else socket.emit('setPulseLength', { pin: 15, data: pwm })
  }, [throttle, isLimit])

  return (
    <>
      <div className="Console">
        <SliderHandle
          onChange={value => { speed.current = value }}
          title="速度"
          defalutValue={0}
          width="20vw"
          className="SpeedSlider"
        />
        <a className="Start" onTouchStart={startDrive} onTouchEnd={stopDrive}>油门</a>
        <a
          className="Brake"
          onTouchStart={() => socket.emit('setPulseLength', { pin: 15, data: 1500 })}
          onTouchEnd={stopDrive}
        >stop</a>
        <Gear onChange={value => { gear.current = value }} />
        <Direction onChange={value => setPwm(14, 100 - value)} />
      </div>
      <div className="Arm">
        <CrossHandle onChange={({ armX }) => setPwm(13, armX)} />
      </div>
    </>
  )
}

export default WheelControl
