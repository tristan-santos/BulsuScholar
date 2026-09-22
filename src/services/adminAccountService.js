import { requireBackendApiUrl } from "../config/backendApi"
import { postPortalJson } from "./portalApi"

export const changeAdminTemporaryPassword = (newPassword) => postPortalJson(
	requireBackendApiUrl("Administrator account backend"),
	"/admin/account/change-temporary-password",
	{ newPassword },
	"Administrator password change",
	{ timeoutMs: 20000, operation: "auth.password-update" },
)

export const updateAdminContact = (contactNumber) => postPortalJson(
	requireBackendApiUrl("Administrator account backend"),
	"/admin/account/contact",
	{ contactNumber },
	"Administrator contact update",
	{ timeoutMs: 20000, operation: "record.save" },
)

export const createGrantorAuthAccount = (payload) => postPortalJson(
	requireBackendApiUrl("Grantor account backend"),
	"/admin/grantors/create-account",
	payload,
	"Grantor account creation",
	{ timeoutMs: 30000, operation: "record.save" },
)
