export async function onRequest(context) {
  const urlParams = new URL(context.request.url);
  const targetUrl = urlParams.searchParams.get('url');
  const filename = urlParams.searchParams.get('filename');

  if (!targetUrl) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch from external URL: ${response.status} ${response.statusText}`);
    }

    // Clone the response so we can modify the headers
    const newResponse = new Response(response.body, response);
    
    const safeFilename = (filename || 'image.jpg').replace(/["\\]/g, '');
    newResponse.headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);
    
    return newResponse;

  } catch (error) {
    console.error("Proxy Download Error:", error);
    return Response.json({ error: "Download failed" }, { status: 500 });
  }
}
