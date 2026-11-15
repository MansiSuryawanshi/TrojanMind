import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const REQUIRED_VITE_VARS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID"
];

console.group("[Firebase-Config] Initializing Core...");
const missingVars = REQUIRED_VITE_VARS.filter(v => !import.meta.env[v]);
if (missingVars.length > 0) {
  console.warn(`[Firebase-Config] Using Dummy keys. Missing: ${missingVars.join(", ")}`);
} else {
  console.log("[Firebase-Config] All Vercel/Vite environment variables detected.");
}
console.groupEnd();

// Provide placeholder keys for the initial integration.
// Replace with your real Firebase config from the Firebase Console.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKey",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "studybuddy-dummy.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "studybuddy-dummy",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "studybuddy-dummy.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:dummy"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/** True only when every Firebase env var is set (i.e. we are not on dummy keys). */
export const isFirebaseConfigured = missingVars.length === 0;

/**
 * Firebase Authentication. In the browser, getAuth() defaults to local
 * (IndexedDB) persistence, so the signed-in session survives page reloads.
 * Firebase manages tokens itself — we never store passwords or tokens.
 */
export const auth = getAuth(app);
