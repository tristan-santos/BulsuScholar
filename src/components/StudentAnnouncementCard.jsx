import {
	HiOutlineAcademicCap,
	HiOutlineEye,
} from "react-icons/hi"
import { getAnnouncementApplyAvailability } from "../services/announcementApplyEligibilityService"
import { getScholarshipSlotState } from "../services/scholarshipSlotService"
import { getNameInitials } from "../utils/nameInitials"
import { getAnnouncementImageUrls } from "../utils/announcementImages"
import logo from "../assets/logo.png"

export default function StudentAnnouncementCard({
	announcement,
	formatRelativeDate,
	onOpen,
	studentAccessState,
	user,
	isPrevious = false,
}) {
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
	const announcementImages = getAnnouncementImageUrls(announcement)
	const announcementImage = announcementImages[0] || logo

	return (
		<article className={`student-modern-announcement-card student-shared-announcement-card ${isPrevious ? "student-shared-announcement-card--previous" : ""}`}>
			<div className="student-modern-announcement-media"><img className={announcementImages.length ? "" : "is-fallback"} src={announcementImage} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.classList.add("is-fallback"); event.currentTarget.src = logo }} alt="" /></div>
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
