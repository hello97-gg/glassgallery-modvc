import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";

export async function onRequest(context) {
  const request = context.request;

  if (request.method !== "POST") {
    return new Response(`Method ${request.method} Not Allowed`, { status: 405, headers: { "Allow": "POST" } });
  }

  try {
    const body = await request.json();
    const { file, name } = body;

    if (!file || !name) {
      return Response.json({ error: "Missing 'file' or 'name' in request body." }, { status: 400 });
    }
    
    // Convert base64 to Uint8Array
    const binaryString = atob(file);
    const len = binaryString.length;
    let buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        buffer[i] = binaryString.charCodeAt(i);
    }
    
    // --- Image Compression Logic using Photon ---
    try {
      let image = PhotonImage.new_from_byteslice(buffer);
      const width = image.get_width();
      const height = image.get_height();

      const MAX_WIDTH = 1920;
      const ONE_MB = 1024 * 1024;

      if (width > MAX_WIDTH || buffer.byteLength > ONE_MB) {
          console.log(`Compressing image: ${name}, size: ${buffer.byteLength}, width: ${width}`);
          
          if (width > MAX_WIDTH) {
            const newHeight = Math.round(height * (MAX_WIDTH / width));
            const resized = resize(image, MAX_WIDTH, newHeight, SamplingFilter.Lanczos3);
            image.free();
            image = resized;
          }

          // Output as JPEG with 80% quality
          buffer = image.get_bytes_jpeg(80);
          console.log(`Compressed image size: ${buffer.byteLength}`);
      }
      image.free();
    } catch (photonErr) {
      console.error("Photon compression error, falling back to original:", photonErr);
    }
    // --- End Compression Logic ---

    // Convert Uint8Array to Blob for FormData
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append("reqtype", "fileupload");
    formData.append("fileToUpload", blob, name.endsWith('.jpg') ? name : name + '.jpg');

    const catboxResponse = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
    });

    if (!catboxResponse.ok) {
        const errorText = await catboxResponse.text();
        console.error("Catbox API Error:", errorText);
        if (catboxResponse.status === 413) {
             return Response.json({ error: `Catbox rejected the file: Request Entity Too Large. Compressed size: ${buffer.byteLength} bytes.` }, { status: 413 });
        }
        throw new Error(`Catbox API responded with status ${catboxResponse.status}: ${errorText}`);
    }

    const fileUrl = await catboxResponse.text();

    if (!fileUrl.startsWith('http')) {
        throw new Error(`Received an invalid response from Catbox: ${fileUrl}`);
    }

    return Response.json({ url: fileUrl }, { status: 200 });

  } catch (err) {
    console.error("Error in /api/uploadToCatbox:", err);
    return Response.json({ error: "Upload failed due to a server error.", details: err.message }, { status: 500 });
  }
}
