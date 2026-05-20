import React from 'react';
import { signInWithGoogle, signInWithApple } from '../services/firebase';

interface LoginModalProps {
    onClose: () => void;
    onOpenLegal?: (tab: 'terms' | 'privacy' | 'guidelines') => void;
}

const GoogleIcon = () => (
    <svg className="w-5 h-5 mr-3" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C39.99,35.59,44,29.668,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
    </svg>
);

const AppleIcon = () => (
    <svg className="w-5 h-5 mr-3 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.171,11.752c0,1.388-0.612,2.688-1.745,3.611c-1.07,0.869-2.556,1.35-3.98,1.35c-0.129,0-0.516-0.035-0.854-0.081c-0.902-0.126-1.847-0.342-2.825-0.342c-1.012,0-1.957,0.216-2.858,0.342c-0.338,0.046-0.725,0.081-0.854,0.081c-1.424,0-2.91-0.481-3.98-1.35c-1.133-0.923-1.745-2.223-1.745-3.611c0-1.913,1.18-3.483,2.959-3.483c0.902,0,1.758,0.387,2.57,1.069c0.75,0.63,1.35,1.528,1.893,1.528c0.543,0,1.143-0.898,1.893-1.528c0.812-0.682,1.668-1.069,2.57-1.069C17.991,8.269,19.171,9.839,19.171,11.752z M15.227,6.012c0.75-0.855,1.293-1.98,1.571-3.155c-1.314-0.034-2.736,0.683-3.61,1.571c-0.75,0.765-1.425,1.966-1.636,3.121C12.865,7.633,14.319,6.969,15.227,6.012z"></path>
    </svg>
);

const LoginModal: React.FC<LoginModalProps> = ({ onClose, onOpenLegal }) => {
    const handleLogin = async (loginProvider: () => Promise<any>) => {
        try {
            await loginProvider();
        } catch (error) {
            console.error("Sign-In Error", error);
        }
    };

    // Pinterest dynamic mock images for interactive collage representation
    const mockCollage = [
        "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=300&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=300&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?q=80&w=300&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1579783928621-7a13d66a62d1?q=80&w=300&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=300&auto=format&fit=crop"
    ];

    return (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black animate-fade-in">
            {/* Ambient Background Collage (Pinterest Style) */}
            <div className="absolute inset-0 grid grid-cols-3 gap-2 p-2 opacity-35 overflow-hidden pointer-events-none scale-105 select-none">
                <div className="flex flex-col gap-2 animate-[pulse_4s_infinite_alternate]">
                    <img src={mockCollage[0]} className="w-full h-44 object-cover rounded-2xl" alt="" />
                    <img src={mockCollage[1]} className="w-full h-56 object-cover rounded-2xl" alt="" />
                    <img src={mockCollage[2]} className="w-full h-48 object-cover rounded-2xl" alt="" />
                </div>
                <div className="flex flex-col gap-2 mt-8 animate-[pulse_5s_infinite_alternate_1s]">
                    <img src={mockCollage[3]} className="w-full h-56 object-cover rounded-2xl" alt="" />
                    <img src={mockCollage[4]} className="w-full h-40 object-cover rounded-2xl" alt="" />
                    <img src={mockCollage[5]} className="w-full h-52 object-cover rounded-2xl" alt="" />
                </div>
                <div className="flex flex-col gap-2 animate-[pulse_6s_infinite_alternate_2s]">
                    <img src={mockCollage[2]} className="w-full h-48 object-cover rounded-2xl" alt="" />
                    <img src={mockCollage[0]} className="w-full h-44 object-cover rounded-2xl" alt="" />
                    <img src={mockCollage[3]} className="w-full h-56 object-cover rounded-2xl" alt="" />
                </div>
            </div>

            {/* Glowing Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

            {/* Close Button Top Right */}
            <div className="absolute top-6 right-6 z-10">
                <button 
                    onClick={onClose} 
                    className="w-10 h-10 bg-white/10 hover:bg-white/20 active:scale-90 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all border border-white/10"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Fullscreen Onboarding Body */}
            <div className="relative z-10 w-full px-6 pb-12 pt-20 flex flex-col items-center text-center space-y-8 select-none">
                
                {/* Logo & Welcomer */}
                <div className="space-y-3">
                    <div className="w-16 h-16 bg-gradient-to-tr from-rose-500 to-amber-500 rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-rose-500/20 border border-white/15 animate-bounce">
                        <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 10V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                            <path d="M12 2L2 9L12 16L22 9L12 2Z" fill="currentColor"/>
                        </svg>
                    </div>
                    
                    <h1 className="text-4xl font-extrabold tracking-tight text-white pt-2 bg-clip-text bg-gradient-to-b from-white to-neutral-300">
                        Glass Gallery
                    </h1>
                    <p className="text-md text-neutral-400 max-w-xs mx-auto font-medium leading-relaxed">
                        Find your next glass art inspiration and share your stunning creations with the world.
                    </p>
                </div>
                
                {/* Giant round sign-in options */}
                <div className="w-full max-w-sm space-y-3.5 pt-4">
                    {/* Google Premium Pill */}
                    <button 
                        onClick={() => handleLogin(signInWithGoogle)} 
                        className="w-full h-14 bg-white hover:bg-neutral-100 active:scale-95 text-black rounded-full flex items-center justify-center font-bold text-base transition-all duration-150 shadow-lg shadow-white/5 border border-white"
                    >
                        <GoogleIcon /> Continue with Google
                    </button>

                    {/* Apple Premium Pill */}
                    <button 
                        onClick={() => handleLogin(signInWithApple)} 
                        className="w-full h-14 bg-neutral-900 hover:bg-neutral-850 active:scale-95 text-white rounded-full flex items-center justify-center font-bold text-base transition-all duration-150 border border-neutral-800"
                    >
                        <AppleIcon /> Continue with Apple
                    </button>
                </div>

                {/* Consent & Policies */}
                <div className="w-full max-w-xs pt-6 text-[11px] text-neutral-500 leading-relaxed font-medium">
                    By continuing, you agree to our{' '}
                    <button 
                        onClick={() => onOpenLegal && onOpenLegal('terms')} 
                        className="text-neutral-300 hover:underline font-semibold"
                    >
                        Terms of Service
                    </button>
                    {' '}and{' '}
                    <button 
                        onClick={() => onOpenLegal && onOpenLegal('privacy')} 
                        className="text-neutral-300 hover:underline font-semibold"
                    >
                        Privacy Policy
                    </button>.
                </div>
            </div>
        </div>
    );
};

export default LoginModal;
