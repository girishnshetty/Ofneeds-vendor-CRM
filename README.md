# OfNeeds Vendor CRM

A standalone corporate gifting vendor CRM. This project is separate from Invozio and the OfNeeds marketplace and does not use their databases or credentials.

## Run

Use Node 24+. On a clean checkout: npm ci, then npm run dev. Open http://127.0.0.1:4310/ and choose the interactive demo or create an empty private workspace. Configuration comes from process environment variables; .env.example is a template, not an automatically loaded secrets file.

The workstation currently uses an ignored dependency junction to invozio-preview/node_modules. That junction is a local disk-saving arrangement, not a deployment dependency. The registry-only lockfile supports a standalone clean install elsewhere. Do not run npm ci against a shared dependency junction.

## Working features

- Vendor, brand, contact, product, document, RFQ and task management, filters, saved views, global search, dashboard preferences and reports.
- Supplier portal with expiring, single-use invitations and a separate vendor-scoped session. Suppliers propose profile changes, upload catalogues, confirm their own stock/prices, revise assigned RFQ responses and acknowledge/dispatch issued orders. Competing quotes and internal documents are excluded.
- Gifting projects, client/event/budget/delivery context, branding instructions, artwork versions and approval, sample request/receipt/acceptance, and supplier evaluations.
- Landed quotation and order costing in integer paise, including per-unit branding/packaging, total freight and entered tax. RFQ award approval converts a current recorded response into one draft purchase order.
- Purchase order drafting, owner approval tied to a version snapshot, issue to portal, acknowledgement, dispatch, partial receipts and completion. Receipt references prevent duplicate counting; over-receipts and invalid transitions are rejected.
- Evidence-based authorization reviews, owner decisions, comments/mentions, record notes/tags/owners/custom fields, in-app notifications, recurring assigned tasks and overdue/expiry escalation.
- Scheduled private CSV snapshots, encrypted message outbox, explicit supplier-message dispatch, stock freshness, import column mapping/validation, transactional duplicate merging and all-matching exports (25,000-row limit).
- Account recovery tokens, email verification flow, member/viewer invitations, TOTP MFA with replay protection and one-use recovery codes, session inventory/revocation and append-only hash-chained audit events.
- Expiring/revocable scoped read-only API keys, signed outbound webhook jobs, plan requests, usage limits and signed/idempotent billing activation hooks. A plan request alone never charges money or activates a paid tier.
- File signatures, organization storage quotas and a production scanner gate. AES-GCM encrypted consistent SQLite backups and a restore command that refuses to overwrite an occupied directory and revokes restored access tokens/sessions.

## Demo and private data

The demo uses fictional data in this tab's sessionStorage. It includes a sample project, artwork record and draft order so the procurement workflow can be practiced without sending messages. Supplier preview is separately isolated. Keys, real billing, audit history and account-security controls require a private account. Demo reset never touches SQLite workspaces.

Private data is stored in .data/crm.sqlite (or CRM_DATA_DIR). Schema additions are non-destructive. Passwords are salted/scrypt-hashed and CRM/supplier session tokens are stored hashed. Role and workspace checks run on the server.

## Validation

npm run lint performs TypeScript checking. npm test runs isolated unit/API tests. npm run build creates the production client. npm run test:production checks compiled serving, private routes, headers, secure cookies, origin checks and fail-closed production uploads. See docs/QA.md for the latest results.

## Provider and deployment requirements

Local workflows work without paid accounts. Email/WhatsApp, antivirus scanning and payment collection require real providers or compatible server-side adapters. Credentials remain server-side. Configured recovery email is dispatched transactionally; RFQ, invitation and report messages require explicit owner dispatch. No real provider messages or payments were sent during development.

This is a single-server SQLite application. SSO/SAML, distributed workers/rate limits, multi-region hosting, live stock reservation, tax filing and external vendor certification are outside this release. Database files themselves require encrypted host storage. Formal accessibility/security review and operational monitoring remain launch work. No cloud hosting or external provider certification is claimed.

See docs/FEATURES.md, docs/OPERATIONS.md and docs/DEPLOYMENT.md for the feature map, adapter contracts and recovery/deployment procedures.
