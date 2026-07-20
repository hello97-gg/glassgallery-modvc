export const getCachedData = async <T>(key: string): Promise<T | null> => {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open("GlassGalleryDB", 1);
      request.onupgradeneeded = (e: any) => {
        if (!e.target.result.objectStoreNames.contains("cache")) {
          e.target.result.createObjectStore("cache");
        }
      };
      request.onsuccess = (e: any) => {
        const db = e.target.result;
        // Make sure the object store exists before trying to access it
        if (!db.objectStoreNames.contains("cache")) {
           resolve(null);
           return;
        }
        const tx = db.transaction("cache", "readonly");
        const store = tx.objectStore("cache");
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          if (getReq.result) {
            try {
              resolve(JSON.parse(getReq.result));
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
        getReq.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    } catch {
      // Fallback in case indexedDB is not available
      resolve(null);
    }
  });
};

export const setCachedData = async (key: string, data: any): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open("GlassGalleryDB", 1);
      request.onupgradeneeded = (e: any) => {
        if (!e.target.result.objectStoreNames.contains("cache")) {
          e.target.result.createObjectStore("cache");
        }
      };
      request.onsuccess = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("cache")) {
           resolve(false);
           return;
        }
        const tx = db.transaction("cache", "readwrite");
        const store = tx.objectStore("cache");
        // Store as string to avoid cloning complex objects directly
        const putReq = store.put(JSON.stringify(data), key);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => resolve(false);
      };
      request.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
};
