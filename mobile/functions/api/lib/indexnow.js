export const INDEXNOW_KEY = "0d32f54c5df04186b6b00004c92ae5df";
export const INDEXNOW_HOST = "gg.modvc.org";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;

/**
 * Submits a list of URLs to the IndexNow API (instant broadcast to Bing, Yandex, Seznam, Naver)
 * @param {string[]} urls - List of full URLs to submit (up to 10,000)
 * @returns {Promise<{ success: boolean, status: number, submitted: number, message: string }>}
 */
export async function submitToIndexNow(urls = []) {
  if (!urls || urls.length === 0) {
    return { success: false, status: 400, submitted: 0, message: "No URLs provided" };
  }

  // Deduplicate and ensure proper https URLs
  const uniqueUrls = Array.from(
    new Set(
      urls
        .filter(u => typeof u === "string" && u.trim().length > 0)
        .map(u => u.trim().startsWith("http") ? u.trim() : `https://${INDEXNOW_HOST}${u.trim().startsWith("/") ? "" : "/"}${u.trim()}`)
    )
  );

  if (uniqueUrls.length === 0) {
    return { success: false, status: 400, submitted: 0, message: "No valid URLs found" };
  }

  // Submit in chunks of 10,000 (IndexNow maximum allowed per request)
  const chunkSize = 10000;
  const chunks = [];
  for (let i = 0; i < uniqueUrls.length; i += chunkSize) {
    chunks.push(uniqueUrls.slice(i, i + chunkSize));
  }

  let totalSubmitted = 0;
  let lastStatus = 200;

  for (const chunk of chunks) {
    const payload = {
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList: chunk
    };

    try {
      // Primary IndexNow endpoint (shares automatically across all participating search engines)
      const response = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(payload)
      });

      lastStatus = response.status;
      // 200 = OK, 202 = Accepted (valid key and URLs queued)
      if (response.status === 200 || response.status === 202) {
        totalSubmitted += chunk.length;
        console.log(`[IndexNow] Successfully submitted ${chunk.length} URLs (Status ${response.status})`);
      } else {
        const errorText = await response.text().catch(() => "");
        console.warn(`[IndexNow] Submission returned status ${response.status}:`, errorText);
      }
    } catch (err) {
      console.error("[IndexNow] Failed to submit chunk:", err);
      return {
        success: false,
        status: 500,
        submitted: totalSubmitted,
        message: err.message || "Failed to reach IndexNow API"
      };
    }
  }

  const isSuccess = totalSubmitted > 0;
  return {
    success: isSuccess,
    status: lastStatus,
    submitted: totalSubmitted,
    message: isSuccess
      ? `Successfully submitted ${totalSubmitted} URL(s) to IndexNow (Bing & search engines)`
      : `IndexNow submission returned status ${lastStatus}`
  };
}
