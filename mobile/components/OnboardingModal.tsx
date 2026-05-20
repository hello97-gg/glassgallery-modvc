import React, { useState } from 'react';
import type { ImageMeta, ProfileUser } from '../types';
import { toggleFollowUser } from '../services/firestoreService';
import Button from './Button';

interface OnboardingModalProps {
  currentUserUid: string;
  initialName: string;
  initialPhotoURL: string;
  popularTags: { name: string; previews: string[] }[];
  popularCreators: { uploaderUid: string; uploaderName: string; uploaderPhotoURL: string }[];
  onComplete: (selectedTags: string[], followedCreators: string[], customName: string, customPhoto: string) => void;
  onSkip: () => void;
}

// 1. Beautiful Premium HSL Gradient SVG Avatar Generator
export const generateSvgAvatar = (seed: string): string => {
  const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
  };
  
  const seedHash = hashString(seed + Math.random().toString());
  
  // Vibrant, harmonious HSL selections
  const h1 = Math.abs(seedHash) % 360;
  const h2 = (h1 + 130 + (Math.abs(seedHash >> 2) % 50)) % 360;
  
  const c1 = `hsl(${h1}, 90%, 65%)`;
  const c2 = `hsl(${h2}, 95%, 45%)`;
  
  // Pick a random abstract geometric style
  const styleIdx = Math.abs(seedHash >> 4) % 3;
  
  let shapes = '';
  if (styleIdx === 0) {
    // Modern spheres/orbs
    shapes = `
      <circle cx="50" cy="50" r="30" fill="white" opacity="0.15" />
      <circle cx="50" cy="50" r="20" fill="white" opacity="0.25" />
      <circle cx="50" cy="50" r="10" fill="white" opacity="0.35" />
    `;
  } else if (styleIdx === 1) {
    // Premium artistic diamond crosses
    shapes = `
      <path d="M50 15 L50 85 M15 50 L85 50" stroke="white" stroke-width="4" stroke-linecap="round" opacity="0.3" />
      <circle cx="50" cy="50" r="18" fill="white" opacity="0.2" />
    `;
  } else {
    // Overlapping ribbon waves
    shapes = `
      <path d="M 15,50 Q 32,15 50,50 T 85,50" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" opacity="0.4" />
      <path d="M 15,62 Q 32,27 50,62 T 85,62" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.2" />
    `;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <linearGradient id="avatar-grad-${seedHash}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${c1}" />
          <stop offset="100%" stop-color="${c2}" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="50" fill="url(#avatar-grad-${seedHash})" />
      ${shapes}
    </svg>
  `.trim();

  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
};

// 2. Premium Unique Name Generator
export const generateUniqueName = (): string => {
  const adjectives = ['Vibrant', 'Creative', 'Ethereal', 'Sleek', 'Radiant', 'Mystic', 'Cosmic', 'Aesthetic', 'Luminous', 'Dynamic', 'Serene', 'Polished'];
  const nouns = ['Creator', 'Explorer', 'Artist', 'Dreamer', 'Visionary', 'Designer', 'Photographer', 'Nomad', 'Seeker', 'Curator', 'Maven', 'Shaper'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}${noun}${num}`;
};

const OnboardingModal: React.FC<OnboardingModalProps> = ({
  currentUserUid,
  initialName,
  initialPhotoURL,
  popularTags,
  popularCreators,
  onComplete,
  onSkip,
}) => {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [displayName, setDisplayName] = useState(initialName || generateUniqueName());
  const [photoURL, setPhotoURL] = useState(initialPhotoURL || generateSvgAvatar(currentUserUid));
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [followedCreators, setFollowedCreators] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingFollows, setPendingFollows] = useState<string[]>([]);

  // Toggle selection of tag
  const handleTagToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(prev => prev.filter(t => t !== tag));
    } else {
      setSelectedTags(prev => [...prev, tag]);
    }
  };

  // Toggle creator follow status (optimistic locally + race-condition guard)
  const handleCreatorToggle = async (creatorUid: string) => {
    if (pendingFollows.includes(creatorUid)) return;

    setPendingFollows(prev => [...prev, creatorUid]);
    const isFollowing = followedCreators.includes(creatorUid);
    
    if (isFollowing) {
      setFollowedCreators(prev => prev.filter(uid => uid !== creatorUid));
    } else {
      setFollowedCreators(prev => [...prev, creatorUid]);
    }

    try {
      await toggleFollowUser(currentUserUid, creatorUid);
    } catch (err) {
      console.error("Failed to toggle follow status in onboarding:", err);
      if (isFollowing) {
        setFollowedCreators(prev => [...prev, creatorUid]);
      } else {
        setFollowedCreators(prev => prev.filter(uid => uid !== creatorUid));
      }
    } finally {
      setPendingFollows(prev => prev.filter(uid => uid !== creatorUid));
    }
  };

  const handleNextStep = () => {
    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await onComplete(selectedTags, followedCreators, displayName, photoURL);
    } catch (err) {
      console.error("Failed to save onboarding data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateAvatar = () => {
    setPhotoURL(generateSvgAvatar(currentUserUid));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl overflow-hidden bg-background/80 border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-scale-in">
        
        {/* Glow Effects */}
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-accent/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-surface/20">
          <div>
            <h2 className="text-2xl font-bold text-primary tracking-tight">
              Welcome to Glass Gallery!
            </h2>
            <p className="text-xs text-secondary mt-1">
              Let's customize your profile and suggestions feed.
            </p>
          </div>
          <button
            onClick={onSkip}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold text-secondary hover:text-primary hover:bg-surface/50 rounded-full transition-all"
          >
            Skip & Explore
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {step === 0 ? (
            <div className="space-y-6 animate-fade-in flex flex-col items-center">
              <div className="space-y-1 text-center w-full">
                <h3 className="text-lg font-semibold text-primary">
                  1. Choose Your Profile Identity
                </h3>
                <p className="text-sm text-secondary">
                  Choose a beautiful name and generate an instant, gorgeous gradient vector avatar!
                </p>
              </div>

              {/* Avatar Preview & Regenerator */}
              <div className="flex flex-col items-center gap-4 mt-2">
                <div className="relative group select-none">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-accent to-purple-500 opacity-20 blur-md scale-105 group-hover:scale-110 transition-transform duration-300" />
                  <img
                    src={photoURL}
                    alt="Generated Avatar"
                    className="w-32 h-32 rounded-full border-2 border-border shadow-2xl relative z-10 scale-100 hover:scale-[1.02] transition-all duration-300"
                  />
                </div>

                <Button
                  variant="secondary"
                  onClick={handleRegenerateAvatar}
                  className="text-xs font-semibold tracking-wide flex items-center gap-1.5 px-4 py-2 hover:scale-[1.03]"
                >
                  🎲 Regenerate Avatar
                </Button>
              </div>

              {/* Name Input */}
              <div className="w-full max-w-sm space-y-2 mt-2">
                <label className="block text-xs font-bold text-secondary uppercase tracking-wider">
                  Your Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your username..."
                  className="w-full bg-surface/40 border border-border hover:border-secondary focus:border-accent focus:bg-surface/70 rounded-xl px-4 py-3 text-primary focus:outline-none transition-all font-medium text-center text-lg"
                />
              </div>
            </div>
          ) : step === 1 ? (
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-primary">
                  2. Follow Topics of Interest
                </h3>
                <p className="text-sm text-secondary">
                  Choose some categories you love. We'll populate your feed with similar aesthetic imagery!
                </p>
              </div>

              {popularTags.length === 0 ? (
                <div className="text-center py-10 text-secondary">
                  No active topics available to display yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {popularTags.map(tag => {
                    const isSelected = selectedTags.includes(tag.name);
                    return (
                      <div
                        key={tag.name}
                        onClick={() => handleTagToggle(tag.name)}
                        className={`
                          p-4 rounded-xl border text-center cursor-pointer select-none transition-all duration-300 relative overflow-hidden flex flex-col items-center justify-center gap-3
                          ${isSelected 
                            ? 'bg-accent/15 border-accent text-accent scale-[1.02] shadow-md shadow-accent/5' 
                            : 'bg-surface/40 border-border text-secondary hover:border-secondary hover:bg-surface/80'
                          }
                        `}
                      >
                        {/* 3 Previews stack */}
                        <div className="flex items-center justify-center -space-x-4 h-12 w-full mb-1">
                          {tag.previews.map((previewUrl, i) => (
                            <img
                              key={i}
                              src={previewUrl}
                              alt=""
                              className="w-12 h-12 object-cover rounded-lg border border-background shadow-md transform hover:scale-105 transition-transform duration-200"
                              style={{
                                zIndex: 3 - i,
                                transform: `rotate(${(i - 1) * 8}deg)`
                              }}
                            />
                          ))}
                        </div>

                        <span className="font-semibold text-sm block truncate w-full text-center">#{tag.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-primary">
                  3. Follow Inspiring Creators
                </h3>
                <p className="text-sm text-secondary">
                  Follow active photographers. Their new uploads will automatically bubble up in your personalized feed!
                </p>
              </div>

              {popularCreators.length === 0 ? (
                <div className="text-center py-10 text-secondary">
                  No other creators found to recommend following. Safe to complete setup!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {popularCreators.map(creator => {
                    const isFollowing = followedCreators.includes(creator.uploaderUid);
                    const isPending = pendingFollows.includes(creator.uploaderUid);
                    return (
                      <div
                        key={creator.uploaderUid}
                        className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface/30 hover:bg-surface/60 transition-all duration-200"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          {creator.uploaderPhotoURL ? (
                            <img
                              src={creator.uploaderPhotoURL}
                              alt={creator.uploaderName}
                              className="w-10 h-10 rounded-full object-cover border border-border"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center font-bold text-accent text-sm">
                              {creator.uploaderName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-semibold text-sm text-primary truncate">
                            {creator.uploaderName}
                          </span>
                        </div>

                        <button
                          onClick={() => handleCreatorToggle(creator.uploaderUid)}
                          disabled={isPending}
                          className={`
                            px-3 py-1.5 rounded-full text-xs font-semibold select-none transition-all duration-300
                            ${isFollowing
                              ? 'bg-surface border border-border text-secondary hover:text-primary hover:border-primary'
                              : 'bg-accent text-surface hover:opacity-90'
                            }
                            ${isPending ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          {isPending ? '...' : (isFollowing ? 'Following' : 'Follow')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border bg-surface/10">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full transition-all ${step === 0 ? 'bg-accent' : 'bg-border'}`} />
            <span className={`w-2.5 h-2.5 rounded-full transition-all ${step === 1 ? 'bg-accent' : 'bg-border'}`} />
            <span className={`w-2.5 h-2.5 rounded-full transition-all ${step === 2 ? 'bg-accent' : 'bg-border'}`} />
          </div>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button
                variant="secondary"
                disabled={loading}
                onClick={() => setStep(prev => (prev - 1) as 0 | 1 | 2)}
              >
                Back
              </Button>
            )}

            {step < 2 ? (
              <Button
                variant="primary"
                onClick={handleNextStep}
                disabled={step === 0 && !displayName.trim()}
              >
                Next Step
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleFinish}
                isLoading={loading}
              >
                Finish Setup
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default OnboardingModal;
