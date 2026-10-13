\# Secrets and Configuration Security Review



Review Date: 5 October 2026



\## Scope



The review covered:



\- Local environment files

\- Git tracking and Git history

\- Repository secret scanning

\- Backend runtime configuration

\- Web client configuration

\- Mobile application configuration

\- EAS build configuration

\- Firmware

\- Client/server secret separation

\- Breathalyzer simulation configuration



\---



\## Environment File Handling



The backend uses:



\- FRONTEND\_URL

\- PORT

\- SUPABASE\_SERVICE\_ROLE\_KEY

\- SUPABASE\_URL

\- VITE\_API\_BASE\_URL



The contents and values of the environment file were not included in

security evidence.



`backend/.env.local` is:



\- Explicitly ignored by `.gitignore`

\- Not currently tracked by Git

\- Not present in Git history



Result: Pass.



\---



\## Sensitive Credential File



The repository contains an ignore rule for:



`backend/gmp-demo-project-957048784-14f098f3587c.json`



At the time of review:



\- The file did not exist in the working tree.

\- It was not tracked by Git.

\- No Git history was found for the file.



Result: Pass.



\---



\## Git Secret History Scan



Gitleaks 8.30.1 was used to scan the repository's Git history.



Results:



\- Commits scanned: 110

\- Approximate data scanned: 7.07 MB

\- Leaks identified: 0

\- Exit code: 0



Result: Pass.



\---



\## Client/Server Secret Separation



Sensitive client-side identifier scanning covered indicators including:



\- SERVICE\_ROLE

\- PRIVATE\_KEY

\- CLIENT\_SECRET

\- SECRET\_KEY

\- DATABASE\_URL

\- DB\_PASSWORD

\- AWS\_SECRET

\- SUPABASE\_SERVICE



No matches were identified in Git-tracked Web or Mobile source.



The `SUPABASE\_SERVICE\_ROLE\_KEY` configuration name was identified only in

backend source files.



`VITE\_API\_BASE\_URL` is used by the Web client and represents public

client configuration rather than a secret.



Result: Pass.



\---



\## Backend Runtime Configuration



Exact configuration mapping identified:



\### Backend-only configuration



\- SUPABASE\_SERVICE\_ROLE\_KEY

\- SUPABASE\_URL

\- FRONTEND\_URL



The Supabase service-role credential remains confined to backend source

usage.



Result: Pass.



\---



\## Mobile Configuration



The EAS build profiles contain:



\- EXPO\_PUBLIC\_API\_BASE\_URL

\- EXPO\_PUBLIC\_BREATHALYZER\_SIMULATION



Variables prefixed with `EXPO\_PUBLIC\_` are considered client-visible and

must not contain confidential credentials.



No sensitive-looking secret, password, private-key, service-role, token,

API-key, database or Supabase configuration keys were identified in

`app.json` or `eas.json`.



Result: Pass.



\---



\## Firmware Secret Review



Firmware source was inspected for indicators including:



\- password

\- secret

\- token

\- API key

\- SSID

\- Wi-Fi credentials

\- Authorization/Bearer values

\- Supabase references

\- HTTP/HTTPS endpoints



No matching secret indicators were identified.



Result: Pass.



\---



\## CONFIG-001 — Production Breathalyzer Simulation



Severity: Informational



Status: Reviewed / Accepted Design



Production and preview mobile builds intentionally permit simulated MQ-3

operation for users or testers without access to the physical BAC device.



The review confirmed that simulation is represented explicitly as a device

transport rather than being silently treated as a physical reading.



The value `simulated` is preserved through:



\- Breathalyzer transport state

\- Active test data

\- Local test database storage

\- Synchronization payloads

\- Backend transport validation

\- Backend database storage

\- Device custody metadata

\- Test-integrity processing



The backend accepts the defined transport values:



\- ble

\- bluetooth\_classic

\- simulated



The device transport is also included in integrity-related test data.



Conclusion:



No security vulnerability was identified from the intentional simulation

feature.



Recommendation:



Continue preserving and visibly presenting the simulated transport

classification in custody records, reports and audit views so simulated

readings cannot be mistaken for physical-device measurements.



\---



\## Findings Summary



No exposed secrets or credential leaks were identified during this review.



| ID | Finding | Severity | Status |

|---|---|---|---|

| CONFIG-001 | Production Breathalyzer Simulation | Informational | Reviewed / Accepted Design |



\---



\## Overall Result



Secret-file handling: Pass



Git-history secret exposure: Pass



Client/server secret separation: Pass



Mobile secret configuration: Pass



Firmware obvious-secret scan: Pass



Configuration review: Completed

