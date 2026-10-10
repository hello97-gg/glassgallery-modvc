// Cloudflare Pages Function endpoint for IndexNow Key verification (0d32f54c5df04186b6b00004c92ae5df)
export async function onRequest() {
  return new Response("0d32f54c5df04186b6b00004c92ae5df", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
