\# Backend Route Protection Review



Review Date: 5 October 2026



\## Summary



Backend API routes were reviewed to determine whether sensitive

operations are protected by appropriate authentication and authorisation

middleware.



\## Public Routes



The following routes are intentionally public:



\- `/api/health`

\- `/api/public/\*`

\- `/api/auth/login`

\- `/api/auth/officer-invite`

\- `/api/auth/supervisor-invite`



Authentication endpoints are subject to API/authentication rate limiting.



\## Finding



`POST /api/auth/register` is publicly reachable and allows Administrator

registration.



This is documented separately as:



AUTH-001 — Unauthenticated Administrator Registration



Severity: Critical



\## Administrator Routes



Routes under `/api/admin/\*` use `requireAdmin`.



The middleware validates the Supabase access token and verifies the

authenticated user's Administrator role against server-side database data.



Result: Protected



\## Supervisor Routes



Routes under `/api/supervisor/\*` use `requireSupervisor`.



The middleware validates the Supabase access token and verifies that the

authenticated user is a Supervisor or Administrator.



Result: Protected



\## Authenticated Application Routes



The reviewed routes use `requireAuth` or equivalent authentication

controls:



\- `/api/profile/\*`

\- `/api/evidence/\*`

\- `/api/scan/\*`

\- `/api/shifts/\*`

\- `/api/config/\*`

\- `/api/chat/\*`

\- `/api/road-offences/\*`

\- `/api/alerts/\*`

\- `/api/geocode/\*`



Result: Protected



\## Test Routes



Read/stream operations use Supervisor-level authorisation where required.



Test creation requires authentication.



Result: Explicit authentication controls observed.



\## Invalidations



`/api/invalidations/\*` uses custom inline authentication middleware.



The middleware validates Bearer tokens with Supabase.



POST invalidation:

\- Authentication required.

\- Authenticated profile must resolve to an Officer.



GET invalidation:

\- Authentication required.



Result: Protected.



Recommendation:

Consider reusing common authentication middleware where practical to

reduce duplication and future security drift.



\## Sync



`POST /api/sync` uses custom inline authentication middleware.



The middleware validates Bearer tokens with Supabase.



The route subsequently requires:



\- Authenticated user ID.

\- Authenticated email.

\- A resolved Officer profile.



Supervisor and Administrator profiles cannot submit Officer sync records.



Result: Protected.



Recommendation:

Consider reusing common authentication middleware where practical to

reduce duplicated authentication logic.



\## Overall Result



Route protection is generally implemented consistently.



No additional unauthenticated sensitive route was identified during this

review beyond the previously documented Administrator registration issue.



Status: Completed with Finding AUTH-001 outstanding.

