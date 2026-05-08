import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, addDoc, collection, serverTimestamp, onSnapshot, query, where, deleteDoc, getDocs } from 'firebase/firestore';
import { Bill } from '../types';
import { motion } from 'motion/react';
import { Truck, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../constants';
import { Logo } from './Logo';

export function CustomerOrderView({ billId }: { billId: string }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestStatus, setRequestStatus] = useState<'none' | 'pending' | 'accepted' | 'rejected'>('none');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBill = async () => {
      try {
        const docRef = doc(db, 'bills', billId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setBill({ id: docSnap.id, ...docSnap.data() } as Bill);
        } else {
          setError('Bill not found');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `bills/${billId}`);
      } finally {
        setLoading(false);
      }
    };

    fetchBill();

    // Listen for existing booking requests for this bill
    const q = query(
        collection(db, 'bookingRequests'), 
        where('billId', '==', billId),
        where('status', 'in', ['Pending', 'Accepted'])
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            // Find the active request (Pending or Accepted)
            const latest = snapshot.docs.find(d => d.data().status === 'Pending' || d.data().status === 'Accepted') || snapshot.docs[0];
            setRequestId(latest.id);
            setRequestStatus(latest.data().status.toLowerCase() as any);
        } else {
            setRequestStatus('none');
            setRequestId(null);
        }
    });

    return () => unsubscribe();
  }, [billId]);

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <RefreshCw className="animate-spin text-blue-600" size={32} />
    </div>
  );

  if (error || !bill) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <XCircle className="text-red-500 mb-4" size={64} />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Token</h1>
      <p className="text-slate-500">This order link is invalid or has expired.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-10">
      <div className="max-w-md w-full">
        <div className="flex items-center justify-center gap-3 mb-10">
          <Logo size={48} />
          <h1 className="text-2xl font-display font-bold uppercase tracking-tight text-blue-900">Rajhans</h1>
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
            <h2 className="text-2xl font-bold">Order Details</h2>
            <p className="opacity-80">Token: {bill.billNumber}</p>
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
        
        <p className="mt-8 text-center text-slate-400 text-xs font-semibold uppercase tracking-widest">
            Rajhans Steel & Water Service
        </p>
      </div>
    </div>
  );
}
