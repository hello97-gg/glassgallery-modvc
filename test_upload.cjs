const fs = require('fs');
const { Readable } = require('stream');

async function run() {
  console.log("Starting streaming test upload...");
  // Use a tiny dummy buffer simulating a video file
  const videoBuffer = Buffer.from('dummy video content for streaming test');

  // Need a valid API key, using the dummy test one for now
  // We'll see if the user db check passes or fails, but we want to test the R2 connection
  // Wait, if it fails user DB check, it won't hit R2. 
  // Let's use a key we know might be there, or just check the R2 part.

  try {
    const res = await fetch("http://localhost:8788/api/images/upload?id=test123&filename=test_vid_stream.mp4", {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": videoBuffer.length.toString(),
        "X-API-Key": "gg_f9201ccbf158025a82d3ef870fd403156a2062e8a9028988"
      },
      // In Node.js fetch, body can be a Buffer or a stream.
      // We pass a Buffer, but it behaves as a body stream to Cloudflare
      body: videoBuffer
    });
    
    console.log("Response status:", res.status);
    const text = await res.text();
    console.log("Response body:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
