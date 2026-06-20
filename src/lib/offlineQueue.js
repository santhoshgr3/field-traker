const DB_NAME = 'field-tracker-offline'
const STORE = 'location_queue'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { autoIncrement: true })
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })
}

export async function queuePing(ping) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add(ping)
    tx.oncomplete = resolve
    tx.onerror = e => reject(e.target.error)
  })
}

export async function getQueueCount() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = e => reject(e.target.error)
  })
}

async function getAllPings() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = e => reject(e.target.error)
  })
}

async function clearAll() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = resolve
    tx.onerror = e => reject(e.target.error)
  })
}

export async function syncQueue(supabase) {
  const pings = await getAllPings()
  if (pings.length === 0) return 0
  const { error } = await supabase.from('location_history').insert(pings)
  if (error) return 0
  await clearAll()
  // Update live location to the most recent ping
  const last = pings[pings.length - 1]
  await supabase.from('locations').upsert(
    { user_id: last.user_id, lat: last.lat, lng: last.lng, updated_at: last.recorded_at },
    { onConflict: 'user_id' }
  )
  return pings.length
}
