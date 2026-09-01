// Run with: npm run seed:sources
// Manual re-seed — use this after editing config/sources.ts to push your
// changes into Firestore. You do NOT need to run this before first use:
// /api/cron/daily auto-seeds on its first run if the sources collection is
// still empty (see lib/intelligence/seed.ts's ensureSourcesSeeded). This
// script exists for the case where sources already exist and you want to
// push edits/additions into them.
//
// This is a plain Node/tsx process, NOT the Next.js runtime — Next.js
// loads .env.local for you automatically, but a standalone script like
// this one does not. `npm run seed:sources` passes `--env-file=.env.local`
// (Node 20.6+) so getAdminDb() below actually has FIREBASE_ADMIN_* to work
// with. If you run this file directly instead of via npm, add that flag
// yourself or the Admin SDK will throw immediately.
import { seedSources } from "../lib/intelligence/seed";

seedSources()
  .then(({ created, updated }) => {
    console.log(`Seed complete. Created: ${created}, Updated: ${updated}.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
