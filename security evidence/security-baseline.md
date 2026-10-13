\# IntegriSolutions Security Baseline



\## Review Date



5 October 2026



\## Overall Status



Security Review: In Progress



\## Components in Scope



\- Backend API

\- Web application

\- Mobile application

\- Firmware

\- Authentication and authorisation

\- Role-based access control

\- Dependency security

\- Secrets and configuration

\- Security evidence

\- Risk management



\## Current Dependency Status



\### Backend



Dependency audit completed.



Current result:



\- 0 known npm vulnerabilities after remediation.



\### Web Application



Dependency audit completed.



Current result:



\- 1 low-severity vulnerability remains.



\### Mobile Application



Dependency audit completed.



Current result:



\- 53 vulnerabilities remain.

\- 7 moderate severity.

\- 46 high severity.



Some remaining fixes require dependency upgrades that may introduce

breaking changes and therefore require further assessment.



\## Automated Test Status



\### Backend



\- Test suites: 25 passed

\- Tests: 331 passed

\- Failed tests: 0



\### Web Application



\- Test files: 27 passed

\- Tests: 227 passed

\- Failed tests: 0



\## Authentication / Authorisation



Status: Partially Reviewed



Existing automated tests provide evidence for:



\- Authentication routes

\- Security middleware

\- Token handling

\- In-memory authentication state

\- Re-authentication after page reload

\- Role information included in authenticated API requests



A formal authentication and authorisation review is still required.



\## Role / Access Matrix



Status: Not Yet Completed



A formal matrix mapping system roles to permitted resources and actions

still needs to be produced and verified against the implementation.



\## Secret and Configuration Scan



Status: Not Yet Completed



Environment and configuration files exist and require review.



The review must verify:



\- Secrets are not committed to source control.

\- Environment files are appropriately ignored.

\- Sensitive values are not exposed to frontend applications.

\- Deployment configuration does not expose credentials.



\## Risk Register



Status: Not Yet Completed



Known dependency findings and any findings from authentication,

authorisation, secret scanning, configuration review, and access-control

review will be entered into the risk register.



\## Security Evidence



Security evidence is being collected under:



`security-evidence/`



Evidence currently includes dependency audit results and automated test

results.



Additional evidence will be created during the remaining review phases.

