# ResolveDesk — Enterprise Online Complaint Management System

**Architected & Administered by:** Raghuraj Pratap Singh (`raghurajpratapsingh8787@gmail.com`)

ResolveDesk is a full-stack, security-first Online Complaint Management System designed for universities, colleges, and institutional organizations. It combines a fully animated React + TypeScript + Tailwind CSS dashboard with an Express + TypeScript + Mongoose + Socket.IO backend.

---

## Core Architecture & Capabilities

- **Animated Enterprise Dashboard**: 8 animated KPI metric cards, 6 Recharts visualizations (Monthly Trends, Department Volume, Status Distribution, SLA Compliance, Resolution Velocity, Daily Activity), light/dark themes, and reduced-motion compliance.
- **Multi-Step Complaint Intake**: 3-step guided wizard with Zod validation, draft saving, duplicate submission protection, anonymous identity masking, automatic reference ID generation (`CMP-YYYY-XXXX`), and evidence uploads.
- **Complaint Tracking & Visual Timeline**: Authenticated case dossiers plus a rate-limited, privacy-safe public Reference ID lookup that never exposes submitter PII or internal staff notes.
- **Role-Based Access Control (RBAC)**: Strict backend authorization for `SUPER_ADMIN`, `DEPARTMENT_ADMIN`, `STAFF`, and `USER` roles.
- **Validated Resolution Workflow**: Enforced status state machine (`Draft`, `Submitted`, `Under Review`, `Assigned`, `In Progress`, `Awaiting Response`, `Resolved`, `Rejected`, `Reopened`, `Escalated`), mandatory resolution summaries and rejection reasons, and history-preserving reopenings.
- **Real-Time Communication & Notifications**: Authenticated Socket.IO rooms with authorization checks before joining complaint rooms, real-time notifications, optional Nodemailer SMTP alerts, and strictly isolated staff-only internal notes.
- **Secure Evidence Vault**: Multer upload validation verifying both MIME types and binary magic-byte signatures (JPG, PNG, PDF up to 5 MB), randomized UUID filenames stored privately outside public web roots, path-confinement checks, and authorized preview/download streaming.
- **Configurable SLA & Escalation Engine**: Priority-based SLA targets with per-department overrides, scheduled background overdue sweep, manual/automatic escalation tracking, and PDF dossier/executive report generation (`PDFKit`).

---

## Database Architecture (14 Mongoose Schemas)

Defined in `backend/src/models/mongooseModels.ts`:
1. `User` — accounts, bcrypt hashes, RBAC roles, lockout counters
2. `Department` — codes, heads, status, per-priority SLA overrides
3. `Staff` — employee codes, designations, specializations, workload capacity
4. `Complaint` — reference IDs, priorities, statuses, SLA deadlines, dedupe hashes
5. `ComplaintAssignment` — full routing & reassignment audit history
6. `ComplaintStatusHistory` — chronological timeline of status transitions
7. `ComplaintComment` — public messages, info requests, and staff-only internal notes
8. `ComplaintAttachment` — evidence metadata mapped to private UUID storage
9. `Notification` — per-user event alerts synced over Socket.IO
10. `SLAPolicy` — configurable Critical/High/Medium/Low response & resolution targets
11. `Escalation` — automatic SLA breach & manual escalation log
12. `Feedback` — complainant post-resolution ratings & reviews
13. `AuditLog` — immutable administrative & security audit trail
14. `Session` — rotating refresh token hashes with revocation support

---

## Installation & Environment Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure secrets:
   - `MONGODB_URI`: MongoDB Atlas or local MongoDB connection string (when omitted in development, a local file-backed Mongoose-compatible store is automatically used in `private_data/`).
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: 64-byte hex signing secrets.
   - `ADMIN_INITIAL_PASSWORD`: Optional initial password for `raghurajpratapsingh8787@gmail.com` (if omitted, initialize securely via the one-time First-Run Admin Setup screen).
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: Optional Nodemailer SMTP credentials.
3. Run development server (Express + Socket.IO + Vite on port 3000):
   ```bash
   npm run dev
   ```
4. Build & run production:
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```
5. Execute automated unit tests:
   ```bash
   npm test
   ```

---

## Security Controls

- **Password Security**: `bcryptjs` (cost factor 12) + 5-attempt lockout protection.
- **Session Hardening**: Short-lived JWT access tokens held strictly in JS memory (`Authorization: Bearer`, never stored in `localStorage`/`sessionStorage`), paired with `HttpOnly` rotating refresh token cookies and CSRF header/origin checks.
- **Injection & Upload Defense**: Recursive NoSQL operator & prototype-pollution sanitizer, Zod validation on every endpoint, strict CORS allowlist, Helmet headers, Express rate limiting, and magic-byte verified file uploads stored outside public directories.
- **Privacy**: Anonymous complaints mask submitter identity from non-owners; staff internal notes are filtered server-side and excluded from complainant Socket.IO broadcasts.
