import { useEffect, useRef, useState } from 'react'
import './index.css'

const activeStatuses = new Set([
  'connecting',
  'pipeline-ready',
  'remote-audio-ready',
  'connected',
  'reconnecting',
])

const getListenButtonLabel = status => {
  if (activeStatuses.has(status)) {
    return '关闭声音'
  }
  if (status === 'busy') {
    return '语音占用'
  }
  if (status === 'error') {
    return '重试声音'
  }
  return '打开声音'
}

const getListenButtonTitle = (status, detail) => {
  if (detail) {
    return detail
  }
  if (status === 'connected') {
    return '正在收听车端声音'
  }
  if (status === 'requesting') {
    return '正在打开树莓派麦克风'
  }
  return '打开树莓派车端声音'
}

const VoiceControls = ({ socket }) => {
  const [status, setStatus] = useState('idle')
  const [speaking, setSpeaking] = useState(false)
  const [detail, setDetail] = useState('')

  const audioRef = useRef()
  const peerRef = useRef()
  const localStreamRef = useRef()
  const voiceSenderRef = useRef()
  const sessionRef = useRef()
  const sessionModeRef = useRef('ptt')
  const pendingCandidatesRef = useRef([])
  const retryCountRef = useRef(0)
  const restartingRef = useRef(false)
  const wantsSpeakingRef = useRef(false)

  const setLocalTrackEnabled = enabled => {
    localStreamRef.current
      ?.getAudioTracks()
      .forEach(track => {
        track.enabled = enabled
      })
  }

  const stopSpeaking = ({
    updateDetail = true,
    endTalkSession = true,
  } = {}) => {
    wantsSpeakingRef.current = false
    setSpeaking(false)
    setLocalTrackEnabled(false)
    voiceSenderRef.current?.replaceTrack(null).catch(() => {})

    if (endTalkSession && sessionModeRef.current === 'talk') {
      if (sessionRef.current) {
        socket.emit('voice:leave', {
          sessionId: sessionRef.current,
        })
      }
      closePeer()
      sessionRef.current = null
      sessionModeRef.current = 'ptt'
      stopLocalMedia()
      setStatus('idle')
      setDetail('')
      return
    }

    stopLocalMedia()
    if (updateDetail && sessionRef.current) {
      setDetail('正在收听车端声音')
    }
  }

  const stopLocalMedia = () => {
    localStreamRef.current
      ?.getTracks()
      .forEach(track => track.stop())
    localStreamRef.current = null
  }

  const closePeer = () => {
    pendingCandidatesRef.current = []
    if (peerRef.current) {
      peerRef.current.onicecandidate = null
      peerRef.current.ontrack = null
      peerRef.current.onconnectionstatechange = null
      peerRef.current.close()
      peerRef.current = null
    }
    voiceSenderRef.current = null
    if (audioRef.current) {
      audioRef.current.srcObject = null
    }
  }

  const resetVoice = ({ keepStream = false, keepStatus = false } = {}) => {
    stopSpeaking({ updateDetail: false, endTalkSession: false })
    closePeer()
    sessionRef.current = null
    sessionModeRef.current = 'ptt'
    if (!keepStream) {
      stopLocalMedia()
    }
    if (!keepStatus) {
      setStatus('idle')
      setDetail('')
    }
  }

  const emitJoin = (mode = 'ptt') => {
    sessionModeRef.current = mode
    socket.emit('voice:join', {
      mode,
    })
  }

  const restartVoice = () => {
    if (retryCountRef.current >= 1) {
      setStatus('error')
      setDetail('网络连接中断，请重新打开声音')
      socket.emit('voice:leave', {
        sessionId: sessionRef.current,
      })
      resetVoice({ keepStatus: true })
      return
    }

    retryCountRef.current += 1
    restartingRef.current = true
    setStatus('reconnecting')
    setDetail('网络波动，正在重连')
    socket.emit('voice:leave', {
      sessionId: sessionRef.current,
    })
    closePeer()
    sessionRef.current = null
    setTimeout(() => emitJoin(sessionModeRef.current), 450)
  }

  const createPeer = iceServers => {
    closePeer()
    const peer = new RTCPeerConnection({
      iceServers,
      bundlePolicy: 'max-bundle',
    })
    peerRef.current = peer
    const transceiver = peer.addTransceiver('audio', {
      direction: 'sendrecv',
    })
    voiceSenderRef.current = transceiver.sender

    peer.onicecandidate = event => {
      if (!event.candidate || !sessionRef.current) {
        return
      }
      socket.emit('voice:signal', {
        sessionId: sessionRef.current,
        candidate: event.candidate.toJSON
          ? event.candidate.toJSON()
          : event.candidate,
      })
    }

    peer.ontrack = event => {
      const remoteStream = event.streams[0]
        || new MediaStream([event.track])
      if (audioRef.current) {
        audioRef.current.srcObject = remoteStream
        audioRef.current.play().catch(() => {
          setDetail('浏览器阻止自动播放，请关闭声音后再打开')
        })
      }
    }

    peer.onconnectionstatechange = () => {
      if (peer !== peerRef.current) {
        return
      }
      if (peer.connectionState === 'connected') {
        restartingRef.current = false
        retryCountRef.current = 0
        setStatus('connected')
        const localTrack = localStreamRef.current?.getAudioTracks()[0]
        if (
          wantsSpeakingRef.current
          && localTrack
          && voiceSenderRef.current
        ) {
          localTrack.enabled = true
          voiceSenderRef.current.replaceTrack(localTrack).catch(() => {})
          setSpeaking(true)
          setDetail('正在向车端说话')
        } else {
          setDetail(
            sessionModeRef.current === 'talk'
              ? '车端播放已连接'
              : '正在收听车端声音',
          )
        }
      } else if (peer.connectionState === 'failed') {
        restartVoice()
      } else if (peer.connectionState === 'disconnected') {
        setDetail('网络波动，等待恢复')
      }
    }

    return peer
  }

  useEffect(() => {
    const onVoiceState = payload => {
      if (!payload?.status) {
        return
      }

      if (payload.status === 'idle') {
        if (restartingRef.current) {
          return
        }
        resetVoice()
        return
      }

      if (payload.status === 'busy') {
        if (!sessionRef.current) {
          setStatus('busy')
          setDetail('其他页面正在使用语音')
        }
        return
      }

      if (payload.sessionId && payload.status === 'connecting') {
        sessionRef.current = payload.sessionId
        sessionModeRef.current = payload.mode || sessionModeRef.current

        if (
          sessionModeRef.current === 'talk'
          && !wantsSpeakingRef.current
        ) {
          socket.emit('voice:leave', {
            sessionId: payload.sessionId,
          })
          resetVoice()
          return
        }

        restartingRef.current = false
        setStatus('connecting')
        setDetail(
          sessionModeRef.current === 'talk'
            ? '正在连接车端音箱'
            : '正在连接车端声音',
        )
        createPeer(payload.iceServers || [])
        return
      }

      if (
        payload.sessionId === sessionRef.current
        && payload.status !== 'mode-changed'
      ) {
        setStatus(payload.status)
      }
    }

    const onVoiceSignal = async payload => {
      if (
        !payload
        || payload.sessionId !== sessionRef.current
        || !peerRef.current
      ) {
        return
      }

      try {
        if (payload.description?.type === 'offer') {
          await peerRef.current.setRemoteDescription(
            payload.description,
          )
          for (const candidate of pendingCandidatesRef.current) {
            await peerRef.current.addIceCandidate(candidate)
          }
          pendingCandidatesRef.current = []
          const answer = await peerRef.current.createAnswer()
          await peerRef.current.setLocalDescription(answer)
          socket.emit('voice:signal', {
            sessionId: sessionRef.current,
            description: peerRef.current.localDescription,
          })
        } else if (payload.candidate) {
          if (peerRef.current.remoteDescription) {
            await peerRef.current.addIceCandidate(payload.candidate)
          } else {
            pendingCandidatesRef.current.push(payload.candidate)
          }
        }
      } catch (error) {
        setStatus('error')
        setDetail(`语音协商失败：${error.message}`)
      }
    }

    const onVoiceError = payload => {
      const isBusy = payload?.code === 'busy'
      setStatus(isBusy ? 'busy' : 'error')
      setDetail(payload?.message || '语音服务异常')
      resetVoice({ keepStatus: true })
    }

    const onDisconnect = () => {
      setStatus('error')
      setDetail('控制连接已断开')
      resetVoice({ keepStatus: true })
    }

    socket.on('voice:state', onVoiceState)
    socket.on('voice:signal', onVoiceSignal)
    socket.on('voice:error', onVoiceError)
    socket.on('disconnect', onDisconnect)

    const heartbeatTimer = setInterval(() => {
      if (sessionRef.current) {
        socket.emit('voice:heartbeat', {
          sessionId: sessionRef.current,
        })
      }
    }, 2000)

    const forceMute = () => {
      stopSpeaking()
    }
    const onVisibilityChange = () => {
      if (document.hidden) {
        forceMute()
      }
    }
    window.addEventListener('blur', forceMute)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(heartbeatTimer)
      window.removeEventListener('blur', forceMute)
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      )
      socket.off('voice:state', onVoiceState)
      socket.off('voice:signal', onVoiceSignal)
      socket.off('voice:error', onVoiceError)
      socket.off('disconnect', onDisconnect)
      if (sessionRef.current) {
        socket.emit('voice:leave', {
          sessionId: sessionRef.current,
        })
      }
      resetVoice()
    }
  }, [socket])

  const toggleListening = async () => {
    if (activeStatuses.has(status)) {
      socket.emit('voice:leave', {
        sessionId: sessionRef.current,
      })
      resetVoice()
      return
    }

    if (!window.RTCPeerConnection) {
      setStatus('error')
      setDetail('当前浏览器不支持 WebRTC 语音')
      return
    }

    setStatus('requesting')
    setDetail('正在打开车端麦克风')
    retryCountRef.current = 0
    audioRef.current?.play().catch(() => {})
    emitJoin('ptt')
  }

  const ensureLocalMicStream = async () => {
    const currentTrack = localStreamRef.current?.getAudioTracks()[0]
    if (currentTrack && currentTrack.readyState === 'live') {
      return localStreamRef.current
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
    localStreamRef.current = stream
    setLocalTrackEnabled(false)
    return stream
  }

  const startSpeaking = async event => {
    if (
      status === 'busy'
      || (activeStatuses.has(status) && status !== 'connected')
    ) {
      return
    }

    if (!window.RTCPeerConnection) {
      setStatus('error')
      setDetail('当前浏览器不支持 WebRTC 语音')
      return
    }

    event.currentTarget.setPointerCapture?.(event.pointerId)
    wantsSpeakingRef.current = true
    setSpeaking(true)
    setDetail('正在讲话')

    try {
      const stream = await ensureLocalMicStream()
      const track = stream.getAudioTracks()[0]
      if (!track) {
        return
      }
      if (!wantsSpeakingRef.current) {
        setLocalTrackEnabled(false)
        stopLocalMedia()
        if (voiceSenderRef.current) {
          await voiceSenderRef.current.replaceTrack(null)
        }
        return
      }
      track.enabled = true
      if (status === 'connected' && voiceSenderRef.current) {
        await voiceSenderRef.current.replaceTrack(track)
        return
      }

      if (activeStatuses.has(status)) {
        return
      }

      setStatus('requesting')
      setDetail('正在连接车端音箱')
      retryCountRef.current = 0
      emitJoin('talk')
    } catch (error) {
      wantsSpeakingRef.current = false
      setSpeaking(false)
      setLocalTrackEnabled(false)
      setDetail(
        error.name === 'NotAllowedError'
          ? '麦克风权限被拒绝'
          : `无法打开网页麦克风：${error.message}`,
      )
    }
  }

  const talkDisabled = status === 'busy'
    || (activeStatuses.has(status) && status !== 'connected')
  const talkTitle = status === 'connected'
    ? '按住后网页端讲话，树莓派播放'
    : status === 'busy'
      ? '语音正在被其他页面使用'
      : '按住后网页端讲话，树莓派播放'

  return (
    <span
      className={`VoiceControls VoiceControls--${status}`}
      aria-label="语音控制"
    >
      <audio ref={audioRef} autoPlay playsInline />
      <button
        type="button"
        className={activeStatuses.has(status) ? 'VoiceButton active' : 'VoiceButton'}
        title={getListenButtonTitle(status, detail)}
        onClick={toggleListening}
      >
        {getListenButtonLabel(status)}
      </button>
      <button
        type="button"
        className={`VoiceButton VoiceTalkButton${speaking ? ' transmitting' : ''}`}
        disabled={talkDisabled}
        title={talkTitle}
        onPointerDown={startSpeaking}
        onPointerUp={stopSpeaking}
        onPointerCancel={stopSpeaking}
        onLostPointerCapture={stopSpeaking}
        onContextMenu={event => event.preventDefault()}
      >
        {speaking ? '讲话中' : '按住说话'}
      </button>
    </span>
  )
}

export default VoiceControls
