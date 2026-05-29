import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'ogg', 'avi', 'mkv', 'm4v'];

function getFileExtension(name) {
  const match = name.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function isVideoFile(name) {
  return VIDEO_EXTENSIONS.includes(getFileExtension(name));
}

function getContentType(name) {
  const ext = getFileExtension(name);
  switch (ext) {
    case 'mp4': case 'm4v': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'ogg': return 'video/ogg';
    case 'avi': return 'video/x-msvideo';
    case 'mkv': return 'video/x-matroska';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    default: return 'image/jpeg';
  }
}

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
    
    const publicDomain = context.env.R2_PUBLIC_DOMAIN;
    if (!publicDomain) {
        throw new Error("Server Misconfiguration: R2_PUBLIC_DOMAIN environment variable is missing.");
    }

    const R2_ACCOUNT_ID = "d8e8828f54e7dac7c17e397d1998f745";
    const R2_BUCKET = context.env.R2_BUCKET_NAME || "glassgallery";

    // Initialize S3 Client for Cloudflare R2
    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: context.env.R2_ACCESS_KEY_ID,
        secretAccessKey: context.env.R2_SECRET_ACCESS_KEY,
      },
    });

    // Convert base64 to Uint8Array
    const binaryString = atob(file);
    const len = binaryString.length;
    let buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        buffer[i] = binaryString.charCodeAt(i);
    }
    
    const isVideo = isVideoFile(name);
    let extension = getFileExtension(name) || 'jpg';
    let contentType = getContentType(name);

    // --- Only compress images, never videos ---
    if (!isVideo) {
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
            buffer = image.get_bytes_jpeg(80);
            extension = 'jpg';
            contentType = 'image/jpeg';
            console.log(`Compressed image size: ${buffer.byteLength}`);
        }
        image.free();
      } catch (photonErr) {
        console.error("Photon compression error:", photonErr);
        // Fallback: use original buffer with guessed extension
        if (name.toLowerCase().endsWith('.png')) { extension = 'png'; contentType = 'image/png'; }
        else if (name.toLowerCase().endsWith('.webp')) { extension = 'webp'; contentType = 'image/webp'; }
      }
    } else {
      console.log(`Uploading video file: ${name}, size: ${buffer.byteLength}, type: ${contentType}`);
    }

    // Generate a clean, unique filename preserving extension
    const timestamp = Date.now();
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30);
    const uniqueFileName = `${timestamp}-${sanitizedName}.${extension}`;

    // Upload to R2
    await S3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: uniqueFileName,
      Body: buffer,
      ContentType: contentType,
    }));

    // Construct the public URL
    const domain = publicDomain.endsWith('/') ? publicDomain.slice(0, -1) : publicDomain;
    const fileUrl = `${domain}/${uniqueFileName}`;

    return Response.json({ url: fileUrl }, { status: 200 });

  } catch (err) {
    console.error("Error in /api/uploadToR2:", err);
    return Response.json({ error: "Upload failed.", details: err.message }, { status: 500 });
  }
}
