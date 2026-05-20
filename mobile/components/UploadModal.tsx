import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { uploadImage } from '../services/storageService';
import { addImageToFirestore } from '../services/firestoreService';
import { LICENSES } from '../constants';
import Button from './Button';
import Spinner from './Spinner';
import LocationPicker from './LocationPicker';
import imageCompression from 'browser-image-compression';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

interface UploadModalProps {
  user: User;
  onClose: () => void;
  onUploadSuccess: () => void;
  initialFile?: File | null;
  allImages?: any[];
}

const UploadModal: React.FC<UploadModalProps> = ({ user, onClose, onUploadSuccess, initialFile = null, allImages = [] }) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [license] = useState<string>(LICENSES[0].value); // Default to CC-BY-4.0 implicitly
  const [selectedFlags, setSelectedFlags] = useState<string[]>([]);
  const [originalWorkUrl] = useState(''); // Keep hidden/implicit
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing image...');
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  const DEFAULT_FLAGS = [
    'AI Generated',
    'Natural',
    'Photography',
    'Abstract',
    'Minimalist',
    'Fantasy',
    'Sci-Fi',
    'Minecraft',
    'Games'
  ];

  const dynamicTags = React.useMemo(() => {
    const tagsSet = new Set<string>();
    DEFAULT_FLAGS.forEach(flag => tagsSet.add(flag));
    
    allImages.forEach(image => {
      if (Array.isArray(image.flags)) {
        image.flags.forEach(flag => {
          if (flag && flag !== 'Flagged') {
            tagsSet.add(flag);
          }
        });
      }
    });

    selectedFlags.forEach(flag => {
      if (flag && flag !== 'Flagged') {
        tagsSet.add(flag);
      }
    });

    const allTags = Array.from(tagsSet);
    const defaults = allTags.filter(t => DEFAULT_FLAGS.includes(t));
    const extras = allTags.filter(t => !DEFAULT_FLAGS.includes(t)).sort((a, b) => a.localeCompare(b));
    return [...defaults, ...extras];
  }, [allImages, selectedFlags]);

  const handleAutoTag = async () => {
    if (!preview) return;
    setIsAutoTagging(true);
    setError(null);
    try {
        const response = await fetch('/api/images?action=auto_tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: preview })
        });
        const data = await response.json();
        if (data.success) {
            if (data.title) setTitle(data.title);
            if (data.description) setDescription(data.description);
            if (data.location) setLocation(data.location);
            if (data.tags && data.tags.length > 0) {
                setSelectedFlags(data.tags);
            }
        } else {
            setError(data.error || "Failed to auto-tag image.");
        }
    } catch (err: any) {
        console.error("Auto tagging failed:", err);
        setError("Failed to auto-tag image. Please try again.");
    } finally {
        setIsAutoTagging(false);
    }
  };

  const handleNativePhotoSelect = async () => {
    if (isLoading) return;
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri
      });
      
      if (image.webPath) {
        setIsLoading(true);
        setLoadingMessage('Loading captured photo...');
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        const rawFile = new File([blob], `photo_${Date.now()}.${image.format}`, { type: `image/${image.format}` });
        setIsLoading(false);
        await handleFileSelect(rawFile);
      }
    } catch (err) {
      console.warn("User cancelled or camera failed:", err);
    }
  };

  const handleNativeLocation = async () => {
    try {
      setIsLoading(true);
      setLoadingMessage('Fetching GPS coordinates...');
      
      let latitude: number;
      let longitude: number;

      if (Capacitor.isNativePlatform()) {
        try {
          const checkPerm = await Geolocation.checkPermissions();
          if (checkPerm.coarseLocation !== 'granted' && checkPerm.location !== 'granted') {
            await Geolocation.requestPermissions();
          }
          const coordinates = await Geolocation.getCurrentPosition({
             enableHighAccuracy: true,
             timeout: 8000
          });
          latitude = coordinates.coords.latitude;
          longitude = coordinates.coords.longitude;
        } catch (nativeErr) {
          console.warn("Capacitor geolocation failed, falling back to browser API:", nativeErr);
          const coords: any = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              pos => resolve(pos.coords),
              err => reject(err),
              { enableHighAccuracy: true, timeout: 8000 }
            );
          });
          latitude = coords.latitude;
          longitude = coords.longitude;
        }
      } else {
        const coords: any = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            pos => resolve(pos.coords),
            err => reject(err),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        });
        latitude = coords.latitude;
        longitude = coords.longitude;
      }

      let locationName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`, {
          headers: {
            'User-Agent': 'GlassGalleryAndroid/1.0.0 (org.modvc.glassgallery)'
          }
        });
        const data = await res.json();
        if (data && data.address) {
          const address = data.address;
          const shortLocation = address.city || address.town || address.village || address.suburb || address.state || data.display_name.split(',')[0];
          const country = address.country ? `, ${address.country}` : '';
          locationName = `${shortLocation}${country}`;
        }
      } catch (geocodeErr) {
        console.warn("Nominatim geocoding fetch failed, fallback to raw coords:", geocodeErr);
      }
      
      setLocation(locationName);
    } catch (err) {
      console.error("All geolocator methods failed:", err);
      setError("Failed to fetch location from native GPS. Please check device location settings.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    if (selectedFile && selectedFile.type.startsWith('image/')) {
        setIsLoading(true);
        setLoadingMessage('Compressing image...');
        setError(null);
        setPreview(null);
        setFile(null);

        try {
            const options = {
                maxSizeMB: 2,
                maxWidthOrHeight: 1920,
                useWebWorker: true,
            };
            
            const compressedFile = await imageCompression(selectedFile, options);
            
            setFile(compressedFile);
            const reader = new FileReader();
            reader.onloadend = () => {
                const previewUrl = reader.result as string;
                setPreview(previewUrl);
                setIsLoading(false);
                setStep(2); // Automatically transition to Step 2
            };
            reader.readAsDataURL(compressedFile);

        } catch (err) {
            console.error("Image compression error:", err);
            setError("Could not process the image. Please try a different one.");
            setFile(null);
            setPreview(null);
            setIsLoading(false);
        }
    } else {
        setError("Please select a valid image file.");
    }
  };
  
  useEffect(() => {
    if (initialFile) {
        handleFileSelect(initialFile);
    }
  }, [initialFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleFlagToggle = (flag: string) => {
    setError(null);
    setSelectedFlags(prev =>
      prev.includes(flag) ? prev.filter(f => f !== flag) : [...prev, flag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select an image to upload.");
      setStep(1);
      return;
    }
    if (selectedFlags.length === 0) {
      setError("Please select at least one tag for the image.");
      setStep(3);
      return;
    }
    if (!user) return;

    setIsLoading(true);
    setLoadingMessage('Uploading pin to Glass Gallery...');
    setError(null);
    try {
      const { url: imageUrl } = await uploadImage(file);
      await addImageToFirestore(user, imageUrl, title || 'Untitled Pin', description, license, selectedFlags, originalWorkUrl, '', location);
      onUploadSuccess();
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please check your connection.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Modern segmented step indicators
  const renderProgress = () => {
    return (
      <div className="flex gap-2 w-full mb-6">
        {[1, 2, 3, 4].map((s) => (
          <div 
            key={s} 
            className={`h-1 rounded-full flex-1 transition-all duration-300 ${
              s <= step ? 'bg-red-600' : 'bg-white/10'
            }`} 
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <div className="bg-[#111111] border border-white/10 rounded-[32px] shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:hidden flex flex-col">
          {/* Header */}
          <div className="p-6 pb-0 flex justify-between items-center flex-shrink-0">
            <div>
              <span className="text-neutral-400 text-xs font-bold uppercase tracking-wider">Step {step} of 4</span>
              <h2 className="text-xl font-bold text-white mt-0.5">
                {step === 1 && "Create Pin"}
                {step === 2 && "Add Details"}
                {step === 3 && "Choose Tags"}
                {step === 4 && "Review & Publish"}
              </h2>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors text-3xl leading-none">&times;</button>
          </div>

          <div className="p-6 flex-grow overflow-y-auto">
            {renderProgress()}
            {error && <p className="text-sm text-red-500 mb-4 bg-red-500/10 border border-red-500/20 p-3 rounded-2xl">{error}</p>}

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Spinner className="!h-10 !w-10 !text-red-600 mb-4 animate-spin" />
                <p className="text-white font-bold">{loadingMessage}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* STEP 1: Image Picker */}
                {step === 1 && (
                  <div className="flex flex-col gap-4 py-4">
                    {/* Native Camera option */}
                    <button 
                      type="button" 
                      onClick={handleNativePhotoSelect}
                      className="w-full flex flex-col items-center justify-center p-8 rounded-[24px] bg-neutral-900 border-2 border-dashed border-white/10 hover:border-red-500/40 hover:bg-neutral-800/80 transition-all duration-200 active:scale-[0.98] select-none text-left"
                    >
                      <div className="p-3 bg-red-600/10 text-red-500 rounded-full mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <span className="text-white font-bold text-base">Take Photo</span>
                      <span className="text-neutral-400 text-xs mt-1 text-center">Capture a masterpiece now</span>
                    </button>

                    {/* Gallery picker */}
                    <label 
                      htmlFor="file-upload"
                      className="w-full flex flex-col items-center justify-center p-8 rounded-[24px] bg-neutral-900 border-2 border-dashed border-white/10 hover:border-red-500/40 hover:bg-neutral-800/80 cursor-pointer transition-all duration-200 active:scale-[0.98] select-none"
                    >
                      <div className="p-3 bg-neutral-800 text-neutral-300 rounded-full mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-white font-bold text-base">Pick from Gallery</span>
                      <span className="text-neutral-400 text-xs mt-1 text-center">Choose from device photo gallery</span>
                      <input id="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                    </label>
                  </div>
                )}

                {/* STEP 2: Title, Description, Location */}
                {step === 2 && preview && (
                  <div className="space-y-4">
                    {/* Small preview thumbnail with AI Auto tag */}
                    <div className="flex gap-4 p-3 bg-neutral-900/60 rounded-2xl border border-white/5 items-center">
                      <img src={preview} alt="Chosen file preview" className="w-16 h-16 rounded-xl object-cover border border-white/10" />
                      <div className="flex-grow min-w-0">
                        <p className="text-white text-xs font-bold truncate">Selected File</p>
                        <p className="text-neutral-400 text-[10px]">Ready to process</p>
                      </div>
                      <button 
                        type="button" 
                        onClick={handleAutoTag} 
                        disabled={isAutoTagging}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all cursor-pointer disabled:opacity-50 select-none"
                      >
                        {isAutoTagging ? (
                            <>
                                <Spinner className="!h-3 !w-3 !text-red-500" />
                                <span>Wait...</span>
                            </>
                        ) : (
                            <>
                                <span>Auto Fill</span>
                            </>
                        )}
                      </button>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="title" className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Title (Optional)</label>
                        <input 
                          type="text" 
                          id="title" 
                          value={title} 
                          onChange={(e) => setTitle(e.target.value)} 
                          className="block w-full bg-neutral-900 border border-white/10 rounded-2xl py-3 px-4 text-white focus:outline-none focus:border-red-500/50" 
                          placeholder="My Amazing Art" 
                        />
                      </div>

                      <div>
                        <label htmlFor="description" className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Description (Optional)</label>
                        <textarea 
                          id="description" 
                          value={description} 
                          onChange={(e) => setDescription(e.target.value)} 
                          rows={3} 
                          className="block w-full bg-neutral-900 border border-white/10 rounded-2xl py-3 px-4 text-white focus:outline-none focus:border-red-500/50" 
                          placeholder="Tell people about your art piece..." 
                        />
                      </div>

                      <div>
                        <label htmlFor="location" className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Location (Optional)</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            id="location" 
                            value={location} 
                            onChange={(e) => setLocation(e.target.value)} 
                            className="block w-full bg-neutral-900 border border-white/10 rounded-2xl py-3 pl-4 pr-12 text-white focus:outline-none focus:border-red-500/50" 
                            placeholder="Tokyo, Japan" 
                          />
                          {Capacitor.isNativePlatform() ? (
                            <button 
                              type="button"
                              onClick={handleNativeLocation}
                              className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-red-500"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </button>
                          ) : (
                            <button 
                              type="button"
                              onClick={() => setShowMap(true)}
                              className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-red-500"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Step buttons */}
                    <div className="flex gap-3 pt-4">
                      <button 
                        type="button" 
                        onClick={() => setStep(1)} 
                        className="flex-1 py-4 font-bold text-neutral-300 bg-neutral-900 rounded-2xl transition-all duration-150 hover:bg-neutral-850 active:scale-95 border border-white/5"
                      >
                        Back
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setStep(3)} 
                        className="flex-1 py-4 font-bold text-white bg-red-600 rounded-2xl transition-all duration-150 hover:bg-red-500 active:scale-95"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Tag Chips Selection */}
                {step === 3 && (
                  <div className="space-y-4">
                    {/* Search */}
                    <div className="relative">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                      </svg>
                      <input 
                        type="text" 
                        value={tagSearch} 
                        onChange={(e) => setTagSearch(e.target.value)} 
                        placeholder="Search or filter tags..." 
                        className="block w-full bg-neutral-900 border border-white/10 rounded-2xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-red-500/50 placeholder-neutral-500" 
                      />
                    </div>

                    {/* Selected Tags list */}
                    {selectedFlags.length > 0 ? (
                      <div>
                        <span className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Selected ({selectedFlags.length})</span>
                        <div className="flex flex-wrap gap-2">
                          {selectedFlags.map(flag => (
                            <button 
                              key={`sel-${flag}`} 
                              type="button" 
                              onClick={() => handleFlagToggle(flag)} 
                              className="px-3.5 py-1.5 text-xs font-bold rounded-full bg-red-600 text-white flex items-center gap-1.5 transition-all duration-150 active:scale-95"
                            >
                              <span>{flag}</span>
                              <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl font-semibold">Please select at least one tag below to categorize your Pin.</p>
                    )}

                    {/* Scrollable list of options */}
                    <div>
                      <span className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">All Tags</span>
                      <div className="flex flex-wrap gap-2 max-h-[25vh] overflow-y-auto p-1 bg-neutral-900/40 rounded-2xl border border-white/5 [&::-webkit-scrollbar]:hidden">
                        {dynamicTags
                          .filter(flag => !selectedFlags.includes(flag) && flag.toLowerCase().includes(tagSearch.toLowerCase()))
                          .map(flag => (
                            <button 
                              key={flag} 
                              type="button" 
                              onClick={() => handleFlagToggle(flag)} 
                              className="px-3.5 py-1.5 text-xs font-bold rounded-full transition-all duration-150 active:scale-95 bg-neutral-850 text-neutral-300 hover:bg-neutral-800"
                            >
                              + {flag}
                            </button>
                        ))}
                      </div>
                    </div>

                    {/* Step buttons */}
                    <div className="flex gap-3 pt-4">
                      <button 
                        type="button" 
                        onClick={() => setStep(2)} 
                        className="flex-1 py-4 font-bold text-neutral-300 bg-neutral-900 rounded-2xl transition-all duration-150 hover:bg-neutral-850 active:scale-95 border border-white/5"
                      >
                        Back
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          if (selectedFlags.length === 0) {
                            setError("Please select at least one tag to categorize your upload.");
                            return;
                          }
                          setError(null);
                          setStep(4);
                        }} 
                        className="flex-1 py-4 font-bold text-white bg-red-600 rounded-2xl transition-all duration-150 hover:bg-red-500 active:scale-95"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4: Review and Publish */}
                {step === 4 && preview && (
                  <div className="space-y-4">
                    {/* Pinterest Style Card Summary Preview */}
                    <div className="bg-neutral-950 rounded-[28px] overflow-hidden border border-white/10 p-4">
                      <div className="relative h-48 w-full rounded-2xl overflow-hidden border border-white/5 mb-4">
                        <img src={preview} alt="Final Preview" className="w-full h-full object-cover" />
                        {location && (
                          <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-white text-[10px] font-bold flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            <span>{location}</span>
                          </div>
                        )}
                      </div>

                      <div className="px-1 space-y-2">
                        <h3 className="text-white text-lg font-bold truncate">{title || 'Untitled Pin'}</h3>
                        {description && <p className="text-neutral-400 text-xs line-clamp-2">{description}</p>}
                        
                        <div className="pt-2 flex flex-wrap gap-1">
                          {selectedFlags.map(flag => (
                            <span key={`review-${flag}`} className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-neutral-900 text-neutral-400 border border-white/5">
                              #{flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Step buttons */}
                    <div className="flex gap-3 pt-4">
                      <button 
                        type="button" 
                        onClick={() => setStep(3)} 
                        className="flex-1 py-4 font-bold text-neutral-300 bg-neutral-900 rounded-2xl transition-all duration-150 hover:bg-neutral-850 active:scale-95 border border-white/5"
                      >
                        Back
                      </button>
                      <button 
                        type="button" 
                        onClick={handleSubmit} 
                        className="flex-1 py-4 font-bold text-white bg-red-600 rounded-2xl transition-all duration-150 hover:bg-red-500 shadow-[0_8px_30px_rgb(220,38,38,0.3)] active:scale-95"
                      >
                        Publish Pin
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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

export default UploadModal;
