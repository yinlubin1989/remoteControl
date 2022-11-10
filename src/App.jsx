import { useState, useEffect, useRef } from 'react'
import WSAvcPlayer from "ws-avc-player";
import io from 'socket.io-client'
import CrossHandle from './components/CrossHandle';
import SliderHandle from './components/SliderHandle';
import DiskHandle from './components/DiskHandle';

import './App.css'

const socket = io('http://39.106.81.156:5005');
window.socket = socket;

// setInterval(() => {
//   socket.emit('hb')
// }, 200)

function App() {
  const videoZero = () => {
    window.wsavc = new WSAvcPlayer({ useWorker: false })
    document.getElementById('screen').appendChild(window.wsavc.AvcPlayer.canvas)
    window.wsavc.connect("ws://39.106.81.156:5001/video");
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
      <div className="arm">
        <SliderHandle onChange={e => armChange(e, 1, 2)}/>
        <CrossHandle onChange={e => armChange(e, 1, 2)}/>
        <DiskHandle onChange={e => armChange(e, 1, 2)}/>
        {/* <CrossHandle onChange={e => armChange(e, 3, 4)}/> */}
      </div>
    </div>
  )
}

export default App
