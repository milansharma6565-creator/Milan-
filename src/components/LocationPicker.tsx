import React, { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Search, X } from 'lucide-react';

// Fix Leaflet marker icons for production builds
import 'leaflet/dist/leaflet.css';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface LocationPickerProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
  defaultLocation?: { lat: number; lng: number };
}

// Internal component to handle map events
function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Internal component to handle programmatic center updates
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export function LocationPicker({ onLocationSelect, defaultLocation }: LocationPickerProps) {
  const [center, setCenter] = useState<[number, number]>(
    defaultLocation ? [defaultLocation.lat, defaultLocation.lng] : [26.9124, 75.7873]
  );
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(
    defaultLocation ? [defaultLocation.lat, defaultLocation.lng] : null
  );
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<any>(null);
  const [findingMe, setFindingMe] = useState(false);

  // Get user's current location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
          setOrigin(pos);
          setCenter(pos);
        },
        (error) => {
          console.error("Geolocation error:", error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, []);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setMarkerPos([lat, lng]);
    setLoading(true);

    try {
      // Reverse geocoding using Nominatim (OpenStreetMap)
      // Adding email to comply with Nominatim usage policy and potentially avoid blocks
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en&email=milan.sharma6565@gmail.com`
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const address = data.display_name || `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      onLocationSelect(lat, lng, address);
    } catch (err) {
      // Don't log "Failed to fetch" as an error if we have a fallback
      // console.error("Geocoding error:", err);
      const fallbackAddress = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      onLocationSelect(lat, lng, fallbackAddress);
    } finally {
      setLoading(false);
    }
  }, [onLocationSelect]);

  const findMe = () => {
    if (navigator.geolocation) {
      setFindingMe(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
          setOrigin(pos);
          setCenter(pos);
          handleMapClick(pos[0], pos[1]);
          setFindingMe(false);
        },
        (err) => {
          setFindingMe(false);
          console.error("Geolocation error:", err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
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
      // Focus search around origin (if available) or center
      const focusLat = origin ? origin[0] : center[0];
      const focusLng = origin ? origin[1] : center[1];
      
      // Nominatim search API with viewbox for 5km-ish area (approx 0.05 degrees)
      const viewbox = `${focusLng - 0.05},${focusLat + 0.05},${focusLng + 0.05},${focusLat - 0.05}`;
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=0&addressdetails=1&limit=6&accept-language=en&email=milan.sharma6565@gmail.com`
      );
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      setSuggestions(data);
    } catch (err) {
      console.error("Search error handled:", err);
      // Silently fail search for UI but maybe show no results found
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSuggestion = (s: any) => {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lon);
    setCenter([lat, lng]);
    setMarkerPos([lat, lng]);
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
                  <p className="text-[13px] font-bold text-slate-800 truncate">{s.name}</p>
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
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Live Map (5km Delivery Radius)</span>
        </div>
        <button 
          onClick={findMe}
          disabled={findingMe}
          className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {findingMe ? (
            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Navigation size={12} />
          )}
          {findingMe ? 'Finding...' : 'Find My Location'}
        </button>
      </div>

      <div className="w-full h-[400px] rounded-[2rem] overflow-hidden border-4 border-white shadow-2xl relative z-0">
        <MapContainer 
          center={center} 
          zoom={13} 
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <ChangeView center={center} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <MapEvents onMapClick={handleMapClick} />

          {origin && (
            <Circle
              center={origin}
              pathOptions={{
                fillColor: '#3b82f6',
                fillOpacity: 0.1,
                color: '#3b82f6',
                weight: 2,
                dashArray: '5, 10'
              }}
              radius={5000} // 5000 meters = 5km
            />
          )}

          {origin && (
            <Marker position={origin}>
              {/* Optional: custom label or tooltip */}
            </Marker>
          )}

          {markerPos && <Marker position={markerPos} />}
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
