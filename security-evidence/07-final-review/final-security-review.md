# Final Security Review Summary

Review Date: 5 October 2026
Project: IntegriSolutions
Review Status: Completed with Open Findings

## Executive Summary

A security review was completed across the IntegriSolutions backend,
web application, mobile application and firmware.

The review covered:

- Authentication
- Authorization
- Role-based access control
- Route protection
- Dependency security
- Secret and configuration handling
- Git secret exposure
- Firmware dependency/configuration review
- Evidence-integrity related configuration
- Security risk registration

All expected security-review evidence files were present at final review.

Deliverable completeness:

- Expected evidence files: 21
- Present: 21
- Missing: 0

## Overall Finding Summary

| Severity | Count |
|---|---:|
| Critical | 1 |
| High | 1 |
| Medium | 3 |
| Low | 2 |
| Informational | 1 |
| Total | 8 |

## Open Security Findings

### Critical

- AUTH-001 — Unauthenticated Administrator Registration

### High

- DEP-002 — Mobile Dependency Vulnerability Exposure

### Medium

- AUTH-002 — Access Token Accepted Through Query String
- AUTHZ-001 — Administrator Can Perform Supervisor Operational Actions
- AUTHZ-002 — Officer-Only Operations Rely on Profile Table Instead of Authoritative Role

### Low

- AUTH-003 — Client-Supplied Preferred Role Hint
- DEP-001 — Residual Web Dependency Vulnerability (`esbuild`)

### Informational / Accepted Design

- CONFIG-001 — Production Breathalyzer Simulation

## Authentication and Authorization

Authentication and authorization controls were reviewed across public,
authenticated, Supervisor and Admin API routes.

Key results:

- Privileged Admin and Supervisor middleware validates bearer tokens.
- Privileged role decisions are resolved from backend profile data.
- Most protected API routes have authentication controls.
- An unauthenticated Admin-registration route was identified and classified
  as Critical.
- Query-string bearer-token use was identified for the SSE stream.
- Some role boundaries require additional explicit server-side enforcement.

## Role and Access Review

The following primary roles were reviewed:

- Officer
- Supervisor
- Admin

The review identified two authorization-boundary concerns:

1. Admin users can invoke some operational Supervisor write operations
   because shared Supervisor middleware also admits Admin users.

2. Some Officer-oriented operations rely on `officer_users` profile
   membership instead of an explicit authoritative Officer-role check.

A separate role/access matrix was produced as review evidence.

## Dependency Security

### Backend

Post-remediation audit result:

- 0 known npm vulnerabilities

### Web

Post-remediation audit result:

- 1 Low vulnerability
- Affected dependency: `esbuild`

### Mobile

Post-remediation audit result:

- 53 total vulnerabilities
- 46 High
- 7 Moderate

Several direct vulnerable packages require SemVer-major upgrades.

A controlled Expo / React Native dependency-stack upgrade is recommended
instead of an uncontrolled `npm audit fix --force`.

### Firmware

No separately managed third-party package dependency tree was identified.

The firmware consists of the breathalyzer sketch and uses Arduino/platform
and standard runtime headers identified during the review.

## Secrets and Configuration

Secret/configuration review results:

- `backend/.env.local` is ignored by Git.
- `backend/.env.local` is not currently tracked.
- No Git history was found for `backend/.env.local`.
- A specifically ignored credential-style JSON file was not present,
  tracked or found in history.
- Gitleaks scanned 110 commits and reported no leaks.
- The Supabase service-role credential name was found only in backend
  source usage.
- No sensitive server-secret identifiers were identified in tracked
  Web or Mobile source.
- No obvious embedded secret indicators were identified in firmware.

## Breathalyzer Simulation

Production simulation is intentionally supported for users who do not
have access to a physical BAC device.

The review confirmed that simulated captures retain the explicit
`simulated` device-transport classification through:

- Capture
- Local storage
- Synchronization
- Backend validation
- Backend persistence
- Device custody metadata
- Test-integrity processing

This was therefore classified as an Informational accepted-design item,
with a recommendation to preserve visible simulation labelling.

## Priority Actions

Before production deployment, the highest-priority security work is:

1. Close AUTH-001 by restricting administrator provisioning.
2. Plan and execute remediation of DEP-002 through a controlled mobile
   framework/dependency upgrade.
3. Review and resolve AUTH-002, AUTHZ-001 and AUTHZ-002.
4. Resolve Low findings through normal security-hardening and dependency
   maintenance.

## Review Conclusion

The required security assessment and evidence collection have been
completed.

The system should not be considered free of security risk because several
open findings remain, including one Critical and one High finding.

The completed risk register should be used to track remediation,
ownership, status and acceptance decisions.

Final review status:

COMPLETED WITH OPEN FINDINGS
