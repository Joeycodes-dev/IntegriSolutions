\# Web Client Authentication Review



Review Date: 5 October 2026



\## Token Storage



The web application keeps the access token in JavaScript memory only.



The access token is not intentionally stored in:



\- localStorage

\- sessionStorage



A fresh page load therefore requires authentication again.



Result: Pass



\## Authenticated API Requests



Authenticated API calls use:



`Authorization: Bearer <access-token>`



The access token is obtained from the application's in-memory authentication

state.



Result: Pass



\## Role Hint Header



The web client may additionally send:



`X-Actor-Role-Id`



This value is client-controlled.



Backend privileged middleware does not rely on this header to establish

Administrator or Supervisor privileges.



This issue is documented as:



AUTH-003 — Client-Supplied Preferred Role Hint



Result: Defence-in-Depth Finding



\## SSE Authentication



The web application's SSE implementation places the access token in the URL:



`/api/tests/stream?access\_token=<token>`



This explains why Supervisor authentication middleware accepts an

`access\_token` query parameter.



URL-based bearer tokens may be exposed through logging, browser history,

proxy infrastructure, monitoring, or diagnostic systems.



This issue is documented as:



AUTH-002 — Access Token Accepted Through Query String



Result: Medium Finding



\## Developer Bypass



The login interface contains a Developer Bypass option.



The checkbox is only rendered when:



`import.meta.env.DEV`



is enabled.



When Developer Bypass is selected, the application creates a local

Supervisor profile for frontend development.



`signInLocal()` explicitly clears the access token and does not create a

Supabase session.



Therefore Developer Bypass does not provide an authenticated backend

session and cannot by itself satisfy backend bearer-token authentication.



Result: No backend authentication bypass identified.



\### Defence-in-Depth Observation



The login submit handler checks the `devMode` state but does not itself

repeat the `import.meta.env.DEV` condition.



The production interface does not expose the checkbox, and the local

sign-in path does not create a backend access token.



Recommendation:



Developers may additionally gate the bypass execution logic with the

development-build condition so that both the user interface and the

execution path explicitly require development mode.



Severity: Low



Status: Recommendation



\## Session Controls



Authentication state is cleared on sign-out.



The application also implements inactivity/session-timeout handling.



\## Overall Result



Web authentication handling generally follows appropriate security

practices.



Positive controls include:



\- Memory-only bearer-token storage.

\- Bearer-token authentication for protected API calls.

\- Backend enforcement independent from frontend state.

\- Developer bypass does not generate a backend credential.



Outstanding findings:



\- AUTH-001 — Unauthenticated Administrator Registration — Critical

\- AUTH-002 — Access Token Accepted Through Query String — Medium

\- AUTH-003 — Client-Supplied Preferred Role Hint — Low

\- Developer bypass execution hardening — Low recommendation



Status: Completed with findings.

