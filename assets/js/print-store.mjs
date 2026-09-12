const NAME = 'beo-print-draft';
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('artwork');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Enable browser storage to keep this artwork through checkout.'));
  });
}
export async function savePrintDraft(image) {
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('artwork','readwrite');
    tx.objectStore('artwork').put({ image, savedAt: Date.now() },'current');
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close();
}
export async function readPrintDraft() {
  const db = await database();
  const value = await new Promise((resolve, reject) => {
    const request = db.transaction('artwork').objectStore('artwork').get('current');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const fresh=value && Date.now() - value.savedAt < 24 * 3600000;
  if (value && !fresh) await new Promise((resolve,reject)=>{
    const tx=db.transaction('artwork','readwrite');tx.objectStore('artwork').delete('current');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  db.close();
  return fresh ? value : null;
}
