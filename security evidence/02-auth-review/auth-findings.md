\# Authentication \& Authorisation Security Findings



Review Date: 5 October 2026



\## AUTH-001 — Unauthenticated Administrator Registration



Severity: Critical



Status: Open



Component:

`backend/src/routes/auth.ts`



Affected endpoint:

`POST /api/auth/register`



\### Finding



The `/api/auth` router is publicly accessible and protected by rate

limiting, but not by authentication or administrator authorisation.



The `/register` endpoint permits account registration when the requested

role is `ROLE\_ADMIN`.



The endpoint uses the privileged Supabase service client to create the

authentication account and subsequently creates an entry in the

`admin\_users` table.



\### Security Impact



An unauthenticated caller may be able to create an Administrator account.



Successful exploitation could result in complete privilege escalation and

access to Administrator functionality.



\### Recommendation



Administrator creation should require authentication and Administrator

authorisation.



If the system requires creation of an initial Administrator account,

implement a tightly controlled bootstrap process instead of keeping public

Administrator registration available.



Examples include:



\- One-time deployment bootstrap.

\- Administrator invitation workflow.

\- Manually provisioned initial Administrator.

\- Single-use bootstrap token stored securely outside source control.



The public `/login`, Officer invitation, and Supervisor invitation flows

should remain separate from Administrator provisioning.



\---



\## AUTH-002 — Access Token Accepted Through Query String



Severity: Medium



Status: Open / Requires Developer Review



Component:

`backend/src/middleware/requireSupervisor.ts`



\### Finding



Supervisor authentication accepts an access token from either:



`Authorization: Bearer <token>`



or:



`?access\_token=<token>`



\### Security Impact



Access tokens placed in URLs may be exposed through systems that record

URLs, including:



\- Application or infrastructure logs.

\- Proxy logs.

\- Monitoring systems.

\- Browser history.

\- Diagnostic tooling.



This increases the possibility of token disclosure.



\### Recommendation



Prefer the standard HTTP Authorization header for access tokens.



If query-string authentication is required for a specific feature such as

an EventSource/SSE connection, developers should assess safer alternatives

or ensure that the token is short-lived, narrowly scoped, protected from

logging, and removed from URLs as quickly as possible.



\---



\## AUTH-003 — Client-Supplied Preferred Role Hint



Severity: Low



Status: Open / Defence-in-Depth



Components:



\- `backend/src/middleware/auth.ts`

\- `backend/src/utilities/resolveProfile.ts`



\### Finding



Authenticated clients may send:



`X-Actor-Role-Id`



The supplied value is stored as `preferredRoleId` and can influence which

application role table is checked first when resolving the user's profile.



\### Existing Control



The value does not directly grant Administrator or Supervisor privileges.



Privileged middleware independently:



1\. Validates the Supabase access token.

2\. Retrieves the verified user's email.

3\. Resolves the user's role from the application database.

4\. Checks that database-derived role against the required privileged role.



Therefore, the role hint is not currently relied upon by the reviewed

Administrator and Supervisor middleware for privileged authorisation.



\### Security Impact



Risk is limited under the current implementation.



However, allowing clients to influence role/profile selection increases

complexity and could become security-sensitive if future code begins

trusting the value for access-control decisions.



\### Recommendation



Developers should determine whether `X-Actor-Role-Id` is necessary.



If retained:



\- Treat it only as an untrusted hint.

\- Never use it as proof of authorisation.

\- Continue resolving authoritative permissions from trusted server-side

&#x20; data.

\- Add automated tests proving that changing the header cannot elevate

&#x20; privileges.



If it is unnecessary, remove it to simplify the authorisation model.



\---



\# Positive Security Controls Observed



The review identified the following existing controls:



\- Bearer access tokens are validated using Supabase.

\- Invalid and expired access tokens receive HTTP 401.

\- Administrator authorisation is derived from the authenticated user's

&#x20; database role.

\- Supervisor authorisation is derived from the authenticated user's

&#x20; database role.

\- Officers cannot directly self-register through the reviewed registration

&#x20; route.

\- Supervisors cannot directly self-register through the reviewed

&#x20; registration route.

\- Officer and Supervisor invitation tokens are stored and compared using

&#x20; hashes.

\- Invitation expiry is checked.

\- Previously accepted invitations are rejected.

\- Application roles are explicitly defined as Officer, Supervisor and

&#x20; Administrator.



\# Overall Authentication Review Status



Status: Findings Identified



The core token-validation and privileged role-check mechanisms are present.



One Critical finding requires developer remediation before the overall

security review should be considered closed:



`AUTH-001 — Unauthenticated Administrator Registration`

