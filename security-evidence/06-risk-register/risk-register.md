# Security Risk Register

Review Date: 5 October 2026
Project: IntegriSolutions

## Risk Rating Approach

Likelihood:
- Low — difficult or unlikely to occur
- Medium — realistically possible
- High — likely or straightforward under expected conditions

Impact:
- Low — limited security or operational effect
- Medium — meaningful integrity, confidentiality, or authorization impact
- High — major system/security impact
- Critical — could enable privileged compromise or severe system-wide impact

Risk severity considers both exploitability and impact.

## Risk Register

| ID | Finding | Area | Likelihood | Impact | Severity | Status | Treatment |
|---|---|---|---|---|---|---|---|
| AUTH-001 | Unauthenticated Administrator Registration | Authentication | High | Critical | Critical | Open | Restrict administrator creation to an authenticated Admin, controlled invitation, or secure bootstrap process |
| AUTH-002 | Access Token Accepted Through Query String | Authentication | Medium | Medium | Medium | Open / Developer Review | Avoid bearer tokens in URLs; use header-based or short-lived stream authentication where possible |
| AUTH-003 | Client-Supplied Preferred Role Hint | Authentication | Low | Low | Low | Open / Defence-in-Depth | Treat the role header strictly as an untrusted hint or remove it if unnecessary |
| AUTHZ-001 | Administrator Can Perform Supervisor Operational Actions | Authorization | Medium | Medium | Medium | Open | Enforce Supervisor-only authorization on operational write endpoints if separation of duties is intended |
| AUTHZ-002 | Officer-Only Operations Rely on Profile Table Instead of Authoritative Role | Authorization | Medium | Medium | Medium | Open / Developer Review | Require authoritative Officer role checks in addition to officer profile lookup |
| DEP-001 | Residual Web Dependency Vulnerability (`esbuild`) | Dependencies | Low | Low | Low | Open | Upgrade through normal dependency maintenance and rerun audit/tests |
| DEP-002 | Mobile Dependency Vulnerability Exposure | Dependencies | High | High | High | Open | Perform a controlled Expo/React Native dependency-stack upgrade and regression testing |
| CONFIG-001 | Production Breathalyzer Simulation | Configuration / Evidence Integrity | Low | Low | Informational | Reviewed / Accepted Design | Continue preserving and visibly identifying simulated-device evidence throughout custody, reporting and audit workflows |

---

## AUTH-001 — Unauthenticated Administrator Registration

**Severity:** Critical  
**Status:** Open

The administrator registration endpoint permits creation of an Admin account
without requiring an already authenticated administrator.

### Risk

An unauthenticated caller could potentially create a privileged Admin account,
resulting in administrative compromise.

### Recommended Treatment

Replace public administrator registration with one of:

- Authenticated Admin-only provisioning
- Controlled administrator invitation
- One-time secured bootstrap
- Manual administrative provisioning

### Priority

Immediate / before production deployment.

---

## AUTH-002 — Access Token Accepted Through Query String

**Severity:** Medium  
**Status:** Open / Developer Review

The Supervisor authentication path supports an `access_token` query parameter,
and the Web SSE implementation uses the token in the stream URL.

### Risk

Tokens placed in URLs may be exposed through URL logging, diagnostics,
browser history, monitoring systems, or intermediary infrastructure.

### Recommended Treatment

Prefer Authorization headers where technically possible.

Where streaming technology requires URL-based authentication:

- Use short-lived tokens
- Narrow token scope
- Avoid logging full URLs containing credentials
- Consider a dedicated stream-authentication mechanism

---

## AUTH-003 — Client-Supplied Preferred Role Hint

**Severity:** Low  
**Status:** Open / Defence-in-Depth

The client may provide `X-Actor-Role-Id` as a preferred role hint.

Privileged Admin and Supervisor middleware independently resolves authoritative
role information from backend data, so no direct privilege escalation was
identified from this behavior.

### Recommended Treatment

Remove the hint if it is unnecessary, or continue treating it solely as
untrusted client input.

Maintain tests proving that changing the supplied role hint cannot elevate
privileges.

---

## AUTHZ-001 — Administrator Can Perform Supervisor Operational Actions

**Severity:** Medium  
**Status:** Open

The shared Supervisor middleware permits both Supervisor and Admin roles.

Some operational write routes, including roadblock shift management and case
annotation/state changes, rely only on this middleware.

Other routes explicitly restrict operational writes to the Supervisor role,
indicating an intended separation between system administration and field
command responsibilities.

### Risk

An Admin can directly invoke operational Supervisor actions through the API
even where the intended responsibility model appears to reserve such actions
for Supervisors.

### Recommended Treatment

Define the intended Admin/Supervisor policy explicitly.

If operational authoring is Supervisor-only, enforce the Supervisor role on
all relevant write endpoints instead of relying on UI restrictions.

---

## AUTHZ-002 — Officer-Only Operations Rely on Profile Table

**Severity:** Medium  
**Status:** Open / Developer Review

Several Officer-oriented operations establish authorization using membership
or resolution against `officer_users` rather than explicitly requiring the
Officer role.

The application also contains compatibility handling for legacy Supervisor
records stored in `officer_users`.

### Risk

A legacy or otherwise matching `officer_users` profile may potentially receive
Officer-only capabilities even when its authoritative role is not Officer.

Potentially affected functionality includes:

- Field test creation
- Synchronization
- Test invalidation
- Active roadblock assignment access

### Recommended Treatment

Require the authoritative Officer role in addition to any Officer profile
lookup.

Review legacy Supervisor records to ensure they cannot inherit Officer-only
privileges.

---

## DEP-001 — Residual Web Dependency Vulnerability

**Severity:** Low  
**Status:** Open

The Web dependency audit contains one remaining Low vulnerability involving
the transitive `esbuild` dependency.

npm reports that a fix is available.

### Recommended Treatment

Upgrade through the normal dependency-maintenance process and rerun:

- npm audit
- Web automated tests
- Build validation

---

## DEP-002 — Mobile Dependency Vulnerability Exposure

**Severity:** High  
**Status:** Open

The Mobile dependency audit contains:

- 46 High vulnerabilities
- 7 Moderate vulnerabilities
- 53 total vulnerabilities

Direct vulnerable dependencies include:

- @types/jest
- expo
- jest
- jest-expo
- react-native
- expo-asset
- expo-constants

Most proposed fixes require SemVer-major dependency changes.

### Risk

The mobile framework and tooling stack contains known vulnerable packages.
Some vulnerabilities are associated with testing/build tooling, but vulnerable
direct dependencies also include core Expo and React Native packages.

### Recommended Treatment

Perform a planned Expo/React Native dependency-stack upgrade.

Do not apply an uncontrolled `npm audit fix --force`.

After upgrading:

- Rerun npm audit
- Run the complete mobile test suite
- Validate Android/iOS builds
- Validate authentication and synchronization
- Validate BAC-device/Bluetooth functionality
- Confirm Expo package compatibility

---

## CONFIG-001 — Production Breathalyzer Simulation

**Severity:** Informational  
**Status:** Reviewed / Accepted Design

Production builds intentionally support simulated MQ-3 operation for users who
do not have access to the physical BAC device.

The review confirmed that simulated readings retain explicit device-transport
metadata through:

- Capture
- Local storage
- Synchronization
- Backend validation
- Backend persistence
- Device custody metadata
- Test-integrity processing

The explicit transport value `simulated` is retained.

### Security Control

Continue visibly identifying simulated readings in custody records, reports,
audit views and other evidence displays so they cannot be mistaken for
physical-device measurements.

---

## Priority Summary

### Immediate

- AUTH-001 — Unauthenticated Administrator Registration
- DEP-002 — Mobile Dependency Vulnerability Exposure

### High Priority Review

- AUTH-002 — Query-string access token
- AUTHZ-001 — Admin operational permissions
- AUTHZ-002 — Officer authorization based on profile-table membership

### Maintenance / Defence-in-Depth

- AUTH-003 — Client role hint
- DEP-001 — Web `esbuild` vulnerability

### Accepted / Informational

- CONFIG-001 — Production breathalyzer simulation
