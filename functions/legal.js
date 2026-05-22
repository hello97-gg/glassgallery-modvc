
import { TERMS_OF_SERVICE, PRIVACY_POLICY, CONTENT_GUIDELINES } from "./api/lib/legalText.js";

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const tab = url.searchParams.get('tab') || 'terms';
  const baseUrl = "https://gg.modvc.org";
  
  let activeTab = 'terms';
  if (tab === 'privacy') activeTab = 'privacy';
  if (tab === 'guidelines') activeTab = 'guidelines';

  // Fetch base index.html from static assets
  let indexHtml = "";
  try {
    const assetUrl = new URL(context.request.url);
    assetUrl.pathname = '/index.html';
    const assetResponse = await context.env.ASSETS.fetch(new Request(assetUrl));
    if (assetResponse.ok) {
      indexHtml = await assetResponse.text();
    }
  } catch (e) {
    console.warn("Failed to fetch internal index.html:", e);
  }

  if (!indexHtml) {
    indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Legal Center | Glass Gallery</title></head><body><div id="root"></div></body></html>`;
  }

  let title = "Terms of Service";
  let description = "Read the legally binding Terms of Service for using the Glass Gallery platform, image sharing networks, and APIs.";
  let content = TERMS_OF_SERVICE;

  if (activeTab === 'privacy') {
    title = "Privacy Policy";
    description = "Understand how Glass Gallery collects, processes, caches, and securely retains your personal data, taste profiles, and uploads.";
    content = PRIVACY_POLICY;
  } else if (activeTab === 'guidelines') {
    title = "Content Guidelines";
    description = "Review the community standards, mature content tagging rules, and acceptable use policies of Glass Gallery.";
    content = CONTENT_GUIDELINES;
  }

  const pageUrl = `${baseUrl}/legal?tab=${activeTab}`;

  const seoMetaTags = `
  <title>${title} | Legal Center | Glass Gallery</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${pageUrl}" />
  
  <meta property="og:site_name" content="Glass Gallery" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title} | Legal Center" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${baseUrl}/web-app-manifest-512x512.png" />
  <meta property="og:url" content="${pageUrl}" />
  
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title} | Legal Center" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${baseUrl}/web-app-manifest-512x512.png" />
  `;

  // Replace default title & meta blocks
  indexHtml = indexHtml.replace(
    /<title>Glass Gallery<\/title>[\s\S]*?<meta name="twitter:image" content="[^"]*" \/>/,
    seoMetaTags
  );

  // Clean up duplicate default canonical & JSON-LD
  indexHtml = indexHtml.replace(/\s*<!-- Canonical URL -->\s*\n\s*<link rel="canonical" href="https:\/\/gg\.modvc\.org\/" \/>\s*/g, '');
  indexHtml = indexHtml.replace(/\s*<!-- Static JSON-LD Structured Data[^>]*-->\s*/g, '');
  indexHtml = indexHtml.replace(/<script type="application\/ld\+json">\s*\{\s*\n[\s\S]*?"@type":\s*"WebSite"[\s\S]*?<\/script>/g, '');
  indexHtml = indexHtml.replace(/<script type="application\/ld\+json">\s*\{\s*\n[\s\S]*?"@type":\s*"Organization"[\s\S]*?<\/script>/g, '');

  // Render highly-premium, glassmorphic layout inside the skeleton
  const styledLegalHtml = `
    <div style="min-height: 100vh; background: #121212; color: #e5e5e5; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column;">
      
      <!-- Top Premium Glass Bar -->
      <header style="position: sticky; top: 0; z-index: 50; background: rgba(20, 20, 20, 0.7); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding: 1.25rem 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <a href="/" style="text-decoration: none; display: flex; align-items: center; gap: 0.5rem; color: #e5e5e5; font-weight: 700; font-size: 1.25rem;">
            <svg style="width: 28px; height: 28px;" viewBox="0 0 24 24" fill="none" stroke="#f5c3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span>Glass Gallery <span style="color: #f5c3b8; font-size: 0.85rem; font-weight: 500; border: 1px solid rgba(245, 195, 184, 0.3); padding: 0.15rem 0.4rem; border-radius: 6px; margin-left: 0.25rem;">Legal</span></span>
          </a>
        </div>
        <a href="/" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #e5e5e5; padding: 0.5rem 1.25rem; border-radius: 12px; font-weight: 600; text-decoration: none; font-size: 0.9rem; transition: all 0.2s;">Back to Feed</a>
      </header>

      <!-- Main Layout -->
      <div style="flex-grow: 1; max-width: 1280px; width: 100%; margin: 0 auto; padding: 2rem; display: grid; grid-template-columns: 280px 1fr; gap: 2.5rem; box-sizing: border-box;">
        
        <!-- Sidebar Navigation (Desktop) -->
        <aside style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="position: sticky; top: 100px; display: flex; flex-direction: column; gap: 0.5rem;">
            <h3 style="color: #a0a0a0; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; padding-left: 0.75rem;">Compliance Center</h3>
            
            <a href="/legal?tab=terms" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1rem; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: all 0.2s; color: ${activeTab === 'terms' ? '#e5e5e5' : '#a0a0a0'}; background: ${activeTab === 'terms' ? 'rgba(245, 195, 184, 0.15)' : 'transparent'}; border-left: 4px solid ${activeTab === 'terms' ? '#f5c3b8' : 'transparent'};">
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>Terms of Service</span>
            </a>
            
            <a href="/legal?tab=privacy" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1rem; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: all 0.2s; color: ${activeTab === 'privacy' ? '#e5e5e5' : '#a0a0a0'}; background: ${activeTab === 'privacy' ? 'rgba(245, 195, 184, 0.15)' : 'transparent'}; border-left: 4px solid ${activeTab === 'privacy' ? '#f5c3b8' : 'transparent'};">
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>Privacy Policy</span>
            </a>
            
            <a href="/legal?tab=guidelines" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1rem; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: all 0.2s; color: ${activeTab === 'guidelines' ? '#e5e5e5' : '#a0a0a0'}; background: ${activeTab === 'guidelines' ? 'rgba(245, 195, 184, 0.15)' : 'transparent'}; border-left: 4px solid ${activeTab === 'guidelines' ? '#f5c3b8' : 'transparent'};">
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>Content Guidelines</span>
            </a>

            <div style="margin-top: 2rem; padding: 1rem; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: #a0a0a0;">
              <p style="margin: 0 0 0.5rem 0; font-weight: 600; color: #e5e5e5;">DMCA Designated Agent</p>
              <p style="margin: 0;">Email: <a href="mailto:dmca@modvc.org" style="color: #f5c3b8; text-decoration: none;">dmca@modvc.org</a></p>
            </div>
          </div>
        </aside>

        <!-- Main Content Area -->
        <main style="background: rgba(40, 40, 40, 0.35); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 20px; padding: 3rem; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); backdrop-filter: blur(12px); box-sizing: border-box; min-width: 0;">
          <h1 style="font-size: 2.25rem; font-weight: 850; margin: 0 0 2rem 0; padding-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); color: #ffffff; letter-spacing: -0.02em;">${title}</h1>
          <div style="line-height: 1.8; color: #b3b3b3; font-size: 1.05rem; white-space: pre-wrap; letter-spacing: 0.01em;">${escapeHtml(content)}</div>
        </main>

      </div>
      
      <!-- Footer -->
      <footer style="margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); padding: 1.5rem; text-align: center; color: #a0a0a0; font-size: 0.85rem;">
        &copy; 2026 Glass Gallery. All legal protections reserved.
      </footer>
    </div>

    <!-- Mobile Responsive Override Styles -->
    <style>
      @media (max-width: 900px) {
        #root > div > div {
          grid-template-columns: 1fr !important;
          padding: 1rem !important;
          gap: 1.5rem !important;
        }
        aside {
          display: none !important;
        }
        main {
          padding: 1.5rem !important;
        }
        h1 {
          font-size: 1.75rem !important;
        }
      }
    </style>
  `;

  indexHtml = indexHtml.replace(
    /<!-- SKELETON_START -->[\s\S]*?<!-- SKELETON_END -->/, 
    styledLegalHtml
  );

  return new Response(indexHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
    }
  });
}
