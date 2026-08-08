# OpenAI Help Support Chatbot TODO

Goal: add an AI-assisted help support system for students, grantors, and admins using OpenAI through the Python/FastAPI backend.

## Recommended Architecture

```txt
Frontend: React help/chat widget
Backend: FastAPI endpoint
AI Provider: OpenAI API
Knowledge Source: BulsuScholar FAQ/help guide
Database: Supabase for optional chat logs
```

Important: never call OpenAI directly from React. The OpenAI API key must stay in the backend environment variables.

## Main Purpose

The chatbot should answer system/help questions only, such as:

- How to create a student account.
- How to upload COR/Advising Slip.
- How to upload ROG.
- Why ROG is optional for first-year first-cycle students.
- How to apply for a scholarship.
- What Recommended Scholarships means.
- What Document Review means.
- How to request SOE/materials.
- Why the Apply button is disabled.
- Why an application was rejected.
- How to update profile details.
- How to use the inbox.
- How to contact the admin or grantor.

## Bot Rules

- Answer only BulsuScholar-related questions.
- Do not answer unrelated personal, academic, legal, medical, or financial questions.
- Do not expose private student, grantor, or admin data.
- Do not approve, reject, archive, or modify applications.
- Do not guess a user's application status unless the status is provided by the app.
- If unsure, tell the user to contact the scholarship office/admin.
- Keep answers short and easy to understand.

## Backend Tasks

- Add OpenAI SDK/dependency to backend.
- Add backend environment variable:

```env
OPENAI_API_KEY=your_openai_api_key
```

- Create FastAPI route:

```txt
POST /help/chat
```

- Request body should include:
  - user message
  - user role: student/grantor/admin
  - optional current page
  - optional known status/context from the app

- Response should include:
  - answer
  - fallback flag if bot is unsure
  - optional suggested next action

## Knowledge Source Tasks

- Create a help knowledge file, for example:

```txt
backend/help_knowledge.py
```

- Include FAQ content for:
  - student signup
  - COR/ROG rules
  - account confirmation
  - student dashboard
  - recommended scholarships
  - scholarship application flow
  - document review
  - SOE/material request
  - grantor roster
  - grantor announcements
  - admin student management
  - admin requirements review
  - inbox notifications

Future improvement:

- Move help articles to Supabase so admin can update answers without code changes.

## Frontend Tasks

- Create component:

```txt
src/components/HelpSupportWidget.jsx
```

- Add floating help button.
- Add chat modal.
- Add suggested questions.
- Add loading state.
- Add error state.
- Add fallback message if backend/OpenAI is unavailable.
- Add role-aware quick questions for:
  - student
  - grantor
  - admin

## Suggested UI Behavior

- Floating help icon appears on portal pages.
- Clicking opens a small chat modal.
- User can type a question.
- Bot replies with short support guidance.
- If the answer needs admin action, show: `Please contact the scholarship office/admin.`
- Chat should not block normal page use.

## Optional Supabase Chat Logs

Add table later:

```txt
support_chat_logs
```

Possible fields:

- id
- user_id
- user_role
- page
- question
- answer
- fallback_used
- created_at

Use this only if you want admin to review common issues later.

## Testing Checklist

- Student can ask signup questions.
- Student can ask COR/ROG questions.
- Student can ask scholarship application questions.
- Student can ask SOE/material request questions.
- Grantor can ask roster/import/announcement questions.
- Admin can ask management/report/requirements questions.
- Bot refuses unrelated questions.
- Bot does not expose private data.
- Bot works on mobile.
- Bot works in light and dark mode.
- No OpenAI key appears in browser console or frontend bundle.
- If OpenAI/backend fails, frontend shows a friendly support fallback.

## Capstone Explanation

Feature name:

```txt
AI-Assisted Help Support System
```

Technical approach:

```txt
OpenAI-powered role-aware support chatbot with controlled BulsuScholar FAQ context.
```

Future improvement:

```txt
Retrieval-Augmented Generation using Supabase-hosted help articles.
```
