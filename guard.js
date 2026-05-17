// guard.js — Fixed: handles Guest Mode + Real session properly
import { getSession, clearSession } from "./session.js";

export async function protectApp() {
  // 1. Check guest mode first
  const isGuest = localStorage.getItem('guestMode') === 'true';
  const guestUser = localStorage.getItem('guestUser');

  if (isGuest && guestUser) {
    // Guest is active — allow access
    return;
  }

  // 2. Check Firebase auth via session (no uid needed — reads current_session key)
  const session = await getSession(); // no uid = reads "current_session"

  if (!session) {
    window.location.replace("login");
    return;
  }

  // 3. Check expiry
  if (session.expiresAt && Date.now() > session.expiresAt) {
    await clearSession(session.uid);
    window.location.replace("login");
    return;
  }
}

// Helper to check if current user is guest
export function isGuestMode() {
  return localStorage.getItem('guestMode') === 'true';
}

// Helper to get guest user data
export function getGuestUser() {
  const data = localStorage.getItem('guestUser');
  return data ? JSON.parse(data) : null;
}

// Helper to exit guest mode
export function exitGuestMode() {
  localStorage.removeItem('guestMode');
  localStorage.removeItem('guestUser');
  window.location.replace("login");
}
