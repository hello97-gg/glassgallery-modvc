import React, { useState } from 'react';
import type { ImageMeta } from '../types';
import { isVideoUrl } from '../utils/mediaUtils';
import VideoPlayer from './VideoPlayer';

interface EmbedModalProps {
  image: ImageMeta;
  onClose: () => void;
}

function checkFreeLicense(license?: string): boolean {
  if (!license) return false;
  const l = license.toLowerCase().trim();
  return (
    l.includes('cc0') ||
    l.includes('cc-by') ||
    l.includes('cc by') ||
    l.includes('creative commons') ||
    l.includes('public domain') ||
    l.includes('mit') ||
    l.includes('gpl') ||
    l.includes('unsplash')
  );
}

const EmbedModal: React.FC<EmbedModalProps> = ({ image, onClose }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://gg.modvc.org';
  const embedIframeUrl = `${origin}/embed/${image.id}`;
  const embedMediaUrl = `${origin}/api/images?action=render&imageId=${image.id}`;
  const pageUrl = `${origin}/image/${image.id}`;
  const title = image.title || 'Glass Gallery';
  const isVideo = isVideoUrl(image.imageUrl);
  const isFree = checkFreeLicense(image.license);

  // Compute aspect ratio
  let aspectRatio = '16 / 9';
  let defaultHeight = '450px';
  if (image.width && image.height && image.width > 0 && image.height > 0) {
    aspectRatio = `${image.width} / ${image.height}`;
    defaultHeight = image.height > image.width ? '600px' : '450px';
  } else if (!isVideo) {
    aspectRatio = '4 / 3';
    defaultHeight = '480px';
  }

  const iframeSnippet = `<iframe src="${embedIframeUrl}" width="100%" height="${defaultHeight}" style="border:0;border-radius:12px;aspect-ratio:${aspectRatio};" allowfullscreen loading="lazy"></iframe>`;

  const snippets = [
    {
      label: 'HTML Embed (Protected Player)',
      icon: '</>',
      badge: 'Recommended',
      code: iframeSnippet,
      desc: 'Branded player with custom controls, logo watermark, and responsive layout.'
    },
    {
      label: 'Post Page Link',
      icon: '🔗',
      code: pageUrl,
      desc: 'Direct link to this post on Glass Gallery.'
    },
    ...(isFree ? [
      {
        label: 'Markdown',
        icon: 'MD',
        code: `[![${title}](${embedMediaUrl})](${pageUrl})`,
        desc: 'Embed thumbnail linked to post in markdown documents.'
      },
      {
        label: 'BB Code',
        icon: 'BB',
        code: `[url=${pageUrl}][img]${embedMediaUrl}[/img][/url]`,
        desc: 'Forum BBCode tag.'
      },
      {
        label: 'Direct Media URL',
        icon: '🌐',
        code: embedMediaUrl,
        desc: 'Hotlink URL for open-licensed media.'
      },
      {
        label: 'JSON Metadata API',
        icon: '{}',
        code: `${origin}/api/images?action=render&imageId=${image.id}&format=json`,
        desc: 'REST API metadata response.'
      }
    ] : [])
  ];

  const handleCopy = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col items-start relative animate-fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary">Add to your site</h2>
              <p className="text-xs text-secondary">Copy embed code to display this artwork on your website</p>
            </div>
          </div>
          <button onClick={onClose} className="text-2xl font-light text-secondary hover:text-primary transition-colors">&times;</button>
        </div>

        {/* Image Preview & License Banner */}
        <div className="px-6 pb-3 w-full space-y-2">
          <div className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border">
            {isVideo ? (
               <VideoPlayer src={image.imageUrl} muted className="w-14 h-14 object-cover rounded-lg flex-shrink-0 bg-black" />
            ) : (
               <img src={image.imageUrl} alt={title} className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary truncate">{title}</p>
              <p className="text-xs text-secondary truncate">by {image.uploaderName}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-surface border border-border text-secondary">
                  {image.license || 'All Rights Reserved'}
                </span>
                {isFree ? (
                  <span className="text-[10px] font-semibold text-green-400">Open License</span>
                ) : (
                  <span className="text-[10px] font-medium text-amber-400/90">Protected</span>
                )}
              </div>
            </div>
          </div>

          {!isFree && (
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200/90 flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>This post is copyrighted ({image.license || 'All Rights Reserved'}). Direct file hotlinking is disabled. Use the protected iframe player below to embed it on your site.</span>
            </div>
          )}
        </div>

        {/* Embed Codes */}
        <div className="w-full px-6 pb-5 space-y-3 max-h-[50vh] overflow-y-auto">
          {snippets.map((snippet, idx) => (
            <div key={idx} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-secondary flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-border flex items-center justify-center text-[10px] font-mono text-primary">
                    {snippet.icon}
                  </span>
                  {snippet.label}
                  {snippet.badge && (
                    <span className="text-[9px] bg-accent/20 text-accent font-semibold px-1.5 py-0.5 rounded">
                      {snippet.badge}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => handleCopy(snippet.code, idx)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-all ${
                    copiedIdx === idx
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-accent/10 text-accent hover:bg-accent/20'
                  }`}
                >
                  {copiedIdx === idx ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 bg-black/30 border border-border rounded-lg text-xs font-mono text-gray-300 whitespace-pre-wrap break-all overflow-x-auto max-h-24">
                <code>{snippet.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmbedModal;

