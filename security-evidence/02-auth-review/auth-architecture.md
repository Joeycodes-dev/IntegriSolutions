\# Authentication and Authorisation Architecture



\## Authentication Provider



IntegriSolutions uses Supabase Authentication.



Users authenticate using email and password. Successful authentication

returns a Supabase session containing an access token.



\## Authentication Flow



1\. Client submits credentials to `/api/auth/login`.

2\. Backend calls `supabase.auth.signInWithPassword()`.

3\. Supabase validates the credentials.

4\. Backend resolves the application's user profile using the authenticated

&#x20;  user's email.

5\. The authenticated session is returned to the client.

6\. Protected API requests send the access token using:



&#x20;  `Authorization: Bearer <access-token>`



7\. Backend middleware validates the token using:



&#x20;  `supabase.auth.getUser(token)`



8\. Invalid or expired tokens receive HTTP 401.

9\. The verified user's ID and email are stored in the request context.



\## Application Roles



\- Officer: Role ID 1

\- Supervisor: Role ID 2

\- Admin: Role ID 3



\## General Authentication Middleware



`requireAuth` validates the bearer token and establishes the authenticated

user's identity.



The middleware also accepts an `X-Actor-Role-Id` header as a preferred

profile-role hint.



This hint does not directly grant privileged Admin or Supervisor access.



\## Administrator Authorisation



Administrator routes use `requireAdmin`.



The middleware:



1\. Validates the Supabase access token.

2\. Uses the verified authenticated email.

3\. Resolves the role from the application database using

&#x20;  `resolveRoleByEmail()`.

4\. Requires the resolved role to equal ROLE\_ADMIN.

5\. Returns HTTP 403 when the role requirement is not met.



Client-provided `X-Actor-Role-Id` values are not used by `requireAdmin`.



\## Supervisor Authorisation



Supervisor routes use `requireSupervisor`.



The middleware:



1\. Validates the Supabase access token.

2\. Uses the verified authenticated email.

3\. Resolves the role from the application database.

4\. Allows Supervisor and Admin roles.

5\. Returns HTTP 403 for other roles.



Client-provided `X-Actor-Role-Id` values are not used for this privileged

role decision.



\## Profile Resolution



`resolveProfileByEmail()` can accept a preferred role ID and attempts to

resolve the authenticated email against the requested role table first.



If that lookup fails, profile resolution falls back to:



1\. Admin

2\. Officer

3\. Supervisor



The preferred role is therefore a profile-selection hint rather than proof

of authorisation.



\## Identified Security Findings



\### AUTH-001 — Unauthenticated Administrator Registration



Severity: Critical



`POST /api/auth/register` is mounted under the publicly accessible

authentication router.



The endpoint permits registration when `roleId` is the Administrator role

and uses the privileged Supabase service client to create the account.



An unauthenticated caller may therefore be able to create an Administrator

account.



Status: Open



Required remediation:



Administrator creation must require existing Administrator authorisation or

use a tightly controlled one-time bootstrap mechanism.



\### AUTH-002 — Access Token Accepted in Query String



Severity: Medium



`requireSupervisor` accepts an access token from the `access\_token` query

parameter when an Authorization header is unavailable.



Tokens in URLs may be exposed through browser history, application logs,

proxy logs, monitoring systems, or other URL-recording infrastructure.



Status: Open / Requires Review



\### AUTH-003 — Client-Supplied Preferred Role Hint



Severity: Low / Defence-in-Depth



`X-Actor-Role-Id` is supplied by the client and influences profile-selection

order in some authenticated non-privileged routes.



Privileged Admin and Supervisor middleware independently resolves roles from

the database and does not trust this value for access control.



The hint should nevertheless be removed or further constrained if it is not

required by the application design.



\## Review Status



Authentication architecture review completed.



Critical authentication findings require remediation before the overall

security review can be closed.

