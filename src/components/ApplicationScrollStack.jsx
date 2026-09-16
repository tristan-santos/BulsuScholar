import {
	Children,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { motion as Motion, useReducedMotion } from "motion/react"
import { HiChevronLeft, HiChevronRight } from "react-icons/hi"
import "../css/ApplicationScrollStack.css"

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label, [role='button'], [contenteditable='true']"
const WHEEL_THRESHOLD = 56
const WHEEL_COOLDOWN_MS = 420
const SWIPE_THRESHOLD = 52

function getItemKey(item, index) {
	return String(item.key ?? `application-${index}`)
}

export default function ApplicationScrollStack({
	children,
	disabled = false,
	ariaLabel = "Current scholarship applications",
}) {
	const items = useMemo(() => Children.toArray(children), [children])
	const itemKeys = useMemo(() => items.map(getItemKey), [items])
	const itemSignature = itemKeys.join("|")
	const [selection, setSelection] = useState(() => ({ key: itemKeys[0] || "", index: 0 }))
	const [activeHeight, setActiveHeight] = useState(320)
	const stageRef = useRef(null)
	const activeContentRef = useRef(null)
	const activeLayerRef = useRef(null)
	const wheelAmountRef = useRef(0)
	const wheelResetRef = useRef(null)
	const lastWheelNavigationRef = useRef(0)
	const touchStartRef = useRef(null)
	const reduceMotion = useReducedMotion()

	const selectedKeyIndex = itemKeys.indexOf(selection.key)
	const activeIndex = selectedKeyIndex >= 0
		? selectedKeyIndex
		: Math.min(selection.index, Math.max(0, itemKeys.length - 1))
	const activeKey = itemKeys[activeIndex] || ""

	useEffect(() => {
		const node = activeContentRef.current
		if (!node) return undefined

		const updateHeight = () => {
			const nextHeight = Math.ceil(node.getBoundingClientRect().height)
			if (nextHeight > 0) setActiveHeight(nextHeight)
		}

		updateHeight()
		if (typeof ResizeObserver === "undefined") return undefined
		const observer = new ResizeObserver(updateHeight)
		observer.observe(node)
		return () => observer.disconnect()
	}, [activeKey, itemSignature])

	useEffect(() => () => {
		if (wheelResetRef.current) window.clearTimeout(wheelResetRef.current)
	}, [])

	const selectIndex = useCallback((nextIndex) => {
		if (items.length === 0) return
		const boundedIndex = Math.max(0, Math.min(nextIndex, items.length - 1))
		setSelection({ key: itemKeys[boundedIndex], index: boundedIndex })
	}, [itemKeys, items.length])

	const showPrevious = useCallback(() => selectIndex(activeIndex - 1), [activeIndex, selectIndex])
	const showNext = useCallback(() => selectIndex(activeIndex + 1), [activeIndex, selectIndex])

	const handleWheel = useCallback((event) => {
		if (event.target.closest?.(INTERACTIVE_SELECTOR)) return
		const direction = Math.sign(event.deltaY)
		if (!direction) return

		const scroller = activeLayerRef.current
		if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
			const canScrollDown = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1
			const canScrollUp = scroller.scrollTop > 1
			if ((direction > 0 && canScrollDown) || (direction < 0 && canScrollUp)) return
		}

		if ((direction < 0 && activeIndex === 0) || (direction > 0 && activeIndex === items.length - 1)) {
			wheelAmountRef.current = 0
			return
		}

		event.preventDefault()
		wheelAmountRef.current += event.deltaY
		if (wheelResetRef.current) window.clearTimeout(wheelResetRef.current)
		wheelResetRef.current = window.setTimeout(() => {
			wheelAmountRef.current = 0
		}, 180)

		const now = Date.now()
		if (Math.abs(wheelAmountRef.current) < WHEEL_THRESHOLD || now - lastWheelNavigationRef.current < WHEEL_COOLDOWN_MS) return
		lastWheelNavigationRef.current = now
		wheelAmountRef.current = 0
		if (direction > 0) showNext()
		else showPrevious()
	}, [activeIndex, items.length, showNext, showPrevious])

	useEffect(() => {
		const stage = stageRef.current
		if (!stage) return undefined
		stage.addEventListener("wheel", handleWheel, { passive: false })
		return () => stage.removeEventListener("wheel", handleWheel)
	}, [handleWheel, itemSignature])

	const handleKeyDown = (event) => {
		if (event.target !== event.currentTarget) return
		if (["ArrowRight", "ArrowDown"].includes(event.key) && activeIndex < items.length - 1) {
			event.preventDefault()
			showNext()
		} else if (["ArrowLeft", "ArrowUp"].includes(event.key) && activeIndex > 0) {
			event.preventDefault()
			showPrevious()
		} else if (event.key === "Home") {
			event.preventDefault()
			selectIndex(0)
		} else if (event.key === "End") {
			event.preventDefault()
			selectIndex(items.length - 1)
		}
	}

	const handleTouchStart = (event) => {
		if (event.target.closest?.(INTERACTIVE_SELECTOR)) {
			touchStartRef.current = null
			return
		}
		const touch = event.touches[0]
		touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
	}

	const handleTouchEnd = (event) => {
		const start = touchStartRef.current
		touchStartRef.current = null
		const touch = event.changedTouches[0]
		if (!start || !touch) return
		const deltaX = touch.clientX - start.x
		const deltaY = touch.clientY - start.y
		if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) return
		if (deltaX < 0 && activeIndex < items.length - 1) showNext()
		if (deltaX > 0 && activeIndex > 0) showPrevious()
	}

	if (items.length === 0) return null
	if (disabled || items.length === 1) {
		return <div className="student-scholarship-cards">{items}</div>
	}

	return (
		<section
			className="application-scroll-stack"
			role="region"
			aria-roledescription="carousel"
			aria-label={ariaLabel}
			tabIndex={0}
			onKeyDown={handleKeyDown}
		>
			<div
				ref={stageRef}
				className="application-scroll-stack-stage"
				style={{ "--application-stack-card-height": `${activeHeight}px` }}
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
			>
				{items.map((item, index) => {
					const isActive = index === activeIndex
					const forwardCards = items.length - activeIndex - 1
					const depth = isActive
						? 0
						: index > activeIndex
							? index - activeIndex
							: forwardCards + activeIndex - index
					const isVisible = depth < 3
					return (
						<Motion.div
							key={itemKeys[index]}
							ref={isActive ? activeLayerRef : undefined}
							className={`application-scroll-stack-layer${isActive ? " application-scroll-stack-layer--active" : ""}`}
							aria-hidden={!isActive}
							inert={isActive ? undefined : true}
							initial={false}
							animate={{
								y: depth * 14,
								scale: 1 - Math.min(depth, 2) * 0.018,
								opacity: isVisible ? 1 - depth * 0.16 : 0,
							}}
							transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
							style={{ zIndex: items.length - depth, visibility: isVisible ? "visible" : "hidden" }}
						>
							<div ref={isActive ? activeContentRef : undefined} className="application-scroll-stack-card">
								{item}
							</div>
						</Motion.div>
					)
				})}
			</div>

			<div className="application-scroll-stack-navigation">
				<button
					type="button"
					className="application-scroll-stack-nav-btn"
					data-button-variant="neutral"
					onClick={showPrevious}
					disabled={activeIndex === 0}
				>
					<HiChevronLeft aria-hidden /> Previous
				</button>
				<div className="application-scroll-stack-position" aria-live="polite" aria-atomic="true">
					<strong>Application {activeIndex + 1} of {items.length}</strong>
					<div className="application-scroll-stack-dots" aria-label="Choose an application">
						{items.map((item, index) => (
							<button
								key={itemKeys[index]}
								type="button"
								className={index === activeIndex ? "is-active" : ""}
								data-button-variant="none"
								aria-label={`Show application ${index + 1} of ${items.length}`}
								aria-current={index === activeIndex ? "true" : undefined}
								onClick={() => selectIndex(index)}
							/>
						))}
					</div>
				</div>
				<button
					type="button"
					className="application-scroll-stack-nav-btn"
					data-button-variant="neutral"
					onClick={showNext}
					disabled={activeIndex === items.length - 1}
				>
					Next <HiChevronRight aria-hidden />
				</button>
			</div>
		</section>
	)
}
