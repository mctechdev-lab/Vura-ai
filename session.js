// session.js
// Persistent user storage using IndexedDB (NOT just login session)

const DB_NAME = "vura-auth";
const STORE = "users";
const SESSION_KEY = "current_session"; // fixed key for active session
const VERSION = 2;

// ============================
// Open Database
// ============================
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "uid" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============================
// Save / Update User Profile
// Also saves a "current_session" record so guard.js can
// read without knowing the uid.
// ============================
export async function saveSession(uid, newData) {
  if (!uid) throw new Error("UID is required to save session");

  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);

  return new Promise((resolve, reject) => {
    const getReq = store.get(uid);

    getReq.onsuccess = () => {
      const existingData = getReq.result || {};

      const mergedData = {
        ...existingData,
        ...newData,
        uid: uid,
        lastUpdated: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
      };

      store.put(mergedData);

      // Also save under the fixed SESSION_KEY so guard.js can read it
      store.put({ ...mergedData, uid: SESSION_KEY });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

// ============================
// Load User Profile
// If uid is omitted, returns the current active session
// ============================
export async function getSession(uid) {
  const key = uid || SESSION_KEY;

  const db = await openDB();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);

  return new Promise((resolve) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

// ============================
// Delete User (Logout cleanup)
// ============================
export async function clearSession(uid) {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);

  if (uid) store.delete(uid);
  store.delete(SESSION_KEY); // always clear the active session pointer
}
