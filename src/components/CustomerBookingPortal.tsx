import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, updateDoc, doc, setDoc, arrayUnion } from 'firebase/firestore';
import { Customer, Bill, ProductCategory, BookingRequest as BookingRequestType } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, CheckCircle2, Navigation, MapPin, AlertCircle, Calendar, Truck, Lock, User as UserIcon, Plus, X, Receipt, QrCode, FileText, MessageCircle, Send, Bell, Droplets, FlaskConical as Flask, Package } from 'lucide-react';

import { Logo } from './Logo';
import { LocationPicker } from './LocationPicker';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { formatCurrency } from '../constants';

const BASE_LAT = 27.592172;
const BASE_LNG = 75.167808;

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

function TripCountdown({ createdAt }: { createdAt: any }) {
  // ... existing code ...
  const [timeLeft, setTimeLeft] = useState('');
  const [isLate, setIsLate] = useState(false);

  useEffect(() => {
    if (!createdAt) return;
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const target = new Date(date.getTime() + 1.5 * 60 * 60 * 1000); // +1.5 hours

    const interval = setInterval(() => {
      const now = new Date();
      const diff = target.getTime() - now.getTime();
      
      if (diff <= 0) {
        setIsLate(true);
        setTimeLeft('Delayed');
      } else {
        setIsLate(false);
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt]);

  if (isLate) {
    return (
      <div className="text-[10px] text-red-600 font-bold mt-2 bg-red-50 p-2 rounded-lg leading-tight border border-red-100">
        Sorry due to electricity cut off, your tanker will deliver soon.
      </div>
    );
  }
  
  return (
    <div className="text-[11px] text-orange-600 font-bold mt-2 flex items-center gap-1.5 bg-orange-50 px-2 py-1.5 rounded-lg border border-orange-100">
      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
      Estimated Time: {timeLeft}
    </div>
  );
}

function LiveChatModal({ bill, onClose, customerName }: { bill: Bill, onClose: () => void, customerName: string }) {
   const [rating, setRating] = useState(5);
   const [text, setText] = useState('');
   const [submitted, setSubmitted] = useState(false);

   const handleSubmit = async () => {
     if (!text.trim()) return;
     await addDoc(collection(db, 'feedbacks'), {
       billId: bill.id,
       billNumber: bill.billNumber,
       customerName,
       rating,
       comment: text.trim(),
       createdAt: serverTimestamp()
     });
     setSubmitted(true);
     setTimeout(onClose, 2000);
   };

   return (
     <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
       <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm relative text-center">
         {submitted ? (
           <div className="py-10">
             <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
               <CheckCircle2 size={40} />
             </div>
             <h3 className="text-xl font-black text-slate-900">Thank You!</h3>
             <p className="text-slate-500 font-medium">Your feedback helps us improve.</p>
           </div>
         ) : (
           <>
             <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 p-2 bg-slate-50 rounded-full"><X size={20} /></button>
             <h2 className="text-2xl font-black text-slate-900 mb-2">Driver Feedback</h2>
             <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-8">Token #{bill.billNumber}</p>
             
             <div className="flex items-center justify-center gap-2 mb-8">
               {[1, 2, 3, 4, 5].map(star => (
                 <button 
                  key={star} 
                  onClick={() => setRating(star)}
                  className={`text-3xl transition-transform active:scale-90 ${star <= rating ? 'text-yellow-400' : 'text-slate-200'}`}
                 >
                   ★
                 </button>
               ))}
             </div>

             <textarea 
               value={text}
               onChange={(e) => setText(e.target.value)}
               placeholder="Tell us about the delivery quality..."
               className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-medium focus:border-blue-500 outline-none resize-none h-32 mb-6"
             />

             <button 
               onClick={handleSubmit}
               className="w-full bg-blue-600 text-white h-14 rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
             >
               Submit Feedback
             </button>
           </>
         )}
       </div>
     </div>
   );
}

export function CustomerBookingPortal() {
  const [mobileNumber, setMobileNumber] = useState('');
  const [loginStep, setLoginStep] = useState<'MOBILE' | 'PIN_LOGIN' | 'PIN_SETUP' | 'NEW_REGISTER'>('MOBILE');
  const [pin, setPin] = useState('');
  const [newName, setNewName] = useState('');
  
  const [isLogged, setIsLogged] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Booking details
  const [location, setLocation] = useState<{ lat: number, lng: number, address: string } | null>(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const [remarks, setRemarks] = useState('');

  const [floors, setFloors] = useState<number>(0);
  const [pipeLength, setPipeLength] = useState<number>(50);
  const [totalEstimate, setTotalEstimate] = useState(0);

  // New Category State
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [bottleSize, setBottleSize] = useState<'500ml' | '1L' | '2L'>('1L');
  const [quantity, setQuantity] = useState(1);

  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Analytics
  const [monthlyTrips, setMonthlyTrips] = useState(0);
  const [monthlyExpense, setMonthlyExpense] = useState(0);
  const [bills, setBills] = useState<Bill[]>([]);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [modalView, setModalView] = useState<{ type: 'BILL' | 'QR' | 'ACCOUNT' | 'CHAT', bill: Bill } | null>(null);
  
  const [activeAlarmBill, setActiveAlarmBill] = useState<Bill | null>(null);
  const [isAlarmSilenced, setIsAlarmSilenced] = useState<Record<string, boolean>>({});
  const alarmAudio = useRef<HTMLAudioElement | null>(null);
  const beepAudio = useRef<HTMLAudioElement | null>(null);
  const prevStatuses = useRef<Record<string, string>>({});
  const [driverLocations, setDriverLocations] = useState<Record<string, any>>({});

  useEffect(() => {
    // Check for "Reached" status to trigger alarm
    const reachedBill = bills.find(b => b.status === 'Reached' && !isAlarmSilenced[b.id!]);
    if (reachedBill) {
      setActiveAlarmBill(reachedBill);
      if (!alarmAudio.current) {
        alarmAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1071/1071-preview.mp3');
        alarmAudio.current.loop = true;
      }
      alarmAudio.current.play().catch(e => console.log('Audio autoplay blocked'));
    } else {
      setActiveAlarmBill(null);
      if (alarmAudio.current) {
        alarmAudio.current.pause();
        alarmAudio.current.currentTime = 0;
      }
    }

    // Status change beeps
    if (!beepAudio.current) {
      beepAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); // Reuse same or different beep
      beepAudio.current.loop = false;
    }

    bills.forEach(bill => {
      if (bill.id && prevStatuses.current[bill.id] && prevStatuses.current[bill.id] !== bill.status) {
        if (['Assigned', 'Filling', 'On the way'].includes(bill.status)) {
          beepAudio.current?.play().catch(() => {});
        }
      }
      if (bill.id) prevStatuses.current[bill.id] = bill.status;
    });

    // Tracking assigned drivers
    const driversToTrack = bills
      .filter(b => (b.status === 'Assigned' || b.status === 'Filling' || b.status === 'On the way' || b.status === 'Reached') && b.driverId)
      .map(b => b.driverId);
    
    if (driversToTrack.length > 0) {
      const unsubLocations = onSnapshot(collection(db, 'driverLocations'), (snap) => {
        const locs: any = {};
        snap.docs.forEach(d => {
          if (driversToTrack.includes(d.id)) {
            locs[d.id] = d.data();
          }
        });
        setDriverLocations(locs);
      });
      return () => unsubLocations();
    }
  }, [bills, isAlarmSilenced]);

  useEffect(() => {
    const savedMobile = localStorage.getItem('customerBookingMobile');
    const isLoggedIn = localStorage.getItem('isCustomerLoggedIn');
    if (savedMobile && isLoggedIn === 'true') {
      setMobileNumber(savedMobile);
      bypassLogin(savedMobile);
    }
  }, []);

  useEffect(() => {
    if (selectedCategory === 'TANKER') {
      // Calculate Pricing for Tanker
      let calc = 350; // Base service
      if (distanceKm > 0) {
        calc += Math.round(distanceKm) * 50; // +50 per km
      }
      if (floors > 2) {
        calc += (floors - 2) * 70; // +70 per floor above 2nd
      }
      if (pipeLength > 50 && pipeLength <= 100) {
        calc += 50; // 50 rs more than 50 ft till 100 ft
      } else if (pipeLength > 100) {
        calc += 50 + ((pipeLength - 100) * 3); // 3 rs per feet beyond 100 ft
      }
      setTotalEstimate(calc);
    } else if (selectedCategory === 'STANDBY_TANKER') {
      // Day 1: 900, Day 2+: +600 per day
      let calc = 900;
      if (quantity > 1) {
        calc += (quantity - 1) * 600;
      }
      setTotalEstimate(calc);
    } else if (selectedCategory === 'MONTHLY_TANKER') {
      setTotalEstimate(10000 * quantity);
    } else if (selectedCategory === 'BOTTLE') {
      const rates = { '500ml': 10, '1L': 20, '2L': 35 };
      setTotalEstimate(rates[bottleSize] * quantity);
    } else if (selectedCategory === 'CAN') {
      setTotalEstimate(quantity * 80); // Assuming ₹80 per 20L can
    } else {
      setTotalEstimate(0);
    }
  }, [distanceKm, floors, pipeLength, selectedCategory, bottleSize, quantity]);

  const bypassLogin = async (mobile: string) => {
    try {
      const q = query(collection(db, 'customers'), where('mobile', '==', mobile));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const custData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Customer;
        setCustomer(custData);
        setIsLogged(true);
      }
    } catch (e) {
      console.error(e);
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
      const q = query(collection(db, 'customers'), where('mobile', '==', mobileNumber));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setLoginStep('NEW_REGISTER');
      } else {
        const data = snap.docs[0].data();
        setCustomer({ id: snap.docs[0].id, ...data } as Customer);
        if (data.pin) {
          setLoginStep('PIN_LOGIN');
        } else {
          setLoginStep('PIN_SETUP');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = (custData: Customer) => {
    setCustomer(custData);
    setIsLogged(true);
    localStorage.setItem('customerBookingMobile', mobileNumber);
    localStorage.setItem('isCustomerLoggedIn', 'true');
    // fetchCustomerData(custData.id!); // Removed missing function call
  };

  const handleAuthSubmit = async () => {
    setError('');
    if (loginStep === 'NEW_REGISTER') {
      if (!newName.trim() || pin.length !== 4) {
        setError('Please enter your name and a 4-digit PIN.');
        return;
      }
      setLoading(true);
      try {
        const newCustData = {
          name: newName.trim(),
          mobile: mobileNumber,
          address: '',
          pin: pin,
          pendingAmount: 0,
          totalAdvance: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, 'customers'), newCustData);
        completeLogin({ id: docRef.id, ...newCustData } as Customer);
      } catch (err: any) {
        handleFirestoreError(err, OperationType.CREATE, 'customers');
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
        await updateDoc(doc(db, 'customers', customer!.id!), { pin: pin });
        completeLogin({ ...customer!, pin } as Customer);
      } catch (err: any) {
        handleFirestoreError(err, OperationType.UPDATE, 'customers');
        setError('Failed to setup PIN.');
      } finally {
        setLoading(false);
      }
    } else if (loginStep === 'PIN_LOGIN') {
      if (pin !== customer?.pin) {
        setError('Incorrect PIN. Try again.');
        return;
      }
      completeLogin(customer!);
    }
  };

  useEffect(() => {
    if (!isLogged || !customer?.id) return;

    const startObj = startOfMonth(new Date());
    const endObj = endOfMonth(new Date());

    const billsQ = query(
      collection(db, 'bills'),
      where('customerId', '==', customer.id)
    );

    const unsubscribe = onSnapshot(billsQ, (snapshot) => {
      const allBills: Bill[] = [];
      let mTrips = 0;
      let mExpense = 0;

      snapshot.forEach(doc => {
        const b = { id: doc.id, ...doc.data() } as Bill;
        allBills.push(b);
        
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.date);
        if (bDate >= startObj && bDate <= endObj && b.status !== 'Cancelled') {
          mTrips += 1;
          mExpense += b.grandTotal;
        }
      });
      
      allBills.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.date).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.date).getTime();
        return dateB - dateA;
      });

      setBills(allBills);
      setMonthlyTrips(mTrips);
      setMonthlyExpense(mExpense);
    }, (error) => {
       handleFirestoreError(error, OperationType.LIST, 'bills');
    });

    return () => unsubscribe();
  }, [isLogged, customer?.id]);

  const handleLocationSelectWrapper = (lat: number, lng: number, address: string) => {
    setLocation({ lat, lng, address });
    const dist = getDistanceFromLatLonInKm(BASE_LAT, BASE_LNG, lat, lng);
    setDistanceKm(dist);
  };

  const handleBookNow = async () => {
    if (!customer) return;
    if (selectedCategory === 'TANKER' && !location) {
      setError('Please select a delivery location on the map.');
      return;
    }
    if (quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }

    setBookingLoading(true);
    setError('');

    try {
      let finalRemarks = remarks.trim();
      if (selectedCategory === 'TANKER') {
        if (pipeLength > 50) finalRemarks += ` | Required Pipe: ${pipeLength} feet`;
        if (floors > 0) finalRemarks += ` | Delivery up to ${floors} floors`;
      }

      await addDoc(collection(db, 'bookingRequests'), {
        billId: null, 
        customerId: customer.id!,
        customerName: customer.name,
        customerMobile: customer.mobile,
        category: selectedCategory,
        tankerSize: selectedCategory === 'TANKER' ? 'Standard' : null,
        bottleSize: selectedCategory === 'BOTTLE' ? bottleSize : null,
        quantity: quantity,
        remarks: finalRemarks,
        location: location || null,
        distanceKm: selectedCategory === 'TANKER' ? Number(distanceKm.toFixed(2)) : 0,
        totalEstimate: totalEstimate,
        status: 'Pending',
        requestedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      setBookingSuccess(true);
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.CREATE, 'bookingRequests');
      setError('Failed to create booking. Please try again.');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLogged(false);
    setCustomer(null);
    setMobileNumber('');
    setLoginStep('MOBILE');
    setPin('');
    localStorage.removeItem('customerBookingMobile');
    localStorage.removeItem('isCustomerLoggedIn');
  };

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[2.5rem] shadow-xl max-w-md w-full text-center border border-slate-100"
        >
          <div className="bg-blue-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-blue-600">
            {loginStep !== 'MOBILE' ? <Lock size={40} /> : <Logo size={40} />}
          </div>
          <h1 className="text-2xl font-display font-black text-slate-900 mb-2">
            {loginStep === 'NEW_REGISTER' ? 'Register' :
             loginStep === 'PIN_SETUP' ? 'Setup Profile' :
             loginStep === 'PIN_LOGIN' ? 'Enter PIN' : 'Customer Booking'}
          </h1>
          <p className="text-slate-500 font-medium mb-8 text-sm">
            {loginStep === 'NEW_REGISTER' ? 'Enter your details to start booking' :
             loginStep === 'PIN_SETUP' ? 'Create a secure 4-digit PIN for future logins' :
             loginStep === 'PIN_LOGIN' ? `Welcome back, ${customer?.name}` : 'Login with your registered mobile number'}
          </p>
          
          <div className="space-y-4 mb-6 text-left">
            {loginStep === 'MOBILE' && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-slate-400 font-bold">+91</span>
                </div>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full pl-14 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-lg font-bold text-slate-800 focus:border-blue-500 focus:bg-white transition-all outline-none"
                  placeholder="Mobile Number"
                />
              </div>
            )}

            {loginStep === 'NEW_REGISTER' && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <UserIcon size={18} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold text-slate-800 focus:border-blue-500 focus:bg-white transition-all outline-none"
                  placeholder="Full Name"
                />
              </div>
            )}

            {loginStep !== 'MOBILE' && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} className="text-slate-400" />
                </div>
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-2xl tracking-[1em] font-bold text-slate-800 focus:border-blue-500 focus:bg-white transition-all outline-none"
                  placeholder="••••"
                  autoFocus
                />
              </div>
            )}
            
            {error && (
              <div className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-xl flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}
          </div>
          
          <button 
            onClick={loginStep === 'MOBILE' ? handleMobileSubmit : handleAuthSubmit}
            disabled={loading || (loginStep === 'MOBILE' && mobileNumber.length < 10) || (loginStep !== 'MOBILE' && pin.length < 4)}
            className={`w-full h-14 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
              loading ? 'bg-blue-100 text-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
            }`}
          >
            {loading ? (
               <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <>
                Continue securely <CheckCircle2 size={18} />
              </>
            )}
          </button>
          
          {loginStep !== 'MOBILE' && (
            <button 
              onClick={() => { setLoginStep('MOBILE'); setPin(''); setError(''); }}
              className="mt-4 text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              Change Mobile Number
            </button>
          )}

          <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold text-green-600 bg-green-50 py-2 rounded-lg border border-green-100">
             <Lock size={14} /> Secured via PIN Authentication
          </div>
        </motion.div>
      </div>
    );
  }

  if (bookingSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-[2.5rem] shadow-xl max-w-md w-full text-center border border-slate-100"
        >
          <div className="bg-green-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-2xl font-display font-black text-slate-900 mb-2">Booking Received!</h2>
          <p className="text-slate-500 mb-8">Your tanker request has been sent to the admin. You will be updated shortly.</p>
          
          <button 
            onClick={() => {
              setBookingSuccess(false);
              setLocation(null);
              setRemarks('');
              setDistanceKm(0);
              setFloors(0);
              setPipeLength(50);
            }}
            className="w-full bg-slate-900 text-white h-14 rounded-2xl font-bold hover:bg-slate-800 transition-colors"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Alarm Modal for Reached Status */}
      <AnimatePresence>
        {activeAlarmBill && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-blue-900/80 backdrop-blur-lg p-6 text-center"
          >
            <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-sm w-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-blue-600 animate-pulse" />
              
              <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 animate-bounce">
                <Bell size={48} />
              </div>
              
              <h2 className="text-3xl font-display font-black text-slate-900 mb-2">Driver Reached!</h2>
              <p className="text-slate-500 font-medium mb-8">
                Your water tanker <span className="font-bold text-blue-600">{activeAlarmBill.billNumber}</span> has arrived at your location.
              </p>
              
              <div className="grid gap-3">
                <button 
                  onClick={() => {
                    setIsAlarmSilenced(prev => ({ ...prev, [activeAlarmBill.id!]: true }));
                  }}
                  className="h-16 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-200 flex items-center justify-center gap-3 active:scale-95 transition-all"
                >
                  Stop Ringing
                </button>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2 animate-pulse">
                  Unloading starting soon...
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={32} />
            <div>
              <h1 className="font-display font-bold text-lg leading-none">TankerWala Powered by Rajhans</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{customer?.name}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="text-xs font-bold text-slate-500 hover:text-red-500 bg-slate-50 px-3 py-1.5 rounded-lg transition-colors border border-slate-200"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 pb-24 space-y-6">
        {/* Monthly Analytics */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2rem] p-6 text-white shadow-xl shadow-blue-200">
          <div className="flex items-center gap-2 mb-6">
            <Calendar size={18} className="text-blue-200" />
            <span className="font-bold text-sm text-blue-100 uppercase tracking-widest">{format(new Date(), 'MMMM yyyy')}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-1">Trips</p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-display font-black leading-none">{monthlyTrips}</span>
                <Truck size={20} className="text-blue-300 pb-1" />
              </div>
            </div>
            <div>
              <p className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-1">Spent</p>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-display font-black leading-none">{formatCurrency(monthlyExpense)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Booking Section */}
        {!selectedCategory ? (
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="bg-blue-100 w-10 h-10 rounded-xl flex items-center justify-center text-blue-600">
                <Plus size={20} />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">New Booking</h2>
                <p className="text-xs text-slate-500 font-medium">Select a service category</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => {
                  setSelectedCategory('TANKER');
                  setPipeLength(50);
                }}
                className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center gap-4 text-left group"
              >
                <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <Truck size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-base text-slate-900 leading-tight">Water Tanker (Trip)</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Domestic & Construction</p>
                </div>
              </button>

              <button 
                onClick={() => {
                  setSelectedCategory('STANDBY_TANKER');
                  setQuantity(1);
                  setPipeLength(50);
                }}
                className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center gap-4 text-left group"
              >
                <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
                  <Calendar size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-base text-slate-900 leading-tight">Standby Tanker (Daily)</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">₹900/1st Day, ₹600/Extra</p>
                </div>
              </button>

              <button 
                onClick={() => {
                  setSelectedCategory('MONTHLY_TANKER');
                  setQuantity(1);
                  setPipeLength(20);
                }}
                className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center gap-4 text-left group"
              >
                <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center text-green-600 group-hover:scale-110 transition-transform">
                  <Flask size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-base text-slate-900 leading-tight">Monthly Tanker Rental</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">₹10,000 / Month</p>
                </div>
              </button>

              <button 
                onClick={() => setSelectedCategory('BOTTLE')}
                className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center gap-4 text-left group"
              >
                <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <Droplets size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-base text-slate-900 leading-tight">Packaged Water Bottle</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">500ml, 1L, 2L Bundles</p>
                </div>
              </button>

              <button 
                onClick={() => setSelectedCategory('CAN')}
                className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center gap-4 text-left group"
              >
                <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <Flask size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-base text-slate-900 leading-tight">Water 20 Ltr Can</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">RO Chilled Water</p>
                </div>
              </button>
            </div>
          </div>
        ) : (selectedCategory === 'TANKER' || selectedCategory === 'STANDBY_TANKER' || selectedCategory === 'MONTHLY_TANKER') ? (
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <button onClick={() => setSelectedCategory(null)} className="p-2 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200 transition-colors">
                <X size={16} />
              </button>
              <div>
                <h2 className="font-bold text-slate-900">
                  {selectedCategory === 'TANKER' ? 'Book Water Tanker' : 
                   selectedCategory === 'STANDBY_TANKER' ? 'Standby Tanker Rental' : 'Monthly Tanker Rental'}
                </h2>
                <p className="text-xs text-slate-500 font-medium">Select location & details</p>
              </div>
            </div>

            <div>
               <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center justify-between">
                 <span>Delivery Location <span className="text-red-500">*</span></span>
                 <button 
                   onClick={() => {}}
                   className="text-[10px] text-blue-600 font-bold"
                 >
                   Move pin to your exact point
                 </button>
               </label>
               <div className="h-64 rounded-2xl overflow-hidden border-2 border-slate-100">
                 <LocationPicker onLocationSelect={handleLocationSelectWrapper} />
               </div>
               {location && (
                  <div className="mt-3 space-y-2">
                    <div className="bg-green-50 text-green-700 p-3 rounded-xl text-sm font-medium flex items-start gap-2 border border-green-100">
                      <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{location.address}</span>
                    </div>
                    <div className="bg-blue-50 text-blue-700 p-3 rounded-xl text-xs font-bold flex items-center justify-between border border-blue-100 tracking-wider">
                      <span>DISTANCE FROM BASE</span>
                      <span className="text-sm">{distanceKm.toFixed(1)} KM</span>
                    </div>
                  </div>
               )}
            </div>

            {location && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                className="space-y-4 pt-2 border-t border-slate-100"
              >
                {(selectedCategory === 'STANDBY_TANKER' || selectedCategory === 'MONTHLY_TANKER') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                      {selectedCategory === 'STANDBY_TANKER' ? 'Number of Days' : 'Number of Months'}
                    </label>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setQuantity(q => q > 1 ? q - 1 : 1)}
                        className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center font-bold text-lg hover:bg-slate-200 active:scale-95 transition-all"
                      >
                        -
                      </button>
                      <div className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-center font-black text-xl">
                        {quantity}
                      </div>
                      <button 
                        onClick={() => setQuantity(q => q + 1)}
                        className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-lg hover:bg-blue-700 active:scale-95 transition-all"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {selectedCategory === 'TANKER' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Delivery Floor</label>
                    <select 
                      value={floors}
                      onChange={(e) => setFloors(Number(e.target.value))}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-bold focus:border-blue-500 focus:bg-white outline-none transition-all"
                    >
                      <option value={0}>Ground Floor</option>
                      <option value={1}>1st Floor</option>
                      <option value={2}>2nd Floor</option>
                      <option value={3}>3rd Floor (+₹70)</option>
                      <option value={4}>4th Floor (+₹140)</option>
                      <option value={5}>5th Floor (+₹210)</option>
                    </select>
                  </div>
                )}

                {/* Extra Pipe */}
                {selectedCategory === 'TANKER' && (
                   <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center justify-between">
                      <span>Required Pipe Length (Feet)</span>
                      <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{pipeLength} ft</span>
                    </label>
                    <div className="bg-slate-50 border-2 border-slate-100 rounded-xl p-4">
                      <input 
                        type="range" 
                        min="50" 
                        max="200" 
                        step="10"
                        value={pipeLength}
                        onChange={(e) => setPipeLength(Number(e.target.value))}
                        className="w-full mb-3 accent-blue-600" 
                      />
                      <div className="flex justify-between text-[10px] font-bold text-slate-400">
                        <span>50ft (Free)</span>
                        <span>100ft (+₹50)</span>
                        <span>200ft (+₹3/ft)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Remarks & Total Estimate */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Special Remarks (Optional)</label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Any specific instructions for the driver?"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-medium focus:border-blue-500 focus:bg-white outline-none transition-all resize-none h-20"
                  />
                </div>

                <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-lg">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Estimated Total</div>
                    <div className="text-xs text-slate-300 font-medium mt-1 leading-tight">
                      {selectedCategory === 'TANKER' ? (
                        <>
                          Base: ₹350 <br/>
                          Dist ({distanceKm.toFixed(1)}km): +₹{(Math.round(distanceKm) * 50)} <br/>
                          {floors > 2 && <>Floors: +₹{(floors - 2) * 70} <br/></>}
                          {pipeLength > 50 && pipeLength <= 100 && <>Pipe: +₹50 <br/></>}
                          {pipeLength > 100 && <>Pipe: +₹{50 + ((pipeLength - 100) * 3)} <br/></>}
                        </>
                      ) : selectedCategory === 'STANDBY_TANKER' ? (
                        <>
                          Base (Day 1): ₹900 <br/>
                          Extra ({quantity-1} days): +₹{Math.max(0, (quantity - 1) * 600)} <br/>
                          Pipe: 50ft Included <br/>
                          Distance: Up to 5km Included
                        </>
                      ) : (
                        <>
                          Monthly Rate: ₹10,000 <br/>
                          Quantity: {quantity} Month(s) <br/>
                          Pipe: 20ft Included
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-2xl font-display font-black text-green-400">
                    {formatCurrency(totalEstimate)}
                  </div>
                </div>
              </motion.div>
            )}

            {error && (
              <div className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-xl flex items-center gap-2 mt-4">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <button
              onClick={handleBookNow}
              disabled={bookingLoading || !location}
              className={`w-full mt-4 h-14 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
                bookingLoading || !location
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-200'
              }`}
            >
              {bookingLoading ? (
                 <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              ) : (
                'Book Now'
              )}
            </button>
          </div>
        ) : selectedCategory === 'BOTTLE' ? (
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <button onClick={() => setSelectedCategory(null)} className="p-2 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200 transition-colors">
                <X size={16} />
              </button>
              <div>
                <h2 className="font-bold text-slate-900">Book Water Bottles</h2>
                <p className="text-xs text-slate-500 font-medium">Select size and quantity</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(['500ml', '1L', '2L'] as const).map(size => (
                <button 
                  key={size}
                  onClick={() => setBottleSize(size)}
                  className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${bottleSize === size ? 'border-blue-600 bg-blue-50' : 'border-slate-100 bg-white'}`}
                >
                  <div className={`p-2 rounded-lg ${bottleSize === size ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <Droplets size={20} />
                  </div>
                  <span className="font-black text-sm">{size}</span>
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Number of Cases / Bundles</label>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setQuantity(q => q > 1 ? q - 1 : 1)}
                  className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center font-bold text-lg hover:bg-slate-200 active:scale-95 transition-all"
                >
                  -
                </button>
                <div className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-center font-black text-xl">
                  {quantity}
                </div>
                <button 
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-lg hover:bg-blue-700 active:scale-95 transition-all"
                >
                  +
                </button>
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-lg">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Estimated Total</div>
                <div className="text-2xl font-display font-black text-green-400">
                  {formatCurrency(totalEstimate)}
                </div>
              </div>
              <button
                onClick={handleBookNow}
                disabled={bookingLoading}
                className="bg-blue-600 px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
              >
                {bookingLoading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> : 'Book Now'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <button onClick={() => setSelectedCategory(null)} className="p-2 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200 transition-colors">
                <X size={16} />
              </button>
              <div>
                <h2 className="font-bold text-slate-900">Book 20L Cans</h2>
                <p className="text-xs text-slate-500 font-medium">RO Chilled Water</p>
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-[2rem] flex flex-col items-center text-center border border-blue-100">
               <div className="w-20 h-20 bg-white rounded-[1.5rem] shadow-sm flex items-center justify-center text-blue-600 mb-4">
                  <Flask size={40} />
               </div>
               <h3 className="font-black text-base">RO 20 Ltr Can</h3>
               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-2">₹80 Per Can</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Quantity of Cans</label>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setQuantity(q => q > 1 ? q - 1 : 1)}
                  className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center font-bold text-lg hover:bg-slate-200 active:scale-95 transition-all"
                >
                  -
                </button>
                <div className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-center font-black text-xl">
                  {quantity}
                </div>
                <button 
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-lg hover:bg-blue-700 active:scale-95 transition-all"
                >
                  +
                </button>
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-lg">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Estimated Total</div>
                <div className="text-2xl font-display font-black text-green-400">
                  {formatCurrency(totalEstimate)}
                </div>
              </div>
              <button
                onClick={handleBookNow}
                disabled={bookingLoading}
                className="bg-blue-600 px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
              >
                {bookingLoading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> : 'Book Now'}
              </button>
            </div>
          </div>
        )}

        {/* Recent History */}
        {bills.length > 0 && (
          <div>
            <h3 className="font-display font-bold text-lg mb-4 text-slate-800">Recent Trips</h3>
            <div className="space-y-4">
              {bills.slice(0, 5).map(bill => (
                <div 
                  key={bill.id} 
                  className={`bg-white p-4 rounded-[1.5rem] shadow-sm border transition-all cursor-pointer ${expandedTripId === bill.id ? 'border-blue-400 ring-2 ring-blue-50' : 'border-slate-200 hover:border-blue-200'}`}
                  onClick={() => setExpandedTripId(expandedTripId === bill.id ? null : bill.id!)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-800 border-b-2 border-slate-100">{bill.billNumber}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          bill.status === 'Delivered' || bill.status === 'Printed' ? 'bg-green-100 text-green-700' :
                          (bill.status === 'Pending' || bill.status === 'Filling' || bill.status === 'Assigned' || bill.status === 'On the way') ? 'bg-orange-100 text-orange-700' : 
                          bill.status === 'Reached' ? 'bg-blue-600 text-white animate-pulse' : 'bg-red-100 text-red-700'
                        }`}>
                          {bill.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium tracking-wide block">
                        {bill.createdAt?.toDate ? format(bill.createdAt.toDate(), 'dd MMM, hh:mm a') : format(new Date(bill.date), 'dd MMM')}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900 border-b-2 border-slate-100 mb-1">{formatCurrency(bill.grandTotal)}</div>
                      <div className="text-[10px] text-slate-500 font-medium">{bill.paymentMode}</div>
                    </div>
                  </div>

                  {/* Active Delivery Information */}
                  {(bill.status === 'Pending' || bill.status === 'Filling' || bill.status === 'Assigned' || bill.status === 'On the way' || bill.status === 'Reached') && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      {bill.driverName && (
                        <div className="flex items-center justify-between bg-blue-50 text-blue-900 p-3 rounded-xl mb-2 border border-blue-100">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-200 rounded-full flex items-center justify-center text-blue-700">
                              <Truck size={14} />
                            </div>
                            <div>
                              <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Driver Assigned</div>
                              <div className="text-xs font-black">{bill.driverName}</div>
                            </div>
                          </div>
                          {bill.driverMobile && (
                            <a href={`tel:${bill.driverMobile}`} onClick={(e) => e.stopPropagation()} className="flex items-center justify-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
                              <Phone size={12} /> Call
                            </a>
                          )}
                        </div>
                      )}
                      
                      {bill.driverId && driverLocations[bill.driverId] && (
                        <div className="bg-slate-50 rounded-2xl p-3 mb-2 border border-slate-100">
                           <div className="flex items-center justify-between mb-2">
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                               <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                               Live Tracking Active
                             </span>
                             <span className="text-[10px] font-bold text-blue-600">Speed: {Math.round(driverLocations[bill.driverId].speed || 0)} km/h</span>
                           </div>
                           <div className="h-32 bg-slate-200 rounded-xl overflow-hidden relative">
                             <div className="absolute inset-0 flex items-center justify-center bg-blue-50">
                                <div className="text-center p-4">
                                   <MapPin className="text-blue-500 mx-auto mb-2 animate-bounce" size={24} />
                                   <p className="text-[10px] font-bold text-slate-500">Driver is nearby</p>
                                   <button 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       window.open(`https://www.google.com/maps/search/?api=1&query=${driverLocations[bill.driverId!].latitude},${driverLocations[bill.driverId!].longitude}`);
                                     }}
                                     className="mt-2 text-[9px] font-black text-blue-600 uppercase border-b border-blue-200"
                                   >
                                     View Real-time Map
                                   </button>
                                </div>
                             </div>
                           </div>
                        </div>
                      )}
                      
                      <TripCountdown createdAt={bill.createdAt || bill.date} />
                    </div>
                  )}

                  {/* Actions Tray on Click */}
                  <AnimatePresence>
                    {expandedTripId === bill.id && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }} 
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-slate-100">
                           <button onClick={(e) => { e.stopPropagation(); setModalView({ type: 'BILL', bill }); }} className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-300 transition-all text-slate-600">
                             <Receipt size={18} className="text-blue-500" />
                             <span className="text-[10px] font-bold">View Bill</span>
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); setModalView({ type: 'QR', bill }); }} className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-300 transition-all text-slate-600">
                             <QrCode size={18} className="text-purple-500" />
                             <span className="text-[10px] font-bold">Pay (QR)</span>
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); setModalView({ type: 'ACCOUNT', bill }); }} className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-300 transition-all text-slate-600">
                             <UserIcon size={18} className="text-orange-500" />
                             <span className="text-[10px] font-bold">Account</span>
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); setModalView({ type: 'CHAT', bill }); }} className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-300 transition-all text-slate-600">
                             <MessageCircle size={18} className="text-green-500" />
                             <span className="text-[10px] font-bold">Feedback</span>
                           </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modals Handler */}
      <AnimatePresence>
         {modalView && (
           <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
           >
             {modalView.type === 'CHAT' ? (
                <LiveChatModal bill={modalView.bill} customerName={customer.name} onClose={() => setModalView(null)} />
             ) : (
               <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col max-h-[80vh]">
                 <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <span className="font-bold text-sm text-slate-700 uppercase tracking-widest">{
                      modalView.type === 'BILL' ? 'Bill Preview' :
                      modalView.type === 'QR' ? 'Payment QR' : 'Account Summary'
                    }</span>
                    <button onClick={() => setModalView(null)} className="p-1.5 bg-white text-slate-400 hover:text-slate-700 rounded-full shadow-sm"><X size={18} /></button>
                 </div>
                 <div className="p-6 overflow-y-auto">
                    {modalView.type === 'BILL' && (
                      <div className="text-center font-mono space-y-2">
                        <h2 className="text-xl font-bold border-b-2 border-dashed pb-2 mb-4 uppercase">TankerWala Powered by Rajhans</h2>
                        <div className="flex justify-between text-sm"><span>Token:</span> <span className="font-bold">{modalView.bill.billNumber}</span></div>
                        <div className="flex justify-between text-sm"><span>Date:</span> <span>{modalView.bill.date}</span></div>
                        <div className="flex justify-between text-sm"><span>Name:</span> <span>{modalView.bill.customerName}</span></div>
                        <div className="border-t-2 border-dashed my-4 pt-4 flex justify-between font-bold text-lg">
                           <span>Total:</span>
                           <span>{formatCurrency(modalView.bill.grandTotal)}</span>
                        </div>
                        <p className="text-xs text-slate-500 italic mt-8">Thank you for booking with us.</p>
                      </div>
                    )}
                    {modalView.type === 'QR' && (
                      <div className="flex flex-col items-center py-4">
                        <QRCodeSVG value={`upi://pay?pa=milan.sharma6565@okicici&pn=TankerWala%20Powered%20by%20Rajhans&am=${modalView.bill.grandTotal}&cu=INR`} size={200} />
                        <div className="mt-8 text-center text-sm font-bold text-slate-700 bg-slate-100 px-4 py-2 rounded-xl">
                          Scan to pay {formatCurrency(modalView.bill.grandTotal)}
                        </div>
                      </div>
                    )}
                    {modalView.type === 'ACCOUNT' && (
                      <div className="space-y-6">
                        <div className="text-center">
                          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Total Outstanding</div>
                          <div className={`text-4xl font-display font-black ${customer.pendingAmount > 0 ? 'text-red-500' : 'text-green-500'}`}>
                             {formatCurrency(customer.pendingAmount || 0)}
                          </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="text-xs font-bold text-slate-800 mb-2">Customer Details</div>
                          <div className="text-sm flex justify-between py-1 border-b border-slate-100">
                             <span className="text-slate-500">Name</span>
                             <span className="font-medium text-slate-900">{customer.name}</span>
                          </div>
                          <div className="text-sm flex justify-between py-1 border-b border-slate-100">
                             <span className="text-slate-500">Mobile</span>
                             <span className="font-medium text-slate-900">{customer.mobile}</span>
                          </div>
                          <div className="text-sm flex justify-between py-1">
                             <span className="text-slate-500">Total Trips (Month)</span>
                             <span className="font-medium text-slate-900">{monthlyTrips}</span>
                          </div>
                        </div>
                      </div>
                    )}
                 </div>
               </div>
             )}
           </motion.div>
         )}
      </AnimatePresence>
    </div>
  );
}

