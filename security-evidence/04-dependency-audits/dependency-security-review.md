\# Dependency Security Review



Review Date: 5 October 2026



\## Scope



Dependency-security evidence was reviewed for:



\- Backend

\- Web application

\- Mobile application

\- Firmware



Existing npm audit JSON reports were preserved under this evidence folder.



\## Summary



| Component | Result |

|---|---|

| Backend | 0 vulnerabilities |

| Web | 1 Low |

| Mobile | 53 vulnerabilities: 7 Moderate, 46 High |

| Firmware | No package-manager dependency tree identified |



\---



\## Backend



Post-remediation npm audit result:



\- Low: 0

\- Moderate: 0

\- High: 0

\- Critical: 0

\- Total: 0



Result: Pass at time of review.



\---



\## Web



Post-remediation npm audit result:



\- Low: 1

\- Moderate: 0

\- High: 0

\- Critical: 0

\- Total: 1



Remaining vulnerable package:



\- esbuild

\- Severity: Low

\- Direct dependency: No

\- Fix available: Yes



\### DEP-001 — Residual Web Dependency Vulnerability



Severity: Low



Status: Open



Recommendation:



Upgrade the affected dependency through the normal dependency-management

process and rerun the web test suite and npm audit.



\---



\## Mobile



Post-remediation npm audit result:



\- Low: 0

\- Moderate: 7

\- High: 46

\- Critical: 0

\- Total: 53



\### Direct Vulnerable Dependencies



High:



\- @types/jest

\- expo

\- jest

\- jest-expo

\- react-native



Moderate:



\- expo-asset

\- expo-constants



\### Dependency Distribution



\- Direct High: 5

\- Direct Moderate: 2

\- Transitive High: 41

\- Transitive Moderate: 5



Key underlying vulnerable packages include:



\- braces

\- image-size

\- node-forge

\- postcss

\- uuid



Some reported vulnerabilities belong to test/build/tooling dependency

chains such as Jest and Metro, so the raw vulnerability count does not

necessarily represent 53 independently exploitable production weaknesses.



However, vulnerable direct dependencies also include Expo and React Native,

which form part of the mobile application's core framework/toolchain.



\### DEP-002 — Mobile Dependency Vulnerability Exposure



Severity: High



Status: Open



npm reports fixes for the vulnerable direct dependencies, but the proposed

changes are SemVer-major upgrades.



Recommendation:



Developers should perform a planned and tested Expo/React Native dependency

upgrade rather than using an uncontrolled forced audit fix.



Following the upgrade, developers should:



\- Rerun npm audit.

\- Run the full mobile automated test suite.

\- Validate application builds.

\- Validate authentication.

\- Validate test synchronization.

\- Validate device/Bluetooth integration.

\- Confirm framework and Expo package compatibility.



`npm audit fix --force` should not be used without compatibility and

regression assessment.



\---



\## Firmware



Firmware structure reviewed:



`firmware/breathalyzer/breathalyzer.ino`



Observed includes:



\- `SoftwareSerial.h`

\- `stdio.h`

\- `stdlib.h`



No dependency manifest was identified for:



\- npm

\- Python

\- PlatformIO

\- Cargo

\- ESP-IDF



\### DEP-003 — Firmware Dependency Inventory



Severity: Informational



Status: Reviewed



No separately managed third-party dependency tree was identified.



An automated package-manager vulnerability scan is therefore not applicable

to the firmware in its current structure.



Firmware source, configuration and possible embedded credentials remain in

scope for the secrets/configuration review.



\---



\## Overall Result



Backend dependency state is clean at the time of review.



The Web application retains one Low vulnerability.



The Mobile application retains substantial dependency risk requiring a

controlled framework/toolchain upgrade.



Firmware has no identified external package-manager dependency tree.



Findings:



\- DEP-001 — Residual Web Dependency Vulnerability — Low

\- DEP-002 — Mobile Dependency Vulnerability Exposure — High

\- DEP-003 — Firmware Dependency Inventory — Informational



Status: Completed with findings.

