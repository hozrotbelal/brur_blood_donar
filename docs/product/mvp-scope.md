# Scope, phases and Phase 1 increments

Source: 01 BRD, Sections 4 and 13.


## Scope


### 4.1 In scope by module


| Module | In scope (business summary) | Phase |
| --- | --- | --- |
| A. Identity, profiles and consent | Registration with phone number, SMS OTP verification and password; sign-in with phone and password (SMS OTP fallback for public users; password plus OTP 2-step for staff); Forgot password, change password, lockout, security alerts, account recovery and phone number change; staff activation by invitation; login device and sign-in location capture (with consent); biometric unlock, donor profile and blood group verification status, availability, separate consents, donation history, donor card and QR, provisional next contact date, patient or representative profile and authorization | Phase 1 (certificates Phase 2) |
| B. Blood request management | Request form, drafts, documents, permitted updates, cancellation, verification before outreach, moderation of duplicates and suspicious requests, status lifecycle | Phase 1 |
| C. Automated donor search | Consent- and rule-based filtering, explainable inclusion and exclusion, Support-approved batches, donor responses, repeat-invitation prevention; location-based donor map for Support and Administrators; basic and advanced search with permissions and export control; ranked matching and automated waves later | Phase 1 (controlled); Phase 2 (ranked, automated) |
| D. Donor coordination and patient support | Coordination Case and owner, task checklist, contact attempts, time and destination, sourced outcomes, replacement search, closure and follow-up | Phase 1 |
| E. Notifications and communication | Event notifications, inbox and push, consented SMS fallback, Bangla and English templates, administrator controls, delivery records | Phase 1 |
| F. Support and moderation | Work queue, tickets, chat, callbacks, notes, transfers; moderation queue, decisions, appeals, pause outreach; advanced routing and fraud review later | Phase 1 (basic); Phase 2 (advanced) |
| G. Appointments, campaigns and community | Appointment arrangement inside a Coordination Case; campaigns, booking, QR check-in and community later | Phase 1 (case appointments); Phase 2 (rest) |
| H. Records, analytics and reports | Donor and patient timelines, complete audit logs and status history with a History timeline on every record, audit and sensitive-access reports, core reports and dashboard; forecasting and deeper analytics later | Phase 1 (core); Phase 2 (deeper) |

Donor locations are approximate by default: the app stores a donor's latest approved location twice, as an exact point that is Restricted and encrypted, and as an approximate point snapped to a fixed grid of about 1 km. Maps and lists show approximate locations only; the exact point and the donor's phone number are revealed only as described in section 6.4 and RULE-34. Role tiers (for example Support Agent and Support Lead) are permission sets inside the five roles, not additional roles.


### 4.2 Out of scope

The following are explicitly out of scope for BBDA. Items marked "superseded" were part of the earlier "Blood Bank and Response Application" concept and are no longer included.

Clinical screening of donors, blood compatibility decisions, cross-matching and release of blood for transfusion (remain with the clinical service).

Blood inventory and stock management (superseded).

Laboratory screening and test result management (superseded).

Unit recall and lookback (superseded).

Cold chain and transport tracking (superseded).

Blood issuance to hospitals or patients (superseded).

Hospital staff portal and any Blood Bank Staff or Hospital Coordinator app role (superseded).

Web admin panel; all administration is done in the mobile app (superseded; a web console is a possible future option only).

Interactive voice response (IVR) (superseded).

Loyalty points or reward schemes for donors (superseded).

National ID (NID) verification (superseded; possible future option).

Biometric check-in at the collection venue (superseded).

Volunteer and Campaign Organizer as separate roles; these tasks are performed by the Organization Administrator or by Support users with extra permission scopes.

Direct donor-to-requester contact outside the Organization's coordination.

Any donor map or donor location view for patients, representatives, donors (other than their own location) or Moderation.

Use of sign-in location for donor matching, the donor map or any purpose other than account security.

Export of donor phone numbers (the permission to export phones is granted to nobody by default).


### 4.3 Phase 1 and Phase 2


| Phase | Included | Completion target |
| --- | --- | --- |
| Phase 1 — Complete service loop | Five-role registration and login (password with SMS OTP fallback, Forgot password, account recovery, login device and location capture); role tiers and permission matrix; audit logs and status history; donor map with controlled reveal; profiles and consent; donor availability; request submission and verification; donor search and controlled invitations; support cases and chat and tickets; coordination and replacement search; notifications and administrator controls; basic moderation; donor and patient timelines; core reports | A patient can request help, Support can find and coordinate a willing donor, both sides receive accurate updates, exceptions are handled, and the case closes from mobile |
| Phase 2 — Scale and optimization | Ranked matching; automated outreach waves; advanced case routing; volunteer tasks under assigned Support permission scopes; campaigns and community; appointment booking and QR check-in; advanced fraud review; partner status integrations; forecasting; deeper analytics; advanced multilingual support and service-quality measurement | More requests can be coordinated across areas with measured response time, delivery reliability and transparent human oversight |


## 13. Implementation approach


### 13.1 Phase 1 delivery increments

Diagram D-08 — Phase 1 delivery increments (rendered in the BBDA Diagram Atlas; source in Appendix)


| Increment | Scope | Business outcome | Business acceptance |
| --- | --- | --- | --- |
| P1-I1 | Identity, roles, tiers and permission matrix, profiles, consent and request forms, including password sign-in, Forgot password, lockout, account recovery, staff activation, login device and location capture, and the audit log and status history foundation | People can join securely, set consent and submit requests, with every action recorded | Tiers and the permission matrix are enforced for all five roles; every sign-in records a login event, and sign-in location is captured only with consent; audit events and status history are written for every change in this increment; public users register with OTP and a password and sign in with password or SMS code; staff are activated by invitation and sign in with password plus OTP on a new device; Forgot password works end to end with other sessions revoked and a security alert sent; the same response is shown for an unregistered number; lockout after repeated failures can be cleared through Forgot password; account recovery is reviewed by Support with cooling-off; donors set availability and each consent separately; a representative submits a request with a document; Bangla and English work |
| P1-I2 | Support verification, donor search, donor map with reveal, and invitation responses | Verified requests reach appropriate donors under control | Support verifies or requests information; the donor map shows clusters and approximate pins with filters to Support and Administrators only; reveal of phone or exact location works only for an active assigned request, is time-limited and logged; shortlist shows inclusion and exclusion reasons; Support approves a batch; donors answer Available, Later or Unavailable; no repeat invitations |
| P1-I3 | Coordination cases, patient updates and exception handling | Willing donors are coordinated and patients see truthful progress | A case opens on the first Available with one owner; checklist tasks work; outcome sources are recorded and labelled; withdrawal and no-show reopen the search |
| P1-I4 | Notification engine, escalation rules and delivery monitoring | Reliable messages and timely escalation | NTF-EV-01 to 12 reach the right recipients; SMS fallback respects consent and limits; overdue cases escalate; delivery-failure report available to the Administrator |
| P1-I5 | Moderation, audit log viewer and export, advanced search and search-result export, permission administration and operational reports | Safe, accountable and measurable service | Moderation can pause and resume outreach and record decisions and appeals; audit viewer and History timelines work for each role's scope; audit and search-result export need step-up, reason and second approval; advanced search respects limits; sensitive grants need second approval; the sensitive access report and alert work; core reports show the four-stage distinction |
| P1-I6 | End-to-end mobile testing | Confidence to launch | Scenarios pass for withdrawal, no-show, cancellation, failed delivery, offline reconnection with "Pending sync", forgot password, lockout, account recovery, suspicious sign-in, reveal limits and denied-permission attempts; no duplicate invitations, cases or SMS under retries |


### 13.2 Phase 2 items

Phase 2 delivers the items listed in section 4.3: ranked matching and automated outreach waves; advanced case routing; volunteer tasks and campaigns under Support permission scopes; appointment booking and QR check-in; community and verified public appeals; advanced fraud review; partner status integrations; forecasting and deeper analytics; advanced multilingual support and service-quality measurement.


### 13.3 Release and pilot (recommendation)

Recommendation: after P1-I6, launch a pilot in a limited area (for example one district or a small group of hospitals and collection services) with a trained Support team and a known donor base. Use the pilot to baseline KPIs, confirm default windows and limits, test Support capacity and refine templates, then widen the area in stages. The pilot area, duration and exit criteria are decisions for the Organization (OI-11).
