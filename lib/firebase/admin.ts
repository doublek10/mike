// Server-only Firebase Admin SDK. NEVER import this from a Client Component.
// Requires FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY as
// Vercel environment variables (Section 50 — Security).
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function buildAdminApp(): App {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Vercel env vars store \n literally — must be restored for the SDK.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY in your environment."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

// Lazy singletons: credentials are only read/validated the first time
// getAdminDb() is actually called (i.e. at request time on Vercel), never
// at module-import time. This matters because Next.js imports every route
// module during `next build` to collect page data — eagerly initializing
// here would make the build fail whenever env vars aren't set locally.
let _app: App | null = null;
let _db: FirebaseFirestore.Firestore | null = null;

export function getAdminDb(): FirebaseFirestore.Firestore {
  if (!_db) {
    _app = buildAdminApp();
    _db = getFirestore(_app);
  }
  return _db;
}
