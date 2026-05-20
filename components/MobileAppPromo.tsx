import React, { useState, useEffect } from 'react';

const MobileAppPromo: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isBannerVisible, setIsBannerVisible] = useState(true);

    useEffect(() => {
        // Check if device is mobile
        const checkMobile = () => {
            const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
            const isMobileUA = /android|iphone|ipad|ipod|mobi|mini|tablet/i.test(userAgent);
            const isSmallScreen = window.innerWidth <= 768;

            if ((window as any).Capacitor?.isNativePlatform?.()) {
                setIsMobile(false);
                return;
            }

            if (isMobileUA || (isSmallScreen && ('ontouchstart' in window))) {
                setIsMobile(true);
                // Check if they dismissed it recently
                const dismissed = localStorage.getItem('mobile_promo_dismissed');
                if (!dismissed) {
                    setIsVisible(true);
                }
                const bannerDismissed = localStorage.getItem('mobile_banner_dismissed');
                if (bannerDismissed) {
                    setIsBannerVisible(false);
                }
            } else {
                setIsMobile(false);
            }
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const handleDismiss = () => {
        setIsVisible(false);
        localStorage.setItem('mobile_promo_dismissed', 'true');
    };

    const handleDismissBanner = () => {
        setIsBannerVisible(false);
        localStorage.setItem('mobile_banner_dismissed', 'true');
    };

    const apkUrl = "https://cdn.modvc.org/GlassGallery.apk";

    if (!isMobile) return null;

    return (
        <>
            {/* Top Pill Banner (Persistent if they dismiss modal) */}
            {isBannerVisible && (
                <div className="fixed top-0 left-0 w-full z-[80] bg-surface/90 backdrop-blur-md border-b border-border shadow-md py-2 px-4 flex items-center justify-between animate-fade-in">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-tr from-rose-500 to-amber-500 rounded-xl flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M19 10V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V10"/>
                                <path d="M12 2L2 9L12 16L22 9L12 2Z" fill="currentColor"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-primary">Glass Gallery</p>
                            <p className="text-[10px] text-secondary">Faster & better on the app</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a 
                            href={apkUrl}
                            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-full transition-colors"
                        >
                            Open app
                        </a>
                        <button 
                            onClick={handleDismissBanner}
                            className="p-1 text-secondary hover:text-primary transition-colors rounded-full hover:bg-border/40"
                            title="Close banner"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Modal Popup (First time only) */}
            {isVisible && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={handleDismiss}>
                    <div className="bg-surface rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div className="relative pt-12 pb-8 px-6 text-center">
                            <button 
                                onClick={handleDismiss}
                                className="absolute top-4 left-4 p-2 text-secondary hover:text-primary rounded-full"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                            
                            <div className="w-20 h-20 bg-gradient-to-tr from-rose-500 to-amber-500 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-rose-500/20 mb-6">
                                <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M19 10V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V10"/>
                                    <path d="M12 2L2 9L12 16L22 9L12 2Z" fill="currentColor"/>
                                </svg>
                            </div>
                            
                            <h2 className="text-2xl font-bold text-primary mb-2">Glass Gallery is better on the app</h2>
                            <p className="text-secondary text-sm mb-8">Continue in the app for the full experience, faster loads, and offline mode.</p>
                            
                            <a 
                                href={apkUrl}
                                onClick={handleDismiss}
                                className="block w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full text-base transition-colors"
                            >
                                Open app
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default MobileAppPromo;
