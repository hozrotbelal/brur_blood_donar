# Donor profile and consent: assumptions to confirm

- **Next contact interval is 120 days** (`NEXT_CONTACT_INTERVAL_DAYS` in `donor.service.ts`), the default of the `donor.provisional_interval_days` setting in the SRS. It should read that setting once settings are loaded from the database.
- The donor profile is created the first time the donor saves it (`PUT /profiles/donor`), not at sign-up. Availability defaults to 08:00 to 21:00, every day, routine and urgent both off until the donor opts in.
- A blood group that staff have verified cannot be changed by the donor (`BLOOD_GROUP_LOCKED`).
- A location needs an active `LOCATION_USE` consent. A new proposal replaces any older Pending one; confirming it replaces the Approved one. Only the approximate grid point is ever returned. The exact point stays in the table.
- "Inside Bangladesh" is a bounding box (lat 20.5 to 26.7, lon 88.0 to 92.7), not the real border.
- Withdrawing `LOCATION_USE` sets the profile location back to the area centre (or none). Old location rows are kept.
- `TERMS` and `PRIVACY` consent cannot be withdrawn through the API. The two consent types with text in brackets (login location, call channel) are not exposed yet.
- Notification preferences use the `account.edit` permission, because the catalogue has no key for them.
- `area_id` is not worked out from the location yet, because no area boundaries are seeded.
- Migration `0026` adds `snap_to_grid`, and a unique index on notification preference (user, category).
