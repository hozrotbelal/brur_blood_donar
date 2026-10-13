# Module brief: Appointments and Campaigns (APT)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.10 Appointments & Campaigns (APT)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Areas and facilities (hospital, collection service, campaign site); appointment slots where scheduling information exists; campaigns and follows; directions deep links; QR check-in where supported |
| Owned entities | area, facility, campaign, campaign_follow, appointment_slot |
| Public APIs | /areas; /facilities; /campaigns; /campaigns/{id}/follow; /appointment-slots; /checkin/qr |
| Events published | CampaignPublished, SlotBooked, CheckedIn |
| Events consumed | AppointmentConfirmed (slot reservation) |
| Phase | Areas and facilities Phase 1 (needed by requests and cases); campaigns, slot booking and QR check-in Phase 2 |
