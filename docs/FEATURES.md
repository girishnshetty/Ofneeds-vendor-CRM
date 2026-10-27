# Feature map

| Capability | Where to use it | Behavior / boundary |
| --- | --- | --- |
| Supplier workspace | Supplier access; supplier invitation link | One vendor only; competing quotations and internal evidence stay private. Token lasts 72 hours; exchange once; revoke immediately. |
| RFQ delivery and response revisions | RFQ detail; Supplier portal > RFQs | Queue email/WhatsApp, dispatch as owner. Supplier response deadline, quantity fit and validity checked. Revisions remain in audit snapshots. |
| Purchase orders | Purchase orders; Approvals | Draft > pending > owner approved > issued > accepted/declined > dispatched/partial receipts > completed. No automatic supplier communication or stock reservation. |
| Approval controls | Approvals; Verification reviews | Owner decision/reason; stale snapshot cannot be approved. Authorization requires uploaded evidence belonging to the vendor. |
| Task automation | Automations; Notifications | Recurring assigned tasks, deduplication, overdue escalation and expiring authorization notices. Worker runs only while server is running. |
| Gifting projects | Gifting projects | Client, event, budget, deadline, address, owner and lifecycle. Linked orders, samples and artwork. |
| Product customization | Branding & artwork; Sample requests | Artwork version and evidence, approval/change request; sample request, receipt and acceptance. Create a new artwork version after approval. |
| Landed cost | RFQ response editor/comparison; Purchase orders | Unit prices, branding/packaging, total freight, entered tax rate, quantities and paise totals. No tax-compliance certification. |
| Performance | Supplier performance | Ratings entered by team; completed-order delivery observations. Missing observations stay empty. |
| Collaboration | Collaboration; Notifications | Internal comments/mentions, owner, tags, notes and configurable fields. |
| Stock freshness | Stock freshness; supplier Products | Recorded confirmation timestamp and quote expiry. Confirmation is not reservation or a live ERP sync. |
| Data quality | Data quality | Map XLSX/CSV columns, validate before atomic import, owner merge with conflict checks and preserved source history, all-matching CSV export. |
| Connections | Connections | Read-only vendor/product/RFQ API scopes, expiry/revocation, signed webhook jobs and explicit dispatch. Requires server allowlist for receivers. |
| Plans | Plans & usage | Seat/vendor/storage limits and saved plan requests. Paid activation only from a valid billing adapter signature matching configured INR amount/term. |
| Account security | Account security; Team management | TOTP MFA/recovery codes, sessions, account recovery, verification and expiring member/viewer invitations. Local verification test does not prove email ownership. |
| Operational controls | Service health; Audit trail; operator CLI | Provider status, storage use, scheduler/backup status, audit snapshots/hash integrity and encrypted full-server backup/restore. Production scanner required for uploads. |

External adapters are intentionally unconfigured until accounts exist. The UI reports blocked/unconfigured states. This release does not include SSO/SAML, a marketplace checkout, production hosting or a formal compliance audit.
