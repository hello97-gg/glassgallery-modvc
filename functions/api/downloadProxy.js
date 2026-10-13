const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Content-Type',
};

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const urlParams = new URL(context.request.url);
  const targetUrl = urlParams.searchParams.get('url');
  const filename = urlParams.searchParams.get('filename');

  if (!targetUrl) {
    return Response.json({ error: "Missing url parameter" }, { status: 400, headers: corsHeaders });
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch from external URL: ${response.status} ${response.statusText}`);
    }

    const safeFilename = (filename || 'media_download').replace(/["\\]/g, '');
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);

    // Ensure correct content-type header
    if (!headers.has("Content-Type")) {
      const ext = safeFilename.split('.').pop()?.toLowerCase();
      if (ext === 'mp4') headers.set("Content-Type", "video/mp4");
      else if (ext === 'webm') headers.set("Content-Type", "video/webm");
      else if (ext === 'png') headers.set("Content-Type", "image/png");
      else headers.set("Content-Type", "image/jpeg");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

  } catch (error) {
    console.error("Proxy Download Error:", error);
    return Response.json({ error: "Download failed: " + error.message }, { status: 500, headers: corsHeaders });
  }
}
