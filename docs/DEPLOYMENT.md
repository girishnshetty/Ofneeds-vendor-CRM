# Running and deploying OfNeeds Vendor CRM

## Local development

Use Node 24+ and `npm ci`, then `npm run dev`. By default only 127.0.0.1:4310 is exposed. Vite serves the client and the same Node process handles APIs. The application is independent of Invozio on port 3000 and the existing OfNeeds marketplace.

## Production process

1. Copy source, install with `npm ci`, run `npm run lint`, `npm test` and `npm run build`.
2. Set `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=4310`, `APP_URL=https://your-real-domain.example` and `CRM_DATA_DIR` to a private, persistent writable directory. Set a stable random `CRM_ENCRYPTION_KEY` of 64 hexadecimal characters; production startup refuses to run without it. Keep this key in your secret manager and escrow it separately from backups. Replace the example domain with an actual HTTPS origin; this is not a provisioned domain.
3. Run `npm start` under a process supervisor. Production rejects a non-HTTPS APP_URL and issues Secure session cookies. An HTTPS reverse proxy must terminate TLS and forward traffic to the Node service. Do not expose the development server publicly.
4. Verify `/api/health` returns status `ok`, browser login works over HTTPS, `/api/crm/vendors` returns 401 without a session, and workspace A cannot open workspace B records/files.
5. Use the included encrypted SQLite backup command and scheduler; see OPERATIONS.md. Take an initial backup, copy encrypted archives off-host, escrow the original key separately and perform a restore drill. The production scheduler defaults to every 24 hours while this process is running; it does not protect against losing the entire host.

Use a single Node process with local SQLite on reliable local disk. Do not place the live SQLite database on OneDrive, network shares or ephemeral hosting storage for a public deployment. Use a server data directory outside the source tree. Multi-process/multi-region deployments require a planned database/session/rate-limit migration.

## Optional container

The Dockerfile builds on Node 24, uses an unprivileged runtime user and stores SQLite in `/data`. Build with `docker build -t ofneeds-vendor-crm .`. Supply the real HTTPS APP_URL and a persistent volume mounted at `/data`. Bind the service behind a TLS reverse proxy. The container healthcheck probes the database-backed `/api/health` route. Container build and public TLS have not been validated on this workstation.

Never package `.data`, `.env.local`, test databases, dependencies from another application or private documents with the source. The repository ignore and Docker ignore files cover runtime artifacts. The portable package-lock uses registry tarballs; the workstation's dependency junction is not part of the deployment.

## Before public launch

Account recovery, email verification, invitations, TOTP MFA, upload quotas, a scanner gate and audit snapshots are now implemented. Configure HTTPS mail/WhatsApp adapters and a malware-scanning adapter before relying on them; production uploads fail closed without a scanner. Confirm sender/domain verification with the chosen provider. Configure billing and webhook allowlists only when those services are ready. Provider contracts and backup/restore instructions are in OPERATIONS.md.

Arrange external uptime/error monitoring, log and backup retention, encrypted host storage, owner recovery key custody and a formal accessibility/security review. The local worker requires the server to remain online. Single-process request budgets are not distributed rate limits. SSO/SAML and multi-instance hosting are not part of this version.
