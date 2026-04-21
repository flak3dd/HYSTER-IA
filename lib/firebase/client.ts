import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"

const APP_NAME = "hysteria2-c2-advanced-web"

function readClientConfig(): FirebaseOptions {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID

  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error(
      "Firebase web config missing. Set NEXT_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID / APP_ID.",
    )
  }
  return { apiKey, authDomain, projectId, appId }
}

export function firebaseClientApp(): FirebaseApp {
  const existing = getApps().find((a) => a.name === APP_NAME)
  if (existing) return existing
  try {
    return getApp(APP_NAME)
  } catch {
    return initializeApp(readClientConfig(), APP_NAME)
  }
}

export function clientAuth(): Auth {
  return getAuth(firebaseClientApp())
}

export function clientFirestore(): Firestore {
  return getFirestore(firebaseClientApp())
}
