import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  "projectId": "studio-4348223102-614e3",
  "appId": "1:1006760105798:web:996ac184739a077f187747",
  "apiKey": "AIzaSyCvrRL8eUC45nCLAhOehZgJk5-CkGhytqE",
  "authDomain": "studio-4348223102-614e3.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "1006760105798"
};

/**
 * environment-agnostic initialization for use in both
 * client hooks and server-side logic (Webhooks/Actions).
 */
export function initializeFirebase() {
  if (!getApps().length) {
    let firebaseApp;
    try {
      // In a server environment (Cloud Run), initializeApp() often picks up 
      // service account credentials automatically.
      firebaseApp = initializeApp(firebaseConfig);
    } catch (e) {
      firebaseApp = initializeApp(firebaseConfig);
    }
    return getSdks(firebaseApp);
  }
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp)
  };
}
