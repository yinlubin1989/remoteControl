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
window.socket = socket;

// setInterval(() => {
//   socket.emit('hb')
// }, 200)

function App() {
  const videoZero = () => {
    window.wsavc = new WSAvcPlayer({ useWorker: false })
    document.getElementById('screen').appendChild(window.wsavc.AvcPlayer.canvas)
    window.wsavc.connect("ws://39.106.81.156:5001/video")
    window.wsavc.ws.onopen = () => {
      window.wsavc.send({ mode: 3 })
    }
    window.wsavc.ws.addEventListener('message', () => {
      // setIsLoading(false)
    })
    window.wsavc.ws.onerror = () => {
      console.error('error')
    }
  }

  useEffect(() => {
    videoZero()
  }, [])

  const armChange = (e, xPinKey, yPinKey) => {
    console.log('通讯gpio', e.armX, e.armY)
  }

  return (
    <div className="App">
      <div id="screen">
        {/* <div id="cursor" style={{ top: `${armY}%`, left: `${armX}%` }} /> */}
      </div>
      <div className="Console">
        <div>
          <SliderHandle
            onChange={e => armChange(e, 1, 2)}
            title="速度"
            defalutValue={20}
            width="20vw"
          />
          <a className="Start">油门</a>
        </div>
        <div className="Right">
          <Gear onChange={e => armChange(e, 1, 2)}/>
          <Direction
            onChange={() => {}}
          />
        </div>
      </div>
      <br />
      <div className="Arm">
        <SliderHandle onChange={e => armChange(e, 1, 2)}/>
        <CrossHandle onChange={e => armChange(e, 1, 2)}/>
        <DiskHandle onChange={e => armChange(e, 1, 2)}/>
        <SliderHandle onChange={e => armChange(e, 1, 2)}/>
      </div>
    </div>
  )
}

export default App
