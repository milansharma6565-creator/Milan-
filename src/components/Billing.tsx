import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, addDoc, updateDoc, serverTimestamp, doc, getDoc, runTransaction, orderBy, limit } from 'firebase/firestore';
import { Customer, Driver, Bill } from '../types';
import { Search, MapPin, Phone, IndianRupee, Printer, X, CheckCircle2, UserPlus, Share2, FileText, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TANKER_SIZES, PAYMENT_MODES, BILL_STATUSES, formatCurrency, generateBillNumber, PRODUCT_CATEGORIES, BOTTLE_SIZES, getPublicAppUrl } from '../constants';
import { ThermalInvoice } from './ThermalInvoice';
import { format } from 'date-fns';
import { toJpeg } from 'html-to-image';
import { ledgerAutomation } from '../services/ledgerAutomation';
import { LocationPicker } from './LocationPicker';

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
    category: 'TANKER' as any,
    tankerSize: TANKER_SIZES[0].value,
    bottleSize: BOTTLE_SIZES[1].value,
    quantity: 1,
    rate: TANKER_SIZES[0].defaultRate,
    extraCharges: 0,
    discount: 0,
    status: 'Pending' as typeof BILL_STATUSES[number],
    customAddress: '',
    driverId: '',
    driverName: '',
    paymentMethod: 'Store' as 'Cash' | 'Bank' | 'Store',
    remarks: '',
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
        const q = query(collection(db, 'bills'), orderBy('billNumber', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        let nextNum = 1;
        if (!snapshot.empty) {
          const lastNumStr = snapshot.docs[0].data().billNumber;
          const parsed = parseInt(lastNumStr.replace(/\D/g, ''));
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        setForm(prev => ({ ...prev, billNumber: generateBillNumber(nextNum) }));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'bills-init-number');
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
        await updateDoc(doc(db, 'customers', c.id!), { 
          secondaryMobiles: updatedSecondaries,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `customers/${c.id}`);
      }
    }
  };

  const subtotal = form.quantity * form.rate;
  const grandTotal = subtotal + form.extraCharges - form.discount;

  useEffect(() => {
    if (form.category === 'TANKER') {
      const size = TANKER_SIZES.find(s => s.value === form.tankerSize);
      if (size) setForm(prev => ({ ...prev, rate: size.defaultRate }));
    } else if (form.category === 'STANDBY_TANKER') {
      // Day 1: 900, Day 2+: 600
      let calcRate = 900;
      if (form.quantity > 1) {
        // We'll store the logic in the rate for simplicity or handle in total
        // For billing, it's easier to set total manually or calculate here
        const total = 900 + (form.quantity - 1) * 600;
        setForm(prev => ({ ...prev, rate: total / form.quantity })); 
      } else {
        setForm(prev => ({ ...prev, rate: 900 }));
      }
    } else if (form.category === 'MONTHLY_TANKER') {
      setForm(prev => ({ ...prev, rate: 10000 }));
    } else if (form.category === 'BOTTLE') {
      const size = BOTTLE_SIZES.find(s => s.value === form.bottleSize);
      if (size) setForm(prev => ({ ...prev, rate: size.defaultRate }));
    } else if (form.category === 'CAN') {
      setForm(prev => ({ ...prev, rate: 80 })); // Assuming ₹80 for CAN
    }
  }, [form.category, form.tankerSize, form.bottleSize, form.quantity]);

  const [showStatusSelection, setShowStatusSelection] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState<{lat: number, lng: number, address: string} | null>(null);

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
      let file: any;
      try {
        if (typeof window.File === 'function') {
          try {
            file = new File([blob], fileName, { type: 'image/jpeg' });
          } catch (fileConstructErr) {
            console.warn('File constructor failed, falling back to blob');
            file = blob;
          }
        } else {
          file = blob;
        }
      } catch (e) {
        file = blob;
      }

      let canShareFile = false;
      try {
        if (navigator.canShare) {
          canShareFile = navigator.canShare({ files: [file] });
        }
      } catch (canShareErr) {
        console.warn('canShare check failed', canShareErr);
        canShareFile = false;
      }

      // Try Web Share API (Best for Mobile WhatsApp)
      if (navigator.share && canShareFile) {
        try {
          await navigator.share({
            files: [file],
            title: `Token #${bill.billNumber}`,
            text: `Trip Token from TankerWala Powered by Rajhans for amount ₹${bill.grandTotal}`
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
    } catch (err: any) {
      console.error('Error sharing image:', err?.message || String(err));
      // Fallback to text WhatsApp
      sendWhatsApp(bill);
    }
  };

  const sendWhatsApp = (bill: any) => {
    if (!selectedCustomer) return;
    const urlObj = getPublicAppUrl();
    urlObj.search = ''; // Clear current params
    urlObj.searchParams.set('o', bill.id);
    const rebookUrl = urlObj.toString();
    
    const message = `*Order Token - TankerWala* 🚛\n\n` +
      `Token: #${bill.billNumber}\n` +
      `Amt: ₹${bill.grandTotal}\n` +
      `Category: ${bill.category}\n` +
      `Size: ${bill.category === 'TANKER' ? bill.tankerSize : bill.bottleSize || '20L'}\n\n` +
      `Rebook: ${rebookUrl}\n\n` +
      `TankerWala Powered by Rajhans`;
    
    // Using international format for mobile if needed, but assuming 10 digit Indian number
    const phone = selectedCustomer.mobile.startsWith('91') ? selectedCustomer.mobile : `91${selectedCustomer.mobile}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const sendDriverWhatsApp = (bill: any, driver: Driver) => {
    if (!deliveryLocation) return;
    
    const mapLink = `https://www.google.com/maps/dir/?api=1&destination=${deliveryLocation.lat},${deliveryLocation.lng}`;
    const message = `*New Trip Assigned - TankerWala* 🚛\n\n` +
      `Token: #${bill.billNumber}\n` +
      `Customer: ${bill.customerName}\n` +
      `Mobile: ${bill.customerMobile}\n` +
      `Location: ${deliveryLocation.address}\n\n` +
      `📍 *Navigation Link:* ${mapLink}\n\n` +
      `TankerWala Powered by Rajhans`;
    
    const phone = driver.mobile.startsWith('91') ? driver.mobile : `91${driver.mobile}`;
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
      await updateDoc(doc(db, 'customers', selectedCustomer.id!), { 
        lastRate: form.rate,
        updatedAt: serverTimestamp()
      });

      const billData = {
        billNumber: form.billNumber,
        date: form.date,
        customerId: selectedCustomer.id!,
        customerName: selectedCustomer.name,
        customerMobile: selectedCustomer.mobile,
        customerAddress: form.customAddress || selectedCustomer.address,
        category: form.category,
        ...(deliveryLocation && {
          deliveryLocation: {
            ...deliveryLocation,
            mapLink: `https://www.google.com/maps/dir/?api=1&destination=${deliveryLocation.lat},${deliveryLocation.lng}`
          }
        }),
        tankerSize: form.category === 'TANKER' ? form.tankerSize : null,
        bottleSize: form.category === 'BOTTLE' ? form.bottleSize : null,
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
        driverId: form.driverId,
        remarks: form.remarks.trim(),
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'bills'), billData);
      const bookedBillWithId = { ...billData, id: docRef.id };
      setBookedBill(bookedBillWithId);

      // Automatically post to Ledger (Automation)
      ledgerAutomation.postBillToLedger(bookedBillWithId);

      // If a driver is assigned, create an active trip for them
      if (form.driverId) {
        const driver = drivers.find(d => d.id === form.driverId);
        
        await addDoc(collection(db, 'trips'), {
          billId: docRef.id,
          billNumber: form.billNumber,
          driverId: form.driverId,
          driverName: form.driverName,
          customerName: selectedCustomer.name,
          customerMobile: selectedCustomer.mobile,
          siteLocation: form.customAddress || selectedCustomer.address,
          category: form.category,
          ...(deliveryLocation && {
            deliveryLocation: {
              ...deliveryLocation,
              mapLink: `https://www.google.com/maps/dir/?api=1&destination=${deliveryLocation.lat},${deliveryLocation.lng}`
            }
          }),
          quantity: form.quantity,
          tankerSize: form.category === 'TANKER' ? form.tankerSize : null,
          bottleSize: form.category === 'BOTTLE' ? form.bottleSize : null,
          tankerNumber: 'T-01', // Default or could be dynamic
          status: 'Active',
          createdAt: serverTimestamp()
        });

        // Share with driver if assigned
        if (driver) {
          sendDriverWhatsApp(bookedBillWithId, driver);
        }
      }

      setShowBookingSuccess(true);
      
      // Reset form for next entry partially
      const snapshotSize = (await getDocs(collection(db, 'bills'))).size;
      setForm(prev => ({
        ...prev,
        billNumber: generateBillNumber(snapshotSize + 1),
        quantity: 1,
        extraCharges: 0,
        discount: 0,
        driverId: '',
        driverName: '',
        remarks: ''
      }));
      setDeliveryLocation(null);
      setShowMap(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bills');
    }
  };

  const handleStatusUpdate = async (status: typeof BILL_STATUSES[number]) => {
    if (!lastBill?.id) return;
    
    try {
      await updateDoc(doc(db, 'bills', lastBill.id), { 
        status,
        updatedAt: serverTimestamp()
      });
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
    <div className="p-4 md:p-0 pb-32">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-display font-bold">Create New Token</h1>
          <p className="text-slate-500">Generate trip bill and token</p>
        </div>
        <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-2xl border border-blue-100 text-sm font-bold">
          Bill No: {form.billNumber}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Customer Search Section */}
        <div className="material-card relative">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Customer Information</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search customer by name or mobile..."
              className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all"
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
                exit={{ opacity: 0, y: -10 }}
                className="absolute left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-20"
              >
                {searchResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleCustomerSelect(c)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.mobile}</div>
                    </div>
                    <div className="text-blue-600 bg-blue-50 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Select</div>
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
                  className="w-full p-4 flex items-center gap-3 bg-blue-600 text-white hover:bg-blue-700 transition-colors text-left"
                >
                  <UserPlus size={20} />
                  <div>
                    <div className="font-bold">Register New Customer</div>
                    <div className="text-[10px] opacity-80 uppercase font-bold tracking-wider">Quick Add to Database</div>
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
                className="mt-6 border-t border-slate-100 pt-6"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-sm text-slate-900">New Customer Details</h3>
                  <button type="button" onClick={() => setIsQuickAdding(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={20} />
                  </button>
                </div>
                <div className="grid gap-3">
                  <input 
                    placeholder="Customer Name"
                    className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all uppercase"
                    value={quickAddForm.name}
                    onChange={e => setQuickAddForm({...quickAddForm, name: e.target.value})}
                  />
                  {quickAddValidation.name && (
                    <p className="text-red-500 text-[10px] font-bold uppercase ml-1">{quickAddValidation.name}</p>
                  )}
                  <input 
                    placeholder="Mobile Number"
                    className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
                    value={quickAddForm.mobile}
                    onChange={e => setQuickAddForm({...quickAddForm, mobile: e.target.value})}
                  />
                  <textarea 
                    placeholder="Address"
                    rows={2}
                    className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                    value={quickAddForm.address}
                    onChange={e => setQuickAddForm({...quickAddForm, address: e.target.value})}
                  />
                  <button 
                    type="button"
                    onClick={handleQuickAdd}
                    className="w-full bg-slate-900 text-white rounded-xl py-3 font-bold text-sm shadow-lg shadow-slate-200"
                  >
                    Register & Select
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {selectedCustomer && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="mt-4 p-4 bg-blue-50 rounded-2xl relative border border-blue-100"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-slate-900 text-lg">{selectedCustomer.name}</div>
                  <div className="text-slate-500 flex items-center gap-2 mt-1 text-sm">
                    <Phone size={14} /> {selectedCustomer.mobile}
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedCustomer(null)} 
                  className="bg-white/50 p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
                >
                    <X size={16}/>
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-blue-200/50">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">Delivery Location</label>
                  <button
                    type="button"
                    onClick={() => setShowMap(!showMap)}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-white px-2 py-1 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
                  >
                    <MapPin size={12} />
                    {showMap ? 'Hide Map' : 'Select on Map'}
                  </button>
                </div>

                {showMap && (
                  <div className="mb-4">
                    <LocationPicker 
                      onLocationSelect={(lat, lng, address) => {
                        setDeliveryLocation({ lat, lng, address });
                        setForm(prev => ({ ...prev, customAddress: address }));
                      }} 
                    />
                    <p className="mt-2 text-[10px] text-blue-500 font-medium">Click on the map to pick exact delivery point. 5km radius shown.</p>
                  </div>
                )}

                <textarea
                  className="w-full bg-transparent border-0 p-0 text-sm focus:ring-0 resize-none text-blue-900 font-medium"
                  value={form.customAddress}
                  onChange={e => setForm({...form, customAddress: e.target.value})}
                  rows={2}
                />
              </div>
            </motion.div>
          )}
        </div>

        {/* Bill Details */}
        <div className="material-card">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Trip Configuration</label>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Category</label>
              <select 
                className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 px-4 font-bold transition-all text-sm"
                value={form.category}
                onChange={e => setForm({...form, category: e.target.value as any})}
              >
                {PRODUCT_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{form.category === 'TANKER' ? 'Tanker Size' : 'Bottle Size / 20L'}</label>
              {form.category === 'TANKER' ? (
                <select 
                  className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 px-4 font-bold transition-all text-sm"
                  value={form.tankerSize}
                  onChange={e => setForm({...form, tankerSize: e.target.value})}
                >
                  {TANKER_SIZES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              ) : form.category === 'BOTTLE' ? (
                <select 
                  className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 px-4 font-bold transition-all text-sm"
                  value={form.bottleSize}
                  onChange={e => setForm({...form, bottleSize: e.target.value as any})}
                >
                  {BOTTLE_SIZES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-slate-100 rounded-xl py-3 px-4 font-bold text-sm text-slate-500">20L Standard</div>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                {form.category === 'STANDBY_TANKER' ? 'Duration (Days)' : 
                 form.category === 'MONTHLY_TANKER' ? 'Duration (Months)' : 
                 'Quantity'}
              </label>
              <input
                type="number"
                min="1"
                className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 px-4 font-bold transition-all text-sm"
                value={form.quantity}
                onChange={e => setForm({...form, quantity: parseInt(e.target.value) || 0})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Rate (₹)</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">₹</div>
                <input
                  type="number"
                  className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 pl-8 pr-4 font-bold transition-all text-sm"
                  value={form.rate}
                  onChange={e => setForm({...form, rate: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Assign Driver</label>
              <select 
                className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 px-4 font-bold transition-all text-sm"
                value={form.driverId}
                onChange={async (e) => {
                  const dId = e.target.value;
                  if (dId) {
                    const qTrp = query(collection(db, 'trips'), where('driverId', '==', dId), where('status', 'in', ['Active', 'Filling', 'On the way', 'Reached']));
                    const snap = await getDocs(qTrp);
                    if (!snap.empty) {
                       alert('Driver is already on an active trip! Please wait until they finish.');
                       return;
                    }
                  }
                  const driver = drivers.find(d => d.id === dId);
                  setForm({...form, driverId: dId, driverName: driver?.name || ''});
                }}
              >
                <option value="">Select Driver</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Extra / Discount (₹)</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">₹</div>
                <input
                  type="number"
                  placeholder="Charges"
                  className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 pl-8 pr-4 font-bold transition-all text-sm"
                  value={form.extraCharges}
                  onChange={e => setForm({...form, extraCharges: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>
          </div>


          <div className="mt-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Internal Remarks / Notes</label>
            <textarea
              placeholder="Add any specific notes for this trip..."
              className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 px-4 font-medium transition-all text-sm resize-none"
              rows={2}
              value={form.remarks}
              onChange={e => setForm({...form, remarks: e.target.value})}
            />
          </div>

          <div className="bg-slate-900 p-6 rounded-3xl mt-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/20 blur-3xl rounded-full translate-x-10 -translate-y-10" />
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-1 text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-xs font-bold text-blue-400 flex items-center gap-1 mb-1">
                    <CheckCircle2 size={12} /> Live Calculation
                  </div>
                  <div className="text-3xl font-display font-black tracking-tight">{formatCurrency(grandTotal)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Grand Total</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white h-16 rounded-2xl font-black text-lg transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3 active:scale-[0.98]">
           Commit Token
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
                <button 
                  onClick={() => sendWhatsApp(bookedBill)}
                  className="h-16 font-bold text-white bg-green-600 rounded-2xl hover:bg-green-700 transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-3 active:scale-95"
                >
                  <MessageSquare size={24} />
                  Send on WhatsApp
                </button>
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
