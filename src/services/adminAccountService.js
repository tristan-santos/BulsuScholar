import { requireBackendApiUrl } from "../config/backendApi"
import { postPortalJson } from "./portalApi"

export const changeAdminTemporaryPassword = (newPassword) => postPortalJson(
	requireBackendApiUrl("Administrator account backend"),
	"/admin/account/change-temporary-password",
	{ newPassword },
	"Administrator password change",
	{ timeoutMs: 20000 },
)

export const updateAdminContact = (contactNumber) => postPortalJson(
	requireBackendApiUrl("Administrator account backend"),
	"/admin/account/contact",
	{ contactNumber },
	"Administrator contact update",
	{ timeoutMs: 20000 },
)
