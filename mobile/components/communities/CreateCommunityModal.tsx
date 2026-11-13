import React, { useState, useRef } from 'react';
import type { User } from 'firebase/auth';
import { CommunityType } from '../../types';
import { uploadImage } from '../../services/storageService';

interface CreateCommunityModalProps {
  user: User | null;
  onClose: () => void;
  onSuccess: (slug: string) => void;
}

const CATEGORIES = [
  'General', 'Art & Photography', 'Technology', 'Nature & Travel',
  'Architecture & Design', 'Gaming', 'Anime & Illustration', 'Music & Media'
];

export const CreateCommunityModal: React.FC<CreateCommunityModalProps> = ({ user, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CommunityType>('public');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [iconUrl, setIconUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [isNsfw, setIsNsfw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleIconFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingIcon(true);
    setError(null);
    try {
      const { url } = await uploadImage(file);
      setIconUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload icon.');
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const handleBannerFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingBanner(true);
    setError(null);
    try {
      const { url } = await uploadImage(file);
      setBannerUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload banner.');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) {
      const autoSlug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      setSlug(autoSlug);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('You must be signed in to create a community.');
      return;
    }

    if (!name.trim()) {
      setError('Community name is required.');
      return;
    }

    const cleanSlug = slug.trim().toLowerCase();
    if (cleanSlug.length < 3 || cleanSlug.length > 30) {
      setError('Community slug must be between 3 and 30 characters.');
      return;
    }

    if (!/^[a-z0-9][a-z0-9-_]*[a-z0-9]$/.test(cleanSlug)) {
      setError('Slug can only contain letters, numbers, hyphens, and underscores.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          name: name.trim(),
          slug: cleanSlug,
          description: description.trim(),
          type,
          category,
          icon_url: iconUrl.trim() || undefined,
          banner_url: bannerUrl.trim() || undefined,
          is_nsfw: isNsfw ? 1 : 0
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create community.');
      }

      onSuccess(cleanSlug);
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the community.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 text-primary">
        <div className="flex justify-between items-center mb-5 border-b border-border/60 pb-3">
          <div>
            <h2 className="text-xl font-bold text-primary">Create a Community</h2>
            <p className="text-xs text-secondary mt-0.5">Build a home for creators, curators, and discussions.</p>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1">
              Community Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Astrophotography"
              maxLength={50}
              required
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1">
              URL Slug <span className="text-secondary/60 lowercase font-normal">(gg.modvc.org/c/slug)</span>
            </label>
            <div className="flex items-center bg-background border border-border rounded-xl px-3 py-2 text-sm text-secondary">
              <span className="text-secondary select-none mr-1 font-mono">c/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                placeholder="astrophotography"
                maxLength={30}
                required
                className="w-full bg-transparent text-primary font-mono text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this community about? Share rules, inspiration, or themes..."
              rows={3}
              maxLength={500}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1">
                Category
              </label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-primary appearance-none focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px] pr-8"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat} className="bg-surface text-primary">{cat}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-secondary">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1">
                Privacy Type
              </label>
              <div className="relative">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as CommunityType)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-primary appearance-none focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px] pr-8"
                >
                  <option value="public" className="bg-surface text-primary">Public (Anyone can view & join)</option>
                  <option value="restricted" className="bg-surface text-primary">Restricted (Anyone views, approved post)</option>
                  <option value="private" className="bg-surface text-primary">Private (Invite or request only)</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-secondary">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Community Icon */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Community Icon
                </label>
                <input
                  type="file"
                  ref={iconInputRef}
                  onChange={handleIconFileSelect}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={isUploadingIcon}
                  className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>{isUploadingIcon ? 'Uploading...' : 'Upload File'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center shrink-0 overflow-hidden relative">
                  {isUploadingIcon ? (
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  ) : iconUrl ? (
                    <img src={iconUrl} alt="Icon preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-accent uppercase">
                      {name ? name.charAt(0) : 'C'}
                    </span>
                  )}
                </div>
                <div className="relative flex-1">
                  <input
                    type="url"
                    value={isUploadingIcon ? 'Uploading...' : iconUrl}
                    disabled={isUploadingIcon}
                    onChange={(e) => setIconUrl(e.target.value)}
                    placeholder="Paste URL or click Upload File"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-accent pr-8 disabled:opacity-80"
                  />
                  {iconUrl && !isUploadingIcon && (
                    <button
                      type="button"
                      onClick={() => {
                        setIconUrl('');
                        if (iconInputRef.current) iconInputRef.current.value = '';
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-red-400 text-sm font-bold p-1 leading-none"
                      title="Remove icon"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Community Banner */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Community Banner
                </label>
                <input
                  type="file"
                  ref={bannerInputRef}
                  onChange={handleBannerFileSelect}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isUploadingBanner}
                  className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>{isUploadingBanner ? 'Uploading...' : 'Upload File'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-12 h-9 rounded-xl bg-background border border-border flex items-center justify-center shrink-0 overflow-hidden relative">
                  {isUploadingBanner ? (
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  ) : bannerUrl ? (
                    <img src={bannerUrl} alt="Banner preview" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-4 h-4 text-secondary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div className="relative flex-1">
                  <input
                    type="url"
                    value={isUploadingBanner ? 'Uploading...' : bannerUrl}
                    disabled={isUploadingBanner}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    placeholder="Paste URL or click Upload File"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-accent pr-8 disabled:opacity-80"
                  />
                  {bannerUrl && !isUploadingBanner && (
                    <button
                      type="button"
                      onClick={() => {
                        setBannerUrl('');
                        if (bannerInputRef.current) bannerInputRef.current.value = '';
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-red-400 text-sm font-bold p-1 leading-none"
                      title="Remove banner"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Native Toggle Switch for 18+ / NSFW */}
          <div
            onClick={() => setIsNsfw(!isNsfw)}
            className="flex items-center justify-between p-3.5 rounded-xl bg-surface/80 border border-border/80 cursor-pointer active:scale-[0.99] transition-all min-h-[48px] select-none"
          >
            <div className="flex flex-col pr-3">
              <span className="text-sm font-semibold text-primary">18+ / NSFW Community</span>
              <span className="text-xs text-secondary">Flag community as containing mature or adult content</span>
            </div>
            <div className={`w-12 h-7 rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0 ${isNsfw ? 'bg-accent' : 'bg-white/10'}`}>
              <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${isNsfw ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border/50">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-primary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim() || !slug.trim()}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-accent text-surface hover:opacity-90 transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? 'Creating...' : 'Create Community'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

