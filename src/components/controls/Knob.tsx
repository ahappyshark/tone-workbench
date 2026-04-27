import { useRef, useCallback } from 'react'

interface KnobProps {
    label: string
    min: number
    max: number
    value: number
    onChange: (value: number) => void
    size?: number
    color?: string
}

const MIN_ANGLE = -135
const MAX_ANGLE = 135

function valueToAngle(value: number, min: number, max: number): number {
    const ratio = (value - min) / (max - min)
    return MIN_ANGLE + ratio * (MAX_ANGLE - MIN_ANGLE)
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return {
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad)
    }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(cx, cy, r, endAngle)
    const end = polarToCartesian(cx, cy, r, startAngle)
    const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function Knob({
    label,
    min,
    max,
    value,
    onChange,
    size = 60,
    color = '#00ff88'
}: KnobProps) {
    const dragRef = useRef<{ startY: number, startValue: number } | null>(null)
    const cx = size /2
    const cy = size /2
    const r = size * 0.38
    const angle = valueToAngle(value, min, max)
    const trackPath = describeArc(cx, cy, r, MIN_ANGLE, MAX_ANGLE)
    const valuePath = describeArc(cx, cy, r, MIN_ANGLE, angle)
    const indicator = polarToCartesian(cx, cy, r * 0.6, angle)

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { startY: e.clientY, startValue: value }
    }, [value])

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragRef.current) return
        const dy = dragRef.current.startY - e.clientY
        const range = max - min
        const delta = (dy / 150) * range
        const next = Math.min(max, Math.max(min, dragRef.current.startValue + delta))
        onChange(next)
    }, [min, max, onChange])

    const onPointerUp = useCallback(() => {
        dragRef.current = null
    }, [])

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            userSelect: 'none'
        }}>
            <svg
                width={size}
                height={size}
                style={{ cursor: 'ns-resize', overflow: 'visible' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
            >
                <path
                    d={trackPath}
                    stroke="#333"
                    strokeWidth={size * 0.08}
                    strokeLinecap='round'
                />
                <path
                    d={valuePath}
                    fill='none'
                    stroke={color}
                    strokeWidth={size * 0.08}
                    strokeLinecap='round'
                />
                <circle
                    cx={cx}
                    cy={cy}
                    r={size * 0.12}
                    fill='#222'
                    stroke='#555'
                    strokeWidth={1}
                />
                <line
                    x1={cx}
                    y1={cy}
                    x2={indicator.x}
                    y2={indicator.y}
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap='round'
                />
            </svg>
            <span style={{fontSize: 10, opacity: 0.7, textAlign: 'center'}}>{label}</span>
            <span style={{ fontSize: 10, color, fontFamily: 'monospace' }}>{value.toFixed(2)}</span>
        </div>
    )
}

export default Knob