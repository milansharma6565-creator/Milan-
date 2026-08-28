import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, addDoc, updateDoc, serverTimestamp, doc, getDoc, runTransaction, orderBy, limit, setDoc } from 'firebase/firestore';
import { Customer, Driver, Bill } from '../types';
import { Search, MapPin, Phone, IndianRupee, Printer, X, CheckCircle2, UserPlus, Share2, FileText, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TANKER_SIZES, PAYMENT_MODES, BILL_STATUSES, formatCurrency, generateBillNumber, getNextBillNumber, PRODUCT_CATEGORIES, BOTTLE_SIZES, getPublicAppUrl } from '../constants';
import { ThermalInvoice } from './ThermalInvoice';
import { printThermalReceipt, shareOrDownloadBillImage } from '../lib/printUtils';
import { getWhatsAppBillLink, dispatchWhatsAppLifecycleEvent } from '../lib/whatsappUtils';
import { format } from 'date-fns';
import { toJpeg } from 'html-to-image';
import { ledgerAutomation } from '../services/ledgerAutomation';
import { LocationPicker } from './LocationPicker';
import { activityLogger } from '../services/activityLogger';
import { scheduledBillsService } from '../services/scheduledBillsService';
import { QRCodeSVG } from 'qrcode.react';

export function Billing({ onBillCreated, franchiseId, isSuperAdmin, commissionPercentage, currentFranchise }: { 
  onBillCreated?: () => void, 
  franchiseId?: string, 
  isSuperAdmin?: boolean,
  commissionPercentage?: number,
  currentFranchise?: any
}) {
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

  const [pendingBills, setPendingBills] = useState<any[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [includePendingDues, setIncludePendingDues] = useState(false);

  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionRef = useRef(false);
  const syncingRef = useRef(false);

  // Sync state loader
  const updatePendingCount = () => {
    try {
      const stored = localStorage.getItem('offline_pending_bills');
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          setOfflinePendingCount(arr.length);
          return arr.length;
        }
      }
    } catch (e) {
      console.error("Failed to read pending bills:", e);
    }
    setOfflinePendingCount(0);
    return 0;
  };

  const syncOfflineBills = async () => {
    if (isSyncing || syncingRef.current) return;
    const count = updatePendingCount();
    if (count === 0) return;
    if (!navigator.onLine) return;

    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const stored = localStorage.getItem('offline_pending_bills');
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr) && arr.length > 0) {
          // Immediately empty the localStorage queue to protect it against concurrent/overlapping runs
          localStorage.setItem('offline_pending_bills', JSON.stringify([]));
          setOfflinePendingCount(0);

          const remaining: any[] = [];
          for (const billData of arr) {
            try {
              const currentFid = franchiseId || billData.franchiseId || null;

              // 1. One-time query of highest bill number to avoid duplicate assignments
              let highestQueryNum = 0;
              try {
                let q = query(collection(db, 'bills'), orderBy('billNumber', 'desc'), limit(1));
                if (currentFid) {
                  q = query(collection(db, 'bills'), where('franchiseId', '==', currentFid), orderBy('billNumber', 'desc'), limit(1));
                }
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                  const lastNumStr = snapshot.docs[0].data().billNumber;
                  const parsed = parseInt(lastNumStr.replace(/\D/g, ''));
                  if (!isNaN(parsed)) highestQueryNum = parsed;
                }
              } catch (e) {
                console.warn("Soft fail querying highest bill number before sync transaction:", e);
              }

              const counterRef = doc(db, 'counters', currentFid ? `bill_sequence_${currentFid}` : 'bill_sequence_global');

              let finalSyncedBillNumber = '';
              let syncedBillId = '';
              let finalBillDataStore: any = null;

              // 2. Perform atomic transaction
              await runTransaction(db, async (transaction) => {
                const counterSnap = await transaction.get(counterRef);
                let lastSequence = 0;
                if (counterSnap.exists()) {
                  lastSequence = counterSnap.data().lastSequence || 0;
                }

                const nextSeq = Math.max(highestQueryNum, lastSequence) + 1;
                finalSyncedBillNumber = generateBillNumber(nextSeq);

                // Update counter
                transaction.set(counterRef, { lastSequence: nextSeq }, { merge: true });

                // Update customer rate
                const customerRef = doc(db, 'customers', billData.customerId);
                transaction.update(customerRef, {
                  lastRate: billData.rate,
                  updatedAt: serverTimestamp()
                });

                // Prepare actual Firestore server timestamps
                const finalBillData = {
                  ...billData,
                  billNumber: finalSyncedBillNumber,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                };
                delete finalBillData.isOffline;
                delete finalBillData.id;

                const newBillRef = doc(collection(db, 'bills'));
                transaction.set(newBillRef, finalBillData);
                syncedBillId = newBillRef.id;
                finalBillDataStore = { ...finalBillData, id: newBillRef.id };

                // Create Driver Trip if set
                if (billData.driverId) {
                  const newTripRef = doc(collection(db, 'trips'));
                  transaction.set(newTripRef, {
                    billId: newBillRef.id,
                    franchiseId: currentFid,
                    billNumber: finalSyncedBillNumber,
                    driverId: billData.driverId,
                    driverName: billData.driverName,
                    customerName: billData.customerName,
                    customerMobile: billData.customerMobile,
                    siteLocation: billData.customerAddress,
                    category: billData.category,
                    remarks: billData.remarks,
                    quantity: billData.quantity,
                    tankerSize: billData.category === 'TANKER' ? billData.tankerSize : null,
                    bottleSize: billData.category === 'BOTTLE' ? billData.bottleSize : null,
                    tractorId: 'T-01',
                    status: 'Active',
                    createdAt: serverTimestamp()
                  });
                }
              });

              // Log invoice generation activity
              try {
                await activityLogger.log({
                  franchiseId: franchiseId || currentFranchise?.id || '',
                  franchiseName: currentFranchise?.name || 'Franchise',
                  userEmail: '',
                  actionType: 'NEW_BILL',
                  description: `[Offline Sync] Generated invoice #${finalSyncedBillNumber} for Customer "${billData.customerName}" with total ₹${billData.grandTotal}`,
                  details: { billId: syncedBillId, billNumber: finalSyncedBillNumber, total: billData.grandTotal }
                });
              } catch (logErr) {
                console.error("Failed to log synced activity:", logErr);
              }

              // Post to Ledger
              if (finalBillDataStore && finalBillDataStore.status === 'Delivered') {
                await ledgerAutomation.postBillToLedger(finalBillDataStore);
              }

            } catch (singleErr) {
              console.error("Failed to sync a single offline bill, keeping in queue:", singleErr);
              remaining.push(billData);
            }
          }

          // Merge any failed bills back into queue with newly created ones
          if (remaining.length > 0) {
            try {
              const currentStored = localStorage.getItem('offline_pending_bills') || '[]';
              const currentArr = JSON.parse(currentStored);
              const merged = [...remaining, ...currentArr];
              localStorage.setItem('offline_pending_bills', JSON.stringify(merged));
            } catch (mergeErr) {
              console.error("Failed to merge back offline bills:", mergeErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed offline sync loop:", err);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      updatePendingCount();
    }
  };

  useEffect(() => {
    updatePendingCount();
    
    // Attempt automatic sync on mount
    syncOfflineBills();

    const interval = setInterval(syncOfflineBills, 15000); // Check and sync every 15s
    window.addEventListener('online', syncOfflineBills);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', syncOfflineBills);
    };
  }, [franchiseId, currentFranchise]);

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

  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });

  // Background check & auto-activation for scheduled bills
  useEffect(() => {
    scheduledBillsService.checkAndActivateScheduledBills(franchiseId);
    const interval = setInterval(() => {
      scheduledBillsService.checkAndActivateScheduledBills(franchiseId);
    }, 20000);
    return () => clearInterval(interval);
  }, [franchiseId]);

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
    let q = query(collection(db, 'drivers'));
    if (!isSuperAdmin && franchiseId) {
      q = query(collection(db, 'drivers'), where('franchiseId', '==', franchiseId));
    }
    return onSnapshot(q, 
      (snapshot) => setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver)).filter(d => (d.status || 'Active') === 'Active')),
      (error) => handleFirestoreError(error, OperationType.LIST, 'drivers')
    );
  }, [franchiseId, isSuperAdmin]);

  useEffect(() => {
    let active = true;
    async function initBillNumber() {
      if (!isSuperAdmin && !franchiseId) return;
      try {
        let highestBillNum = 0;
        try {
          let q = query(collection(db, 'bills'), orderBy('billNumber', 'desc'), limit(1));
          if (!isSuperAdmin && franchiseId) {
            q = query(collection(db, 'bills'), where('franchiseId', '==', franchiseId), orderBy('billNumber', 'desc'), limit(1));
          }
          const snapshot = await getDocs(q);
          if (active && !snapshot.empty) {
            const lastNumStr = snapshot.docs[0].data().billNumber;
            const parsed = parseInt(lastNumStr.replace(/\D/g, ''));
            if (!isNaN(parsed)) highestBillNum = parsed;
          }
        } catch (innerErr) {
          console.warn("Firestore index-based bill number query failed or requires index. Falling back to non-indexed sequence scan:", innerErr);
          try {
            let fallbackQ = query(collection(db, 'bills'), limit(100));
            if (!isSuperAdmin && franchiseId) {
              fallbackQ = query(collection(db, 'bills'), where('franchiseId', '==', franchiseId), limit(100));
            }
            const snap = await getDocs(fallbackQ);
            if (active) {
              snap.docs.forEach(doc => {
                const val = parseInt((doc.data().billNumber || '').replace(/\D/g, ''));
                if (!isNaN(val) && val > highestBillNum) {
                  highestBillNum = val;
                }
              });
            }
          } catch (fErr) {
            console.error("Sequence fallback scan failed:", fErr);
          }
        }

        let counterNum = 0;
        try {
          const counterSnap = await getDoc(doc(db, 'counters', franchiseId ? `bill_sequence_${franchiseId}` : 'bill_sequence_global'));
          if (active && counterSnap.exists()) {
            counterNum = counterSnap.data().lastSequence || 0;
          }
        } catch (err) {
          console.error("Error fetching bill counter:", err);
        }

        if (active) {
          const nextNum = Math.max(highestBillNum, counterNum) + 1;
          setForm(prev => ({ ...prev, billNumber: generateBillNumber(nextNum) }));
        }
      } catch (error) {
        if (active) {
          handleFirestoreError(error, OperationType.GET, 'bills-init-number');
        }
      }
    }
    initBillNumber();
    return () => {
      active = false;
    };
  }, [franchiseId, isSuperAdmin]);

  const safeFormatDate = (dateVal: any) => {
    if (!dateVal) return 'N/A';
    try {
      if (dateVal.seconds) {
        return format(new Date(dateVal.seconds * 1000), 'dd/MM/yyyy');
      }
      return format(new Date(dateVal), 'dd/MM/yyyy');
    } catch (e) {
      return String(dateVal).slice(0, 10);
    }
  };

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setPendingBills([]);
      setIncludePendingDues(false);
      return;
    }

    setIsLoadingPending(true);
    const fetchPending = async () => {
      try {
        const q = query(
          collection(db, 'bills'),
          where('customerId', '==', selectedCustomer.id),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((b: any) => b.paymentMode === 'Pending' || b.status === 'Pending' || b.isSettled === false);
        setPendingBills(list);
      } catch (err) {
        console.warn("Failed to fetch pending bills with index. Falling back to un-ordered query:", err);
        try {
          const qFallback = query(
            collection(db, 'bills'),
            where('customerId', '==', selectedCustomer.id)
          );
          const snapFallback = await getDocs(qFallback);
          const listFallback = snapFallback.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((b: any) => b.paymentMode === 'Pending' || b.status === 'Pending' || b.isSettled === false);
          setPendingBills(listFallback);
        } catch (innerErr) {
          console.error("Fallback query for pending bills failed too:", innerErr);
        }
      } finally {
        setIsLoadingPending(false);
      }
    };

    fetchPending();
  }, [selectedCustomer]);

  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    let q = query(collection(db, 'customers'));
    if (!isSuperAdmin && franchiseId) {
      q = query(collection(db, 'customers'), where('franchiseId', '==', franchiseId));
    }
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
  }, [searchTerm, franchiseId, isSuperAdmin]);

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
  const totalPendingDues = pendingBills.reduce((sum, b) => sum + (b.grandTotal || 0), 0);
  const combinedTotal = grandTotal + totalPendingDues;

  useEffect(() => {
    const cr = currentFranchise?.customRates || {};
    
    const getRateForTankerSize = (sizeValue: string) => {
      const key = `tanker${sizeValue}L`;
      if (cr[key] !== undefined) return cr[key];
      const size = TANKER_SIZES.find(s => s.value === sizeValue);
      return size ? size.defaultRate : 400;
    };

    const getRateForBottleSize = (sizeValue: string) => {
      const key = `bottle${sizeValue.toLowerCase()}`;
      if (cr[key] !== undefined) return cr[key];
      const size = BOTTLE_SIZES.find(s => s.value === sizeValue);
      return size ? size.defaultRate : 10;
    };

    if (form.category === 'TANKER') {
      const customRate = getRateForTankerSize(form.tankerSize);
      setForm(prev => ({ ...prev, rate: customRate }));
    } else if (form.category === 'STANDBY_TANKER') {
      const base = cr.standbyTankerBase !== undefined ? cr.standbyTankerBase : 900;
      const extra = cr.standbyTankerExtraDay !== undefined ? cr.standbyTankerExtraDay : 600;
      if (form.quantity > 1) {
        const total = base + (form.quantity - 1) * extra;
        setForm(prev => ({ ...prev, rate: total / form.quantity })); 
      } else {
        setForm(prev => ({ ...prev, rate: base }));
      }
    } else if (form.category === 'MONTHLY_TANKER') {
      const base = cr.monthlyTankerBase !== undefined ? cr.monthlyCanBase : 10000;
      setForm(prev => ({ ...prev, rate: base }));
    } else if (form.category === 'BOTTLE') {
      const customRate = getRateForBottleSize(form.bottleSize);
      setForm(prev => ({ ...prev, rate: customRate }));
    } else if (form.category === 'CAN') {
      const base = cr.can20lBase !== undefined ? cr.can20lBase : 80;
      setForm(prev => ({ ...prev, rate: base }));
    } else if (form.category === 'MONTHLY_CAN') {
      const base = cr.monthlyCanBase !== undefined ? cr.monthlyCanBase : 600;
      setForm(prev => ({ ...prev, rate: base }));
    }
  }, [form.category, form.tankerSize, form.bottleSize, form.quantity, currentFranchise]);

  const [showStatusSelection, setShowStatusSelection] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState<{lat: number, lng: number, address: string} | null>(null);

  const shareBillImage = async (bill: any) => {
    if (!bill || !thermalRef.current) return;
    
    try {
      const fileName = `Token_${bill.billNumber}.jpg`;
      await shareOrDownloadBillImage(thermalRef.current, fileName, `Bill #${bill.billNumber}`);
    } catch (err: any) {
      console.error('Error sharing receipt image:', err?.message || String(err));
    } finally {
      const waUrl = getWhatsAppBillLink(bill, currentFranchise);
      window.open(waUrl, '_blank');
    }
  };

  const sendWhatsApp = (bill: any) => {
    shareBillImage(bill);
  };

  const sendDriverWhatsApp = (bill: any, driver: Driver) => {
    if (!deliveryLocation) return;
    
    const mapLink = `https://www.openstreetmap.org/?mlat=${deliveryLocation.lat}&mlon=${deliveryLocation.lng}&zoom=16`;
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
    if (isSubmitting || submissionRef.current) return;
    if (!selectedCustomer) {
      alert('Please select a customer');
      return;
    }

    submissionRef.current = true;
    setIsSubmitting(true);
    const subtotal = form.quantity * form.rate;
    const grandTotal = subtotal + form.extraCharges - form.discount;
    
    let commissionAmount = 0;
    if (franchiseId && commissionPercentage) {
      commissionAmount = (grandTotal * commissionPercentage) / 100;
    }

    const billData = {
      billNumber: form.billNumber,
      franchiseId: franchiseId || null,
      commissionAmount,
      date: form.date,
      customerId: selectedCustomer.id!,
      customerName: selectedCustomer.name,
      customerMobile: selectedCustomer.mobile,
      customerAddress: form.customAddress || selectedCustomer.address,
      category: form.category,
      ...(deliveryLocation && {
        deliveryLocation: {
          ...deliveryLocation,
          mapLink: `https://www.openstreetmap.org/?mlat=${deliveryLocation.lat}&mlon=${deliveryLocation.lng}&zoom=16`
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
      status: 'Pending' as any,
      isSettled: false,
      driverId: form.driverId,
      remarks: form.remarks.trim(),
      includedPendingDues: includePendingDues,
      previousPendingDuesAmount: includePendingDues ? totalPendingDues : 0,
      previousPendingDuesDetails: includePendingDues 
        ? pendingBills.map(b => `${safeFormatDate(b.date)} (#${b.billNumber}): ₹${b.grandTotal}`).join('\n')
        : '',
      combinedTotalAmount: includePendingDues ? combinedTotal : grandTotal,
    };

    const useOfflineWorkflow = () => {
      const offlineId = `offline_${Date.now()}`;
      const offlineBill = {
        ...billData,
        id: offlineId,
        createdAt: new Date().toISOString(),
        isOffline: true,
      };

      try {
        const stored = localStorage.getItem('offline_pending_bills') || '[]';
        const arr = JSON.parse(stored);
        arr.push(offlineBill);
        localStorage.setItem('offline_pending_bills', JSON.stringify(arr));
        setOfflinePendingCount(arr.length);
      } catch (err) {
        console.error("Failed to store bill offline:", err);
      }

      setBookedBill(offlineBill);
      setShowBookingSuccess(true);

      const fakeNextNum = parseInt(form.billNumber.replace(/\D/g, '')) + 1;
      setForm(prev => ({
        ...prev,
        billNumber: generateBillNumber(isNaN(fakeNextNum) ? 1001 : fakeNextNum),
        quantity: 1,
        extraCharges: 0,
        discount: 0,
        driverId: '',
        driverName: '',
        remarks: ''
      }));
      setDeliveryLocation(null);
      setShowMap(false);
      setIsSubmitting(false);
      submissionRef.current = false;
    };

    const todayStr = new Date().toISOString().slice(0, 10);
    const isFutureScheduled = isScheduled && scheduledDate > todayStr;

    if (isFutureScheduled) {
      try {
        const newBillRef = doc(collection(db, 'bills'));
        const tempSchedNum = `SCHED-${scheduledDate.replace(/-/g, '')}-${Math.floor(100 + Math.random()*900)}`;
        const storeData = {
          ...billData,
          billNumber: tempSchedNum,
          isScheduled: true,
          scheduledDate: scheduledDate,
          scheduledStatus: 'Pending_Activation',
          status: 'Scheduled',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        await setDoc(newBillRef, storeData);
        
        await activityLogger.log({
          franchiseId: franchiseId || currentFranchise?.id || '',
          franchiseName: currentFranchise?.name || 'Franchise',
          userEmail: '',
          actionType: 'NEW_BILL',
          description: `Created SCHEDULED Booking for Customer "${selectedCustomer.name}" on ${scheduledDate}. Total: ₹${grandTotal}`,
          details: { billId: newBillRef.id, scheduledDate, total: grandTotal }
        });

        alert(`📅 Scheduled booking successfully registered!\n\nThis bill will automatically appear in Recent Bills on ${scheduledDate} with the correct sequential Bill Serial Number for that day.`);

        // Reset form
        setIsScheduled(false);
        setForm(prev => ({
          ...prev,
          quantity: 1,
          extraCharges: 0,
          discount: 0,
          driverId: '',
          driverName: '',
          remarks: ''
        }));
        setDeliveryLocation(null);
        setShowMap(false);
        setIncludePendingDues(false);
        setPendingBills([]);
        return;
      } catch (err: any) {
        console.error("Failed to save scheduled booking:", err);
        alert("Scheduled booking failed: " + err.message);
        return;
      } finally {
        setIsSubmitting(false);
        submissionRef.current = false;
      }
    }

    if (!navigator.onLine) {
      useOfflineWorkflow();
      return;
    }

    try {
      let highestQueryNum = 0;
      try {
        let q = query(collection(db, 'bills'), orderBy('billNumber', 'desc'), limit(1));
        if (!isSuperAdmin && franchiseId) {
          q = query(collection(db, 'bills'), where('franchiseId', '==', franchiseId), orderBy('billNumber', 'desc'), limit(1));
        }
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const lastNumStr = snapshot.docs[0].data().billNumber;
          const parsed = parseInt(lastNumStr.replace(/\D/g, ''));
          if (!isNaN(parsed)) highestQueryNum = parsed;
        }
      } catch (e) {
        console.warn("Soft fail querying highest bill number before transaction:", e);
      }

      const counterRef = doc(db, 'counters', franchiseId ? `bill_sequence_${franchiseId}` : 'bill_sequence_global');

      let finalBillNumber = '';
      let bookedBillWithId: any = null;
      let billDocId = '';

      // Perform transaction to generate next sequential bill number and commit changes atomically
      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        let lastSequence = 0;
        if (counterSnap.exists()) {
          lastSequence = counterSnap.data().lastSequence || 0;
        }

        const nextSeq = Math.max(highestQueryNum, lastSequence) + 1;
        finalBillNumber = generateBillNumber(nextSeq);

        // Update the sequence counter
        transaction.set(counterRef, { lastSequence: nextSeq }, { merge: true });

        // Update customer's last rate
        const customerRef = doc(db, 'customers', selectedCustomer.id!);
        transaction.update(customerRef, {
          lastRate: form.rate,
          updatedAt: serverTimestamp()
        });

        // Add bill doc
        const newBillRef = doc(collection(db, 'bills'));
        billDocId = newBillRef.id;

        const storeData = {
          ...billData,
          billNumber: finalBillNumber,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        transaction.set(newBillRef, storeData);
        bookedBillWithId = { ...storeData, id: newBillRef.id };

        // Create driver trip if driver is selected
        if (form.driverId) {
          const newTripRef = doc(collection(db, 'trips'));
          transaction.set(newTripRef, {
            billId: newBillRef.id,
            franchiseId: franchiseId || null,
            billNumber: finalBillNumber,
            driverId: form.driverId,
            driverName: form.driverName,
            customerName: selectedCustomer.name,
            customerMobile: selectedCustomer.mobile,
            siteLocation: form.customAddress || selectedCustomer.address,
            category: form.category,
            remarks: form.remarks.trim(),
            ...(deliveryLocation && {
              deliveryLocation: {
                ...deliveryLocation,
                mapLink: `https://www.openstreetmap.org/?mlat=${deliveryLocation.lat}&mlon=${deliveryLocation.lng}&zoom=16`
              }
            }),
            quantity: form.quantity,
            tankerSize: form.category === 'TANKER' ? form.tankerSize : null,
            bottleSize: form.category === 'BOTTLE' ? form.bottleSize : null,
            tractorId: 'T-01',
            status: 'Active',
            createdAt: serverTimestamp()
          });
        }
      });

      if (bookedBillWithId) {
        setBookedBill(bookedBillWithId);

        try {
          await activityLogger.log({
            franchiseId: franchiseId || currentFranchise?.id || '',
            franchiseName: currentFranchise?.name || 'Franchise',
            userEmail: '',
            actionType: 'NEW_BILL',
            description: `Generated invoice #${finalBillNumber} for Customer "${selectedCustomer.name}" with total ₹${grandTotal}`,
            details: { billId: billDocId, billNumber: finalBillNumber, total: grandTotal }
          });
        } catch (logErr) {
          console.error("Failed to log activity:", logErr);
        }

        if (bookedBillWithId.status === 'Delivered') {
          ledgerAutomation.postBillToLedger(bookedBillWithId);
        }

        // Trigger Automated WhatsApp Notification to Customer
        try {
          dispatchWhatsAppLifecycleEvent(
            bookedBillWithId,
            bookedBillWithId.status === 'Delivered' ? 'delivered' : 'booked',
            currentFranchise
          );
        } catch (waErr) {
          console.warn("WhatsApp notification error:", waErr);
        }

        if (form.driverId) {
          const driver = drivers.find(d => d.id === form.driverId);
          if (driver) {
            sendDriverWhatsApp(bookedBillWithId, driver);
          }
        }
      }

      setShowBookingSuccess(true);

      // Determine next sequential bill number for the form (immediately after submission)
      const numericSeq = parseInt(finalBillNumber.replace(/\D/g, ''), 10);
      const nextFormSeq = (isNaN(numericSeq) ? 1001 : numericSeq) + 1;

      setForm(prev => ({
        ...prev,
        billNumber: generateBillNumber(nextFormSeq),
        quantity: 1,
        extraCharges: 0,
        discount: 0,
        driverId: '',
        driverName: '',
        remarks: ''
      }));
      setDeliveryLocation(null);
      setShowMap(false);
      setIncludePendingDues(false);
      setPendingBills([]);
    } catch (error: any) {
      console.error("Database write throw, switching to offline fallback:", error);
      useOfflineWorkflow();
    } finally {
      setIsSubmitting(false);
      submissionRef.current = false;
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
        franchiseId: franchiseId || null,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-display font-bold">Create New Bill</h1>
          <p className="text-slate-500">Generate trip bill for customer</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {offlinePendingCount > 0 && (
            <div className={`px-4 py-2 rounded-2xl border text-xs font-black uppercase flex items-center gap-1.5 shadow-sm animate-pulse ${
              isSyncing 
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              {isSyncing ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  <span>Syncing {offlinePendingCount} Bills...</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>{offlinePendingCount} Offline Bills Saved</span>
                </>
              )}
            </div>
          )}
          <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-2xl border border-blue-100 text-sm font-bold">
            Bill No: {form.billNumber}
          </div>
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
                 form.category === 'MONTHLY_CAN' ? 'No. of Passes' :
                 'Quantity'}
              </label>
              <input
                type="number"
                min="0.01"
                step="any"
                className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 px-4 font-bold transition-all text-sm"
                value={form.quantity}
                onChange={e => setForm({...form, quantity: parseFloat(e.target.value) || 0})}
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
                  step="any"
                  className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 pl-8 pr-4 font-bold transition-all text-sm"
                  value={form.rate}
                  onChange={e => setForm({...form, rate: parseFloat(e.target.value) || 0})}
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
                      let actuallyBusy = false;
                      for (const tDoc of snap.docs) {
                        const tData = tDoc.data();
                        if (tData.billId) {
                          const bRef = doc(db, 'bills', tData.billId);
                          const bSnap = await getDoc(bRef);
                          if (bSnap.exists()) {
                            const bStatus = bSnap.data().status;
                            if (['Delivered', 'Cancelled'].includes(bStatus)) {
                              // Associated bill is delivered/cancelled, free driver self-healingly
                              await updateDoc(doc(db, 'trips', tDoc.id), { status: bStatus, completedAt: serverTimestamp() });
                            } else {
                              actuallyBusy = true;
                            }
                          } else {
                            // Bill doesn't exist anymore, free driver
                            await updateDoc(doc(db, 'trips', tDoc.id), { status: 'Delivered', completedAt: serverTimestamp() });
                          }
                        } else {
                          actuallyBusy = true;
                        }
                      }
                      if (actuallyBusy) {
                        alert('Driver Busy: Currently on an active trip.');
                        return;
                      }
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
                  step="any"
                  placeholder="Charges"
                  className="w-full bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-50 rounded-xl py-3 pl-8 pr-4 font-bold transition-all text-sm"
                  value={form.extraCharges}
                  onChange={e => setForm({...form, extraCharges: parseFloat(e.target.value) || 0})}
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

          {/* Schedule Booking Option */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-blue-200/80 rounded-2xl p-4 mt-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="w-5 h-5 rounded-md border-blue-400 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600 transition-all"
                />
                <div>
                  <span className="font-black text-sm text-slate-800 flex items-center gap-1.5">
                    📅 Schedule Booking
                  </span>
                  <p className="text-[11px] text-slate-500 font-medium">Schedule a bill for a future date</p>
                </div>
              </label>
              {isScheduled && (
                <span className="bg-blue-600 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full animate-pulse shadow-xs">
                  Schedule Active
                </span>
              )}
            </div>

            <AnimatePresence>
              {isScheduled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pt-2 border-t border-blue-200/60 overflow-hidden space-y-2.5"
                >
                  <label className="text-[10px] font-bold text-blue-900 uppercase tracking-widest block">
                    Select Delivery Date
                  </label>
                  <input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-white border border-blue-300 rounded-xl px-4 py-2.5 font-extrabold text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-xs"
                  />
                  <div className="bg-white/90 p-3 rounded-xl border border-blue-200 text-xs font-semibold text-blue-950 flex items-start gap-2.5 leading-relaxed">
                    <span className="text-base shrink-0">ℹ️</span>
                    <span>
                      This bill will automatically appear in <strong>'Recent Bills'</strong> with the <strong>next sequential Bill Serial Number</strong> on the chosen date.
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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

        {selectedCustomer && totalPendingDues > 0 && (
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-3xl p-5 transition-all hover:bg-amber-50 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="include-pending-checkbox"
                  checked={includePendingDues}
                  onChange={(e) => setIncludePendingDues(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded-lg border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer transition-all"
                />
                <label htmlFor="include-pending-checkbox" className="cursor-pointer select-none">
                  <p className="font-extrabold text-sm text-amber-950">Include Previous Dues</p>
                  <p className="text-xs text-amber-800 font-semibold mt-0.5">
                    This customer's total previous dues are <span className="font-black text-amber-900">{formatCurrency(totalPendingDues)}</span>.
                  </p>
                </label>
              </div>
              <div className="bg-amber-100 text-amber-900 font-extrabold px-3 py-1 rounded-full text-xs shrink-0">
                {pendingBills.length} Bill(s) Pending
              </div>
            </div>

            <AnimatePresence>
              {includePendingDues && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 pt-4 border-t border-amber-200 overflow-hidden"
                >
                  <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2">Unpaid Delivery Dates & Amounts (Details):</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1 mb-4">
                    {pendingBills.map((b, idx) => (
                      <div key={`${b.id || ''}-${idx}`} className="flex justify-between items-center text-xs font-semibold text-amber-900 bg-white/60 p-2.5 rounded-xl border border-amber-100/50">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">#{b.billNumber}</span>
                          <span>📅 {safeFormatDate(b.date)}</span>
                          {b.category && <span className="text-[10px] text-amber-650 font-bold uppercase">({b.category})</span>}
                        </div>
                        <span className="font-black">{formatCurrency(b.grandTotal)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 p-4 bg-slate-950 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Combined Total (New + Previous)</p>
                      <p className="text-2xl font-black text-amber-400 mt-0.5">{formatCurrency(combinedTotal)}</p>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-white/10 p-2 rounded-xl border border-white/5 self-start sm:self-center">
                      <div className="bg-white p-1 rounded-lg border border-slate-900 shrink-0">
                        <QRCodeSVG
                          value={`upi://pay?pa=${currentFranchise?.upiId || "rajha94133@barodampay"}&pn=${encodeURIComponent(currentFranchise?.printName || currentFranchise?.name || "TankerWala")}&am=${combinedTotal}&cu=INR&tn=Bill%20Combined`}
                          size={64}
                          level="M"
                        />
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] font-black uppercase text-amber-400 leading-tight">Combined QR Code</p>
                        <p className="text-[9px] text-slate-350 leading-tight mt-0.5">Scan to pay exact total including dues</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <button 
          type="submit" 
          disabled={isSubmitting}
          className={`w-full text-white h-16 rounded-2xl font-black text-lg transition-all shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] ${
            isSubmitting 
              ? 'bg-slate-400 cursor-not-allowed shadow-none' 
              : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
          }`}
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving Invoice...
            </>
          ) : (
            'Commit Bill'
          )}
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

              <h2 className="text-3xl font-display font-black text-slate-900 mb-2">Bill Generated!</h2>
              <p className="text-slate-500 font-medium mb-8">
                Trip Bill <span className="font-bold text-slate-900">#{bookedBill.billNumber}</span> has been generated successfully at <span className="text-slate-900 font-bold">{format(new Date(), 'hh:mm a')}</span>.
              </p>

              <div className="bg-slate-50 rounded-3xl p-6 mb-8 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Grand Total</div>
                <div className="text-3xl font-display font-black text-slate-900">{formatCurrency(bookedBill.grandTotal)}</div>
                <div className="mt-2 text-sm font-bold text-blue-600 bg-blue-50 py-1 px-3 rounded-full inline-block">
                  Status: Pending
                </div>
                {bookedBill.isOffline && (
                  <div className="mt-3 text-xs font-bold text-amber-700 bg-amber-50 py-2.5 px-3 rounded-2xl border border-amber-100 block text-center">
                    ⚠️ Offline Mode Saved!<br/>
                    Receipt is 100% accurate & ready to print. The bill will sync to cloud once connection is restored.
                  </div>
                )}
              </div>

               <div className="grid gap-3">
                <button 
                  onClick={async () => {
                    if (thermalRef.current) {
                      try {
                        await printThermalReceipt(thermalRef.current);
                      } catch (err) {
                        alert("Direct print failed. Opening default fallback print dialog...");
                        window.print();
                      }
                    }
                    // Automatically trigger direct prefilled WhatsApp
                    sendWhatsApp(bookedBill);
                  }}
                  className="h-16 font-extrabold text-white bg-blue-600 rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-3 active:scale-95"
                >
                  <Printer size={24} />
                  Print & Auto-Send WhatsApp 🚛
                </button>
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
              <div className="absolute top-0 left-[-9999px] pointer-events-none bg-white">
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
