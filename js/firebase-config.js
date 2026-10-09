/* ============================================================
   Firebase configuration
   ------------------------------------------------------------
   Paste the config object from your Firebase project here.

   Where to find it:
     1. https://console.firebase.google.com  →  create a project
     2. Build → Firestore Database → Create database → Start in
        production mode → pick a region close to you
     3. Build → Authentication → Get started → enable
        "Email/Password"
     4. Project settings (gear icon) → Your apps → Web app (</>)
        → register the app → copy the firebaseConfig values below
     5. Paste the Firestore security rules from SETUP.md

   Until apiKey is filled in, the app runs fine in local-only
   mode: progress is saved in this browser, but does not follow
   you to other devices.
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const FIREBASE_READY = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
