# Open issues and decisions needed

Agents must not invent answers to these. When a document is silent on a rule, add an item here and ask a human.

## From the Business Requirements Document (Section 16)


| ID | Issue or decision needed | Notes | Decision owner | Needed by | Status |
| --- | --- | --- | --- | --- | --- |
| OI-01 | Organization name and branding | Placeholder "the Organization" used throughout | Organization leadership | P1-I1 | Open |
| OI-02 | Hosting region and data residency | Must satisfy data protection requirements | Leadership; data protection lead | P1-I1 | Open |
| OI-03 | SMS provider selection and sender registration | Bangladesh aggregator; cost and delivery service level | Administrator | P1-I4 | Open |
| OI-04 | Default response windows, escalation deadlines, contact limits, wave sizes and radius steps | Defaults in sections 9 and 10 to be confirmed | Administrator | P1-I2 | Open |
| OI-05 | Outreach group policy approval | Default is exact group as stated on the requisition; any wider mapping approved by clinical adviser | Clinical adviser | P1-I2 | Open |
| OI-06 | Verification evidence standard for requests | Which documents and checks are enough to verify | Support lead; clinical adviser | P1-I2 | Open |
| OI-07 | Rules for the provisional next contact date | Interval rules and data sources, labelled as outreach timing only | Clinical adviser | P1-I1 | Open |
| OI-08 | Data retention periods by record type | Requests, documents, messages, audit history | Leadership; data protection lead | P1-I5 | Open |
| OI-09 | Moderation policy and appeal process | Categories, actions, service levels | Moderation lead | P1-I5 | Open |
| OI-10 | Support service hours and service levels | Coverage for Critical requests out of hours | Leadership | P1-I3 | Open |
| OI-11 | Pilot area, duration and exit criteria | Recommendation in section 13.3 | Leadership | P1-I6 | Open |
| OI-12 | Whether Document-checked blood group is required for Critical outreach | Affects EX_BLOOD_GROUP_UNVERIFIED policy | Clinical adviser; Administrator | P1-I2 | Open |
| OI-13 | Confirm sign-in and recovery defaults | Minimum password length (8; staff 10), lockout (5 failures, 15 minutes), recovery cooling-off (72 hours), staff invitation expiry (72 hours), SMS code sign-in allowed for public users | Leadership; Administrator; data protection lead | P1-I1 | Open |
| OI-14 | Telephony provider for masked or proxied calling | Whether in-app calls can hide the donor number; otherwise reveal is required before calling | Administrator; vendor | P1-I2 | Open |
| OI-15 | Whether staff must share sign-in location | Default is not required; if required, staff agreement must explain it | Leadership; data protection lead | P1-I1 | Open |
| OI-16 | Reveal, search and map limits and alert threshold | Defaults: reveal 15 minutes, 30 reveals and 50 advanced searches per day, 200 results, 300 pins, minimum cluster 3, alert at 20 reveals | Administrator; data protection lead | P1-I2 | Open |
| OI-17 | Second approval when only one Administrator exists | Rules require a second Administrator when available; confirm the fallback (for example leadership sign-off recorded outside the app) | Leadership | P1-I5 | Open |


## From the System Architecture Document (Section 19.4)


| ID | Issue or decision needed | Decision owner | Needed by | Status |
| --- | --- | --- | --- | --- |
| OI-20 | Hosting region and data residency requirements | the Organization with legal adviser | End of inception | Open |
| OI-21 | Applicable data-protection and telecommunications obligations, retention periods | the Organization legal adviser | Before P1-I1 build completes | Open |
| OI-22 | Backend framework (NestJS or Spring Boot) based on delivery team | Delivery partner and the Organization | Inception | Open |
| OI-23 | Whether staff may hold Donor role on the same account | the Organization | P1-I1 | Open |
| OI-24 | Certificate pinning for public roles | Security lead | P1-I4 | Open |
| OI-25 | Masked or proxied calling through the SMS aggregator or telephony provider | the Organization and aggregator | P1-I3 | Open |
| OI-26 | Selection of SMS aggregator and sender ID registration | the Organization | P1-I1 (OTP needed) | Open |
| OI-27 | Maps provider choice (Google Maps Platform or OpenStreetMap-based) and licensing | the Organization | P1-I2 | Open |
| OI-28 | Map tile provider and whether to self-host tiles so viewports are not shared with a third party | the Organization | P1-I2 | Open |
| OI-29 | Donation record source for hospital-confirmed outcomes (HOSPITAL_CONFIRMATION). The donation_source enum has no hospital value, so the identity projector creates no donation record and does not update last_donation_date for these outcomes until decided | the Organization; data model owner | P1-I3 | Open |
| OI-30 | Default donor confirmation timeout values (crd.donor_confirm_timeout_minutes: 60, Critical 15) are used as constants in the case module until configuration is seeded under OI-04 | Administrator | P1-I3 | Open |
| OI-31 | Trusted-browser rule for the staff web portal (ADR-15): how long a browser stays trusted before a new SMS code is required, and whether sensitive actions need a fresh SMS code every time | Leadership; Administrator; security lead | Before item 2 of docs/backlog.md | Open |
| OI-32 | Approval of the data-access library proposed in ADR-16: `drizzle-orm` 0.45.4 approved by the project owner on 14 Oct 2026 and installed with scripts disabled | Project owner; security lead | Before backlog item 14 | Resolved |
| OI-33 | Rate limiting store: sign-in and OTP throttles are counted from `idn.login_event` and `idn.otp_challenge` in PostgreSQL until Redis is provisioned (architecture 13.1.3 assumes Redis); per-ASN throttles and device attestation signals are not implemented | Delivery team; security lead | P1-I4 | Open |
| OI-35 | Public users on the web (ADR-15 Amendment 1): trusted-browser lifetime for donors and patients, and how web sessions are bound to a browser since they have no device key (mobile refresh and step-up use a device key) | Leadership; security lead | Before public users are released on the web | Open |
| OI-36 | Policy scope `Area` did not include requests assigned to the staff member, while the Support queue listed them | Decided 14 Oct 2026 by the project owner: `Area` also matches resources assigned to the person (Own < Assigned < Area < All). Implemented in the shared policy component with unit and integration tests | Security lead; project owner | Before Support works across areas | Resolved |
| OI-37 | Area scope matching was exact: a district scope did not cover requests in its upazilas | Decided 14 Oct 2026 by the project owner: a scoped area covers every area below it in `cfg.area` (division, district, upazila, union). Implemented once in `staffAreaIds`, used by the queue, request detail, cases, notifications and matching | Project owner | Before real area data is loaded | Resolved |
| OI-38 | Which notification event alerts the assigned agent when a patient reports an urgent problem (FR-REQ-019, "within 60 seconds")? The SRS catalogue has no dedicated event; NTF-EV-10 (escalation) is the nearest | Priority is raised and `UrgentProblemReported` is written to the outbox; no alert is sent yet | Project owner | P1-I3 | Open |
| OI-34 | Development database: PostgreSQL 18 with PostGIS 3.6 was found on the development machine on 14 Oct 2026; `bbda_dev` was created, all 35 migrations applied and the full suite (182 tests, 76 integration) passed | Project owner | Before merging backlog item 13 | Resolved |
