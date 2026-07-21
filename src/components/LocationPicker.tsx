import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker as LeafletMarker, Circle as LeafletCircle, useMapEvents, useMap as useLeafletMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Search, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Custom modern Leaflet Markers using HTML DivIcons for reliable look and no asset 404s
const originIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
      <div class="relative w-8 h-8 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(45deg);"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      </div>
    </div>
  `,
  className: 'custom-origin-icon',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const deliveryIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="relative w-10 h-10 bg-rose-600 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.54 20.193 4 14.99 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
    </div>
  `,
  className: 'custom-delivery-icon',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

interface LocationPickerProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
  defaultLocation?: { lat: number; lng: number };
}

// Leaflet internal component to handle programmatic center updates
function LeafletChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useLeafletMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// Leaflet click and zoom handler component
function LeafletMapEvents({ 
  onMapClick, 
  onZoomChange 
}: { 
  onMapClick: (lat: number, lng: number) => void;
  onZoomChange: (zoom: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
    zoomend() {
      onZoomChange(map.getZoom());
    }
  });
  return null;
}

export function LocationPicker({ onLocationSelect, defaultLocation }: LocationPickerProps) {
  const [center, setCenter] = useState<{ lat: number; lng: number }>(
    defaultLocation ? { lat: defaultLocation.lat, lng: defaultLocation.lng } : { lat: 26.9124, lng: 75.7873 }
  );
  const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number } | null>(
    defaultLocation ? { lat: defaultLocation.lat, lng: defaultLocation.lng } : null
  );
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<any>(null);
  const [findingMe, setFindingMe] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(13);

  // Get user's current location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setOrigin(pos);
          setCenter(pos);
          setZoom(15); // Set closer zoom for their real location on load
          setLocationError(null);
        },
        (error) => {
          console.warn("Geolocation on-mount notice (safe fallback used):", error?.message || "Unavailable");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 } // Force fresh GPS coordinates without cache on mount
      );
    }
  }, []);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setMarkerPos({ lat, lng });
    setLoading(true);

    try {
      let addressStr = '';
      
      // Fetch from OSM Nominatim reverse geocoder (strictly Google-free!)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=en&email=milan.sharma6565@gmail.com`
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data.address) {
        const a = data.address;
        const parts = [
          a.house_number, a.road, a.neighbourhood, a.suburb, 
          a.village || a.town || a.city, a.postcode
        ].filter(x => !!x);
        addressStr = `📍 Exact GPS Pin [${lat.toFixed(5)}, ${lng.toFixed(5)}]${parts.length > 0 ? ' ~ ' + parts.join(', ') : ''}`;
      }
      if (!addressStr) {
        addressStr = `📍 Exact GPS Pin [${lat.toFixed(5)}, ${lng.toFixed(5)}] ~ ${data.display_name}`;
      }

      if (!addressStr) {
        addressStr = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }

      onLocationSelect(lat, lng, addressStr);
    } catch (err) {
      const fallbackAddress = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      onLocationSelect(lat, lng, fallbackAddress);
    } finally {
      setLoading(false);
    }
  }, [onLocationSelect]);

  const findMe = () => {
    if (navigator.geolocation) {
      setFindingMe(true);
      setLocationError(null);
      
      // Attempt highly precise GPS query directly from hardware (maximumAge: 0 forces fresh search)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setOrigin(pos);
          setCenter(pos);
          setZoom(17); // Street level zoom (Google Maps behavior)
          handleMapClick(pos.lat, pos.lng);
          setFindingMe(false);
          setLocationError(null);
        },
        (err) => {
          console.warn("First precise GPS attempt failed, trying fallback standard accuracy:", err?.message);
          // If pure high-accuracy direct satellite search fails or times out, fall back to cellular/IP/cached position
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
              setOrigin(pos);
              setCenter(pos);
              setZoom(16); // High specificity zoom
              handleMapClick(pos.lat, pos.lng);
              setFindingMe(false);
              setLocationError(null);
            },
            (err2) => {
              setFindingMe(false);
              console.error("Geolocation fallback also failed:", err2?.message);
              
              let msg = "Could not access precise GPS. Please type your location above or select directly on the map.";
              if (err2.code === 1) {
                msg = "Location permission denied. Please allow location access or type your location above.";
              } else if (err2.code === 2) {
                msg = "Position unavailable. Please type your location above or click directly on the map.";
              } else if (err2.code === 3) {
                msg = "Location request timed out. Please select directly on the map.";
              }
              setLocationError(msg);
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 15000 }
          );
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    } else {
      setLocationError("Geolocation is not supported by your browser.");
    }
  };

  const handleSearchInputChange = (query: string) => {
    setSearchQuery(query);
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(() => {
      performSearch(query);
    }, 500);

    setSearchTimeout(timeout);
  };

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      // OSM Nominatim Geocoding API Search (strictly Google-free!)
      const focusLat = origin ? origin.lat : center.lat;
      const focusLng = origin ? origin.lng : center.lng;
      const viewbox = `${focusLng - 0.05},${focusLat + 0.05},${focusLng + 0.05},${focusLat - 0.05}`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=0&addressdetails=1&limit=6&accept-language=en&email=milan.sharma6565@gmail.com`
      );
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      const data = await response.json();
      setSuggestions(data);
    } catch (err) {
      console.error("Search error handled:", err instanceof Error ? err.message : String(err));
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSuggestion = (s: any) => {
    const lat = parseFloat(s.lat || s.latitude);
    const lng = parseFloat(s.lon || s.lng || s.longitude);
    setCenter({ lat, lng });
    setMarkerPos({ lat, lng });
    setZoom(17); // Zoom in close for precise marker alignment
    setSearchQuery(s.display_name);
    setSuggestions([]);
    onLocationSelect(lat, lng, s.display_name);
  };

  return (
    <div className="w-full mt-4 flex flex-col gap-3">
      {/* Search Bar */}
      <div className="relative group px-1">
        <div className="relative flex items-center">
          <div className="absolute left-4 text-slate-400 group-focus-within:text-blue-500 transition-colors">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Search delivery location (e.g. Near My City)..."
            value={searchQuery}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            className="w-full bg-white border-2 border-slate-100 focus:border-blue-500 rounded-2xl py-3 pl-11 pr-12 text-sm font-medium placeholder:text-slate-400 shadow-sm transition-all outline-none"
          />
          {searchQuery && (
            <button 
              onClick={() => { setSearchQuery(''); setSuggestions([]); }}
              className="absolute right-4 p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Suggestions Dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute top-full left-1 right-1 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[2000] animate-in fade-in slide-in-from-top-2 duration-200">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => selectSuggestion(s)}
                className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-start gap-3 transition-colors border-b border-slate-50 last:border-0"
              >
                <div className="mt-1 flex-shrink-0 w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                  <MapPin size={12} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-slate-800 truncate">{s.name || s.display_name.split(',')[0]}</p>
                  <p className="text-[11px] text-slate-500 truncate leading-relaxed">{s.display_name}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {isSearching && searchQuery.length >= 3 && (
          <div className="absolute top-full left-1 right-1 mt-2 bg-white rounded-2xl p-4 shadow-xl border border-slate-100 z-[2000] flex items-center justify-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-400">Searching nearby...</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            OpenStreetMap Engine (5km Delivery Radius)
          </span>
        </div>
        <button 
          onClick={findMe}
          disabled={findingMe}
          className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50 font-display"
        >
          {findingMe ? (
            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Navigation size={12} />
          )}
          {findingMe ? 'Finding...' : 'Find My Location'}
        </button>
      </div>

      {locationError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-3 text-xs font-medium flex items-center gap-2 px-4 animate-in fade-in duration-200">
          <span className="shrink-0 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
          <span>{locationError}</span>
        </div>
      )}

      <div className="w-full h-[400px] rounded-[2rem] overflow-hidden border-4 border-white shadow-2xl relative z-0 bg-slate-50 flex items-center justify-center">
        <MapContainer 
          center={[center.lat, center.lng]} 
          zoom={zoom} 
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <LeafletChangeView center={[center.lat, center.lng]} zoom={zoom} />
          
          {/* CARTO Voyager maps tile layer for beautiful logistics layout */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <LeafletMapEvents onMapClick={handleMapClick} onZoomChange={setZoom} />

          {origin && (
            <LeafletCircle
              center={[origin.lat, origin.lng]}
              pathOptions={{
                fillColor: '#3b82f6',
                fillOpacity: 0.1,
                color: '#3b82f6',
                weight: 2,
                dashArray: '5, 10'
              }}
              radius={5000} // 5km delivery range limit
            />
          )}

          {origin && (
            <LeafletMarker position={[origin.lat, origin.lng]} icon={originIcon} />
          )}

          {markerPos && (
            <LeafletMarker position={[markerPos.lat, markerPos.lng]} icon={deliveryIcon} />
          )}
        </MapContainer>

        {loading && (
          <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px] z-[1000] flex items-center justify-center">
            <div className="bg-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-blue-900">Identifying Address...</span>
            </div>
          </div>
        )}
      </div>
      
      <p className="text-[10px] text-slate-400 font-medium px-2 text-center">
        Click anywhere on the map to set delivery point. Blue circle represents 5km delivery range from pickup.
      </p>
    </div>
  );
}
