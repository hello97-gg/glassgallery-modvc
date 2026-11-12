import { getDb } from "../api/lib/turso.js";

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
  const pathMatch = url.pathname.match(/\/c\/([^/?#]+)/i);
  const rawSlug = context.params?.slug || (pathMatch ? pathMatch[1] : null);
  const cleanSlug = rawSlug ? decodeURIComponent(rawSlug).trim().toLowerCase() : "";
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const baseUrl = isLocal ? url.origin : "https://gg.modvc.org";

  if (!cleanSlug) {
    return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 - Community Not Found | Glass Gallery</title><meta name="robots" content="noindex, follow" /><link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" /><link rel="icon" type="image/x-icon" href="/favicon.ico" /></head><body style="background:#181818;color:#e5e5e5;font-family:system-ui,sans-serif;text-align:center;padding:4rem;"><h1>404 - Community Not Found</h1><p style="color:#a0a0a0;margin:1rem 0 2rem;">No community slug was provided in the request.</p><a href="/communities" style="display:inline-block;background:#f5c3b8;color:#181818;padding:0.75rem 1.5rem;border-radius:999px;text-decoration:none;font-weight:600;">Browse Communities</a></body></html>`, {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Robots-Tag': 'noindex, follow'
      }
    });
  }

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(url.toString(), context.request);
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch {}
  }

  try {
    const db = getDb(context.env);

    // Query community by slug
    const commRes = await db.execute({
      sql: "SELECT * FROM communities WHERE LOWER(slug) = LOWER(?) LIMIT 1",
      args: [cleanSlug]
    });

    if (commRes.rows.length === 0) {
      return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 - Community Not Found | Glass Gallery</title><meta name="robots" content="noindex, follow" /><link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" /><link rel="icon" type="image/x-icon" href="/favicon.ico" /></head><body style="background:#181818;color:#e5e5e5;font-family:system-ui,sans-serif;text-align:center;padding:4rem;"><h1>404 - Community Not Found</h1><p style="color:#a0a0a0;margin:1rem 0 2rem;">The requested community "c/${escapeHtml(cleanSlug)}" does not exist or has been removed.</p><a href="/communities" style="display:inline-block;background:#f5c3b8;color:#181818;padding:0.75rem 1.5rem;border-radius:999px;text-decoration:none;font-weight:600;">Explore Communities</a></body></html>`, {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Robots-Tag': 'noindex, follow'
        }
      });
    }

    const community = commRes.rows[0];
    const isPrivate = community.type === 'private';

    // Fetch base index.html
    let indexHtml = "";
    try {
      const assetUrl = new URL(context.request.url);
      assetUrl.pathname = '/index.html';
      const assetResponse = await context.env.ASSETS.fetch(new Request(assetUrl));
      if (assetResponse.ok) {
        indexHtml = await assetResponse.text();
      }
    } catch (e) {
      console.warn("Failed to fetch base index.html:", e);
    }

    if (!indexHtml) {
      indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Glass Gallery</title></head><body><div id="root"></div></body></html>`;
    }

    const pageUrl = `${baseUrl}/c/${community.slug}`;
    const commName = escapeHtml(community.name);
    const commCategory = escapeHtml(community.category || 'General');
    const memberCount = Number(community.member_count || 1);
    const postCount = Number(community.post_count || 0);

    let seoTitle = `${community.name} (c/${community.slug}) | Glass Gallery Community`;
    if (seoTitle.length > 65) {
      seoTitle = seoTitle.slice(0, 62) + '...';
    }

    let rawDesc = (community.description || "").trim();
    let description = rawDesc;
    if (!description || description.length < 115) {
      description = `Join c/${community.slug} on Glass Gallery: ${community.name}. Connect with ${memberCount} creators and curators sharing visual stories, photographs, and discussions.`;
    }
    if (description.length > 158) {
      description = description.slice(0, 155) + '...';
    }

    const bannerUrl = community.banner_url || `${baseUrl}/web-app-manifest-512x512.png`;
    const iconUrl = community.icon_url || `${baseUrl}/favicon-96x96.png`;

    // If private, instruct crawlers not to index
    const robotsTag = isPrivate ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1';

    // Query recent 5 approved posts for rich content and Schema.org
    let recentPosts = [];
    if (!isPrivate) {
      try {
        const postsRes = await db.execute({
          sql: "SELECT id, title, description, imageUrl, uploaderName, post_type, uploadedAt, likes FROM images WHERE community_id = ? AND mod_status = 'approved' ORDER BY uploadedAt DESC LIMIT 6",
          args: [community.id]
        });
        recentPosts = postsRes.rows || [];
      } catch (e) {
        console.warn("Failed to fetch community posts for SSR:", e);
      }
    }

    // JSON-LD structured data
    const collectionSchema = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": community.name,
      "description": description,
      "url": pageUrl,
      "isPartOf": {
        "@type": "WebSite",
        "name": "Glass Gallery",
        "url": baseUrl
      },
      "about": {
        "@type": "Thing",
        "name": commCategory
      },
      "interactionStatistic": [
        {
          "@type": "InteractionCounter",
          "interactionType": "https://schema.org/FollowAction",
          "userInteractionCount": memberCount
        },
        {
          "@type": "InteractionCounter",
          "interactionType": "https://schema.org/WriteAction",
          "userInteractionCount": postCount
        }
      ]
    };

    if (recentPosts.length > 0) {
      collectionSchema.hasPart = recentPosts.map(p => ({
        "@type": p.post_type === 'text' ? 'DiscussionForumPosting' : 'ImageObject',
        "name": p.title || "Community Post",
        "url": `${baseUrl}/image/${p.id}`,
        "author": {
          "@type": "Person",
          "name": p.uploaderName || "Creator"
        },
        "datePublished": p.uploadedAt
      }));
    }

    const seoMetaTags = `
    <base href="${baseUrl}/" />
    <title>${escapeHtml(seoTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${robotsTag}" />
    <link rel="canonical" href="${pageUrl}" />
    <link rel="icon" type="image/png" sizes="96x96" href="${baseUrl}/favicon-96x96.png" />
    <link rel="icon" type="image/x-icon" href="${baseUrl}/favicon.ico" />
    <link rel="shortcut icon" href="${baseUrl}/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="${baseUrl}/apple-touch-icon.png" />
    
    <meta property="og:site_name" content="Glass Gallery" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(seoTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:image" content="${bannerUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${bannerUrl}" />
    <meta name="twitter:title" content="${escapeHtml(seoTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    
    <script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>
    `;

    if (indexHtml.includes('<!-- SEO_META_START -->')) {
      indexHtml = indexHtml.replace(/<!-- SEO_META_START -->[\s\S]*?<!-- SEO_META_END -->/, seoMetaTags);
    } else {
      indexHtml = indexHtml.replace(
        /<title>[\s\S]*?<\/title>[\s\S]*?<meta name="twitter:image" content="[^"]*" \/>\s*(?:<!-- Canonical URL -->\s*)?(?:<link rel="canonical"[^>]*>)?/i,
        seoMetaTags
      );
    }

    // Server-rendered fallback HTML inside <div id="root">
    const postsHtml = isPrivate 
      ? `<div style="text-align: center; padding: 3rem 1.5rem; background: #222; border-radius: 12px; border: 1px solid #333; margin-top: 1.5rem;"><p style="font-size: 1.1rem; color: #fff; font-weight: 600;">This is a Private Community</p><p style="color: #999; margin-top: 0.5rem; font-size: 0.9rem;">Sign in or request an invitation to view discussion posts and shared works.</p></div>`
      : (recentPosts.length > 0 
        ? `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; width: 100%; margin-top: 1.5rem;">
            ${recentPosts.map(p => `
              <article style="background: rgba(35,35,35,0.7); border: 1px solid #333; border-radius: 12px; padding: 1rem; backdrop-filter: blur(8px);">
                <a href="${baseUrl}/image/${p.id}" style="text-decoration: none; color: inherit; display: block;">
                  ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${escapeHtml(p.title || 'Community post')}" style="width: 100%; height: 180px; object-fit: cover; border-radius: 8px; margin-bottom: 0.75rem;" loading="lazy" />` : ''}
                  <h3 style="font-size: 1rem; font-weight: 600; color: #fff; margin: 0 0 0.5rem;">${escapeHtml(p.title || 'Untitled Discussion')}</h3>
                  <p style="font-size: 0.85rem; color: #aaa; margin: 0; line-height: 1.4;">${escapeHtml((p.description || '').slice(0, 100))}</p>
                  <div style="font-size: 0.75rem; color: #777; margin-top: 0.75rem;">By ${escapeHtml(p.uploaderName || 'Creator')} &bull; ${p.likes || 0} likes</div>
                </a>
              </article>
            `).join('')}
          </div>`
        : `<div style="text-align: center; padding: 3rem; color: #888; background: #222; border-radius: 12px; border: 1px solid #333; margin-top: 1.5rem;">No posts published in this community yet.</div>`
      );

    const serverRenderedHtml = `
      <div style="display: flex; flex-direction: column; align-items: center; padding: 1.5rem; background: #181818; color: #e5e5e5; min-height: 100vh; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <header style="width: 100%; max-width: 1100px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #282828;">
          <a href="${baseUrl}/" style="display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: #ffffff; font-size: 1.25rem; font-weight: 700;">
            <img src="${baseUrl}/web-app-manifest-512x512.png" alt="Glass Gallery Logo" width="36" height="36" style="border-radius: 8px; display: block;" />
            <span>Glass Gallery</span>
          </a>
          <nav style="display: flex; gap: 1.25rem; align-items: center;">
            <a href="${baseUrl}/" style="color: #a0a0a0; text-decoration: none; font-size: 0.95rem;">Explore</a>
            <a href="${baseUrl}/communities" style="color: #f5c3b8; text-decoration: none; font-size: 0.95rem; font-weight: 600;">Communities</a>
            <a href="${baseUrl}/gallery" style="color: #a0a0a0; text-decoration: none; font-size: 0.95rem;">Archive</a>
          </nav>
        </header>

        <nav aria-label="Breadcrumb navigation" style="width: 100%; max-width: 1100px; margin-bottom: 1rem; font-size: 0.875rem; color: #888;">
          <a href="${baseUrl}/" style="color: #a0a0a0; text-decoration: none;">Home</a>
          <span style="margin: 0 0.5rem;">/</span>
          <a href="${baseUrl}/communities" style="color: #a0a0a0; text-decoration: none;">Communities</a>
          <span style="margin: 0 0.5rem;">/</span>
          <span style="color: #ffffff;">c/${escapeHtml(community.slug)}</span>
        </nav>

        <main style="width: 100%; max-width: 1100px;">
          <div style="background: rgba(30, 30, 30, 0.8); border: 1px solid #333; border-radius: 16px; overflow: hidden; margin-bottom: 2rem;">
            ${community.banner_url ? `<div style="height: 180px; width: 100%; background: url('${escapeHtml(community.banner_url)}') center/cover no-repeat;"></div>` : `<div style="height: 100px; width: 100%; background: linear-gradient(135deg, #2b2b2b, #1e1e1e);"></div>`}
            <div style="padding: 1.5rem; display: flex; align-items: flex-start; gap: 1.25rem; flex-wrap: wrap;">
              <div style="width: 72px; height: 72px; border-radius: 16px; overflow: hidden; border: 2px solid #444; background: #282828; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 700; color: #f5c3b8;">
                ${community.icon_url ? `<img src="${escapeHtml(community.icon_url)}" alt="${commName}" style="width: 100%; height: 100%; object-fit: cover;" />` : commName.charAt(0).toUpperCase()}
              </div>
              <div style="flex: 1; min-width: 250px;">
                <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                  <h1 style="font-size: 1.75rem; font-weight: 700; margin: 0; color: #ffffff;">${commName}</h1>
                  <span style="background: rgba(245, 195, 184, 0.15); color: #f5c3b8; font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px; text-transform: uppercase; font-weight: 600;">${escapeHtml(community.type)}</span>
                  <span style="background: #2a2a2a; color: #888; font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px;">${commCategory}</span>
                </div>
                <p style="color: #888; margin: 0.25rem 0 0; font-size: 0.9rem;">c/${escapeHtml(community.slug)} &bull; ${memberCount} members &bull; ${postCount} posts</p>
                <p style="color: #ccc; margin: 0.75rem 0 0; line-height: 1.5; font-size: 0.95rem;">${escapeHtml(community.description || 'Welcome to this community.')}</p>
              </div>
            </div>
          </div>

          <section>
            <h2 style="font-size: 1.25rem; font-weight: 600; color: #fff; margin: 0 0 1rem;">Community Feed</h2>
            ${postsHtml}
          </section>
        </main>
      </div>
    `;

    const hydratedHtml = indexHtml.replace(
      '<div id="root"></div>',
      `<div id="root">${serverRenderedHtml}</div>`
    );

    const finalResponse = new Response(hydratedHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400'
      }
    });

    if (cache && context.waitUntil) {
      context.waitUntil(cache.put(cacheKey, finalResponse.clone()).catch(() => {}));
    }

    return finalResponse;
  } catch (err) {
    console.error("[c/slug] Edge SSR Error:", err);
    // Graceful fallback to client-side shell (200) so crawlers never experience a 5xx error
    try {
      const assetUrl = new URL(context.request.url);
      assetUrl.pathname = '/index.html';
      const assetResponse = await context.env.ASSETS.fetch(new Request(assetUrl));
      if (assetResponse.ok) {
        const fallbackHtml = await assetResponse.text();
        return new Response(fallbackHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
      }
    } catch {}

    return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Glass Gallery</title></head><body><div id="root"></div></body></html>`, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=UTF-8' }
    });
  }
}

