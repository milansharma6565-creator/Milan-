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
  Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
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
import { InstallPWA } from './InstallPWA';
import { Logo } from './Logo';

export function DriverApp() {
  const [driver, setDriver] = useState<any>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [trips, setTrips] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'HOME' | 'HISTORY' | 'ALERTS' | 'DIESEL' | 'FUEL_HISTORY'>('HOME');
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
  
  const [mobileNumber, setMobileNumber] = useState('');
  const [loginStep, setLoginStep] = useState<'MOBILE' | 'PIN_LOGIN' | 'PIN_SETUP' | 'NEW_REGISTER' | 'PENDING'>('MOBILE');
  const [pin, setPin] = useState('');
  const [newName, setNewName] = useState('');
  const [licenseFront, setLicenseFront] = useState<string>('');
  const [licenseBack, setLicenseBack] = useState<string>('');
  const [isLogged, setIsLogged] = useState(false);
  const [loading, setLoading] = useState(false);
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

  // QR & Bill Modals
  const [showQR, setShowQR] = useState(false);
  const [qrAmount, setQrAmount] = useState(0);
  const [qrBillNumber, setQrBillNumber] = useState('');
  const [showBill, setShowBill] = useState(false);

  useEffect(() => {
    // Check for "Reached" status to trigger alarm
    if (activeTrip?.status === 'Reached') {
      if (!sirenRef.current) {
        playSirenSound();
      }
    } else {
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
        
        if (side === 'front') setLicenseFront(dataUrl);
        else if (side === 'back') setLicenseBack(dataUrl);
        else if (side === 'zero') setPhotoZero(dataUrl);
        else if (side === 'amt') setPhotoAmount(dataUrl);
      };
      img.src = readerEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const savedMobile = localStorage.getItem('driverMobile');
    const isLoggedIn = localStorage.getItem('isDriverLoggedIn');
    if (savedMobile && isLoggedIn === 'true') {
       bypassLogin(savedMobile);
    }
  }, []);

  const bypassLogin = async (mobile: string) => {
    setLoading(true);
    try {
      const q = query(collection(db, 'drivers'), where('mobile', '==', mobile));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const dData = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
        if (dData.status === 'Active') {
          setDriver(dData);
          setIsLogged(true);
        } else if (dData.status === 'pending') {
          setLoginStep('PENDING');
        } else {
           // Inactive
           setError('Account deactivated. Contact Admin.');
        }
      }
    } catch (e: any) {
      console.error("Bypass login failed:", e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleMobileSubmit = async () => {
    if (mobileNumber.length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const q = query(collection(db, 'drivers'), where('mobile', '==', mobileNumber));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setLoginStep('NEW_REGISTER');
      } else {
        const data = snap.docs[0].data();
        setDriver({ id: snap.docs[0].id, ...data });
        if (data.status === 'pending') {
          setLoginStep('PENDING');
        } else if (data.status === 'Inactive') {
          setError('Account deactivated. Contact Admin.');
          setLoginStep('MOBILE');
        } else if (data.pin) {
          setLoginStep('PIN_LOGIN');
        } else {
          setLoginStep('PIN_SETUP');
        }
      }
    } catch (err: any) {
      console.error("Mobile submit failed:", err?.message || String(err));
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = (dData: any) => {
    setDriver(dData);
    setIsLogged(true);
    localStorage.setItem('driverMobile', mobileNumber);
    localStorage.setItem('isDriverLoggedIn', 'true');
  };

  const handleAuthSubmit = async () => {
    setError('');
    if (loginStep === 'NEW_REGISTER') {
      if (!newName.trim() || pin.length !== 4) {
        setError('Please enter your name and a 4-digit PIN.');
        return;
      }
      if (!licenseFront || !licenseBack) {
        setError('Please upload both photos of your driving license.');
        return;
      }
      setLoading(true);
      try {
        const newDData = {
          name: newName.trim(),
          mobile: mobileNumber,
          pin: pin,
          licenseFrontUrl: licenseFront,
          licenseBackUrl: licenseBack,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, 'drivers'), newDData);
        
        // Setup Vault integration for Tractor Drivers
        try {
          const newFolderId = `driver_${docRef.id}`;
          const newFolderName = `${newName.trim()}`;
          
          const docSnap = await getDoc(doc(db, 'settings', 'documents'));
          let newFolders = [];
          if (docSnap.exists() && docSnap.data().folders) {
            newFolders = [...docSnap.data().folders];
          }
          newFolders.push({ id: newFolderId, name: newFolderName, parentId: 'drivers' });
          
          await setDoc(doc(db, 'settings', 'documents'), { folders: newFolders }, { merge: true });

          await addDoc(collection(db, 'documents'), {
            name: `${newName.trim()} - License Front`,
            url: licenseFront,
            folder: newFolderId,
            type: 'image/jpeg',
            size: 0,
            storageType: 'base64',
            createdAt: serverTimestamp()
          });

          await addDoc(collection(db, 'documents'), {
            name: `${newName.trim()} - License Back`,
            url: licenseBack,
            folder: newFolderId,
            type: 'image/jpeg',
            size: 0,
            storageType: 'base64',
            createdAt: serverTimestamp()
          });
        } catch (vaultErr: any) {
          console.error("Failed to sync directly to Document Vault", vaultErr?.message || String(vaultErr));
        }

        setDriver({ id: docRef.id, ...newDData });
        setLoginStep('PENDING');
      } catch (err: any) {
        setError('Failed to register.');
      } finally {
        setLoading(false);
      }
    } else if (loginStep === 'PIN_SETUP') {
      if (pin.length !== 4) {
        setError('Please enter a 4-digit PIN.');
        return;
      }
      setLoading(true);
      try {
        await updateDoc(doc(db, 'drivers', driver!.id!), { pin: pin });
        completeLogin({ ...driver!, pin });
      } catch (err: any) {
        setError('Failed to setup PIN.');
      } finally {
        setLoading(false);
      }
    } else if (loginStep === 'PIN_LOGIN') {
      if (pin !== driver?.pin) {
        setError('Incorrect PIN. Try again.');
        return;
      }
      completeLogin(driver);
    }
  };

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

    return () => {
      unsubActive();
      unsubHistory();
      unsubTractors();
    };
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
              isActive: true
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
        date: format(new Date(), 'yyyy-MM-dd')
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
    const qAtt = query(collection(db, 'attendance'), where('driverId', '==', driverId), where('date', '==', today));
    const attSnap = await getDocs(qAtt);

    if (attSnap.empty) {
      // Create Attendance
      await addDoc(collection(db, 'attendance'), {
        driverId,
        driverName,
        date: today,
        status: 'Full Day',
        createdAt: serverTimestamp()
      });

      // Create Ledger Entry for 1 day's salary
      const dailyRate = salary ? Math.round(salary / 30) : 0;
      await addDoc(collection(db, 'ledger'), {
        date: serverTimestamp(),
        type: 'Expense',
        category: 'Driver Salary',
        partyName: driverName,
        partyId: driverId,
        description: `Automatic daily salary credit (Attendance)`,
        amount: dailyRate,
        paymentMode: 'Cash', // Placeholder
        createdAt: serverTimestamp()
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
      console.warn('Siren AudioContext initialization failed:', e);
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
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center opacity-10 animate-pulse scale-[2.5]">
            <Logo size={120} color="white" />
          </div>
          <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center relative z-10 shadow-2xl shadow-blue-500/20">
            <Logo size={48} />
          </div>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">TankerWala</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">Driver Terminal Loading...</p>
      </div>
    );
  }

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[2.5rem] shadow-xl max-w-sm w-full border border-slate-100"
        >
          <div className="text-center mb-8">
            <div className={`w-24 h-24 mx-auto ${loginStep === 'PENDING' ? 'bg-orange-100' : 'bg-slate-900'} rounded-[2rem] flex items-center justify-center mb-6 shadow-2xl shadow-slate-900/10`}>
              {loginStep === 'PENDING' ? <AlertCircle size={40} className="text-orange-500" /> : <Logo size={48} color="white" />}
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">
              Tanker<span className="relative text-blue-600">Wala<span className="absolute top-full left-0 text-[10px] text-slate-400 font-medium whitespace-nowrap normal-case tracking-normal mt-0.5">Powered by Rajhans</span></span>
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-8 mb-4">
              {loginStep === 'PENDING' ? 'Pending Approval' :
               loginStep === 'NEW_REGISTER' ? 'Register as Driver' :
               loginStep === 'PIN_SETUP' ? 'Setup Profile' :
               loginStep === 'PIN_LOGIN' ? 'Driver Login' : 'Fleet Management'}
            </p>
            <p className="text-sm font-medium text-slate-500">
              {loginStep === 'PENDING' ? 'Your account is pending review by an Administrator. Please check back later.' :
               loginStep === 'NEW_REGISTER' ? 'Enter your details to register in the fleet' :
               loginStep === 'PIN_SETUP' ? 'Create a secure 4-digit PIN for future logins' :
               loginStep === 'PIN_LOGIN' ? `Welcome back, ${driver?.name}` : 'Login with your registered mobile number'}
            </p>
          </div>

          <div className="space-y-4">
            {loginStep === 'MOBILE' && (
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block ml-1">Mobile Number</label>
                <input 
                  type="tel"
                  maxLength={10}
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 9876543210"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white transition-all text-lg font-bold"
                />
              </div>
            )}
            
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block ml-1">Full Name</label>
              <input 
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Your Name"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white transition-all text-lg font-bold mb-4"
              />
              
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block ml-1">License Front</label>
                  <label className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors overflow-hidden">
                    {licenseFront ? (
                      <img src={licenseFront} className="w-full h-full object-cover" alt="Front" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <MapPin size={24} className="text-slate-300" />
                        <span className="text-[8px] font-bold text-slate-400 uppercase mt-1">Upload</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'front')} />
                  </label>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block ml-1">License Back</label>
                  <label className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors overflow-hidden">
                    {licenseBack ? (
                      <img src={licenseBack} className="w-full h-full object-cover" alt="Back" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <MapPin size={24} className="text-slate-300" />
                        <span className="text-[8px] font-bold text-slate-400 uppercase mt-1">Upload</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'back')} />
                  </label>
                </div>
              </div>
            </div>

            {['NEW_REGISTER', 'PIN_SETUP', 'PIN_LOGIN'].includes(loginStep) && (
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block ml-1">4-Digit PIN</label>
                <input 
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white transition-all text-center text-2xl font-black tracking-[1em]"
                />
                {loginStep === 'PIN_LOGIN' && (
                  <button 
                    onClick={() => alert("Please call Admin Rahul Hans at +91 96102 96102 to retrieve your PIN. They can see it in their Drivers panel.")}
                    className="w-full text-xs font-bold text-blue-600 mt-2 text-right hover:underline"
                  >
                    Forgot PIN? Ask Admin
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="px-4 py-3 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center justify-center gap-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            
            {loginStep !== 'PENDING' && (
              <button 
                onClick={loginStep === 'MOBILE' ? handleMobileSubmit : handleAuthSubmit}
                disabled={loading || (loginStep === 'MOBILE' && mobileNumber.length < 10) || (loginStep !== 'MOBILE' && pin.length < 4)}
                className="w-full bg-slate-900 text-white h-14 rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-xl shadow-slate-900/20"
              >
                {loading ? 'Processing...' : (
                  <>
                    {loginStep === 'PIN_LOGIN' ? 'Secure Login' : 'Continue'}
                    <ChevronRight size={18} className="translate-y-[1px]" />
                  </>
                )}
              </button>
            )}

            {loginStep !== 'MOBILE' && loginStep !== 'PENDING' && (
              <button 
                onClick={() => { setLoginStep('MOBILE'); setPin(''); setMobileNumber(''); setError(''); }}
                className="w-full h-12 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                Use different number
              </button>
            )}

            {loginStep === 'PENDING' && (
               <button 
                 onClick={() => { setLoginStep('MOBILE'); setMobileNumber(''); }}
                 className="w-full bg-slate-100 text-slate-700 h-14 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center mt-4"
               >
                 Back
               </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-indigo-500/30 pb-24">
      {/* Top Header */}
      <div className="p-6 flex items-center justify-between sticky top-0 bg-slate-950/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-500/20">
            {driver?.name?.[0] || 'D'}
          </div>
          <div>
            <h1 className="font-black text-lg">{driver?.name || 'Driver Name'}</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
              {isTracking ? (
                <span className="flex items-center gap-1 text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live Tracking
                </span>
              ) : 'Offline'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InstallPWA />
          <button onClick={() => {
            localStorage.removeItem('isDriverLoggedIn');
            window.location.reload();
          }} className="p-3 bg-slate-900 rounded-2xl text-slate-400 active:scale-95 transition-all">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="px-6 space-y-6">
        {activeTab === 'HOME' && (
          <>
            {/* Stats Dashboard */}
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Trips Today</p>
                  <p className="text-3xl font-black text-white">{trips.length}</p>
               </div>
               <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <p className="text-sm font-black text-white">Present</p>
                  </div>
               </div>
            </div>

            {/* Active Trip Card */}
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

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-white/10 rounded-3xl p-4 text-center">
                  <p className="text-[10px] uppercase font-bold text-indigo-200 mb-1">Service</p>
                  <p className="text-sm font-black text-white">{activeTrip.category || 'TANKER'}</p>
                </div>
                <div className="bg-white/10 rounded-3xl p-4 text-center">
                  <p className="text-[10px] uppercase font-bold text-indigo-200 mb-1">Quantity/Size</p>
                  <p className="text-sm font-black text-white">
                    {activeTrip.category === 'TANKER' ? activeTrip.tankerSize : (activeTrip.bottleSize || '20L')}
                    {' x '}{activeTrip.quantity}
                  </p>
                </div>
              </div>

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
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeTrip.siteLocation || activeTrip.customerName)}`)}
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
                           // Handle automatic attendance
                           if (driver?.monthlySalary) {
                             handleAttendanceAndLedger(driver.id, driver.name, driver.monthlySalary);
                           }
                        } catch(e) {
                          alert('Error updating status');
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
                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeTrip.siteLocation || activeTrip.customerName)}`)}
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
                      onClick={() => setShowBill(true)}
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
                      onClick={() => setShowBill(true)}
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
                <div key={trip.id} className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex items-center justify-between">
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
                <button onClick={() => setShowQR(false)} className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black">Close</button>
              </div>
           </div>
         )}
      </AnimatePresence>

      {/* Bill Modal (Driver Copy) */}
      <AnimatePresence>
         {showBill && (
           <div className="fixed inset-0 bg-slate-950/95 z-[110] flex items-center justify-center p-6 overflow-y-auto" onClick={() => setShowBill(false)}>
              <div className="bg-white p-8 rounded-[3rem] w-full max-w-sm text-slate-950 font-mono text-[10px]" onClick={e => e.stopPropagation()}>
                <div className="text-center border-b-2 border-dashed border-slate-200 pb-4 mb-4">
                  <div className="flex justify-center mb-4 scale-75">
                    <Logo size={40} />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-tight pb-3">
                    Tanker<span className="relative text-blue-600">Wala<span className="absolute top-full left-0 text-[8px] text-slate-400 font-medium whitespace-nowrap normal-case tracking-normal mt-0.5">Powered by Rajhans</span></span>
                  </h3>
                  <p className="mt-4">Trip Token #{(activeTrip?.billNumber || '0000')}</p>
                </div>
                
                <div className="space-y-1 mb-4">
                  <div className="flex justify-between"><span>DATE:</span> <span>{format(new Date(), 'dd/MM/yyyy')}</span></div>
                  <div className="flex justify-between"><span>DRIVER:</span> <span>{driver?.name}</span></div>
                  <div className="flex justify-between"><span>TRACTOR:</span> <span>{activeTrip?.tankerNumber || 'T-01'}</span></div>
                </div>

                <div className="border-b border-dashed border-slate-200 mb-4 pb-4">
                  <p className="font-bold mb-1">CUSTOMER DETAILS:</p>
                  <p>{activeTrip?.customerName || 'N/A'}</p>
                  <p>{activeTrip?.customerMobile || 'N/A'}</p>
                  <p className="italic">{activeTrip?.siteLocation || 'N/A'}</p>
                </div>

                <div className="border-b-2 border-dashed border-slate-200 mb-6 pb-2">
                   <div className="flex justify-between font-black text-sm uppercase mb-2">
                     <span>Item</span>
                     <span>Qty</span>
                   </div>
                   <div className="flex justify-between">
                     <span>Water Tanker Delivery</span>
                     <span>{activeTrip?.quantity || 0} L</span>
                   </div>
                </div>

                <div className="text-center mb-8">
                  <p className="font-bold uppercase mb-2">Driver Copy • Not for Sale</p>
                  <div className="w-full h-px bg-slate-200 mb-4" />
                  <p className="text-[8px] text-slate-400">Generated by TankerWala Fleet Mgmt</p>
                </div>

                <button onClick={() => setShowBill(false)} className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black font-sans text-sm">Close Bill</button>
              </div>
           </div>
         )}
      </AnimatePresence>
    </div>
  );
}
