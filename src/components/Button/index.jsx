import { useState, useEffect, useRef } from 'react'
import './index.css'

const Main = ({
  onClick, Children
}) => {
  return (
    <a onClick={onClick}>
      {Children}
    </a>
  )
}

export default Main
