import { useRef, useState } from 'react'

interface XYProps {
    xLabel: string
    yLabel: string
    onChange: (points: Map<number, PointerPoint>) => void
}

interface PointerPoint {
    id: number
    x: number
    y: number
    pressure: number
}

function XYController({
    xLabel,
    yLabel,
    onChange
}: XYProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const activePointers = useRef<Map<number, PointerPoint>>(new Map())

    const getCanvasPos = (e: React.PointerEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect()
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        }
    }

    const getNormalizedX = (x: number) => {
        return x / canvasRef.current!.width
    }

    const getNormalizedY = (y: number) => {
        return 1 - (y / canvasRef.current!.height)
    }

    const handlePointerDown = (e: React.PointerEvent) => {
        const { x, y } = getCanvasPos(e)

        const normalizedX = getNormalizedX(x)
        const normalizedY = getNormalizedY(y)
        const pointerPoint: PointerPoint = {
            id: e.pointerId,
            x: normalizedX,
            y: normalizedY,
            pressure: e.pressure
        }
        activePointers.current.set(e.pointerId, pointerPoint)
        onChange(activePointers.current)
    }

    const handlePointerUp = (e: React.PointerEvent) => {
        const p = activePointers.current.get(e.pointerId)
        if (p) {
            activePointers.current.delete(e.pointerId)
            onChange(activePointers.current)
        }
    }

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!activePointers.current.has(e.pointerId)) return
        const { x, y } = getCanvasPos(e)

        const normalizedX = getNormalizedX(x)
        const normalizedY = getNormalizedY(y)

        const pointerPoint = activePointers.current.get(e.pointerId)
        if (pointerPoint) {
            pointerPoint.x = normalizedX
            pointerPoint.y = normalizedY
            onChange(activePointers.current)
        }
    }

    return (
        <div>
            <h3>XY Pad</h3>
            <canvas
                ref={canvasRef}
                width={600}
                height={300}
                style= {{ touchAction: 'none', cursor: 'crosshair', borderRadius: 8 }}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerUp}
            />
        </div>
    )
}

export default XYController