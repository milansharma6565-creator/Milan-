import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Driver } from '../types';
import { MapPin, Navigation, Wifi, WifiOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DriverLiveTrackingProps {
  driverId: string;
}

export function DriverLiveTracking({ driverId }: DriverLiveTrackingProps) {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [location, setLocation] = useState<{ latitude: number, longitude: number, accuracy: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchDriver = async () => {
      try {
        const d = await getDoc(doc(db, 'drivers', driverId));
        if (d.exists()) {
          setDriver({ id: d.id, ...d.data() } as Driver);
        } else {
          setError('Invalid tracking link. Driver not found in system.');
        }
      } catch (err) {
        console.error('Error fetching driver:', err);
        setError('Connection error. Please check your internet and try again.');
      }
    };
    fetchDriver();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [driverId]);

  const updateLocationInFirebase = async (coords: { latitude: number, longitude: number }) => {
    if (!driver) return;
    try {
      const locationData = {
        driverId: driverId,
        driverName: driver.name,
        latitude: coords.latitude,
        longitude: coords.longitude,
        lastUpdated: serverTimestamp(),
        isActive: true
      };
      await setDoc(doc(db, 'driverLocations', driverId), locationData, { merge: true });
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Firebase update error:', err);
    }
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setSuccess(false);
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setError(null);
    setSuccess(false);

    // Initial position request to trigger permission prompt and "wake up" GPS
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsTracking(true);
        setSuccess(true);
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        updateLocationInFirebase(position.coords);

        // Start continuous watching
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            setLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            });
            updateLocationInFirebase(pos.coords);
          },
          (err) => {
            console.error('WatchPosition error:', err);
            // Don't kill tracking on intermittent sync errors, only on permission/fatal
            if (err.code === 1) {
              setError('Permission denied. Please allow location access in your browser settings.');
              stopTracking();
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 5000
          }
        );
      },
      (err) => {
        let msg = 'Failed to get location.';
        if (err.code === 1) msg = 'Location permission denied. Please enable it in settings.';
        else if (err.code === 2) msg = 'Position unavailable. Check your GPS signal.';
        else if (err.code === 3) msg = 'Request timed out. Please try again.';
        setError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (error) {
    return (
      <div className="min-h-screen bg-white p-6 flex flex-col items-center justify-center text-center">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <AlertCircle size={48} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Tracking Error</h1>
        <p className="text-slate-500 mb-6 px-4">{error}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button 
            onClick={startTracking}
            className="bg-blue-600 text-white h-14 rounded-2xl font-bold shadow-lg"
          >
            Retry Tracking
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="text-slate-400 font-bold h-10"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent mb-4" />
        <p className="text-slate-400 font-medium">Initializing Driver Portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-12 flex flex-col">
      <div className="max-w-md mx-auto w-full flex-1">
        <header className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Navigation size={32} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900 pb-2">Driver Portal</h1>
          <p className="text-slate-500 font-medium pb-2">
            Tanker<span className="relative">Wala<span className="absolute top-[90%] left-0 text-[10px] text-slate-400 font-normal whitespace-nowrap tracking-normal normal-case">Powered by Rajhans</span></span>
          </p>
        </header>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center relative overflow-hidden"
        >
          {/* Animated Background Decor */}
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Wifi size={120} />
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-1">Welcome, {driver.name}</h2>
          <p className="text-slate-500 mb-8 font-medium">Start sharing your location for active duty.</p>

          <div className="flex flex-col gap-6 relative z-10">
            {!isTracking ? (
              <button
                onClick={startTracking}
                className="w-full bg-blue-600 text-white h-20 rounded-2xl text-lg font-bold flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-xl shadow-blue-200"
              >
                <div className="flex items-center gap-2">
                  <MapPin size={24} />
                  <span>START DUTY</span>
                </div>
                <span className="text-[10px] opacity-70 uppercase tracking-widest">Share Live Location</span>
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 p-6 rounded-3xl border border-green-100">
                  <div className="flex items-center justify-center gap-2 text-green-600 font-bold mb-4">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    TRACKING LIVE
                  </div>
                  
                  <div className="flex flex-col items-center gap-2">
                    <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-green-200">
                      <p className="text-xs text-slate-600 font-mono flex items-center gap-2">
                        <MapPin size={12} />
                        {location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'Wait for GPS...'}
                      </p>
                    </div>
                    {lastUpdate && (
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <CheckCircle2 size={10} className="text-green-500" />
                        Last synced: {lastUpdate.toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={stopTracking}
                  className="w-full bg-slate-100 text-slate-500 h-14 rounded-2xl text-sm font-bold active:scale-95 transition-all"
                >
                  Stop Sharing
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="bg-slate-50 p-4 rounded-2xl flex flex-col items-center border border-slate-100">
                {isTracking ? <Wifi size={20} className="text-green-500 mb-2" /> : <WifiOff size={20} className="text-slate-300 mb-2" />}
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Connection</span>
                <span className={`text-sm font-bold ${isTracking ? 'text-green-600' : 'text-slate-400'}`}>
                  {isTracking ? 'Stable' : 'Offline'}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl flex flex-col items-center border border-slate-100">
                <Navigation size={20} className="text-blue-500 mb-2" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GPS Accuracy</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-bold text-blue-600">
                    {location?.accuracy ? Math.round(location.accuracy) : '-'}
                  </span>
                  <span className="text-[10px] text-blue-400 font-bold">m</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mt-8 bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={20} className="text-blue-400" />
              <h3 className="font-bold">Important Rules</h3>
            </div>
            <ul className="text-xs text-slate-400 space-y-3">
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0">1</span>
                Keep this page open while you are on duty.
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0">2</span>
                Make sure your GPS is turned on in phone settings.
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0">3</span>
                If tracking stops, please refresh the page and START again.
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0">4</span>
                Turn off Battery Saver for better GPS accuracy.
              </li>
            </ul>
          </div>
          <Navigation className="absolute -right-8 -bottom-8 w-32 h-32 text-slate-800 opacity-30 rotate-12" />
        </div>
      </div>
      
      <footer className="mt-8 text-center">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Safety • Service • Reliability</p>
      </footer>
    </div>
  );
}

