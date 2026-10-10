# MMH Inventory — Metro Manila Hills Construction Supply

Mobile-first inventory & order management app (Phase 1 MVP) built with **Expo (React Native + TypeScript)** and **Supabase (Postgres + Auth + Realtime)**. One codebase runs on Android, iOS, and web.

## Features

- **Auth** — Supabase email/password login with persistent sessions
- **Check-in/out** — one-tap shift toggle on Home, saved per user
- **New Order** — product search, cart with qty steppers, editable delivery fee, cash/card/GCash
- **Stock** — searchable list, low-stock badges, admin add/edit products with audited stock adjustments
- **Receipts** — on-screen receipt + Print/Save-as-PDF (real text PDF: `expo-print` on native, jsPDF on web)
- **Admin dashboard** — today's stats, inventory value, recent orders, staff leaderboard, daily sales report (PDF/CSV), delivery fee setting, role management
- **Customizable** — admins can rebrand the app (store name, tagline, currency, receipt footer), restyle it (primary/accent colors, dark mode), tune ordering rules (payment methods, low-stock threshold), and manage the product category list — all from Admin → Settings, applied instantly

## 1. Set up the database (one time, ~2 minutes)

The Supabase project **HardwareIMS** already exists. Apply the schema:

1. Open https://supabase.com/dashboard/project/sbxjobepecuyhkmbfysw/sql/new
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run**

> Already installed before customization existed? Run `supabase/migration_customization.sql` instead — it adds the settings columns (branding, theme, ordering rules, categories) to your existing database. The app works either way; without the migration it just falls back to the built-in defaults.

This creates the tables (`profiles`, `products`, `customers`, `orders`, `order_items`, `stock_adjustments`, `settings`), triggers (auto-profile on signup, auto stock-decrement on order items), row-level security policies, seed products, and realtime publication.

## 2. Create users

1. Go to **Authentication → Users → Add user → Create new user**, enter email + password (check *Auto Confirm User*).
2. First user becomes staff by default. To make an admin, run this in the SQL editor (replace the UUID — find it in Authentication → Users):

```sql
update public.profiles set role = 'admin' where id = '<user-uuid>';
```

## 3. Configure & run

`.env` is already filled with the HardwareIMS URL and anon key. To use a different project later, copy `.env.example` to `.env` and paste values from Supabase → Project Settings → API.

```bash
npm install
npx expo start
```

Press `w` for web, `a` for Android emulator, or scan the QR with **Expo Go** on a phone.

## Architecture notes

```
src/
├── App.tsx              # Auth gate
├── navigation/          # Bottom tabs + receipt overlay
├── screens/
│   ├── auth/            # Login
│   ├── staff/           # Home, New Order, Stock, Receipt
│   └── admin/           # Admin dashboard
├── services/
│   ├── supabase.ts      # Client (env-driven)
│   ├── auth.tsx         # Auth context + check-in state
│   ├── db.ts            # Data layer (Supabase is the source of truth)
│   ├── reports.ts       # Daily-sales aggregate + CSV export
│   └── pdf.ts           # jsPDF report/receipt builders (web)
├── theme/  types/  utils/
supabase/schema.sql      # Paste into SQL editor
```

**Online-only:** the app reads and writes directly against Supabase. A connection is required to place an order; if Supabase is unreachable, the action surfaces an error instead of queueing locally. Settings keep a small on-device cache so the last known branding still renders while the session loads.

## Customization

Everything in **Admin → Settings** is stored in the single `settings` row and applies live:

| Group | What admins can change |
| --- | --- |
| 🏷️ Branding | Store name & tagline (login screen, headers, receipts, PDF reports), currency symbol, receipt footer |
| 🎨 Appearance | Primary & accent color (preset swatches or any hex), dark mode |
| 🛒 Ordering rules | Default delivery fee, which payment methods are accepted, low-stock alert threshold |
| 🗂️ Categories | The product category quick-picks used when adding/editing products |

Settings are cached on-device so the last known branding renders instantly on launch. The theme engine (`src/theme/index.ts`) mutates a shared palette; every screen rebuilds its styles when the settings version changes, so no restart is needed.

## Security model (RLS)

- All tables are locked to authenticated users.
- Staff can read everything, insert their own orders, and log stock adjustments.
- Managers/admins can manage products, settings, and orders.
- Only admins can change user roles.
- `my_role()` is a `SECURITY DEFINER` helper to avoid recursive RLS on `profiles`.
