
import React, { useEffect } from 'react';

// Default Glass Gallery Logo - Uses the static file for better caching/performance
export const DEFAULT_FAVICON = '/favicon.svg';

interface SEOHeadProps {
  title: string;
  description: string;
  imageUrl?: string;
  url?: string;
  type?: 'website' | 'article' | 'profile';
  favicon?: string;
  author?: string;
  tags?: string[];
  location?: string;
  license?: string;
  authorName?: string;
}

const SEOHead: React.FC<SEOHeadProps> = ({ 
  title, 
  description, 
  imageUrl, 
  url, 
  type = 'website', 
  favicon, 
  author,
  tags,
  location,
  license,
  authorName
}) => {
  useEffect(() => {
    // 1. Update Title
    document.title = `${title} | Glass Gallery`;

    // 2. Helper to update or create meta tags
    const setMeta = (name: string, content: string, isProperty = false) => {
      let element = document.querySelector(isProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(isProperty ? 'property' : 'name', name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // 3. Standard Meta
    setMeta('description', description);

    // 4. Open Graph (Facebook, Discord, iMessage)
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:type', type, true);
    if (url) setMeta('og:url', url, true);
    if (imageUrl) setMeta('og:image', imageUrl, true);
    setMeta('og:site_name', 'Glass Gallery', true);

    // 5. Twitter Cards
    setMeta('twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    if (imageUrl) setMeta('twitter:image', imageUrl);

    // 6. Dynamic Favicon
    const activeFavicon = favicon || DEFAULT_FAVICON;
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    // Only update if changed to avoid flickering
    if (link.href !== activeFavicon) {
        link.href = activeFavicon;
    }

    // 7. Structured Data (JSON-LD) - Critical for Google Images & SEO
    // Remove all existing JSON-LD scripts to rebuild cleanly
    document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      // Don't remove static schemas from index.html (WebSite, Organization)
      try {
        const content = JSON.parse(el.textContent || '');
        if (content['@type'] === 'WebSite' || content['@type'] === 'Organization') return;
      } catch {}
      el.remove();
    });

    const baseUrl = 'https://gg.modvc.org';
    const schemas: any[] = [];

    if ((type === 'article' || tags || license) && imageUrl) {
        // ImageObject schema for image details
        const imageSchema: any = {
            "@context": "https://schema.org",
            "@type": "ImageObject",
            "contentUrl": imageUrl,
            "url": url || baseUrl,
            "name": title,
            "description": description,
            "thumbnail": imageUrl,
            "license": license || "https://creativecommons.org/licenses/by/4.0/",
            "acquireLicensePage": url || baseUrl,
            "creditText": authorName || author || "Glass Gallery User",
            "creator": {
                 "@type": "Person",
                 "name": authorName || author || "Glass Gallery User"
            },
            "copyrightHolder": {
                 "@type": "Person",
                 "name": authorName || author || "Glass Gallery User"
            }
        };
        if (tags && tags.length > 0) {
            imageSchema.keywords = tags.join(', ');
        }
        if (location) {
            imageSchema.locationCreated = {
                "@type": "Place",
                "name": location
            };
        }
        schemas.push(imageSchema);

        // BreadcrumbList for image detail pages
        schemas.push({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Glass Gallery",
                    "item": baseUrl
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": authorName || author || "Creator",
                    "item": author ? `${baseUrl}/?user=${author}` : baseUrl
                },
                {
                    "@type": "ListItem",
                    "position": 3,
                    "name": title
                }
            ]
        });
    } else if (type === 'profile') {
        // Profile schema
        schemas.push({
             "@context": "https://schema.org",
             "@type": "ProfilePage",
             "mainEntity": {
                 "@type": "Person",
                 "name": title.replace("'s Profile", ""),
                 "image": imageUrl
             }
         });
        // Breadcrumb for profile
        schemas.push({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Glass Gallery",
                    "item": baseUrl
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": title.replace("'s Profile", "")
                }
            ]
        });
    } else {
        // Homepage - WebSite schema handled statically in index.html
        // Add CollectionPage for explore views
        if (title === 'Explore Images') {
            schemas.push({
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                "name": "Explore Images - Glass Gallery",
                "description": description,
                "url": `${baseUrl}/?view=explore`
            });
        }
    }

    // Inject all schemas
    schemas.forEach(schema => {
        const script = document.createElement('script');
        script.setAttribute('type', 'application/ld+json');
        script.textContent = JSON.stringify(schema);
        document.head.appendChild(script);
    });

    // Cleanup: Reset title when component unmounts
    return () => {
      document.title = 'Glass Gallery';
    };
  }, [title, description, imageUrl, url, type, favicon, author, tags, location, license, authorName]);

  return null;
};

export default SEOHead;
