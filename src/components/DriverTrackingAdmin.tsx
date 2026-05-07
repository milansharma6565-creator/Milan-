import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { DriverLocation } from '../types';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { Map as MapIcon, X, User, Navigation, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY.length > 20 && API_KEY !== 'YOUR_API_KEY';

interface DriverTrackingAdminProps {
  onClose: () => void;
}

export function DriverTrackingAdmin({ onClose }: DriverTrackingAdminProps) {
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    // Only show drivers active in the last 24 hours
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    
    const q = query(
      collection(db, 'driverLocations'),
      where('isActive', '==', true)
    );

    return onSnapshot(q, (snapshot) => {
      const locs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lastUpdated: doc.data().lastUpdated?.toDate() || new Date()
      } as DriverLocation));
      setLocations(locs);
    });
  }, []);

  if (!hasValidKey) {
    return (
      <div className="fixed inset-0 bg-white z-[200] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <div className="bg-amber-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
            <MapIcon size={40} className="text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Google Maps API Key Required</h2>
          <p className="text-slate-500 mb-8">Live tracking requires a Google Maps API Key to be configured in settings.</p>
          
          <div className="bg-slate-50 p-6 rounded-3xl text-left text-sm space-y-4 mb-8">
            <p><strong>To enable tracking:</strong></p>
            <ol className="list-decimal list-inside space-y-2 text-slate-600">
              <li>Open <strong>Settings</strong> (⚙️ gear icon)</li>
              <li>Go to <strong>Secrets</strong></li>
              <li>Add <code>VITE_GOOGLE_MAPS_PLATFORM_KEY</code></li>
            </ol>
          </div>
          
          <button 
            onClick={onClose}
            className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold shadow-lg"
          >
            Close Map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-[200] flex flex-col">
      <header className="bg-white border-b border-slate-100 p-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
            <Navigation size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Live Driver Tracking</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              {locations.length} Active {locations.length === 1 ? 'Driver' : 'Drivers'}
            </p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={20} />
        </button>
      </header>

      <div className="flex-1 relative bg-slate-100">
        <APIProvider apiKey={API_KEY} version="weekly">
          <Map
            defaultCenter={{ lat: 27.6094, lng: 75.1398 }} // Center on Sikar
            defaultZoom={12}
            mapId="6c085f3969ef9f7a" // Using a generic demo map ID
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
            disableDefaultUI={false}
          >
            {locations.map((loc) => (
              <DriverMarker 
                key={loc.id} 
                location={loc} 
                isSelected={selectedDriverId === loc.id}
                onSelect={() => setSelectedDriverId(loc.id === selectedDriverId ? null : loc.id)}
              />
            ))}
          </Map>
        </APIProvider>

        {/* Sidebar overlay for driver list */}
        <div className="absolute top-4 left-4 w-64 max-h-[80%] overflow-y-auto bg-white/90 backdrop-blur-xl rounded-3xl p-4 shadow-2xl border border-white/50 hidden md:block">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ml-1">On Duty Drivers</h3>
          <div className="space-y-3">
            {locations.map(loc => (
              <button 
                key={loc.id}
                onClick={() => setSelectedDriverId(loc.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${selectedDriverId === loc.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-white hover:bg-slate-50'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedDriverId === loc.id ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                  <User size={20} />
                </div>
                <div className="text-left flex-1 overflow-hidden">
                  <p className="text-sm font-bold truncate">{loc.driverName}</p>
                  <p className={`text-[10px] ${selectedDriverId === loc.id ? 'text-blue-100' : 'text-slate-400'}`}>
                    Updated {formatDistanceToNow(loc.lastUpdated)} ago
                  </p>
                </div>
              </button>
            ))}
            {locations.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">No active tracking</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DriverMarkerProps {
  location: DriverLocation;
  isSelected: boolean;
  onSelect: () => void;
}

const DriverMarker: React.FC<DriverMarkerProps> = ({ location, isSelected, onSelect }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: location.latitude, lng: location.longitude }}
        onClick={onSelect}
      >
        <div className="relative group">
          <motion.div 
            animate={{ scale: isSelected ? 1.2 : 1 }}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xl border-2 border-white transition-all ${isSelected ? 'bg-blue-600 text-white z-50' : 'bg-white text-blue-600 hover:bg-blue-50'}`}
          >
            <Navigation size={20} className={isSelected ? 'animate-pulse' : ''} />
          </motion.div>
          {!isSelected && (
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded-lg shadow-md border border-slate-100 whitespace-nowrap hidden group-hover:block transition-all">
              <span className="text-[10px] font-bold text-slate-700">{location.driverName}</span>
            </div>
          )}
        </div>
      </AdvancedMarker>

      {isSelected && (
        <InfoWindow anchor={marker} onCloseClick={onSelect}>
          <div className="p-1 min-w-[150px]">
            <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2 mb-2">{location.driverName}</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock size={12} />
                <span>Active {formatDistanceToNow(location.lastUpdated)} ago</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <MapPin size={12} className="text-slate-400" />
                <span>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</span>
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MapPin({ size, className }: { size: number, className: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  );
}
