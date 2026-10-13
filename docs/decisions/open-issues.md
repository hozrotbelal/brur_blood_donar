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
