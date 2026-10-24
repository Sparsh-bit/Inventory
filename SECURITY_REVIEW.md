# Security and privacy readiness review

Review date: 24 October 2026

## Scope and limits

This review covered the checked-in application code, authentication and authorization paths, tenant-scoped file routes, dependency audit, automated unit and integration tests, and a small unauthenticated HTTP check against the local app on port 3000. It did not test a deployed environment, infrastructure, backups, production accounts, or third-party services. It is not a certified penetration test or legal opinion.

## Changes made

- New product images are stored under a business-specific directory and served only to a signed-in member whose active business matches the URL.
- Legacy flat image URLs remain available only to the business that already references them. Product writes cannot claim a new legacy URL, and business settings cannot adopt another business's legacy logo.
- Uploaded files are rate limited per user and business. The upload endpoint enforces a streamed multipart body cap even without a `Content-Length` header, checks file signatures and file-size limits, and returns private files with `no-store` caching.
- Dependency remediation updated the lockfile. `npm audit` now reports zero known vulnerabilities.
- Added regression coverage for unauthenticated, cross-business and legacy image access.

## Authentication and authorization

The application uses Better Auth with email verification, password reset, session expiry, sign-in throttling and per-account lockout. TOTP and backup-code two-factor authentication are available but optional. Protected pages resolve the signed-in user and active business on the server. Server actions use a shared authentication, permission and input-validation wrapper; reports, file routes and other custom API routes perform their own server-side checks. The role matrix is covered by integration tests.

Tenant isolation is enforced through organization IDs in database queries and a Mongoose plugin that rejects unscoped tenant-model queries. The image delivery path now also checks the active organization before reading tenant data from disk.

## Verification performed

- `npm run test`: 77 unit tests passed.
- `npm run test:int`: 307 integration tests passed, including role and cross-tenant cases.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; all registered routes compiled.
- `npm audit`: zero known vulnerabilities.
- Local anonymous HTTP checks: `/dashboard` redirected to sign-in; an image request returned 401; a cross-origin POST to the scan endpoint returned 403. The sign-in response included the configured CSP and browser security headers.

The Playwright Chromium suite was run with an isolated disposable MongoDB database, mail sink, upload directory and Next.js build directory. The full cross-browser/device matrix was not run on this host.

## Open security and privacy decisions

1. **Public bill links do not expire or have per-link revocation.** They are signed and difficult to guess, and the public page sets `no-referrer`, but anyone possessing a link can continue to access that bill. Choose a link lifetime and revocation behavior before changing this, because expiry will affect links already shared with customers.
2. **Two-factor authentication is optional.** Decide whether owners and other privileged roles must enroll before accessing business, member, tax, audit or financial settings.
3. **DPDP readiness is incomplete.** The repository has no standalone privacy notice describing the responsible legal entity, purposes, personal-data categories, processors, rights process, grievance contact or retention periods. It also has no data-principal request workflow or breach-notification workflow. These details depend on whether StockPilot's operator and each customer business act as Data Fiduciary, Data Processor or both, and on the actual operating and support model.
4. **CERT-In and hosting controls cannot be verified from source alone.** The code does not establish where MongoDB, uploaded files, email or infrastructure logs are hosted; whether production logs are retained in India for the required period; or whether an incident contact and response process is in place. These need deployment evidence and operational ownership.
5. **Production controls remain unverified.** Confirm TLS and proxy trust boundaries, encryption and access controls for MongoDB and backups, upload-volume limits at the edge, secret rotation, mail provider terms, subprocessor locations, recovery testing and incident response.

The DPDP Act and Rules were notified with phased commencement dates. MeitY's 2025 Rules explainer describes security safeguards, breach communication and retention obligations; the final requirements and dates should be checked against the latest Gazette notifications and any corrigenda before launch. CERT-In's 2022 directions separately address incident reporting and 180-day log retention. These sources do not make this repository or its operator compliant by themselves.

References: [DPDP Act, India Code](https://www.indiacode.nic.in/indiacode/handle/123456789/22037?view_type=browse), [DPDP Rules and commencement documents, MeitY](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025%3B), [MeitY explanatory note](https://www.meity.gov.in/writereaddata/files/Explanatory-Note-DPDP-Rules-2025.pdf), [CERT-In Directions under section 70B](https://www.cert-in.org.in/Directions70B.jsp).
