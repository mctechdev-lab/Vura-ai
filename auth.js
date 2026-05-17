// ============================================================
// auth.js — Vura AI Platform
// Handles: Email/Password, Google, Phone OTP, Session, Firestore
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { saveSession, clearSession } from "./session.js";

// ─── Firebase Config ────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAmk0Nyxfk4u9q_Ma2esj4ch8XMW6e49o4",
  authDomain: "vura-ai2026.firebaseapp.com",
  projectId: "vura-ai2026",
  storageBucket: "vura-ai2026.firebasestorage.app",
  messagingSenderId: "973528287420",
  appId: "1:973528287420:web:bceffa7ce783add77528b9",
  measurementId: "G-RGMSXC3BM4"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ─── Persist Session to IndexedDB ───────────────────────────
async function persistSession(user) {
  await saveSession(user.uid, {
    uid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    phoneNumber: user.phoneNumber || '',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  });
}

// ─── Create User Profile in Firestore ───────────────────────
function generateRefCode(uid) {
  return 'VUX-' + uid.substring(0, 6).toUpperCase();
}

async function createUserProfile(user, extras = {}) {
  const ref  = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      name: user.displayName || extras.name || 'Vura Student',
      email: user.email || '',
      phone: user.phoneNumber || '',
      photoURL: user.photoURL || '',
      plan: 'free',
      planExpiry: null,
      vuxBalance: 300,
      dailyVUX: 300,
      lastClaim: null,
      referralCode: generateRefCode(user.uid),
      referredBy: extras.referredBy || null,
      totalQuizzes: 0,
      totalCorrect: 0,
      totalQuestions: 0,
      totalGamesPlayed: 0,
      totalLessonsCompleted: 0,
      onboarded: false,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      lastActive: serverTimestamp()
    });

    await setDoc(doc(db, 'wallets', user.uid), {
      uid: user.uid,
      balance: 300,
      totalEarned: 300,
      totalSpent: 0,
      lastUpdated: serverTimestamp()
    });

    // Log welcome VUX transaction
    await addDoc(collection(db, 'wallets', user.uid, 'transactions'), {
      type: 'Welcome Bonus',
      amount: 300,
      timestamp: serverTimestamp(),
      date: new Date().toLocaleString()
    });

  } else {
    await updateDoc(ref, {
      lastLogin: serverTimestamp(),
      lastActive: serverTimestamp()
    });
  }
}

// ─── Sign Up ────────────────────────────────────────────────
export async function signUpUser({ email, password, name, referredBy }) {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(res.user, { displayName: name });
    await createUserProfile(res.user, { name, referredBy });
    await persistSession(res.user);
    return { success: true, user: res.user };
  } catch (err) {
    return { success: false, error: friendlyError(err.code) };
  }
}

// ─── Login ──────────────────────────────────────────────────
export async function loginUser({ email, password }) {
  try {
    const res = await signInWithEmailAndPassword(auth, email, password);
    await createUserProfile(res.user);
    await persistSession(res.user);
    return { success: true, user: res.user };
  } catch (err) {
    return { success: false, error: friendlyError(err.code) };
  }
}

// ─── Google Sign-In ─────────────────────────────────────────
export async function googleLoginUser() {
  try {
    const res = await signInWithPopup(auth, googleProvider);
    await createUserProfile(res.user);
    await persistSession(res.user);
    return { success: true, user: res.user };
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'Sign-in cancelled.' };
    }
    return { success: false, error: friendlyError(err.code) };
  }
}

// ─── Phone OTP Step 1 ───────────────────────────────────────
export async function sendPhoneOTP(phoneNumber, containerId) {
  try {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
        size: 'invisible', callback: () => {}
      });
    }
    const result = await signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier);
    window.confirmationResult = result;
    return { success: true };
  } catch (err) {
    window.recaptchaVerifier = null;
    return { success: false, error: friendlyError(err.code) };
  }
}

// ─── Phone OTP Step 2 ───────────────────────────────────────
export async function verifyPhoneOTP(code) {
  try {
    if (!window.confirmationResult) throw new Error('No OTP session.');
    const res = await window.confirmationResult.confirm(code);
    await createUserProfile(res.user);
    await persistSession(res.user);
    return { success: true, user: res.user };
  } catch (err) {
    return { success: false, error: 'Invalid OTP code. Please try again.' };
  }
}

// ─── Password Reset ─────────────────────────────────────────
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err.code) };
  }
}

// ─── Logout ─────────────────────────────────────────────────
export async function logoutUser(uid) {
  try {
    await signOut(auth);
    if (uid) await clearSession(uid);
    localStorage.removeItem('guestMode');
    localStorage.removeItem('guestUser');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Watch Auth State ────────────────────────────────────────
export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      const isGuest = localStorage.getItem('guestMode') === 'true';
      if (isGuest) {
        const guestData = localStorage.getItem('guestUser');
        const guestUser = guestData ? JSON.parse(guestData) : null;
        if (guestUser) { callback(guestUser); return; }
      }
      callback(null);
      return;
    }
    callback(user);
  });
}

// ─── Get User Profile ────────────────────────────────────────
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// ─── Get Current Firebase User ───────────────────────────────
export function getCurrentFirebaseUser() {
  return auth.currentUser;
}

// ─── Export db & auth ────────────────────────────────────────
export { db, auth };

// ─── Friendly Error Messages ─────────────────────────────────
function friendlyError(code) {
  const map = {
    'auth/email-already-in-use':    'This email is already registered.',
    'auth/invalid-email':           'Please enter a valid email address.',
    'auth/weak-password':           'Password must be at least 6 characters.',
    'auth/user-not-found':          'No account found with this email.',
    'auth/wrong-password':          'Incorrect password. Please try again.',
    'auth/invalid-credential':      'Incorrect email or password.',
    'auth/too-many-requests':       'Too many attempts. Please wait a moment.',
    'auth/invalid-verification-code': 'Invalid OTP code.',
    'auth/invalid-phone-number':    'Please enter a valid phone number with country code.',
    'auth/network-request-failed':  'Network error. Check your connection.',
    'auth/popup-blocked':           'Popup blocked. Please allow popups for this site.',
    'auth/unauthorized-domain':     'This domain is not authorized. Please contact support.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
