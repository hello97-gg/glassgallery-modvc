import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually parse .env
const envPath = path.join(__dirname, 'mobile', '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const R2_ACCOUNT_ID = "d8e8828f54e7dac7c17e397d1998f745";
const R2_BUCKET = env['R2_BUCKET_NAME'] || "glassgallery";
const publicDomain = env['R2_PUBLIC_DOMAIN'] || "https://cdn.modvc.org";

const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env['R2_ACCESS_KEY_ID'],
    secretAccessKey: env['R2_SECRET_ACCESS_KEY'],
  },
});

async function upload() {
  try {
    const apkPath = path.join(__dirname, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    const fileStream = fs.createReadStream(apkPath);

    const fileName = 'GlassGallery.apk';

    console.log(`Uploading ${fileName} to R2...`);

    await S3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: fileName,
      Body: fileStream,
      ContentType: 'application/vnd.android.package-archive',
    }));

    console.log(`Upload complete! Download URL: ${publicDomain}/${fileName}`);
  } catch (error) {
    console.error("Upload failed:", error);
  }
}

upload();
