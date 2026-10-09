import { useCallback, useEffect, useState } from "react"
import { getStudentProfilePhotoBlob, STUDENT_PROFILE_PHOTO_UPDATED_EVENT } from "../services/studentProfileService"

export default function useStudentProfilePhoto({ enabled = true } = {}) {
	const [photoUrl, setPhotoUrl] = useState("")
	const [revision, setRevision] = useState(0)
	const refresh = useCallback(() => setRevision((value) => value + 1), [])

	useEffect(() => {
		window.addEventListener(STUDENT_PROFILE_PHOTO_UPDATED_EVENT, refresh)
		return () => window.removeEventListener(STUDENT_PROFILE_PHOTO_UPDATED_EVENT, refresh)
	}, [refresh])

	useEffect(() => {
		if (!enabled) return undefined
		let active = true
		let objectUrl = ""
		getStudentProfilePhotoBlob()
			.then((blob) => {
				if (!active) return
				objectUrl = URL.createObjectURL(blob)
				setPhotoUrl(objectUrl)
			})
			.catch(() => {
				if (active) setPhotoUrl("")
			})
		return () => {
			active = false
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	}, [enabled, revision])

	return { photoUrl: enabled ? photoUrl : "", refresh }
}
