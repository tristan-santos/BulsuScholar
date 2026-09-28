const USER_ID_KEY = "bulsuscholar_userId"
const USER_TYPE_KEY = "bulsuscholar_userType"
const CHANNEL_NAME = "bulsuscholar_portal_session"

let channel
try {
	channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null
} catch {
	channel = null
}

function mirrorToTab(userId, userType) {
	if (userId && userType) {
		sessionStorage.setItem(USER_ID_KEY, userId)
		sessionStorage.setItem(USER_TYPE_KEY, userType)
	} else {
		sessionStorage.removeItem(USER_ID_KEY)
		sessionStorage.removeItem(USER_TYPE_KEY)
	}
}

export function getPortalIdentity() {
	const userId = localStorage.getItem(USER_ID_KEY) || sessionStorage.getItem(USER_ID_KEY) || ""
	const userType = localStorage.getItem(USER_TYPE_KEY) || sessionStorage.getItem(USER_TYPE_KEY) || ""
	if (userId && userType) mirrorToTab(userId, userType)
	return { userId, userType }
}

export function setPortalIdentity(userId, userType) {
	localStorage.setItem(USER_ID_KEY, userId)
	localStorage.setItem(USER_TYPE_KEY, userType)
	mirrorToTab(userId, userType)
	channel?.postMessage({ type: "login", userId, userType })
}

export function clearPortalIdentity() {
	localStorage.removeItem(USER_ID_KEY)
	localStorage.removeItem(USER_TYPE_KEY)
	mirrorToTab("", "")
	channel?.postMessage({ type: "logout" })
}

export function subscribePortalIdentity(callback) {
	const handleStorage = (event) => {
		if (event.key === USER_ID_KEY || event.key === USER_TYPE_KEY) callback(getPortalIdentity())
	}
	const handleMessage = (event) => {
		if (event.data?.type === "logout") mirrorToTab("", "")
		if (event.data?.type === "login") mirrorToTab(event.data.userId, event.data.userType)
		callback(getPortalIdentity())
	}
	window.addEventListener("storage", handleStorage)
	channel?.addEventListener("message", handleMessage)
	return () => {
		window.removeEventListener("storage", handleStorage)
		channel?.removeEventListener("message", handleMessage)
	}
}
