export const calculateDynamicBatchSize = (): number => {
    // Default fallback size
    let batchSize = 6;
    
    // 1. Adjust based on screen size (estimate ~600px per post, we want ~1.5 to 2 screens worth)
    if (typeof window !== 'undefined') {
        const screenHeight = window.innerHeight;
        batchSize = Math.max(4, Math.ceil((screenHeight * 2) / 600));
    }
    
    // 2. Adjust based on network conditions if available (Network Information API)
    if (typeof navigator !== 'undefined' && (navigator as any).connection) {
        const conn = (navigator as any).connection;
        
        // Data Saver enabled or slow 2G/3G network
        if (conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === '3g') {
            batchSize = Math.max(3, Math.floor(batchSize / 2)); 
        } 
        // Very fast 4G+ connection with high downlink speed
        else if (conn.effectiveType === '4g' && conn.downlink && conn.downlink > 5) {
            batchSize += 2; // Can afford to pre-fetch more seamlessly
        }
    }
    
    // Cap it to sensible limits to prevent memory spikes on ultra-wides or massive network bursts
    return Math.min(Math.max(batchSize, 3), 12);
};
