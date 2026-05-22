import React, { useState } from 'react';
import { auth, signInWithGoogle, signInWithTwitter, signInWithGithub } from '../services/firebase';
import Button from './Button';

interface LoginModalProps {
    onClose: () => void;
    onOpenLegal?: (tab: 'terms' | 'privacy' | 'guidelines') => void;
}

type ViewState = 'social' | 'email-signin' | 'email-signup' | 'forgot-password' | 'verification-sent';

const GoogleIcon = () => (
    <svg className="w-5 h-5 mr-3" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C39.99,35.59,44,29.668,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
    </svg>
);

const TwitterIcon = () => (
    <svg className="w-5 h-5 mr-3 text-[#1DA1F2] fill-current" viewBox="0 0 24 24">
        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
    </svg>
);

const GithubIcon = () => (
    <svg className="w-5 h-5 mr-3 text-[#f0f6fc] fill-current" viewBox="0 0 24 24">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.193 22 16.436 22 12.017 22 6.484 17.522 2 12 2z"/>
    </svg>
);

const LoginModal: React.FC<LoginModalProps> = ({ onClose, onOpenLegal }) => {
    const [view, setView] = useState<ViewState>('social');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleConflict = async (conflictingEmail: string) => {
        try {
            const methods = await auth.fetchSignInMethodsForEmail(conflictingEmail);
            let providerName = 'a different sign-in method';
            if (methods.includes('google.com')) providerName = 'Google';
            if (methods.includes('twitter.com')) providerName = 'Twitter';
            if (methods.includes('github.com')) providerName = 'GitHub';
            if (methods.includes('password')) providerName = 'Email/Password';
            
            setErrorMsg(`An account already exists with this email address under ${providerName}. Please sign in using ${providerName}.`);
        } catch (e) {
            console.error("Conflict checking failed:", e);
            setErrorMsg("An account with this email already exists under a different sign-in method. Please use the original provider you registered with.");
        }
    };

    const handleSocialLogin = async (loginProvider: () => Promise<any>) => {
        setLoading(true);
        setErrorMsg('');
        try {
            await loginProvider();
            onClose();
        } catch (error: any) {
            console.error("Social Sign-In Error", error);
            if (error.code === 'auth/account-exists-with-different-credential' && error.email) {
                await handleConflict(error.email);
            } else {
                setErrorMsg(error.message || 'An error occurred during social sign-in.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleEmailSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password || !name) {
            setErrorMsg('All fields are required.');
            return;
        }
        setLoading(true);
        setErrorMsg('');
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            if (user) {
                await user.updateProfile({ displayName: name });
                await user.sendEmailVerification();
                await auth.signOut();
                setView('verification-sent');
            }
        } catch (error: any) {
            console.error("Email signup error:", error);
            if (error.code === 'auth/email-already-in-use') {
                await handleConflict(email);
            } else {
                setErrorMsg(error.message || 'Failed to create your account.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setErrorMsg('Email and password are required.');
            return;
        }
        setLoading(true);
        setErrorMsg('');
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            if (user) {
                if (!user.emailVerified) {
                    await user.sendEmailVerification();
                    setErrorMsg('Your email is not verified yet. We have sent a verification link to your inbox. Please verify before logging in.');
                    await auth.signOut();
                } else {
                    onClose();
                }
            }
        } catch (error: any) {
            console.error("Email sign-in error:", error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                setErrorMsg('Invalid email or password.');
            } else if (error.code === 'auth/account-exists-with-different-credential') {
                await handleConflict(email);
            } else {
                setErrorMsg(error.message || 'Failed to sign in.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            setErrorMsg('Please enter your email address.');
            return;
        }
        setLoading(true);
        setErrorMsg('');
        try {
            const methods = await auth.fetchSignInMethodsForEmail(email);
            if (methods.length === 0) {
                setErrorMsg('No account exists with this email address. Please sign up first.');
                return;
            }
            await auth.sendPasswordResetEmail(email);
            setSuccessMsg('A password reset link has been sent to your email.');
            setTimeout(() => {
                setSuccessMsg('');
                setView('email-signin');
            }, 5000);
        } catch (error: any) {
            console.error("Password reset error:", error);
            if (error.code === 'auth/user-not-found') {
                setErrorMsg('No account exists with this email address. Please sign up first.');
            } else {
                setErrorMsg(error.message || 'Failed to send recovery email.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
            <div 
                className="w-full max-w-md text-center bg-surface/95 border border-border/80 rounded-3xl shadow-2xl p-6 md:p-8 space-y-6 relative overflow-hidden" 
                onClick={(e) => e.stopPropagation()}
            >
                {/* Ambient glow decoration */}
                <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-secondary/10 blur-3xl pointer-events-none" />

                <button 
                    onClick={onClose} 
                    className="absolute top-4 right-4 text-secondary hover:text-primary transition-all duration-200 text-3xl leading-none w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/5"
                >
                    &times;
                </button>

                <div className="relative">
                    <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-b from-white to-neutral-300 bg-clip-text text-transparent">
                        {view === 'social' && "Welcome!"}
                        {view === 'email-signin' && "Sign In"}
                        {view === 'email-signup' && "Create Account"}
                        {view === 'forgot-password' && "Reset Password"}
                        {view === 'verification-sent' && "Verify Email"}
                    </h1>
                    <p className="text-sm text-secondary mt-1 font-medium">
                        {view === 'social' && "Find visual inspiration and share stunning images."}
                        {view === 'email-signin' && "Access your personalized art dashboard."}
                        {view === 'email-signup' && "Join our global community of creators."}
                        {view === 'forgot-password' && "Enter your email to receive a recovery link."}
                        {view === 'verification-sent' && "Confirm your identity to start sharing."}
                    </p>
                </div>

                {/* Error Banner */}
                {errorMsg && (
                    <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300 text-left font-medium leading-relaxed animate-[shake_0.4s_ease-in-out]">
                        {errorMsg}
                    </div>
                )}

                {/* Success Banner */}
                {successMsg && (
                    <div className="p-3.5 rounded-xl bg-green-950/40 border border-green-500/30 text-xs text-green-300 text-left font-medium leading-relaxed">
                        {successMsg}
                    </div>
                )}

                {view === 'social' && (
                    <div className="space-y-4 pt-2">
                        <Button 
                            onClick={() => handleSocialLogin(signInWithGoogle)} 
                            fullWidth 
                            variant="secondary"
                            className="h-12 rounded-2xl flex items-center justify-center font-bold text-sm bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all shadow-md active:scale-98"
                            disabled={loading}
                        >
                            <GoogleIcon /> Continue with Google
                        </Button>

                        <Button 
                            onClick={() => handleSocialLogin(signInWithTwitter)} 
                            fullWidth 
                            variant="secondary"
                            className="h-12 rounded-2xl flex items-center justify-center font-bold text-sm bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all shadow-md active:scale-98"
                            disabled={loading}
                        >
                            <TwitterIcon /> Continue with Twitter
                        </Button>

                        <Button 
                            onClick={() => handleSocialLogin(signInWithGithub)} 
                            fullWidth 
                            variant="secondary"
                            className="h-12 rounded-2xl flex items-center justify-center font-bold text-sm bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all shadow-md active:scale-98"
                            disabled={loading}
                        >
                            <GithubIcon /> Continue with GitHub
                        </Button>

                        <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-border/40"></div>
                            <span className="flex-shrink mx-4 text-xs font-semibold text-secondary uppercase tracking-widest">or</span>
                            <div className="flex-grow border-t border-border/40"></div>
                        </div>

                        <Button 
                            onClick={() => setView('email-signin')} 
                            fullWidth 
                            className="h-12 rounded-2xl font-bold text-sm bg-accent hover:bg-accent/90 text-black shadow-md transition-all active:scale-98"
                            disabled={loading}
                        >
                            Sign in with Email
                        </Button>
                    </div>
                )}

                {view === 'email-signin' && (
                    <form onSubmit={handleEmailSignIn} className="space-y-4 pt-2 text-left">
                        <div>
                            <label className="block text-xs font-bold uppercase text-secondary tracking-wider mb-1">Email Address</label>
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-white/5 border border-border/80 text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                                placeholder="name@example.com"
                                required
                            />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-bold uppercase text-secondary tracking-wider">Password</label>
                                <button 
                                    type="button"
                                    onClick={() => setView('forgot-password')}
                                    className="text-xs text-accent hover:underline font-semibold"
                                >
                                    Forgot password?
                                </button>
                            </div>
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-white/5 border border-border/80 text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <Button 
                            type="submit" 
                            fullWidth 
                            className="h-11 rounded-xl bg-accent text-black font-bold text-sm shadow-md mt-4 transition-all"
                            disabled={loading}
                        >
                            {loading ? "Signing in..." : "Sign In"}
                        </Button>
                        <div className="text-center pt-2">
                            <span className="text-xs text-secondary">Don't have an account? </span>
                            <button 
                                type="button"
                                onClick={() => setView('email-signup')}
                                className="text-xs text-accent hover:underline font-bold"
                            >
                                Sign Up
                            </button>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setView('social')}
                            className="w-full text-center text-xs text-secondary hover:text-primary font-semibold transition-colors mt-2"
                        >
                            ← Back to social logins
                        </button>
                    </form>
                )}

                {view === 'email-signup' && (
                    <form onSubmit={handleEmailSignUp} className="space-y-4 pt-2 text-left">
                        <div>
                            <label className="block text-xs font-bold uppercase text-secondary tracking-wider mb-1">Display Name</label>
                            <input 
                                type="text" 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-white/5 border border-border/80 text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                                placeholder="Creative Mind"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-secondary tracking-wider mb-1">Email Address</label>
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-white/5 border border-border/80 text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                                placeholder="name@example.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-secondary tracking-wider mb-1">Password</label>
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-white/5 border border-border/80 text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <Button 
                            type="submit" 
                            fullWidth 
                            className="h-11 rounded-xl bg-accent text-black font-bold text-sm shadow-md mt-4 transition-all"
                            disabled={loading}
                        >
                            {loading ? "Creating account..." : "Create Account"}
                        </Button>
                        <div className="text-center pt-2">
                            <span className="text-xs text-secondary">Already have an account? </span>
                            <button 
                                type="button"
                                onClick={() => setView('email-signin')}
                                className="text-xs text-accent hover:underline font-bold"
                            >
                                Sign In
                            </button>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setView('social')}
                            className="w-full text-center text-xs text-secondary hover:text-primary font-semibold transition-colors mt-2"
                        >
                            ← Back to social logins
                        </button>
                    </form>
                )}

                {view === 'forgot-password' && (
                    <form onSubmit={handlePasswordReset} className="space-y-4 pt-2 text-left">
                        <div>
                            <label className="block text-xs font-bold uppercase text-secondary tracking-wider mb-1">Email Address</label>
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-white/5 border border-border/80 text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                                placeholder="name@example.com"
                                required
                            />
                        </div>
                        <Button 
                            type="submit" 
                            fullWidth 
                            className="h-11 rounded-xl bg-accent text-black font-bold text-sm shadow-md mt-2 transition-all"
                            disabled={loading}
                        >
                            {loading ? "Sending reset link..." : "Send Reset Link"}
                        </Button>
                        <button 
                            type="button"
                            onClick={() => setView('email-signin')}
                            className="w-full text-center text-xs text-secondary hover:text-primary font-bold transition-colors mt-2"
                        >
                            ← Back to Sign In
                        </button>
                    </form>
                )}

                {view === 'verification-sent' && (
                    <div className="space-y-6 pt-4 text-center">
                        <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full mx-auto flex items-center justify-center text-green-400">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 19v-8.93a2 2 0 01.89-1.664l8-5.333a2 2 0 012.22 0l8 5.333A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-2.25-1.5a2 2 0 00-2.25 0l-2.25 1.5" />
                            </svg>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-primary">Verify your email address</h3>
                            <p className="text-xs text-secondary leading-relaxed px-4">
                                We have sent a verification link to <span className="font-bold text-primary">{email}</span>. Please verify your email to unlock uploading and feed customization.
                            </p>
                        </div>
                        <Button 
                            onClick={() => setView('email-signin')} 
                            fullWidth 
                            className="h-11 rounded-xl bg-accent text-black font-bold text-sm shadow-md transition-all"
                        >
                            Proceed to Sign In
                        </Button>
                        <button 
                            onClick={async () => {
                                try {
                                    const currentUser = auth.currentUser;
                                    if (currentUser) await currentUser.sendEmailVerification();
                                    setSuccessMsg('Resent verification email successfully!');
                                } catch (e: any) {
                                    setErrorMsg(e.message || 'Failed to resend email.');
                                }
                            }}
                            className="text-xs text-accent hover:underline font-bold"
                        >
                            Didn't get the email? Resend it
                        </button>
                    </div>
                )}

                <div className="pt-4 border-t border-border/40">
                    <p className="text-xs text-secondary leading-relaxed font-medium">
                        By continuing, you acknowledge that you have read and agree to our{' '}
                        <button 
                            onClick={() => onOpenLegal && onOpenLegal('terms')} 
                            className="text-accent hover:underline font-bold"
                        >
                            Terms of Service
                        </button>
                        {' '}and{' '}
                        <button 
                            onClick={() => onOpenLegal && onOpenLegal('privacy')} 
                            className="text-accent hover:underline font-bold"
                        >
                            Privacy Policy
                        </button>.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginModal;
