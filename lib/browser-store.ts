const DATABASE = "experiment-replication-v1";
const STORE = "workspace";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveWorkspace(key: string, value: unknown) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
export async function loadWorkspace<T>(key: string): Promise<T | undefined> {
  const db = await database();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function saveTrial(key: string, value: unknown) { return saveWorkspace(`trial:${key}`, value); }
export async function loadTrials<T>(): Promise<T[]> {
  const db = await database();
  const values = await new Promise<T[]>((resolve, reject) => {
    const results: T[] = [];
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(results);
      if (String(cursor.key).startsWith("trial:")) results.push(cursor.value as T);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  db.close();
  return values;
}
export async function clearTrials() {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).openCursor();
    request.onsuccess = () => { const cursor = request.result; if (cursor) { if (String(cursor.key).startsWith("trial:")) cursor.delete(); cursor.continue(); } };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
