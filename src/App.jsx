import { useEffect, useState } from 'react'
import WSAvcPlayer from 'ws-avc-player'
import io from 'socket.io-client'
import Keybords from './components/Keybords'
import TankControl from './components/TankControl'
import WheelControl from './components/WheelControl'

import './App.css'

const MODE_STORAGE_KEY = 'remote-control-mode'
const controlUrl = import.meta.env.VITE_CONTROL_URL || window.location.origin
const controlPath = import.meta.env.VITE_CONTROL_PATH || '/car-control/socket.io'
const videoUrl = import.meta.env.VITE_VIDEO_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/car-video/video`

const socket = io(controlUrl, { path: controlPath })
window.socket = socket

let heartbeatTimer

socket.on('connect', () => {
  socket.emit('hb')
  clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => socket.emit('hb'), 500)
})

socket.on('disconnect', () => {
  clearInterval(heartbeatTimer)
})

const getInitialMode = () => {
  const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY)
  return storedMode === 'tank' ? 'tank' : 'wheel'
}

function App() {
  const [mode, setMode] = useState(getInitialMode)
  const [isLimit, setIsLimit] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(null)

  const videoZero = (videoMode = 3) => {
    if (window.wsavc) {
      window.wsavc.send({ mode: videoMode })
      return
    }

    window.wsavc = new WSAvcPlayer({ useWorker: false })
    document.getElementById('screen').appendChild(window.wsavc.AvcPlayer.canvas)
    window.wsavc.connect(videoUrl)
    window.wsavc.ws.onopen = () => window.wsavc.send({ mode: videoMode })
    window.wsavc.ws.onerror = () => console.error('video connection error')
  }

  useEffect(() => {
    videoZero()

    return () => {
      if (window.wsavc?.ws) window.wsavc.ws.close()
      window.wsavc = null
      document.getElementById('screen').innerHTML = ''
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  }, [mode])

  useEffect(() => {
    if (isFullScreen === true) {
      document.querySelector('.App').requestFullscreen()
    } else if (isFullScreen === false && document.fullscreenElement) {
      document.exitFullscreen()
    }
  }, [isFullScreen])

  return (
    <div className={`App ${mode === 'tank' ? 'tankMode' : 'wheelMode'} ${isFullScreen ? 'fullScreen' : ''}`}>
      <div id="screen" />
      <Keybords
        socket={socket}
        mode={mode}
        onModeChange={setMode}
        videoChange={() => videoZero(2)}
        limitChange={setIsLimit}
        fullScreen={() => setIsFullScreen(value => !value)}
      />
      {mode === 'wheel' ? (
        <WheelControl socket={socket} isLimit={isLimit} />
      ) : (
        <TankControl socket={socket} />
      )}
    </div>
  )
}

export default App
