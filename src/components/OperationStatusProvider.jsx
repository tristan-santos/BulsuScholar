import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { HiCheck, HiX } from "react-icons/hi"
import brandSeal from "../assets/logo.png"
import { getOperationSnapshot, subscribeToOperations } from "../services/operationTracker"

const EXIT_DURATION_MS = 180

function getLoadingStage(operation, now = Date.now()) {
	const loading = Array.isArray(operation?.loading) ? operation.loading : []
	const stageTimes = Array.isArray(operation?.stageTimes) ? operation.stageTimes : [0, 1800, 4500]
	const elapsed = Math.max(0, now - Number(operation?.startedAt || now))
	let index = 0
	stageTimes.forEach((time, candidate) => {
		if (elapsed >= Number(time || 0)) index = candidate
	})
	return Math.min(index, Math.max(0, loading.length - 1))
}

export default function OperationStatusProvider({ children }) {
	const operationState = useSyncExternalStore(subscribeToOperations, getOperationSnapshot, getOperationSnapshot)
	const [visible, setVisible] = useState(false)
	const [exiting, setExiting] = useState(false)
	const [presentedState, setPresentedState] = useState(null)
	const [stageIndex, setStageIndex] = useState(0)

	useEffect(() => {
		const operation = operationState.operation
		if (operationState.phase !== "loading" || !operation) return undefined

		const elapsed = Math.max(0, Date.now() - operation.startedAt)
		const delay = Math.max(0, Number(operation.delayMs || 0) - elapsed)
		const timer = setTimeout(() => {
			setExiting(false)
			setPresentedState(operationState)
			setStageIndex(getLoadingStage(operation))
			setVisible(true)
		}, delay)
		return () => clearTimeout(timer)
	}, [operationState])

	useEffect(() => {
		if (!visible || operationState.phase === "idle") return undefined
		if (operationState.phase === "loading") {
			const operation = operationState.operation
			const elapsed = Math.max(0, Date.now() - Number(operation?.startedAt || Date.now()))
			const foregroundPromotion = presentedState?.operation?.kind === "background" && operation?.kind === "foreground"
			if (!operation || (elapsed < Number(operation.delayMs || 0) && !foregroundPromotion)) return undefined
		}
		const timer = setTimeout(() => {
			setPresentedState(operationState)
			setExiting(false)
		}, 0)
		return () => clearTimeout(timer)
	}, [operationState, presentedState?.operation?.kind, visible])

	useEffect(() => {
		if (operationState.phase !== "idle" || !visible) return undefined
		const exitTimer = setTimeout(() => setExiting(true), 0)
		const hideTimer = setTimeout(() => {
			setVisible(false)
			setExiting(false)
			setPresentedState(null)
		}, EXIT_DURATION_MS)
		return () => {
			clearTimeout(exitTimer)
			clearTimeout(hideTimer)
		}
	}, [operationState.phase, visible])

	useEffect(() => {
		const operation = presentedState?.operation
		if (!visible || presentedState?.phase !== "loading" || !operation) return undefined

		const updateStage = () => setStageIndex(getLoadingStage(operation))
		const timers = (operation.stageTimes || [0, 1800, 4500])
			.map((time) => setTimeout(updateStage, Math.max(0, operation.startedAt + Number(time) - Date.now())))
		return () => timers.forEach(clearTimeout)
	}, [presentedState?.operation, presentedState?.phase, visible])

	const message = useMemo(() => {
		const phase = presentedState?.phase
		const operation = presentedState?.operation
		if (!operation) return { title: "Processing your request...", detail: "Please keep this page open." }
		if (phase === "success") return operation.success || { title: "Request completed", detail: "Your changes are ready." }
		if (phase === "error") return operation.error || { title: "Unable to complete the request", detail: "Review the message on the page and try again." }
		return operation.loading?.[stageIndex] || operation.loading?.[0] || { title: "Processing your request...", detail: "Please keep this page open." }
	}, [presentedState, stageIndex])

	const phase = presentedState?.phase || "loading"
	const isError = phase === "error"

	return (
		<>
			{children}
			{visible && presentedState ? (
				<div
					className={`operation-overlay operation-overlay--${phase}${exiting ? " operation-overlay--exiting" : ""}`}
					role={isError ? "alert" : "status"}
					aria-live={isError ? "assertive" : "polite"}
					aria-atomic="true"
					aria-label={message.title}
				>
					<div className="operation-overlay-content">
						<div className="operation-overlay-indicator" aria-hidden="true">
							{phase === "loading" ? (
								<>
									<span className="operation-overlay-ring" />
									<img src={brandSeal} alt="" />
								</>
							) : phase === "success" ? <HiCheck /> : <HiX />}
						</div>
						<div className="operation-overlay-copy">
							<strong>{message.title}</strong>
							{message.detail ? <span>{message.detail}</span> : null}
						</div>
					</div>
				</div>
			) : null}
		</>
	)
}
