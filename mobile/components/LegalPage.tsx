import React, { useState, useEffect, useRef } from 'react';
import { TERMS_OF_SERVICE, PRIVACY_POLICY, CONTENT_GUIDELINES } from '../constants/legalText';

interface LegalPageProps {
  initialTab?: 'terms' | 'privacy' | 'guidelines';
  onBack: () => void;
}

const LegalPage: React.FC<LegalPageProps> = ({ onBack, initialTab = 'terms' }) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy' | 'guidelines'>(initialTab);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset scroll position when tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

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
    <div className="animate-fade-in w-full min-h-screen pb-20 select-none">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between py-4 px-2 border-b border-white/5 mb-6 bg-background/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-2 hover:bg-white/5 rounded-full text-secondary hover:text-primary transition-colors duration-150 active:scale-95 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-primary tracking-tight">Legal Center</h2>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-surface border border-white/5 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('terms')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'terms' ? 'bg-red-600 text-white shadow-md' : 'text-secondary hover:text-primary'}`}
          >
            Terms
          </button>
          <button 
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'privacy' ? 'bg-red-600 text-white shadow-md' : 'text-secondary hover:text-primary'}`}
          >
            Privacy
          </button>
          <button 
            onClick={() => setActiveTab('guidelines')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'guidelines' ? 'bg-red-600 text-white shadow-md' : 'text-secondary hover:text-primary'}`}
          >
            Rules
          </button>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary mb-6 pb-3 border-b border-white/5">{getTitle()}</h1>
        <div className="prose prose-invert prose-base max-w-none text-secondary/90 whitespace-pre-wrap font-sans leading-relaxed tracking-wide">
          {getContent()}
        </div>
      </div>
    </div>
  );
};

export default LegalPage;
