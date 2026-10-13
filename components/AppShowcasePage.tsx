import React, { useState, useEffect, useRef } from 'react';

// The 9 media screenshots hosted on the CDN
export const APP_SCREENSHOTS = [
  { id: 1, url: 'https://cdn.modvc.org/glassgallery-apk/media_1.jpeg' },
  { id: 2, url: 'https://cdn.modvc.org/glassgallery-apk/media_2.jpeg' },
  { id: 3, url: 'https://cdn.modvc.org/glassgallery-apk/media_3.jpeg' },
  { id: 4, url: 'https://cdn.modvc.org/glassgallery-apk/media_4.jpeg' },
  { id: 5, url: 'https://cdn.modvc.org/glassgallery-apk/media_5.jpeg' },
  { id: 6, url: 'https://cdn.modvc.org/glassgallery-apk/media_6.jpeg' },
  { id: 7, url: 'https://cdn.modvc.org/glassgallery-apk/media_7.jpeg' },
  { id: 8, url: 'https://cdn.modvc.org/glassgallery-apk/media_8.jpeg' },
  { id: 9, url: 'https://cdn.modvc.org/glassgallery-apk/media_9.jpeg' },
];

export const APK_DOWNLOAD_URL = 'https://pub-0b9a9d568aa64fe6afb1da05ff60483f.r2.dev/GlassGallery.apk';
export const APK_TRACKED_DOWNLOAD_URL = '/api/images?action=app_download';
export const APK_VERSION = 'v1.0.7';
export const APK_SIZE = '15.4 MB';
export const MIN_ANDROID_VERSION = 'Android 8.0+';

// The exact mobile app icon SVG provided by the user
export const AppIconSvg: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 512 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    width={size}
    height={size}
    fill="none"
    className={className}
  >
    {/* Deep Charcoal App Icon Squircle */}
    <rect width="512" height="512" rx="115" fill="#18161B" />

    {/* Solid Pastel Peach Circular Camera Body (Original Logo Color) */}
    <circle cx="256" cy="256" r="160" fill="#F5C3B8" />

    {/* Dark Contrast Cutout Inside Lens so White Pops */}
    <circle cx="256" cy="256" r="88" fill="#18161B" />

    {/* Outer White Lens Ring */}
    <circle cx="256" cy="256" r="88" stroke="#FFFFFF" strokeWidth="26" />

    {/* Solid Pastel Peach Inner Lens Core */}
    <circle cx="256" cy="256" r="32" fill="#F5C3B8" />

    {/* Minimalist Dark Flash Cutout */}
    <circle cx="336" cy="176" r="18" fill="#18161B" />
  </svg>
);

interface AppShowcasePageProps {
  onBack?: () => void;
}

export const AppShowcasePage: React.FC<AppShowcasePageProps> = ({ onBack }) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'device' | 'grid'>('device');
  const [isPlaying, setIsPlaying] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Real download count fetched from backend database
  const [downloadCount, setDownloadCount] = useState<number>(0);
  const [isCountLoading, setIsCountLoading] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch real download count from server on mount
  useEffect(() => {
    fetch('/api/images?action=app_stats')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.downloadCount === 'number') {
          setDownloadCount(data.downloadCount);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch real download count:', err);
      })
      .finally(() => {
        setIsCountLoading(false);
      });
  }, []);

  // Auto-advance device mockup slides
  useEffect(() => {
    if (!isPlaying || viewMode !== 'device' || lightboxIndex !== null) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % APP_SCREENSHOTS.length);
    }, 4500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, viewMode, lightboxIndex]);

  // Handle Download Click - increments real download count on the server
  const handleDownloadClick = async () => {
    try {
      const res = await fetch('/api/images?action=app_download', { method: 'POST' });
      const data = await res.json();
      if (data && typeof data.downloadCount === 'number') {
        setDownloadCount(data.downloadCount);
      } else {
        setDownloadCount((prev) => prev + 1);
      }
    } catch {
      setDownloadCount((prev) => prev + 1);
    }

    setToastMessage('Download started! Check your browser downloads.');
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Handle Copy Link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(APK_DOWNLOAD_URL).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null ? (prev + 1) % APP_SCREENSHOTS.length : 0));
      }
      if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null ? (prev - 1 + APP_SCREENSHOTS.length) % APP_SCREENSHOTS.length : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex]);

  const currentScreenshot = APP_SCREENSHOTS[activeSlide];

  return (
    <div className="min-h-screen w-full bg-background text-primary pb-24 md:pb-16 relative overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-[#18161B] border border-[#F5C3B8]/40 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in backdrop-blur-md">
          <div className="w-8 h-8 rounded-full bg-[#F5C3B8]/20 flex items-center justify-center text-[#F5C3B8]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Ambient Lighting Background */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 bg-[#F5C3B8]/10 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 w-[500px] h-[500px] bg-[#F5C3B8]/5 rounded-full blur-[160px]" />
      <div className="pointer-events-none absolute bottom-10 left-1/4 w-80 h-80 bg-orange-500/5 rounded-full blur-[150px]" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-8">
        {/* Top Back / Breadcrumb Nav */}
        {onBack && (
          <button
            onClick={onBack}
            className="group flex items-center gap-2 text-secondary hover:text-primary mb-6 transition-colors px-3 py-1.5 rounded-xl hover:bg-surface/60 w-fit"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Back to feed</span>
          </button>
        )}

        {/* HERO SECTION */}
        <section className="relative rounded-3xl bg-surface/50 border border-border/80 backdrop-blur-xl p-6 sm:p-10 md:p-12 shadow-2xl mb-12 overflow-hidden">
          {/* Subtle inner grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* App Icon + Glow (Left / Hero) */}
            <div className="lg:col-span-5 flex flex-col items-center text-center">
              <div className="relative group cursor-pointer mb-6">
                {/* Glow ring */}
                <div className="absolute -inset-4 bg-gradient-to-r from-[#F5C3B8]/30 via-peach/20 to-orange-400/20 rounded-[42px] blur-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Mobile App Icon */}
                <div className="relative w-40 h-40 sm:w-48 sm:h-48 rounded-[36px] overflow-hidden shadow-2xl border-2 border-white/10 group-hover:scale-105 group-hover:rotate-1 transition-all duration-300">
                  <AppIconSvg className="w-full h-full object-cover" />
                </div>
              </div>

              {/* Version & Specs Chips */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs font-medium text-secondary">
                <span className="px-3 py-1 rounded-full bg-surface border border-border/70 text-primary font-semibold">
                  {APK_VERSION}
                </span>
                <span className="px-3 py-1 rounded-full bg-surface border border-border/70">
                  {APK_SIZE}
                </span>
                <span className="px-3 py-1 rounded-full bg-surface border border-border/70">
                  {MIN_ANDROID_VERSION}
                </span>
              </div>
            </div>

            {/* App Description & Download CTA (Right) */}
            <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-primary mb-4 leading-tight">
                Glass Gallery <br className="hidden sm:block" />
                <span className="bg-gradient-to-r from-[#F5C3B8] via-[#ffd6cc] to-amber-200 bg-clip-text text-transparent">
                  for Android
                </span>
              </h1>

              <p className="text-secondary text-base sm:text-lg mb-8 max-w-xl leading-relaxed">
                Experience ultra-smooth infinite scrolling, zero-delay fullscreen reels, dual-tier thumbnail speed, and lossless media downloads directly on your smartphone.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto mb-8">
                {/* Primary Download APK Button */}
                <a
                  href={APK_DOWNLOAD_URL}
                  download="GlassGallery.apk"
                  onClick={handleDownloadClick}
                  className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-[#18161B] to-[#25222a] border border-[#F5C3B8]/60 text-white font-bold text-base shadow-xl hover:shadow-2xl hover:border-[#F5C3B8] hover:scale-[1.02] active:scale-95 transition-all overflow-hidden"
                >
                  {/* Subtle hover gradient sweep */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#F5C3B8]/15 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  
                  {/* Download Icon */}
                  <div className="w-7 h-7 rounded-full bg-[#F5C3B8] text-[#18161B] flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:translate-y-0.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>

                  <div className="text-left">
                    <div className="text-sm font-bold text-[#F5C3B8]">Download APK</div>
                    <div className="text-[11px] text-gray-300 font-normal">Direct link • {APK_SIZE}</div>
                  </div>
                </a>

                {/* Secondary Copy Link Button */}
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-surface/80 hover:bg-surface border border-border text-primary font-semibold text-sm hover:border-primary/30 transition-all active:scale-95"
                  title="Copy APK download URL"
                >
                  <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
                </button>
              </div>

              {/* REAL DOWNLOAD COUNTER */}
              <div className="pt-6 border-t border-border/70 w-full max-w-lg">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-2xl sm:text-3xl font-black text-primary">
                    <span className="text-[#F5C3B8]">
                      {isCountLoading ? '...' : downloadCount.toLocaleString()}
                    </span>
                  </div>
                  <span className="text-xs text-secondary font-medium mt-0.5">
                    Total Downloads
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* QR CODE & SCANNER BANNER */}
        <section className="mb-12 bg-surface/40 border border-border/80 rounded-2xl p-6 sm:p-8 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md">
          <div className="flex items-center gap-5">
            <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white p-2 rounded-2xl shadow-lg shrink-0 border border-border/30 flex items-center justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data=${encodeURIComponent(APK_DOWNLOAD_URL)}`}
                alt="Scan to download Glass Gallery APK"
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-primary mb-1">
                Scan with your phone camera
              </h3>
              <p className="text-secondary text-xs sm:text-sm max-w-md">
                Point your smartphone camera at this QR code to download and install the Glass Gallery APK directly onto your device.
              </p>
            </div>
          </div>

          <a
            href={APK_DOWNLOAD_URL}
            download="GlassGallery.apk"
            onClick={handleDownloadClick}
            className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl bg-surface hover:bg-border/40 border border-border text-primary font-bold text-xs uppercase tracking-wider transition-all"
          >
            <svg className="w-4 h-4 text-[#F5C3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Direct
          </a>
        </section>

        {/* SECTION: SCREENSHOTS SHOWCASE (9 IMAGES) */}
        <section className="mb-16">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-primary">
                App Showcase
              </h2>
            </div>

            {/* View Mode Toggle */}
            <div className="inline-flex items-center p-1 rounded-xl bg-surface border border-border text-xs font-semibold self-start sm:self-auto">
              <button
                onClick={() => setViewMode('device')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'device'
                    ? 'bg-[#18161B] text-[#F5C3B8] shadow-sm font-bold'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                Phone Mockup
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'grid'
                    ? 'bg-[#18161B] text-[#F5C3B8] shadow-sm font-bold'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                All 9 Screens
              </button>
            </div>
          </div>

          {/* VIEW MODE 1: INTERACTIVE PHONE MOCKUP */}
          {viewMode === 'device' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-surface/30 border border-border/80 rounded-3xl p-6 sm:p-10 backdrop-blur-md">
              {/* Device Frame (Center / Left) */}
              <div className="lg:col-span-5 flex justify-center">
                <div className="relative group w-[280px] sm:w-[320px] aspect-[9/19.5] bg-[#18161B] rounded-[48px] p-3 shadow-2xl border-4 border-[#2b2732] ring-1 ring-white/10 overflow-hidden">
                  {/* Phone Speaker & Camera Cutout Pill */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-[#100e13] rounded-full z-30 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-[#18161B] border border-white/10" />
                  </div>

                  {/* Clean Screen Content - Without Any Caption Overlay Covering Image */}
                  <div
                    onClick={() => setLightboxIndex(activeSlide)}
                    className="relative w-full h-full rounded-[38px] overflow-hidden bg-black cursor-pointer"
                  >
                    <img
                      key={currentScreenshot.id}
                      src={currentScreenshot.url}
                      alt={`Screen ${currentScreenshot.id}`}
                      className="w-full h-full object-cover transition-opacity duration-300 animate-fade-in"
                      loading="eager"
                    />

                    {/* Hover Click to Enlarge Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-semibold backdrop-blur-[2px]">
                      <svg className="w-5 h-5 text-[#F5C3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                      </svg>
                      Click to Enlarge
                    </div>
                  </div>
                </div>
              </div>

              {/* Slide Controls & Interactive Thumbnail Strip (Right) */}
              <div className="lg:col-span-7 flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-sm font-bold text-[#F5C3B8] tracking-wider uppercase">
                      Screenshot {activeSlide + 1} of {APP_SCREENSHOTS.length}
                    </span>

                    {/* Play / Pause Auto-advance */}
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-primary px-3 py-1.5 rounded-lg bg-surface border border-border transition-colors"
                      title={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
                    >
                      {isPlaying ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-[#F5C3B8]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span>Pause Slideshow</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                          <span>Play Slideshow</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Previous / Next Controls */}
                  <div className="flex items-center gap-3 mb-8">
                    <button
                      onClick={() => setActiveSlide((prev) => (prev - 1 + APP_SCREENSHOTS.length) % APP_SCREENSHOTS.length)}
                      className="p-3.5 rounded-xl bg-surface hover:bg-border/60 border border-border text-primary transition-all active:scale-95"
                      aria-label="Previous screenshot"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setActiveSlide((prev) => (prev + 1) % APP_SCREENSHOTS.length)}
                      className="p-3.5 rounded-xl bg-surface hover:bg-border/60 border border-border text-primary transition-all active:scale-95"
                      aria-label="Next screenshot"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setLightboxIndex(activeSlide)}
                      className="px-5 py-3.5 rounded-xl bg-surface hover:bg-border/60 border border-border text-primary font-semibold text-xs transition-all flex items-center gap-2"
                    >
                      <svg className="w-4 h-4 text-[#F5C3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                      View Fullscreen
                    </button>
                  </div>
                </div>

                {/* 9 Thumbnails Carousel Strip */}
                <div>
                  <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
                    {APP_SCREENSHOTS.map((item, index) => {
                      const isActive = index === activeSlide;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveSlide(index)}
                          className={`relative shrink-0 w-16 h-28 rounded-xl overflow-hidden border-2 transition-all group ${
                            isActive
                              ? 'border-[#F5C3B8] ring-2 ring-[#F5C3B8]/30 scale-105'
                              : 'border-border/60 opacity-60 hover:opacity-100 hover:border-primary/40'
                          }`}
                        >
                          <img
                            src={item.url}
                            alt={`Thumbnail ${item.id}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute top-1 left-1 bg-black/70 text-[9px] font-bold text-white px-1 rounded">
                            {item.id}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: RESPONSIVE GRID (ALL 9 SCREENSHOTS) */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 gap-4 sm:gap-6">
              {APP_SCREENSHOTS.map((item, index) => (
                <div
                  key={item.id}
                  onClick={() => setLightboxIndex(index)}
                  className="group relative bg-surface/60 border border-border/80 hover:border-[#F5C3B8]/60 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col"
                >
                  {/* Clean Image Aspect Box - No Mock Captions */}
                  <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
                    <img
                      src={item.url}
                      alt={`Screenshot ${item.id}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-lg">
                        <svg className="w-5 h-5 text-[#F5C3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                        </svg>
                      </div>
                    </div>

                    <div className="absolute top-3 left-3 bg-[#18161B]/80 backdrop-blur-md border border-white/10 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      #{item.id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SECTION: 3-STEP INSTALLATION GUIDE */}
        <section className="mb-16 bg-surface/30 border border-border/80 rounded-3xl p-6 sm:p-10 backdrop-blur-md">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-primary mb-2">
              How to Install
            </h2>
            <p className="text-secondary text-xs sm:text-sm">
              Quick 3-step setup to get Glass Gallery running on any Android device.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="relative p-6 rounded-2xl bg-surface border border-border/70 flex flex-col">
              <div className="w-8 h-8 rounded-full bg-[#F5C3B8] text-[#18161B] font-black text-sm flex items-center justify-center mb-4">
                1
              </div>
              <h4 className="text-base font-bold text-primary mb-2">Download APK</h4>
              <p className="text-secondary text-xs sm:text-sm leading-relaxed">
                Tap the &quot;Download APK&quot; button above to save the <code>GlassGallery.apk</code> file onto your device.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative p-6 rounded-2xl bg-surface border border-border/70 flex flex-col">
              <div className="w-8 h-8 rounded-full bg-[#F5C3B8] text-[#18161B] font-black text-sm flex items-center justify-center mb-4">
                2
              </div>
              <h4 className="text-base font-bold text-primary mb-2">Allow Unknown Sources</h4>
              <p className="text-secondary text-xs sm:text-sm leading-relaxed">
                Open the downloaded file. When prompted by Android, toggle &quot;Allow from this source&quot; to allow installation.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative p-6 rounded-2xl bg-surface border border-border/70 flex flex-col">
              <div className="w-8 h-8 rounded-full bg-[#F5C3B8] text-[#18161B] font-black text-sm flex items-center justify-center mb-4">
                3
              </div>
              <h4 className="text-base font-bold text-primary mb-2">Launch & Explore</h4>
              <p className="text-secondary text-xs sm:text-sm leading-relaxed">
                Tap &quot;Install&quot; and open Glass Gallery! Sign in with your account to synchronize your likes and saved posts.
              </p>
            </div>
          </div>
        </section>

        {/* BOTTOM FINAL CTA */}
        <section className="text-center p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-surface/80 to-[#18161B] border border-[#F5C3B8]/30 shadow-2xl relative overflow-hidden">
          <div className="relative z-10 max-w-xl mx-auto flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl mb-4 border border-white/20">
              <AppIconSvg className="w-full h-full" />
            </div>

            <h3 className="text-2xl sm:text-3xl font-extrabold text-primary mb-3">
              Download Glass Gallery for Android
            </h3>

            <a
              href={APK_DOWNLOAD_URL}
              download="GlassGallery.apk"
              onClick={handleDownloadClick}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-[#F5C3B8] hover:bg-[#ffcfc4] text-[#18161B] font-extrabold text-base shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download GlassGallery.apk ({APK_SIZE})</span>
            </a>
          </div>
        </section>
      </div>

      {/* LIGHTBOX MODAL FOR SCREENSHOTS */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-fade-in"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close Button */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-50"
            aria-label="Close fullscreen view"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Prev Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((prev) => (prev !== null ? (prev - 1 + APP_SCREENSHOTS.length) % APP_SCREENSHOTS.length : 0));
            }}
            className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-50"
            aria-label="Previous image"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Next Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((prev) => (prev !== null ? (prev + 1) % APP_SCREENSHOTS.length : 0));
            }}
            className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-50"
            aria-label="Next image"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Lightbox Content Container */}
          <div
            className="relative max-w-md w-full h-[85vh] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={APP_SCREENSHOTS[lightboxIndex].url}
              alt={`Screenshot ${lightboxIndex + 1}`}
              className="max-h-[80vh] w-auto max-w-full rounded-2xl shadow-2xl object-contain border border-white/10"
            />
            <div className="mt-3 text-center">
              <span className="text-xs text-gray-400 inline-block font-semibold">
                {lightboxIndex + 1} / {APP_SCREENSHOTS.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppShowcasePage;
