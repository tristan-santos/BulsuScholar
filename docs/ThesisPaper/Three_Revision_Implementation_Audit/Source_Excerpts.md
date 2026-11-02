## E1 - Application reserve delegates authoritative slot/waitlist transaction
backend/scholarship_choice_service.py:96-110
```python
    if not student_id or not announcement_id or not grantor_id:
        return {"ok": False, "reason": "missing_application_identity"}
    # Both identifiers are server-generated. Browser retries match the stored
    # student/grantor/offering tuple instead of trusting a caller's record ID.
    application_id = str(uuid4())
    application_number = f"{student_id[-3:]}-{uuid4().hex[:8]}"
    # The transaction checks the normalized award and its cycle. A cached or
    # historical commitment in a hydrated response must not decide eligibility.
    result = supabase_rpc("reserve_or_waitlist_scholarship", {
        "p_student_id": student_id, "p_announcement_id": announcement_id,
        "p_grantor_id": grantor_id, "p_application_id": application_id,
        "p_application_number": application_number,
    })
    if not result.get("ok"):
        reason = result.get("reason") or "slot_reservation_failed"
```
Input is authorized student and normalized program identifiers; server-generated application identity is passed to the reservation RPC. Output is normalized success/blocker data. This supports centralized submission, not automatic award.

## E2 - Signup COR owner and academic-period validation
backend/signup_service.py:203-220
```python
    if cor_scan.get("isValidCorDocument") is False:
        raise HTTPException(status_code=422, detail="invalid_cor_document_title")
    scanned_student_id = normalize_student_id(cor_scan.get("studentId"))
    if not scanned_student_id or scanned_student_id != normalized_student_id:
        raise HTTPException(status_code=422, detail="cor_student_id_mismatch")
    detected_cor_year = _signup_year(cor_scan.get("year"))
    submitted_year = _signup_year(declared_year)
    if declared_year and not submitted_year:
        raise HTTPException(status_code=422, detail="invalid_year_level")
    if not detected_cor_year and not submitted_year:
        raise HTTPException(status_code=422, detail="cor_year_level_not_detected")
    year = submitted_year or detected_cor_year
    year_level_mismatch = bool(submitted_year and detected_cor_year and submitted_year != detected_cor_year)

    current_cycle = get_current_semester_tag()
    cor_cycle = build_semester_tag(cor_scan)
    if not cor_cycle or cor_cycle != current_cycle:
        raise HTTPException(status_code=422, detail="cor_cycle_mismatch")
```
Receives parsed COR and declared signup ID/year. It rejects a wrong COR ID and cycle, while deriving year/review warning. It does not establish that the ROG owner or all fields were validated.

## E3 - Weighted pair decision
backend/grantor_algorithms.py:92-110
```python
    fields = [
        {"label": "student ID", "weight": 0.32, "value": comparable_similarity(candidate_student_id, existing_student_id, True)},
        {"label": "name", "weight": 0.30, "value": name_similarity or None},
        {"label": "email", "weight": 0.10, "value": comparable_similarity(candidate_email, existing_email, True)},
        {"label": "contact number", "weight": 0.08, "value": comparable_similarity(candidate_phone, existing_phone, True)},
        {"label": "course", "weight": 0.08, "value": comparable_similarity(candidate.get("course"), existing.get("course"))},
        {"label": "year level", "weight": 0.04, "value": comparable_similarity(candidate.get("yearLevel") or candidate.get("year"), existing.get("yearLevel") or existing.get("year"))},
        {"label": "city", "weight": 0.04, "value": comparable_similarity(candidate.get("city"), existing.get("city"))},
        {"label": "province", "weight": 0.04, "value": comparable_similarity(candidate.get("province"), existing.get("province"))},
    ]
    compared_fields = [field for field in fields if field["value"] is not None]
    compared_weight = sum(field["weight"] for field in compared_fields)
    weighted_score = (
        sum(float(field["value"]) * field["weight"] for field in compared_fields) / compared_weight
        if compared_weight > 0
        else 0
    )
    strong_identifier_match = exact_student_id or ((exact_email or exact_phone) and name_similarity >= 0.72)
    is_duplicate = strong_identifier_match or (name_similarity >= 0.82 and weighted_score >= 0.84)
```
Receives candidate and existing record; normalizes weighted available fields and applies exact-identifier or similarity branches. The consumer determines grouping versus blocking.

## E4 - Official award identity and cycle checks
supabase/migrations/20261023070747_solis_cycle_aware_roster_reconciliation.sql:81-104
```sql
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  if not public.roster_record_active(student_data) or student_data->>'disabled' = 'true'
    or student_data->>'adminBlocked' = 'true' or student_data->>'isPending' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('blocked', 'disabled', 'pending') then
    raise exception 'student_account_blocked';
  end if;
  select data into roster_data from public.grantor_portal_scholars where id = p_roster_id and parent_id = p_grantor_id for update;
  if not found or coalesce(roster_data->>'studentId', roster_data->>'studentnumber', roster_data->>'studentNumber', '') <> p_student_id
    or not public.roster_record_active(roster_data) then raise exception 'roster_match_not_found'; end if;
  -- Untagged legacy rows require staff verification; never guess their semester.
  if public.roster_cycle(roster_data) <> cycle then raise exception 'roster_cycle_requires_verification'; end if;
  if public.roster_name_key(coalesce(roster_data->>'fullName', concat_ws(' ', roster_data->>'fname', roster_data->>'mname', roster_data->>'lname'))) = ''
    or public.roster_name_key(coalesce(roster_data->>'fullName', concat_ws(' ', roster_data->>'fname', roster_data->>'mname', roster_data->>'lname')))
      <> public.roster_name_key(coalesce(student_data->>'fullName', concat_ws(' ', student_data->>'fname', student_data->>'mname', student_data->>'lname'))) then
    raise exception 'roster_identity_mismatch';
  end if;
  target_scholarship_id := coalesce(nullif(roster_data->>'scholarshipId', ''), roster_data->>'announcementId');
  scholarship_name := coalesce(roster_data->>'scholarshipTitle', roster_data->>'scholarshipName', 'Scholarship');
  if exists(select 1 from public.grantor_portal_scholars where id <> p_roster_id
    and coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_student_id
    and public.roster_record_active(data) and public.roster_cycle(data) in ('', cycle)) then
    raise exception 'scholarship_already_committed';
  end if;
```
Receives locked student/roster data in the assignment transaction. Active identity, normalized nonempty name and applicable cycle must agree, and competing current rosters restrict assignment.

## E5 - Active academic replacement policy
backend/student_profile_service.py:900-917
```python
    if document_type in {"cor", "rog"}:
        if content_type != "application/pdf":
            raise HTTPException(status_code=415, detail="pdf_required")
        scan = parse_pdf_document(body, "cor" if document_type == "cor" else "cog")
        if document_type == "cor":
            detected = str(scan.get("documentTitle") or "")
            kind = "advising_slip" if detected == "Advising Slip" else "cor"
            mode = requirements["corMode"]
            if not scan.get("isValidCorDocument") or (mode == "cor_only" and kind != "cor") or (mode == "advising_only" and kind != "advising_slip"):
                exception = _data_rows("student_document_exceptions", {
                    "data->>studentId": student_id, "data->>academicCycle": cycle,
                    "data->>exceptionType": "advising_slip", "data->>status": "active",
                }, limit=1)
                if not (kind == "advising_slip" and exception):
                    raise HTTPException(status_code=422, detail="cor_policy_not_satisfied")
            document_kind = kind
        elif not scan.get("isValidCogDocument"):
            raise HTTPException(status_code=422, detail="invalid_rog_document")
```
Receives authenticated student PDF and parser output; enforces document type/title/COR policy, including exception lookup. This excerpt does not contain signup-level owner/period validation.

## E6 - Recommendation hard exclusions
backend/scholarship_rules.py:146-157
```python
    for item in scholarships:
        if item.get("applicationsBlocked") is True:
            continue
        if item.get("applicationEnabled") is False and item.get("applyOpen") is not True:
            continue

        minimum_gwa = _to_float(item.get("minimumGwa") or item.get("minGwa") or item.get("minimumGrade"))
        provider = item.get("providerLabel") or item.get("grantorName") or item.get("title") or item.get("name") or ""
        if minimum_gwa is None:
            minimum_gwa = _to_float(get_scholarship_policy(provider)["minGwa"]) or 2.25
        if student_gwa is None or student_gwa > minimum_gwa:
            continue
```
Receives each candidate after GWA preparation; excludes explicit blocked, disabled-without-override and academically ineligible candidates. Remaining items proceed to scoring.

## E7 - Grade and popularity factors
backend/scholarship_rules.py:159-171
```python
        reasons = []
        grade_margin = max(0.0, minimum_gwa - student_gwa)
        grade_score = min(40.0, 24.0 + (grade_margin * 12.0))
        if grade_margin >= 0.5:
            reasons.append("Strong GWA match")
        else:
            reasons.append("Meets minimum GWA")

        roster_count = _to_int(item.get("rosterCount"))
        popularity_weight = 30.0 if is_high_grade_student else 22.0
        popularity_score = (roster_count / max_roster * popularity_weight) if max_roster > 0 else 0.0
        if roster_count > 0:
            reasons.append(f"{roster_count} scholar roster")
```
Computes grade fit and relative roster popularity after filtering. These are deterministic ranking factors, not learned probabilities.

## E8 - Recommendation output and ranking
backend/scholarship_rules.py:185-205
```python
        score = grade_score + popularity_score + location_score + completeness_score
        label = _recommendation_label(score, reasons)
        recommendations.append(
            {
                "item": item,
                "score": round(score, 4),
                "label": label,
                "reasons": reasons[:4],
                "criteria": {
                    "gwa": student_gwa,
                    "minimumGwa": minimum_gwa,
                    "rosterCount": roster_count,
                    "gradeScore": round(grade_score, 2),
                    "popularityScore": round(popularity_score, 2),
                    "locationScore": round(location_score, 2),
                },
            }
        )

    recommendations.sort(key=lambda row: row["score"], reverse=True)
    return {
```
Appends rounded scores, labels and criteria then sorts descending. Page priority merging occurs later and may alter the visible order.

## E9 - Signed SOE completes workflow
supabase/migrations/20260924125213_security_history_signed_soe.sql:311-325
```sql
  completed := coalesce(tracking->'completedStepIds', '[]'::jsonb);
  if not (completed ? 'signed_soe_upload') then completed := completed || '"signed_soe_upload"'::jsonb; end if;
  if not (completed ? 'finish') then completed := completed || '"finish"'::jsonb; end if;
  tracking := tracking || jsonb_build_object('completedStepIds', completed, 'currentStepId', 'finish', 'updatedAt', now_text,
    'history', coalesce(tracking->'history', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('stepId','signed_soe_upload','label','Upload Signed SOE','completedAt',now_text,'completedBy','student','completionSource','signed_soe_submission'),
      jsonb_build_object('stepId','finish','label','Finish','completedAt',now_text,'completedBy','system','completionSource','signed_soe_submission')));
  update public.scholarship_applications set data = d || jsonb_build_object('tracking', tracking,
    'signedSoeSubmissionId', p_submission_id, 'signedSoeStatus', 'submitted', 'finishedAt', now_text, 'updatedAt', now_text), updated_at = now() where id = p_application_id;
  insert into public.signed_soe_audit_events(id, submission_id, application_id, event_type, data)
    values('signed_soe_submitted_' || p_submission_id, p_submission_id, p_application_id, 'submitted', jsonb_build_object('studentId',p_student_id,'cycle',p_cycle,'createdAt',now_text));
  insert into public.student_history_events(id, student_id, event_type, academic_cycle, occurred_at, related_type, related_id, route, description, safe_data)
    values('history_signed_soe_' || p_submission_id, p_student_id, 'signed_soe_submitted', p_cycle, now(), 'application', p_application_id,
      '/student-dashboard/scholarships', 'Signed SOE submitted. This scholarship cycle is finished.', jsonb_build_object('submissionId',p_submission_id)) on conflict(id) do nothing;
  return jsonb_build_object('submissionId', p_submission_id, 'version', next_version, 'status', 'submitted', 'finishCompleted', true);
```
The transaction adds signed_soe_upload and finish, updates the application and writes history/audit. It demonstrates why a mandatory pre-finish administrator-approval claim must be corrected.
