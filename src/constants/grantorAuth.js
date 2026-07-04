export const GRANTOR_DEFAULT_PASSWORD = "Grantor@123"
export const GRANTOR_PASSWORD_CHANGE_ID_KEY = "bulsuscholar_grantorPasswordChangeId"

export function grantorMustChangePassword(provider = {}) {
	return provider?.mustChangePassword === true || provider?.mustChangePassword === "true"
}
