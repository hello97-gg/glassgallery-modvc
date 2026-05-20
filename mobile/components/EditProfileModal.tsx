
import React, { useState, useRef } from 'react';
import type { ProfileUser } from '../types';
import { uploadImage } from '../services/storageService';
import { updateUserProfile } from '../services/firestoreService';
import Button from './Button';
import Spinner from './Spinner';
import LocationPicker from './LocationPicker';
import imageCompression from 'browser-image-compression';

interface EditProfileModalProps {
  user: ProfileUser;
  onClose: () => void;
  onUpdateSuccess: (updatedProfile: ProfileUser) => void;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({ user, onClose, onUpdateSuccess }) => {
  const [displayName, setDisplayName] = useState(user.uploaderName);
  const [bio, setBio] = useState(user.bio || '');
  const [location, setLocation] = useState(user.location || '');
  const [email, setEmail] = useState(user.email || '');
  
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(user.uploaderPhotoURL);
  
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState(user.backgroundImageURL || '');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetch(`/api/users?uid=${user.uploaderUid}&includeApiKey=true`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) {
          setApiKey(data.user.apiKey || null);
        }
      })
      .catch(err => console.error("Failed to load API key:", err));
  }, [user.uploaderUid]);

  const handleGenerateKey = async () => {
    setIsGeneratingKey(true);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uploaderUid, action: 'generate_key' })
      });
      const data = await response.json();
      if (data.success && data.apiKey) {
        setApiKey(data.apiKey);
      }
    } catch (err) {
      console.error("Failed to generate API key:", err);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleCopyKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleImageSelect = async (file: File, type: 'avatar' | 'bg') => {
    if (!file.type.startsWith('image/')) return;

    try {
        const options = {
            maxSizeMB: type === 'avatar' ? 0.5 : 2,
            maxWidthOrHeight: type === 'avatar' ? 500 : 1920,
            useWebWorker: true,
        };
        const compressed = await imageCompression(file, options);
        const reader = new FileReader();
        reader.onloadend = () => {
            if (type === 'avatar') {
                setAvatarFile(compressed);
                setAvatarPreview(reader.result as string);
            } else {
                setBgFile(compressed);
                setBgPreview(reader.result as string);
            }
        };
        reader.readAsDataURL(compressed);
    } catch (err) {
        console.error("Compression error", err);
        setError("Failed to process image.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
        let newPhotoURL = user.uploaderPhotoURL;
        let newBgURL = user.backgroundImageURL || '';

        if (avatarFile) {
            const res = await uploadImage(avatarFile);
            newPhotoURL = res.url;
        }
        if (bgFile) {
            const res = await uploadImage(bgFile);
            newBgURL = res.url;
        }

        const updates: Partial<ProfileUser> = {
            uploaderName: displayName,
            bio,
            location,
            email,
            uploaderPhotoURL: newPhotoURL,
            backgroundImageURL: newBgURL,
        };

        await updateUserProfile(user.uploaderUid, updates);
        onUpdateSuccess({ ...user, ...updates });
        onClose();

    } catch (err) {
        console.error(err);
        setError("Failed to update profile. Please try again.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
        <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-primary">Edit Profile</h2>
                  <button onClick={onClose} className="text-secondary hover:text-primary transition-colors text-3xl leading-none">&times;</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Images Section */}
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-secondary mb-2">Header Image</label>
                          <div 
                              onClick={() => bgInputRef.current?.click()}
                              className="w-full h-32 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer bg-cover bg-center hover:opacity-80 transition-opacity relative overflow-hidden"
                              style={{ backgroundImage: bgPreview ? `url(${bgPreview})` : 'none' }}
                          >
                              {!bgPreview && <span className="text-secondary">Click to upload header</span>}
                              <input type="file" ref={bgInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0], 'bg')} />
                          </div>
                      </div>

                      <div className="flex items-center gap-4">
                           <div 
                              onClick={() => avatarInputRef.current?.click()}
                              className="w-20 h-20 rounded-full border-2 border-dashed border-border flex-shrink-0 flex items-center justify-center cursor-pointer bg-cover bg-center hover:opacity-80 transition-opacity relative overflow-hidden"
                              style={{ backgroundImage: `url(${avatarPreview})` }}
                           >
                              <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0], 'avatar')} />
                           </div>
                           <div className="text-sm text-secondary">
                               <p>Click avatar to change.</p>
                               <p>Recommended: Square, 500x500px.</p>
                           </div>
                      </div>
                  </div>

                  {/* Text Fields */}
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-secondary mb-1">Display Name</label>
                          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-background border border-border rounded-md py-2 px-3 text-primary focus:ring-accent focus:border-accent" required />
                      </div>
                       <div>
                          <label className="block text-sm font-medium text-secondary mb-1">Bio</label>
                          <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} className="w-full bg-background border border-border rounded-md py-2 px-3 text-primary focus:ring-accent focus:border-accent" placeholder="Tell us about yourself..." />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                               <label className="block text-sm font-medium text-secondary mb-1">Location</label>
                               <div className="relative">
                                    <input 
                                        type="text" 
                                        value={location} 
                                        onChange={(e) => setLocation(e.target.value)} 
                                        className="w-full bg-background border border-border rounded-md py-2 pl-3 pr-10 text-primary focus:ring-accent focus:border-accent" 
                                        placeholder="City, Country" 
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowMap(true)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-secondary hover:text-accent cursor-pointer"
                                        title="Pick on map"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                               </div>
                          </div>
                          <div>
                               <label className="block text-sm font-medium text-secondary mb-1">Email (Public)</label>
                               <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-background border border-border rounded-md py-2 px-3 text-primary focus:ring-accent focus:border-accent" placeholder="contact@example.com" />
                          </div>
                      </div>
                  </div>

                  {/* Developer API Key Section */}
                  <div className="pt-5 border-t border-border mt-4">
                      <h3 className="text-sm font-bold text-primary flex items-center gap-2 mb-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-accent" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 022 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                          </svg>
                          Developer API Key
                      </h3>
                      <p className="text-xs text-secondary mb-3">
                          Use your API key to upload photos and integrate Glass Gallery into your applications.
                      </p>
                      <div className="flex items-center gap-3">
                          <div className="relative flex-grow">
                              <input 
                                  type={showApiKey ? 'text' : 'password'} 
                                  value={apiKey || 'No key generated yet'} 
                                  readOnly 
                                  className="w-full bg-background border border-border rounded-md py-2 pl-3 pr-10 text-xs font-mono text-secondary" 
                              />
                              {apiKey && (
                                  <button 
                                      type="button"
                                      onClick={() => setShowApiKey(!showApiKey)}
                                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-secondary hover:text-accent cursor-pointer"
                                  >
                                      {showApiKey ? (
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                          </svg>
                                      ) : (
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                      )}
                                  </button>
                              )}
                          </div>
                          {apiKey ? (
                              <Button type="button" onClick={handleCopyKey} variant="secondary" className="!py-2 !px-3 !text-xs shrink-0">
                                  {copied ? 'Copied!' : 'Copy'}
                              </Button>
                          ) : (
                              <Button type="button" onClick={handleGenerateKey} disabled={isGeneratingKey} className="!py-2 !px-3 !text-xs shrink-0">
                                  {isGeneratingKey ? <Spinner /> : 'Generate'}
                              </Button>
                          )}
                          {apiKey && (
                              <Button type="button" onClick={handleGenerateKey} disabled={isGeneratingKey} variant="secondary" className="!py-2 !px-3 !text-xs shrink-0 !bg-yellow-950/20 hover:!bg-yellow-950/40 !text-yellow-400">
                                  Regenerate
                              </Button>
                          )}
                      </div>
                  </div>

                  {error && <p className="text-red-500 text-sm">{error}</p>}

                  <div className="flex justify-end gap-3">
                      <Button type="button" onClick={onClose} variant="secondary">Cancel</Button>
                      <Button type="submit" disabled={isLoading}>
                          {isLoading ? <Spinner /> : 'Save Profile'}
                      </Button>
                  </div>
              </form>
          </div>
        </div>
      </div>
      
      {showMap && (
          <LocationPicker 
              onSelect={(loc) => setLocation(loc)}
              onClose={() => setShowMap(false)}
          />
      )}
    </>
  );
};

export default EditProfileModal;
