# Alpha Testing General Guidelines

Deadline: August 09, 2026, 11:59 PM

These guidelines must be followed by all assigned testers. Each tester should use their assigned checklist and record the results using the provided Excel Test Case Format.

## 1. Account and Password Rules

- Create and use only the assigned test account.
- Do not use your personal password.
- Password format should follow this style: `Test_YourName`
- Example: `Test_Tristan`
- If the system requires a password change, use the required format.
- Do not share your password with other testers.
- Do not use the same email or contact number as another tester.

## 2. Required Test Case File Format

Use the provided Excel `Manual Test Case Format`.

The file name must follow this format:

`Test Case #1_TesterName`

Examples:

- `Test Case #1_Veejay`
- `Test Case #1_Emmerson`
- `Test Case #1_Johnvher`

Do not rename the file randomly. The file name must clearly show the test case number and tester name.

## 3. Manual Test Case Fields to Edit

In the Excel file, update the following fields properly:

- Created by: your name
- Test Case Description: short description of what you are testing
- Tester's Name: your full name
- Test Case Result: `Pass`, `Fail`, or `Not Executed`
- Prerequisites: requirements before testing the case
- Test Data: very important; include the exact data used during testing
- Test Scenario: the scenario being tested
- Step Details: the steps you followed
- Expected Results: what should happen
- Actual Results: what actually happened
- Remarks: notes, issue summary, or reason for failure

## 4. Test Data Rules

Always write the exact test data you used.

Examples of test data:

- Student ID
- Student name
- Email
- Contact number
- Password format used
- Uploaded document name
- Grantor account used
- Announcement title used
- Scholarship/grantor applied to
- Browser used
- Device used

This is important because failed tests cannot be debugged properly if the test data is missing.

## 5. How to Mark Test Results

Use only these result values:

- Pass: the function works exactly as expected.
- Fail: the function does not work, shows an error, saves wrong data, redirects incorrectly, or breaks the design.
- Not Executed: the test was not done because the feature was blocked, unavailable, or dependent on another unfinished step.

If a test fails, do not leave the remarks blank.

## 6. When an Error Occurs

If an error happens:

1. Reload the page first.
2. Try the same step again.
3. If the error still exists, take a screenshot of the page error.
4. Open the browser console and screenshot the console error.
5. Rename the screenshot using this format:

`Test Case Scenario #Number_Error_TesterName`

Examples:

- `Test Case Scenario #1_Error_Veejay`
- `Test Case Scenario #4_Error_Emmerson`
- `Test Case Scenario #10_Error_Johnvher`

Then upload the screenshot to the provided Google Drive folder.

## 7. Google Drive Submission

A Google Drive folder will be provided.

Upload the following:

- Completed Excel test case file
- Error screenshots
- Console error screenshots
- Any supporting screenshots that help explain the issue

Make sure your files are inside the correct folder and named properly.

## 8. Browser and Device Testing

Each tester should mention what browser and device they used.

Recommended browsers:

- Google Chrome
- Microsoft Edge
- Brave
- Safari, if available

Also test mobile responsiveness using:

- Actual phone, if available
- Browser dev tools mobile mode

If a bug only happens on mobile or only on a specific browser, write that in the remarks.

## 9. Testing Behavior Rules

- Follow your assigned checklist.
- Do not skip steps unless the feature is blocked.
- Do not test using random or incomplete data.
- Do not delete or modify another tester's account.
- Do not apply to scholarships unless your checklist says to test application flow.
- Do not spam password reset or email confirmation repeatedly because email services may rate-limit requests.
- Do not ignore console errors if the page appears to work; record them if they look related to the system.

## 10. What to Check Besides Functionality

Aside from whether the function works, also check:

- Button alignment
- Page layout
- Mobile responsiveness
- Light mode and dark mode
- Correct colors and font consistency
- Dropdown design
- Error messages
- Loading behavior
- Broken images
- Broken links
- Wrong redirects, especially redirects to localhost
- Missing inbox notifications
- Wrong saved data

## 11. Screenshot Rules

Take screenshots when:

- A function fails.
- Data is saved incorrectly.
- A page layout is broken.
- A button does not work.
- A document preview fails.
- An email link redirects incorrectly.
- An inbox notification is missing.
- A console error appears.

Make sure the screenshot clearly shows the problem.

## 12. Final Submission Checklist

Before submitting, make sure:

- Your Excel file is complete.
- Every assigned test scenario has a result.
- Failed scenarios include screenshots.
- Test data is included.
- Actual results are written clearly.
- Remarks are filled when needed.
- Files are named correctly.
- Files are uploaded to Google Drive before the deadline.

## 13. Important Reminder

The goal of alpha testing is to find errors before the final defense or deployment. Report issues clearly and honestly. A failed test is useful only if the steps, data, screenshots, and actual result are complete.
