import fs from 'fs';
import fetch from 'node-fetch';

async function uploadVideo() {
  const filePath = "C:\\Users\\ashes\\Videos\\0529.mp4";
  console.log("Reading file:", filePath);
  
  const videoBuffer = fs.readFileSync(filePath);
  const base64Data = videoBuffer.toString('base64');
  const payload = {
    image: `data:video/mp4;base64,${base64Data}`,
    title: "Awesome API Uploaded Video",
    description: "This is a video uploaded directly via the developer API using node-fetch.",
    location: "San Francisco, USA",
    license: "CC0",
    tags: ["Video", "Creative", "Modern"]
  };

  console.log("Sending POST request...");
  const url = "http://127.0.0.1:8788/api/images?action=api_upload";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "gg_e74bd7a7de3cc2685e1fee59cd7c6df5b26f87dae5f53b34"
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    console.log("Response from server:", data);
  } catch (error) {
    console.error("Error uploading:", error);
  }
}

uploadVideo();
