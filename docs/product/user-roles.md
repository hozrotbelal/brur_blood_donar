# User roles

Source: 01 BRD, Section 6.


## 6.1 Role hierarchy and tiers

The five roles are unchanged. Inside each staff role the Organization Administrator assigns a tier, which is a named permission set. Access follows least privilege: a higher level does not automatically inherit every permission of a lower one.


| Level | Role | Tiers (permission sets) | Notes |
| --- | --- | --- | --- |
| Level 4 | Organization Administrator (ADM) | Administrator; Primary Administrator | The Primary Administrator is the account owner and the only one who can grant administrator rights |
| Level 3 | Support (SUP) | Support Agent; Support Lead | Peer team to Moderation, reporting to the Administrator |
| Level 3 | Moderation (MOD) | Moderator; Moderation Lead | Peer team to Support, reporting to the Administrator |
| Level 1 | Donor (DON); Patient or Patient Representative (PAT) | None | Public users; peers |
| System | Automation actor | None | Acts only through defined, audited rules |

Rules for tiers and grants: nobody can grant a permission they do not hold; nobody can change their own permissions or tier; granting a sensitive permission (phone reveal outside assignment, advanced search, export, audit export, security history) needs a second Administrator's approval when more than one Administrator exists; every grant and revoke is audited and can be time-limited.


## 6.2 Role-based module access


| Module | Donor | Patient or Representative | Support | Moderation | Administrator |
| --- | --- | --- | --- | --- | --- |
| Account and profile | Own profile, consent, availability | Own profile and patient relationship | Limited case contact details | Flagged account review | Role and account management |
| Blood requests | View invitations | Create and manage own requests | Verify and coordinate cases | Review suspicious requests | Oversee all organization cases |
| Donor search | Respond or withdraw | View search progress | Review matches and contact donors | Pause fraudulent outreach | Set search and outreach rules |
| Appointments | Confirm, reschedule, get directions | View coordination milestones | Arrange and monitor attendance | None | Oversee delayed cases |
| Support | Ask for help | Chat, request callback, raise issue | Own tickets and conversations | Handle abuse reports | Manage service levels and escalations |
| Notifications | Invitations and reminders | Request and support updates | Work queue and case alerts | Review alerts | Templates, rules and delivery monitoring |
| Community | Post and interact | Post verified appeals | Help route genuine appeals | Moderate content | Configure community rules |
| Reports | Own donation history | Own request history | Case workload and outcomes | Fraud and moderation trends | Organization-wide analysis |

A person may hold the Donor and Patient or Representative roles on one account and switch between them. Donors and patients or representatives register themselves (phone number verified by SMS OTP, then a password) and sign in with phone number and password, or with an SMS code instead. Staff roles (Support, Moderation, Organization Administrator) cannot self-register: the Organization Administrator invites each staff member by phone number and role, and staff sign in with password plus SMS OTP (2-step) on a new device and at least every 30 days per device, with device binding and a recommended biometric or PIN step-up for sensitive actions. Every role has Profile, Security with change password, change phone number, login activity and signed-in devices, and can use Forgot password and account recovery.
