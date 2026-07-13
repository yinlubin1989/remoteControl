import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const preventDefault = event => event.preventDefault()

// iOS Safari exposes pinch zoom through non-standard gesture events.
;['gesturestart', 'gesturechange', 'gestureend'].forEach(eventName => {
  document.addEventListener(eventName, preventDefault, { passive: false })
})

document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) {
    event.preventDefault()
  }
}, { passive: false })

document.addEventListener('dblclick', preventDefault, { passive: false })

document.addEventListener('wheel', event => {
  if (event.ctrlKey) {
    event.preventDefault()
  }
}, { passive: false })

document.addEventListener('keydown', event => {
  const zoomKeys = ['+', '-', '=', '0']
  if ((event.ctrlKey || event.metaKey) && zoomKeys.includes(event.key)) {
    event.preventDefault()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
