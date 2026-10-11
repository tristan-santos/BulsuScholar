import { requireBackendApiUrl } from "../config/backendApi"
import { buildPortalRequestHeaders, PortalApiError, postPortalJson } from "./portalApi"
import { trackedFetch } from "./operationTracker"

const adminRequest = async (path, options = {}) => {
	const response = await trackedFetch(`${requireBackendApiUrl("Administrator account backend")}${path}`, {
		...options,
		headers: await buildPortalRequestHeaders({ actorType: "admin" }),
	}, "record.load")
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const reason = String(data?.detail || data?.reason || "admin_request_failed")
		throw new PortalApiError(reason, { status: response.status, reason, data })
	}
	return data
}

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

export const getAdminAcademicCycle = () => adminRequest("/admin/academic-cycle")

export const activateAdminAcademicCycle = (payload) => postPortalJson(
	requireBackendApiUrl("Administrator account backend"),
	"/admin/academic-cycle",
	payload,
	"Academic cycle update",
	{ timeoutMs: 60000, operation: "record.save", actor: { actorType: "admin" } },
)
