
import React, { useState } from 'react';

const CodeBlock = ({ code, language }: { code: string, language: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden border border-border bg-black/30 mt-4 max-w-full">
      <div className="flex justify-between items-center px-4 py-2 bg-surface/50 border-b border-border">
        <span className="text-xs font-mono text-secondary">{language}</span>
        <button onClick={handleCopy} className="text-xs text-secondary hover:text-primary transition-colors">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm font-mono text-gray-300 whitespace-pre-wrap break-words">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const ApiDocsPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto pb-20 animate-fade-in px-4 md:px-0 w-full">
        {/* Header */}
        <div className="mb-10 text-left">
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">Developer API</h1>
            <p className="text-base md:text-lg text-secondary leading-relaxed">
                Integrate Glass Gallery images into your own applications, websites, or creative projects.
                Our public API is free to use and requires no authentication for read-only access.
            </p>
        </div>

        {/* Random Fetch Endpoint Card */}
        <div className="bg-surface border border-border rounded-xl p-5 md:p-6 mb-8 shadow-lg w-full overflow-hidden">
            <div className="flex flex-col gap-3 mb-4">
                <span className="self-start px-3 py-1 rounded-md bg-accent/20 text-accent font-bold text-sm">GET</span>
                <code className="text-primary font-mono text-sm md:text-lg break-all">/api/random</code>
            </div>
            <p className="text-secondary mb-0 text-sm md:text-base">
                Fetches a random set of images from the gallery, optionally filtered by category or title.
            </p>
        </div>

        {/* Fetch Image by ID Endpoint Card */}
        <div className="bg-surface border border-border rounded-xl p-5 md:p-6 mb-8 shadow-lg w-full overflow-hidden">
            <div className="flex flex-col gap-3 mb-4">
                <span className="self-start px-3 py-1 rounded-md bg-accent/20 text-accent font-bold text-sm">GET</span>
                <code className="text-primary font-mono text-sm md:text-lg break-all">/api/images?action=get_single&imageId=&#123;id&#125;</code>
            </div>
            <p className="text-secondary mb-0 text-sm md:text-base">
                Fetches complete JSON metadata for a specific image by its unique ID. Returns the image URL, title, uploader details, tags, and license.
            </p>
        </div>

        {/* Download & Track Endpoint Card */}
        <div className="bg-surface border border-border rounded-xl p-5 md:p-6 mb-8 shadow-lg w-full overflow-hidden">
            <div className="flex flex-col gap-3 mb-4">
                <span className="self-start px-3 py-1 rounded-md bg-accent/20 text-accent font-bold text-sm">GET</span>
                <code className="text-primary font-mono text-sm md:text-lg break-all">/api/images?action=download&imageId=&#123;id&#125;</code>
            </div>
            <p className="text-secondary mb-0 text-sm md:text-base">
                Direct file download endpoint. Automatically increments the image's download counter in the database and immediately returns a 302 Redirect to the full-resolution image file.
            </p>
        </div>

        {/* Render/Embed Endpoint Card */}
        <div className="bg-surface border border-border rounded-xl p-5 md:p-6 mb-8 shadow-lg w-full overflow-hidden relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex flex-col gap-3 mb-4 relative z-10">
                <span className="self-start px-3 py-1 rounded-md bg-blue-500/20 text-blue-400 font-bold text-sm">EMBED</span>
                <code className="text-primary font-mono text-sm md:text-lg break-all">/api/images?action=render</code>
            </div>
            <p className="text-secondary mb-4 text-sm md:text-base relative z-10">
                <strong>Embed images directly on any website!</strong> This endpoint returns a <code className="text-accent bg-accent/10 px-1 py-0.5 rounded">302 redirect</code> to the image CDN URL, 
                so it works directly inside <code className="text-accent bg-accent/10 px-1 py-0.5 rounded">&lt;img src="..."&gt;</code> tags. No JavaScript required.
            </p>
            <div className="space-y-3 relative z-10">
                <div>
                    <h4 className="text-sm font-bold text-primary mb-2">Query Parameters</h4>
                    <div className="overflow-x-auto border border-border rounded-lg w-full">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead>
                                <tr className="border-b border-border bg-surface/50 text-xs text-secondary font-medium">
                                    <th className="py-2 px-3">Param</th>
                                    <th className="py-2 px-3">Type</th>
                                    <th className="py-2 px-3">Description</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs text-primary">
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">imageId</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-secondary">Render a specific image by its ID.</td>
                                </tr>
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">category</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-secondary">Render a random image from this category/tag (e.g., "Nature", "Pixel Art").</td>
                                </tr>
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">format</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-secondary">Set to <code className="text-accent">"json"</code> to get image metadata instead of a redirect.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <p className="text-xs text-secondary italic">If no parameters are provided, a completely random image is returned.</p>
            </div>
        </div>

        {/* Dynamic Image Resizing Info Card */}
        <div className="bg-surface border border-border rounded-xl p-5 md:p-6 mb-8 shadow-lg w-full overflow-hidden relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex flex-col gap-3 mb-4 relative z-10">
                <span className="self-start px-3 py-1 rounded-md bg-purple-500/20 text-purple-400 font-bold text-sm">EDGE FEATURE</span>
                <code className="text-primary font-mono text-sm md:text-lg break-all">https://cdn.modvc.org/cdn-cgi/image/width=W,height=H/&#123;filename.jpg&#125;</code>
            </div>
            <p className="text-secondary mb-0 text-sm md:text-base relative z-10">
                <strong>Dynamic Resizing API:</strong> Because images are served via Cloudflare R2 Edge, you can dynamically resize and compress any image on the fly simply by prepending <code className="text-accent bg-accent/10 px-1 py-0.5 rounded">/cdn-cgi/image/width=X,height=Y/</code> to the CDN URL path!
            </p>
        </div>

        {/* POST Upload Endpoint Card */}
        <div className="bg-surface border border-border rounded-xl p-5 md:p-6 mb-8 shadow-lg w-full overflow-hidden">
            <div className="flex flex-col gap-3 mb-4">
                <span className="self-start px-3 py-1 rounded-md bg-emerald-500/20 text-emerald-400 font-bold text-sm">POST</span>
                <code className="text-primary font-mono text-sm md:text-lg break-all">/api/images?action=api_upload</code>
            </div>
            <p className="text-secondary mb-5 text-sm md:text-base">
                Uploads an image directly to the gallery using your personal developer API Key. Supports Base64 image payload or public image URLs, custom tags, and licensing metadata.
            </p>
            <div className="space-y-4">
                <div>
                    <h4 className="text-sm font-bold text-primary mb-2">Request Headers</h4>
                    <pre className="p-3 bg-black/30 border border-border rounded-md text-xs font-mono text-secondary whitespace-pre-wrap">
{`Authorization: Bearer <YOUR_API_KEY>
Content-Type: application/json`}
                    </pre>
                </div>
                <div>
                    <h4 className="text-sm font-bold text-primary mb-2">JSON Body Parameters</h4>
                    <div className="overflow-x-auto border border-border rounded-lg w-full">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead>
                                <tr className="border-b border-border bg-surface/50 text-xs text-secondary font-medium">
                                    <th className="py-2 px-3">Field</th>
                                    <th className="py-2 px-3">Type</th>
                                    <th className="py-2 px-3">Required</th>
                                    <th className="py-2 px-3">Description</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs text-primary">
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">image</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-emerald-400 font-bold">Yes</td>
                                    <td className="py-2 px-3 text-secondary">Base64-encoded image string OR a public image URL to import.</td>
                                </tr>
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">title</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-secondary">No</td>
                                    <td className="py-2 px-3 text-secondary">Title of the image.</td>
                                </tr>
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">description</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-secondary">No</td>
                                    <td className="py-2 px-3 text-secondary">A short description of the image.</td>
                                </tr>
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">location</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-secondary">No</td>
                                    <td className="py-2 px-3 text-secondary">City, Country where the photo was captured.</td>
                                </tr>
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">license</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-secondary">No (CC0)</td>
                                    <td className="py-2 px-3 text-secondary">License type. Values: CC0, CC-BY, CC-BY-SA, MIT, GPL, Unsplash, Other.</td>
                                </tr>
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">licenseUrl</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-secondary">No</td>
                                    <td className="py-2 px-3 text-secondary">Custom License URL if license is set to "Other".</td>
                                </tr>
                                <tr className="border-b border-border/30">
                                    <td className="py-2 px-3 font-mono text-accent">originalWorkUrl</td>
                                    <td className="py-2 px-3 text-secondary">string</td>
                                    <td className="py-2 px-3 text-secondary">No</td>
                                    <td className="py-2 px-3 text-secondary">A source URL to the original work, used to credit the creator.</td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-3 font-mono text-accent">tags</td>
                                    <td className="py-2 px-3 text-secondary">string[]</td>
                                    <td className="py-2 px-3 text-secondary">No</td>
                                    <td className="py-2 px-3 text-secondary">List of custom tags (e.g., ["Cyberpunk", "Street"]). These are automatically listed in our dynamic tags section!</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        {/* Parameters */}
        <div className="mb-12 w-full">
            <h2 className="text-2xl font-bold text-primary mb-6">Parameters</h2>
            <div className="overflow-x-auto border border-border rounded-lg w-full">
                <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                        <tr className="border-b border-border bg-surface/50">
                            <th className="py-3 px-4 text-secondary font-medium text-sm">Name</th>
                            <th className="py-3 px-4 text-secondary font-medium text-sm">Type</th>
                            <th className="py-3 px-4 text-secondary font-medium text-sm">Default</th>
                            <th className="py-3 px-4 text-secondary font-medium text-sm">Description</th>
                        </tr>
                    </thead>
                    <tbody>
                         <tr className="border-b border-border/50">
                            <td className="py-4 px-4 font-mono text-accent text-sm">category</td>
                            <td className="py-4 px-4 text-secondary text-sm">string</td>
                            <td className="py-4 px-4 text-secondary text-sm">-</td>
                            <td className="py-4 px-4 text-primary text-sm">Filter images by tag/category (e.g., "Nature", "Abstract").</td>
                        </tr>
                        <tr className="border-b border-border/50">
                            <td className="py-4 px-4 font-mono text-accent text-sm">title</td>
                            <td className="py-4 px-4 text-secondary text-sm">string</td>
                            <td className="py-4 px-4 text-secondary text-sm">-</td>
                            <td className="py-4 px-4 text-primary text-sm">Search for partial matches in image titles.</td>
                        </tr>
                        <tr>
                            <td className="py-4 px-4 font-mono text-accent text-sm">limit</td>
                            <td className="py-4 px-4 text-secondary text-sm">number</td>
                            <td className="py-4 px-4 text-secondary text-sm">1</td>
                            <td className="py-4 px-4 text-primary text-sm">Number of images to return. Min 1, Max 20.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        {/* Examples */}
        <div className="mb-12 w-full">
            <h2 className="text-2xl font-bold text-primary mb-6">Examples</h2>
            <div className="mb-8 w-full">
                <h3 className="text-lg font-semibold text-primary mb-2">JavaScript (Fetch Random Images)</h3>
                <p className="text-secondary text-sm">Fetch 3 random images filtered by the "Nature" category.</p>
                <CodeBlock 
                    language="javascript" 
                    code={`fetch('https://gg.modvc.org/api/random?limit=3&category=Nature')
  .then(res => res.json())
  .then(data => {
    if(data.success) {
      console.log('Random Images:', data.data);
    }
  })
  .catch(console.error);`} 
                />
            </div>

            <div className="mb-8 w-full">
                <h3 className="text-lg font-semibold text-primary mb-2">JavaScript (Trigger File Download)</h3>
                <p className="text-secondary text-sm">Download an image by ID (this also updates the database download counter).</p>
                <CodeBlock 
                    language="javascript" 
                    code={`// You can simply use an anchor tag in HTML:
// <a href="https://gg.modvc.org/api/images?action=download&imageId=img_xyz">Download</a>

// Or trigger it programmatically via JavaScript:
window.location.href = 'https://gg.modvc.org/api/images?action=download&imageId=img_xyz';`} 
                />
            </div>

            <div className="mb-8 w-full">
                <h3 className="text-lg font-semibold text-primary mb-2">HTML (Dynamic CDN Resizing)</h3>
                <p className="text-secondary text-sm">Use Cloudflare Edge resizing directly in your image tags to get optimized sizes.</p>
                <CodeBlock 
                    language="html" 
                    code={`<!-- Load a lightweight 400x300 thumbnail -->
<img 
  src="https://cdn.modvc.org/cdn-cgi/image/width=400,height=300,fit=cover/image_name.jpg" 
  alt="Resized Image" 
/>`} 
                />
            </div>

            <div className="mb-8 w-full">
                <h3 className="text-lg font-semibold text-primary mb-2">HTML (Embed Image on Your Website)</h3>
                <p className="text-secondary text-sm">Embed a Glass Gallery image directly on any webpage — no JavaScript needed.</p>
                <CodeBlock 
                    language="html" 
                    code={`<!-- Embed a specific image by ID -->
<img 
  src="https://gg.modvc.org/api/images?action=render&imageId=img_abc123" 
  alt="Glass Gallery Image" 
/>

<!-- Embed a random image from the "Nature" category -->
<img 
  src="https://gg.modvc.org/api/images?action=render&category=Nature" 
  alt="Random Nature Photo" 
/>

<!-- Embed a completely random image -->
<img 
  src="https://gg.modvc.org/api/images?action=render" 
  alt="Random Glass Gallery Image" 
/>`} 
                />
            </div>

            <div className="mb-8 w-full">
                <h3 className="text-lg font-semibold text-primary mb-2">JavaScript (Fetch Image Metadata for Embed)</h3>
                <p className="text-secondary text-sm">Get full metadata including the embed URL, page link, tags, and license info.</p>
                <CodeBlock 
                    language="javascript" 
                    code={`// Get metadata for a random Nature image
fetch('https://gg.modvc.org/api/images?action=render&category=Nature&format=json')
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      const img = data.image;
      console.log('Title:', img.title);
      console.log('Embed URL:', img.embedUrl);    // Direct <img> src
      console.log('Page URL:', img.pageUrl);       // Link to Glass Gallery page
      console.log('License:', img.license);
      console.log('Tags:', img.tags.join(', '));
    }
  });`} 
                />
            </div>

            <div className="mb-8 w-full">
                <h3 className="text-lg font-semibold text-primary mb-2">Advanced Node.js (Fetch, Resize & Download)</h3>
                <p className="text-secondary text-sm">A full backend script to fetch a random image, generate a dynamically resized CDN URL, and download it locally via Node.js streams.</p>
                <CodeBlock 
                    language="javascript" 
                    code={`import https from 'https';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://gg.modvc.org';
const WIDTH = 1920;
const HEIGHT = 1080;

async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        return downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(filepath); });
    }).on('error', (err) => { fs.unlink(filepath, () => {}); reject(err); });
  });
}

async function fetchAndDownloadRandom() {
  // 1. Fetch a random image from the API
  const res = await fetch(\`\${BASE_URL}/api/random?limit=1\`);
  const data = await res.json();
  const image = data.data[0];
  
  console.log('Found Image:', image.title);

  // 2. Build the dynamically resized Cloudflare Edge URL
  const imagePath = new URL(image.imageUrl).pathname;
  const resizedUrl = \`https://cdn.modvc.org/cdn-cgi/image/width=\${WIDTH},height=\${HEIGHT},fit=cover\${imagePath}\`;
  
  console.log('Optimized CDN URL:', resizedUrl);

  // 3. Stream the file to disk
  const filename = \`download_\${image.id}.jpg\`;
  await downloadFile(resizedUrl, path.join(__dirname, filename));
  console.log('Download complete!');
}

fetchAndDownloadRandom();`} 
                />
            </div>

            <div className="mb-8 w-full">
                <h3 className="text-lg font-semibold text-primary mb-2">JavaScript (Fetch Image Upload)</h3>
                <p className="text-secondary text-sm">Upload a new landscape photo with CC-BY license and tags.</p>
                <CodeBlock 
                    language="javascript" 
                    code={`const payload = {
  image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000",
  title: "Yosemite Valley Scenic View",
  description: "A gorgeous panorama of the Yosemite granite mountains.",
  location: "California, USA",
  license: "CC-BY",
  originalWorkUrl: "https://unsplash.com/photos/yosemite-valley",
  tags: ["Natural", "Landscape", "Travel"]
};

fetch('/api/images?action=api_upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer gg_your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
  .then(response => response.json())
  .then(data => {
    if(data.success) {
      console.log('Uploaded successfully!', data.imageUrl);
    }
  })
  .catch(console.error);`} 
                />
            </div>

            <div className="mb-8 w-full">
                <h3 className="text-lg font-semibold text-primary mb-2">cURL (Direct Image Upload)</h3>
                <CodeBlock 
                    language="bash" 
                    code={`curl -X POST "/api/images?action=api_upload" \\
  -H "Authorization: Bearer gg_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "image": "data:image/jpeg;base64,...",
    "title": "Aesthetic Setup",
    "description": "Minimalist home setup showcase.",
    "location": "New York, USA",
    "license": "CC0",
    "tags": ["Aesthetic", "Minimalist", "Creative"]
  }'`} 
                />
            </div>
        </div>

         {/* Response Format */}
         <div className="w-full">
            <h2 className="text-2xl font-bold text-primary mb-6">Response Structure</h2>
            <CodeBlock 
                language="json" 
                code={`{
  "success": true,
  "count": 1,
  "filter": {
    "category": "Nature",
    "title": "any"
  },
  "data": [
    {
      "id": "7Hk29...",
      "imageUrl": "https://files.catbox.moe/abc.jpg",
      "url": "https://files.catbox.moe/abc.jpg",
      "title": "Forest Morning",
      "description": "A shot taken in the woods...",
      "uploaderName": "Photographer123",
      "tags": ["Nature", "Forest", "Green"],
      "license": "CC0",
      "createdAt": "2024-03-20T10:00:00Z"
    }
  ]
}`} 
            />
        </div>
    </div>
  );
};

export default ApiDocsPage;
