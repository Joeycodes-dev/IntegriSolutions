\# Role and Access Matrix



Review Date: 5 October 2026



\## Roles



| Role | Role ID | Intended Function |

|---|---:|---|

| Officer | 1 | Field operations and test capture |

| Supervisor | 2 | Operational supervision and review |

| Administrator | 3 | User, system and administrative management |



\## Access Matrix



| Capability | Officer | Supervisor | Administrator |

|---|---|---|---|

| Authenticate | Allow | Allow | Allow |

| View own roadblock assignment | Allow | Deny | Deny |

| Create/sync field test | Allow | Deny\* | Deny\* |

| Invalidate test | Allow | Deny\* | Deny\* |

| View invalidation history | Allow | Allow | Allow |

| View test records | Deny | Allow | Allow |

| Subscribe to test event stream | Deny | Allow | Allow |

| View case queue | Deny | Allow | Allow |

| Add case annotation/change case status | Deny | Allow | API currently allows |

| View field officers | Deny | Allow | Allow |

| Create/update field officers | Deny | Allow | Allow |

| Create roadblock shift | Deny | Allow | API currently allows |

| Update roadblock shift | Deny | Allow | API currently allows |

| View operational alerts | Deny | Allow | Allow |

| Create operational alert | Deny | Allow | Deny |

| Update operational alert | Deny | Allow | Deny |

| Attach operational-alert photo | Deny | Allow | Deny |

| Manage Supervisors | Deny | Deny | Allow |

| Manage Administrators | Deny | Deny | Allow |

| View audit/system administration | Deny | Deny | Allow |

| Issue PDF verification tokens | Deny | Conditional | Conditional |



\\\* Officer-only implementation requires developer review because several

routes rely on membership/source table `officer\\\_users` rather than also

checking the authoritative Officer role ID.



\## Positive Controls



\- Administrator management routes use `requireAdmin`.

\- Supervisor routes use authenticated server-side role resolution.

\- Operational alert write actions have an additional Supervisor-only role

&#x20; check.

\- Administrator accounts cannot deactivate or remove their own account.

\- Officer sync requires an authenticated profile associated with

&#x20; `officer\\\_users`.

\- PDF export access can be restricted or disabled through system policy.



\## Findings



\### AUTHZ-001 — Administrator Can Perform Supervisor Operational Actions



Severity: Medium



Status: Open



The shared `requireSupervisor` middleware accepts both Supervisor and

Administrator roles.



Roadblock-shift creation/update and annotation/case-status operations use

this middleware without an additional Supervisor-only check.



Therefore an authenticated Administrator can directly invoke these

operational API actions even though the application's documented role

model describes Administrator as an account/system administration and

oversight role.



Recommendation:



Developers should define the intended separation of duties explicitly.



If roadblock-shift and case-authoring operations are intended to be

Supervisor-only, enforce `ROLE\\\_SUPERVISOR` server-side on the relevant

write endpoints.



Frontend hiding alone should not be relied upon as an authorisation

control.



\### AUTHZ-002 — Officer-Only Operations Rely on Profile Table



Severity: Medium



Status: Open / Requires Developer Review



Several Officer-only operations determine Officer access using the

`officer\\\_users` profile table or the resolved profile source.



The codebase also supports legacy Supervisor records stored in

`officer\\\_users`.



This means table membership is not necessarily equivalent to possessing

the Officer role.



Affected or potentially affected operations include:



\- Test creation

\- Test synchronisation

\- Test invalidation

\- Officer roadblock-assignment retrieval



Recommendation:



Officer-only actions should verify the authoritative role explicitly,

for example by requiring `ROLE\\\_OFFICER`, in addition to locating the

Officer profile required for operational data.



Legacy Supervisor records should not be treated as Officer accounts solely

because they reside in `officer\\\_users`.



\## Overall Result



Role-based access controls are present and generally structured around

three defined roles.



However, two authorization-boundary issues were identified:



\- AUTHZ-001 — Administrator operational actions

\- AUTHZ-002 — Officer role inferred from profile-table membership



Status: Completed with findings.

