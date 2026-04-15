import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, onValue, push, update } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDurJt3_95WlSl2NFCLRI3zF6B-P1g-zbg",
  authDomain: "transit-rx.firebaseapp.com",
  databaseURL: "https://transit-rx-default-rtdb.firebaseio.com",
  projectId: "transit-rx",
  appId: "1:727975738982:web:e475a53626f787ff5a77a7"
};

let app;
let db;

export function getFirebaseDB() {
  if (!db) {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
  }
  return db;
}

export async function fbSet(path, data) {
  try {
    const database = getFirebaseDB();
    await set(ref(database, path), data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function fbGet(path) {
  try {
    const database = getFirebaseDB();
    const snap = await get(ref(database, path));
    return { ok: true, data: snap.val() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function fbUpdate(path, data) {
  try {
    const database = getFirebaseDB();
    await update(ref(database, path), data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function fbListen(path, callback) {
  const database = getFirebaseDB();
  const unsubscribe = onValue(ref(database, path), (snap) => {
    callback(snap.val());
  });
  return unsubscribe;
}

export async function fbPush(path, data) {
  try {
    const database = getFirebaseDB();
    const newRef = push(ref(database, path), data);
    return { ok: true, key: newRef.key };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
