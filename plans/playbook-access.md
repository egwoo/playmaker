# Playbook access management

Show accepted members and their viewer/collaborator roles in Share playbook. Coaches can remove other members; owners and the current user are protected. Removal atomically replaces both existing invitation tokens. Other members retain access. Sent invitations that have not been accepted are not tracked.

Scope excludes role editing, email invitations, individual-play links, and clearing copies already downloaded by a member.

## Deployment

1. Apply the updated `supabase/schema.sql` to Supabase before deploying the frontend. This introduces the member-list/removal/share-link RPCs, serializes invitation acceptance and link creation with removal, and restricts direct membership and invitation writes. Existing self-leave remains available. Coordinate the frontend release closely: older clients can still retrieve existing links but cannot create new ones after direct inserts are disabled; reload those clients after deployment.
2. Verify as a coach in a disposable playbook: list members, protect the owner, remove a viewer, check both old links fail and existing members still have access. Verify a newly copied link permits joining.
3. Merge the frontend PR to deploy through the existing GitHub Pages workflow. Check desktop/mobile Share playbook and error handling.

No production schema or membership changes are made as part of implementation. A frontend rollback can retain the new backend functions and safer policies. Avoid restoring old invitation tokens during rollback.

## Validation

- Existing Vitest suite and Vite production build.
- SQL regression transaction in `supabase/access.test.sql` against isolated PostgreSQL with Supabase auth-role stubs; production verification remains required.
- Browser regression against mocked Supabase responses, including confirmation, failures, and fresh-link lookup.
- TypeScript diagnostics compared with the unchanged baseline; existing errors are outside this change.
