# Actual Scholarship Recommendation Algorithm

Source snapshot: 2026-10-25T14:23:04+08:00

## A. Actual Source Code

### Snippet 1 - Scholarship Eligibility Filtering

- Source file: `backend/scholarship_rules.py`
- Function name: `recommend_scholarships`
- Original line numbers: 146-157
- Exact code snippet (original indentation retained):

Original lines 146-157:

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

This is one continuous extract. Input preparation on lines 137-145 and the following scoring and result construction are outside this extract.

### Snippet 2 - Weighted Recommendation Scoring

- Source file: `backend/scholarship_rules.py`
- Function name: `recommend_scholarships`
- Original line numbers: 160-161; 167-169; 173; 181-185
- Exact code snippet (original indentation retained):

Original lines 160-161:

```python
        grade_margin = max(0.0, minimum_gwa - student_gwa)
        grade_score = min(40.0, 24.0 + (grade_margin * 12.0))
```

**Original source lines 162-166 omitted (reason-label handling). This annotation is not source code.**

Original lines 167-169:

```python
        roster_count = _to_int(item.get("rosterCount"))
        popularity_weight = 30.0 if is_high_grade_student else 22.0
        popularity_score = (roster_count / max_roster * popularity_weight) if max_roster > 0 else 0.0
```

**Original source lines 170-172 omitted (reason-label handling). This annotation is not source code.**

Original lines 173-173:

```python
        location_score = _location_score(student, item)
```

**Original source lines 174-180 omitted (reason-label handling). This annotation is not source code.**

Original lines 181-185:

```python
        completeness_score = 8.0
        if item.get("profileImageUrl") or item.get("authorImageUrl") or item.get("imageUrl"):
            completeness_score += 2.0

        score = grade_score + popularity_score + location_score + completeness_score
```

Four separate original ranges are shown. Lines 162-166, 170-172 and 174-180 are omitted and explicitly marked; no replacement code or pseudocode is inserted.

### Snippet 3 - Scholarship Ranking

- Source file: `backend/scholarship_rules.py`
- Function name: `recommend_scholarships`
- Original line numbers: 187-204
- Exact code snippet (original indentation retained):

Original lines 187-204:

```python
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
```

This is one continuous extract. Earlier score calculation and the later API response wrapper are outside this extract.

## B. Short Technical Explanation

### Snippet 1 - Scholarship Eligibility Filtering

This loop skips scholarships when applications are blocked, when the enabled/open flags fail the shown condition, or when the student's GWA is missing or exceeds the required minimum. A missing scholarship GWA requirement is resolved using the provider policy; these are recommendation-stage filters, not the complete application-approval checks.

### Snippet 2 - Weighted Recommendation Scoring

The code adds GWA fit, roster popularity, location fit and a fixed completeness component with an image bonus to obtain one ranking score. The location calculation is delegated to _location_score; the high-grade flag and maximum roster denominator are prepared earlier on lines 141-143 and are explained in Section C.

### Snippet 3 - Scholarship Ranking

Each eligible scholarship is stored with its score rounded to four decimal places and with explanatory metadata. The final sort places higher stored scores first; equal stored scores retain their incoming order because Python's list sort is stable.

## C. Algorithm Verification

### Mandatory recommendation-stage conditions

- **Applications blocked:** Exclude when applicationsBlocked is exactly True. (`backend/scholarship_rules.py:147-148`)
- **Enabled/open condition:** Exclude when applicationEnabled is exactly False AND applyOpen is not exactly True. applyOpen=True overrides that particular disabled test; applyOpen=False alone is not tested here. (`backend/scholarship_rules.py:149-150`)
- **Student GWA:** The parsed student GWA must not be None and must be <= minimum_gwa. Lower numeric GWA is treated as better. This function does not check uploaded documents. (`backend/scholarship_rules.py:141, 156-157`)
- **Scholarship GWA:** Read minimumGwa, minGwa or minimumGrade. If conversion fails or no value is available, use the provider policy; its final default is 2.25. (`backend/scholarship_rules.py:152-155`)

### Scoring factors and exact formulas

- **GWA fit:** margin = max(0, minimum_gwa - student_gwa); grade_score = min(40, 24 + margin * 12). 24 to 40 for eligible ordinary inputs. (`backend/scholarship_rules.py:160-161`)
- **Roster popularity:** popularity_score = roster_count / max_roster * popularity_weight when max_roster > 0; otherwise 0. 22-point weight; 30 if student GWA <= 1.75. (`backend/scholarship_rules.py:142-143, 167-169`)
- **Location fit:** location_score = _location_score(student, item). Up to 25; exact rules below. (`backend/scholarship_rules.py:173, 239-262`)
- **Completeness/image:** completeness_score = 8; add 2 when profileImageUrl, authorImageUrl or imageUrl is truthy. 8 base; 10 with an image. (`backend/scholarship_rules.py:181-183`)
- **Total:** score = grade_score + popularity_score + location_score + completeness_score. Additive raw ranking score, not a percentage. (`backend/scholarship_rules.py:185`)

### Location helper

- **No location data anywhere:** Return 8 only if all six normalized student/grantor province, city and barangay values are empty. (`backend/scholarship_rules.py:240-248`)
- **Province component:** Same nonempty province: +10. Otherwise, student Pampanga and grantor Bulacan: +4. Otherwise, any nonempty grantor province: +2. Only one province branch applies. (`backend/scholarship_rules.py:250-256`)
- **City component:** Same nonempty city: +10. This comparison is independent of the province branch. (`backend/scholarship_rules.py:258-259`)
- **Barangay component:** Same nonempty barangay: +5. This is a ranking bonus, not a barangay-based location-scope permission check. (`backend/scholarship_rules.py:260-261`)
- **Cap/normalization:** Return min(score, 25). Normalization lowercases and replaces non-ASCII-letter/digit runs with spaces, then trims; it is not a distance calculation or a Baliwag/Baliuag alias resolver. (`backend/scholarship_rules.py:234-236, 262`)

### Sorting, model and score interpretation

The backend rounds each stored score to four decimal places, sorts descending on that stored score, and preserves input order for ties. The implementation uses predefined eligibility rules and deterministic weighted scoring, not a trained model or explicit decision-tree structure. The raw factor budgets reach 97 or 105 points under ordinary nonnegative roster inputs, not a normalized probability or acceptance percentage; the >=78 label threshold is descriptive, not an approval rule.

Provider-policy defaults: Tina Pancho 2.00; Morisson/Morrison 2.25; Kuya Win 1.75; Other 2.25. The caller's explicit minimum GWA takes precedence. References: backend/scholarship_rules.py:6-11; backend/scholarship_rules.py:15-28.

- Candidate preparation is separate from numeric scoring. The loader excludes archived/inactive/disabled grantor accounts and uses actual open, non-hidden, non-archived scholarship announcements. It requires a grantor ID, applicationEnabled and applicationsBlocked != true before sending candidates to the backend. src/services/recommendedScholarshipService.js:195; src/services/recommendedScholarshipService.js:147-176, 223-276.
- The authenticated recommendation endpoint replaces the submitted student object with the signed-in student's stored row, then calls the scoring function. The candidate list still comes from the caller; a ranking response is not final application authorization. backend/main.py:797; src/services/workflowService.js:100.
- The recommendation function itself does not enforce COR/ROG/profile approval, account activation, income, course, year level, available slots, age, scholarship commitment or the grantor's permitted province-municipality pairs. Do not describe these as weighted inputs or mandatory checks inside this function. Application submission has a separate reservation workflow. backend/scholarship_rules.py:137-216; backend/workflow_service.py:476; backend/scholarship_choice_service.py:72.
- The roster-popularity denominator is computed across all supplied candidates before per-candidate filtering. Even a candidate later excluded can influence that denominator. The loader's rosterCount counts non-archived scholar rows per grantor; it is not a measured acceptance rate, number of clicks or number of applications. backend/scholarship_rules.py:141-143; src/services/recommendedScholarshipService.js:207-213.
- The field called profileCompleteness is actually a constant eight-point component plus a two-point image-presence bonus. It is not a student-profile completeness percentage and does not score income, course, year, achievements or document completeness. backend/scholarship_rules.py:181-183, 213.
- On backend_unavailable or request_timeout, the browser uses a local weighted-scoring fallback and marks the response degraded. It does not fall back for every API error. The local fallback defaults a missing minimum GWA to 2.25, whereas the backend can select a provider-specific policy; do not claim the paths are identical for every possible input. src/services/recommendedScholarshipService.js:76; src/services/recommendedScholarshipService.js:285.
- The student display is not necessarily a pure score-sorted list. It deduplicates by scholarship and merges invitations/reapplication items (priority 1), admin recommendations (priority 2) and algorithm results (priority 3, or 2 when matched-grantor context exists), then sorts by priority before score. With SCHOLARSHIP_CHOICE_ENABLED=true, getGrantorApplicationBlock can hide committed, same-grantor-active or cooldown-blocked options; multiple-scholarship conflicts hide the list. The older allowed-grantor restriction in this page is conditional on that feature being false. src/pages/StudentRecommendedScholarshipsPage.jsx:150; src/pages/StudentRecommendedScholarshipsPage.jsx:217; src/services/scholarshipChoiceService.js:3; src/services/scholarshipChoiceService.js:70.

## D. Screenshot Recommendation

Use the three PNGs. They contain 12, 11 and 18 original code lines; the second also shows three omission bands. Keep the line gutter and omission annotations visible. These are excerpts from a larger function, not standalone programs.

- `Figure_1_Scholarship_Eligibility_Filtering.png`: Figure 3.X. Recommendation-stage filtering using application availability and minimum-GWA conditions.
- `Figure_2_Weighted_Recommendation_Scoring.png`: Figure 3.Y. Weighted recommendation-score calculation using GWA fit, roster popularity, location fit and image availability.
- `Figure_3_Scholarship_Ranking.png`: Figure 3.Z. Construction of recommendation results and descending ranking by the computed score.

Replace X/Y/Z with your actual Chapter III figure numbering. Use a full-width landscape figure page if needed to keep long original lines readable; do not shrink all three images onto one page. Do not describe these figures as Decision Tree training, prediction accuracy or automatic award approval.

## Source Verification

Exact block text, reviewed file hashes and function boundaries are in Source_Extraction_Manifest.json. No project source, manuscript, existing guide, database, configuration or environment file was modified. Only the requested artifacts in ThesisPapers/Figures were generated.
