import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Parse .env
const envPath = path.join(projectRoot, 'mobile', '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const R2_ACCOUNT_ID = "98055f2d8acb3c303f213bb401738a64";
const R2_BUCKET = env['R2_BUCKET_NAME'] || "glassgallery";
const publicDomain = env['R2_PUBLIC_DOMAIN'] || "https://pub-0b9a9d568aa64fe6afb1da05ff60483f.r2.dev";

const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env['R2_ACCESS_KEY_ID'],
    secretAccessKey: env['R2_SECRET_ACCESS_KEY'],
  },
});

async function main() {
  const apkPath = path.join(projectRoot, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const versionJsonPath = path.join(projectRoot, 'public', 'version.json');

  if (!fs.existsSync(apkPath)) {
    throw new Error(`APK not found at ${apkPath}`);
  }
  const apkStats = fs.statSync(apkPath);
  console.log(`Uploading ${apkPath} (${(apkStats.size / (1024 * 1024)).toFixed(2)} MB)...`);

  const fileStream = fs.createReadStream(apkPath);
  await S3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: 'GlassGallery.apk',
    Body: fileStream,
    ContentType: 'application/vnd.android.package-archive',
    CacheControl: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  }));
  console.log('Successfully uploaded GlassGallery.apk to R2!');

  const versionData = fs.readFileSync(versionJsonPath, 'utf8');
  console.log('Uploading version.json to R2:', versionData);
  await S3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: 'version.json',
    Body: versionData,
    ContentType: 'application/json',
    CacheControl: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  }));
  console.log('Successfully uploaded version.json to R2!');
  console.log(`\nVerified URLs:\n${publicDomain}/GlassGallery.apk\n${publicDomain}/version.json`);
}

main().catch(err => {
  console.error('Upload failed:', err);
  process.exit(1);
});
