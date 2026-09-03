import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  HiOutlineArchive,
  HiOutlineCheckCircle,
  HiOutlineDocumentAdd,
  HiOutlineRefresh,
  HiOutlineX,
} from "react-icons/hi";
import {
  findStudentAccountByUniqueField,
  getRecord,
} from "../services/supabaseDataService";
import { uploadToStorage } from "../services/storageService";
import {
  createLeaveRequest,
  listPriorityRecords,
} from "../services/priorityOneService";
import StudentTopbar from "../components/StudentTopbar";
import useThemeMode from "../hooks/useThemeMode";
import "../css/StudentDashboard.css";
import "../css/PortalSupport.css";
import "../css/StudentPortalRefresh.css";

function studentName(user = {}) {
  return (
    [user.fname, user.mname, user.lname].filter(Boolean).join(" ").trim() ||
    user.fullName ||
    "Student"
  );
}

export default function StudentLeavePage() {
  const { theme, setTheme } = useThemeMode();
  const studentId = sessionStorage.getItem("bulsuscholar_userId") || "";
  const [user, setUser] = useState({});
  const [requests, setRequests] = useState([]);
  const [modal, setModal] = useState("");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const resolvedReason = reason === "Other" ? otherReason.trim() : reason.trim();

  const load = useCallback(async () => {
    if (!studentId) return;
    console.log("[BulsuScholar] Loading student LOA page", {
      studentId,
      backendUrl: import.meta.env.VITE_BACKEND_API_URL || "https://bulsuscholar.onrender.com",
    });

    const [activeStudentResult, pendingStudentResult, leaveRecordsResult] =
      await Promise.allSettled([
        getRecord("students", studentId),
        getRecord("pending_students", studentId),
        listPriorityRecords("leave_requests", { studentId }),
      ]);

    if (activeStudentResult.status === "rejected") {
      console.error("[BulsuScholar] LOA active student lookup failed", {
        studentId,
        error: activeStudentResult.reason,
      });
    }
    if (pendingStudentResult.status === "rejected") {
      console.error("[BulsuScholar] LOA pending student lookup failed", {
        studentId,
        error: pendingStudentResult.reason,
      });
    }
    if (leaveRecordsResult.status === "rejected") {
      console.error("[BulsuScholar] LOA leave records lookup failed", {
        studentId,
        error: leaveRecordsResult.reason,
      });
    }

    const activeStudent =
      activeStudentResult.status === "fulfilled" ? activeStudentResult.value : null;
    const pendingStudent =
      pendingStudentResult.status === "fulfilled" ? pendingStudentResult.value : null;
    const result =
      leaveRecordsResult.status === "fulfilled" ? leaveRecordsResult.value : { records: [] };

    let resolvedStudent = activeStudent || pendingStudent;
    if (!resolvedStudent) {
      try {
        const lookup = await findStudentAccountByUniqueField("studentId", studentId);
        resolvedStudent = lookup?.record || null;
        console.log("[BulsuScholar] LOA fallback student lookup result", {
          studentId,
          found: Boolean(resolvedStudent),
          source: lookup?.table || lookup?.source || null,
        });
      } catch (error) {
        console.error("[BulsuScholar] LOA fallback student lookup failed", {
          studentId,
          error,
        });
      }
    }
    if (!resolvedStudent) {
      console.warn("[BulsuScholar] LOA student account could not be resolved", {
        studentId,
        activeStudentFound: Boolean(activeStudent),
        pendingStudentFound: Boolean(pendingStudent),
      });
    }
    setUser(resolvedStudent || {});
    setRequests(result.records || []);
  }, [studentId]);
  useEffect(() => {
    load().catch((error) => {
      console.error("[BulsuScholar] LOA page load failed", {
        studentId,
        error,
      });
      toast.error("Leave records could not be loaded. Check the console for details.");
    });
  }, [load, studentId]);
  const latestLoa = useMemo(
    () => requests.find((item) => item.requestType === "loa"),
    [requests],
  );
  const canReturn =
    latestLoa?.status === "approved" || user.loaStatus === "approved";
  const submit = async () => {
    if (!resolvedReason) return toast.error("Select or enter a request reason.");
    if (!file)
      return toast.error(
        `Upload the signed ${modal === "loa" ? "LOA" : "return-to-study"} request PDF.`,
      );
    setSaving(true);
    try {
      const document = await uploadToStorage(file, {
        folder: `loa-requests/${studentId}`,
      });
      await createLeaveRequest({
        studentId,
        studentName: studentName(user),
        grantorId: user.grantorId || user.providerId || "",
        scholarshipName: user.scholarshipName || user.scholarship || "",
        requestType: modal,
        reason: resolvedReason,
        reasonCategory: reason,
        notes,
        document,
        requiredDocuments: [document],
      });
      toast.success(`${modal === "loa" ? "LOA" : "Return"} request submitted.`);
      setModal("");
      setReason("");
      setOtherReason("");
      setNotes("");
      setFile(null);
      await load();
    } catch (error) {
      console.error("[BulsuScholar] LOA request submission failed", {
        studentId,
        requestType: modal,
        reason,
        otherReason,
        error,
      });
      toast.error(error.message.replaceAll("_", " "));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={`student-portal student-dashboard student-dashboard-page student-dashboard-page--${theme} student-portal-view student-portal-view--leave ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
      <StudentTopbar user={user} theme={theme} setTheme={setTheme} />
      <main className="portal-support-main leave-page">
        <section className="portal-support-hero">
          <span>Student account</span>
          <h1>Leave and Return Requests</h1>
          <p>
            Submit an official Leave of Absence request or ask to reactivate
            your account when you return to study.
          </p>
        </section>
        <section className="leave-action-grid">
          <article>
            <HiOutlineArchive />
            <h2>Leave of Absence</h2>
            <p>
              Approval freezes active scholarship progress while preserving your
              prior scholarship record for your return.
            </p>
            <button
              type="button"
              onClick={() => setModal("loa")}
              disabled={latestLoa?.status === "pending" || canReturn}
            >
              Request Leave of Absence
            </button>
          </article>
          <article>
            <HiOutlineRefresh />
            <h2>Return to Study</h2>
            <p>
              Available after LOA approval. Your prior scholarship will be
              recommended after reactivation.
            </p>
            <button
              type="button"
              onClick={() => setModal("return")}
              disabled={
                !canReturn ||
                requests.some(
                  (item) =>
                    item.requestType === "return" && item.status === "pending",
                )
              }
            >
              Request Reactivation
            </button>
          </article>
        </section>
      </main>
      {modal ? (
        <div
          className="priority-modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setModal("")
          }
        >
          <section className="priority-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button
              className="priority-modal-close"
              onClick={() => setModal("")}
            >
              <HiOutlineX />
            </button>
            <header>
              <span>
                <HiOutlineDocumentAdd />
              </span>
              <div>
                <small>Request for review</small>
                <h2>
                  {modal === "loa" ? "Leave of Absence" : "Return to Study"}
                </h2>
              </div>
            </header>
            <label>
              Reason
              <select
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (event.target.value !== "Other") setOtherReason("");
                }}
              >
                <option value="">Select reason</option>
                <option>Health or medical concern</option>
                <option>Financial concern</option>
                <option>Family responsibility</option>
                <option>Returning after approved leave</option>
                <option>Other</option>
              </select>
            </label>
            {reason === "Other" ? (
              <label>
                Other reason
                <input
                  type="text"
                  value={otherReason}
                  onChange={(event) => setOtherReason(event.target.value)}
                  placeholder="Write the specific reason"
                />
              </label>
            ) : null}
            <label>
              Supporting PDF (required)
              <span className={`leave-file-picker ${file ? "has-file" : ""}`}>
                <HiOutlineDocumentAdd aria-hidden="true" />
                <span>
                  <strong>{file?.name || "Choose supporting PDF"}</strong>
                  <small>{file ? "PDF ready to submit" : "PDF files only"}</small>
                </span>
                <span className="leave-file-picker-action">Browse</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
              </span>
            </label>
            <label>
              Additional notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add information the administrator should review."
              />
            </label>
            <footer>
              <button className="secondary" onClick={() => setModal("")}>
                Cancel
              </button>
              <button onClick={submit} disabled={saving}>
                <HiOutlineCheckCircle />
                {saving ? "Submitting..." : "Confirm Request"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
