# Module brief: Community (COM)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.11 Community (COM)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Posts, comments, reactions, campaign follows, verified emergency appeals linked to a verified request (no private documents, no donor contact details), visibility settings and report controls |
| Owned entities | community_post, post_comment, post_reaction, appeal_post_link |
| Public APIs | /community/posts; /community/posts/{id}/comments; /community/posts/{id}/reactions; /community/appeals |
| Events published | CommunityPostCreated, CommunityPostReported |
| Events consumed | RequestCancelled, CaseClosed (auto-archive linked appeals); ModerationDecided (REMOVE_CONTENT) |
| Phase | Phase 2 |
