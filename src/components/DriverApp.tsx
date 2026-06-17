import { QRCodeSVG } from 'qrcode.react';
import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Navigation, 
  Clock, 
  History, 
  Settings, 
  Bell, 
  BellOff,
  LogOut,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Truck,
  Camera,
  Plus,
  Phone,
  ClipboardList,
  Mail,
  Lock,
  FlaskConical as Flask
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, handleFirestoreError, OperationType, onAuthStateChanged, signInWithPopup, googleProvider, safeString } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc, 
  setDoc,
  Timestamp,
  orderBy,
  getDocs,
  getDoc,
  serverTimestamp,
  addDoc,
  limit
} from 'firebase/firestore';
import { format } from 'date-fns';
import { formatCurrency } from '../constants';
import { InstallPWA } from './InstallPWA';
import { Logo } from './Logo';
import { ThermalInvoice } from './ThermalInvoice';
import { ledgerAutomation } from '../services/ledgerAutomation';

import { WishesOverlay } from './WishesOverlay';

export function DriverApp() {
  const [driver, setDriver] = useState<any>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [trips, setTrips] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'HOME' | 'HISTORY' | 'ALERTS' | 'DIESEL' | 'FUEL_HISTORY' | 'CANS'>('HOME');
  const [tractors, setTractors] = useState<any[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [fillingTime, setFillingTime] = useState<number>(() => {
    const saved = localStorage.getItem('defaultFillingTime');
    return saved ? Number(saved) : 15;
  }); // minutes
  const [fillingActive, setFillingActive] = useState(false);
  const [fillingRemaining, setFillingRemaining] = useState(0);
  const [isSirenActive, setIsSirenActive] = useState(false);
  const watchId = useRef<number | null>(null);
  const timerInterval = useRef<any>(null);
  const sirenRef = useRef<{ oscillator: OscillatorNode, audioContext: AudioContext } | null>(null);
  
  const [isLogged, setIsLogged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Diesel Entry State
  const [showDieselModal, setShowDieselModal] = useState(false);
  const [dieselAmount, setDieselAmount] = useState('');
  const [dieselLiters, setDieselLiters] = useState('');
  const [selectedTractorId, setSelectedTractorId] = useState('');
  const [photoZero, setPhotoZero] = useState<string>('');
  const [photoAmount, setPhotoAmount] = useState<string>('');
  const [dieselSending, setDieselSending] = useState(false);
  const [dieselHistory, setDieselHistory] = useState<any[]>([]);
  const [lastDeliveredTrip, setLastDeliveredTrip] = useState<any>(null);
  const [nextDayCansRequests, setNextDayCansRequests] = useState<any[]>([]);

  // Automatic Audio/Voice Announcements for Hands-free Driving
  const [speakAnnouncements, setSpeakAnnouncements] = useState<boolean>(() => {
    return localStorage.getItem('driverSpeakAnnouncements') === 'true';
  });
  const prevTripStatusRef = useRef<string>('');
  const prevTripIdRef = useRef<string>('');

  useEffect(() => {
    localStorage.setItem('driverSpeakAnnouncements', String(speakAnnouncements));
  }, [speakAnnouncements]);

  const playAnnouncement = (text: string) => {
    if (!speakAnnouncements) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'hi-IN';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    if (!activeTrip) {
      if (prevTripIdRef.current) {
        playAnnouncement("Aapka active trip samapt ho gaya hai. Dhanyawad!");
        prevTripIdRef.current = '';
        prevTripStatusRef.current = '';
      }
      return;
    }

    const currentStatus = activeTrip.status;
    const currentId = activeTrip.id;

    if (currentId !== prevTripIdRef.current) {
      playAnnouncement(`Naya order mila hai. ${activeTrip.customerName} ke liye delivery karein.`);
      prevTripIdRef.current = currentId;
      prevTripStatusRef.current = currentStatus;
    } else if (currentStatus !== prevTripStatusRef.current) {
      if (currentStatus === 'On the way') {
        playAnnouncement(`Trip shuru ho chuka hai. On-the-way mark kiya gaya.`);
      } else if (currentStatus === 'Reached') {
        playAnnouncement(`Aap location par pahunch gaye hain.`);
      } else if (currentStatus === 'Delivered') {
        playAnnouncement(`Order delivered ho gaya hai.`);
      }
      prevTripStatusRef.current = currentStatus;
    }
  }, [activeTrip, speakAnnouncements]);

  // QR & Bill Modals
  const [showQR, setShowQR] = useState(false);
  const [qrAmount, setQrAmount] = useState(0);
  const [qrBillNumber, setQrBillNumber] = useState('');
  const [viewingBill, setViewingBill] = useState<any>(null);

  const handleViewBill = async (billId: string) => {
    if (!billId) return;
    setLoading(true);
    try {
      const billSnap = await getDoc(doc(db, 'bills', billId));
      if (billSnap.exists()) {
        setViewingBill({ id: billSnap.id, ...billSnap.data() });
      } else {
        alert('Bill detail not found.');
      }
    } catch (e) {
      console.error('Error fetching bill:', e);
      alert('Failed to load bill.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Siren removed from driver side for "Reached" status as per user request
    if (activeTrip?.status !== 'Reached') {
      stopSiren();
    }
  }, [activeTrip?.status]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back' | 'zero' | 'amt') => {
    const file = e.target.files?.[0];
    if (!file) return;
    let reader: any;
    try {
      reader = new FileReader();
    } catch (e: any) {
      console.error("FileReader constructor failed:", e?.message || String(e));
      return;
    }
    reader.onload = (readerEvent) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // Compress to 60% quality JPEG
        
        if (side === 'zero') setPhotoZero(dataUrl);
        else if (side === 'amt') setPhotoAmount(dataUrl);
      };
      img.src = readerEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const [emailInput, setEmailInput] = useState('');
  const [pinInput, setPinInput] = useState('');

  const handleDriverEmailBypass = async (email: string, pinToCheck?: string) => {
    setLoading(true);
    setError('');
    try {
      const q = query(collection(db, 'drivers'), where('email', '==', email.toLowerCase().trim()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const dData = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
        
        // Match PIN if provided (during fresh login)
        if (pinToCheck !== undefined) {
          const storedPin = dData.pin ? String(dData.pin).trim() : '';
          const enteredPin = String(pinToCheck).trim();
          if (storedPin && storedPin !== enteredPin) {
            setError('Unauthorized: Incorrect 4-digit Login PIN.');
            setIsLogged(false);
            return;
          }
        }

        if (dData.status === 'Active') {
          setDriver(dData);
          setIsLogged(true);
          localStorage.setItem('driverSavedEmail', dData.email.toLowerCase().trim());
          localStorage.setItem('isDriverLoggedIn', 'true');
        } else if (dData.status === 'pending') {
          setError('Your registration is pending approval.');
          setIsLogged(false);
        } else {
          setError('Account deactivated. Contact Admin.');
          setIsLogged(false);
        }
      } else {
        setError('Unauthorized: Entered email is not registered.');
        setIsLogged(false);
        localStorage.removeItem('driverSavedEmail');
        localStorage.removeItem('isDriverLoggedIn');
      }
    } catch (e) {
      setError('Failed to fetch driver profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedEmail = localStorage.getItem('driverSavedEmail');
    if (savedEmail) {
      handleDriverEmailBypass(savedEmail);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLogged || !driver?.id) return;

    // Fetch active trip
    const qActive = query(
      collection(db, 'trips'),
      where('driverId', '==', driver.id),
      where('status', 'in', ['Active', 'Filling', 'On the way', 'Reached'])
    );
    const unsubActive = onSnapshot(qActive, (snap) => {
      setActiveTrip(snap.docs[0]?.data() ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
    });

    // Fetch past trips (Current Day Only for history)
    const qHistory = query(
      collection(db, 'trips'),
      where('driverId', '==', driver.id),
      where('status', '==', 'Delivered'),
      orderBy('completedAt', 'desc')
    );
    const unsubHistory = onSnapshot(qHistory, (snap) => {
      // Filter for today's trips in the listener
      const currentDayStr = format(new Date(), 'yyyy-MM-dd');
      const allTrips = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((t: any) => {
          if (!t.completedAt) return false;
          const completedDate = t.completedAt.toDate ? t.completedAt.toDate() : new Date(t.completedAt);
          return format(completedDate, 'yyyy-MM-dd') === currentDayStr;
        });
      setTrips(allTrips);
    });

    // Fetch Tractors for diesel entry
    const unsubTractors = onSnapshot(collection(db, 'tractors'), (snap) => {
      setTractors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Listen for next day can requests from monthly customers
    const unsubCans = onSnapshot(query(collection(db, 'customers'), where('nextDayCans', '>', 0), where('franchiseId', '==', driver.franchiseId || 'legacy-rajhans')), (snap) => {
      setNextDayCansRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubActive();
      unsubHistory();
      unsubTractors();
      unsubCans();
    };
  }, [isLogged, driver?.id]);

  useEffect(() => {
    if (!isLogged || !driver?.id) return;

    const unsubDriverDoc = onSnapshot(doc(db, 'drivers', driver.id), (snap) => {
      if (!snap.exists()) {
        // Driver wiped or deleted! Terminate session and kick out instantly.
        setDriver(null);
        setIsLogged(false);
        localStorage.removeItem('driverSavedEmail');
        localStorage.removeItem('isDriverLoggedIn');
        auth.signOut();
        alert("Your driver account was deleted or reset. Please contact admin.");
      } else {
        const dData = snap.data();
        if (dData.status !== 'Active') {
          // Status updated! Log out.
          setDriver(null);
          setIsLogged(false);
          localStorage.removeItem('driverSavedEmail');
          localStorage.removeItem('isDriverLoggedIn');
          auth.signOut();
          alert("Your account is no longer Active. Contact admin.");
        }
      }
    }, (error) => {
      console.warn("Driver status check failed:", error);
    });

    return () => unsubDriverDoc();
  }, [isLogged, driver?.id]);

  useEffect(() => {
    if (driver?.id) {
      const q = query(
        collection(db, 'dieselRequests'),
        where('driverId', '==', driver.id)
      );
      return onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort in memory by createdAt descending
        docs.sort((a: any, b: any) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });
        setDieselHistory(docs.slice(0, 10)); // Take top 10
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'dieselRequests'));
    }
  }, [driver?.id]);

  useEffect(() => {
    if (trips.length > 0) {
      const delivered = trips.filter(t => t.status === 'Delivered').sort((a, b) => {
        const dateA = a.completedAt?.toDate?.()?.getTime() || 0;
        const dateB = b.completedAt?.toDate?.()?.getTime() || 0;
        return dateB - dateA;
      })[0];
      setLastDeliveredTrip(delivered);
    }
  }, [trips]);

  // Location Tracking Logic - Always track when logged in
  useEffect(() => {
    if (isLogged && driver?.id && !watchId.current) {
      startTracking();
    } else if (!isLogged && watchId.current) {
      stopTracking();
    }
  }, [isLogged, driver?.id]);

  const startTracking = () => {
    if (!navigator.geolocation) return;
    
    setIsTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, speed } = pos.coords;
        if (driver?.id) {
          try {
            await setDoc(doc(db, 'driverLocations', driver.id), {
              driverId: driver.id,
              driverName: driver?.name || 'Driver',
              latitude,
              longitude,
              speed: (speed || 0) * 3.6, // km/h
              lastUpdated: serverTimestamp(),
              isActive: true,
              franchiseId: driver?.franchiseId || 'legacy-rajhans'
            }, { merge: true });
          } catch (e: any) {
            console.error("Tracking Error:", e?.message || String(e));
          }
        }
      },
      (err: any) => {
        console.error("Geolocation Error:", err?.message || String(err));
        setIsTracking(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const stopTracking = () => {
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
  };

  // Filling Timer Logic
  const startFilling = () => {
    setFillingActive(true);
    setFillingRemaining(fillingTime * 60);
    
    timerInterval.current = setInterval(() => {
      setFillingRemaining(prev => {
        if (prev <= 60 && prev > 59) {
          // Play sound or vibrate 1 min before
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          playAlertSound();
        }
        if (prev === 1) {
          if (navigator.vibrate) navigator.vibrate(30000);
          playSirenSound();
        }
        if (prev <= 0) {
          clearInterval(timerInterval.current);
          setFillingActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleDieselSubmit = async () => {
    if (!dieselAmount || !dieselLiters || !selectedTractorId || !photoZero || !photoAmount) {
      alert('Please fill all details and upload both photos.');
      return;
    }
    setDieselSending(true);
    try {
      const tractor = tractors.find(t => t.id === selectedTractorId);
      await addDoc(collection(db, 'dieselRequests'), {
        driverId: driver?.id,
        driverName: driver?.name,
        tractorId: selectedTractorId,
        tractorName: tractor?.name || tractor?.vehicleNumber,
        amount: Number(dieselAmount),
        liters: Number(dieselLiters),
        zeroMeterPhoto: photoZero,
        receiptPhoto: photoAmount,
        status: 'Pending',
        createdAt: serverTimestamp(),
        date: format(new Date(), 'yyyy-MM-dd'),
        franchiseId: driver?.franchiseId || 'legacy-rajhans'
      });
      alert('Fuel entry submitted for Admin approval!');
      setShowDieselModal(false);
      setDieselAmount('');
      setDieselLiters('');
      setPhotoZero('');
      setPhotoAmount('');
      setSelectedTractorId('');
    } catch (err) {
      alert('Error saving fuel entry.');
    } finally {
      setDieselSending(false);
    }
  };

  const handleAttendanceAndLedger = async (driverId: string, driverName: string, salary: number) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const fId = driver?.franchiseId || 'legacy-rajhans';
    const qAtt = query(collection(db, 'attendance'), where('driverId', '==', driverId), where('date', '==', today));
    const attSnap = await getDocs(qAtt);

    if (attSnap.empty) {
      // Create Attendance
      await addDoc(collection(db, 'attendance'), {
        driverId,
        driverName,
        date: today,
        status: 'Full Day',
        createdAt: serverTimestamp(),
        franchiseId: fId
      });

      // Create Ledger Entry for 1 day's salary
      const dailyRate = salary ? Math.round(salary / 30) : 0;
      await addDoc(collection(db, 'ledger'), {
        date: today,
        type: 'Expense',
        category: 'Driver Salary',
        partyName: driverName,
        partyId: driverId,
        description: `Automatic daily salary credit (Attendance)`,
        amount: dailyRate,
        paymentMode: 'Cash', // Placeholder
        createdAt: serverTimestamp(),
        franchiseId: fId
      });
    }
  };

  const playAlertSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass || typeof AudioContextClass !== 'function') return;
      
      let audioContext;
      try {
        audioContext = new AudioContextClass();
      } catch (constructErr) {
        return;
      }
      
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      oscillator.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 1);
    } catch (e: any) {
      console.warn('AudioContext initialization failed:', e?.message || String(e));
    }
  };

  const playSirenSound = () => {
    stopSiren();
    setIsSirenActive(true);

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass || typeof AudioContextClass !== 'function') return;

      let audioContext;
      try {
        audioContext = new AudioContextClass();
      } catch (constructErr) {
        return;
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      // High volume
      gainNode.gain.value = 1;
      
      // Square wave for harsh siren sound
      oscillator.type = 'square';
      
      // Alternating frequencies for a siren for 30 seconds
      const duration = 30;
      for (let i = 0; i < duration * 2; i++) {
        const time = audioContext.currentTime + i * 0.5;
        oscillator.frequency.setValueAtTime(i % 2 === 0 ? 800 : 1200, time);
      }
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.onended = () => {
        setIsSirenActive(false);
      };

      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
      
      sirenRef.current = { oscillator, audioContext };
    } catch (e) {
      console.warn('Siren AudioContext initialization failed:', e instanceof Error ? e.message : String(e));
      setIsSirenActive(false);
    }
  };

  const stopSiren = () => {
    setIsSirenActive(false);
    if (sirenRef.current) {
      try {
        sirenRef.current.oscillator.stop();
        sirenRef.current.audioContext.close();
      } catch (e) {}
      sirenRef.current = null;
    }
    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading && !isLogged) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center opacity-10 animate-pulse scale-[2.5]">
            <Logo size={120} color="slate" />
          </div>
          <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center relative z-10 shadow-2xl shadow-blue-500/20">
            <Logo size={48} color="white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">TankerWala</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">Driver Terminal Loading...</p>
      </div>
    );
  }

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 sm:p-10 rounded-[3rem] shadow-xl max-w-sm w-full border border-slate-100 text-center relative overflow-hidden"
        >
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-600" />

          <div className="bg-slate-900 w-24 h-24 rounded-[2.2rem] flex items-center justify-center mx-auto mb-6 shadow-2xl relative transition-transform hover:scale-105">
            <Logo size={48} color="white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2 font-sans">Driver App</h1>
          <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-8 font-sans">TankerWala Driver Terminal</p>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (emailInput.trim() && pinInput.trim()) {
              handleDriverEmailBypass(emailInput.trim(), pinInput.trim());
            }
          }} className="space-y-4 text-left">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail size={18} className="text-slate-400" />
              </div>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Enter Registered Email"
                required
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold text-slate-800 focus:border-indigo-500 focus:bg-white transition-all outline-none font-sans"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock size={18} className="text-slate-400" />
              </div>
              <input
                type="password"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 4-Digit Login PIN"
                required
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold text-slate-800 focus:border-indigo-500 focus:bg-white transition-all outline-none font-sans"
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-2 font-sans">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading || !emailInput.trim() || pinInput.length < 4}
              className="w-full bg-slate-100 text-slate-400 h-15 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-slate-200/50 enabled:bg-slate-900 enabled:text-white enabled:hover:bg-slate-800 cursor-pointer text-sm font-sans"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-850 rounded-full animate-spin" />
              ) : (
                'Login with PIN'
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-500/30 pb-24">
      <WishesOverlay />
      {/* Top Header */}
      <div className="p-6 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-xl z-50 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-indigo-500/20">
            {driver?.name?.[0] || 'D'}
          </div>
          <div>
            <h1 className="font-black text-lg text-slate-900">{driver?.name || 'Driver Name'}</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">
              {isTracking ? (
                <span className="flex items-center gap-1 text-green-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live Tracking
                </span>
              ) : 'Offline'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Spoken Alert Toggle */}
          <button 
            onClick={() => {
              const newVal = !speakAnnouncements;
              setSpeakAnnouncements(newVal);
              if (newVal) {
                if ('speechSynthesis' in window) {
                  window.speechSynthesis.cancel();
                  const u = new SpeechSynthesisUtterance("Awaaz alert chalu ho gae hain.");
                  u.lang = 'hi-IN';
                  window.speechSynthesis.speak(u);
                }
              }
            }} 
            className={`p-3 rounded-2xl active:scale-95 transition-all border ${speakAnnouncements ? 'bg-indigo-50 text-indigo-600 border-indigo-150' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
            title={speakAnnouncements ? "Hindi Speak Alerts Active" : "Speak Alerts Off"}
          >
            {speakAnnouncements ? <Bell size={20} className="animate-bounce" /> : <BellOff size={20} />}
          </button>
          <InstallPWA />
          <button onClick={() => {
            localStorage.removeItem('isDriverLoggedIn');
            localStorage.removeItem('driverSavedEmail');
            window.location.reload();
          }} className="p-3 bg-slate-100 rounded-2xl text-slate-500 active:scale-95 transition-all">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="px-6 space-y-6 max-w-md mx-auto">
        {activeTab === 'HOME' && (
          <>
            {/* Stats Dashboard */}
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Trips Today</p>
                  <p className="text-3xl font-black text-slate-900">{trips.length}</p>
               </div>
               <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <p className="text-sm font-black text-slate-900">Present</p>
                  </div>
               </div>
            </div>

            {/* Active Trip Card */}
        {nextDayCansRequests.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-[2.5rem] p-6">
            <h3 className="text-xs font-black text-orange-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Bell size={14} /> Upcoming Can Requests (Monthly)
            </h3>
            <div className="space-y-3">
              {nextDayCansRequests.map(req => (
                <div key={req.id} className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl flex items-center justify-between border border-orange-100 shadow-sm">
                  <div>
                    <div className="text-sm font-black text-slate-900">{req.name}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{req.address?.slice(0, 30)}...</div>
                  </div>
                  <div className="bg-orange-600 text-white w-10 h-10 rounded-xl flex flex-col items-center justify-center font-black">
                    <span className="text-xs leading-none">{req.nextDayCans}</span>
                    <span className="text-[7px] uppercase tracking-tighter">Cans</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTrip ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-indigo-600 rounded-[2.5rem] p-8 shadow-2xl shadow-indigo-500/20 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <span className="bg-white/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white">
                  Active Mission • {activeTrip.status}
                </span>
                <span className="text-indigo-100 font-bold text-sm">#TRIP-{activeTrip.billNumber}</span>
              </div>

              <div className="flex items-start gap-4 mb-8">
                <div className="p-4 bg-white/20 rounded-2xl">
                  <MapPin className="text-white" size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black text-white leading-tight">
                      {activeTrip.customerName}
                    </h2>
                    {activeTrip.customerMobile && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`tel:${activeTrip.customerMobile}`);
                        }}
                        className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"
                      >
                        <Phone size={18} fill="currentColor" />
                      </button>
                    )}
                  </div>
                  <p className="text-indigo-100 text-sm font-medium opacity-80 mt-1">{activeTrip.siteLocation || 'Main Delivery Site'}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-8">
                <div className="bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-[8px] uppercase font-bold text-indigo-200 mb-1">Service</p>
                  <p className="text-xs font-black text-white">{activeTrip.category || 'TANKER'}</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-[8px] uppercase font-bold text-indigo-200 mb-1">Qty/Size</p>
                  <p className="text-xs font-black text-white">
                    {activeTrip.category === 'TANKER' ? activeTrip.tankerSize : (activeTrip.bottleSize || '20L')}
                    {' x '}{activeTrip.quantity}
                  </p>
                </div>
                <div className="bg-white/10 rounded-2xl p-3 text-center border border-indigo-400">
                  <p className="text-[8px] uppercase font-bold text-indigo-200 mb-1">Tractor</p>
                  <p className="text-xs font-black text-white">{activeTrip.tractorId || 'T-01'}</p>
                </div>
              </div>

              {/* Requirement Badges */}
              <div className="flex flex-wrap gap-2 mb-6">
                {activeTrip.remarks?.toLowerCase().includes('emergency') && (
                  <div className="bg-red-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg shadow-red-500/20">
                    <AlertCircle size={10} /> Emergency Delivery
                  </div>
                )}
                {activeTrip.remarks?.toLowerCase().includes('pipe') && (
                  <div className="bg-orange-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg shadow-orange-500/20">
                    <Flask size={10} /> Pipe Required
                  </div>
                )}
                {activeTrip.remarks?.toLowerCase().includes('floor') && (
                  <div className="bg-blue-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg shadow-blue-500/20">
                    <Plus size={10} /> Floor Delivery
                  </div>
                )}
              </div>

              {activeTrip.remarks && (
                <div className="bg-slate-900/60 rounded-3xl p-5 mb-8 border border-white/5">
                  <p className="text-[10px] uppercase font-black text-indigo-300 mb-3 tracking-[0.15em] flex items-center gap-2">
                    <ClipboardList size={14} /> Requirements & Remarks
                  </p>
                  <div className="space-y-2">
                    {activeTrip.remarks.split('|').map((part: string, idx: number) => (
                      <div key={idx} className="text-xs font-medium text-indigo-50 text-pretty leading-relaxed">
                        • {part.trim()}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {activeTrip.customerMobile && (
                  <button 
                    onClick={() => window.open(`tel:${activeTrip.customerMobile}`)}
                    className="w-full bg-green-500 text-white h-14 rounded-2xl flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition-all shadow-xl shadow-green-500/20"
                  >
                    <Phone size={18} fill="currentColor" />
                    Call Customer
                  </button>
                )}

                {activeTrip.status === 'Active' && (
                  <button 
                    onClick={async () => {
                      try {
                        const tripRef = doc(db, 'trips', activeTrip.id);
                        const billRef = doc(db, 'bills', activeTrip.billId);
                        await Promise.all([
                          updateDoc(tripRef, { status: 'Filling' }),
                          updateDoc(billRef, { status: 'Filling' })
                        ]);
                        if (activeTrip.category === 'TANKER') {
                          startFilling();
                        }
                      } catch (e) {
                        alert('Error starting process');
                      }
                    }}
                    className="w-full bg-white text-indigo-600 h-14 rounded-2xl flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition-all shadow-xl"
                  >
                    <Clock size={18} />
                    {activeTrip.category === 'TANKER' ? 'Start Tanker Filling' : 'Start Loading Items'}
                  </button>
                )}

                {activeTrip.status === 'Filling' && (
                  <button 
                    onClick={async () => {
                      try {
                        const tripRef = doc(db, 'trips', activeTrip.id);
                        const billRef = doc(db, 'bills', activeTrip.billId);
                        await Promise.all([
                          updateDoc(tripRef, { status: 'On the way' }),
                          updateDoc(billRef, { status: 'On the way' })
                        ]);
                        setFillingActive(false);
                        clearInterval(timerInterval.current);
                      } catch (e) {
                        alert('Error starting driving');
                      }
                    }}
                    className="w-full bg-white text-indigo-600 h-14 rounded-2xl flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition-all shadow-xl"
                  >
                    <Truck size={18} />
                    Start Driving (On the way)
                  </button>
                )}

                {activeTrip.status === 'On the way' && (
                  <>
                    <button 
                      onClick={() => {
                        const targetLoc = (activeTrip.latitude && activeTrip.longitude)
                          ? `${activeTrip.latitude},${activeTrip.longitude}`
                          : (activeTrip.customerLat && activeTrip.customerLng)
                            ? `${activeTrip.customerLat},${activeTrip.customerLng}`
                            : encodeURIComponent(activeTrip.siteLocation || activeTrip.customerName);
                        window.open(`https://www.google.com/maps/search/?api=1&query=${targetLoc}`);
                      }}
                      className="w-full bg-white/20 text-white h-14 rounded-2xl flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition-all mb-1"
                    >
                      <Navigation size={18} fill="currentColor" />
                      Google Maps
                    </button>
                    <button 
                      onClick={async () => {
                        try {
                          const tripRef = doc(db, 'trips', activeTrip.id);
                          const billRef = doc(db, 'bills', activeTrip.billId);
                          await Promise.all([
                            updateDoc(tripRef, { status: 'Reached' }),
                            updateDoc(billRef, { status: 'Reached' })
                          ]);
                        } catch (e) {
                          alert('Error reaching location');
                        }
                      }}
                      className="w-full bg-white text-indigo-600 h-14 rounded-2xl flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition-all shadow-xl"
                    >
                      <Bell size={18} />
                      Reached Location (Ringing Alarm)
                    </button>
                  </>
                )}

                {activeTrip.status === 'Reached' && (
                  <button 
                    onClick={async () => {
                      if (!activeTrip.tractorId) {
                        alert('Assignment Required: Tractor must be assigned before marking as Delivered.');
                        return;
                      }
                      if (!activeTrip.billId) {
                        alert('Error Assignment: This trip is missing a valid Bill ID. Please contact admin.');
                        return;
                      }
                      if(window.confirm('Confirm Delivery Completion?')) {
                        try {
                           const tripRef = doc(db, 'trips', activeTrip.id!);
                           const billRef = doc(db, 'bills', activeTrip.billId);
                           const billSnap = await getDoc(billRef);
                           if (billSnap.exists()) {
                             const bData = billSnap.data();
                             setQrAmount(bData.grandTotal || 0);
                             setQrBillNumber(bData.billNumber || activeTrip.billNumber || '');
                           }
                           await Promise.all([
                             updateDoc(tripRef, { status: 'Delivered', completedAt: serverTimestamp() }),
                             updateDoc(billRef, { status: 'Delivered', completedAt: serverTimestamp() })
                           ]);

                           setShowQR(true);

                           // Background Auto-post ledger (isolated from main flow to prevent lag/failures)
                           try {
                             const fB = await getDoc(billRef);
                             if (fB.exists() && !fB.data()?.ledgerPosted) {
                               await ledgerAutomation.postBillToLedger({ id: fB.id, ...fB.data() });
                             }
                           } catch (ledgerError) {
                             console.error('Safe Ledger posting failed in driver app:', ledgerError);
                           }

                           // Background Handle automatic attendance (isolated)
                           try {
                             if (driver?.monthlySalary) {
                               await handleAttendanceAndLedger(driver.id, driver.name, driver.monthlySalary);
                             }
                           } catch (attendanceError) {
                             console.error('Safe Attendance recording failed in driver app:', attendanceError);
                           }
                        } catch(e) {
                          console.error('Error marking delivered:', e);
                          alert('Error updating status: ' + (e instanceof Error ? e.message : safeString(e)));
                        }
                      }
                    }}
                    className="w-full bg-green-500 text-white h-14 rounded-2xl flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition-all shadow-xl"
                  >
                    <CheckCircle2 size={18} />
                    Water Delivered Successfully
                  </button>
                )}
                
                {activeTrip.status === 'Active' && (
                   <button 
                     onClick={() => {
                       const targetLoc = (activeTrip.latitude && activeTrip.longitude)
                         ? `${activeTrip.latitude},${activeTrip.longitude}`
                         : (activeTrip.customerLat && activeTrip.customerLng)
                           ? `${activeTrip.customerLat},${activeTrip.customerLng}`
                           : encodeURIComponent(activeTrip.siteLocation || activeTrip.customerName);
                       window.open(`https://www.google.com/maps/search/?api=1&query=${targetLoc}`);
                     }}
                    className="w-full bg-white/10 text-white h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-xs active:scale-95 transition-all mt-2"
                  >
                    <Navigation size={14} /> View Location
                  </button>
                )}

                {activeTrip.status === 'Delivered' && (
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button 
                      onClick={async () => {
                        try {
                          const billSnap = await getDoc(doc(db, 'bills', activeTrip.billId));
                          if (billSnap.exists()) {
                            const bData = billSnap.data();
                            setQrAmount(bData.grandTotal || 0);
                            setQrBillNumber(bData.billNumber || activeTrip.billNumber || '');
                          }
                        } catch(e){}
                        setShowQR(true);
                      }}
                      className="bg-indigo-600/20 border border-indigo-500/30 rounded-2xl py-4 flex flex-col items-center gap-2 text-indigo-400 font-bold text-xs active:scale-95 transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                        <CheckCircle2 size={16} />
                      </div>
                      Show QR
                    </button>
                    <button 
                      onClick={() => handleViewBill(activeTrip.billId)}
                      className="bg-green-600/20 border border-green-500/30 rounded-2xl py-4 flex flex-col items-center gap-2 text-green-400 font-bold text-xs active:scale-95 transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <History size={16} />
                      </div>
                      View Bill
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-900/50 rounded-[3rem] p-10 border border-slate-800 text-center">
              <div className="w-16 h-16 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-4 text-slate-500">
                <Navigation size={32} />
              </div>
              <h3 className="text-xl font-black text-white mb-2">Ready for Duty</h3>
              <p className="text-slate-500 text-sm font-medium">Wait for Admin to assign a trip.</p>
            </div>

            {lastDeliveredTrip && (
               <div className="bg-green-500/5 border border-green-500/20 rounded-[2rem] p-6">
                 <div className="flex justify-between items-center mb-4">
                   <div className="flex items-center gap-2">
                     <CheckCircle2 size={16} className="text-green-500" />
                     <span className="text-xs font-bold text-green-500 uppercase tracking-widest">Last Trip Delivered</span>
                   </div>
                   <span className="text-[10px] text-slate-500 font-bold">{format(lastDeliveredTrip.completedAt?.toDate() || new Date(), 'hh:mm a')}</span>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                    {lastDeliveredTrip.customerMobile && (
                      <button 
                        onClick={() => window.open(`tel:${lastDeliveredTrip.customerMobile}`)}
                        className="col-span-2 bg-green-600/10 border border-green-500/20 rounded-2xl py-3 flex items-center justify-center gap-2 text-green-400 font-bold text-xs"
                      >
                        <Phone size={14} fill="currentColor" />
                        Call Customer
                      </button>
                    )}
                    <button 
                      onClick={async () => {
                        try {
                          const billSnap = await getDoc(doc(db, 'bills', lastDeliveredTrip.billId));
                          if (billSnap.exists()) {
                            const bData = billSnap.data();
                            setQrAmount(bData.grandTotal || 0);
                            setQrBillNumber(bData.billNumber || lastDeliveredTrip.billNumber || '');
                          }
                        } catch(e){}
                        setShowQR(true);
                      }}
                      className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl py-4 flex flex-col items-center gap-2 text-indigo-400 font-bold text-xs"
                    >
                      Show QR
                    </button>
                    <button 
                      onClick={() => handleViewBill(lastDeliveredTrip.billId)}
                      className="bg-green-600/10 border border-green-500/20 rounded-2xl py-4 flex flex-col items-center gap-2 text-green-400 font-bold text-xs"
                    >
                      Show Bill
                    </button>
                  </div>
               </div>
            )}
          </div>
        )}

        {/* Filling Notification System */}
        <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400">
                <Clock size={20} />
              </div>
              <div>
                <h3 className="font-black">Smart Filling</h3>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Notification System</p>
              </div>
            </div>
            <button 
              onClick={() => {
                const manual = prompt('Enter custom time in minutes:', String(fillingTime));
                if (manual && !isNaN(Number(manual))) {
                  const num = Number(manual);
                  setFillingTime(num);
                  localStorage.setItem('defaultFillingTime', String(num));
                }
              }}
              className="p-2 bg-slate-800 rounded-xl text-slate-400 active:scale-95 transition-all">
              <Settings size={18} />
            </button>
          </div>

          {isSirenActive && (
            <div className="fixed inset-0 bg-red-600/90 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-8 text-center animate-pulse">
              <div className="w-24 h-24 bg-white text-red-600 rounded-full flex items-center justify-center mb-6 shadow-2xl">
                <BellOff size={48} />
              </div>
              <h2 className="text-4xl font-black text-white mb-2">SIREN ACTIVE!</h2>
              <p className="text-white/80 font-bold mb-10">Tank Filling Timer Finished</p>
              <button 
                onClick={stopSiren}
                className="w-full max-w-sm bg-white text-red-600 h-20 rounded-[2.5rem] font-black text-2xl shadow-2xl active:scale-95 transition-all"
              >
                STOP ALARM
              </button>
            </div>
          )}

          {!fillingActive ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[10, 15, 20].map(time => (
                  <button 
                    key={time}
                    onClick={() => {
                      setFillingTime(time);
                      localStorage.setItem('defaultFillingTime', String(time));
                    }}
                    className={`h-12 rounded-2xl font-bold text-sm transition-all border ${fillingTime === time ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                  >
                    {time} min
                  </button>
                ))}
              </div>
              <button 
                onClick={startFilling}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white h-14 rounded-2xl font-bold active:scale-95 transition-all text-sm"
              >
                Start Filling Timer
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <motion.div 
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-5xl font-black text-white mb-2"
              >
                {formatTime(fillingRemaining)}
              </motion.div>
              <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-6">Tank filling in progress...</p>
              <button 
                onClick={() => {
                  stopSiren();
                  clearInterval(timerInterval.current);
                  setFillingActive(false);
                }}
                className={`w-full h-14 rounded-2xl font-black transition-all ${isSirenActive ? 'bg-red-600 text-white animate-pulse text-lg shadow-xl' : 'bg-red-500/10 text-red-500 border border-red-500/20 text-xs'}`}
              >
                {isSirenActive ? 'STOP ALARM' : 'Stop Timer'}
              </button>
            </div>
          )}
        </div>
        </>
        )}

        {activeTab === 'FUEL_HISTORY' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black">Refuel History</h2>
            <div className="space-y-3">
              {dieselHistory.length > 0 ? 
                dieselHistory.map((req) => (
                <div key={req.id} className={`bg-slate-900 p-5 rounded-[2rem] border ${req.status === 'Approved' ? 'border-green-500/30' : 'border-slate-800'} flex items-center justify-between`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${req.status === 'Approved' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-400'}`}>
                      {req.status === 'Approved' ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{req.tractorName}</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        {req.date} • {req.liters}L
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">₹{req.amount}</p>
                    <p className={`text-[10px] font-black uppercase ${req.status === 'Approved' ? 'text-green-500' : 'text-orange-500'}`}>
                      {req.status === 'Approved' ? 'Complete' : 'Pending'}
                    </p>
                  </div>
                </div>
              )) : (
                <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center text-slate-500">
                  <Truck size={40} className="mx-auto mb-4 opacity-20" />
                  No refuel requests found
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'HISTORY' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black">Today's History</h2>
            <div className="space-y-3">
              {trips.length > 0 ? 
                trips.map((trip) => (
                <div key={trip.id} 
                  onClick={() => handleViewBill(trip.billId)}
                  className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition-colors active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-green-400">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{trip.customerName}</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        {trip.completedAt ? format(trip.completedAt.toDate(), 'hh:mm a') : 'Success'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="font-bold text-sm">{trip.quantity} L</p>
                      <p className="text-[10px] text-indigo-400 font-black uppercase">Delivered</p>
                    </div>
                    {trip.customerMobile && (
                      <button 
                        onClick={() => window.open(`tel:${trip.customerMobile}`)}
                        className="w-10 h-10 bg-green-500/10 text-green-500 rounded-xl flex items-center justify-center active:scale-95 transition-all ml-2"
                      >
                        <Phone size={16} fill="currentColor" />
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center text-slate-500">
                  <History size={40} className="mx-auto mb-4 opacity-20" />
                  No trips completed today
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cans Tab View */}
        {activeTab === 'CANS' && (
          <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">Next Day Cans</h2>
              <div className="bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-orange-500/20">
                Tomorrow's Load
              </div>
            </div>
            
            <div className="space-y-3">
              {nextDayCansRequests.length > 0 ? (
                nextDayCansRequests.map(cust => (
                  <div key={cust.id} className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex items-center justify-between group active:scale-[0.98] transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center">
                        <Flask size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-white">{cust.name}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{cust.mobile}</p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                       <div className="bg-orange-600 px-4 py-2 rounded-xl text-white font-black text-lg shadow-lg shadow-orange-600/20">
                         {cust.nextDayCans}
                       </div>
                       <button 
                        onClick={() => window.open(`tel:${cust.mobile}`)}
                        className="w-10 h-10 bg-green-500/10 text-green-500 rounded-xl flex items-center justify-center"
                       >
                         <Phone size={16} fill="currentColor" />
                       </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center text-slate-500">
                  <Flask size={40} className="mx-auto mb-4 opacity-20" />
                  <p className="text-sm font-bold">No extra can requests for today.</p>
                  <p className="text-[10px] uppercase font-black tracking-widest mt-2">Standard quantities apply</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Alerts Tab View */}
        {activeTab === 'ALERTS' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black">Notifications</h2>
            <div className="space-y-4">
              <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 border-l-4 border-l-blue-500">
                <div className="flex gap-4">
                  <Bell className="text-blue-500 shrink-0" size={20} />
                  <div>
                    <h4 className="font-bold mb-1">Welcome to Driver Portal</h4>
                    <p className="text-sm text-slate-400 font-medium leading-relaxed">Stay updated with real-time delivery tracking and trip management.</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 border-l-4 border-l-indigo-500">
                <div className="flex gap-4">
                  <Navigation className="text-indigo-500 shrink-0" size={20} />
                  <div>
                    <h4 className="font-bold mb-1">Live Location active</h4>
                    <p className="text-sm text-slate-400 font-medium leading-relaxed">Your location is now being shared with Admin for route optimization.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-950/80 backdrop-blur-xl border-t border-slate-800/50 flex items-center justify-around z-50">
        <button 
          onClick={() => setActiveTab('HOME')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'HOME' ? 'text-indigo-400' : 'text-slate-500'}`}
        >
          <Navigation size={22} fill={activeTab === 'HOME' ? "currentColor" : "none"} opacity={activeTab === 'HOME' ? 0.3 : 1} />
          <span className="text-[10px] font-bold">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab('HISTORY')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'HISTORY' ? 'text-indigo-400' : 'text-slate-500'}`}
        >
          <History size={22} />
          <span className="text-[10px] font-bold">History</span>
        </button>
        <button 
          onClick={() => setActiveTab('FUEL_HISTORY')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'FUEL_HISTORY' ? 'text-indigo-400' : 'text-slate-500'}`}
        >
          <Truck size={22} />
          <span className="text-[10px] font-bold">Fuel Logs</span>
        </button>
        <button 
          onClick={() => setShowDieselModal(true)}
          className="flex flex-col items-center gap-1 text-slate-500"
        >
          <Plus size={22} className="bg-indigo-600 rounded-full text-white p-1" />
          <span className="text-[10px] font-bold">Refuel</span>
        </button>
        <button 
          onClick={() => setActiveTab('CANS')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'CANS' ? 'text-orange-400' : 'text-slate-500'}`}
        >
          <Flask size={22} fill={activeTab === 'CANS' ? "currentColor" : "none"} opacity={activeTab === 'CANS' ? 0.3 : 1} />
          <span className="text-[10px] font-bold">Cans</span>
        </button>
        <button 
          onClick={() => setActiveTab('ALERTS')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'ALERTS' ? 'text-blue-400' : 'text-slate-500'}`}
        >
          <Bell size={22} fill={activeTab === 'ALERTS' ? "currentColor" : "none"} opacity={activeTab === 'ALERTS' ? 0.3 : 1} />
          <span className="text-[10px] font-bold">Alerts</span>
        </button>
      </div>

      {/* Diesel Entry Modal */}
      <AnimatePresence>
        {showDieselModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-black text-white">Fuel Refuel Entry</h2>
                  <p className="text-xs text-slate-400 font-medium">Enter details for Admin approval</p>
                </div>
                <button 
                  onClick={() => setShowDieselModal(false)}
                  className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400"
                >
                  <AlertCircle size={20} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest pl-2">Select Tractor</label>
                  <select 
                    value={selectedTractorId}
                    onChange={e => setSelectedTractorId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-indigo-500 font-bold"
                  >
                    <option value="">Choose Tractor</option>
                    {tractors.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.vehicleNumber})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest pl-1 forced-camera-note">Zero Meter (Camera)</label>
                     <label className="w-full aspect-video bg-slate-950 border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden relative">
                       {photoZero ? (
                         <img src={photoZero} className="w-full h-full object-cover" />
                       ) : (
                         <div className="flex flex-col items-center gap-1">
                           <Camera size={20} className="text-slate-600" />
                           <span className="text-[8px] text-slate-600 uppercase font-bold">Tap to capture</span>
                         </div>
                       )}
                       <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileUpload(e, 'zero')} />
                     </label>
                   </div>
                   <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest pl-1 forced-camera-note">Receipt (Camera)</label>
                     <label className="w-full aspect-video bg-slate-950 border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden relative">
                       {photoAmount ? (
                         <img src={photoAmount} className="w-full h-full object-cover" />
                       ) : (
                         <div className="flex flex-col items-center gap-1">
                           <Camera size={20} className="text-slate-600" />
                           <span className="text-[8px] text-slate-600 uppercase font-bold">Tap to capture</span>
                         </div>
                       )}
                       <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileUpload(e, 'amt')} />
                     </label>
                   </div>
                </div>

                {/* Diesel History Section */}
                {dieselHistory.length > 0 && (
                  <div className="mt-8 pt-4 border-t border-slate-800">
                    <h3 className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em] mb-4 pl-1">Recent Fuel History</h3>
                    <div className="space-y-2">
                       {dieselHistory.map(req => (
                         <div key={req.id} className="bg-slate-950/50 border border-slate-800/50 p-3 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${req.status === 'Approved' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}`}>
                                 {req.status === 'Approved' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                               </div>
                               <div>
                                 <p className="text-[10px] font-bold text-white">{req.tractorName}</p>
                                 <p className="text-[9px] text-slate-500">{req.liters}L • ₹{req.amount}</p>
                               </div>
                            </div>
                            <div className="text-right">
                               <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${req.status === 'Approved' ? 'bg-green-500 text-white' : 'bg-orange-500/20 text-orange-500'}`}>
                                 {req.status === 'Approved' ? 'Complete' : 'Pending'}
                               </span>
                               <p className="text-[8px] text-slate-600 mt-1">{req.date}</p>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest pl-2">Liters Filled</label>
                  <input
                    type="number"
                    value={dieselLiters}
                    onChange={e => setDieselLiters(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-indigo-500 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest pl-2">Total Paid (₹)</label>
                  <input
                    type="number"
                    value={dieselAmount}
                    onChange={e => setDieselAmount(e.target.value)}
                    placeholder="e.g. 4500"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-indigo-500 font-bold"
                  />
                </div>
                <button
                  onClick={handleDieselSubmit}
                  disabled={dieselSending}
                  className="w-full bg-orange-500 text-white font-bold h-14 rounded-2xl mt-4 disabled:opacity-50 flex items-center justify-center shadow-xl shadow-orange-500/20"
                >
                  {dieselSending ? 'Verifying...' : 'Submit Refuel Details'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Modal */}
      <AnimatePresence>
         {showQR && (
          <div className="fixed inset-0 bg-slate-950/95 z-[110] flex items-center justify-center p-6" onClick={() => setShowQR(false)}>
            <div className="bg-white p-8 rounded-[3rem] w-full max-w-sm text-center relative overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 right-0 p-8 opacity-5 scale-150 pointer-events-none">
                <Logo size={120} />
              </div>
              <div className="mb-6 flex flex-col items-center gap-2">
                <Logo size={48} />
                <h3 className="text-slate-900 font-black text-2xl tracking-tight">Payment QR</h3>
                <p className="text-slate-500 text-[10px] font-bold mb-0 uppercase tracking-widest leading-none">TankerWala Powered by Rajhans</p>
              </div>
                <div className="bg-slate-50 p-6 rounded-3xl mb-8 flex items-center justify-center border-2 border-slate-100">
                   <div className="w-52 flex flex-col items-center justify-center">
                    <QRCodeSVG 
                      value={`upi://pay?pa=rajha94133@barodampay&pn=TankerWala%20Powered%20by%20Rajhans&am=${qrAmount}&cu=INR&tn=Token%20${qrBillNumber}`}
                      size={200}
                      level="H"
                      includeMargin={true}
                      className="rounded-xl shadow-lg border border-slate-200"
                    />
                    <p className="mt-4 font-black text-xl text-slate-800 tracking-tight">₹{qrAmount}</p>
                   </div>
                </div>
                
                <button 
                  onClick={async () => {
                    if (window.confirm(`Digitally confirm receipt of ₹${qrAmount}? This will update the bank ledger.`)) {
                      try {
                        const billRef = doc(db, 'bills', activeTrip.billId);
                        const billSnap = await getDoc(billRef);
                        if (billSnap.exists()) {
                          const bData = { id: billSnap.id, ...billSnap.data() };
                          await updateDoc(billRef, { 
                            paymentStatus: 'Paid', 
                            paymentMode: 'UPI',
                            isSettled: true,
                            paidAmount: qrAmount,
                            updatedAt: serverTimestamp() 
                          });
                          
                          // Real-time Ledger Update
                          await ledgerAutomation.postPaymentToLedger(bData, qrAmount, 'UPI');
                          
                          alert('✅ Payment confirmed & Ledger updated!');
                          setShowQR(false);
                        }
                      } catch(e) {
                         alert('Error updating payment');
                      }
                    }
                  }}
                  className="w-full h-14 bg-green-500 text-white rounded-2xl font-black mb-3 active:scale-95 transition-all shadow-lg shadow-green-100"
                >
                  Confirm Payment Received
                </button>

                <button onClick={() => setShowQR(false)} className="w-full h-14 bg-slate-900/5 text-slate-500 rounded-2xl font-black">Close QR</button>
              </div>
            </div>
          )}
      </AnimatePresence>

      {/* Bill Modal (Driver Copy) */}
      <AnimatePresence>
         {viewingBill && (
            <div className="fixed inset-0 bg-slate-950/95 z-[110] flex items-center justify-center p-6 overflow-y-auto" onClick={() => setViewingBill(null)}>
               <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="max-h-[70vh] overflow-y-auto">
                   <ThermalInvoice bill={viewingBill} />
                </div>
                <div className="p-4 bg-white border-t border-slate-100">
                   <button onClick={() => setViewingBill(null)} className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black font-sans text-sm active:scale-95 transition-all">Close Bill Detail</button>
                </div>
               </div>
            </div>
         )}
      </AnimatePresence>
    </div>
  );
}
