// Fix: Use Firebase v8 compatibility imports to resolve module errors.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBxdzcKYNEywQhK8MpdPpJwV17Ahux0NJQ",
  authDomain: "primn-f0fa8.firebaseapp.com",
  projectId: "primn-f0fa8",
  storageBucket: "primn-f0fa8.appspot.com",
  messagingSenderId: "887421330432",
  appId: "1:887421330432:web:59c1b5c4f77a23521164e5",
  measurementId: "G-KCWQ5S5Q6H"
};

// Fix: Initialize Firebase using the v8 compatibility API.
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export const auth = firebase.auth();
export const db = firebase.firestore();

const googleProvider = new firebase.auth.GoogleAuthProvider();
const appleProvider = new firebase.auth.OAuthProvider('apple.com');

export const signInWithGoogle = async () => {
  if (Capacitor.isNativePlatform()) {
     try {
       const result = await FirebaseAuthentication.signInWithGoogle({});
       const credential = firebase.auth.GoogleAuthProvider.credential(result.credential?.idToken);
       return auth.signInWithCredential(credential);
     } catch (error) {
       console.error("Native Google Login failed:", error);
       throw error;
     }
  } else {
     return auth.signInWithPopup(googleProvider);
  }
};

export const signInWithApple = async () => {
  if (Capacitor.isNativePlatform()) {
     try {
       const result = await FirebaseAuthentication.signInWithApple({});
       const credential = firebase.auth.OAuthProvider('apple.com').credential({
         idToken: result.credential?.idToken,
         rawNonce: result.credential?.rawNonce
       });
       return auth.signInWithCredential(credential);
     } catch (error) {
       console.error("Native Apple Login failed:", error);
       throw error;
     }
  } else {
     return auth.signInWithPopup(appleProvider);
  }
};

export const logOut = async () => {
  if (Capacitor.isNativePlatform()) {
     await FirebaseAuthentication.signOut();
  }
  return auth.signOut();
};