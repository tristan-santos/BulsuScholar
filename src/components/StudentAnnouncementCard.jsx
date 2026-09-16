import {
	HiOutlineAcademicCap,
	HiOutlineBell,
	HiOutlineEye,
} from "react-icons/hi"
import { getAnnouncementApplyAvailability } from "../services/announcementApplyEligibilityService"
import { getScholarshipSlotState } from "../services/scholarshipSlotService"
import { getNameInitials } from "../utils/nameInitials"

function getAnnouncementImageUrl(item = {}) {
	const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : []
	const imageObjects = Array.isArray(item.images) ? item.images.map((image) => image?.url).filter(Boolean) : []
	return [item.imageUrl, ...imageUrls, ...imageObjects].find(Boolean) || ""
}

export default function StudentAnnouncementCard({
	announcement,
	formatRelativeDate,
	onOpen,
	studentAccessState,
	user,
	isPrevious = false,
}) {
	const imageUrl = getAnnouncementImageUrl(announcement)
	const authorName = announcement.sourceLabel || (announcement.source === "grantor" ? "Grantor" : "Scholarship Office")
	const authorImage = announcement.profileImageUrl || announcement.authorImageUrl || ""
	const authorInitials = getNameInitials(authorName, announcement.source === "grantor" ? "G" : "SO")
	const applyAvailability = getAnnouncementApplyAvailability({
		announcement,
		user,
		studentAccessState,
		isPreviousAnnouncement: isPrevious,
	})
	const isApplyBlocked = !isPrevious && announcement.applicationEnabled === true && !applyAvailability.canApply
	const slotState = getScholarshipSlotState(announcement)
	const showApply = announcement.applicationEnabled === true && !isPrevious

	return (
		<article className={`student-modern-announcement-card student-shared-announcement-card ${isPrevious ? "student-shared-announcement-card--previous" : ""}`}>
			<div className="student-modern-announcement-media">
				{imageUrl ? <img src={imageUrl} alt={announcement.title || "Announcement"} /> : <HiOutlineBell aria-hidden />}
			</div>
			<div className="student-modern-announcement-body">
				<div className="student-modern-announcement-author">
					<span>{authorImage ? <img src={authorImage} alt="" /> : authorInitials}</span>
					<div>
						<strong>{authorName}</strong>
						<small>{formatRelativeDate(announcement.createdAt || announcement.date)}</small>
					</div>
				</div>
				<h4>{announcement.title || "Announcement"}</h4>
				<p>{announcement.previewText || announcement.content || announcement.description || "No preview text provided."}</p>
				{slotState.managed ? <span className={`student-slot-badge ${slotState.low ? "is-low" : ""} ${slotState.full ? "is-full" : ""}`}>{slotState.label}</span> : null}
				<button
					type="button"
					className={isApplyBlocked ? "student-modern-announcement-apply--blocked" : ""}
					data-button-variant={showApply && !isApplyBlocked ? "positive" : "neutral"}
					onClick={() => onOpen(announcement)}
				>
					{showApply ? <HiOutlineAcademicCap aria-hidden /> : <HiOutlineEye aria-hidden />}
					{showApply ? "Apply Now" : "View Announcement"}
				</button>
			</div>
		</article>
	)
}
