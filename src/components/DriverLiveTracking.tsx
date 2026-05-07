import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Driver } from '../types';
import { MapPin, Navigation, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface DriverLiveTrackingProps {
  driverId: string;
}

export function DriverLiveTracking({ driverId }: DriverLiveTrackingProps) {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const fetchDriver = async () => {
      try {
        console.log('Fetching driver:', driverId);
        const d = await getDoc(doc(db, 'drivers', driverId));
        if (d.exists()) {
          setDriver({ id: d.id, ...d.data() } as Driver);
        } else {
          console.error('Driver document does not exist:', driverId);
          setError('Invalid tracking link. Driver not found in system.');
        }
      } catch (err) {
        console.error('Error fetching driver:', err);
        setError('Connection error. Please check your internet and try again.');
      }
    };
    fetchDriver();
  }, [driverId]);

  const updateLocationInFirebase = async (coords: GeolocationCoordinates) => {
    if (!driver) {
      console.warn('Skipping update: driver not loaded');
      return;
    }
    try {
      const locationData = {
        driverId: driverId,
        driverName: driver.name,
        latitude: coords.latitude,
        longitude: coords.longitude,
        lastUpdated: serverTimestamp(),
        isActive: true
      };
      console.log('Updating location to Firebase:', locationData);
      await setDoc(doc(db, 'driverLocations', driverId), locationData, { merge: true });
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Firebase update error:', err);
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setIsTracking(true);
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation(position.coords);
        updateLocationInFirebase(position.coords);
      },
      (err) => {
        setError(`Permission denied. Please allow location access. (${err.message})`);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-white p-6 flex flex-col items-center justify-center text-center">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <AlertCircle size={48} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Tracking Error</h1>
        <p className="text-slate-500 mb-6">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-12">
      <div className="max-w-md mx-auto">
        <header className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Navigation size={32} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Driver Portal</h1>
          <p className="text-slate-500">Rajhans steel and Water</p>
        </header>

        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Hello, {driver.name}</h2>
          <p className="text-slate-500 mb-8 font-medium">Please share your location for active duty.</p>

          <div className="flex flex-col gap-6">
            {!isTracking ? (
              <button
                onClick={startTracking}
                className="w-full bg-blue-600 text-white h-16 rounded-2xl text-lg font-bold flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg shadow-blue-200"
              >
                <MapPin size={24} />
                Start Sharing Location
              </button>
            ) : (
              <div className="bg-green-50 p-6 rounded-3xl border border-green-100">
                <div className="flex items-center justify-center gap-2 text-green-600 font-bold mb-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Live Location Sharing
                </div>
                {location && (
                  <p className="text-xs text-slate-500 font-mono">
                    {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  </p>
                )}
                {lastUpdate && (
                  <p className="text-[10px] text-slate-400 mt-2">
                    Last sync: {lastUpdate.toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-slate-50 p-4 rounded-2xl flex flex-col items-center">
                {isTracking ? <Wifi size={20} className="text-green-500 mb-2" /> : <WifiOff size={20} className="text-slate-300 mb-2" />}
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
                <span className={`text-sm font-bold ${isTracking ? 'text-green-600' : 'text-slate-400'}`}>
                  {isTracking ? 'Active' : 'Offline'}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl flex flex-col items-center">
                <Navigation size={20} className="text-blue-500 mb-2" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Accuracy</span>
                <span className="text-sm font-bold text-blue-600">
                  {location?.accuracy ? `${Math.round(location.accuracy)}m` : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-blue-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="font-bold mb-2">Important Instructions</h3>
            <ul className="text-xs text-blue-100 space-y-2 list-disc list-inside opacity-90 leading-relaxed">
              <li>Keep this page open while you are on duty.</li>
              <li>Make sure your GPS is turned on in settings.</li>
              <li>If tracking stops, please refresh the page.</li>
              <li>Tracking will stop automatically when you close this tab.</li>
            </ul>
          </div>
          <Navigation className="absolute -right-8 -bottom-8 w-32 h-32 text-blue-800 opacity-50 rotate-12" />
        </div>
      </div>
    </div>
  );
}
