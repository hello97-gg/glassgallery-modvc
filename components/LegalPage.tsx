
import React, { useState, useEffect, useRef } from 'react';
import { TERMS_OF_SERVICE, PRIVACY_POLICY, CONTENT_GUIDELINES } from '../constants/legalText';
import SEOHead from './SEOHead';

interface LegalPageProps {
  initialTab?: 'terms' | 'privacy' | 'guidelines';
  onBackToFeed: () => void;
}

const LegalPage: React.FC<LegalPageProps> = ({ initialTab = 'terms', onBackToFeed }) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy' | 'guidelines'>(initialTab);
  const contentRef = useRef<HTMLDivElement>(null);

  // Sync tab with props when changed by external router/URL
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Scroll main view back to top on tab swap
  useEffect(() => {
    if (contentRef.current) {
        contentRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  const handleTabChange = (tab: 'terms' | 'privacy' | 'guidelines') => {
    setActiveTab(tab);
    const newUrl = new URL(window.location.href);
    newUrl.pathname = '/legal';
    newUrl.searchParams.set('tab', tab);
    window.history.pushState({}, '', newUrl.toString());
  };

  const getContent = () => {
    switch (activeTab) {
      case 'terms': return TERMS_OF_SERVICE;
      case 'privacy': return PRIVACY_POLICY;
      case 'guidelines': return CONTENT_GUIDELINES;
      default: return TERMS_OF_SERVICE;
    }
  };

  const getTitle = () => {
      switch (activeTab) {
        case 'terms': return 'Terms of Service';
        case 'privacy': return 'Privacy Policy';
        case 'guidelines': return 'Content Guidelines';
        default: return 'Legal Center';
      }
  };

  return (
    <div className="w-full min-h-screen text-primary flex flex-col items-center">
      <SEOHead 
        title={getTitle()}
        description={`Read the official ${getTitle()} and legal regulations of Glass Gallery.`}
        url={window.location.href}
      />
      
      {/* Premium Header / Hero Banner */}
      <div className="w-full max-w-6xl mt-4 mb-8 p-6 md:p-8 rounded-2xl bg-surface/50 border border-border backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Legal Center
          </h1>
          <p className="text-secondary text-sm md:text-base mt-1 font-medium">
            By using Glass Gallery, you agree to these terms.
          </p>
        </div>
        <button 
          onClick={onBackToFeed}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 hover:bg-accent hover:text-black transition-all duration-200 shadow-md shrink-0 self-stretch md:self-auto text-center"
        >
          Back to Home Feed
        </button>
      </div>

      {/* Main Responsive Content Layout */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-4 gap-8 px-2 md:px-0 pb-24">
        
        {/* Sidebar Nav */}
        <aside className="md:col-span-1 flex flex-col gap-2">
          <span className="text-xs font-bold text-secondary uppercase tracking-widest px-3 mb-2 hidden md:block">Legal Navigation</span>
          
          <button 
            onClick={() => handleTabChange('terms')}
            className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center gap-3 border ${
              activeTab === 'terms' 
                ? 'bg-accent/15 text-primary border-accent/30 font-bold shadow-md' 
                : 'text-secondary bg-surface/30 border-transparent hover:text-primary hover:bg-white/5'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Terms of Service
          </button>

          <button 
            onClick={() => handleTabChange('privacy')}
            className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center gap-3 border ${
              activeTab === 'privacy' 
                ? 'bg-accent/15 text-primary border-accent/30 font-bold shadow-md' 
                : 'text-secondary bg-surface/30 border-transparent hover:text-primary hover:bg-white/5'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Privacy Policy
          </button>

          <button 
            onClick={() => handleTabChange('guidelines')}
            className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center gap-3 border ${
              activeTab === 'guidelines' 
                ? 'bg-accent/15 text-primary border-accent/30 font-bold shadow-md' 
                : 'text-secondary bg-surface/30 border-transparent hover:text-primary hover:bg-white/5'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Guidelines
          </button>

          <div className="mt-6 p-4 rounded-2xl bg-surface/25 border border-border/50 text-xs text-secondary leading-relaxed hidden md:block">
            <span className="font-bold text-primary block mb-1">DMCA Notice Agent</span>
            Send standard copyright takedown inquiries directly to <a href="mailto:dmca@modvc.org" className="text-accent underline">dmca@modvc.org</a> for instant validation.
          </div>
        </aside>

        {/* Content Details Block */}
        <main 
          ref={contentRef}
          className="md:col-span-3 bg-surface/35 border border-border/60 rounded-2xl p-6 md:p-12 shadow-2xl backdrop-blur-md overflow-hidden"
        >
          <h2 className="text-2xl md:text-3xl font-extrabold mb-6 pb-4 border-b border-border text-primary tracking-tight">
            {getTitle()}
          </h2>
          <div className="prose prose-invert max-w-none text-secondary/90 whitespace-pre-wrap font-sans text-sm md:text-base leading-relaxed tracking-wide">
            {getContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default LegalPage;
