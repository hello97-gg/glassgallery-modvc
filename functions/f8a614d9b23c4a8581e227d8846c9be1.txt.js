// Cloudflare Pages Function endpoint for IndexNow Key verification
export async function onRequest() {
  return new Response("f8a614d9b23c4a8581e227d8846c9be1", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
