import { useEffect, useState } from "react"
import { collection, onSnapshot } from "../services/supabaseDataService"
import { db } from "../services/supabaseDataService"

const BLOCKED_GRANTOR_STATUSES = new Set(["archived", "inactive", "disabled"])

export function isArchivedGrantorRecord(record = {}) {
	const status = String(record.status || record.accountStatus || "").trim().toLowerCase()
	return record.archived === true || BLOCKED_GRANTOR_STATUSES.has(status)
}

export function isAnnouncementBlockedByGrantor(announcement = {}, archivedGrantorIds = new Set()) {
	if (announcement.source !== "grantor") return false
	if (announcement.grantorAccountArchived === true || announcement.hiddenFromStudents === true) return true
	return archivedGrantorIds.has(String(announcement.grantorId || ""))
}

export default function useArchivedGrantorIds() {
	const [archivedGrantorIds, setArchivedGrantorIds] = useState(() => new Set())

	useEffect(() => {
		let providerIds = new Set()
		let portalIds = new Set()

		const publish = () => {
			const nextIds = new Set([...providerIds, ...portalIds])
			setArchivedGrantorIds((currentIds) => {
				const unchanged =
					currentIds.size === nextIds.size &&
					[...nextIds].every((grantorId) => currentIds.has(grantorId))
				return unchanged ? currentIds : nextIds
			})
		}
		const collectArchivedIds = (snapshot) => new Set(
			snapshot.docs
				.filter((row) => isArchivedGrantorRecord(row.data() || {}))
				.map((row) => String(row.id)),
		)

		const unsubscribeProviders = onSnapshot(
			collection(db, "providers"),
			(snapshot) => {
				providerIds = collectArchivedIds(snapshot)
				publish()
			},
			() => {
				providerIds = new Set()
				publish()
			},
		)
		const unsubscribePortals = onSnapshot(
			collection(db, "grantorPortals"),
			(snapshot) => {
				portalIds = collectArchivedIds(snapshot)
				publish()
			},
			() => {
				portalIds = new Set()
				publish()
			},
		)

		return () => {
			unsubscribeProviders()
			unsubscribePortals()
		}
	}, [])

	return archivedGrantorIds
}
