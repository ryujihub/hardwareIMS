# MMH Inventory — Metro Manila Hills Construction Supply

Mobile-first inventory & order management app (Phase 1 MVP) built with **Expo (React Native + TypeScript)** and **Supabase (Postgres + Auth + Realtime)**. One codebase runs on Android, iOS, and web.

## Features

- **Auth** — Supabase email/password login with persistent sessions
- **Check-in/out** — one-tap shift toggle on Home, saved per user
- **New Order** — product search, cart with qty steppers, editable delivery fee, cash/card/GCash
- **Offline-first** — orders made offline are queued in AsyncStorage and sync automatically on reconnect
- **Stock** — searchable list, low-stock badges, admin add/edit products with audited stock adjustments
- **Receipts** — on-screen receipt + Print/Save-as-PDF via expo-print
- **Admin dashboard** — today's stats, inventory value, pending-sync count, recent orders, staff leaderboard, delivery fee setting, role management

## 1. Set up the database (one time, ~2 minutes)

The Supabase project **HardwareIMS** already exists. Apply the schema:

1. Open https://supabase.com/dashboard/project/sbxjobepecuyhkmbfysw/sql/new
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run**

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
├── App.tsx              # Auth gate + connectivity watcher + queue sync
├── navigation/          # Bottom tabs + receipt overlay
├── screens/
│   ├── auth/            # Login
│   ├── staff/           # Home, New Order, Stock, Receipt
│   └── admin/           # Admin dashboard
├── services/
│   ├── supabase.ts      # Client (env-driven)
│   ├── auth.tsx         # Auth context + check-in state
│   └── db.ts            # Data layer with offline fallback + sync
├── store/cache.ts       # AsyncStorage cache + offline order queue
├── theme/  types/  utils/
supabase/schema.sql      # Paste into SQL editor
```

**Offline behavior:** reads fall back to the last cached snapshot (an offline banner appears); writes to `orders` are queued with a local ID and flushed by `syncQueuedOrders()` on reconnect, app launch, and check-in. The receipt marks offline orders with the queued ID until synced.

## Security model (RLS)

- All tables are locked to authenticated users.
- Staff can read everything, insert their own orders, and log stock adjustments.
- Managers/admins can manage products, settings, and orders.
- Only admins can change user roles.
- `my_role()` is a `SECURITY DEFINER` helper to avoid recursive RLS on `profiles`.
