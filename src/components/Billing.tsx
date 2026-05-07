import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, addDoc, updateDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { Customer, Driver, Bill } from '../types';
import { Search, MapPin, Phone, IndianRupee, Printer, X, CheckCircle2, UserPlus, Share2, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TANKER_SIZES, PAYMENT_MODES, BILL_STATUSES, formatCurrency, generateBillNumber } from '../constants';
import { useReactToPrint } from 'react-to-print';
import { ThermalInvoice } from './ThermalInvoice';
import { format } from 'date-fns';
import { toJpeg } from 'html-to-image';

export function Billing({ onBillCreated }: { onBillCreated?: () => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showBookingSuccess, setShowBookingSuccess] = useState(false);
  const [bookedBill, setBookedBill] = useState<any>(null);
  const [lastBill, setLastBill] = useState<any>(null);
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ name: '', mobile: '', address: '' });
  const [quickAddValidation, setQuickAddValidation] = useState<{ name?: string }>({});
  const thermalRef = useRef<HTMLDivElement>(null);

  // Real-time duplicate checking for Quick Register
  useEffect(() => {
    if (!isQuickAdding || !quickAddForm.name) {
      setQuickAddValidation({});
      return;
    }
    
    const checkName = async () => {
      const q = query(collection(db, 'customers'), where('name', '==', quickAddForm.name.trim()));
      const snap = await getDocs(q);
      
      const nameExists = !snap.empty;
      const mobileExists = snap.docs.some(doc => doc.data().mobile === quickAddForm.mobile);

      if (nameExists && !mobileExists && quickAddForm.mobile) {
        setQuickAddValidation({ name: 'name already exist try different name' });
      } else if (nameExists && mobileExists) {
        setQuickAddValidation({ name: 'customer already exist' });
      } else {
        setQuickAddValidation({});
      }
    };

    const timer = setTimeout(checkName, 500);
    return () => clearTimeout(timer);
  }, [quickAddForm.name, quickAddForm.mobile, isQuickAdding]);

  const [form, setForm] = useState({
    billNumber: '',
    date: new Date().toISOString().slice(0, 16),
    tankerSize: TANKER_SIZES[0].value,
    quantity: 1,
    rate: TANKER_SIZES[0].defaultRate,
    extraCharges: 0,
    discount: 0,
    status: 'Delivered' as typeof BILL_STATUSES[number],
    customAddress: '',
    driverName: '',
    paymentMode: 'Cash' as typeof PAYMENT_MODES[number],
    splitCash: 0,
    splitUPI: 0,
    splitPending: 0
  });

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'drivers'));
    return onSnapshot(q, 
      (snapshot) => setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'drivers')
    );
  }, []);

  useEffect(() => {
    async function initBillNumber() {
      try {
        const snapshot = await getDocs(collection(db, 'bills'));
        setForm(prev => ({ ...prev, billNumber: generateBillNumber(snapshot.size + 1) }));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'bills');
      }
    }
    initBillNumber();
  }, []);

  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    // Since Firestore doesn't support 'contains', we fetch all and filter client-side 
    // or use prefix search. For now, let's fetch all customers and filter.
    // In a real production app with thousands of customers, we'd use Algolia or prefix search.
    const q = query(collection(db, 'customers'));
    return onSnapshot(q, 
      (snapshot) => {
        const term = searchTerm.toLowerCase();
        const filtered = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer))
          .filter(c => 
            c.name.toLowerCase().includes(term) || 
            c.mobile.includes(term) ||
            (c.secondaryMobiles?.some(m => m.includes(term)) || false)
          )
          .slice(0, 10);
        setSearchResults(filtered);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'customers')
    );
  }, [searchTerm]);

  const handleCustomerSelect = async (c: Customer) => {
    setSelectedCustomer(c);
    setForm(prev => ({ 
      ...prev, 
      customAddress: c.address,
      rate: c.lastRate || prev.rate 
    }));
    setSearchTerm(c.name);

    const cleanTerm = searchTerm.replace(/\D/g, '');
    if (cleanTerm.length === 10 && cleanTerm !== c.mobile && !c.secondaryMobiles?.includes(cleanTerm)) {
      const updatedSecondaries = [...(c.secondaryMobiles || []), cleanTerm];
      try {
        await updateDoc(doc(db, 'customers', c.id!), { secondaryMobiles: updatedSecondaries });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `customers/${c.id}`);
      }
    }
  };

  const subtotal = form.quantity * form.rate;
  const grandTotal = subtotal + form.extraCharges - form.discount;

  useEffect(() => {
    const size = TANKER_SIZES.find(s => s.value === form.tankerSize);
    if (size) {
      setForm(prev => ({ ...prev, rate: size.defaultRate }));
    }
  }, [form.tankerSize]);

  const [showStatusSelection, setShowStatusSelection] = useState(false);

  const shareBillImage = async (bill: any) => {
    if (!selectedCustomer || !thermalRef.current) return;
    
    try {
      // Capture the thermal receipt as JPEG
      const dataUrl = await toJpeg(thermalRef.current, { 
        quality: 0.95,
        backgroundColor: '#ffffff',
        pixelRatio: 2 // Higher quality
      });
      
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `Token_${bill.billNumber}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      // Try Web Share API (Best for Mobile WhatsApp)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Token #${bill.billNumber}`,
            text: `Trip Token from Rajhans steel and Water for amount ₹${bill.grandTotal}`
          });
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            console.log('Share canceled by user');
            return; // Exit silently
          }
          console.warn('Web Share failed, trying fallback:', shareErr);
        }
      }

      // Fallback: Download and Send Message
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      link.click();

      // Open WhatsApp link as fallback
      sendWhatsApp(bill);
      alert('Token Image Downloaded. You can now share it manually on WhatsApp.');
    } catch (err) {
      console.error('Error sharing image:', err);
      // Fallback to text WhatsApp
      sendWhatsApp(bill);
    }
  };

  const sendWhatsApp = (bill: any) => {
    if (!selectedCustomer) return;
    const message = `*Trip Token Generated - Rajhans steel and Water* 🚛\n\n` +
      `*Token No:* #${bill.billNumber}\n` +
      `*Date:* ${new Date(bill.date).toLocaleDateString()}\n` +
      `*Total Amount:* ₹${bill.grandTotal}\n` +
      `*Current Balance:* ₹${selectedCustomer.balance}\n\n` +
      `Thank you for choosing Rajhans steel and Water!`;
    
    // Using international format for mobile if needed, but assuming 10 digit Indian number
    const phone = selectedCustomer.mobile.startsWith('91') ? selectedCustomer.mobile : `91${selectedCustomer.mobile}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  useEffect(() => {
    if (showBookingSuccess) {
      const timer = setTimeout(() => {
        setShowBookingSuccess(false);
      }, 5000); // Increased slightly to give user time to click WhatsApp if needed
      return () => clearTimeout(timer);
    }
  }, [showBookingSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      alert('Please select a customer');
      return;
    }

    try {
      // Save sticky rate to customer
      await updateDoc(doc(db, 'customers', selectedCustomer.id!), { lastRate: form.rate });

      const billData = {
        billNumber: form.billNumber,
        date: form.date, // Store as string ISO in firestore or convert to Date
        customerId: selectedCustomer.id!,
        customerName: selectedCustomer.name,
        customerMobile: selectedCustomer.mobile,
        customerAddress: form.customAddress || selectedCustomer.address,
        tankerSize: form.tankerSize,
        quantity: form.quantity,
        rate: form.rate,
        totalAmount: subtotal,
        extraCharges: form.extraCharges,
        discount: form.discount,
        grandTotal: grandTotal,
        paymentMode: 'Pending',
        driverName: form.driverName,
        status: 'Pending',
        isSettled: false,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'bills'), billData);
      setBookedBill({ ...billData, id: docRef.id });
      setShowBookingSuccess(true);
      
      // Reset form for next entry partially
      const snapshotSize = (await getDocs(collection(db, 'bills'))).size;
      setForm(prev => ({
        ...prev,
        billNumber: generateBillNumber(snapshotSize + 1),
        quantity: 1,
        extraCharges: 0,
        discount: 0,
        driverName: ''
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bills');
    }
  };

  const handleStatusUpdate = async (status: typeof BILL_STATUSES[number]) => {
    if (!lastBill?.id) return;
    
    try {
      await updateDoc(doc(db, 'bills', lastBill.id), { status });
      setShowStatusSelection(false);
      setShowInvoice(false);
      if (onBillCreated) onBillCreated();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${lastBill.id}`);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddForm.name || !quickAddForm.mobile) return;

    try {
      // Check for duplicate mobile or name
      const qMobile = query(collection(db, 'customers'), where('mobile', '==', quickAddForm.mobile));
      const qName = query(collection(db, 'customers'), where('name', '==', quickAddForm.name.trim()));
      
      const [mobileSnap, nameSnap] = await Promise.all([getDocs(qMobile), getDocs(qName)]);
      
      if (!mobileSnap.empty || !nameSnap.empty) {
        const duplicateType = !mobileSnap.empty ? 'mobile number' : 'name';
        alert(`A customer with this ${duplicateType} already exists!`);
        
        // Select the existing customer instead
        const existingDoc = !mobileSnap.empty ? mobileSnap.docs[0] : nameSnap.docs[0];
        const existing = { id: existingDoc.id, ...existingDoc.data() } as Customer;
        
        setSelectedCustomer(existing);
        setForm(prev => ({ ...prev, customAddress: existing.address }));
        setSearchTerm(existing.name);
        setIsQuickAdding(false);
        setQuickAddForm({ name: '', mobile: '', address: '' });
        return;
      }

      const newCust = {
        name: quickAddForm.name.trim(),
        mobile: quickAddForm.mobile,
        address: quickAddForm.address,
        pendingAmount: 0,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'customers'), newCust);
      const added = { ...newCust, id: docRef.id } as Customer;
      setSelectedCustomer(added);
      setForm(prev => ({ ...prev, customAddress: added.address }));
      setSearchTerm(added.name);
      setIsQuickAdding(false);
      setQuickAddForm({ name: '', mobile: '', address: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'customers');
    }
  };

  return (
    <div className="p-4 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-display font-bold">New Trip Token</h1>
        <div className="text-sm font-mono bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100">
          {form.billNumber}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Customer Search Section */}
        <div className="material-card">
          <label className="text-sm font-semibold text-slate-500 mb-2 block">Search Customer</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Enter mobile or name..."
              className="material-input pl-12"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (selectedCustomer) setSelectedCustomer(null);
              }}
            />
          </div>

          <AnimatePresence>
            {searchTerm.length >= 2 && !selectedCustomer && !isQuickAdding && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 border rounded-2xl overflow-hidden bg-white shadow-xl z-20 flex flex-col"
              >
                {searchResults && searchResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleCustomerSelect(c)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
                  >
                    <div>
                      <div className="font-bold">{c.name}</div>
                      <div className="text-sm text-slate-500">{c.mobile}</div>
                    </div>
                    <CheckCircle2 className="text-blue-500" size={20} />
                  </button>
                ))}
                
                <button
                  type="button"
                  onClick={() => {
                    setQuickAddForm({ 
                      name: searchTerm.match(/^\d{10}$/) ? '' : searchTerm, 
                      mobile: searchTerm.match(/^\d{10}$/) ? searchTerm : '', 
                      address: '' 
                    });
                    setIsQuickAdding(true);
                  }}
                  className="w-full p-4 flex items-center gap-3 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-left"
                >
                  <UserPlus size={20} />
                  <div>
                    <div className="font-bold">Add as New Customer</div>
                    <div className="text-[10px] uppercase font-bold opacity-70">Quick Register</div>
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isQuickAdding && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }} 
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-4 border-2 border-blue-100 rounded-3xl p-5 bg-white shadow-inner overflow-hidden"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold flex items-center gap-2 text-blue-900">
                    <UserPlus size={18} /> Quick Register
                  </h3>
                  <button type="button" onClick={() => setIsQuickAdding(false)} className="text-slate-400">
                    <X size={18} />
                  </button>
                </div>
                <div className="grid gap-4">
                  <input 
                    placeholder="Full Name"
                    className="material-input bg-slate-50 border-transparent focus:bg-white"
                    value={quickAddForm.name}
                    onChange={e => setQuickAddForm({...quickAddForm, name: e.target.value})}
                  />
                  {quickAddValidation.name && (
                    <p className="text-red-500 text-[10px] font-bold mt-1 ml-1">{quickAddValidation.name}</p>
                  )}
                  <input 
                    placeholder="Mobile Number"
                    className="material-input bg-slate-50 border-transparent focus:bg-white"
                    value={quickAddForm.mobile}
                    onChange={e => setQuickAddForm({...quickAddForm, mobile: e.target.value})}
                  />
                  <textarea 
                    placeholder="Delivery Address"
                    rows={2}
                    className="material-input bg-slate-50 border-transparent focus:bg-white resize-none"
                    value={quickAddForm.address}
                    onChange={e => setQuickAddForm({...quickAddForm, address: e.target.value})}
                  />
                  <button 
                    type="button"
                    onClick={handleQuickAdd}
                    className="material-btn material-btn-primary py-3"
                  >
                    Save & Select
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {selectedCustomer && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-blue-900">{selectedCustomer.name}</div>
                  <div className="text-sm text-blue-700 flex items-center gap-1 mt-1">
                    <Phone size={12} /> +91 {selectedCustomer.mobile}
                  </div>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="text-blue-400"><X size={18}/></button>
              </div>
              <div className="mt-2">
                <label className="text-[10px] uppercase font-bold text-blue-400">Delivery Address</label>
                <textarea
                  className="w-full bg-transparent border-0 p-0 text-sm focus:ring-0 resize-none text-blue-800"
                  value={form.customAddress}
                  onChange={e => setForm({...form, customAddress: e.target.value})}
                  rows={2}
                />
              </div>
            </motion.div>
          )}
        </div>

        {/* Bill Details */}
        <div className="material-card grid gap-4 overflow-hidden">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-500 mb-1 block">Tanker Size</label>
              <select 
                className="material-input appearance-none"
                value={form.tankerSize}
                onChange={e => setForm({...form, tankerSize: e.target.value})}
              >
                {TANKER_SIZES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-500 mb-1 block">Quantity</label>
              <input
                type="number"
                min="1"
                className="material-input"
                value={form.quantity}
                onChange={e => setForm({...form, quantity: parseInt(e.target.value) || 0})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-500 mb-1 block">Rate (₹)</label>
              <input
                type="number"
                className="material-input"
                value={form.rate}
                onChange={e => setForm({...form, rate: parseInt(e.target.value) || 0})}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-500 mb-1 block">Extra Charges (₹)</label>
              <input
                type="number"
                placeholder="Extra"
                className="material-input"
                value={form.extraCharges}
                onChange={e => setForm({...form, extraCharges: parseInt(e.target.value) || 0})}
              />
            </div>
          </div>

          <div className="bg-slate-900 text-white p-6 rounded-3xl mt-2 relative overflow-hidden">

            <div className="flex justify-between items-center mb-1 text-slate-400 text-sm italic">
              <span>Total Amount</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-lg font-medium">Grand Total</span>
              <span className="text-3xl font-display font-bold text-orange-400">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>

        <button type="submit" className="material-btn material-btn-secondary h-16 text-lg">
          Create Trip Token
        </button>
      </form>

      {/* Removed Invoice Modal from New Bill flow as requested */}

      {/* Booking Success Modal */}
      <AnimatePresence>
        {showBookingSuccess && bookedBill && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl text-center relative overflow-hidden"
            >
              {/* Confetti-like decoration */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-green-50 rounded-full -translate-y-20 -z-10" />
              
              <div className="w-20 h-20 bg-green-500 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-200">
                <CheckCircle2 size={40} />
              </div>

              <h2 className="text-3xl font-display font-black text-slate-900 mb-2">Token Generated!</h2>
              <p className="text-slate-500 font-medium mb-8">
                Trip Token <span className="font-bold text-slate-900">#{bookedBill.billNumber}</span> has been generated successfully at <span className="text-slate-900 font-bold">{format(new Date(), 'hh:mm a')}</span>.
              </p>

              <div className="bg-slate-50 rounded-3xl p-6 mb-8 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Grand Total</div>
                <div className="text-3xl font-display font-black text-slate-900">{formatCurrency(bookedBill.grandTotal)}</div>
                <div className="mt-2 text-sm font-bold text-blue-600 bg-blue-50 py-1 px-3 rounded-full inline-block">
                  Status: Pending
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setShowBookingSuccess(false)}
                    className="h-14 font-bold text-slate-400 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors"
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => {
                      setShowBookingSuccess(false);
                      if (onBillCreated) onBillCreated();
                    }}
                    className="h-14 font-bold text-blue-600 bg-blue-50 rounded-2xl hover:bg-blue-100 transition-colors"
                  >
                    Dashboard
                  </button>
                </div>
              </div>

              {/* Hidden Thermal Invoice for JPG Capture */}
              <div className="fixed top-[-9999px] left-[-9999px] pointer-events-none">
                <div ref={thermalRef}>
                  <ThermalInvoice bill={bookedBill} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
