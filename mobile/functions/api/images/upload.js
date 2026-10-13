import { AwsClient } from "aws4fetch";
import { getDb } from "../lib/turso.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Api-Key'
};

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'PUT') {
    return Response.json({ success: false, error: "Method not allowed. Use PUT to stream data." }, { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const filename = url.searchParams.get('filename');

    if (!id || !filename) {
      return Response.json({ success: false, error: "Missing id or filename." }, { status: 400, headers: corsHeaders });
    }

    // Security Check: API Key Verification
    let authHeader = request.headers.get('authorization') || request.headers.get('x-api-key');
    if (!authHeader) {
      return Response.json({ success: false, error: "Missing API Key." }, { status: 401, headers: corsHeaders });
    }

    let apiKeyInput = authHeader.replace(/^Bearer\s+/i, '').trim();
    const db = getDb(env);
    const userRes = await db.execute({
      sql: "SELECT * FROM users WHERE apiKey = ?",
      args: [apiKeyInput]
    });

    if (userRes.rows.length === 0) {
      return Response.json({ success: false, error: "Invalid API key." }, { status: 401, headers: corsHeaders });
    }

    if (!request.body) {
      return Response.json({ success: false, error: "Missing request body stream." }, { status: 400, headers: corsHeaders });
    }

    const contentLengthHeader = request.headers.get('content-length');
    if (!contentLengthHeader) {
      return Response.json({ success: false, error: "Length Required: Content-Length header is missing." }, { status: 411, headers: corsHeaders });
    }

    const contentLength = parseInt(contentLengthHeader, 10);
    const FIFTY_MB = 50 * 1024 * 1024; // 50MB web/api upload size limit
    if (contentLength > FIFTY_MB) {
      return Response.json({ success: false, error: "Payload Too Large: Maximum allowed size is 50MB." }, { status: 413, headers: corsHeaders });
    }

    const R2_ACCOUNT_ID = "98055f2d8acb3c303f213bb401738a64";
    const R2_BUCKET = env.R2_BUCKET_NAME || "glassgallery";
    
    const aws = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto'
    });

    let contentType = request.headers.get('content-type') || 'application/octet-stream';

    // Direct Stream Passthrough - 0ms CPU time on Workers!
    const s3Url = new URL(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${filename}`);
    
    const s3Res = await aws.fetch(s3Url, {
      method: 'PUT',
      headers: {
          'Content-Type': contentType,
          'Content-Length': contentLengthHeader
      },
      body: request.body,
      duplex: 'half'
    });

    if (!s3Res.ok) {
        const errText = await s3Res.text();
        throw new Error(`R2 Upload failed: ${s3Res.status} ${errText}`);
    }

    return Response.json({ success: true, message: "Stream uploaded successfully", imageId: id }, { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("Stream upload failed:", err);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
}
