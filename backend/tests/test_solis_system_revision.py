"""Synthetic regression cases for the system-first Solis revision.

These assert implementation behavior, not document-parser accuracy on real CORs.
"""
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend import auth_service as auth
from backend import grantor_algorithms as algorithms
from backend import roster_workflow_service as roster
from backend import scope_announcement_waitlist_service as scopes
from backend.tests import test_roster_workflow_service as roster_fixtures
from backend.tests.test_auth_service import ACCOUNT, access_token


CYCLE = "2026-2027-1ST"


class SolisRosterPreviewTests(unittest.TestCase):
    def preview(self, applications=None, rosters=None, students=None):
        payload = {
            "actorType": "grantor", "actorId": "grantor-1", "grantorId": "grantor-1",
            "rows": [{"studentId": "20260001", "fullName": "Ana Santos", "scholarshipTitle": "Future Leaders"}],
        }

        def rows(table, filters=None):
            if table == "scholarship_applications" and applications is not None:
                return applications
            if table == "grantor_portal_scholars" and rosters is not None:
                return rosters
            if table == "students" and students is not None:
                return students
            if table == "providers":
                return [{"id": "grantor-1", "grantorType": "external", "grantorClassification": "government"}]
            return roster_fixtures.RosterImportPreviewTests._rows(table, filters)

        with patch.object(roster, "enforce_portal_scope"), \
                patch.object(roster, "_current_cycle", return_value=CYCLE), \
                patch.object(roster, "_preview_response", return_value=None), \
                patch.object(roster, "_row_data_rows", side_effect=rows), \
                patch.object(roster, "supabase_document_upsert", return_value={"ok": True}):
            return roster.preview_roster_import(object(), payload)

    def test_external_grantor_uses_normal_roster_flow_and_canonical_cycle(self):
        row = self.preview()["rows"][0]
        self.assertEqual("external", row["grantorType"])
        self.assertEqual(CYCLE, row["academicCycle"])
        self.assertEqual(CYCLE, row["rosterData"]["semesterTag"])
        self.assertEqual("new_assignment", row["disposition"])

    def test_future_account_waits_for_activation(self):
        row = self.preview(students=[])["rows"][0]
        self.assertEqual("ready_for_future_account", row["disposition"])

    def test_current_completed_award_blocks_even_without_legacy_commitment(self):
        result = self.preview(applications=[{
            "id": "completed", "studentId": "20260001", "grantorId": "other", "academicCycle": CYCLE, "status": "Finished",
        }])
        self.assertEqual("blocked", result["status"])
        self.assertEqual("existing_commitment_conflict", result["rows"][0]["disposition"])

    def test_previous_cycle_finished_award_does_not_block(self):
        result = self.preview(applications=[{
            "id": "old", "studentId": "20260001", "grantorId": "other", "academicCycle": "2025-2026-2ND", "status": "Finished",
        }], students=[{"id": "20260001", "fullName": "Ana Santos", "scholarshipCommitment": {"applicationId": "old"}}])
        self.assertEqual("new_assignment", result["rows"][0]["disposition"])

    def test_previous_cycle_roster_is_history(self):
        result = self.preview(rosters=[{
            "id": "old-roster", "studentId": "20260001", "grantorId": "other", "academicCycle": "2025-2026-2ND", "status": "Active",
        }])
        self.assertEqual("new_assignment", result["rows"][0]["disposition"])

    def test_inactive_cancelled_and_terminated_commitments_do_not_block(self):
        for status in ["Cancelled", "Terminated", "Inactive"]:
            with self.subTest(status=status):
                result = self.preview(applications=[{
                    "id": "ended", "studentId": "20260001", "grantorId": "other", "academicCycle": CYCLE, "status": status,
                }], students=[{"id": "20260001", "fullName": "Ana Santos", "scholarshipCommitment": {"applicationId": "ended"}}])
                self.assertEqual("new_assignment", result["rows"][0]["disposition"])

    def test_existing_legacy_application_number_does_not_prevent_in_place_conversion(self):
        result = self.preview(applications=[{
            "id": "pending", "studentId": "20260001", "grantorId": "grantor-1", "academicCycle": CYCLE,
            "scholarshipId": "APP-LEGACY-001", "announcementId": "announcement-1", "status": "Under Review",
        }])
        self.assertEqual("convert_existing", result["rows"][0]["disposition"])

    def test_legacy_roster_without_cycle_requires_staff_verification(self):
        result = self.preview(rosters=[{
            "id": "legacy", "studentId": "20260001", "grantorId": "grantor-1", "scholarshipId": "announcement-1", "status": "Active",
        }])
        self.assertEqual("blocked", result["status"])

    def test_preview_requires_configured_cycle(self):
        with patch.object(roster, "supabase_document_get", return_value={"ok": False}):
            with self.assertRaises(HTTPException) as error:
                roster._current_cycle()
        self.assertEqual(503, error.exception.status_code)

    def test_conflict_resolution_requires_full_admin_and_meaningful_reason(self):
        payload = {"actorId": "admin", "conflictId": "conflict", "resolution": "keep_current", "reason": " "}
        with patch.object(roster, "enforce_portal_scope"), \
                patch.object(roster, "require_admin_bearer", return_value=("admin", {"role": "full_admin"})), \
                patch.object(roster, "supabase_rpc") as rpc:
            with self.assertRaises(HTTPException) as error:
                roster.resolve_roster_conflict(object(), payload)
        self.assertEqual(422, error.exception.status_code)
        rpc.assert_not_called()
        with patch.object(roster, "enforce_portal_scope"), \
                patch.object(roster, "require_admin_bearer", return_value=("reviewer", {"role": "student_reviewer"})):
            with self.assertRaises(HTTPException) as error:
                roster.resolve_roster_conflict(object(), payload)
        self.assertEqual(403, error.exception.status_code)


class SolisVerifiedSessionTests(unittest.TestCase):
    def test_email_challenge_does_not_assign_before_verification(self):
        tokens = {"access_token": access_token(), "refresh_token": "refresh", "user": {"id": ACCOUNT["data"]["authUserId"]}}
        with patch.object(auth, "_find_account", return_value=ACCOUNT), \
                patch.object(auth, "_security_state", return_value={}), \
                patch.object(auth, "_authenticate_password", return_value=(tokens, 200)), \
                patch.object(auth, "_record_attempt", return_value={"blocked": False}), \
                patch.object(auth, "_email_verification_due", return_value=True), \
                patch.object(auth, "_send_email_code", return_value={"required": True}), \
                patch.object(auth, "supabase_rpc", return_value={"ok": True}) as rpc:
            result = auth.login({"userId": ACCOUNT["id"], "password": "correct"})
        self.assertNotIn("session", result)
        self.assertEqual([call.args[0] for call in rpc.call_args_list], ["discard_portal_auth_session"])

    def test_completed_otp_reconciles_only_after_session_registration(self):
        tokens = {"access_token": access_token(), "refresh_token": "refresh", "user": {"id": ACCOUNT["data"]["authUserId"]}}
        responses = [
            {"ok": True, "data": {"verified": True, "accountId": ACCOUNT["id"], "accountType": "student"}},
            {"ok": True}, {"ok": True, "data": {"status": "assigned"}},
        ]
        with patch.object(auth, "_find_account", return_value=ACCOUNT), \
                patch.object(auth, "_code_hash", return_value="fixture-code-hash"), \
                patch.object(auth, "_authenticate_password", return_value=(tokens, 200)), \
                patch.object(auth, "supabase_rpc", side_effect=responses) as rpc:
            result = auth.complete_email_verification({"challengeId": "challenge", "code": "123456", "password": "correct"})
        self.assertEqual([call.args[0] for call in rpc.call_args_list], ["check_portal_email_challenge", "complete_portal_verified_session", "reconcile_student_roster"])
        self.assertEqual("assigned", result["rosterAssignment"]["status"])

    def test_non_student_login_never_runs_roster_reconciliation(self):
        with patch.object(auth, "supabase_rpc") as rpc:
            for role in ["grantor", "admin"]:
                self.assertIsNone(auth._reconcile_verified_student({**ACCOUNT, "type": role}))
        rpc.assert_not_called()

    def test_database_failure_is_not_reported_as_successful_reconciliation(self):
        with patch.object(auth, "supabase_rpc", return_value={"ok": False, "reason": "timeout"}):
            with self.assertRaises(HTTPException) as error:
                auth._reconcile_verified_student(ACCOUNT)
        self.assertEqual("roster_reconciliation_unavailable", error.exception.detail)


class SolisGrantorTypeTests(unittest.TestCase):
    def test_invalid_type_rejected_before_creating_auth_user(self):
        class Request:
            headers = {"x-portal-actor-id": "admin"}

        with patch.object(auth, "require_admin_bearer", return_value=("admin", {"permissions": ["grantors"]})), \
                patch.object(auth, "supabase_admin_create_user") as create:
            with self.assertRaises(HTTPException) as error:
                auth.create_grantor_account(Request(), {"providerId": "external", "email": "test@example.test", "temporaryPassword": "testpassword", "grantorType": "student"})
        self.assertEqual("invalid_grantor_type", error.exception.detail)
        create.assert_not_called()

    def test_external_type_is_separate_from_classification_and_role(self):
        class Request:
            headers = {"x-portal-actor-id": "admin"}

        saved = []
        with patch.object(auth, "require_admin_bearer", return_value=("admin", {"permissions": ["grantors"]})), \
                patch.object(auth, "supabase_document_get", return_value={"ok": True}), \
                patch.object(auth, "supabase_admin_create_user", return_value={"ok": True, "user": {"id": "auth"}}), \
                patch.object(auth, "supabase_document_upsert", side_effect=lambda table, _id, data, **_: saved.append((table, data)) or {"ok": True}), \
                patch.object(auth, "supabase_rpc", return_value={"ok": True, "data": {}}):
            result = auth.create_grantor_account(Request(), {"providerId": "external", "email": "test@example.test", "temporaryPassword": "testpassword", "grantorType": "external", "grantorClassification": "government"})
        self.assertEqual("external", result["grantor"]["grantorType"])
        for _, record in saved:
            self.assertEqual("government", record["grantorClassification"])
            self.assertEqual("provider", record["role"])
            self.assertNotIn("temporaryPassword", record)

    def test_edit_preserves_external_type_when_older_client_omits_it(self):
        with patch.object(scopes, "_full_admin", return_value="admin"), \
                patch.object(scopes, "supabase_document_get", return_value={"ok": True, "data": {"grantorType": "external"}}), \
                patch.object(scopes, "supabase_rpc", return_value={"ok": True, "data": {}}) as rpc:
            scopes.save_grantor_scope(object(), {"grantorId": "provider", "classification": "private", "enabled": False, "locations": []})
        self.assertEqual("save_grantor_profile_policy", rpc.call_args.args[0])
        self.assertEqual("external", rpc.call_args.args[1]["p_grantor_type"])


class SolisMatchingAlgorithmTests(unittest.TestCase):
    def test_edit_distance_similarity_uses_longest_string_length(self):
        self.assertAlmostEqual(1 - 3 / 7, algorithms.levenshtein_similarity("kitten", "sitting"))
        self.assertEqual(1, algorithms.levenshtein_similarity(" ANA-SANTOS ", "ana santos"))

    def test_exact_id_is_a_duplicate_even_with_a_different_name(self):
        result = algorithms.evaluate_scholar_duplicate(
            {"studentId": "2023-001", "fullName": "Ana Santos"},
            {"studentId": "2023001", "fullName": "Completely Different"})
        self.assertTrue(result["isDuplicate"])
        self.assertTrue(result["exactStudentId"])

    def test_reordered_name_is_detected_without_student_ids(self):
        result = algorithms.evaluate_scholar_duplicate({"fullName": "Ana Maria Santos"}, {"fullName": "Santos Ana Maria"})
        self.assertTrue(result["isDuplicate"])
        self.assertEqual(1, result["nameSimilarity"])

    def test_fuzzy_threshold_is_84_percent_with_82_percent_name_floor(self):
        for similarity, expected in [(0.83, False), (0.84, True)]:
            with self.subTest(similarity=similarity), patch.object(algorithms, "comparable_similarity", side_effect=lambda a, b, *args: similarity if a and b else None):
                result = algorithms.evaluate_scholar_duplicate({"fullName": "Candidate"}, {"fullName": "Existing"})
            self.assertEqual(expected, result["isDuplicate"])
            self.assertAlmostEqual(similarity, result["score"])

    def test_shared_contact_needs_72_percent_name_similarity(self):
        for similarity, expected in [(0.719, False), (0.72, True)]:
            def comparable(left, right, *args):
                if not left or not right:
                    return None
                return 1 if left == right else similarity

            with self.subTest(similarity=similarity), patch.object(algorithms, "comparable_similarity", side_effect=comparable):
                result = algorithms.evaluate_scholar_duplicate(
                    {"fullName": "Candidate", "contactNumber": "09171234567"},
                    {"fullName": "Existing", "contactNumber": "09171234567"})
            self.assertEqual(expected, result["isDuplicate"])

    def test_unavailable_fields_are_not_invented_as_matches(self):
        result = algorithms.evaluate_scholar_duplicate({}, {})
        self.assertFalse(result["isDuplicate"])
        self.assertEqual([], result["fields"])
        self.assertEqual(0, result["score"])
        result = algorithms.evaluate_scholar_duplicate({"fullName": "Ana Santos", "birthdate": "2001-01-01", "school": "BulSU"}, {"fullName": "Ana Santos", "birthdate": "2001-01-01", "school": "BulSU"})
        self.assertEqual(["name"], [field["label"] for field in result["fields"]])


if __name__ == "__main__":
    unittest.main()
