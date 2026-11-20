function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fieldwork-original-papers', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('Original PDF could not be cached in this browser.'));
  });
}
export async function saveOriginal(accountId: string, hash: string, file: File) {
  const db = await openFiles();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(file, accountId + ':' + hash);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(Error('Original PDF could not be cached.')); tx.onabort = tx.onerror;
  }); } finally { db.close(); }
}
export async function readOriginal(accountId: string, hash: string): Promise<Blob | undefined> {
  const db = await openFiles();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').get(accountId + ':' + hash);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(Error('Original PDF could not be opened.'));
  }); } finally { db.close(); }
}
