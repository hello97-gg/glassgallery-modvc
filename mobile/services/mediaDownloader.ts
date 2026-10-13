import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\.]/g, '_').substring(0, 50);
}

function getExtensionFromUrl(url: string, defaultExt = 'jpg'): string {
  try {
    const clean = url.split('?')[0];
    const match = clean.match(/\.([a-zA-Z0-9]+)$/);
    if (match) {
      const ext = match[1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov', 'm4v'].includes(ext)) {
        return ext;
      }
    }
  } catch {}
  return defaultExt;
}

export const downloadMedia = async (
  mediaUrl: string, 
  title?: string, 
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; error?: string }> => {
  if (!mediaUrl) return { success: false, error: 'No media URL provided' };

  try {
    onStatus?.('Preparing download...');
    const isVideo = /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(mediaUrl) || mediaUrl.includes('video');
    const ext = getExtensionFromUrl(mediaUrl, isVideo ? 'mp4' : 'jpg');
    const safeTitle = sanitizeFilename(title || (isVideo ? 'reel' : 'artwork'));
    const finalFilename = `${safeTitle}_${Date.now()}.${ext}`;

    const resolvedUrl = mediaUrl.startsWith('/') ? `https://gg.modvc.org${mediaUrl}` : mediaUrl;

    // 1. Native Capacitor Android / iOS Handling
    if (Capacitor.isNativePlatform()) {
      onStatus?.('Downloading file to device...');
      try {
        let response: Response;
        try {
          response = await fetch(resolvedUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch {
          const proxyUrl = `https://gg.modvc.org/api/downloadProxy?url=${encodeURIComponent(resolvedUrl)}&filename=${encodeURIComponent(finalFilename)}`;
          response = await fetch(proxyUrl);
          if (!response.ok) throw new Error(`Proxy HTTP error ${response.status}`);
        }
        const blob = await response.blob();

        // Convert blob to base64
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] || '');
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Write to Documents directory
        const saved = await Filesystem.writeFile({
          path: finalFilename,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true
        });

        onStatus?.('Saved to device storage!');

        // Also offer system share / save to gallery dialog
        try {
          await Share.share({
            title: title || 'Glass Gallery',
            text: `Saved ${finalFilename}`,
            url: saved.uri,
            dialogTitle: 'Save / Open File'
          });
        } catch {}

        return { success: true };
      } catch (nativeErr: any) {
        console.warn("Capacitor Filesystem download failed, attempting fallback:", nativeErr);
      }
    }

    // 2. Browser Blob Download (Web / Desktop / Mobile Chrome)
    onStatus?.('Downloading file...');
    try {
      let response: Response;
      try {
        response = await fetch(resolvedUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch {
        const proxyUrl = `https://gg.modvc.org/api/downloadProxy?url=${encodeURIComponent(resolvedUrl)}&filename=${encodeURIComponent(finalFilename)}`;
        response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Proxy HTTP error ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = finalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      onStatus?.('Download complete!');
      return { success: true };
    } catch (fetchErr) {
      console.warn("Direct blob fetch failed, falling back to downloadProxy:", fetchErr);
    }

    // 3. Fallback: Proxy Download Endpoint with Content-Disposition
    const proxyUrl = `https://gg.modvc.org/api/downloadProxy?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(finalFilename)}`;
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = finalFilename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    onStatus?.('Download started!');
    return { success: true };
  } catch (err: any) {
    console.error("Download failed:", err);
    onStatus?.('Download failed');
    return { success: false, error: err.message || 'Download failed' };
  }
};
