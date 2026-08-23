import { useEffect, useRef, useState } from "react"
import "../css/ZoomableImagePreview.css"

const MIN_ZOOM = 1
const MAX_ZOOM = 4

function clampZoom(value) {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))))
}

export default function ZoomableImagePreview({
	src,
	alt = "Preview",
	className = "",
	stageClassName = "",
	imageClassName = "",
	hint = "Scroll or use the touchpad over the image to zoom. Drag while zoomed to move around.",
}) {
	const [zoom, setZoom] = useState(1)
	const [pan, setPan] = useState({ x: 0, y: 0 })
	const [isDragging, setIsDragging] = useState(false)
	const stageRef = useRef(null)
	const dragRef = useRef(null)
	const zoomDisplay = Math.round((zoom - 1) * 100)

	const resetZoom = () => {
		setZoom(1)
		setPan({ x: 0, y: 0 })
		setIsDragging(false)
		dragRef.current = null
	}

	const updateZoom = (amount) => {
		const next = clampZoom(zoom + amount)
		setZoom(next)
		if (next <= 1) setPan({ x: 0, y: 0 })
	}

	useEffect(() => {
		const stage = stageRef.current
		if (!stage) return undefined

		const handleNativeWheel = (event) => {
			event.preventDefault()
			event.stopPropagation()
			setZoom((currentZoom) => {
				const next = clampZoom(currentZoom + (event.deltaY < 0 ? 0.12 : -0.12))
				if (next <= 1) setPan({ x: 0, y: 0 })
				return next
			})
		}

		stage.addEventListener("wheel", handleNativeWheel, { passive: false })
		return () => stage.removeEventListener("wheel", handleNativeWheel)
	}, [])

	const handlePointerDown = (event) => {
		if (!src || zoom <= 1) return
		event.preventDefault()
		event.currentTarget.setPointerCapture?.(event.pointerId)
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: pan.x,
			originY: pan.y,
		}
		setIsDragging(true)
	}

	const handlePointerMove = (event) => {
		const drag = dragRef.current
		if (!drag || drag.pointerId !== event.pointerId) return
		event.preventDefault()
		setPan({
			x: drag.originX + event.clientX - drag.startX,
			y: drag.originY + event.clientY - drag.startY,
		})
	}

	const stopDragging = (event) => {
		if (dragRef.current?.pointerId === event.pointerId) {
			event.currentTarget.releasePointerCapture?.(event.pointerId)
		}
		dragRef.current = null
		setIsDragging(false)
	}

	return (
		<div className={`zoomable-preview ${className}`.trim()}>
			<div className="zoomable-preview__toolbar" aria-label="Image zoom controls">
				<button type="button" onClick={() => updateZoom(-0.2)} disabled={zoom <= MIN_ZOOM}>
					-
				</button>
				<span>{zoomDisplay}%</span>
				<button type="button" onClick={() => updateZoom(0.2)} disabled={zoom >= MAX_ZOOM}>
					+
				</button>
				<button type="button" onClick={resetZoom}>Reset</button>
			</div>
			<div
				ref={stageRef}
				className={`zoomable-preview__stage ${stageClassName} ${isDragging ? "is-dragging" : ""}`.trim()}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={stopDragging}
				onPointerCancel={stopDragging}
				onDoubleClick={resetZoom}
				role="presentation"
				style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in" }}
			>
				<img
					src={src}
					alt={alt}
					className={`zoomable-preview__image ${imageClassName}`.trim()}
					draggable={false}
					onLoad={resetZoom}
					style={{
						transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
					}}
				/>
			</div>
			{hint ? <p className="zoomable-preview__hint">{hint}</p> : null}
		</div>
	)
}
