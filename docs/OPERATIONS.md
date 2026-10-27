# Operations and adapter contracts

## Local mode and secrets

The app reads process environment variables. Use .env.example as a template for your supervisor/container configuration. It does not load .env files itself. Never place provider keys in VITE_ variables, browser storage, source control or screenshots. Production requires HTTPS APP_URL and CRM_ENCRYPTION_KEY (64 hex characters from a cryptographic random generator). Development creates a private security.key in CRM_DATA_DIR; preserve that key. SQLite file contents require host/disk encryption; application encryption covers security secrets, queued message bodies and backup archives.

## Email and WhatsApp

Set CRM_MAIL_GATEWAY_URL, CRM_MAIL_GATEWAY_TOKEN and CRM_MAIL_FROM, or CRM_WHATSAPP_GATEWAY_URL and CRM_WHATSAPP_GATEWAY_TOKEN. These are compatible adapter contracts, not direct vendor SDK integrations. Implement an adapter to your chosen provider, using HTTPS. The server sends POST JSON with from, to, subject, text and optional attachments [{name,type,base64}]. Authorization is Bearer configured-token; Idempotency-Key is the stable outbox ID. Return a successful 2xx response only after accepting delivery. Recipient numbers must use + followed by 10–15 digits. Redirects are rejected and requests time out.

Password recovery attempts dispatch immediately when email is configured, so a locked-out owner can recover without an existing session. Responses remain generic for known/unknown emails. Other queued messages are dispatched explicitly by an owner in Delivery center. Blocked messages can be retried after configuration. The adapter must deduplicate Idempotency-Key, including ambiguous timeout cases. A provider accepting a message does not prove that a human received it. Setup/provider errors must be monitored by the operator.

Verification is marked only after a valid one-use verification token is completed. In local mode an owner can test the flow with a displayed link, but that link does not claim verified email ownership. Invitations and supplier links are bearer secrets: share privately, expire after 72 hours and can be revoked.

## Document scanning

Set CRM_SCAN_GATEWAY_URL and CRM_SCAN_GATEWAY_TOKEN. HTTPS POST JSON is {base64,mime}; use Bearer authentication. Return {clean:true} only after a real malware scan. Any rejection, timeout or missing positive result blocks upload. Production blocks uploads when this adapter is missing. Development performs allowed MIME signature and size checks only, which are not antivirus scanning. Per-file maximum is 4 MB. Storage limits apply across the workspace.

## Scoped API and signed events

Owner Connections creates a raw API key shown once, with vendors:read, products:read and/or rfqs:read scopes. Keys expire within 1–90 days and can be revoked. GET /api/integrations/records/vendors (or products/rfqs) accepts Authorization: Bearer key and offset. Results are limited to 100 per request and scoped to one workspace.

Configure an HTTPS webhook receiver in Connections, confirming the owner password. A new receiver signing secret is shown once. The operator must independently set CRM_WEBHOOK_ALLOWED_HOSTS to the exact allowed hostname before dispatch. Processing local jobs creates queued audit metadata events; the owner dispatches them. Headers include X-OfNeeds-Event, X-OfNeeds-Timestamp (milliseconds) and X-OfNeeds-Signature = HMAC-SHA256(secret, timestamp + '.' + exact JSON body). Verify in constant time, reject stale timestamps and deduplicate event IDs. The payload contains event/action/record metadata; it omits record snapshots and secrets. Do not use an allowlist entry that resolves to private infrastructure. A crash during delivery requires operator reconciliation; provider/receiver idempotency is required.

## Plan activation adapter

No default paid amounts are assumed. CRM_BILLING_CATALOG_JSON may contain {"team":{"amountPaise":10000,"label":"Your configured plan label"}}; amounts are INR paise. Plans & usage saves a request ID, without charging or changing entitlements.

A trusted payment adapter must verify the real payment at its provider before POST /api/billing/webhook. Set CRM_BILLING_WEBHOOK_SECRET server-side. Sign the exact raw JSON with HMAC-SHA256 and put the hex result in X-OfNeeds-Signature. Body: {eventId,requestId,status:"paid",amountPaise,currency:"INR",termEnd:ISO-date,reference}. Amount must match the configured tier and the term must be in the future. An authenticated status:"refunded" event restores local entitlements. Event IDs are idempotent. This contract alone is not a Razorpay/Stripe checkout, tax invoice or subscription renewal service. Expired terms fall back to local limits.

## Jobs and monitoring

CRM_AUTOMATION_INTERVAL_SECONDS defaults to 60 (minimum active interval 30). Set 0 to disable. The worker creates due follow-ups, overdue/authorization notifications, scheduled CSV snapshots and webhook jobs, without dispatching supplier messages. Process due local jobs is also available to owners. Period keys prevent duplicate tasks/reports. Service health shows configured providers, storage limits and the last completed scheduled backup. /api/health checks SQLite; monitor it externally and capture stderr. Configure log/backup retention and alerts at the host level. No hosted monitoring account is provisioned.

## Encrypted backups and safe restore

Run npm run recovery -- --backup with the same CRM_DATA_DIR and encryption key as the service. Node's SQLite backup API produces a consistent snapshot while the app is running; the temporary snapshot is removed after AES-GCM encryption. Archives live under CRM_DATA_DIR/backups with a .crmbackup extension. Copy archives off-host with your own secure backup system. Escrow the encryption key separately; a lost key makes archives unrecoverable. Backups contain every workspace on this server and are operator-only.

Production scheduling defaults to 24 hours (CRM_BACKUP_INTERVAL_HOURS); development defaults to 0. Scheduling starts after that interval; take an initial manual backup. No automatic archive pruning is performed. Avoid running out of disk space.

Restore example: npm run recovery -- --restore C:/safe/example.crmbackup --to C:/safe/new-empty-restore --key-dir C:/safe/original-key-directory . When CRM_ENCRYPTION_KEY is supplied, --key-dir is unnecessary. Use the original key. The destination must be new or empty; restore never overwrites an occupied directory or the active DB. It checks authenticated encryption, checksum, SQLite signature and integrity. Restored CRM/supplier sessions, reset/invite tokens, MFA challenges and API keys are revoked. Authenticator secrets and saved business data remain encrypted under the original key. Reconcile pending outbox/provider jobs before starting a restored server to avoid re-sending work accepted after the backup.

Test restoration separately, inspect record counts, then perform an operator-controlled cutover with the original service stopped. The app does not switch the active database automatically. Database operator access and this CLI must be restricted at the OS level.
