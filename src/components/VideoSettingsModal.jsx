import { useEffect } from 'react'

const WIDTH_OPTIONS = [320, 480, 640]
const ASPECT_OPTIONS = [
  { value: '4:3', label: '4:3', crop: '完整高度' },
  { value: '16:9', label: '16:9', crop: '上下各裁 12.5%' },
  { value: '20:9', label: '20:9', crop: '上下各裁 20%' },
]

const PROFILE_OPTIONS = [
  { value: 'low', label: '低延迟', detail: '60fps' },
  { value: 'wide', label: '宽屏', detail: '60fps' },
  { value: 'clear', label: '清晰', detail: '30fps' },
  { value: 'full', label: '完整视野', detail: '15fps' },
]

const DECODER_OPTIONS = [
  { value: 'webcodecs', label: 'WebCodecs', detail: '原生解码' },
  { value: 'broadway', label: 'Broadway', detail: '兼容解码' },
]

const aspectRatio = {
  '4:3': 3 / 4,
  '16:9': 9 / 16,
  '20:9': 9 / 20,
}

const RangeControl = ({
  label,
  hint,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
  disabled = false,
}) => (
  <label className={`TuningControl ${disabled ? 'disabled' : ''}`}>
    <span className="TuningControlHeader">
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <output>{displayValue ?? value}</output>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={event => onChange(Number(event.target.value))}
    />
  </label>
)

function VideoSettingsModal({
  open,
  value,
  activeProfile,
  activeColor,
  customFps,
  onChange,
  onApply,
  onClose,
  onReset,
  onSelectProfile,
  onSelectColor,
  activeDecoder,
  onSelectDecoder,
  steeringReversed,
  motorReversed,
  onToggleSteeringDirection,
  onToggleMotorDirection,
}) {
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = event => {
      if (event.key === 'Escape') onClose()
    }
    document.body.classList.add('VideoSettingsOpen')
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.classList.remove('VideoSettingsOpen')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const update = (key, nextValue) => onChange({
    ...value,
    [key]: nextValue,
  })
  const widthIndex = WIDTH_OPTIONS.indexOf(value.width)
  const height = Math.round(value.width * aspectRatio[value.aspect])
  const currentAspect = ASPECT_OPTIONS.find(item => item.value === value.aspect)

  return (
    <div className="VideoSettingsBackdrop" onMouseDown={onClose}>
      <section
        className="VideoSettingsDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="VideoSettingsHeader">
          <div>
            <h2 id="settings-title">设置</h2>
            <p>调整图传参数和底盘方向</p>
          </div>
          <button
            className="VideoSettingsClose"
            type="button"
            aria-label="关闭设置"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="VideoSettingsContent">
          <div className="VideoSettingsSummary">
            <strong>{value.width} × {height} · {value.fps}fps</strong>
            <span>{value.bitrateKbps}kbps · {currentAspect.crop}</span>
          </div>

          <div className="VideoQuickSettings">
            <div className="VideoQuickGroup">
              <span className="VideoQuickLabel">快捷模式</span>
              <div className="VideoQuickOptions">
                {PROFILE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={activeProfile === option.value ? 'active' : ''}
                    onClick={() => onSelectProfile(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </button>
                ))}
                {activeProfile === 'custom' && (
                  <button type="button" className="active">
                    <strong>自定义</strong>
                    <small>{customFps}fps</small>
                  </button>
                )}
              </div>
            </div>
            <div className="VideoQuickGroup VideoQuickColor">
              <span className="VideoQuickLabel">色彩</span>
              <div className="VideoQuickOptions">
                <button
                  type="button"
                  className={activeColor === 'color' ? 'active' : ''}
                  onClick={() => onSelectColor('color')}
                >
                  彩色
                </button>
                <button
                  type="button"
                  className={activeColor === 'bw' ? 'active' : ''}
                  onClick={() => onSelectColor('bw')}
                >
                  黑白
                </button>
              </div>
            </div>
            <div className="VideoQuickGroup">
              <span className="VideoQuickLabel">解码器</span>
              <div className="VideoQuickOptions">
                {DECODER_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={activeDecoder === option.value ? 'active' : ''}
                    onClick={() => onSelectDecoder(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="VideoSettingsBody">
            <section className="TuningSection">
              <h3 className="TuningSectionTitle">画质与流畅度</h3>

              <RangeControl
                label="分辨率"
                hint="越高越清晰，延迟和流量也更高"
                value={Math.max(0, widthIndex)}
                displayValue={`${value.width}px`}
                min={0}
                max={WIDTH_OPTIONS.length - 1}
                step={1}
                onChange={index => update('width', WIDTH_OPTIONS[index])}
              />
              <RangeControl
                label="帧率"
                hint="越高越流畅"
                value={value.fps}
                displayValue={`${value.fps} fps`}
                min={15}
                max={60}
                step={5}
                onChange={nextValue => update('fps', nextValue)}
              />
              <RangeControl
                label="码率"
                hint="越高压缩细节越好"
                value={value.bitrateKbps}
                displayValue={`${value.bitrateKbps} kbps`}
                min={250}
                max={2000}
                step={50}
                onChange={nextValue => update('bitrateKbps', nextValue)}
              />
            </section>

            <section className="TuningSection">
              <h3 className="TuningSectionTitle">画面比例</h3>

              <div className="AspectOptions" role="group" aria-label="画面长宽比">
                {ASPECT_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={value.aspect === option.value ? 'active' : ''}
                    onClick={() => update('aspect', option.value)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.crop}</small>
                  </button>
                ))}
              </div>

              <h3 className="TuningSectionTitle TuningSectionSubTitle">画面效果</h3>

              <button
                className="MonochromeSwitch"
                type="button"
                role="switch"
                aria-checked={value.blackWhite}
                onClick={() => update('blackWhite', !value.blackWhite)}
              >
                <span>
                  <strong>黑白画面</strong>
                  <small>暗光下轮廓通常更清楚</small>
                </span>
                <i aria-hidden="true"><b /></i>
              </button>
              <RangeControl
                label="对比度"
                hint="增强明暗边界"
                value={value.contrast}
                min={-100}
                max={100}
                step={5}
                onChange={nextValue => update('contrast', nextValue)}
              />
              <RangeControl
                label="亮度"
                hint="过高可能导致过曝"
                value={value.brightness}
                min={0}
                max={100}
                step={5}
                onChange={nextValue => update('brightness', nextValue)}
              />
              <RangeControl
                label="饱和度"
                hint={value.blackWhite ? '黑白模式下不生效' : '调整颜色浓度'}
                value={value.saturation}
                min={-100}
                max={100}
                step={5}
                disabled={value.blackWhite}
                onChange={nextValue => update('saturation', nextValue)}
              />
            </section>

            <section className="TuningSection">
              <h3 className="TuningSectionTitle">底盘方向</h3>

              <button
                className="MonochromeSwitch"
                type="button"
                role="switch"
                aria-checked={steeringReversed}
                onClick={onToggleSteeringDirection}
              >
                <span>
                  <strong>舵机方向</strong>
                  <small>{steeringReversed ? '当前为反向' : '当前为正向'}</small>
                </span>
                <i aria-hidden="true"><b /></i>
              </button>

              <button
                className="MonochromeSwitch"
                type="button"
                role="switch"
                aria-checked={motorReversed}
                onClick={onToggleMotorDirection}
              >
                <span>
                  <strong>电机方向</strong>
                  <small>{motorReversed ? '当前为反向' : '当前为正向'}</small>
                </span>
                <i aria-hidden="true"><b /></i>
              </button>
            </section>
          </div>
        </div>

        <footer className="VideoSettingsFooter">
          <button type="button" className="SettingsReset" onClick={onReset}>
            恢复推荐
          </button>
          <div>
            <button type="button" className="SettingsCancel" onClick={onClose}>
              取消
            </button>
            <button type="button" className="SettingsApply" onClick={onApply}>
              应用配置
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

export default VideoSettingsModal
