import { useState, useEffect, useRef } from 'react'
import './index.css'

const Main = ({
  children, onClose, visible
}) => {
  if (!visible) return
  return (
    <div className="modal-wrapper">
      <div className="modal">
        {onClose ? <a className="close" onClick={onClose}>关闭</a> : null}
        {children}
      </div>
    </div>
  )
}

export default Main
