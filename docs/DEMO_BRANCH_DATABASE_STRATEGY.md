# Demo Branch Database Strategy

This repo now has a dedicated `demo` branch so demo work stays isolated from `main`.

## Git safety

- Work on `demo`
- Push `demo` to `origin/demo`
- A local `pre-push` hook blocks `demo -> origin/main`

## Phantom + Neon

`restaurant_platform` demo should use its own dedicated Supabase project for now.

Use the demo env template:

- copy `.env.demo.example` to your local `.env.demo.local`
- the demo branch scripts load `.env` first, then `.env.demo.local` as overrides

## Important limitation

Phantom uses:

- Postgres data access through `DATABASE_URL`
- Supabase auth and readiness variables for live operator login

So the demo-safe setup is a separate Supabase project plus the pooled Postgres connection from that same project.

## Recommended split for the full demo stack

- `restaurant_platform` demo branch:
  - use a dedicated demo Supabase project
- `mealops_platform` demo branch:
  - keep a dedicated demo Supabase project

CoachImHungry still relies heavily on Supabase auth, RPCs, realtime, and edge functions, so keeping both apps on dedicated demo Supabase projects is the most stable setup.
