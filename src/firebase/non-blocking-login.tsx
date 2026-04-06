'use client';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  User,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, Firestore, getDoc, updateDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { UserRole } from '@/lib/types';

/**
 * Ensures a user profile exists in Firestore.
 * If it doesn't exist, it creates one.
 * If it exists but is missing a role (legacy account), it updates it.
 */
export function ensureUserProfile(db: Firestore, user: User, additionalData: any = {}): void {
  const userRef = doc(db, 'users', user.uid);
  
  getDoc(userRef).then((docSnap) => {
    if (!docSnap.exists()) {
      const userData = {
        id: user.uid,
        externalAuthIdentifier: user.uid,
        email: user.email,
        firstName: additionalData.firstName || '',
        lastName: additionalData.lastName || '',
        role: (additionalData.role as UserRole) || 'Admin',
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
    } else {
      const existingData = docSnap.data();
      // Self-heal: If existing user has no role, provide one
      if (!existingData.role) {
        updateDoc(userRef, {
          role: 'Admin' as UserRole,
          updatedAt: new Date().toISOString()
        }).catch((error) => {
          errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path: userRef.path,
              operation: 'update',
              requestResourceData: { role: 'Admin' },
            })
          );
        });
      }
    }
  });
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
      // Set the display name on the auth object immediately
      const fullName = `${profileData.firstName} ${profileData.lastName}`.trim();
      updateProfile(userCredential.user, { displayName: fullName });

      // Send verification email immediately
      sendEmailVerification(userCredential.user).catch(err => console.error("Failed to send verification email", err));
      ensureUserProfile(db, userCredential.user, profileData);
    })
    .catch((error) => {
      console.error("Sign up failed", error);
    });
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  signInWithEmailAndPassword(authInstance, email, password);
}
