# Permission catalogue: how the matrix was read

Migration `0025_permission_catalogue.sql` seeds 105 permission keys, the two BASE sets (DON, PAT) and the six tier sets. It was written from document 02 sections 3.2 to 3.5 and the table in document 04 section 15.5. It applied cleanly on PostgreSQL 16. **Review it before you apply it, because it decides who can see what.**

## How compressed cells were read

The matrix tables put fewer cells in a row than they have columns. I used these rules:

- Where section 3.2, 3.4 or 3.5 names the default holders of a key (for example "SUP Agent (Assigned active request); SUP Lead (Area); ADM (All, reason)"), that text decides.
- In table 3.3b (MOD, MOD Lead, ADM), a row with two cells was read as (Moderator and Moderation Lead share cell one) and (ADM is cell two). A row with three cells was read one per column.
- In table 3.3a, a "—" cell shared by DON and PAT means neither role holds the key.
- Administrator and Primary Administrator hold the same keys. The difference (only a Primary Administrator grants ADM sets) is in the grant rules, not in this catalogue.
- Tiers do not inherit. Each set lists its keys explicitly.

## Everyday keys I had to name

Document 04 says the migration seeds "the everyday record keys behind the matrix" but does not list them. I named them `resource.action` after each matrix row, for example `case.edit`, `outcome.report`, `recovery.approve_staff`. The names and scopes are mine.

## Judgement calls to check

- `blood_request.view` for Moderation Lead is scope All ("all moderation holds" in the matrix). It should be limited to requests with a moderation hold. That condition is not enforced yet.
- `outreach.pause_org` (organization-wide pause) is held by Moderation Lead only. The matrix cell is ambiguous and could mean Administrator too.
- `request_document.view` is Assigned only for Support Agent, Support Lead, Moderator and Moderation Lead. Administrators get no document access.
- `data_request.approve` is held by Moderation Lead, Administrator and Primary Administrator.
- `contact_history.view` is marked sensitive, because viewing it is a sensitive read.
- `donor.phone.export` exists in the catalogue but is in no set, as the document requires.
- Sensitive flags follow section 15.5: phone reveal, exact-location reveal, advanced search, exports, audit export, login history and permission management. Reason and step-up flags are set on the same keys. Nothing enforces step-up yet.
- Phase 2 keys (community, campaigns) are seeded with least-privilege holders.
- Bangla descriptions are my wording and need a native-speaker review.

## Not done

- The trigger that stops anyone granting a permission they do not hold (`idn.check_grantor`) exists, but no grant API is built yet.
- Phase 2 SCOPE sets (`scope.campaigns`, `scope.volunteer_tasks`, `scope.escalation_lead`) are not seeded.
