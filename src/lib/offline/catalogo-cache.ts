/*
 * Caché offline del catálogo (Tanda 19) — IndexedDB puro, sin dependencias.
 * Guarda una foto del catálogo del POS cuando hay conexión, para poder CONSULTAR
 * precios y existencias offline. Es solo lectura: cobrar exige red (NCF/FEFO).
 */
const DB_NAME = 'wfarmacia';
const STORE = 'catalogo';
const KEY = 'snapshot';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('sin IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Guarda la foto del catálogo (llamar cuando hay conexión). No lanza. */
export async function guardarCatalogo<T>(items: T[]): Promise<void> {
  try {
    const db = await abrir();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ items, guardadoEn: Date.now() }, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* offline-cache best-effort: si falla, la app sigue igual */
  }
}

/** Lee la última foto del catálogo (o null). No lanza. */
export async function leerCatalogo<T>(): Promise<{ items: T[]; guardadoEn: number } | null> {
  try {
    const db = await abrir();
    const val = await new Promise<{ items: T[]; guardadoEn: number } | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as { items: T[]; guardadoEn: number } | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return val;
  } catch {
    return null;
  }
}
