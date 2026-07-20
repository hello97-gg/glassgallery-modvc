import React, { useState } from 'react';
import type { ImageMeta } from '../types';
import { isVideoUrl } from '../utils/mediaUtils';

interface EmbedModalProps {
  image: ImageMeta;
  onClose: () => void;
}

const EmbedModal: React.FC<EmbedModalProps> = ({ image, onClose }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://gg.modvc.org';
  const embedUrl = `${origin}/api/images?action=render&imageId=${image.id}`;
  const pageUrl = `${origin}/image/${image.id}`;
  const title = image.title || 'Glass Gallery Image';

  const snippets = [
    {
      label: 'HTML Embed',
      icon: '</>',
      code: isVideoUrl(image.imageUrl)
        ? `<video controls src="${embedUrl}" style="max-width:100%;border-radius:12px"></video>`
        : `<a href="${pageUrl}" target="_blank" rel="noopener">\n  <img src="${embedUrl}" alt="${title}" style="max-width:100%;border-radius:12px" />\n</a>`,
    },
    {
      label: 'Markdown',
      icon: 'MD',
      code: `[![${title}](${embedUrl})](${pageUrl})`,
    },
    {
      label: 'BB Code',
      icon: 'BB',
      code: `[url=${pageUrl}][img]${embedUrl}[/img][/url]`,
    },
    {
      label: 'Direct Image URL',
      icon: '🔗',
      code: embedUrl,
    },
    {
      label: 'JSON Metadata API',
      icon: '{}',
      code: `${origin}/api/images?action=render&imageId=${image.id}&format=json`,
    },
  ];

  const handleCopy = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl shadow-lg w-full max-w-lg flex flex-col items-start relative animate-fade-in overflow-hidden"
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
              <p className="text-xs text-secondary">Copy embed code to display this image on your website</p>
            </div>
          </div>
          <button onClick={onClose} className="text-2xl font-light text-secondary hover:text-primary transition-colors">&times;</button>
        </div>

        {/* Image Preview */}
        <div className="px-6 pb-3 w-full">
          <div className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border">
            {isVideoUrl(image.imageUrl) ? (
               <video src={image.imageUrl} className="w-14 h-14 object-cover rounded-lg flex-shrink-0 bg-black" />
            ) : (
               <img src={image.imageUrl} alt={title} className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary truncate">{title}</p>
              <p className="text-xs text-secondary">by {image.uploaderName}</p>
            </div>
          </div>
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
