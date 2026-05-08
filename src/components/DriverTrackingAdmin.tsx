import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { DriverLocation } from '../types';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, X, User, Navigation, Clock, MapPin, Locate } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Fix for default Leaflet marker icons in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface DriverTrackingAdminProps {
  onClose?: () => void;
  isTab?: boolean;
}

// Component to handle map centering
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

export function DriverTrackingAdmin({ onClose, isTab = false }: DriverTrackingAdminProps) {
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([27.6094, 75.1398]); // Sikar
  const [zoom, setZoom] = useState(13);

  useEffect(() => {
    // Only show active drivers from last 12 hours
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

    const q = query(
      collection(db, 'driverLocations'),
      where('isActive', '==', true)
    );

    return onSnapshot(q, (snapshot) => {
      const locs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lastUpdated: doc.data().lastUpdated?.toDate() || new Date()
      } as DriverLocation))
      .filter(l => l.lastUpdated > twelveHoursAgo)
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
      
      setLocations(locs);
    });
  }, []);

  const handleSelectDriver = (loc: DriverLocation) => {
    setSelectedDriverId(loc.id);
    setMapCenter([loc.latitude, loc.longitude]);
    setZoom(16);
  };

  const containerClasses = isTab 
    ? "h-[calc(100vh-140px)] flex flex-col bg-white rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-sm"
    : "fixed inset-0 bg-white z-[200] flex flex-col";

  return (
    <div className={containerClasses}>
      <header className="bg-white border-b border-slate-100 p-4 flex items-center justify-between shadow-sm z-[1000]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <MapIcon size={24} />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-slate-900">Live Driver Tracking</h2>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">{locations.length} Online Now</span>
            </div>
          </div>
        </div>
        {!isTab && (
          <button 
            onClick={onClose}
            className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </header>

      <div className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar overlay - Mobile: Bottom, Desktop: Left */}
        <div className="w-full md:w-80 bg-white/95 backdrop-blur-xl border-b md:border-b-0 md:border-r border-slate-100 flex flex-col order-2 md:order-1 h-64 md:h-auto overflow-hidden">
          <div className="p-4 border-b border-slate-50">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Drivers</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide text-left">
            {locations.map(loc => (
              <button
                key={loc.id}
                onClick={() => handleSelectDriver(loc)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                  selectedDriverId === loc.id 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                    : 'hover:bg-slate-50 text-slate-600 whitespace-left'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  selectedDriverId === loc.id ? 'bg-indigo-500' : 'bg-white shadow-sm border border-slate-100'
                }`}>
                  <User size={20} className={selectedDriverId === loc.id ? 'text-white' : 'text-indigo-600'} />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{loc.driverName}</p>
                  <div className="flex items-center gap-1">
                    <Clock size={10} className={selectedDriverId === loc.id ? 'text-indigo-200' : 'text-slate-400'} />
                    <p className={`text-[10px] font-medium ${selectedDriverId === loc.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                      {formatDistanceToNow(loc.lastUpdated)} ago
                    </p>
                  </div>
                </div>
                <Navigation size={14} className={selectedDriverId === loc.id ? 'text-white animate-pulse' : 'text-slate-300'} />
              </button>
            ))}
            {locations.length === 0 && (
              <div className="py-12 text-center">
                <Locate size={32} className="mx-auto text-slate-200 mb-2" />
                <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No Active Drivers</p>
              </div>
            )}
          </div>
        </div>

        {/* Map View */}
        <div className="flex-1 relative order-1 md:order-2 h-full min-h-[300px]">
          <MapContainer 
            center={mapCenter} 
            zoom={zoom} 
            style={{ height: '100%', width: '100%', zIndex: 1 }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ChangeView center={mapCenter} zoom={zoom} />
            
            {locations.map(loc => (
              <Marker 
                key={loc.id} 
                position={[loc.latitude, loc.longitude]}
                eventHandlers={{
                  click: () => setSelectedDriverId(loc.id),
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[150px]">
                    <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2 mb-2 font-display">
                      {loc.driverName}
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock size={12} className="text-indigo-500" />
                        <span className="font-medium">Active {formatDistanceToNow(loc.lastUpdated)} ago</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <MapPin size={12} className="text-slate-400" />
                        <span className="font-mono">{loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}</span>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Map Controls */}
          <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-2">
            <button 
              onClick={() => setZoom(z => Math.min(z + 1, 19))}
              className="w-12 h-12 bg-white rounded-2xl shadow-xl border border-slate-100 flex items-center justify-center text-slate-600 font-bold text-xl hover:bg-slate-50 active:scale-95 transition-all"
            >
              +
            </button>
            <button 
              onClick={() => setZoom(z => Math.max(z - 1, 3))}
              className="w-12 h-12 bg-white rounded-2xl shadow-xl border border-slate-100 flex items-center justify-center text-slate-600 font-bold text-xl hover:bg-slate-50 active:scale-95 transition-all"
            >
              -
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
