import React, { useState, useEffect } from 'react';
import SEOHead from '../../components/SEOHead';
import Header from '../../components/Header';
import type { ImageMeta } from '../../types';

interface ImagePageProps {
  image: ImageMeta;
  error?: string;
}

const ImagePage: React.FC<ImagePageProps> = ({ image, error }) => {
  const [suggestions, setSuggestions] = useState<ImageMeta[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  useEffect(() => {
    if (image?.id) {
      setIsLoadingSuggestions(true);
      fetch(`/api/images?action=suggestions&imageId=${image.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.images) {
            setSuggestions(data.images);
          } else {
            setSuggestions([]);
          }
        })
        .catch(err => {
          console.error("Failed to fetch suggestions:", err);
          setSuggestions([]);
        })
        .finally(() => {
          setIsLoadingSuggestions(false);
        });
    }
  }, [image?.id]);

  if (error || !image) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-primary">
        <h1 className="text-2xl font-bold mb-4">Image Not Found</h1>
        <p className="text-secondary mb-8">{error || "The requested image could not be loaded."}</p>
        <a href="/" className="px-6 py-2 bg-accent text-primary rounded-full hover:bg-accent/80 transition-colors">
          Go Back Home
        </a>
      </div>
    );
  }

  const tagsList = image.flags || [];

  return (
    <div className="flex min-h-screen w-full bg-background text-primary font-sans">
      <SEOHead 
        title={image.title || "Untitled Image"}
        description={image.description || "View this beautiful image on Glass Gallery."}
        imageUrl={image.imageUrl}
        type="article"
        url={`https://gg.modvc.org/image/${image.id}`}
        authorName={image.uploaderName}
        tags={tagsList}
        location={image.location}
        license={image.license}
      />
      
      {/* Side Navigation or Header */}
      <div className="hidden md:flex md:flex-shrink-0">
         <Header user={null} onCreateClick={() => {}} onLoginClick={() => {}} activeView="home" setView={() => {}} onViewProfile={() => {}} notifications={[]} onImageClick={() => {}} onOpenLegal={() => {}} />
      </div>

      <main className="flex-1 min-w-0 p-4 md:p-8 pb-20 md:pb-8 max-w-7xl mx-auto w-full">
        {/* Navigation Link back */}
        <div className="mb-6">
          <a href="/" className="inline-flex items-center gap-2 text-secondary hover:text-primary transition-colors text-sm font-semibold">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Gallery
          </a>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
          {/* Left Column: Premium Image Details Layout */}
          <div className="flex-grow w-full bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-8 p-6 md:p-8">
            
            {/* Left Column: Image Preview */}
            <div className="flex flex-col justify-center items-center bg-black/40 rounded-xl overflow-hidden min-h-[300px] border border-border/50 relative group">
              <img 
                src={image.imageUrl} 
                alt={image.title || "Glass Gallery Showcase"} 
                className="max-h-[600px] w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]"
              />
            </div>

            {/* Right Column: Metadata Details */}
            <div className="flex flex-col justify-between space-y-6">
              <div>
                {/* Uploader Profile Row */}
                <div className="flex items-center gap-3 mb-6">
                  <img 
                    src={image.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${image.uploaderName}&backgroundColor=ff5722`}
                    className="w-10 h-10 rounded-full border-2 border-border"
                    alt={image.uploaderName}
                  />
                  <div>
                    <h3 className="font-bold text-primary">{image.uploaderName}</h3>
                    <p className="text-xs text-secondary">Contributor</p>
                  </div>
                </div>

                {/* Title & Location */}
                <h1 className="text-3xl font-extrabold text-primary tracking-tight mb-2">
                  {image.title || "Untitled Showcase"}
                </h1>
                
                {image.location && (
                  <div className="flex items-center gap-1.5 text-secondary text-sm mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{image.location}</span>
                  </div>
                )}

                {/* Description */}
                <p className="text-secondary text-base leading-relaxed mb-6">
                  {image.description || "No description provided."}
                </p>

                {/* License Information */}
                <div className="bg-surface/50 border border-border/50 rounded-xl p-4 mb-6">
                  <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">License Metadata</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-primary bg-accent/10 text-accent px-3 py-1 rounded-md border border-accent/20">
                      {image.license || 'CC0'}
                    </span>
                    {image.licenseUrl && (
                      <a href={image.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                        License Details &rarr;
                      </a>
                    )}
                  </div>
                </div>

                {/* Tags/Keywords Chips */}
                {tagsList.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Keywords</h4>
                    <div className="flex flex-wrap gap-2">
                      {tagsList.map(tag => (
                        <span key={tag} className="text-xs px-2.5 py-1 bg-border text-secondary rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* CTA: Download Button */}
              <div className="pt-6 border-t border-border flex items-center justify-between gap-4">
                <a 
                  href={image.imageUrl} 
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-accent text-primary font-bold px-6 py-3 rounded-xl hover:bg-accent/80 transition-all shadow-lg hover:shadow-accent/20 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Image
                </a>
              </div>

            </div>
          </div>

          {/* Right Column: More Like This Panel */}
          <div className="w-full lg:w-[420px] xl:w-[480px] flex-shrink-0 bg-surface border border-border rounded-2xl p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/40 flex-shrink-0">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                More like this
              </h3>
              <span className="text-xs text-secondary font-medium">{suggestions.length} related pins</span>
            </div>

            {isLoadingSuggestions ? (
              <div className="columns-2 sm:columns-3 gap-3 animate-pulse">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="break-inside-avoid mb-3 h-[120px] rounded-xl bg-border/40 border border-border/20" />
                ))}
              </div>
            ) : suggestions.length > 0 ? (
              <div className="columns-2 sm:columns-3 gap-3 animate-fade-in">
                {suggestions.map(img => (
                  <a 
                    key={img.id}
                    href={`/image/${img.id}`}
                    className="break-inside-avoid mb-3 block group cursor-pointer relative overflow-hidden rounded-xl bg-background border border-border/50 hover:border-accent/40 shadow-sm transition-all duration-300 hover:scale-[1.03]"
                  >
                    <img src={img.imageUrl} alt={img.title || 'Related photo'} className="w-full object-cover rounded-xl" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-2 flex flex-col justify-end">
                      <p className="text-[10px] font-semibold text-white truncate">{img.title || 'Untitled'}</p>
                      <p className="text-[8px] text-white/80 truncate">by {img.uploaderName}</p>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center py-12 text-secondary">
                <p className="text-sm">No related images found.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export const getServerSideProps = async (context: any) => {
  const { id } = context.params || {};

  try {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = context.req.headers.host || 'localhost:3000';
    const res = await fetch(`${protocol}://${host}/api/images?action=get_single&imageId=${id}`);
    const data = await res.json();

    if (data.success && data.image) {
      return {
        props: {
          image: data.image
        }
      };
    }

    return {
      props: {
        image: null,
        error: "Image could not be found."
      }
    };
  } catch (err: any) {
    return {
      props: {
        image: null,
        error: err.message || "Failed to retrieve image."
      }
    };
  }
};

export default ImagePage;
