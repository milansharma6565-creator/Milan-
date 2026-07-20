import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { DriverLocation, Bill } from '../types';
import { MapContainer, TileLayer, Marker as LeafletMarker, Polyline as LeafletPolyline, Popup as LeafletPopup } from 'react-leaflet';
import L from 'leaflet';
import { Map as MapIcon, X, User, Navigation, Clock, MapPin, Locate, Phone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import 'leaflet/dist/leaflet.css';

// Custom Map Pins for Leaflet
const createDriverIcon = (isSelected: boolean, driverName: string) => L.divIcon({
  html: `
    <div class="relative flex items-center justify-center w-12 h-12">
      <div class="absolute w-12 h-12 ${isSelected ? 'bg-indigo-500/30 animate-ping' : 'bg-indigo-500/10'} rounded-full"></div>
      <div class="w-9 h-9 rounded-full ${isSelected ? 'bg-indigo-600 scale-110 shadow-indigo-200' : 'bg-slate-700'} border-2 border-white shadow-lg flex items-center justify-center text-white transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      </div>
      <div class="absolute -bottom-5 bg-slate-900/90 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full border border-slate-700 whitespace-nowrap shadow-md max-w-[80px] truncate">
        ${driverName.split(' ')[0]}
      </div>
    </div>
  `,
  className: '',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

const customerMarkerIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="absolute w-10 h-10 bg-emerald-500/20 rounded-full animate-pulse"></div>
      <div class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-white">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.54 20.193 4 14.99 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 32],
});

interface DriverTrackingAdminProps {
  onClose?: () => void;
  isTab?: boolean;
  franchiseId?: string;
  isSuperAdmin?: boolean;
}

export function DriverTrackingAdmin({ onClose, isTab = false, franchiseId, isSuperAdmin }: DriverTrackingAdminProps) {
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 27.6094, lng: 75.1398 }); // Sikar
  const [zoom, setZoom] = useState(13);
  const [map, setMap] = useState<L.Map | null>(null);

  // Active delivery tracking states for the selected driver
  const [activeBill, setActiveBill] = useState<Bill | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Sync leaflet map center programmatically
  useEffect(() => {
    if (map) {
      map.setView([mapCenter.lat, mapCenter.lng], zoom);
    }
  }, [mapCenter, zoom, map]);

  useEffect(() => {
    // Only show active drivers from last 12 hours
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

    let q;
    if (isSuperAdmin) {
      q = query(
        collection(db, 'driverLocations'),
        where('isActive', '==', true)
      );
    } else {
      q = query(
        collection(db, 'driverLocations'),
        where('isActive', '==', true),
        where('franchiseId', '==', franchiseId)
      );
    }

    return onSnapshot(q, (snapshot) => {
      const locs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lastUpdated: doc.data().lastUpdated?.toDate() || new Date()
      } as DriverLocation))
      .filter(l => l.lastUpdated > twelveHoursAgo)
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
      
      setLocations(locs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'driverLocations'));
  }, [isSuperAdmin, franchiseId]);

  // Selected driver
  const selectedDriver = useMemo(() => {
    return locations.find(l => l.id === selectedDriverId) || null;
  }, [locations, selectedDriverId]);

  // Fetch active bill and live OSRM routing whenever a driver is selected
  useEffect(() => {
    if (!selectedDriver) {
      setActiveBill(null);
      setRouteCoords([]);
      setDestinationCoords(null);
      return;
    }

    // Query active trip/delivery bill for selected driver
    const q = query(
      collection(db, 'bills'),
      where('driverId', '==', selectedDriver.driverId),
      where('status', 'in', ['Assigned', 'Filling', 'On the way', 'Reached'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const activeBillDoc = snapshot.docs.find(doc => {
          const data = doc.data();
          return data.deliveryLocation && data.deliveryLocation.lat && data.deliveryLocation.lng;
        });

        if (activeBillDoc) {
          const billData = { id: activeBillDoc.id, ...activeBillDoc.data() } as Bill;
          setActiveBill(billData);
          const dest = { lat: billData.deliveryLocation!.lat, lng: billData.deliveryLocation!.lng };
          setDestinationCoords(dest);

          // Fetch routing coordinates from public OSRM server
          fetch(`https://router.project-osrm.org/route/v1/driving/${selectedDriver.longitude},${selectedDriver.latitude};${dest.lng},${dest.lat}?overview=full&geometries=geojson`)
            .then(res => res.json())
            .then(routeData => {
              if (routeData.routes && routeData.routes.length > 0) {
                const coords = routeData.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]] as [number, number]);
                setRouteCoords(coords);
              } else {
                // Fallback to straight line
                setRouteCoords([
                  [selectedDriver.latitude, selectedDriver.longitude],
                  [dest.lat, dest.lng]
                ]);
              }
            })
            .catch(err => {
              console.warn("OSRM Route fetch failed, drawing straight line fallback:", err);
              setRouteCoords([
                [selectedDriver.latitude, selectedDriver.longitude],
                [dest.lat, dest.lng]
              ]);
            });
        } else {
          setActiveBill(null);
          setRouteCoords([]);
          setDestinationCoords(null);
        }
      } else {
        setActiveBill(null);
        setRouteCoords([]);
        setDestinationCoords(null);
      }
    }, (err) => {
      console.error("Failed to query active bills for routing:", err);
    });

    return () => unsubscribe();
  }, [selectedDriverId, selectedDriver?.latitude, selectedDriver?.longitude]);

  const handleSelectDriver = (loc: DriverLocation) => {
    setSelectedDriverId(loc.id);
    setMapCenter({ lat: loc.latitude, lng: loc.longitude });
    setZoom(15);
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
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{locations.length} Online Now</span>
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
                    : 'hover:bg-slate-50 text-slate-600'
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
          
          {/* Info panel for selected driver details & active delivery */}
          {selectedDriver && (
            <div className="p-4 bg-slate-50 border-t border-slate-100 max-h-48 overflow-y-auto hidden md:block">
              <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-2">Driver Status</h4>
              <p className="text-sm font-bold text-slate-800">{selectedDriver.driverName}</p>
              {activeBill ? (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Delivering: {activeBill.tankerSize || activeBill.category}
                  </div>
                  <p className="text-xs text-slate-500 font-medium">To: {activeBill.customerName}</p>
                  <p className="text-[10px] text-slate-400 truncate font-mono">Addr: {activeBill.customerAddress}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-medium mt-1">Idle (No active deliveries at the moment)</p>
              )}
            </div>
          )}
        </div>

        {/* Map View */}
        <div className="flex-1 relative order-1 md:order-2 h-full min-h-[300px] bg-slate-100 flex items-center justify-center z-0">
          <MapContainer 
            center={[mapCenter.lat, mapCenter.lng]} 
            zoom={zoom} 
            ref={setMap}
            zoomControl={false}
            style={{ height: '100%', width: '100%' }}
          >
            {/* CARTO Voyager tile layer */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            
            {/* Draw driver markers */}
            {locations.map(loc => (
              <LeafletMarker
                key={loc.id}
                position={[loc.latitude, loc.longitude]}
                icon={createDriverIcon(selectedDriverId === loc.id, loc.driverName)}
                eventHandlers={{
                  click: () => handleSelectDriver(loc)
                }}
              >
                <LeafletPopup>
                  <div className="p-2 min-w-[150px] text-left">
                    <p className="font-bold text-slate-900 text-sm">{loc.driverName}</p>
                    <p className="text-[10px] text-slate-400 font-medium font-mono">Speed: {Math.round((loc as any).speed || 0)} km/h</p>
                    <p className="text-[10px] text-slate-400 font-medium">Updated: {formatDistanceToNow(loc.lastUpdated)} ago</p>
                  </div>
                </LeafletPopup>
              </LeafletMarker>
            ))}

            {/* If selected driver has active delivery destination, draw customer marker */}
            {destinationCoords && (
              <LeafletMarker 
                position={[destinationCoords.lat, destinationCoords.lng]} 
                icon={customerMarkerIcon}
              >
                <LeafletPopup>
                  <div className="p-2 min-w-[150px] text-left">
                    <p className="font-bold text-emerald-700 text-xs uppercase tracking-wider">Delivery Destination</p>
                    <p className="font-bold text-slate-900 text-sm mt-0.5">{activeBill?.customerName}</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium mt-1">{activeBill?.customerAddress}</p>
                  </div>
                </LeafletPopup>
              </LeafletMarker>
            )}

            {/* OSRM Route Polyline */}
            {routeCoords.length > 0 && (
              <LeafletPolyline 
                positions={routeCoords}
                pathOptions={{
                  color: '#4f46e5', // Beautiful indigo polyline
                  weight: 5,
                  opacity: 0.8,
                  lineJoin: 'round',
                  lineCap: 'round'
                }}
              />
            )}
          </MapContainer>

          {/* Map Overlay Floating HUD for selected delivery */}
          {selectedDriver && activeBill && destinationCoords && (
            <div className="absolute top-4 left-4 right-4 md:right-auto md:w-80 bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-100 z-[1000] flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                <Navigation size={20} className="animate-pulse" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-1">Route to Client</p>
                <h4 className="font-bold text-xs text-slate-800 truncate">Driver: {selectedDriver.driverName}</h4>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">Destination: {activeBill.customerName}</p>
              </div>
            </div>
          )}

          {/* Zoom controls */}
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
