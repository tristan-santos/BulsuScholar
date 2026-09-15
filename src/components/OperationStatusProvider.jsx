import { useEffect, useState, useSyncExternalStore } from "react"
import { HiCheck, HiX } from "react-icons/hi"
import { getOperationSnapshot, subscribeToOperations } from "../services/operationTracker"

export default function OperationStatusProvider({ children }) {
	const operation = useSyncExternalStore(subscribeToOperations, getOperationSnapshot, getOperationSnapshot)
	const [visible, setVisible] = useState(false)

	useEffect(() => {
		if (operation.phase === "loading") {
			const timer = setTimeout(() => setVisible(true), 250)
			return () => clearTimeout(timer)
		}
		if (operation.phase === "idle") {
			const timer = setTimeout(() => setVisible(false), 0)
			return () => clearTimeout(timer)
		}
		return undefined
	}, [operation.phase])

	return (
		<>
			{children}
			{visible && operation.phase !== "idle" ? (
				<div className={`operation-overlay operation-overlay--${operation.phase}`} role="status" aria-live="polite" aria-label={operation.phase === "loading" ? "Loading" : operation.phase === "success" ? "Completed" : "Operation failed"}>
					<div className="operation-overlay-indicator" aria-hidden>
						{operation.phase === "loading" ? <span className="operation-overlay-spinner" /> : operation.phase === "success" ? <HiCheck /> : <HiX />}
					</div>
					<strong>{operation.phase === "loading" ? "Please wait" : operation.phase === "success" ? "Complete" : "Unable to complete"}</strong>
				</div>
			) : null}
		</>
	)
}
