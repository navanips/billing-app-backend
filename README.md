# Billing App — Backend

Node.js + Express + TypeScript + PostgreSQL (via Prisma). Implements the
Products, Billing, Auth, Staff, Permissions, and Settings APIs.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure your database and secrets**
   ```bash
   cp .env.example .env
   ```
   Set `DATABASE_URL` to your Postgres instance, and change `JWT_SECRET` to
   a long random string (used to sign login tokens).

3. **Run migrations**
   ```bash
   npx prisma migrate dev --name add_auth_and_permissions
   ```

4. **Seed data** (Master account, default permissions, sample products)
   ```bash
   npm run prisma:seed
   ```
   This prints the Master account's login email and a default password —
   **change that password after your first login** (via the Change Password
   screen in the app, or `POST /api/v1/auth/change-password`).

5. **Start the dev server**
   ```bash
   npm run dev
   ```
   API is now at `http://localhost:4000/api/v1`.

## Notes on public registration & password reset

- `POST /auth/register` is public and always assigns the `STAFF` role —
  it can't be used to self-promote to Branch Manager or Master. Set
  `ALLOW_PUBLIC_REGISTRATION=false` in `.env` to disable it entirely
  (returns 403) once you'd rather Master create every account via the
  Staff page instead.
- Forgot-password doesn't send real email yet — the reset link is
  printed to this server's console. Swap the `console.log` in
  `routes/auth.ts`'s `/forgot-password` handler for a real email
  provider (e.g. nodemailer + SMTP, SendGrid, Resend) when you're ready.
- Reset tokens expire after 1 hour and are single-use (`PasswordResetToken`
  table).

## Roles & permissions

Three roles: `MASTER`, `BRANCH_MANAGER`, `STAFF`.

- **MASTER** always has full access — this is hardcoded, not stored in the
  database, so it's impossible to lock the master account out of the app.
- **BRANCH_MANAGER** and **STAFF** have permissions controlled by a
  togglable matrix (`RolePermission` table), editable only by MASTER via
  `GET/PUT /api/v1/permissions`.

Togglable permissions (see `src/constants/permissions.ts`):

| Key | What it gates |
|-----|----------------|
| `products.create` | Adding a product |
| `products.edit` | Editing a product |
| `products.delete` | Deleting a product |
| `billing.view_all` | Seeing every staff member's bills (not just your own) |
| `staff.manage` | Viewing/creating/editing/deleting staff accounts |
| `settings.manage` | Editing company name & logo |

Viewing products and creating a bill are **baseline actions** available to
every logged-in role regardless of permissions — otherwise the app would be
unusable for a brand-new Staff account.

Login and `GET /api/v1/auth/me` responses include a `permissions: string[]`
array — the frontend uses this array directly rather than re-implementing
the role logic.

## Endpoints

| Method | Endpoint                         | Notes |
|--------|-----------------------------------|-------|
| POST   | `/api/v1/auth/login`              | Public |
| POST   | `/api/v1/auth/register`           | Public (toggle with `ALLOW_PUBLIC_REGISTRATION`) — always creates a STAFF account |
| POST   | `/api/v1/auth/forgot-password`    | Public — always returns a generic message; prints the reset link to the server console (no email service wired up yet) |
| POST   | `/api/v1/auth/reset-password`     | Public — consumes the token from the forgot-password link |
| GET    | `/api/v1/auth/me`                 | Any logged-in user |
| PUT    | `/api/v1/auth/profile`            | Any logged-in user — edit own name/email |
| POST   | `/api/v1/auth/change-password`    | Any logged-in user |
| GET    | `/api/v1/products`, `/products/:id` | Any logged-in user |
| POST   | `/api/v1/products`                | Needs `products.create` |
| PUT    | `/api/v1/products/:id`            | Needs `products.edit` |
| DELETE | `/api/v1/products/:id`            | Needs `products.delete` |
| GET    | `/api/v1/bills`, `/bills/:id`      | Any logged-in user (filtered to own bills unless `billing.view_all`) |
| POST   | `/api/v1/bills`                   | Any logged-in user |
| GET/POST/PUT/DELETE | `/api/v1/users`      | Needs `staff.manage` |
| GET/PUT | `/api/v1/permissions`            | MASTER only |
| GET    | `/api/v1/settings`                | Public (so the login screen can show branding) |
| PUT    | `/api/v1/settings`                | Needs `settings.manage` |
| POST   | `/api/v1/settings/logo`           | Needs `settings.manage` — multipart upload, field name `logo` |

Full request/response shapes for Products/Bills are in `billing-api-design.md`
(auth/permissions/settings were added after that doc was written).

## Updating after a schema change

```bash
npx prisma migrate dev --name <describe_the_change>
```

## Production build

```bash
npm run build
npm start
```
