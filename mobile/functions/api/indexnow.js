import { getDb } from "./lib/turso.js";
import { submitToIndexNow, INDEXNOW_KEY, INDEXNOW_HOST, INDEXNOW_KEY_LOCATION } from "./lib/indexnow.js";

const corsHeaders = {
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*"
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET: Provide current status, key location, and test info
  if (request.method === "GET") {
    return Response.json({
      status: "active",
      protocol: "IndexNow",
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      searchEngines: [
        "Microsoft Bing",
        "Yandex",
        "Seznam.cz",
        "Naver"
      ],
      description: "IndexNow notifies participating search engines instantly about created, updated, or removed URLs on gg.modvc.org.",
      usage: {
        submitSingleUrl: "POST /api/indexnow with body: { urls: ['https://gg.modvc.org/image/id'] }",
        submitBulkAll: "POST /api/indexnow with body: { action: 'bulk' }"
      }
    }, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // POST: Submit URLs to IndexNow
  if (request.method === "POST") {
    try {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      let urlsToSubmit = [];

      // 1. If explicit URLs are provided in payload
      if (Array.isArray(body.urls) && body.urls.length > 0) {
        urlsToSubmit = body.urls;
      } else {
        // 2. Default or 'bulk' action: fetch URLs from database & static routes
        const baseUrl = `https://${INDEXNOW_HOST}`;
        urlsToSubmit = [
          `${baseUrl}/`,
          `${baseUrl}/gallery`,
          `${baseUrl}/api`,
          `${baseUrl}/legal`
        ];

        try {
          const db = getDb(env);
          const limit = typeof body.limit === 'number' ? Math.min(body.limit, 10000) : 5000;
          const result = await db.execute(`SELECT id FROM images ORDER BY uploadedAt DESC LIMIT ${limit}`);
          
          if (result && Array.isArray(result.rows)) {
            for (const row of result.rows) {
              if (row.id) {
                urlsToSubmit.push(`${baseUrl}/image/${row.id}`);
              }
            }
          }
        } catch (dbErr) {
          console.warn("[IndexNow] Database fetch warning, submitting static pages:", dbErr);
        }
      }

      const result = await submitToIndexNow(urlsToSubmit);

      return Response.json({
        success: result.success,
        submittedCount: result.submitted,
        indexNowStatus: result.status,
        message: result.message,
        sampleUrls: urlsToSubmit.slice(0, 5)
      }, {
        status: result.success ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      console.error("[IndexNow Endpoint Error]:", err);
      return Response.json({
        success: false,
        error: err.message || "Failed to submit URLs to IndexNow"
      }, {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
}
