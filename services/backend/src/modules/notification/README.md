# NTF module

Brief: `docs/modules/ntf.md`. Expose one public interface; keep everything else private to this folder.

## Inbox

| Endpoint | Behaviour |
| --- | --- |
| `GET /notifications` | In-app items for the signed-in user, newest first. Each item carries `category` (`INVITATIONS`, `REQUEST_UPDATES`, `REMINDERS`, `SUPPORT`, `COMMUNITY`, `CAMPAIGNS`, `SYSTEM`), mapped on the server from the event code with the same table that selects the user's notification preference. Clients group by this field; they never derive it. |
| `POST /notifications/{id}/read`, `POST /notifications/read-all` | Mark one or all as read; marking one also marks the same event's push and SMS copies read so no SMS fallback is sent. |

The web inbox (`apps/web`, `/notifications`) shows the unread count with "Mark all as read", and switches between a list by date and sections by type with a count per section.

## Data access

Drizzle over the module's `schema.ts` (ADR-16). Identity, request and case data come from those modules' `read-model.public.ts`; the push-token write is identity's `setPushToken`. The two dispatcher loops (`dispatchDue`, `fallbackDue`) stay raw SQL because they use `FOR UPDATE ... SKIP LOCKED`.
