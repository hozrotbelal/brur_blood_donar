# ADR-15 Staff web portal

Status: Accepted on 13 October 2026, by the project owner. Replaces ADR-09 for staff access only. Amended on 14 October 2026 (Amendment 1): donors and patients may also use the web.

Source: prototype screens for Support, Moderation and Organization Admin (BBDA-screens, 13 October 2026).

## Context

ADR-09 required all administration to happen in the mobile app. The prototype shows desktop portals for Support, Moderation and Organization Admin, with sidebars, tables, dashboards and a Bangla/English toggle. Building these only for small screens would make bulk review and configuration hard to use.

## Decision

1. **Scope.** Staff roles (Support, Moderation, Administrator) get a web portal. Donors and patients stay on the Flutter mobile app and do not sign in from a browser. The mobile app remains available to staff.
2. **Stack.** The portal is `apps/web`, built with Next.js (App Router) and TypeScript. It has Bangla and English text from the first screen. Its API client is generated from the backend OpenAPI description and lives in `packages/api-client`, which the mobile app can also use.
3. **Browser sign-in.**
   - The refresh token is stored in an httpOnly, Secure, SameSite cookie. The access token is short-lived and held in memory only.
   - Cookie-based calls are protected against CSRF.
   - CORS allows only the portal's origin.
   - The existing staff SMS second step stays.
   - A separate trusted-browser rule replaces the mobile trusted-device check. Its lifetime is open item OI-31.
   - Sensitive actions in the browser use a fresh SMS code, because biometric step-up has no browser equivalent.
4. **Permissions.** All browser actions go through the shared policy component, as on mobile. The portal adds no new permissions and no new roles.
5. **Administration controls** still require step-up, and configuration changes stay versioned and reviewable, as ADR-09 required.

## Alternatives

- Keep mobile-only administration (ADR-09). Rejected for staff because the prototype's desktop workflows do not fit small screens.
- Build staff screens in Flutter web. Not chosen: the portal needs a typed client, server-rendered pages and accessibility tooling that suit Next.js.

## Consequences

- A browser attack surface is added: cookies, CSRF, CORS and session handling must be tested.
- The browser sign-in flow changes existing auth behaviour, so it needs its own tests and security review.
- The portal needs its own QA pass and desktop layout design.
- OI-24 (certificate pinning) applies to public roles only; the portal is for staff.

## Amendment 1 (14 October 2026, approved by the project owner in chat)

This amends decision item 1 and the browser sign-in item 3 for donors and patients. The original text above is kept as the record.

1. **Scope for public users.** Donors, patients and representatives may use the mobile app and the web (the same web application used by staff, with its own screens for these roles). Donor and patient screens are shown on the web only where they match the prototype screens for those roles.
2. **Sign-in.** Public users sign in on the web with phone number and password, or with an SMS code instead, as in the mobile app. The browser flow is the one in item 3 above: httpOnly refresh cookie, CSRF token, origin allow-list.
3. **Trusted browser for public users.** The trusted-browser rule in item 3 applies to public users only as a convenience. It does not replace the SMS code for public users, who are not required to use a second step. The lifetime is open issue OI-35.
4. **Device binding.** Mobile sessions keep the device-key proof for refresh and step-up. Web sessions have no device key; the risk is recorded in OI-35 and must be decided before public users are released on the web.
5. **Unchanged.** Permissions still come from the shared policy component, no new roles are added, sign-in location is still not used for matching or maps, and donor phone numbers and exact location are still shown only through time-limited, logged reveal grants.

Implementation of Amendment 1 is tracked in `docs/backlog.md`. No code has been written for public users on the web yet.

