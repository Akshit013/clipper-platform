# ClipperPlatform

A full-stack creator operations platform for managing short-form video submissions, reviews, approved-view tracking, INR earnings, payouts, and community competitions.

> **Portfolio repository:** This README intentionally does not link to a live deployment.

## Highlights

- **Clip submission and review workflow** — submit Reels, report updated metrics when requested, and track review status.
- **Admin review tools** — review, request updates, approve or reject submissions, with returned submissions separated for faster processing.
- **Wallet and payouts** — show earnings and payout availability in INR, including approved bonus credits.
- **Prize contests** — configure contests and eligibility; end-of-contest draws are designed to use explicit eligibility and an auditable result.
- **Opt-in leaderboard and community stats** — participation and visibility are user-controlled, subject to admin eligibility.
- **Responsive UI** — layouts designed for both desktop and mobile.

## Technology

- Next.js and React
- TypeScript
- Supabase (Postgres, authentication, and server-side data access)
- Vercel deployment tooling

## Local setup

1. Install a current Node.js LTS release.
2. Clone this repository and install dependencies:

   ```bash
   git clone https://github.com/Akshit013/clipper-platform.git
   cd clipper-platform
   npm install
   ```

3. Create a local `.env.local` using the environment variable names required by the application. Add your own Supabase project URL and public anon key; keep service-role keys and all secrets server-side only.
4. Apply the Supabase migrations in `supabase/migrations` in numerical order to a development database.
5. Run the development server:

   ```bash
   npm run dev
   ```

6. Create a production build before deployment:

   ```bash
   npm run build
   ```

## Configuration and security

- Never commit `.env.local`, Supabase service-role keys, access tokens, passwords, or production data.
- Review Row Level Security policies and server-side authorization before deploying to a new environment.
- Use a development Supabase project when experimenting with schema migrations.
- Run `npm run build` and test the core submission, review, approval, wallet, and contest flows before each deployment.

## Project status

This project is under active development. Check the code and migration history before using it with real users or financial records. Features involving wallet balances, payouts, contests, or prize draws should receive appropriate security, operational, and legal review before production use.

## License

No license has been added yet. Unless a license is provided, the source is published for viewing but reuse and redistribution are not automatically granted.
