import {
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app"
import { getAuth, type Auth } from "firebase-admin/auth"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

const APP_NAME = "hysteria2-c2-advanced"

function buildApp(): App {
  // DEV BYPASS - No credentials needed for proxy strategy testing
  return initializeApp(
    {
      projectId: "hysteriac2-dev-bypass",
    },
    APP_NAME,
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

