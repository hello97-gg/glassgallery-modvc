
import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { uploadImage } from '../services/storageService';
import { addImageToFirestore } from '../services/firestoreService';
import { LICENSES, FLAGS } from '../constants';
import Button from './Button';
import Spinner from './Spinner';
import LocationPicker from './LocationPicker';
import imageCompression from 'browser-image-compression';

interface UploadModalProps {
  user: User;
  onClose: () => void;
  onUploadSuccess: () => void;
  initialFile?: File | null;
  allImages?: any[];
}

const UploadModal: React.FC<UploadModalProps> = ({ user, onClose, onUploadSuccess, initialFile = null, allImages = [] }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [license, setLicense] = useState<string>(LICENSES[0].value);
  const [licenseUrl, setLicenseUrl] = useState('');
  const [selectedFlags, setSelectedFlags] = useState<string[]>([]);
  const [originalWorkUrl, setOriginalWorkUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing image...');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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
    // Keep defaults first in their original order, then sort the rest alphabetically
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
  
  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) {
        setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) {
        fileInput.files = e.dataTransfer.files;
      }
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
      return;
    }
    if (selectedFlags.length === 0) {
      setError("Please select at least one tag for the image.");
      return;
    }
    if (!user) return;


    setIsLoading(true);
    setLoadingMessage('Uploading image...');
    setError(null);
    try {
      const { url: imageUrl } = await uploadImage(file);
      await addImageToFirestore(user, imageUrl, title, description, license, selectedFlags, originalWorkUrl, license === 'Other' ? licenseUrl : '', location);
      onUploadSuccess();
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please check your connection.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderUploadState = () => {
      if (isLoading) {
          return (
             <div className="flex flex-col items-center text-center">
                <Spinner />
                <p className="mt-2 text-sm text-secondary">{loadingMessage}</p>
            </div>
          );
      }
       if (preview) {
           return <img src={preview} alt="Preview" className="max-h-full rounded-md object-contain" />;
       }

       return (
            <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-secondary/50" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                <p className="text-sm text-secondary">Drag 'n' drop or click to upload</p>
            </div>
       );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-primary">Upload an Image</h2>
                  <button onClick={onClose} className="text-secondary hover:text-primary transition-colors text-3xl leading-none">&times;</button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-secondary mb-2">Image File</label>
                      <label 
                          htmlFor="file-upload"
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          className={`mt-1 flex justify-center items-center h-48 px-6 pt-5 pb-6 border-2 border-border border-dashed rounded-md transition-colors ${isLoading ? '' : 'cursor-pointer'} ${isDragging ? 'border-accent bg-accent/10' : 'hover:border-secondary/50'}`}
                      >
                          {renderUploadState()}
                          <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" disabled={isLoading} />
                      </label>
                      {preview && (
                          <div className="mt-3 flex justify-end">
                              <button 
                                  type="button" 
                                  onClick={handleAutoTag} 
                                  disabled={isAutoTagging || isLoading}
                                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-accent bg-accent/10 border border-accent/20 hover:bg-accent/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              >
                                   {isAutoTagging ? (
                                       <>
                                           <Spinner className="!h-4 !w-4 !text-accent" />
                                           Auto-tagging...
                                       </>
                                   ) : (
                                       <>
                                           <span>Auto</span>
                                       </>
                                   )}
                              </button>
                          </div>
                      )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                     <div>
                        <label htmlFor="title" className="block text-sm font-medium text-secondary">Title (Optional)</label>
                        <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full bg-background border border-border rounded-md shadow-sm py-2 px-3 text-primary focus:outline-none focus:ring-accent focus:border-accent" placeholder="My Amazing Image" />
                     </div>
                     <div>
                        <label htmlFor="location" className="block text-sm font-medium text-secondary">Location (Optional)</label>
                        <div className="relative mt-1">
                            <input 
                                type="text" 
                                id="location" 
                                value={location} 
                                onChange={(e) => setLocation(e.target.value)} 
                                className="block w-full bg-background border border-border rounded-md shadow-sm py-2 pl-3 pr-10 text-primary focus:outline-none focus:ring-accent focus:border-accent" 
                                placeholder="Tokyo, Japan" 
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
                  </div>

                  <div>
                      <label htmlFor="description" className="block text-sm font-medium text-secondary">Description (Optional)</label>
                      <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 block w-full bg-background border border-border rounded-md shadow-sm py-2 px-3 text-primary focus:outline-none focus:ring-accent focus:border-accent" placeholder="Tell us about your image..." />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                     <div>
                        <label htmlFor="license" className="block text-sm font-medium text-secondary">License</label>
                        <select id="license" value={license} onChange={(e) => setLicense(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-accent focus:border-accent sm:text-sm text-primary">
                            {LICENSES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                        </select>
                     </div>
                      {license === 'Other' && (
                        <div>
                          <label htmlFor="licenseUrl" className="block text-sm font-medium text-secondary">License URL</label>
                          <input type="url" id="licenseUrl" value={licenseUrl} onChange={(e) => setLicenseUrl(e.target.value)} className="mt-1 block w-full bg-background border border-border rounded-md shadow-sm py-2 px-3 text-primary focus:outline-none focus:ring-accent focus:border-accent" placeholder="https://creativecommons.org/licenses/by/4.0/" required />
                        </div>
                      )}
                  </div>


                  <div>
                      <label className="block text-sm font-medium text-secondary">Tags (select at least one)</label>
                      <div className="relative mt-2 mb-2">
                          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                          </svg>
                          <input 
                              type="text" 
                              value={tagSearch} 
                              onChange={(e) => setTagSearch(e.target.value)} 
                              placeholder="Search tags..." 
                              className="block w-full bg-background border border-border rounded-md py-2 pl-9 pr-3 text-sm text-primary placeholder-secondary/40 focus:outline-none focus:ring-accent focus:border-accent" 
                          />
                      </div>
                      {selectedFlags.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {selectedFlags.map(flag => (
                            <button key={`selected-${flag}`} type="button" onClick={() => handleFlagToggle(flag)} className="px-3 py-1 text-sm rounded-full bg-accent text-primary flex items-center gap-1 transition-colors">
                                {flag}
                                <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                          {dynamicTags
                            .filter(flag => !selectedFlags.includes(flag) && flag.toLowerCase().includes(tagSearch.toLowerCase()))
                            .map(flag => (
                              <button key={flag} type="button" onClick={() => handleFlagToggle(flag)} className="px-3 py-1 text-sm rounded-full transition-colors bg-border text-secondary hover:bg-border/80">
                                  {flag}
                              </button>
                          ))}
                          {dynamicTags.filter(flag => !selectedFlags.includes(flag) && flag.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && (
                            <p className="text-xs text-secondary/50 py-1">No tags match "{tagSearch}"</p>
                          )}
                      </div>
                  </div>

                  <div>
                      <label htmlFor="originalWork" className="block text-sm font-medium text-secondary">Original Work URL (Optional)</label>
                      <input type="url" id="originalWork" value={originalWorkUrl} onChange={(e) => setOriginalWorkUrl(e.target.value)} className="mt-1 block w-full bg-background border border-border rounded-md shadow-sm py-2 px-3 text-primary focus:outline-none focus:ring-accent focus:border-accent" placeholder="https://example.com/source_image"/>
                  </div>

                  {error && <p className="text-sm text-red-500">{error}</p>}

                  <div className="flex justify-end gap-3 pt-2">
                      <Button type="button" onClick={onClose} variant="secondary">Cancel</Button>
                      <Button type="submit" disabled={isLoading || !file || selectedFlags.length === 0}>
                          {isLoading ? <Spinner /> : 'Upload'}
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

export default UploadModal;
