import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import Button from './Button';
import Spinner from './Spinner';

interface LocationPickerProps {
  onSelect: (locationName: string) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    L: any;
  }
}

const LocationPicker: React.FC<LocationPickerProps> = ({ onSelect, onClose }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Helper to format reverse geocoding results cleanly
  const formatLocationAddress = (data: any): string => {
    if (!data) return "Unknown Location";
    const addr = data.address;
    if (addr) {
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county;
      const state = addr.state || addr.region;
      const country = addr.country;

      if (city && country) {
        return state && country === "United States" ? `${city}, ${state}, ${country}` : `${city}, ${country}`;
      } else if (state && country) {
        return `${state}, ${country}`;
      } else if (country) {
        return country;
      }
    }
    return data.display_name ? data.display_name.split(',').slice(0, 2).join(', ') : "Unknown Location";
  };

  const createPinIcon = (L: any) => {
    return L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="position: relative; width: 34px; height: 42px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 32" width="34" height="42" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.6));">
            <path fill="#f5c3b8" stroke="#ffffff" stroke-width="1.5" d="M12 0C5.37 0 0 5.37 0 12c0 8.8 10.6 19.1 11.1 19.6.5.5 1.3.5 1.8 0C13.4 31.1 24 20.8 24 12 24 5.37 18.63 0 12 0z"/>
            <circle cx="12" cy="12" r="5" fill="#181818"/>
          </svg>
        </div>
      `,
      iconSize: [34, 42],
      iconAnchor: [17, 42],
      popupAnchor: [0, -42],
    });
  };

  const handleCoordinatesSelected = useCallback(async (lat: number, lng: number) => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    const pinIcon = createPinIcon(L);

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data = await response.json();
      const locationName = formatLocationAddress(data);

      setSelectedLocation(locationName);
      markerRef.current.bindPopup(`<b style="color:#f5c3b8;">${locationName}</b>`).openPopup();
    } catch (error) {
      console.error("Geocoding failed", error);
      setSelectedLocation("Unknown Location");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearchLocation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || isSearching || !mapInstanceRef.current) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(searchQuery.trim())}&limit=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        
        mapInstanceRef.current.setView([lat, lon], 12);
        await handleCoordinatesSelected(lat, lon);
      }
    } catch (err) {
      console.error("Location search failed", err);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current && window.L) {
      const L = window.L;
      
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([20, 0], 2);
      mapInstanceRef.current = map;

      // Free OpenStreetMap tile server with dark mode CSS filter (no watermarks, no API key required)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
        className: 'leaflet-dark-tiles',
      }).addTo(map);

      // Invalidate sizes after modal transitions to ensure all tiles render seamlessly without grey gaps
      const t1 = setTimeout(() => map.invalidateSize(), 50);
      const t2 = setTimeout(() => map.invalidateSize(), 180);
      const t3 = setTimeout(() => map.invalidateSize(), 400);

      let resizeObserver: ResizeObserver | null = null;
      if (window.ResizeObserver && mapContainerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize();
        });
        resizeObserver.observe(mapContainerRef.current);
      }

      // Locate user on start if permitted
      map.locate({ setView: true, maxZoom: 11 });

      map.on('click', (e: any) => {
        handleCoordinatesSelected(e.latlng.lat, e.latlng.lng);
      });

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        if (resizeObserver) resizeObserver.disconnect();
      };
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [handleCoordinatesSelected]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    let active = true;
    const listenerPromise = (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        const listener = await CapApp.addListener('backButton', () => {
          if (active) {
            onClose();
          }
        });
        return listener;
      } catch (err) {
        console.warn("CapApp not available in LocationPicker", err);
      }
    })();

    return () => {
      active = false;
      listenerPromise.then(listener => {
        if (listener) {
          listener.remove();
        }
      });
    };
  }, [onClose]);

  const handleConfirm = () => {
    if (selectedLocation) {
      onSelect(selectedLocation);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <style>{`
        .leaflet-dark-tiles {
          filter: invert(100%) hue-rotate(180deg) brightness(88%) contrast(92%) saturate(70%) !important;
        }
        .leaflet-container {
          background: #181818 !important;
          font-family: inherit;
        }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: #242424 !important;
          color: #e5e5e5 !important;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6);
          border-radius: 12px;
        }
        .leaflet-popup-content {
          margin: 10px 14px;
          line-height: 1.4;
          font-size: 13px;
        }
        .leaflet-container a.leaflet-popup-close-button {
          color: #a0a0a0 !important;
          padding: 8px 8px 0 0;
        }
        .leaflet-control-zoom {
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 8px !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          background-color: #242424 !important;
          color: #e5e5e5 !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: #333333 !important;
          color: #ffffff !important;
        }
        .leaflet-control-attribution {
          background: rgba(24, 24, 24, 0.85) !important;
          color: #777777 !important;
          font-size: 10px !important;
          padding: 2px 6px !important;
          border-radius: 4px 0 0 0;
        }
        .leaflet-control-attribution a {
          color: #999999 !important;
        }
      `}</style>

      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-3xl h-[85vh] max-h-[750px] flex flex-col overflow-hidden relative">
        {/* Header with Search */}
        <div className="p-3.5 md:p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface z-10">
          <div className="flex items-center justify-between w-full md:w-auto">
            <h3 className="text-base md:text-lg font-bold text-primary flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Pick a Location
            </h3>
            <button 
              onClick={onClose} 
              className="text-secondary hover:text-primary p-1.5 rounded-full hover:bg-white/5 transition-colors md:hidden text-2xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <form onSubmit={handleSearchLocation} className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search city, country, or place..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-1.5 text-sm text-primary placeholder-secondary focus:outline-none focus:border-accent transition-colors"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Spinner />
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="bg-surface hover:bg-white/10 text-primary border border-border px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              Search
            </button>
            <button 
              type="button"
              onClick={onClose} 
              className="hidden md:flex text-secondary hover:text-primary p-1.5 rounded-full hover:bg-white/5 transition-colors text-2xl leading-none ml-1"
              aria-label="Close"
            >
              &times;
            </button>
          </form>
        </div>

        {/* Map Container */}
        <div className="flex-1 w-full h-full relative bg-background overflow-hidden min-h-[300px]">
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" style={{ height: '100%', width: '100%' }} />

          {/* Hint Overlay */}
          {!selectedLocation && !isLoading && (
            <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-[400] bg-black/70 border border-white/10 text-white px-3.5 py-1.5 rounded-full pointer-events-none backdrop-blur-md shadow-lg">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <span>📍</span> Click anywhere on the map to set location
              </p>
            </div>
          )}

          {/* Selected Overlay and Confirmation Button */}
          <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 z-[400] flex flex-col items-center gap-3 w-full px-4 max-w-md">
            {isLoading && (
              <div className="bg-black/80 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-full flex items-center gap-2.5 shadow-xl">
                <Spinner />
                <span className="text-xs md:text-sm font-medium">Resolving location name...</span>
              </div>
            )}

            {selectedLocation && !isLoading && (
              <div className="bg-surface/95 backdrop-blur-md border border-border p-3.5 md:p-4 rounded-2xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3 w-full animate-fade-in">
                <div className="text-center md:text-left min-w-0 flex-1">
                  <p className="text-[10px] text-accent uppercase font-bold tracking-wider">Selected Location</p>
                  <p className="text-primary font-bold text-sm md:text-base truncate">{selectedLocation}</p>
                </div>
                <Button onClick={handleConfirm} className="whitespace-nowrap w-full md:w-auto px-5 py-2 text-xs md:text-sm shadow-md">
                  Confirm Location
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
