import { useEffect, useRef, useState } from 'react'
import './index.css'

const activeStatuses = new Set([
  'connecting',
  'pipeline-ready',
  'remote-audio-ready',
  'connected',
  'reconnecting',
])

const getListenButtonLabel = (status, mode) => {
  if (activeStatuses.has(status) && mode !== 'talk') {
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

const getListenButtonTitle = (status, detail, mode) => {
  if (detail) {
    return detail
  }
  if (status === 'connected' && mode !== 'talk') {
    return '正在收听车端声音'
  }
  if (mode === 'talk' && activeStatuses.has(status)) {
    return '车端音箱已预连接，点击可改为打开树莓派麦克风'
  }
  if (status === 'requesting') {
    return '正在打开树莓派麦克风'
  }
  return '打开树莓派车端声音'
}

const getPlaybackLabel = kind => {
  if (kind === 'usb') {
    return 'USB'
  }
  if (kind === 'headphones') {
    return '耳机口'
  }
  return kind ? '其他输出' : ''
}

const VoiceControls = ({ socket }) => {
  const [status, setStatus] = useState('idle')
  const [speaking, setSpeaking] = useState(false)
  const [talkConnecting, setTalkConnecting] = useState(false)
  const [talkReady, setTalkReady] = useState(false)
  const [sessionMode, setSessionMode] = useState('ptt')
  const [detail, setDetail] = useState('')
  const [playbackKind, setPlaybackKind] = useState('')

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
  const lastTouchAtRef = useRef(0)
  const playbackKindRef = useRef('')

  const getTalkDetail = speakingNow => {
    const outputLabel = getPlaybackLabel(playbackKindRef.current)
    const base = speakingNow ? '正在向车端说话' : '车端音箱已就绪'
    return outputLabel ? `${base}（${outputLabel}）` : base
  }

  const setVoiceMode = mode => {
    sessionModeRef.current = mode
    setSessionMode(mode)
  }

  const setLocalTrackEnabled = enabled => {
    localStreamRef.current
      ?.getAudioTracks()
      .forEach(track => {
        track.enabled = enabled
      })
  }

  const stopSpeaking = ({
    updateDetail = true,
    endTalkSession = false,
    reason = 'ui-stop',
  } = {}) => {
    wantsSpeakingRef.current = false
    setSpeaking(false)
    setTalkConnecting(false)
    setLocalTrackEnabled(false)

    if (sessionModeRef.current === 'talk' && !endTalkSession) {
      if (updateDetail && sessionRef.current) {
        setDetail(talkReady ? getTalkDetail(false) : '正在预连接车端音箱')
      }
      return
    }

    voiceSenderRef.current?.replaceTrack(null).catch(() => {})

    if (endTalkSession && sessionModeRef.current === 'talk') {
      if (sessionRef.current) {
        emitDebug('stop-speaking', {
          message: reason,
        })
        socket.emit('voice:leave', {
          sessionId: sessionRef.current,
        })
      }
      closePeer()
      sessionRef.current = null
      setVoiceMode('ptt')
      stopLocalMedia()
      setTalkReady(false)
      playbackKindRef.current = ''
      setPlaybackKind('')
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
    setVoiceMode('ptt')
    setTalkReady(false)
    playbackKindRef.current = ''
    setPlaybackKind('')
    if (!keepStream) {
      stopLocalMedia()
    }
    if (!keepStatus) {
      setStatus('idle')
      setDetail('')
    }
  }

  const emitJoin = (mode = 'ptt') => {
    setVoiceMode(mode)
    socket.emit('voice:join', {
      mode,
    })
  }

  const emitDebug = (event, extra = {}) => {
    if (!sessionRef.current) {
      return
    }
    socket.emit('voice:debug', {
      sessionId: sessionRef.current,
      event,
      ...extra,
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
    setTalkReady(false)
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
    })
    peerRef.current = peer

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
        if (sessionModeRef.current === 'talk') {
          setTalkReady(true)
        }
        const localTrack = localStreamRef.current?.getAudioTracks()[0]
        if (
          wantsSpeakingRef.current
          && localTrack
          && voiceSenderRef.current
        ) {
          localTrack.enabled = true
          voiceSenderRef.current.replaceTrack(localTrack).catch(() => {})
          setSpeaking(true)
          setTalkConnecting(false)
          setDetail(getTalkDetail(true))
        } else {
          setTalkConnecting(false)
          setDetail(
            sessionModeRef.current === 'talk'
              ? getTalkDetail(false)
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

  const attachLocalMicForAnswer = async peer => {
    const localTrack = localStreamRef.current?.getAudioTracks()[0]
    const transceivers = peer.getTransceivers
      ? peer.getTransceivers()
      : []
    const audioTransceiver = transceivers.find(transceiver => (
      transceiver.receiver?.track?.kind === 'audio'
      || transceiver.sender?.track?.kind === 'audio'
    ))

    if (audioTransceiver) {
      if (sessionModeRef.current === 'talk') {
        audioTransceiver.direction = 'sendrecv'
      }
      voiceSenderRef.current = audioTransceiver.sender
      if (localTrack?.readyState === 'live') {
        localTrack.enabled = wantsSpeakingRef.current
        await audioTransceiver.sender.replaceTrack(localTrack)
        if (wantsSpeakingRef.current) {
          setTalkConnecting(true)
          setDetail('正在建立语音通道')
        }
        emitDebug('mic-attached-to-offer-transceiver')
      }
      return
    }

    if (wantsSpeakingRef.current && localTrack?.readyState === 'live') {
      localTrack.enabled = true
      const sender = peer.addTrack(localTrack, localStreamRef.current)
      voiceSenderRef.current = sender
      setTalkConnecting(true)
      setDetail('正在建立语音通道')
      emitDebug('mic-attached-with-add-track')
    }
  }

  useEffect(() => {
    const onVoiceState = payload => {
      if (!payload?.status) {
        return
      }

      if (payload.playbackKind) {
        playbackKindRef.current = payload.playbackKind
        setPlaybackKind(payload.playbackKind)
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
        setVoiceMode(payload.mode || sessionModeRef.current)

        restartingRef.current = false
        setStatus('connecting')
        setTalkReady(false)
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
        if (sessionModeRef.current === 'talk') {
          if (payload.status === 'remote-audio-ready') {
            setTalkReady(true)
            setTalkConnecting(false)
            if (wantsSpeakingRef.current) {
              setSpeaking(true)
              setDetail(getTalkDetail(true))
            } else {
              setSpeaking(false)
              setDetail(getTalkDetail(false))
            }
          } else if (payload.status === 'pipeline-ready') {
            setTalkConnecting(true)
            setDetail('正在建立语音通道')
          }
        }
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
          emitDebug('offer-received')
          await peerRef.current.setRemoteDescription(
            payload.description,
          )
          await attachLocalMicForAnswer(peerRef.current)
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
          emitDebug('answer-sent')
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
        emitDebug('signal-error', {
          message: error.message,
        })
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
    if (activeStatuses.has(status) && sessionModeRef.current !== 'talk') {
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
    if (sessionModeRef.current === 'talk' && sessionRef.current) {
      socket.emit('voice:leave', {
        sessionId: sessionRef.current,
      })
      resetVoice({ keepStatus: true })
    }
    emitJoin('ptt')
  }

  const connectTalkAudio = event => {
    event?.preventDefault?.()

    if (status === 'busy') {
      return
    }

    if (!window.RTCPeerConnection) {
      setStatus('error')
      setDetail('当前浏览器不支持 WebRTC 语音')
      return
    }

    if (sessionModeRef.current === 'talk' && sessionRef.current) {
      return
    }

    setStatus('requesting')
    setTalkReady(false)
    setTalkConnecting(true)
    setDetail('正在连接车端音箱')
    retryCountRef.current = 0
    emitJoin('talk')
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
    const eventType = event?.type || ''
    if (eventType.startsWith('touch')) {
      lastTouchAtRef.current = Date.now()
    }
    if (
      eventType.startsWith('mouse')
      && Date.now() - lastTouchAtRef.current < 800
    ) {
      return
    }

    if (wantsSpeakingRef.current) {
      return
    }

    if (status === 'busy' || !talkReady) {
      return
    }

    if (!window.RTCPeerConnection) {
      setStatus('error')
      setDetail('当前浏览器不支持 WebRTC 语音')
      return
    }

    event.preventDefault?.()
    wantsSpeakingRef.current = true
    setSpeaking(false)
    setTalkConnecting(true)
    setDetail('正在连接车端音箱')

    try {
      const stream = await ensureLocalMicStream()
      const track = stream.getAudioTracks()[0]
      if (!track) {
        return
      }
      if (!wantsSpeakingRef.current) {
        setLocalTrackEnabled(false)
        setTalkConnecting(false)
        stopLocalMedia()
        if (voiceSenderRef.current) {
          await voiceSenderRef.current.replaceTrack(null)
        }
        return
      }
      track.enabled = true
      if (voiceSenderRef.current) {
        if (voiceSenderRef.current.track !== track) {
          await voiceSenderRef.current.replaceTrack(track)
        }
        setTalkConnecting(false)
        setSpeaking(true)
        setDetail(getTalkDetail(true))
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
      setTalkConnecting(false)
      setLocalTrackEnabled(false)
      setDetail(
        error.name === 'NotAllowedError'
          ? '麦克风权限被拒绝'
          : `无法打开网页麦克风：${error.message}`,
      )
    }
  }

  const shouldIgnoreSyntheticMouse = event => {
    const eventType = event?.type || ''
    return eventType.startsWith('mouse')
      && Date.now() - lastTouchAtRef.current < 1200
  }

  const handleStopSpeaking = event => {
    if (shouldIgnoreSyntheticMouse(event)) {
      return
    }
    event?.preventDefault?.()
    stopSpeaking({
      reason: event?.type || 'ui-stop',
    })
  }

  const talkSessionActive = sessionMode === 'talk' && (
    activeStatuses.has(status) || status === 'requesting'
  )
  const talkCanSpeak = talkSessionActive && talkReady && !talkConnecting
  const talkDisabled = status === 'busy' || (talkConnecting && !talkReady)
  const talkButtonText = talkConnecting
    ? '连接中'
    : !talkSessionActive
      ? '连接音频'
      : speaking
        ? '讲话中'
        : '按住说话'
  const talkTitle = status === 'busy'
    ? '语音正在被其他页面使用'
    : talkCanSpeak
      ? '按住后网页端讲话，树莓派播放'
      : '先连接到树莓派音箱'

  return (
    <span
      className={`VoiceControls VoiceControls--${status}`}
      aria-label="语音控制"
    >
      <audio ref={audioRef} autoPlay playsInline />
      <button
        type="button"
        className={activeStatuses.has(status) && sessionMode !== 'talk' ? 'VoiceButton active' : 'VoiceButton'}
        title={getListenButtonTitle(status, detail, sessionMode)}
        onClick={toggleListening}
      >
        {getListenButtonLabel(status, sessionMode)}
      </button>
      <button
        type="button"
        className={`VoiceButton VoiceTalkButton${speaking ? ' transmitting' : ''}${talkConnecting ? ' connecting' : ''}`}
        disabled={talkDisabled}
        title={talkTitle}
        onClick={talkSessionActive ? undefined : connectTalkAudio}
        onMouseDown={talkCanSpeak ? startSpeaking : undefined}
        onMouseUp={talkCanSpeak ? handleStopSpeaking : undefined}
        onMouseLeave={talkCanSpeak ? handleStopSpeaking : undefined}
        onTouchStart={talkCanSpeak ? startSpeaking : undefined}
        onTouchEnd={talkCanSpeak ? handleStopSpeaking : undefined}
        onTouchCancel={talkCanSpeak ? handleStopSpeaking : undefined}
        onContextMenu={event => event.preventDefault()}
      >
        {talkButtonText}
      </button>
      {sessionMode === 'talk' && talkReady && playbackKind && (
        <span className={`VoiceOutput VoiceOutput--${playbackKind}`} title={detail}>
          {getTalkDetail(speaking)}
        </span>
      )}
      {status === 'error' && detail && (
        <span className="VoiceError" role="alert">
          {detail}
        </span>
      )}
    </span>
  )
}

export default VoiceControls
