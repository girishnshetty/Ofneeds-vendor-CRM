# Validation record

Validation uses fictional sample records and isolated test databases. Existing OfNeeds and Invozio source/data were not edited.

## Automated checks

- Strict TypeScript: `npm run lint`.
- Unit/API tests: `npm test` (39 passing tests after the enterprise workflow update).
- Optimized client build: `npm run build`.
- Compiled production server smoke: `npm run test:production`.
- Registry dependency audit: `npm audit`.

The main app bundle is approximately 462 KB before gzip / 133 KB gzip in the latest build. Reporting is a separate small chunk. ExcelJS is approximately 940 KB before gzip and loads on Excel import; its chunk-size warning is expected and does not add to the initial application download.

## Manual browser journeys

- Public landing, demo entry and responsive product preview render without authentication.
- Vendor search by fictional brand Aster & Oak plus Bengaluru filtering; opening matching vendor profile.
- Complete six-step wizard, assign an example brand, save Juniper Sample Supply and verify its profile.
- Schedule a follow-up from a vendor profile, find the saved activity in My tasks.
- Open Desk speaker, compare three supplier reference prices, MOQ, stock and lead times.
- Create Sample conference desk kit RFQ, select a product and supplier, record a supplier response at ₹320 for 100 units, verify ₹32,000 total and quantity fit.
- Complete all ten tour steps across dashboard, vendors, brands, profile, products, RFQs, tasks and reports.
- Ctrl+K command palette and record search; light/dark switching; Reset demo returns vendor count to 25 and clears trial records.
- Upload a fictional Excel workbook, review one validated vendor row, confirm import and verify Juniper Import Sample appears in the directory (26 total vendors).
- Desktop 1440 px, tablet 1024 px and mobile 390 px layouts. Mobile drawer and readable vendor cards work. Core/admin modules fit within the tablet viewport; vendor cards fit mobile without page overflow.
- Brand, contact, category, catalogue, price list, RFQ, document, report, analytics, import, team and settings routes render real module headings.

During development, a mobile search icon lacked an accessible name; an explicit label was added. Fast-refresh root reuse was fixed to avoid duplicate createRoot warnings when source files are reformatted. Native file-picker automation was slow and pointer actions timed out afterward; keyboard activation completed and verified the import. This is a browser automation limitation, not evidence of a completed hosted deployment.

## Enterprise workflow update (2026-10-26)

- API tests now cover RFC authenticator vectors/replay, MFA challenge and recovery codes, reset-token reuse and session revocation, encrypted consistent backup/restore and integrity checks, append-only audit validation, scoped supplier sessions and revocation, hidden competing prices/internal documents, supplier catalogue uploads, evidence immutability, stale quotation approval, RFQ-to-order conversion, owner decision permissions, idempotent partial receipts, report/task deduplication, API-key scopes/revocation and signed billing amounts/event replay.
- Production smoke passes with compiled serving, Secure cookies/headers/origin checks and a missing-scanner upload returning 503.
- Browser QA at 1440 and 390 pixels: submit/reject/resubmit/approve the sample order; issue, acknowledge and partially receive 40 of 100 units; supplier preview; revise a quotation with decimal pricing; create a new gifting project and verify it appears. Mobile supplier/project pages stay within viewport width and the drawer navigates correctly.
- UI fixes include the working recovery submit button, readable approval snapshot and two-decimal money display. New feature screenshots are in docs/screenshots/features-desktop.jpg and projects-mobile.jpg.
- Active private database remains empty (0 workspaces, 0 business records, 0 workflow records). UI checks changed only fictional demo data; API checks use ignored isolated test databases.
- A fresh npm audit was blocked by automatic approval review because it sends dependency metadata to npm. No current vulnerability-audit result is claimed.

## Limits

No production host, TLS endpoint, Docker daemon, external email/WhatsApp service, antivirus integration or formal accessibility audit was verified. Provider-dependent actions show their unconfigured status. Compatible adapters and local security/recovery flows are implemented, but real delivery, provider account setup, off-host backup operations, deployed TLS, monitoring and formal security/accessibility review still require launch validation. Tests do not represent certification of production readiness.
