"use client";
// Offline storage for the POS: catalogue snapshot, queued bills and till identity (IndexedDB).
import type { PosSnapshot } from "@/server/services/offline";

const DB = "stockpilot-pos";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "clientId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

const kvGet = <T,>(key: string) => run<T | undefined>("kv", "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
const kvSet = (key: string, value: unknown) => run("kv", "readwrite", (s) => s.put(value, key));

// Keys are namespaced by business so two businesses on one device never mix data.
export interface Till { code: string; token: string }
export const getTill = (orgId: string) => kvGet<Till>(`till:${orgId}`);
export const setTill = (orgId: string, till: Till) => kvSet(`till:${orgId}`, till);
export const getSnapshot = (orgId: string, locationId: string) => kvGet<PosSnapshot>(`snapshot:${orgId}:${locationId}`);
export const setSnapshot = (orgId: string, snap: PosSnapshot) => kvSet(`snapshot:${orgId}:${snap.locationId}`, snap);

/**
 * Next number in this till's offline series. Read-increment-write happens in one IndexedDB
 * transaction so two tabs can never take the same number.
 */
export async function nextOfflineSeq(orgId: string, series: string): Promise<number> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    const key = `seq:${orgId}:${series}`;
    let next = 1;
    const get = store.get(key);
    get.onsuccess = () => {
      next = ((get.result as number | undefined) ?? 0) + 1;
      store.put(next, key);
    };
    tx.oncomplete = () => {
      db.close();
      resolve(next);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export interface QueuedSale {
  clientId: string;
  orgId: string;
  number: string;
  createdAt: string;
  payload: Record<string, unknown>; // offlineSaleInput shape
  receipt: import("@/lib/receipt").ReceiptData;
  error?: string;
}

export const queueSale = (sale: QueuedSale) => run("outbox", "readwrite", (s) => s.put(sale));
export const removeQueued = (clientId: string) => run("outbox", "readwrite", (s) => s.delete(clientId));
export async function listQueued(orgId: string): Promise<QueuedSale[]> {
  const all = await run<QueuedSale[]>("outbox", "readonly", (s) => s.getAll() as IDBRequest<QueuedSale[]>);
  return all.filter((q) => q.orgId === orgId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
