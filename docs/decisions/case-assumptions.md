# Case workflow assumptions

- A coordination case opens when the first donor answers Available. Later Available answers join the same case; a case in "Needs replacement" reopens.
- The case owner is the verifying agent, whatever their shift.
- Task due times and the 60-minute attendance grace period are constants in the code, not settings.
- Staff may mark a no-show only after the grace period has passed.
- A donor's own donation report moves the case to "Outcome pending" and the request to "Awaiting outcome". It never fulfils the request; only a Service-confirmed outcome with units does.
- Full fulfilment sets the request to Fulfilled and the case to Resolved. Partial fulfilment opens a "more donors needed?" task; answering yes returns the request to Searching.
- A rescheduled appointment is marked Rescheduled and a new Proposed appointment is created and linked to it.
- Withdrawal, no-show and "donation not completed" release the donor. If no active donor remains, the case becomes "Needs replacement", the request returns to Searching and the worker proposes a REPLACEMENT wave for staff approval.
- Not built: dispute flow, reminders and notifications, donation_record and last_donation_date updates from service-confirmed outcomes, donor-confirmation timeout and callback task.
