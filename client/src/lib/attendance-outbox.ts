export interface DailyAttendancePayload {
  attendanceDate: string;
  annee: string;
  entries: Array<{ studentId: string; status: string; isAbsent: boolean }>;
}

interface QueuedAttendance {
  id: string;
  payload: DailyAttendancePayload;
}

const DATABASE_NAME = "school-manager-offline";
const STORE_NAME = "daily-attendance";
let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open attendance outbox"));
    });
  }
  return databasePromise;
}

export async function queueDailyAttendance(payload: DailyAttendancePayload): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ id: crypto.randomUUID(), payload } satisfies QueuedAttendance);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to queue attendance"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Attendance queue transaction aborted"));
  });
}

export async function flushDailyAttendance(baseUrl: string): Promise<number> {
  if (!navigator.onLine || !("indexedDB" in window)) return 0;
  const database = await openDatabase();
  const items = await new Promise<QueuedAttendance[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as QueuedAttendance[]);
    request.onerror = () => reject(request.error ?? new Error("Unable to read attendance outbox"));
  });

  let synced = 0;
  for (const item of items) {
    const response = await fetch(`${baseUrl}api/v1/attendance/sync`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.payload),
    });
    if (!response.ok) continue;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(item.id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear synced attendance"));
    });
    synced++;
  }
  return synced;
}