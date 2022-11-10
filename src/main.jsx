import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

let lastP;

const App1 = () => {
    const [height, setHeight] = useState(300)
    useEffect(() => {
        // document.addEventListener('scroll', (e) => {
        //     if (document.documentElement.scrollTop > 0) {
        //         setHeight(80)
        //     } else {
        //         setHeight(300)
        //     }
        // })
        document.body.style.position = 'fixed'
    }, [])
    
    return (
        <div className='wrapper' style={{ overflow: 'hidden'}}
            onTouchStart={(e) => {
                const { clientY } = e.targetTouches[0]
                lastP = clientY
            }}
            onTouchMove={(e) => {
                const { clientY } = e.targetTouches[0]
                if (clientY < lastP) {
                    setHeight(80)
                    setTimeout(() => {
                        document.body.style.position = 'relative'
                    }, 1000)
                    
                }
            }}
        >
            <div className='top' id="top" style={{ height: `${height}px` }}>

            </div>
            <div className='main' style={{paddingTop: `${height}px`}}>
                1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />
                1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />
                1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />1<br />1111111<br />11111111<br />1111111111<br />1111111111<br />111<br />1<br />1<br />
            </div>
        </div>
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App1 />)
