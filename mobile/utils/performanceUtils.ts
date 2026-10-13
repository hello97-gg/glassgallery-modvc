export const calculateDynamicBatchSize = (): number => {
    // For mobile 2-column masonry layout, we need at least 18-24 images initially
    // to fill beyond the viewport so native momentum scrolling and scroll threshold listeners activate seamlessly.
    let batchSize = 20;
    
    if (typeof window !== 'undefined') {
        const screenHeight = window.innerHeight || 800;
        // In 2 columns, each row has 2 cards (~180px avg card height). 
        // We ensure 2 to 2.5 screens worth of images are present for immediate scrolling.
        const rowsNeeded = Math.ceil((screenHeight * 2.2) / 180);
        batchSize = Math.max(16, rowsNeeded * 2);
    }
    
    if (typeof navigator !== 'undefined' && (navigator as any).connection) {
        const conn = (navigator as any).connection;
        if (conn.saveData || conn.effectiveType === '2g') {
            batchSize = Math.max(12, Math.floor(batchSize / 2)); 
        } else if (conn.effectiveType === '4g' && conn.downlink && conn.downlink > 5) {
            batchSize += 6;
        }
    }
    
    return Math.min(Math.max(batchSize, 12), 36);
};
