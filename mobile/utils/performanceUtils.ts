export const calculateDynamicBatchSize = (): number => {
    let batchSize = 6;
    if (typeof window !== 'undefined') {
        const screenHeight = window.innerHeight;
        batchSize = Math.max(4, Math.ceil((screenHeight * 2) / 600));
    }
    if (typeof navigator !== 'undefined' && (navigator as any).connection) {
        const conn = (navigator as any).connection;
        if (conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === '3g') {
            batchSize = Math.max(3, Math.floor(batchSize / 2)); 
        } else if (conn.effectiveType === '4g' && conn.downlink && conn.downlink > 5) {
            batchSize += 2;
        }
    }
    return Math.min(Math.max(batchSize, 3), 12);
};
