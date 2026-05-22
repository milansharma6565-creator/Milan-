import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, addDoc, collection, serverTimestamp, onSnapshot, query, where, deleteDoc, getDocs } from 'firebase/firestore';
import { Bill } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Truck, CheckCircle2, XCircle, Clock, RefreshCw, Phone, MapPin } from 'lucide-react';
import { formatCurrency } from '../constants';
import { Logo } from './Logo';

export function CustomerOrderView({ billId }: { billId: string }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestStatus, setRequestStatus] = useState<'none' | 'pending' | 'accepted' | 'rejected'>('none');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<any>(null);
  const beepAudio = useRef<HTMLAudioElement | null>(null);
  const prevStatus = useRef<string | null>(null);

  useEffect(() => {
    const unsubBill = onSnapshot(doc(db, 'bills', billId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Bill;
        setBill(data);
        setLoading(false);
        
        // Audio Logic
        if (!beepAudio.current) {
          const audio = document.createElement('audio');
          audio.src = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
          beepAudio.current = audio;
        }
        
        if (prevStatus.current && prevStatus.current !== data.status) {
           beepAudio.current.play().catch(() => {});
        }
        prevStatus.current = data.status;
      } else {
        setError('Bill not found');
        setLoading(false);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `bills/${billId}`);
      setLoading(false);
    });

    const q = query(
        collection(db, 'bookingRequests'), 
        where('billId', '==', billId),
        where('status', 'in', ['Pending', 'Accepted'])
    );
    
    const unsubscribeRequests = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const latest = snapshot.docs.find(d => d.data().status === 'Pending' || d.data().status === 'Accepted') || snapshot.docs[0];
            setRequestId(latest.id);
            setRequestStatus(latest.data().status.toLowerCase() as any);
        } else {
            setRequestStatus('none');
            setRequestId(null);
        }
    }, (err: any) => {
      console.error("Booking requests check failed:", err?.message || String(err));
    });

    return () => {
      unsubBill();
      unsubscribeRequests();
    };
  }, [billId]);

  useEffect(() => {
    if (!bill?.driverId) {
      setDriverLocation(null);
      return;
    }
    const unsubLoc = onSnapshot(doc(db, 'driverLocations', bill.driverId), (locSnap) => {
      if (locSnap.exists()) setDriverLocation(locSnap.data());
    }, (err: any) => {
      console.error("Driver location tracking failed:", err?.message || String(err));
    });
    return () => unsubLoc();
  }, [bill?.driverId]);

  const handleRebook = async () => {
    if (!bill) return;
    setRequestStatus('pending');
    try {
      await addDoc(collection(db, 'bookingRequests'), {
        billId: bill.id,
        customerId: bill.customerId,
        customerName: bill.customerName,
        customerMobile: bill.customerMobile,
        tankerSize: bill.tankerSize,
        remarks: remarks.trim(),
        status: 'Pending',
        requestedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bookingRequests');
      setRequestStatus('none');
    }
  };

  const handleCancelRequest = async () => {
    if (!requestId) return;
    try {
      await deleteDoc(doc(db, 'bookingRequests', requestId));
      setRequestStatus('none');
      setRequestId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookingRequests/${requestId}`);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-8">
        <div className="absolute inset-0 flex items-center justify-center opacity-10 animate-pulse scale-[2.5]">
          <Logo size={120} />
        </div>
        <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center relative z-10 shadow-2xl shadow-blue-200">
          <Logo size={48} color="white" />
        </div>
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-1">TankerWala</h2>
      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">Loading Bill Details...</p>
    </div>
  );

  if (error || !bill) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <XCircle className="text-red-500 mb-4" size={64} />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Bill</h1>
      <p className="text-slate-500">This bill link is invalid or has expired.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-10">
      <div className="max-w-md w-full">
        <div className="flex flex-col items-center justify-center gap-3 mb-10">
          <Logo size={56} />
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Tanker<span className="relative text-blue-600">Wala<span className="absolute top-full left-0 text-[10px] text-slate-400 font-medium whitespace-nowrap normal-case tracking-normal mt-0.5">Powered by Rajhans</span></span>
          </h1>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden"
        >
          <div className="p-8 text-center bg-blue-600 text-white">
            <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Truck size={40} />
            </div>
            <h2 className="text-2xl font-bold">Bill Details</h2>
            <p className="opacity-80">Bill #: {bill.billNumber}</p>
          </div>

          <div className="p-8 space-y-6">
            <div className="flex justify-between border-b border-slate-100 pb-4">
              <span className="text-slate-400">Customer</span>
              <span className="font-bold text-slate-900">{bill.customerName}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-4">
              <span className="text-slate-400">Tanker Size</span>
              <span className="font-bold text-slate-900">{bill.tankerSize}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-4">
              <span className="text-slate-400">Amount Paid</span>
              <span className="font-bold text-slate-900">{formatCurrency(bill.grandTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status</span>
              <span className={`font-bold ${bill.status === 'Delivered' ? 'text-green-500' : 'text-orange-500'}`}>
                {bill.status}
              </span>
            </div>

            {bill.driverId && driverLocation && (
              <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                      <Truck size={20} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Driver Details</p>
                       <h4 className="font-bold text-slate-900">{bill.driverName}</h4>
                    </div>
                  </div>
                  {bill.driverMobile && (
                    <a href={`tel:${bill.driverMobile}`} className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                      <Phone size={18} />
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between mb-3 px-1">
                   <div className="flex items-center gap-1.5 font-black text-[10px] text-blue-500 uppercase">
                     <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                     Live Tracking Active
                   </div>
                   <div className="text-[10px] font-bold text-slate-400 uppercase">
                     {Math.round(driverLocation.speed || 0)} KM/H
                   </div>
                </div>

                <div className="h-40 bg-slate-200 rounded-2xl overflow-hidden relative border-2 border-white shadow-inner">
                   <div className="absolute inset-0 bg-blue-50 flex flex-col items-center justify-center">
                      <MapPin className="text-blue-500 animate-bounce mb-2" size={32} />
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tanker is on the way</p>
                      <button 
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${driverLocation.latitude},${driverLocation.longitude}`)}
                        className="mt-2 text-[10px] font-black text-blue-600 uppercase border-b-2 border-blue-200 pb-0.5"
                      >
                        Open Real-time Map
                      </button>
                   </div>
                </div>
              </div>
            )}

            {requestStatus === 'none' && (
              <div className="pt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Special Instructions / Remarks</label>
                  <textarea 
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="E.g. Call before coming, Deliver at back gate..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all min-h-[100px]"
                  />
                </div>
                <button 
                  onClick={handleRebook}
                  className="w-full bg-blue-600 text-white h-14 rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-3"
                >
                  <RefreshCw size={20} />
                  Rebook Same Order
                </button>
              </div>
            )}

            {requestStatus === 'pending' && (
              <div className="pt-6 space-y-4">
                <div className="bg-orange-50 p-6 rounded-3xl text-center border border-orange-100">
                  <Clock className="text-orange-500 mx-auto mb-3 animate-pulse" size={40} />
                  <h3 className="font-bold text-orange-900">Rebooking Pending</h3>
                  <p className="text-sm text-orange-700 mt-1">Admin is reviewing your request. Please wait...</p>
                </div>
                <button 
                  onClick={handleCancelRequest}
                  className="w-full bg-slate-100 text-slate-600 h-10 rounded-xl text-sm font-bold active:scale-95 transition-all"
                >
                  Cancel Request
                </button>
              </div>
            )}

            {requestStatus === 'accepted' && (
              <div className="pt-6 bg-green-50 p-6 rounded-3xl text-center border border-green-100">
                <CheckCircle2 className="text-green-500 mx-auto mb-3" size={40} />
                <h3 className="font-bold text-green-900">Order Accepted!</h3>
                <p className="text-sm text-green-700 mt-1">Your new trip is being scheduled. Driver will contact you soon.</p>
              </div>
            )}
          </div>
        </motion.div>
        
        <p className="mt-8 text-center text-slate-400 text-xs font-semibold uppercase tracking-widest pb-4">
            Tanker<span className="relative text-blue-600">Wala<span className="absolute top-[90%] left-0 text-[8px] text-slate-400 font-medium whitespace-nowrap tracking-normal normal-case mt-0.5">Powered by Rajhans</span></span>
        </p>
      </div>
    </div>
  );
}
