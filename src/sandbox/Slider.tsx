import { useRef, useCallback } from 'react'

interface SliderProps {
  label: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  defaultValue?: number
  orientation?: 'vertical' | 'horizontal'
  length?: number
  color?: string
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
  defaultValue,
  orientation = 'vertical',
  length = 120,
  color = '#00ff88'
}: SliderProps) {
  const dragRef = useRef<{ startPos: number, startValue: number } | null>(null)

  const normalized = (value - min) / (max - min)
  const trackThickness = 6
  const thumbSize = 14
  const isVertical = orientation === 'vertical'

  const trackLength = length
  const thumbPos = isVertical
    ? trackLength - normalized * trackLength
    : normalized * trackLength

  const containerStyle: React.CSSProperties = isVertical
    ? { width: thumbSize + 8, height: trackLength, position: 'relative' }
    : { width: trackLength, height: thumbSize + 8, position: 'relative' }

  const trackStyle: React.CSSProperties = isVertical
    ? {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        top: 0,
        width: trackThickness,
        height: trackLength,
        background: '#333',
        borderRadius: trackThickness
      }
    : {
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        left: 0,
        height: trackThickness,
        width: trackLength,
        background: '#333',
        borderRadius: trackThickness
      }

  const fillStyle: React.CSSProperties = isVertical
    ? {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 0,
        width: trackThickness,
        height: normalized * trackLength,
        background: color,
        borderRadius: trackThickness
      }
    : {
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        left: 0,
        height: trackThickness,
        width: normalized * trackLength,
        background: color,
        borderRadius: trackThickness
      }

  const thumbStyle: React.CSSProperties = isVertical
    ? {
        position: 'absolute',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        top: thumbPos,
        width: thumbSize,
        height: thumbSize,
        borderRadius: '50%',
        background: '#222',
        border: `2px solid ${color}`,
        cursor: 'ns-resize',
        boxSizing: 'border-box'
      }
    : {
        position: 'absolute',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        left: thumbPos,
        width: thumbSize,
        height: thumbSize,
        borderRadius: '50%',
        background: '#222',
        border: `2px solid ${color}`,
        cursor: 'ew-resize',
        boxSizing: 'border-box'
      }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startPos: isVertical ? e.clientY : e.clientX,
      startValue: value
    }
  }, [value, isVertical])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const pos = isVertical ? e.clientY : e.clientX
    const delta = isVertical
      ? dragRef.current.startPos - pos
      : pos - dragRef.current.startPos
    const range = max - min
    const next = Math.min(max, Math.max(min, dragRef.current.startValue + (delta / trackLength) * range))
    onChange(next)
  }, [min, max, onChange, isVertical, trackLength])

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const onDoubleClick = useCallback(() =>{
        if (defaultValue !== undefined) {
            onChange(defaultValue)
        }
    }, [defaultValue, onChange])

  return (
    <div style={{
      display: 'flex',
      flexDirection: isVertical ? 'column' : 'row',
      alignItems: 'center',
      gap: 6,
      userSelect: 'none'
    }}>
      {isVertical && (
        <span style={{ fontSize: 10, opacity: 0.5, fontFamily: 'monospace' }}>
          {value.toFixed(2)}
        </span>
      )}
      <div
        style={containerStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div style={trackStyle} />
        <div style={fillStyle} />
        <div style={thumbStyle} />
      </div>
      <span style={{ fontSize: 10, opacity: 0.7 }}>{label}</span>
      {!isVertical && (
        <span style={{ fontSize: 10, color, fontFamily: 'monospace' }}>
          {value.toFixed(2)}
        </span>
      )}
    </div>
  )
}

export default Slider
