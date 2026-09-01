// Shared by scripts/seed-sources.ts (manual re-seed after editing
// config/sources.ts) and app/api/cron/daily/route.ts (auto-heal: seeds
// automatically on the first run if the sources collection is empty, so
// nobody has to remember to run a separate command before the pipeline
// works). Upserts by a deterministic id derived from the source name, so
// it's always safe to call — never creates duplicates.
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { SEED_SOURCES } from "@/config/sources";
import type { Source } from "@/types";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function seedSources(): Promise<{ created: number; updated: number }> {
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;

  for (const seed of SEED_SOURCES) {
    const id = slugify(seed.name);
    const ref = getAdminDb().collection(COLLECTIONS.SOURCES).doc(id);
    const existing = await ref.get();

    const source: Source = { id, createdAt: existing.exists ? existing.data()!.createdAt : now, ...seed };
    await ref.set(source, { merge: true });

    if (existing.exists) updated++;
    else created++;
  }

  return { created, updated };
}

/**
 * Seeds only if the sources collection is currently empty. Called at the
 * top of /api/cron/daily so a fresh deployment self-heals on its first run
 * instead of silently doing nothing until someone remembers to run
 * `npm run seed:sources` by hand. Does nothing (cheap: one .limit(1) read)
 * once sources already exist — editing config/sources.ts and wanting those
 * edits picked up still requires the manual script, since this only fires
 * on empty.
 */
export async function ensureSourcesSeeded(): Promise<{ seeded: boolean; created: number; updated: number }> {
  const existing = await getAdminDb().collection(COLLECTIONS.SOURCES).limit(1).get();
  if (!existing.empty) {
    return { seeded: false, created: 0, updated: 0 };
  }
  const { created, updated } = await seedSources();
  return { seeded: true, created, updated };
}
