import {
  cert,
  getApp,
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from "firebase-admin/app"
import { getAuth, type Auth } from "firebase-admin/auth"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { serverEnv } from "@/lib/env"

const APP_NAME = "hysteria2-c2-advanced"

function buildApp(): App {
  const env = serverEnv()

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return initializeApp(
      {
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
        projectId: env.FIREBASE_PROJECT_ID,
      },
      APP_NAME,
    )
  }

  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault() }, APP_NAME)
  }

  throw new Error(
    "Firebase admin credentials missing. Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.",
  )
}

export function firebaseAdminApp(): App {
  const existing = getApps().find((a) => a.name === APP_NAME)
  if (existing) return existing
  try {
    return getApp(APP_NAME)
  } catch {
    return buildApp()
  }
}

export function adminAuth(): Auth {
  return getAuth(firebaseAdminApp())
}

export function adminFirestore(): Firestore {
  return getFirestore(firebaseAdminApp())
}
