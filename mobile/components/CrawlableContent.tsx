import React from 'react';

interface CrawlableContentProps {
  content?: string | null;
  className?: string;
}

export const decodeHtmlEntities = (raw: string): string => {
  if (!raw) return '';
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
};

const URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const MENTION_REGEX = /(^|\s)@([a-zA-Z0-9_.-]{3,30})/g;

const cleanUrlMatch = (rawMatch: string): { url: string; trailing: string } => {
  const trailingPunctuationMatch = rawMatch.match(/([.,;:!?)]+)$/);
  if (trailingPunctuationMatch) {
    const trailing = trailingPunctuationMatch[1];
    const url = rawMatch.slice(0, -trailing.length);
    return { url, trailing };
  }
  return { url: rawMatch, trailing: '' };
};

const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
  e.stopPropagation();

  try {
    const isInternal = href.startsWith('/') || (typeof window !== 'undefined' && href.startsWith(window.location.origin));
    if (isInternal) {
      e.preventDefault();
      const internalPath = href.startsWith('/') ? href : new URL(href).pathname + new URL(href).search;
      window.history.pushState({}, '', internalPath);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  } catch (err) {
    // If URL parsing fails, allow default browser link handling
  }
};

const linkifyTextChunk = (text: string, keyPrefix: string): React.ReactNode[] => {
  if (!text) return [];

  const parts = text.split(URL_REGEX);
  const elements: React.ReactNode[] = [];

  parts.forEach((part, index) => {
    if (!part) return;

    if (part.match(URL_REGEX)) {
      const { url, trailing } = cleanUrlMatch(part);
      const fullHref = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      
      elements.push(
        <a
          key={`${keyPrefix}-url-${index}`}
          href={fullHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline break-all font-medium transition-colors"
          onClick={(e) => handleLinkClick(e, fullHref)}
        >
          {url}
        </a>
      );

      if (trailing) {
        elements.push(<span key={`${keyPrefix}-trail-${index}`}>{trailing}</span>);
      }
    } else {
      const mentionParts = part.split(MENTION_REGEX);
      if (mentionParts.length > 1) {
        let i = 0;
        while (i < mentionParts.length) {
          const before = mentionParts[i++];
          const prefixSpace = mentionParts[i++];
          const handle = mentionParts[i++];

          if (before) {
            elements.push(<span key={`${keyPrefix}-txt-${index}-${i}`}>{before}</span>);
          }
          if (handle) {
            elements.push(
              <span key={`${keyPrefix}-mention-wrap-${index}-${i}`}>
                {prefixSpace || ''}
                <a
                  href={`/@${handle.toLowerCase()}`}
                  className="text-accent hover:underline font-semibold"
                  onClick={(e) => handleLinkClick(e, `/@${handle.toLowerCase()}`)}
                >
                  @{handle}
                </a>
              </span>
            );
          }
        }
      } else {
        elements.push(<span key={`${keyPrefix}-txt-${index}`}>{part}</span>);
      }
    }
  });

  return elements;
};

const renderDomNode = (node: ChildNode, key: string): React.ReactNode => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = decodeHtmlEntities(node.textContent || '');
    return linkifyTextChunk(text, key);
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();

    if (tagName === 'a') {
      const rawHref = el.getAttribute('href') || '';
      const safeHref = (rawHref.startsWith('http://') || rawHref.startsWith('https://') || rawHref.startsWith('/') || rawHref.startsWith('mailto:'))
        ? rawHref
        : `https://${rawHref}`;

      const linkText = decodeHtmlEntities(el.textContent || safeHref);

      return (
        <a
          key={key}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline break-all font-medium transition-colors"
          onClick={(e) => handleLinkClick(e, safeHref)}
        >
          {linkText}
        </a>
      );
    }

    if (tagName === 'b' || tagName === 'strong') {
      return (
        <strong key={key} className="font-bold text-primary">
          {Array.from(el.childNodes).map((child, i) => renderDomNode(child, `${key}-b-${i}`))}
        </strong>
      );
    }

    if (tagName === 'i' || tagName === 'em') {
      return (
        <em key={key} className="italic">
          {Array.from(el.childNodes).map((child, i) => renderDomNode(child, `${key}-i-${i}`))}
        </em>
      );
    }

    if (tagName === 'br') {
      return <br key={key} />;
    }

    return (
      <span key={key}>
        {Array.from(el.childNodes).map((child, i) => renderDomNode(child, `${key}-${tagName}-${i}`))}
      </span>
    );
  }

  return null;
};

export const CrawlableContent: React.FC<CrawlableContentProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const hasHtmlMarkup = /<[a-z][\s\S]*>/i.test(content);

  if (hasHtmlMarkup && typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const childNodes = Array.from(doc.body.childNodes);

      return (
        <div className={`break-words ${className}`}>
          {childNodes.map((node, i) => renderDomNode(node, `dom-${i}`))}
        </div>
      );
    } catch (e) {
      console.warn('Failed to parse HTML markup with DOMParser:', e);
    }
  }

  const decoded = decodeHtmlEntities(content);
  const lines = decoded.split(/\r?\n/);

  return (
    <div className={`break-words ${className}`}>
      {lines.map((line, lineIndex) => (
        <React.Fragment key={`line-${lineIndex}`}>
          {linkifyTextChunk(line, `l-${lineIndex}`)}
          {lineIndex < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </div>
  );
};

export default CrawlableContent;
