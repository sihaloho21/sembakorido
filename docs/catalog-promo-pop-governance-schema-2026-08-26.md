# Catalog Promo POP — Production Governance Schema

**Date:** 2026-08-26  
**Scope:** version history, approval workflow, audit log, admin role access control, and minimum-price protection.

## Design principles

The existing `promo_flyers` sheet remains the source of the current campaign record. Governance data is append-only and stored in companion sheets so old campaign rows remain readable. Every new endpoint is authenticated by the existing admin token and, when `admin_role_enforce=true`, by a role resolved on the server. The browser-supplied role is treated as a hint only and is never authoritative.

All governance writes are idempotent where a `request_id` is supplied. All timestamps are ISO-8601 strings in UTC. Payload JSON is bounded by the backend to prevent oversized spreadsheet cells and denial-of-service style writes.

## Sheets and headers

The existing `promo_flyers` campaign sheet may include the optional `visual_config_json` field. It stores the visual preset, badge style, hero composition, smart-fit setting, category grouping, featured-product setting, CTA style, and digital output format. Older rows remain compatible because the field is optional and the migration only appends the missing header.

### `promo_flyer_versions`

| Column | Purpose |
|---|---|
| `id` | Immutable version identifier, e.g. `pfv-...` |
| `campaign_id` | `promo_flyers.id` |
| `version_no` | Monotonic version number per campaign |
| `snapshot_json` | Complete campaign snapshot, including `items_json` |
| `change_summary` | Human-readable change note |
| `status` | `draft`, `in_review`, `approved`, `rejected`, `published` |
| `created_at` | Snapshot creation timestamp |
| `created_by` | Server-resolved actor identity/role |
| `request_id` | Idempotency key |
| `is_current` | `true` for the latest version |

### `promo_flyer_approvals`

| Column | Purpose |
|---|---|
| `id` | Approval record identifier |
| `campaign_id` | `promo_flyers.id` |
| `version_id` | Version being reviewed |
| `from_status` | Previous workflow status |
| `to_status` | Requested status |
| `decision_note` | Required for rejection; optional otherwise |
| `actor_role` | Server-resolved role |
| `created_at` | Decision timestamp |
| `request_id` | Idempotency key |

### `promo_flyer_audit_logs`

| Column | Purpose |
|---|---|
| `id` | Audit event identifier |
| `event_type` | e.g. `campaign_created`, `campaign_updated`, `version_created`, `approval_changed`, `published`, `price_blocked` |
| `campaign_id` | Related campaign |
| `version_id` | Related version, when applicable |
| `actor` | Server-resolved actor identity |
| `actor_role` | Server-resolved role |
| `request_id` | Correlation/idempotency key |
| `details_json` | Structured event details |
| `created_at` | Event timestamp |

### `promo_admin_users`

| Column | Purpose |
|---|---|
| `id` | Admin identity |
| `email` | Optional operator email |
| `display_name` | Display label |
| `role` | `superadmin`, `manager`, `operator`, `viewer` |
| `token_hash` | SHA-256 hash of the operator access token |
| `status` | `active` or `disabled` |
| `created_at` | Record creation timestamp |
| `updated_at` | Last change timestamp |
| `created_by` | Provisioning actor |

### `promo_margin_policies`

| Column | Purpose |
|---|---|
| `id` | Policy identifier; normally `default` |
| `scope` | `global`, `category`, or `product` |
| `scope_key` | Matching category/product ID |
| `minimum_margin_percent` | Required margin percentage |
| `minimum_price` | Optional absolute floor |
| `mode` | `warning` or `strict` |
| `status` | `active` or `disabled` |
| `updated_at` | Policy timestamp |
| `updated_by` | Server-resolved actor |

## Workflow rules

The allowed workflow transitions are:

- `draft -> in_review`
- `in_review -> approved`
- `in_review -> rejected`
- `rejected -> draft`
- `rejected -> in_review`
- `approved -> in_review` when a new version changes the campaign
- `approved -> published` only through the publish action
- `published -> draft` through unpublish

Only `manager` or higher can create/update campaign records, request review, approve/reject, publish, or unpublish. `operator` can read operational data but cannot mutate governance state. `superadmin` can manage policy and admin identities.

## Migration sequence

1. Run `migrateCatalogPromoPopGovernance()` from the standalone migration script. It creates missing sheets and headers idempotently.
2. Run `seedCatalogPromoPopAdminAccess()` once using the configured `ADMIN_TOKEN`. This creates a `superadmin` binding for the existing master token without storing the raw token.
3. Run `setCatalogPromoPopRoleEnforcement(true)` only after at least one active access binding has been verified.
4. Deploy the updated `gas_v63_blog_support.gs` Web App.
5. Update the admin UI to use the new action wrappers. The old generic campaign CRUD remains available for backwards-compatible reads, but new writes are checked by the POP-specific validator.
6. Backfill one initial version per existing campaign with `backfillCatalogPromoPopVersions()`; this is optional and can be rerun safely because campaign/version pairs are de-duplicated.

## Minimum-price contract

For each campaign item, the server reads `minimum_price` if present; otherwise it resolves the active product/category/global policy and computes:

`minimum_allowed = max(minimum_price, cost_price * (1 + minimum_margin_percent / 100))`

If cost is unavailable and no absolute floor exists, the server does not estimate a floor and allows the record. In `warning` mode the response includes violations and logs `price_warning`; in `strict` mode any violation rejects create, update, restore, and publish with `PRICE_BELOW_MINIMUM`.

The browser applies the same rule for immediate feedback, but the GAS validator is authoritative.

## Rollback

The migration is append-only and does not rename or delete existing columns. To roll back UI code, deploy the previous frontend bundle. To roll back workflow enforcement, set `admin_role_enforce=false` and leave governance sheets intact. Existing `promo_flyers` rows remain readable because all new fields are optional and `ensureSchema()` only appends missing headers.

## Acceptance criteria

- Existing campaign reads and public rendering continue to work.
- Old campaigns can be edited without a version record being required before the first save.
- Every new campaign write creates an immutable version and audit event.
- Approval and publish actions are server role-gated.
- Minimum-price strict mode blocks direct, bulk, restore, save, and publish paths.
- Repeated requests with the same `request_id` do not create duplicate governance rows.
- No raw admin access token is written to Sheets or audit details.
