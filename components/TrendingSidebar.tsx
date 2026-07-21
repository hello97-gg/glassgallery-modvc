import React, { useState, useEffect } from 'react';

interface TrendingSidebarProps {
  onTopicClick?: (topic: string) => void;
}

export default function TrendingSidebar({ onTopicClick }: TrendingSidebarProps) {
  const [trending, setTrending] = useState<{topic: string, score: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchTrending = async () => {
      try {
        const res = await fetch('/api/trending');
        if (res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            if (isMounted && data.success && data.trending) {
              setTrending(data.trending);
            }
          } else {
            console.error('Expected JSON but got HTML. The backend function may not be registered yet. Please restart the dev server.');
          }
        }
      } catch (err) {
        console.error('Failed to fetch trending:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchTrending();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="bg-surface/50 border border-border/60 rounded-2xl p-4 shadow-sm w-full">
      <div className="flex items-center gap-2 mb-3 text-primary font-bold text-base">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
        </svg>
        <span>Trending</span>
      </div>
      
      {loading ? (
        <div className="space-y-3 py-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-3 items-center animate-pulse">
              <div className="w-4 h-4 bg-border/60 rounded"></div>
              <div className="h-4 bg-border/60 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : trending.length > 0 ? (
        <ul className="space-y-1">
          {trending.map((item, idx) => (
            <li 
              key={item.topic} 
              className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/5 active:scale-[0.98] cursor-pointer transition-all"
              onClick={() => onTopicClick?.(item.topic)}
            >
              <span className="text-xs font-bold text-secondary/70 w-4 text-center">{idx + 1}.</span>
              <span className="text-sm text-primary font-medium truncate">{item.topic}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-secondary py-2">No trending topics available.</p>
      )}
      
      <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-secondary/70">
        <a href="/legal?tab=terms" className="hover:underline">Terms</a>
        <a href="/legal?tab=privacy" className="hover:underline">Privacy</a>
        <a href="/legal?tab=guidelines" className="hover:underline">Guidelines</a>
        <a href="/api" className="hover:underline">API</a>
      </div>
    </div>
  );
}
