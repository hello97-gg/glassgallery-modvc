import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function upload() {
  try {
    const versionJsonPath = path.join(__dirname, 'public', 'version.json');
    let versionData = {
      versionCode: 1,
      versionName: "1.0.0",
      apkUrl: `${publicDomain}/GlassGallery.apk`,
      releaseNotes: "New dynamic version update",
      forceUpdate: false
    };

    if (fs.existsSync(versionJsonPath)) {
      try {
        versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
      } catch (e) {
        console.warn("Could not parse existing version.json, creating a fresh one.");
      }
    }

    console.log("\n=== GLASS GALLERY AUTO-UPDATE BUILD SYSTEM ===");
    console.log(`Current Version Code: ${versionData.versionCode}`);
    console.log(`Current Version Name: ${versionData.versionName}`);

    // Auto-compute defaults
    const nextCode = versionData.versionCode + 1;
    const parts = versionData.versionName.split('.');
    if (parts.length === 3) {
      parts[2] = parseInt(parts[2]) + 1;
    } else {
      parts.push('1');
    }
    const defaultNextName = parts.join('.');

    // Interactive CLI questions with safe defaults
    const newVersionNameInput = await question(`Enter new version name [${defaultNextName}]: `);
    const newVersionName = newVersionNameInput.trim() || defaultNextName;

    const newReleaseNotesInput = await question(`Enter release notes [${versionData.releaseNotes}]: `);
    const newReleaseNotes = newReleaseNotesInput.trim() || versionData.releaseNotes;

    const forceUpdateInput = await question(`Force update for this release? (y/N): `);
    const forceUpdate = forceUpdateInput.trim().toLowerCase() === 'y';

    // Update the version data block
    versionData.versionCode = nextCode;
    versionData.versionName = newVersionName;
    versionData.releaseNotes = newReleaseNotes;
    versionData.forceUpdate = forceUpdate;
    versionData.apkUrl = `${publicDomain}/GlassGallery.apk`;

    // Save version.json back to repository
    fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2), 'utf8');
    console.log(`\nSaved updated configuration to public/version.json!`);
    console.log(JSON.stringify(versionData, null, 2));

    const apkPaths = [
      path.join(__dirname, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
      path.join(__dirname, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
      path.join(__dirname, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk')
    ];

    let apkPath = null;
    let latestTime = 0;

    for (const p of apkPaths) {
      if (fs.existsSync(p)) {
        const stats = fs.statSync(p);
        if (stats.mtimeMs > latestTime) {
          latestTime = stats.mtimeMs;
          apkPath = p;
        }
      }
    }

    if (!apkPath) {
      throw new Error(`Could not find any compiled APK inside mobile/android/app/build/outputs/apk/\nMake sure to compile your app inside Android Studio or Gradle first!`);
    }

    console.log(`\nDetected latest compiled APK at: ${apkPath}`);
    console.log(`Last modified: ${new Date(latestTime).toLocaleString()}`);

    const fileStream = fs.createReadStream(apkPath);
    const fileName = 'GlassGallery.apk';

    console.log(`\nUploading ${fileName} to R2 with cache-bypass headers...`);

    await S3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: fileName,
      Body: fileStream,
      ContentType: 'application/vnd.android.package-archive',
      CacheControl: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    }));

    // Also upload version.json to R2 so it is immediately served at the CDN edge!
    console.log(`Uploading version.json to R2 with cache-bypass headers...`);
    await S3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: 'version.json',
      Body: JSON.stringify(versionData, null, 2),
      ContentType: 'application/json',
      CacheControl: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    }));

    console.log(`\nUpload complete!`);
    console.log(`Download URL: ${publicDomain}/${fileName}`);
    console.log(`Metadata URL: ${publicDomain}/version.json`);
    console.log(`===========================================\n`);

  } catch (error) {
    console.error("\nSystem update failed:", error);
  } finally {
    rl.close();
  }
}

upload();
