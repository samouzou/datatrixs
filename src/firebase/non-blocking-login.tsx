'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User,
} from 'firebase/auth';
import { doc, setDoc, Firestore, getDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * Ensures a user profile exists in Firestore.
 * If it doesn't exist, it creates one with the provided data.
 */
export function ensureUserProfile(db: Firestore, user: User, additionalData: any = {}): void {
  const userRef = doc(db, 'users', user.uid);
  
  // Check if doc exists first to avoid overwriting existing metadata on every login
  getDoc(userRef).then((docSnap) => {
    if (!docSnap.exists()) {
      const userData = {
        id: user.uid,
        externalAuthIdentifier: user.uid,
        email: user.email,
        firstName: additionalData.firstName || '',
        lastName: additionalData.lastName || '',
        role: additionalData.role || 'Admin', // Default to Admin for prototype simplicity
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setDoc(userRef, userData).catch((error) => {
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: userRef.path,
            operation: 'create',
            requestResourceData: userData,
          })
        );
      });
    }
  });
}

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  signInAnonymously(authInstance);
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(
  authInstance: Auth, 
  db: Firestore,
  email: string, 
  password: string,
  profileData: { firstName: string; lastName: string }
): void {
  createUserWithEmailAndPassword(authInstance, email, password)
    .then((userCredential) => {
      ensureUserProfile(db, userCredential.user, profileData);
    })
    .catch((error) => {
      // Handle auth errors locally if needed, but Firebase UI handles most
      console.error("Sign up failed", error);
    });
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  signInWithEmailAndPassword(authInstance, email, password);
}
