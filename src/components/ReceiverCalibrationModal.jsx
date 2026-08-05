import { useEffect, useState } from 'react'
import { getReceiverCalibrationError } from '../gamepadControl'

const CHANNEL_COPY = {
  steering: {
    eyebrow: 'CH1 / STEERING INPUT',
    title: '方向遥控器校准',
    points: [
      {
        key: 'negativePulse',
        label: '左行程',
        action: '设置左行程',
        hint: '方向盘向左打满',
      },
      {
        key: 'centerPulse',
        label: '中位',
        action: '设置中位',
        hint: '松开方向盘',
      },
      {
        key: 'positivePulse',
        label: '右行程',
        action: '设置右行程',
        hint: '方向盘向右打满',
      },
    ],
  },
  throttle: {
    eyebrow: 'CH2 / THROTTLE INPUT',
    title: '油门遥控器校准',
    points: [
      {
        key: 'negativePulse',
        label: '前进行程',
        action: '设置前进行程',
        hint: '油门扣到最大前进',
      },
      {
        key: 'centerPulse',
        label: '中位',
        action: '设置中位',
        hint: '松开油门扣',
      },
      {
        key: 'positivePulse',
        label: '后退行程',
        action: '设置后退行程',
        hint: '油门推到最大后退',
      },
    ],
  },
}

function ReceiverCalibrationModal({
  channel,
  pulse,
  value,
  onApply,
  onClose,
}) {
  const [draft, setDraft] = useState(value)
  const copy = channel ? CHANNEL_COPY[channel] : null
  const calibrationError = getReceiverCalibrationError(draft)
  const signalAvailable = Number.isFinite(pulse)
  const statusMessage = signalAvailable
    ? calibrationError
    : '遥控器信号已中断，请重新连接后继续'

  useEffect(() => {
    if (!channel) return
    setDraft({ ...value })
  }, [channel, value])

  useEffect(() => {
    if (!channel) return undefined

    const onKeyDown = event => {
      if (event.key === 'Escape') onClose()
    }
    document.body.classList.add('VideoSettingsOpen')
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.classList.remove('VideoSettingsOpen')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [channel, onClose])

  if (!channel || !copy) return null

  const capturePoint = key => {
    if (!signalAvailable) return
    setDraft(current => ({
      ...current,
      [key]: Math.round(pulse),
    }))
  }

  return (
    <div
      className="VideoSettingsBackdrop ReceiverCalibrationBackdrop"
      onMouseDown={onClose}
    >
      <section
        className="VideoSettingsDialog ReceiverCalibrationDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receiver-calibration-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="ReceiverCalibrationHeader">
          <div>
            <span>{copy.eyebrow}</span>
            <h2 id="receiver-calibration-title">{copy.title}</h2>
            <p>只校准遥控器输入比例，不修改车辆实际输出信号</p>
          </div>
          <button
            className="VideoSettingsClose"
            type="button"
            aria-label="关闭遥控器校准"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="ReceiverCalibrationContent">
          <div
            className={[
              'ReceiverCalibrationLive',
              signalAvailable ? 'online' : 'offline',
            ].join(' ')}
            aria-live="polite"
          >
            <div>
              <span><i aria-hidden="true" /> 当前输入</span>
              <small>保持遥控器位置，再点击下方对应按钮</small>
            </div>
            <output>
              {signalAvailable ? pulse : '--'}
              <small>μs</small>
            </output>
          </div>

          <div className="ReceiverCalibrationPoints">
            {copy.points.map((point, index) => (
              <article key={point.key} className="ReceiverCalibrationPoint">
                <span className="ReceiverCalibrationIndex">
                  0{index + 1}
                </span>
                <div>
                  <strong>{point.label}</strong>
                  <small>{point.hint}</small>
                </div>
                <output>{draft?.[point.key] ?? '--'} μs</output>
                <button
                  type="button"
                  disabled={!signalAvailable}
                  onClick={() => capturePoint(point.key)}
                >
                  {point.action}
                </button>
              </article>
            ))}
          </div>

          <p
            className={[
              'ReceiverCalibrationValidation',
              statusMessage ? 'error' : 'ready',
            ].join(' ')}
            role="status"
          >
            {statusMessage
              ? statusMessage
              : '三点有效 · 完成后将按左/中/右分段换算'}
          </p>
        </div>

        <footer className="ReceiverCalibrationFooter">
          <p>校准期间车辆已回中，关闭后需将遥控器回中才会重新接管。</p>
          <div>
            <button
              className="SettingsCancel"
              type="button"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="SettingsApply"
              type="button"
              disabled={Boolean(statusMessage)}
              onClick={() => onApply(draft)}
            >
              完成并保存
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

export default ReceiverCalibrationModal
