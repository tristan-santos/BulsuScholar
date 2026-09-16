import { resolveOperationProfile } from "./operationProfiles"

let sequence = 0
let state = { phase: "idle", activeCount: 0, error: null, operation: null }
let completionTimer = null
const activeOperations = new Map()
const listeners = new Set()
const nativeFetch = globalThis.fetch.bind(globalThis)

function publish(phase, operation = null, error = null) {
	state = {
		phase,
		activeCount: activeOperations.size,
		error,
		operation,
	}
	listeners.forEach((listener) => listener())
}

function chooseActiveOperation(kind = "") {
	return [...activeOperations.values()]
		.filter((operation) => !kind || operation.kind === kind)
		.sort((left, right) => right.priority - left.priority || right.startedAt - left.startedAt)[0] || null
}

function publishActiveOrIdle() {
	const operation = chooseActiveOperation("foreground") || chooseActiveOperation("background")
	if (operation) publish("loading", operation)
	else publish("idle")
}

function clearCompletion() {
	if (!completionTimer) return
	clearTimeout(completionTimer)
	completionTimer = null
}

export function subscribeToOperations(listener) {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function getOperationSnapshot() {
	return state
}

export function beginOperation(metadata = {}) {
	const profile = resolveOperationProfile(metadata)
	const operation = {
		...profile,
		id: ++sequence,
		startedAt: Date.now(),
	}

	if (operation.kind === "foreground") clearCompletion()
	activeOperations.set(operation.id, operation)

	if (!["success", "error"].includes(state.phase) || operation.kind === "foreground") {
		publishActiveOrIdle()
	} else {
		state = { ...state, activeCount: activeOperations.size }
		listeners.forEach((listener) => listener())
	}

	let finished = false
	return (error = null) => {
		if (finished) return
		finished = true
		activeOperations.delete(operation.id)

		if (operation.kind === "background") {
			if (state.phase === "loading" && state.operation?.id === operation.id) publishActiveOrIdle()
			else {
				state = { ...state, activeCount: activeOperations.size }
				listeners.forEach((listener) => listener())
			}
			return
		}

		const nextForeground = chooseActiveOperation("foreground")
		if (nextForeground) {
			publish("loading", nextForeground)
			return
		}

		if (!error && operation.showSuccess === false) {
			publishActiveOrIdle()
			return
		}

		publish(error ? "error" : "success", operation, error)
		clearCompletion()
		completionTimer = setTimeout(() => {
			completionTimer = null
			publishActiveOrIdle()
		}, error ? 1100 : 700)
	}
}

export async function trackOperation(operation, metadata = {}) {
	const finish = beginOperation(metadata)
	try {
		const result = await operation()
		finish()
		return result
	} catch (error) {
		finish(error)
		throw error
	}
}

export async function trackedFetch(input, init = {}, metadata = null) {
	const { operation: initOperation, ...fetchInit } = init || {}
	const operationMetadata = metadata || initOperation || resolveOperationProfile(null, input, fetchInit)
	const finish = beginOperation(operationMetadata)
	try {
		const response = await nativeFetch(input, fetchInit)
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
