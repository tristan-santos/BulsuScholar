let activeCount = 0
let state = { phase: "idle", activeCount: 0, error: null }
let completionTimer = null
let pendingError = null
const listeners = new Set()
const nativeFetch = globalThis.fetch.bind(globalThis)

function publish(nextState) {
	state = { ...nextState, activeCount }
	listeners.forEach((listener) => listener())
}

export function subscribeToOperations(listener) {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function getOperationSnapshot() {
	return state
}

export function beginOperation() {
	if (completionTimer) {
		clearTimeout(completionTimer)
		completionTimer = null
	}
	if (activeCount === 0) pendingError = null
	activeCount += 1
	publish({ phase: "loading", error: null })
	let finished = false
	return (error = null) => {
		if (finished) return
		finished = true
		if (error) pendingError = error
		activeCount = Math.max(0, activeCount - 1)
		if (activeCount > 0) {
			publish({ phase: "loading", error: pendingError })
			return
		}
		publish({ phase: pendingError ? "error" : "success", error: pendingError })
		completionTimer = setTimeout(() => {
			completionTimer = null
			if (activeCount === 0) {
				pendingError = null
				publish({ phase: "idle", error: null })
			}
		}, 600)
	}
}

export async function trackOperation(operation) {
	const finish = beginOperation()
	try {
		const result = await operation()
		finish()
		return result
	} catch (error) {
		finish(error)
		throw error
	}
}

export async function trackedFetch(input, init) {
	const finish = beginOperation()
	try {
		const response = await nativeFetch(input, init)
		finish(response.ok ? null : new Error(`HTTP ${response.status}`))
		return response
	} catch (error) {
		finish(error)
		throw error
	}
}

export function installGlobalOperationTracking() {
	if (globalThis.fetch !== trackedFetch) globalThis.fetch = trackedFetch
}
