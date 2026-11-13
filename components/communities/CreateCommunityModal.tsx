import React, { useState, useRef, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { CommunityType } from '../../types';
import { uploadImage } from '../../services/storageService';

interface CreateCommunityModalProps {
  user: User | null;
  onClose: () => void;
  onSuccess: (slug: string) => void;
  onLoginRequired?: () => void;
}

const CATEGORIES = [
  'General', 'Art & Photography', 'Technology', 'Nature & Travel',
  'Architecture & Design', 'Gaming', 'Anime & Illustration', 'Music & Media'
];

export const CreateCommunityModal: React.FC<CreateCommunityModalProps> = ({
  user,
  onClose,
  onSuccess,
  onLoginRequired
}) => {
  // Load initial draft from localStorage if available
  const initialDraft = (() => {
    try {
      const saved = localStorage.getItem('gg_draft_community');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.iconUrl === 'Local file selected') parsed.iconUrl = '';
        if (parsed.bannerUrl === 'Local file selected') parsed.bannerUrl = '';
        return parsed;
      }
    } catch {}
    return null;
  })();

  const [name, setName] = useState(initialDraft?.name || '');
  const [slug, setSlug] = useState(initialDraft?.slug || '');
  const [description, setDescription] = useState(initialDraft?.description || '');
  const [type, setType] = useState<CommunityType>(initialDraft?.type || 'public');
  const [category, setCategory] = useState(initialDraft?.category || CATEGORIES[0]);
  const [iconUrl, setIconUrl] = useState(initialDraft?.iconUrl || '');
  const [bannerUrl, setBannerUrl] = useState(initialDraft?.bannerUrl || '');
  const [isNsfw, setIsNsfw] = useState(Boolean(initialDraft?.isNsfw));
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slug availability status
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [slugError, setSlugError] = useState<string | null>(null);

  // Local File references (deferred upload until submit)
  const iconFileRef = useRef<File | null>(null);
  const bannerFileRef = useRef<File | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Live slug availability checker (debounced)
  useEffect(() => {
    const clean = slug.trim().toLowerCase();
    if (clean.length < 3) {
      setSlugStatus('idle');
      setSlugError(null);
      return;
    }

    if (!/^[a-z0-9][a-z0-9-_]*[a-z0-9]?$/.test(clean)) {
      setSlugStatus('taken');
      setSlugError('Invalid format (use letters, numbers, hyphens)');
      return;
    }

    const reserved = new Set([
      'admin', 'api', 'new', 'edit', 'all', 'settings', 'mod', 'moderator',
      'explore', 'discover', 'gallery', 'image', 'communities', 'c'
    ]);
    if (reserved.has(clean)) {
      setSlugStatus('taken');
      setSlugError('This slug is reserved');
      return;
    }

    setSlugStatus('checking');
    setSlugError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/communities?check_slug=${encodeURIComponent(clean)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.available === false) {
            setSlugStatus('taken');
            setSlugError(`'c/${clean}' is already taken`);
          } else {
            setSlugStatus('available');
            setSlugError(null);
          }
        } else {
          setSlugStatus('idle');
        }
      } catch {
        setSlugStatus('idle');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [slug]);

  // Handle icon selection: upload immediately to storage if logged in, or draft locally if offline
  const handleIconFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Icon file must be under 5MB.');
      return;
    }

    setError(null);

    if (user) {
      setIsUploadingIcon(true);
      try {
        const { url } = await uploadImage(file);
        setIconUrl(url);
        iconFileRef.current = null;
        saveDraftToLocalStorage({ iconUrl: url });
      } catch (err: any) {
        setError(err.message || 'Failed to upload icon.');
      } finally {
        setIsUploadingIcon(false);
      }
      return;
    }

    iconFileRef.current = file;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setIconUrl(dataUrl);
      saveDraftToLocalStorage({ iconUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  // Handle banner selection: upload immediately to storage if logged in, or draft locally if offline
  const handleBannerFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('Banner file must be under 10MB.');
      return;
    }

    setError(null);

    if (user) {
      setIsUploadingBanner(true);
      try {
        const { url } = await uploadImage(file);
        setBannerUrl(url);
        bannerFileRef.current = null;
        saveDraftToLocalStorage({ bannerUrl: url });
      } catch (err: any) {
        setError(err.message || 'Failed to upload banner.');
      } finally {
        setIsUploadingBanner(false);
      }
      return;
    }

    bannerFileRef.current = file;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setBannerUrl(dataUrl);
      saveDraftToLocalStorage({ bannerUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleClearDraft = () => {
    try {
      localStorage.removeItem('gg_draft_community');
      sessionStorage.removeItem('gg_pending_community_login');
    } catch {}
    setName('');
    setSlug('');
    setDescription('');
    setIconUrl('');
    setBannerUrl('');
    setIsNsfw(false);
    setType('public');
    setCategory(CATEGORIES[0]);
    iconFileRef.current = null;
    bannerFileRef.current = null;
    if (iconInputRef.current) iconInputRef.current.value = '';
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const saveDraftToLocalStorage = (overrides?: Partial<any>) => {
    try {
      const draft = {
        name,
        slug,
        description,
        type,
        category,
        iconUrl,
        bannerUrl,
        isNsfw,
        ...overrides
      };
      localStorage.setItem('gg_draft_community', JSON.stringify(draft));
    } catch {}
  };

  const handleNameChange = (val: string) => {
    setName(val);
    const prevAutoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug || slug === prevAutoSlug) {
      const autoSlug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      setSlug(autoSlug);
    }
    saveDraftToLocalStorage({ name: val });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    if (slugStatus === 'taken') {
      setError(`'c/${cleanSlug}' is already taken. Please pick another slug.`);
      return;
    }

    // If user is NOT signed in, save draft locally and prompt sign in
    if (!user) {
      saveDraftToLocalStorage();
      try {
        sessionStorage.setItem('gg_pending_community_login', '1');
      } catch {}
      if (onLoginRequired) {
        onClose();
        onLoginRequired();
      } else {
        setError('Please sign in to finish creating your community.');
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Upload local files to server storage now that user is authenticated
      let finalIconUrl = iconUrl;
      let finalBannerUrl = bannerUrl;

      if (iconFileRef.current && iconUrl.startsWith('data:')) {
        try {
          const { url } = await uploadImage(iconFileRef.current);
          finalIconUrl = url;
        } catch (err: any) {
          console.warn('Icon upload failed, proceeding without icon:', err);
          finalIconUrl = '';
        }
      }

      if (bannerFileRef.current && bannerUrl.startsWith('data:')) {
        try {
          const { url } = await uploadImage(bannerFileRef.current);
          finalBannerUrl = url;
        } catch (err: any) {
          console.warn('Banner upload failed, proceeding without banner:', err);
          finalBannerUrl = '';
        }
      }

      // 2. Call backend create API
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
          icon_url: finalIconUrl.trim() || undefined,
          banner_url: finalBannerUrl.trim() || undefined,
          is_nsfw: isNsfw ? 1 : 0
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create community.');
      }

      // 3. Clear draft and navigate
      try {
        localStorage.removeItem('gg_draft_community');
        sessionStorage.removeItem('gg_pending_community_login');
      } catch {}

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
          <div className="flex items-center gap-3">
            {Boolean(name || slug || description || iconUrl || bannerUrl) && (
              <button
                type="button"
                onClick={handleClearDraft}
                className="text-xs text-secondary hover:text-red-400 transition-colors font-medium px-2 py-1 rounded-lg hover:bg-red-500/10"
                title="Discard saved draft"
              >
                Clear Draft
              </button>
            )}
            <button
              onClick={onClose}
              className="text-secondary hover:text-primary transition-colors text-2xl leading-none p-1"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {!user && (
          <div className="mb-4 p-3 bg-accent/10 border border-accent/20 rounded-xl text-xs text-primary flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
              <span>You can customize your community draft now. We'll save it locally until you sign in!</span>
            </div>
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
                URL Slug <span className="text-secondary/60 lowercase font-normal">(gg.modvc.org/c/slug)</span>
              </label>
              {slugStatus === 'checking' && (
                <span className="text-[11px] text-secondary font-medium">Checking...</span>
              )}
              {slugStatus === 'available' && (
                <span className="text-[11px] text-green-400 font-semibold flex items-center gap-1">
                  ✓ Available
                </span>
              )}
              {slugStatus === 'taken' && (
                <span className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
                  ✕ {slugError || 'Taken'}
                </span>
              )}
            </div>
            <div className="flex items-center bg-background border border-border rounded-xl px-3 py-2 text-sm text-secondary">
              <span className="text-secondary select-none mr-1 font-mono">c/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  const s = e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '');
                  setSlug(s);
                  saveDraftToLocalStorage({ slug: s });
                }}
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
              onChange={(e) => {
                setDescription(e.target.value);
                saveDraftToLocalStorage({ description: e.target.value });
              }}
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
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  saveDraftToLocalStorage({ category: e.target.value });
                }}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1">
                Privacy Type
              </label>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as CommunityType);
                  saveDraftToLocalStorage({ type: e.target.value });
                }}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="public">Public (Anyone can view & join)</option>
                <option value="restricted">Restricted (Anyone views, approved post)</option>
                <option value="private">Private (Invite or request only)</option>
              </select>
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
                  className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>{isUploadingIcon ? 'Uploading...' : 'Choose Image'}</span>
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
                    value={
                      isUploadingIcon
                        ? 'Uploading image...'
                        : iconUrl.startsWith('data:')
                        ? 'Image selected (local preview)'
                        : iconUrl
                    }
                    disabled={isUploadingIcon || iconUrl.startsWith('data:')}
                    onChange={(e) => {
                      setIconUrl(e.target.value);
                      iconFileRef.current = null;
                      saveDraftToLocalStorage({ iconUrl: e.target.value });
                    }}
                    placeholder="Paste URL or Choose Image"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-accent pr-8 disabled:opacity-80"
                  />
                  {iconUrl && !isUploadingIcon && (
                    <button
                      type="button"
                      onClick={() => {
                        setIconUrl('');
                        iconFileRef.current = null;
                        if (iconInputRef.current) iconInputRef.current.value = '';
                        saveDraftToLocalStorage({ iconUrl: '' });
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
                  <span>{isUploadingBanner ? 'Uploading...' : 'Choose Image'}</span>
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
                    value={
                      isUploadingBanner
                        ? 'Uploading image...'
                        : bannerUrl.startsWith('data:')
                        ? 'Image selected (local preview)'
                        : bannerUrl
                    }
                    disabled={isUploadingBanner || bannerUrl.startsWith('data:')}
                    onChange={(e) => {
                      setBannerUrl(e.target.value);
                      bannerFileRef.current = null;
                      saveDraftToLocalStorage({ bannerUrl: e.target.value });
                    }}
                    placeholder="Paste URL or Choose Image"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-accent pr-8 disabled:opacity-80"
                  />
                  {bannerUrl && !isUploadingBanner && (
                    <button
                      type="button"
                      onClick={() => {
                        setBannerUrl('');
                        bannerFileRef.current = null;
                        if (bannerInputRef.current) bannerInputRef.current.value = '';
                        saveDraftToLocalStorage({ bannerUrl: '' });
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

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="nsfw-checkbox"
              checked={isNsfw}
              onChange={(e) => {
                setIsNsfw(e.target.checked);
                saveDraftToLocalStorage({ isNsfw: e.target.checked });
              }}
              className="rounded bg-background border-border text-accent focus:ring-accent h-4 w-4"
            />
            <label htmlFor="nsfw-checkbox" className="text-xs text-secondary cursor-pointer select-none">
              Mark as 18+ / NSFW Community
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border/50">
            <button
              type="button"
              onClick={() => {
                onClose();
              }}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-primary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim() || !slug.trim() || slugStatus === 'taken'}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-accent text-surface hover:opacity-90 transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading
                ? 'Creating...'
                : !user
                ? 'Sign in to Create'
                : 'Create Community'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
