import WSAvcPlayer from 'ws-avc-player'

const DEFAULT_STATS = {
  decoder: 'connecting',
  fps: 0,
  queue: 0,
  dropped: 0,
  status: 'connecting',
}

const toUint8Array = (value) => (
  value instanceof Uint8Array ? value : new Uint8Array(value)
)

const findNalUnits = (data) => {
  const units = []
  let current = null

  for (let index = 0; index < data.length - 3; index += 1) {
    let startCodeLength = 0

    if (
      data[index] === 0
      && data[index + 1] === 0
      && data[index + 2] === 1
    ) {
      startCodeLength = 3
    } else if (
      data[index] === 0
      && data[index + 1] === 0
      && data[index + 2] === 0
      && data[index + 3] === 1
    ) {
      startCodeLength = 4
    }

    if (!startCodeLength) {
      continue
    }

    if (current) {
      current.end = index
      units.push(current)
    }

    current = {
      start: index,
      payload: index + startCodeLength,
      end: data.length,
      type: data[index + startCodeLength] & 0x1f,
    }
    index += startCodeLength - 1
  }

  if (current) {
    units.push(current)
  }

  return units
}

const codecFromSps = (data, sps) => {
  if (!sps || sps.payload + 3 >= data.length) {
    return null
  }

  return `avc1.${[1, 2, 3]
    .map(offset => data[sps.payload + offset].toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

const socketUrl = () => (
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/video`
)

const profileFps = (profile, customSettings) => {
  if (profile === 'low' || profile === 'wide') return 60
  if (profile === 'full') return 15
  if (profile === 'custom') return customSettings?.fps || 30
  return 30
}

export default class LowLatencyVideoPlayer {
  constructor({
    container,
    profile,
    mode = 2,
    customSettings,
    decoderPreference = 'webcodecs',
    onStats,
  }) {
    this.container = container
    this.profile = profile
    this.mode = mode
    this.customSettings = customSettings
    this.targetFps = profileFps(profile, customSettings)
    this.decoderPreference = decoderPreference
    this.onStats = onStats
    this.stats = { ...DEFAULT_STATS }
    this.decoder = null
    this.decoderConfig = null
    this.webSocket = null
    this.broadway = null
    this.canvas = null
    this.context = null
    this.awaitingKeyframe = true
    this.renderedInWindow = 0
    this.statsTimer = null
    this.destroyed = false
  }

  start() {
    this.destroyed = false
    this.container.innerHTML = ''
    this.statsTimer = window.setInterval(() => {
      const renderedFps = this.renderedInWindow
      this.stats.fps = renderedFps
      this.renderedInWindow = 0
      this.emitStats()
    }, 1000)

    if (this.decoderPreference === 'broadway') {
      this.startBroadway()
      return
    }

    if (!('VideoDecoder' in window) || !('EncodedVideoChunk' in window)) {
      this.updateStats({
        decoder: 'WebCodecs',
        status: 'unsupported: WebCodecs unavailable',
      })
      return
    }

    this.startWebCodecs()
  }

  emitStats() {
    if (this.onStats) {
      this.onStats({ ...this.stats })
    }
  }

  updateStats(patch) {
    Object.assign(this.stats, patch)
    this.emitStats()
  }

  sendOptions(socket = this.webSocket) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send(JSON.stringify({
      action: {
        mode: this.mode,
        profile: this.profile,
        custom: this.profile === 'custom' ? this.customSettings : undefined,
      },
    }))
  }

  setMode(mode) {
    this.mode = mode
    if (this.broadway) {
      this.sendBroadwayOptions()
      return
    }
    this.sendOptions()
  }

  sendBroadwayOptions() {
    if (
      !this.broadway
      || !this.broadway.ws
      || this.broadway.ws.readyState !== WebSocket.OPEN
    ) {
      return
    }

    this.broadway.ws.send(JSON.stringify({
      action: {
        mode: this.mode,
        profile: this.profile,
        custom: this.profile === 'custom' ? this.customSettings : undefined,
      },
    }))
  }

  startWebCodecs() {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'VideoCanvas'
    this.context = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    })
    this.container.appendChild(this.canvas)

    this.decoder = new VideoDecoder({
      output: frame => this.renderFrame(frame),
      error: error => this.handleWebCodecsError(`WebCodecs error: ${error.message}`),
    })

    this.webSocket = new WebSocket(socketUrl())
    this.webSocket.binaryType = 'arraybuffer'
    this.webSocket.addEventListener('open', () => {
      this.updateStats({
        decoder: 'WebCodecs',
        status: 'connected',
      })
      this.sendOptions()
    })
    this.webSocket.addEventListener('message', event => {
      this.decodeAccessUnit(toUint8Array(event.data))
    })
    this.webSocket.addEventListener('close', () => {
      if (!this.destroyed) {
        this.updateStats({ status: 'disconnected' })
      }
    })
    this.webSocket.addEventListener('error', () => {
      this.handleWebCodecsError('WebSocket error')
    })
  }

  handleWebCodecsError(reason) {
    if (this.destroyed) {
      return
    }
    this.updateStats({
      decoder: 'WebCodecs',
      status: `error: ${reason}`,
    })
  }

  async configureDecoder(codec) {
    if (
      this.destroyed
      || (this.decoderConfig && this.decoderConfig.codec === codec)
    ) {
      return Boolean(this.decoderConfig)
    }

    const config = {
      codec,
      hardwareAcceleration: 'prefer-hardware',
      optimizeForLatency: true,
    }

    try {
      const support = await VideoDecoder.isConfigSupported(config)
      if (!support.supported || this.destroyed) {
        throw new Error(`${codec} is not supported`)
      }

      this.decoder.configure(support.config)
      this.decoderConfig = support.config
      this.awaitingKeyframe = true
      return true
    } catch (error) {
      this.updateStats({
        decoder: 'WebCodecs',
        status: `unsupported: ${error.message}`,
      })
      return false
    }
  }

  resetDecodeQueue() {
    if (!this.decoderConfig || !this.decoder || this.decoder.state === 'closed') {
      return
    }

    this.decoder.reset()
    this.decoder.configure(this.decoderConfig)
    this.awaitingKeyframe = true
    this.stats.dropped += 1
  }

  async decodeAccessUnit(data) {
    if (
      this.destroyed
      || !this.decoder
      || this.decoder.state === 'closed'
    ) {
      return
    }

    const units = findNalUnits(data)
    const sps = units.find(unit => unit.type === 7)
    const keyframe = units.some(unit => unit.type === 5)
    const delta = units.some(unit => unit.type === 1)

    if (sps && !this.decoderConfig) {
      const codec = codecFromSps(data, sps)
      if (!codec || !(await this.configureDecoder(codec))) {
        return
      }
    }

    if (!this.decoderConfig || (!keyframe && !delta)) {
      return
    }

    this.stats.queue = this.decoder.decodeQueueSize
    if (this.decoder.decodeQueueSize > 2) {
      this.resetDecodeQueue()
    }

    if (this.awaitingKeyframe && !keyframe) {
      this.stats.dropped += 1
      return
    }

    if (keyframe) {
      this.awaitingKeyframe = false
    }

    try {
      this.decoder.decode(new EncodedVideoChunk({
        type: keyframe ? 'key' : 'delta',
        timestamp: Math.round(performance.now() * 1000),
        duration: Math.round(1000000 / this.targetFps),
        data,
      }))
      this.stats.queue = this.decoder.decodeQueueSize
    } catch (error) {
      this.handleWebCodecsError(`Decode failed: ${error.message}`)
    }
  }

  renderFrame(frame) {
    try {
      const width = frame.displayWidth || frame.codedWidth
      const height = frame.displayHeight || frame.codedHeight
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width
        this.canvas.height = height
      }
      this.context.drawImage(frame, 0, 0, width, height)
      this.renderedInWindow += 1
      this.stats.queue = this.decoder ? this.decoder.decodeQueueSize : 0
    } finally {
      frame.close()
    }
  }

  startBroadway(reason = '') {
    if (this.destroyed) {
      return
    }
    this.closeWebCodecs()
    this.container.innerHTML = ''

    this.broadway = new WSAvcPlayer({
      useWorker: true,
      workerFile: '/car/Decoder.js',
    })
    window.wsavc = this.broadway
    this.container.appendChild(this.broadway.AvcPlayer.canvas)
    this.broadway.connect(socketUrl())
    this.broadway.ws.binaryType = 'arraybuffer'
    this.broadway.ws.addEventListener('open', () => {
      this.sendBroadwayOptions()
      this.updateStats({
        decoder: 'Broadway Worker',
        queue: 0,
        status: reason || 'connected',
      })
    })
    this.broadway.ws.addEventListener('message', event => {
      const data = toUint8Array(event.data)
      const units = findNalUnits(data)
      if (units.some(unit => unit.type === 1 || unit.type === 5)) {
        this.renderedInWindow += 1
      }
    })
    this.broadway.ws.addEventListener('error', () => {
      this.updateStats({ status: 'error' })
    })
  }

  closeWebCodecs() {
    if (this.webSocket) {
      this.webSocket.onclose = null
      this.webSocket.onerror = null
      this.webSocket.close()
      this.webSocket = null
    }

    if (this.decoder && this.decoder.state !== 'closed') {
      this.decoder.close()
    }
    this.decoder = null
    this.decoderConfig = null
  }

  destroy() {
    this.destroyed = true
    if (this.statsTimer) {
      window.clearInterval(this.statsTimer)
      this.statsTimer = null
    }
    this.closeWebCodecs()

    if (this.broadway) {
      if (this.broadway.ws) {
        this.broadway.ws.close()
      }
      if (this.broadway.AvcPlayer && this.broadway.AvcPlayer.worker) {
        this.broadway.AvcPlayer.worker.terminate()
      }
      this.broadway = null
    }

    if (window.wsavc) {
      delete window.wsavc
    }
    this.container.innerHTML = ''
  }
}
