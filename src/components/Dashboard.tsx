import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, getDocs, doc, updateDoc, getDoc, runTransaction, addDoc, serverTimestamp, orderBy, limit, deleteDoc, where } from 'firebase/firestore';
import { Customer, Driver, Bill, Tractor, Account } from '../types';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  IndianRupee, 
  ArrowRight,
  TrendingDown,
  Droplets,
  Users,
  AlertCircle,
  Printer,
  Smartphone,
  Banknote,
  History,
  Share2,
  Trash2,
  MessageSquare,
  Truck,
  RefreshCw,
  Plus,
  Minus,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { formatCurrency, PAYMENT_MODES, generateBillNumber } from '../constants';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { useReactToPrint } from 'react-to-print';
import { ThermalInvoice } from './ThermalInvoice';
import { toJpeg } from 'html-to-image';
import { ConfirmationModal } from './ConfirmationModal';

export function Dashboard() {
  const todayStart = startOfDay(new Date());
  
  const [bills, setBills] = useState<Bill[]>([]);
  const [bookingRequests, setBookingRequests] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [cashBalance, setCashBalance] = useState(0);
  const [bankBalance, setBankBalance] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quickVoucher, setQuickVoucher] = useState<{
    type: 'Receipt' | 'Payment';
    paymentMethod: 'Cash' | 'Bank';
  } | null>(null);
  const [quickVchForm, setQuickVchForm] = useState({
    accountId: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [isSavingQuickVch, setIsSavingQuickVch] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [smileyMood, setSmileyMood] = useState<'normal' | 'happy' | 'sad'>('normal');
  const [eatingState, setEatingState] = useState<'walking' | 'sitting' | 'eating' | 'idle'>('idle');
  const [removedDigits, setRemovedDigits] = useState<number[]>([]);

  useEffect(() => {
    if (!stats?.totalPending) return;

    const startAnimation = () => {
      setEatingState('walking');
      setRemovedDigits([]);
      
      const amountStr = Math.floor(stats.totalPending).toString();
      let digitIndex = amountStr.length - 1;

      setTimeout(() => {
        setEatingState('sitting');
        
        const performEating = () => {
          if (digitIndex < 0) {
            setEatingState('idle');
            setTimeout(startAnimation, 12000); // Wait longer before restarting
            return;
          }

          setEatingState('eating');
          
          setTimeout(() => {
            setRemovedDigits(prev => [...prev, digitIndex]);
            digitIndex--;
            setEatingState('sitting'); 
            setTimeout(performEating, 2500); // Slower eating for "relaxed" feel
          }, 1500);
        };

        setTimeout(performEating, 1500);
      }, 3500);
    };

    const initialDelay = setTimeout(startAnimation, 2000);
    return () => clearTimeout(initialDelay);
  }, [stats?.totalPending]);

  const triggerSmiley = (mood: 'happy' | 'sad') => {
    setSmileyMood(mood);
    setTimeout(() => setSmileyMood('normal'), 1200);
  };

  useEffect(() => {
    const unsubBills = onSnapshot(collection(db, 'bills'), 
      (snapshot) => setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'bills-dashboard')
    );
    const unsubRequests = onSnapshot(
      query(collection(db, 'bookingRequests'), where('status', '==', 'Pending'), orderBy('requestedAt', 'desc')),
      (snapshot) => setBookingRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => console.log('Requests err:', error)
    );
    const unsubCustomers = onSnapshot(collection(db, 'customers'), 
      (snapshot) => setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'customers-dashboard')
    );
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), 
      (snapshot) => setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'drivers-dashboard')
    );
    const unsubTractors = onSnapshot(collection(db, 'tractors'), 
      (snapshot) => setTractors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tractor))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'tractors-dashboard')
    );

    const unsubCashAcc = onSnapshot(query(collection(db, 'accounts'), where('name', '==', 'Cash')), 
      (snapshot) => {
        if (!snapshot.empty) {
          setCashBalance(snapshot.docs[0].data().currentBalance || 0);
        }
      }
    );

    const unsubBankAcc = onSnapshot(query(collection(db, 'accounts'), where('name', '==', 'Bank Account')), 
      (snapshot) => {
        if (!snapshot.empty) {
          setBankBalance(snapshot.docs[0].data().currentBalance || 0);
        }
      }
    );

    const unsubAccounts = onSnapshot(collection(db, 'accounts'), 
      (snapshot) => setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'accounts-dashboard')
    );

    return () => {
      unsubBills();
      unsubRequests();
      unsubCustomers();
      unsubDrivers();
      unsubTractors();
      unsubCashAcc();
      unsubBankAcc();
      unsubAccounts();
    };
  }, []);

  useEffect(() => {
    if (!bills.length || !customers.length) return;
    // ... rest of effect

    const todayBills = bills.filter(b => {
      const bDate = b.date instanceof Date ? b.date : new Date(b.date);
      return bDate >= todayStart;
    });

    const todayCollection = todayBills
      .filter(b => b.paymentMode !== 'Pending' && b.status !== 'Cancelled')
      .reduce((sum, b) => sum + b.grandTotal, 0);
      
    const totalPending = accounts
      .filter(acc => acc.group === 'Sundry Debtors' || acc.group === 'Duty Assignment' || customers.some(c => c.id === acc.customerId || c.name === acc.name))
      .reduce((sum, acc) => {
        // For Sundry Debtors (Customers), Dr balance is positive pending
        const bal = acc.balanceType === 'Dr' ? acc.currentBalance : -acc.currentBalance;
        // Only include if it's a customer-linked account
        const isCustomer = customers.some(c => c.id === acc.customerId || c.name === acc.name);
        return isCustomer ? sum + bal : sum;
      }, 0);

    const deliveredCount = bills.filter(b => b.status === 'Delivered').length;
    const unsettledCount = bills.filter(b => !b.isSettled).length;
    
    const chartData = Array.from({ length: 7 }).map((_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayBills = bills.filter(b => {
        const bDate = b.date instanceof Date ? b.date : new Date(b.date);
        return format(bDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd') && 
               b.status !== 'Cancelled';
      });
      return {
        name: format(date, 'EEE'),
        amount: dayBills.reduce((sum, b) => sum + b.grandTotal, 0)
      };
    });

    const allBillsSorted = [...bills].sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    const driverStats = drivers.map(driver => {
      const driverBills = bills.filter(b => b.driverName === driver.name && b.status === 'Delivered');
      const tractorUsage: Record<string, number> = {};
      driverBills.forEach(b => {
        if (b.tractorId) {
          const tractorName = tractors.find(t => t.id === b.tractorId)?.name || 'Unknown';
          tractorUsage[tractorName] = (tractorUsage[tractorName] || 0) + 1;
        }
      });
      return {
        name: driver.name,
        mobile: driver.mobile,
        tripCount: driverBills.length,
        mostUsedTractor: Object.entries(tractorUsage).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
      };
    }).filter(d => d.tripCount > 0).sort((a, b) => b.tripCount - a.tripCount);

    setStats({
      todayCollection,
      totalPending,
      cashBalance,
      bankBalance,
      deliveredCount,
      unsettledCount,
      customerCount: customers.length,
      drivers,
      tractors,
      driverStats,
      recentBills: allBillsSorted.slice(0, 10)
    });
  }, [bills, customers, drivers, tractors, cashBalance, bankBalance]);

  const handleQuickVchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVchForm.accountId || !quickVchForm.amount || !quickVoucher) return;

    setIsSavingQuickVch(true);
    try {
      const amount = Number(quickVchForm.amount);
      const isPayment = quickVoucher.type === 'Payment';
      const paymentAccName = quickVoucher.paymentMethod === 'Cash' ? 'Cash' : 'Bank Account';
      
      // Add current time to the selected date
      const entryDate = new Date(quickVchForm.date);
      const now = new Date();
      entryDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      const [paymentAccSnap, otherAccSnap] = await Promise.all([
        getDocs(query(collection(db, 'accounts'), where('name', '==', paymentAccName))),
        getDoc(doc(db, 'accounts', quickVchForm.accountId))
      ]);

      const paymentAccId = paymentAccSnap.docs[0]?.id;
      if (!paymentAccId) throw new Error("Payment account not found");
      if (!otherAccSnap.exists()) throw new Error("Selected account not found");

      await runTransaction(db, async (transaction) => {
        const paymentAccRef = doc(db, 'accounts', paymentAccId);
        const otherAccRef = doc(db, 'accounts', quickVchForm.accountId);
        
        const [payDoc, otherDoc] = await Promise.all([
          transaction.get(paymentAccRef),
          transaction.get(otherAccRef)
        ]);

        const payBal = payDoc.data()?.currentBalance || 0;
        const otherBal = otherDoc.data()?.currentBalance || 0;

        // Validation for Payments: Cash/Bank should not go negative
        if (isPayment && payBal < amount) {
          throw new Error(`INSUFFICIENT_FUNDS:${paymentAccName}:${payBal}`);
        }

        // Update Balances
        if (isPayment) {
          transaction.update(paymentAccRef, { currentBalance: payBal - amount });
          transaction.update(otherAccRef, { 
            currentBalance: otherBal + (otherDoc.data()?.balanceType === 'Dr' ? amount : -amount) 
          });
        } else {
          transaction.update(paymentAccRef, { currentBalance: payBal + amount });
          transaction.update(otherAccRef, { 
            currentBalance: otherBal + (otherDoc.data()?.balanceType === 'Cr' ? amount : -amount) 
          });
        }

        // Record Voucher
        const vchRef = doc(collection(db, 'vouchers'));
        const sourceAccName = isPayment ? otherDoc.data()?.name : paymentAccName;
        const targetAccName = isPayment ? paymentAccName : otherDoc.data()?.name;
        
        // For Receipts, we want the "Other" account to be particulars in Daybook
        // So we put the Other account as index 0 if it's a receipt? 
        // Actually Daybook particulars logic in Ledger.tsx uses items[0]
        
        transaction.set(vchRef, {
          date: entryDate,
          type: quickVoucher.type,
          voucherNumber: `QV-${Math.floor(Date.now()/1000)}`,
          items: [
            { 
              accountId: isPayment ? quickVchForm.accountId : quickVchForm.accountId, // Wait, I need to be careful
              accountName: isPayment ? otherDoc.data()?.name : otherDoc.data()?.name,
              amount, 
              type: isPayment ? 'Dr' : 'Cr' 
            },
            { 
              accountId: paymentAccId, 
              accountName: paymentAccName, 
              amount, 
              type: isPayment ? 'Cr' : 'Dr' 
            }
          ],
          narration: quickVchForm.description.trim() || `Quick ${quickVoucher.type} tracking via ${quickVoucher.paymentMethod}`,
          totalAmount: amount,
          createdAt: serverTimestamp()
        });
      });

      setQuickVoucher(null);
      setQuickVchForm({ accountId: '', amount: '', description: '', date: new Date().toISOString().split('T')[0] });
      triggerSmiley('happy');
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('INSUFFICIENT_FUNDS:')) {
        const [_, acc, bal] = error.message.split(':');
        alert(`Failed: Insufficient balance in ${acc}. \nAvailable: ₹${Number(bal).toLocaleString()}`);
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'quick_voucher');
      }
    } finally {
      setIsSavingQuickVch(false);
    }
  };

  const [editingBill, setEditingBill] = React.useState<any>(null);
  const [showPaymentSelection, setShowPaymentSelection] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, number: string } | null>(null);

  const handleStatusUpdate = async (status: 'Delivered' | 'Pending' | 'Cancelled') => {
    if (!editingBill?.id) return;

    if (status === 'Delivered') {
      setShowPaymentSelection(true);
      return;
    }

    try {
      // Fetch required data outside transaction
      const [incomeSnap, cashSnap, bankSnap, customerSnap] = await Promise.all([
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Service Income'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Cash'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Bank Account'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', editingBill.customerName)))
      ]);

      let incomeAccId = incomeSnap.docs[0]?.id;
      let cashAccId = cashSnap.docs[0]?.id;
      let bankAccId = bankSnap.docs[0]?.id;
      let customerAccId = customerSnap.docs[0]?.id;

      await runTransaction(db, async (transaction) => {
        const billRef = doc(db, 'bills', editingBill.id);
        const customerRef = doc(db, 'customers', editingBill.customerId);
        
        // --- 1. READS FIRST ---
        const [billDoc, custDoc] = await Promise.all([
          transaction.get(billRef),
          transaction.get(customerRef)
        ]);

        if (!billDoc.exists()) throw new Error("Bill not found");
        const oldBill = billDoc.data();
        const wasDelivered = oldBill.status === 'Delivered';
        const amount = oldBill.grandTotal;
        const oldPaymentMode = oldBill.paymentMode;

        const incomeAccRef = incomeAccId ? doc(db, 'accounts', incomeAccId) : null;
        const cashAccRef = cashAccId ? doc(db, 'accounts', cashAccId) : null;
        const bankAccRef = bankAccId ? doc(db, 'accounts', bankAccId) : null;
        const customerAccRef = customerAccId ? doc(db, 'accounts', customerAccId) : null;

        const [incomeAccDoc, cashAccDoc, bankAccDoc, customerAccDoc] = await Promise.all([
          incomeAccRef ? transaction.get(incomeAccRef) : Promise.resolve(null),
          cashAccRef ? transaction.get(cashAccRef) : Promise.resolve(null),
          bankAccRef ? transaction.get(bankAccRef) : Promise.resolve(null),
          customerAccRef ? transaction.get(customerAccRef) : Promise.resolve(null)
        ]);

        // --- 2. WRITES SECOND ---
        if (wasDelivered && (status === 'Pending' || status === 'Cancelled')) {
          // REVERSE ACCOUNTING
          
          // Reverse Income
          if (incomeAccDoc?.exists()) {
            transaction.update(incomeAccRef!, { currentBalance: (incomeAccDoc.data().currentBalance || 0) - amount });
          }

          // Reverse Payment
          if (oldPaymentMode === 'Cash' && cashAccDoc?.exists()) {
            transaction.update(cashAccRef!, { currentBalance: (cashAccDoc.data().currentBalance || 0) - amount });
          } else if ((oldPaymentMode === 'UPI' || oldPaymentMode === 'Bank' || oldPaymentMode === 'Bank Transfer') && bankAccDoc?.exists()) {
            transaction.update(bankAccRef!, { currentBalance: (bankAccDoc.data().currentBalance || 0) - amount });
          } else if (oldPaymentMode === 'Pending' && customerAccDoc?.exists()) {
            transaction.update(customerAccRef!, { currentBalance: (customerAccDoc.data().currentBalance || 0) - amount });
          }

          // Reverse Customer pendingAmount if it was Credit
          if (oldPaymentMode === 'Pending' && custDoc.exists()) {
             transaction.update(customerRef, {
               pendingAmount: Math.max(0, (custDoc.data().pendingAmount || 0) - amount),
               updatedAt: serverTimestamp()
             });
          }

          // DELETE VOUCHERS
          transaction.delete(doc(db, 'vouchers', `VCH-${editingBill.id}-SALE`));
          transaction.delete(doc(db, 'vouchers', `VCH-${editingBill.id}-RECPT`));
        }

        // Update Bill
        transaction.update(billRef, { 
          status,
          isSettled: false,
          updatedAt: serverTimestamp()
        });
      });

      const updated = await getDoc(doc(db, 'bills', editingBill.id));
      setEditingBill({ id: updated.id, ...updated.data() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${editingBill.id}`);
    }
  };

  const [isSettling, setIsSettling] = useState<string | null>(null);

  const handleSettleOrder = async (mode: 'Cash' | 'UPI' | 'Credit' | 'Bank') => {
    if (!editingBill?.id || isSettling) return;

    setIsSettling(mode);
    const isCredit = mode === 'Credit';
    const finalPaymentMode = isCredit ? 'Pending' : mode;

    try {
      // 1. Fetch required data outside transaction
      const [incomeSnap, cashSnap, bankSnap, debtorsGroupSnap, customerSnap, assetsGroupSnap, incomeGroupSnap] = await Promise.all([
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Service Income'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Cash'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Bank Account'))),
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Sundry Debtors'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', editingBill.customerName))),
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Current Assets'))),
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Direct Incomes')))
      ]);

      let incomeAccId = incomeSnap.docs[0]?.id;
      let cashAccId = cashSnap.docs[0]?.id;
      let bankAccId = bankSnap.docs[0]?.id;
      let debtorsGroupId = debtorsGroupSnap.docs[0]?.id;
      let customerAccId = customerSnap.docs[0]?.id;
      let assetsGroupId = assetsGroupSnap.docs[0]?.id;
      let incomeGroupId = incomeGroupSnap.docs[0]?.id;

      await runTransaction(db, async (transaction) => {
        const billRef = doc(db, 'bills', editingBill.id);
        const customerRef = doc(db, 'customers', editingBill.customerId);
        
        // --- 1. READS FIRST ---
        const [billDoc, custDoc] = await Promise.all([
          transaction.get(billRef),
          transaction.get(customerRef)
        ]);

        if (!billDoc.exists()) throw new Error("Bill not found");
        const oldBill = billDoc.data();
        const wasDelivered = oldBill.status === 'Delivered';
        const oldPaymentMode = oldBill.paymentMode;
        const amount = oldBill.grandTotal;

        // Fetch account balances inside transaction
        const incomeAccRef = incomeAccId ? doc(db, 'accounts', incomeAccId) : null;
        const cashAccRef = cashAccId ? doc(db, 'accounts', cashAccId) : null;
        const bankAccRef = bankAccId ? doc(db, 'accounts', bankAccId) : null;
        const customerAccRef = customerAccId ? doc(db, 'accounts', customerAccId) : null;

        const [incomeAccDoc, cashAccDoc, bankAccDoc, customerAccDoc] = await Promise.all([
          incomeAccRef ? transaction.get(incomeAccRef) : Promise.resolve(null),
          cashAccRef ? transaction.get(cashAccRef) : Promise.resolve(null),
          bankAccRef ? transaction.get(bankAccRef) : Promise.resolve(null),
          customerAccRef ? transaction.get(customerAccRef) : Promise.resolve(null)
        ]);

        // --- 2. WRITES SECOND ---

        // A. REVERSE OLD IMPACT (If it was previously delivered)
        if (wasDelivered) {
          // Reverse Service Income (Cr -> Dr)
          if (incomeAccDoc?.exists()) {
            transaction.update(incomeAccRef!, {
              currentBalance: (incomeAccDoc.data().currentBalance || 0) - amount
            });
          }
          // Reverse Cash/Bank/Customer impacts
          if (oldPaymentMode === 'Cash' && cashAccDoc?.exists()) {
            transaction.update(cashAccRef!, { currentBalance: (cashAccDoc.data().currentBalance || 0) - amount });
          } else if ((oldPaymentMode === 'UPI' || oldPaymentMode === 'Bank') && bankAccDoc?.exists()) {
            transaction.update(bankAccRef!, { currentBalance: (bankAccDoc.data().currentBalance || 0) - amount });
          } else if (oldPaymentMode === 'Pending' && customerAccDoc?.exists()) {
            // It was a credit sale, reverse Dr impact on customer
            transaction.update(customerAccRef!, { currentBalance: (customerAccDoc.data().currentBalance || 0) - amount });
          }
        }

        // B. APPLY NEW IMPACT
        // Handle Missing Groups & Accounts
        if (!incomeGroupId) {
          const newGrp = doc(collection(db, 'accountGroups'));
          transaction.set(newGrp, { name: 'Direct Incomes', type: 'Income' });
          incomeGroupId = newGrp.id;
        }
        
        let finalIncomeAccId = incomeAccId;
        if (!incomeAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { 
            name: 'Service Income', 
            groupId: incomeGroupId, 
            openingBalance: 0, 
            balanceType: 'Cr', 
            currentBalance: amount,
            createdAt: serverTimestamp() 
          });
          finalIncomeAccId = newAcc.id;
        } else {
            // Re-read current check: we already decremented if wasDelivered.
            // But we need the UPDATED balance from our transaction buffer or just use the doc we have and adjust relative.
            // Firestone transactions handle this.
            const baseBal = incomeAccDoc?.exists() ? incomeAccDoc.data().currentBalance || 0 : 0;
            const adjustedBase = wasDelivered ? baseBal - amount : baseBal;
            transaction.update(incomeAccRef!, { currentBalance: adjustedBase + amount });
        }

        if (!assetsGroupId) {
          const newGrp = doc(collection(db, 'accountGroups'));
          transaction.set(newGrp, { name: 'Current Assets', type: 'Asset' });
          assetsGroupId = newGrp.id;
        }
        
        let finalCashAccId = cashAccId;
        if (!cashAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { name: 'Cash', groupId: assetsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: mode === 'Cash' ? amount : 0, createdAt: serverTimestamp() });
          finalCashAccId = newAcc.id;
        } else if (cashAccDoc?.exists()) {
            const base = cashAccDoc.data().currentBalance || 0;
            const adjusted = (wasDelivered && oldPaymentMode === 'Cash') ? base - amount : base;
            transaction.update(cashAccRef!, { currentBalance: adjusted + (mode === 'Cash' ? amount : 0) });
        }

        let finalBankAccId = bankAccId;
        if (!bankAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { name: 'Bank Account', groupId: assetsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: (mode === 'UPI' || mode === 'Bank') ? amount : 0, createdAt: serverTimestamp() });
          finalBankAccId = newAcc.id;
        } else if (bankAccDoc?.exists()) {
            const base = bankAccDoc.data().currentBalance || 0;
            const adjusted = (wasDelivered && (oldPaymentMode === 'UPI' || oldPaymentMode === 'Bank')) ? base - amount : base;
            transaction.update(bankAccRef!, { currentBalance: adjusted + ((mode === 'UPI' || mode === 'Bank') ? amount : 0) });
        }

        if (!debtorsGroupId) {
          const newGrp = doc(collection(db, 'accountGroups'));
          transaction.set(newGrp, { name: 'Sundry Debtors', parentGroupId: assetsGroupId, type: 'Asset' });
          debtorsGroupId = newGrp.id;
        }
        
        let finalCustomerAccId = customerAccId;
        if (!customerAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { name: oldBill.customerName, groupId: debtorsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: isCredit ? amount : 0, createdAt: serverTimestamp() });
          finalCustomerAccId = newAcc.id;
        } else if (customerAccDoc?.exists()) {
            const base = customerAccDoc.data().currentBalance || 0;
            const adjusted = (wasDelivered && oldPaymentMode === 'Pending') ? base - amount : base;
            transaction.update(customerAccRef!, { currentBalance: adjusted + (isCredit ? amount : 0) });
        }

        // Update Bill
        transaction.update(billRef, { 
          status: 'Delivered', 
          paymentMode: finalPaymentMode,
          isSettled: !isCredit,
          updatedAt: serverTimestamp()
        });

        // Update Customer Ledger (pendingAmount field)
        const currentPending = custDoc.exists() ? (custDoc.data().pendingAmount || 0) : 0;
        const adjustedPending = (wasDelivered && oldPaymentMode === 'Pending') ? currentPending - amount : currentPending;
        transaction.update(customerRef, {
          pendingAmount: adjustedPending + (isCredit ? amount : 0),
          updatedAt: serverTimestamp()
        });

        // --- 3. UPSERT VOUCHERS ---
        // Sales Voucher
        const salesVchId = `VCH-${editingBill.id}-SALE`;
        transaction.set(doc(db, 'vouchers', salesVchId), {
          date: new Date(),
          type: 'Sales',
          voucherNumber: `TRP-${oldBill.billNumber}`,
          items: [
            { accountId: finalCustomerAccId, accountName: oldBill.customerName, amount: amount, type: 'Dr' },
            { accountId: finalIncomeAccId, accountName: 'Service Income', amount: amount, type: 'Cr' }
          ],
          narration: `Trip #${oldBill.billNumber} - ${oldBill.customerName} (${oldBill.tankerSize})`,
          totalAmount: amount,
          createdAt: oldBill.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Receipt Voucher (if not credit)
        const receiptVchId = `VCH-${editingBill.id}-RECPT`;
        if (!isCredit) {
          const debitAccId = (mode === 'UPI' || mode === 'Bank') ? finalBankAccId : finalCashAccId;
          const debitAccName = (mode === 'UPI' || mode === 'Bank') ? 'Bank Account' : 'Cash';
          
          transaction.set(doc(db, 'vouchers', receiptVchId), {
            date: new Date(),
            type: 'Receipt',
            voucherNumber: `REC-${oldBill.billNumber}`,
            items: [
              { accountId: debitAccId, accountName: debitAccName, amount: amount, type: 'Dr' },
              { accountId: finalCustomerAccId, accountName: oldBill.customerName, amount: amount, type: 'Cr' }
            ],
            narration: `Payment for Token #${oldBill.billNumber} via ${mode}`,
            totalAmount: amount,
            createdAt: serverTimestamp()
          });
        } else {
          // If it was previously receipted but now changed to credit, delete receipt voucher
          transaction.delete(doc(db, 'vouchers', receiptVchId));
        }
      });

      // Show "Done" state for 1 second
      setIsSettling('DONE');
      triggerSmiley(mode === 'Credit' ? 'sad' : 'happy');
      
      setTimeout(() => {
        setIsSettling(null);
        setShowPaymentSelection(false);
        setEditingBill(null);
      }, 1000);

    } catch (error: any) {
      setIsSettling(null);
      handleFirestoreError(error, OperationType.WRITE, 'transaction');
    }
  };

  const handlePaymentUpdate = async (mode: typeof PAYMENT_MODES[number]) => {
    if (!editingBill?.id || isSettling) return;
    
    setIsSettling(mode);
    const oldMode = editingBill.paymentMode;
    const isCredit = mode === 'Pending';
    
    try {
      // 1. Fetch required data outside transaction
      const [cashSnap, bankSnap, customerSnap, assetsGroupSnap] = await Promise.all([
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Cash'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Bank Account'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', editingBill.customerName))),
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Current Assets')))
      ]);

      let cashAccId = cashSnap.docs[0]?.id;
      let bankAccId = bankSnap.docs[0]?.id;
      let customerAccId = customerSnap.docs[0]?.id;
      let assetsGroupId = assetsGroupSnap.docs[0]?.id;

      await runTransaction(db, async (transaction) => {
        const billRef = doc(db, 'bills', editingBill.id);
        const customerRef = doc(db, 'customers', editingBill.customerId);
        
        const cashAccRef = cashAccId ? doc(db, 'accounts', cashAccId) : null;
        const bankAccRef = bankAccId ? doc(db, 'accounts', bankAccId) : null;
        const customerAccRef = customerAccId ? doc(db, 'accounts', customerAccId) : null;

        // --- 1. READS FIRST ---
        const [billDoc, custDoc, cashAccDoc, bankAccDoc, customerAccDoc] = await Promise.all([
          transaction.get(billRef),
          transaction.get(customerRef),
          cashAccRef ? transaction.get(cashAccRef) : Promise.resolve(null),
          bankAccRef ? transaction.get(bankAccRef) : Promise.resolve(null),
          customerAccRef ? transaction.get(customerAccRef) : Promise.resolve(null)
        ]);
        
        if (!billDoc.exists()) throw new Error("Bill not found");
        const billData = billDoc.data();
        const amount = billData.grandTotal;
        const wasDelivered = billData.status === 'Delivered';

        // --- 2. WRITES SECOND ---

        if (wasDelivered) {
          // A. REVERSE OLD PAYMENT IMPACT
          if (oldMode === 'Cash' && cashAccDoc?.exists()) {
            transaction.update(cashAccRef!, { currentBalance: (cashAccDoc.data().currentBalance || 0) - amount });
          } else if ((oldMode === 'UPI' || oldMode === 'Bank Transfer' || oldMode === 'Bank') && bankAccDoc?.exists()) {
            transaction.update(bankAccRef!, { currentBalance: (bankAccDoc.data().currentBalance || 0) - amount });
          } else if (oldMode === 'Pending' && customerAccDoc?.exists()) {
            transaction.update(customerAccRef!, { currentBalance: (customerAccDoc.data().currentBalance || 0) - amount });
          }

          // B. APPLY NEW PAYMENT IMPACT
          if (!assetsGroupId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { name: 'Current Assets', type: 'Asset' });
            assetsGroupId = newGrp.id;
          }
          
          let finalCashAccId = cashAccId;
          const isNewCash = mode === 'Cash';
          if (!cashAccId && isNewCash) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, { name: 'Cash', groupId: assetsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: amount, createdAt: serverTimestamp() });
            finalCashAccId = newAcc.id;
          } else if (cashAccDoc?.exists()) {
            const base = (cashAccDoc.data().currentBalance || 0);
            const adjusted = (oldMode === 'Cash') ? base - amount : base;
            transaction.update(cashAccRef!, { currentBalance: adjusted + (isNewCash ? amount : 0) });
          }

          let finalBankAccId = bankAccId;
          const isNewBank = mode === 'UPI' || mode === 'Bank Transfer';
          if (!bankAccId && isNewBank) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, { name: 'Bank Account', groupId: assetsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: amount, createdAt: serverTimestamp() });
            finalBankAccId = newAcc.id;
          } else if (bankAccDoc?.exists()) {
            const base = (bankAccDoc.data().currentBalance || 0);
            const adjusted = (oldMode === 'UPI' || oldMode === 'Bank Transfer') ? base - amount : base;
            transaction.update(bankAccRef!, { currentBalance: adjusted + (isNewBank ? amount : 0) });
          }

          if (customerAccDoc?.exists()) {
            const base = (customerAccDoc.data().currentBalance || 0);
            const adjusted = (oldMode === 'Pending') ? base - amount : base;
            transaction.update(customerAccRef!, { currentBalance: adjusted + (isCredit ? amount : 0) });
          }

          // Update Customer pendingAmount field
          if (custDoc.exists()) {
            const currentPending = custDoc.data().pendingAmount || 0;
            const adjustedPending = (oldMode === 'Pending') ? currentPending - amount : currentPending;
            transaction.update(customerRef, {
              pendingAmount: Math.max(0, adjustedPending + (isCredit ? amount : 0)),
              updatedAt: serverTimestamp()
            });
          }

          // C. UPSERT VOUCHERS
          const receiptVchId = `VCH-${editingBill.id}-RECPT`;
          if (!isCredit) {
            const debitAccId = isNewBank ? finalBankAccId! : finalCashAccId!;
            const debitAccName = isNewBank ? 'Bank Account' : 'Cash';
            
            transaction.set(doc(db, 'vouchers', receiptVchId), {
              date: new Date(),
              type: 'Receipt',
              voucherNumber: `REC-${billData.billNumber}`,
              items: [
                { accountId: debitAccId, accountName: debitAccName, amount: amount, type: 'Dr' },
                { accountId: customerAccId, accountName: billData.customerName, amount: amount, type: 'Cr' }
              ],
              narration: `Payment mode update for Token #${billData.billNumber} to ${mode}`,
              totalAmount: amount,
              createdAt: serverTimestamp()
            });
          } else {
            transaction.delete(doc(db, 'vouchers', receiptVchId));
          }
        }

        // Bill Update
        transaction.update(billRef, { 
          paymentMode: mode, 
          isSettled: !isCredit,
          updatedAt: serverTimestamp()
        });
      });
      
      setIsSettling('DONE');
      triggerSmiley('happy');
      setTimeout(() => {
        setIsSettling(null);
        setEditingBill(null);
      }, 1000);
    } catch (error) {
      setIsSettling(null);
      handleFirestoreError(error, OperationType.UPDATE, `bills/${editingBill?.id}`);
    }
  };

  const handleDriverUpdate = async (driver: { name: string; mobile: string }) => {
    if (editingBill?.id) {
      try {
        await updateDoc(doc(db, 'bills', editingBill.id), { 
          driverName: driver.name,
          driverMobile: driver.mobile,
          updatedAt: serverTimestamp()
        });
        const updated = await getDoc(doc(db, 'bills', editingBill.id));
        setEditingBill({ id: updated.id, ...updated.data() });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `bills/${editingBill.id}`);
      }
    }
  };

  const handleTractorUpdate = async (tractorId: string) => {
    if (editingBill?.id) {
      try {
        await updateDoc(doc(db, 'bills', editingBill.id), { 
          tractorId,
          updatedAt: serverTimestamp()
        });
        const updated = await getDoc(doc(db, 'bills', editingBill.id));
        setEditingBill({ id: updated.id, ...updated.data() });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `bills/${editingBill.id}`);
      }
    }
  };

  const handleAcceptRequest = async (request: any) => {
    try {
      // 1. Get original bill details
      const originalBillRef = doc(db, 'bills', request.billId);
      const originalBillSnap = await getDoc(originalBillRef);
      
      if (!originalBillSnap.exists()) {
        alert("Original order not found.");
        return;
      }

      const originalData = originalBillSnap.data();
      
      // 2. Generate new bill number
      const allBills = await getDocs(collection(db, 'bills'));
      const newBillNumber = generateBillNumber(allBills.size + 1);

      // 3. Create new bill based on original but with current time
      const newBillData = {
        ...originalData,
        billNumber: newBillNumber,
        date: new Date().toISOString(),
        status: 'Pending',
        isSettled: false,
        paymentMode: 'Pending',
        remarks: request.remarks || originalData.remarks || '',
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'bills'), newBillData);

      // 4. Update request status
      await updateDoc(doc(db, 'bookingRequests', request.id), { 
        status: 'Accepted',
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookingRequests/${request.id}`);
    }
  };

  const handleRejectRequest = async (request: any) => {
    try {
      await updateDoc(doc(db, 'bookingRequests', request.id), { 
        status: 'Rejected',
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookingRequests/${request.id}`);
    }
  };

  const handleDeleteToken = async (id: string) => {
    try {
      // 1. Fetch data outside transition
      const [billSnap, incomeSnap, cashSnap, bankSnap] = await Promise.all([
        getDoc(doc(db, 'bills', id)),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Service Income'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Cash'))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Bank Account')))
      ]);

      if (!billSnap.exists()) return;
      const billData = billSnap.data();
      const customerAccSnap = await getDocs(query(collection(db, 'accounts'), where('name', '==', billData.customerName)));

      let incomeAccId = incomeSnap.docs[0]?.id;
      let cashAccId = cashSnap.docs[0]?.id;
      let bankAccId = bankSnap.docs[0]?.id;
      let customerAccId = customerAccSnap.docs[0]?.id;

      await runTransaction(db, async (transaction) => {
        const billRef = doc(db, 'bills', id);
        const customerRef = doc(db, 'customers', billData.customerId);
        
        // --- READS ---
        const custDoc = await transaction.get(customerRef);
        const incomeAccRef = incomeAccId ? doc(db, 'accounts', incomeAccId) : null;
        const cashAccRef = cashAccId ? doc(db, 'accounts', cashAccId) : null;
        const bankAccRef = bankAccId ? doc(db, 'accounts', bankAccId) : null;
        const customerAccRef = customerAccId ? doc(db, 'accounts', customerAccId) : null;

        const [incomeAccDoc, cashAccDoc, bankAccDoc, customerAccDoc] = await Promise.all([
          incomeAccRef ? transaction.get(incomeAccRef) : Promise.resolve(null),
          cashAccRef ? transaction.get(cashAccRef) : Promise.resolve(null),
          bankAccRef ? transaction.get(bankAccRef) : Promise.resolve(null),
          customerAccRef ? transaction.get(customerAccRef) : Promise.resolve(null)
        ]);

        // --- WRITES ---
        if (billData.status === 'Delivered') {
          const amount = billData.grandTotal;
          const oldPaymentMode = billData.paymentMode;

          // Reverse Income
          if (incomeAccDoc?.exists()) {
            transaction.update(incomeAccRef!, { currentBalance: (incomeAccDoc.data().currentBalance || 0) - amount });
          }

          // Reverse Payment
          if (oldPaymentMode === 'Cash' && cashAccDoc?.exists()) {
            transaction.update(cashAccRef!, { currentBalance: (cashAccDoc.data().currentBalance || 0) - amount });
          } else if ((oldPaymentMode === 'UPI' || oldPaymentMode === 'Bank' || oldPaymentMode === 'Bank Transfer') && bankAccDoc?.exists()) {
            transaction.update(bankAccRef!, { currentBalance: (bankAccDoc.data().currentBalance || 0) - amount });
          } else if (oldPaymentMode === 'Pending' && customerAccDoc?.exists()) {
            transaction.update(customerAccRef!, { currentBalance: (customerAccDoc.data().currentBalance || 0) - amount });
          }

          // Reverse Customer pendingAmount
          if (oldPaymentMode === 'Pending' && custDoc.exists()) {
             transaction.update(customerRef, {
               pendingAmount: Math.max(0, (custDoc.data().pendingAmount || 0) - amount),
               updatedAt: serverTimestamp()
             });
          }

          // Delete Vouchers
          transaction.delete(doc(db, 'vouchers', `VCH-${id}-SALE`));
          transaction.delete(doc(db, 'vouchers', `VCH-${id}-RECPT`));
        }

        // Delete the bill
        transaction.delete(billRef);
      });

      setEditingBill(null);
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `bills/${id}`);
    }
  };

  const shareBillImage = async (bill: any, target: 'customer' | 'driver' = 'customer') => {
    if (!printRef.current) return;
    
    try {
      // Capture the thermal receipt as JPEG
      const dataUrl = await toJpeg(printRef.current, { 
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
            text: `Trip Token from Rajhans steel and Water. Target: ${target.toUpperCase()}`
          });
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') return;
          console.warn('Web Share failed, trying fallback:', shareErr);
        }
      }

      // Try Copy to Clipboard
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          const item = new ClipboardItem({ [blob.type]: blob });
          await navigator.clipboard.write([item]);
          alert('Token image copied! Opening WhatsApp... Just Paste (Ctrl+V) and send.');
        } else {
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = fileName;
          link.click();
        }
      } catch (err) {
        console.warn('Clipboard share failed', err);
      }

      // Open WhatsApp text as fallback
      sendWhatsApp(bill, target);
    } catch (err) {
      console.error('Error sharing image:', err);
      sendWhatsApp(bill, target);
    }
  };

  const sendWhatsApp = (bill: any, target: 'customer' | 'driver' = 'customer') => {
    const rawPhone = target === 'customer' ? (bill.customerMobile || '') : (bill.driverMobile || '');
    if (!rawPhone) {
      alert(`No ${target} mobile number found.`);
      return;
    }

    const cleanPhone = rawPhone.replace(/\D/g, '');
    const phone = cleanPhone.startsWith('91') && cleanPhone.length > 10 
      ? cleanPhone 
      : `91${cleanPhone.slice(-10)}`;

    const rebookUrl = `${window.location.origin}/?o=${bill.id}`;
    const message = target === 'customer' 
      ? `*Order Token - Rajhans* 🚛\n\n` +
        `Token: #${bill.billNumber}\n` +
        `Amt: ₹${bill.grandTotal}\n` +
        `Size: ${bill.tankerSize}\n` +
        `Driver: ${bill.driverName || 'N/A'}\n\n` +
        `Rebook: ${rebookUrl}\n\n` +
        `Rajhans Steel & Water`
      : `*Duty Assignment - Rajhans steel and Water* 🚛\n\n` +
        `Hi ${bill.driverName},\n` +
        `New trip assigned to you.\n\n` +
        `*Token:* #${bill.billNumber}\n` +
        `*Customer:* ${bill.customerName}\n` +
        `*Address:* ${bill.customerAddress || 'N/A'}\n` +
        `*Tanker:* ${bill.tankerSize}\n\n` +
        `Please proceed for delivery.`;
    
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const printRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Token_${editingBill?.billNumber || 'Order'}`,
  });

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4 text-center">
        <div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-0 pb-32">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
            <Droplets size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Rajhans steel and Water</h1>
            <p className="text-slate-500 text-sm">Dashboard Overview</p>
          </div>
        </div>
        {stats.unsettledCount > 0 && (
          <div className="bg-orange-100 text-orange-600 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5 animate-pulse">
            <AlertCircle size={14} /> {stats.unsettledCount} Open
          </div>
        )}
      </header>

      {/* Hero Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }}
          className="relative bg-white p-5 rounded-[2.5rem] text-slate-900 shadow-2xl border border-white/80 overflow-hidden group ring-1 ring-white/50"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(248,250,255,0.95) 100%)",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.05), inset 0 2px 4px 0 rgba(255, 255, 255, 0.5)"
          }}
        >
          {/* Mirror Shine Effect */}
          <motion.div 
            animate={{ x: ['150%', '-150%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent skew-x-20 pointer-events-none z-20"
          />

          {/* Dynamic Hourly Cash Animation Layer */}
          <div className="absolute inset-0 pointer-events-none opacity-80 overflow-hidden">
            {(() => {
              const hour = new Date().getHours();
              const theme = hour % 3;
              if (theme === 0) {
                return [...Array(25)].map((_, i) => (
                  <motion.div
                    key={`cash-wind-${i}`}
                    initial={{ x: -80, y: Math.random() * 200, rotateZ: Math.random() * 360, scale: 0.6 + Math.random() * 0.6, opacity: 0 }}
                    animate={{ x: 450, y: (Math.random() - 0.5) * 180 + (i * 6), rotateX: [0, 360, 720], rotateY: [0, 180, 0], rotateZ: [0, 180, 360, 540, 720], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 0.5 + Math.random() * 0.4, repeat: Infinity, delay: Math.random() * 4, ease: "linear" }}
                    className="absolute flex items-center justify-center"
                  >
                    <div className="w-12 h-6 bg-green-100 border border-green-200 rounded-sm flex items-center justify-center shadow-lg relative overflow-hidden">
                      <div className="absolute inset-0 bg-green-500/10 mix-blend-multiply" />
                      <span className="text-[10px] font-black text-green-600 leading-none">₹</span>
                    </div>
                  </motion.div>
                ));
              } else if (theme === 1) {
                return [...Array(15)].map((_, i) => (
                  <motion.div
                    key={`cash-coins-${i}`}
                    initial={{ x: Math.random() * 300, y: -20, opacity: 0, scale: 0.5 }}
                    animate={{ y: 220, opacity: [0, 1, 1, 0], rotateY: 360, scale: [0.5, 1, 1, 0.5] }}
                    transition={{ duration: 1.5 + Math.random() * 1, repeat: Infinity, delay: Math.random() * 5 }}
                    className="absolute w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-400 to-yellow-200 shadow-inner flex items-center justify-center border border-yellow-500/30"
                  >
                    <span className="text-[10px] font-black text-yellow-700">₹</span>
                  </motion.div>
                ));
              } else {
                return [...Array(12)].map((_, i) => (
                  <motion.div
                    key={`cash-bubble-${i}`}
                    initial={{ x: Math.random() * 300, y: 180, opacity: 0, scale: 0 }}
                    animate={{ y: -50, opacity: [0, 0.6, 0], scale: [0.5, 1.5, 0.5], x: (Math.random() * 300) + (Math.sin(i) * 50) }}
                    transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 5 }}
                    className="absolute w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center backdrop-blur-[2px]"
                  >
                    <span className="text-sm font-black text-green-600/40">₹</span>
                  </motion.div>
                ));
              }
            })()}
          </div>

          <div className="relative z-10">
            <div className="bg-slate-900/5 w-10 h-10 rounded-xl flex items-center justify-center mb-4 border border-white/20">
              <Banknote size={20} className="text-slate-700" />
            </div>
            <div className="flex items-center gap-3 mb-1 justify-between">
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Cash in Hand</div>
              <div className="flex gap-1">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickVoucher({ type: 'Receipt', paymentMethod: 'Cash' });
                  }}
                  className="w-6 h-6 rounded-lg bg-green-500 text-white shadow-sm flex items-center justify-center hover:bg-green-600 transition-colors"
                  title="Add Cash"
                >
                  <Plus size={14} />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickVoucher({ type: 'Payment', paymentMethod: 'Cash' });
                  }}
                  className="w-6 h-6 rounded-lg bg-red-500 text-white shadow-sm flex items-center justify-center hover:bg-red-600 transition-colors"
                  title="Spend Cash"
                >
                  <Minus size={14} />
                </button>
              </div>
              <motion.div
                key={smileyMood}
                initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                animate={{ 
                  scale: 1.2, 
                  opacity: 1, 
                  rotate: 0,
                  y: smileyMood === 'sad' ? [0, 5, 0] : [0, -5, 0]
                }}
                transition={{ 
                  scale: { type: "spring", stiffness: 260, damping: 20 },
                  opacity: { duration: 0.2 },
                  rotate: { type: "spring", stiffness: 260, damping: 20 },
                  y: { duration: 0.5, times: [0, 0.5, 1], ease: "easeInOut" }
                }}
                className="relative w-10 h-10 -mt-1"
              >
                <img 
                  src={
                    smileyMood === 'happy' 
                      ? "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Smiling%20Face%20with%20Sunglasses.png" 
                      : smileyMood === 'sad' 
                        ? "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Crying%20Face.png"
                        : "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Slightly%20Smiling%20Face.png"
                  } 
                  alt="mood sticker"
                  className="w-full h-full object-contain drop-shadow-md"
                />
              </motion.div>
            </div>
            <div className="text-3xl font-display font-black text-slate-900 tracking-tight">
              <span className="text-xl mr-1 text-slate-400">₹</span>
              {Number(stats.cashBalance).toLocaleString()}
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden h-[180px] group"
        >
          {/* Dynamic Hourly Bank Animation Layer */}
          <div className="absolute inset-0 pointer-events-none opacity-40 overflow-hidden">
            {(() => {
              const hour = new Date().getHours();
              const theme = (hour + 1) % 3;
              if (theme === 0) {
                return [...Array(6)].map((_, i) => (
                  <motion.div
                    key={`bank-pulse-${i}`}
                    initial={{ scale: 0, opacity: 0.8 }}
                    animate={{ scale: 4, opacity: 0 }}
                    transition={{ duration: 3, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-blue-400/20 rounded-full"
                  />
                ));
              } else if (theme === 1) {
                return [...Array(8)].map((_, i) => (
                  <motion.div
                    key={`bank-cards-${i}`}
                    initial={{ x: 400, y: Math.random() * 150, opacity: 0, rotate: -20 }}
                    animate={{ x: -100, opacity: [0, 0.4, 0.4, 0], rotate: 10 }}
                    transition={{ duration: 4 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 4 }}
                    className="absolute w-14 h-9 bg-gradient-to-br from-blue-400/20 to-indigo-500/20 border border-white/10 rounded-md backdrop-blur-[1px]"
                  >
                    <div className="absolute top-2 left-2 w-3 h-2 bg-yellow-400/20 rounded-sm" />
                  </motion.div>
                ));
              } else {
                return [...Array(20)].map((_, i) => (
                  <motion.div
                    key={`bank-matrix-${i}`}
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 200, opacity: [0, 0.8, 0] }}
                    transition={{ duration: 1 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
                    className="absolute text-[8px] font-mono text-blue-400/40"
                    style={{ left: `${i * 5}%` }}
                  >
                    {Math.random() > 0.5 ? '1' : '0'}
                  </motion.div>
                ));
              }
            })()}
          </div>

          <div className="bg-orange-100 text-orange-600 w-10 h-10 rounded-xl flex items-center justify-center mb-4 relative z-20">
            <Smartphone size={20} />
          </div>
          
          <div className="flex items-center justify-between mb-1 relative z-20">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Bank Balance</div>
            <div className="flex gap-1">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickVoucher({ type: 'Receipt', paymentMethod: 'Bank' });
                }}
                className="w-6 h-6 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-600 flex items-center justify-center transition-colors"
                title="Add to Bank"
              >
                <Plus size={14} />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickVoucher({ type: 'Payment', paymentMethod: 'Bank' });
                }}
                className="w-6 h-6 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-colors"
                title="Spend from Bank"
              >
                <Minus size={14} />
              </button>
            </div>
          </div>
          
          <div className="text-4xl font-display font-black text-slate-800 flex items-baseline relative z-20">
            <span className="text-xl mr-1 text-orange-500">₹</span>
            {Math.floor(stats.bankBalance).toString().split('').map((digit, i) => {
              const isEaten = removedDigits.includes(i);
              return (
                <motion.span
                  key={i}
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ 
                    opacity: isEaten ? 0 : 1,
                    y: isEaten ? -40 : 0,
                    scale: isEaten ? 0 : 1,
                    rotate: isEaten ? [0, 10, -10, 0] : 0
                  }}
                  transition={{ 
                    duration: 0.8, 
                    type: 'spring',
                    rotate: { type: 'keyframes' }
                  }}
                  className="inline-block"
                >
                  {digit}
                </motion.span>
              );
            })}
          </div>

          {/* Baal Hanuman Animation - Sticker Style */}
          <motion.div
            initial={{ x: 280, y: 40, opacity: 0 }}
            animate={{ 
              x: eatingState === 'walking' ? 120 : eatingState === 'idle' ? 280 : 80,
              y: eatingState === 'sitting' || eatingState === 'eating' ? 50 : 30,
              opacity: 1,
              scale: eatingState === 'eating' ? [1.4, 1.55, 1.4] : 1.4,
            }}
            transition={{ 
              x: { duration: eatingState === 'walking' ? 3 : 1, ease: "easeOut" },
              scale: { type: 'keyframes', duration: 0.5, repeat: eatingState === 'eating' ? Infinity : 0 }
            }}
            className="absolute bottom-4 right-0 w-28 h-28 pointer-events-none z-10"
          >
            <div className="relative w-full h-full">
              <img 
                src="https://raw.githubusercontent.com/msharma6565/assets/main/hanuman_kid_hd.png" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Child.png";
                }}
                className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] drop-shadow-[2px_4px_12px_rgba(0,0,0,0.15)]"
                alt="Baal Hanuman Sticker"
              />
              
              <AnimatePresence>
                {eatingState === 'eating' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0, y: 0 }}
                    animate={{ opacity: 1, scale: 1.1, y: -25 }}
                    exit={{ opacity: 0, scale: 0 }}
                    className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border-2 border-white/50 whitespace-nowrap z-30"
                  >
                    CHOMP!
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-50 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Delivered</div>
            <div className="font-bold text-slate-800">{stats.deliveredCount} Tokens</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-50 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Users size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Customers</div>
            <div className="font-bold text-slate-800">{stats.customerCount}</div>
          </div>
        </div>
      </div>

      {/* Booking Requests */}
      <AnimatePresence>
        {bookingRequests.length > 0 && (
          <div className="mb-8 space-y-3">
            <h3 className="font-display font-bold text-lg flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              Rebooking Requests
            </h3>
            {bookingRequests.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center">
                    <RefreshCw size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{req.customerName}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Request for {req.tankerSize} Tanker
                    </div>
                    {req.remarks && (
                      <div className="mt-1 text-[11px] text-orange-600 bg-orange-50 px-2 py-1 rounded-lg border border-orange-100 flex items-start gap-1">
                        <MessageSquare size={10} className="mt-0.5" />
                        <span className="italic">"{req.remarks}"</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRejectRequest(req)}
                    className="px-4 py-2 bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl text-xs font-bold transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleAcceptRequest(req)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2"
                  >
                    <CheckCircle2 size={14} /> Accept
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Recent Tokens */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-lg">Recent Tokens</h3>
          <button className="text-blue-600 text-sm font-semibold flex items-center gap-1">
            View All <ArrowRight size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {stats.recentBills.length === 0 && (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8 text-slate-400 bg-white rounded-3xl border border-dashed text-xs uppercase font-bold tracking-widest"
              >
                No recent activity
              </motion.div>
            )}
            {stats.recentBills.map(bill => (
              <motion.div 
                key={bill.id} 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ 
                  opacity: 0, 
                  scale: 1.15, 
                  x: 40, 
                  y: -60, 
                  rotate: 6,
                  skewX: 12,
                  filter: 'blur(30px) grayscale(100%) sepia(30%) brightness(1.3)',
                  transition: { 
                    duration: 2, 
                    ease: [0.4, 0, 1, 1], // accelerated ease in
                    opacity: { duration: 1.2 }
                  }
                }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setEditingBill(bill)}
                className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-50 shadow-sm relative overflow-hidden text-left cursor-pointer"
              >
              {!bill.isSettled && bill.status !== 'Cancelled' && (
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-orange-400" />
              )}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${
                  bill.status === 'Cancelled' ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'
                }`}>
                  {bill.tankerSize[0]}
                </div>
                <div>
                  <div className="font-bold">{bill.customerName}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {bill.createdAt?.toDate ? format(bill.createdAt.toDate(), 'dd MMM, hh:mm a') : format(new Date(bill.date), 'dd MMM, hh:mm a')}
                    </span>
                    {(bill.tractorId || bill.driverName) && (
                      <div className="flex items-center gap-1.5 ml-1">
                        <span className="w-1 h-1 rounded-full bg-slate-200" />
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                          {tractors.find(t => t.id === bill.tractorId)?.name || 'N/A'} • {bill.driverName || 'N/A'}
                        </span>
                      </div>
                    )}
                  </div>
                  {bill.remarks && (
                    <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 flex items-start gap-1 max-w-[250px]">
                      <MessageSquare size={10} className="mt-0.5 text-slate-400 flex-shrink-0" />
                      <span className="italic truncate">{bill.remarks}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-bold text-sm">{formatCurrency(bill.grandTotal)}</div>
                  <div className={`text-[10px] font-bold uppercase flex items-center gap-1 justify-end ${
                    bill.status === 'Delivered' ? 'text-green-500' : 
                    bill.status === 'Cancelled' ? 'text-red-500' : 
                    bill.status === 'Printed' ? 'text-slate-400 italic' : 'text-orange-500'
                  }`}>
                    {bill.status === 'Delivered' && (
                      <span className="bg-slate-100 text-slate-500 px-1 rounded lowercase font-medium border border-slate-200">
                        {bill.paymentMode === 'Pending' ? 'credit' : bill.paymentMode}
                      </span>
                    )}
                    {bill.status === 'Printed' ? 'Ready' : bill.status}
                  </div>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    sendWhatsApp(bill, 'customer');
                  }}
                  className="w-8 h-8 bg-green-50 text-green-600 rounded-full flex items-center justify-center hover:bg-green-600 hover:text-white transition-all shadow-sm flex-shrink-0"
                >
                  <MessageSquare size={16} />
                </button>
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Trip Board */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-lg">Trip Board</h3>
          <div className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold uppercase tracking-wider">
            Live Rankings
          </div>
        </div>
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          {stats.driverStats.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm italic">
              No completed trips recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {stats.driverStats.map((driver: any, index: number) => (
                <div key={driver.name} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm ${
                      index === 0 ? 'bg-yellow-100 text-yellow-600' :
                      index === 1 ? 'bg-slate-100 text-slate-500' :
                      index === 2 ? 'bg-orange-100 text-orange-600' :
                      'bg-slate-50 text-slate-400'
                    }`}>
                      #{index + 1}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{driver.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Truck size={10} className="text-blue-600" />
                        <span className="text-[10px] font-bold text-blue-600 uppercase">
                          {driver.mostUsedTractor}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-display font-black text-slate-900">
                      {driver.tripCount}
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                      Trips Done
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payment Selection Modal */}
      <AnimatePresence>
        {showPaymentSelection && editingBill && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Record Payment</h3>
                <p className="text-slate-500 font-medium">Token: #{editingBill.billNumber}</p>
                <div className="mt-4 text-3xl font-display font-black text-slate-900">
                  {formatCurrency(editingBill.grandTotal)}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 relative">
                <button 
                  onClick={() => handleSettleOrder('Cash')}
                  disabled={isSettling !== null}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all group overflow-hidden relative ${
                    isSettling === 'Cash' ? 'border-green-600 bg-green-50' : 
                    isSettling === 'DONE' ? 'opacity-50 border-slate-100' : 'border-slate-100 hover:border-slate-900'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isSettling === 'Cash' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white'
                  }`}>
                    <Banknote size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">Cash Received</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Deposited to Cash Account</div>
                  </div>
                  {isSettling === 'Cash' && (
                    <div className="absolute inset-0 bg-green-600/5 flex items-center justify-center">
                      <div className="animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full" />
                    </div>
                  )}
                </button>

                <button 
                  onClick={() => handleSettleOrder('UPI')}
                  disabled={isSettling !== null}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all group overflow-hidden relative ${
                    isSettling === 'UPI' ? 'border-blue-600 bg-blue-50' : 
                    isSettling === 'DONE' ? 'opacity-50 border-slate-100' : 'border-slate-100 hover:border-slate-900'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isSettling === 'UPI' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'
                  }`}>
                    <Smartphone size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">UPI / Bank Transfer</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Deposited to Bank Account</div>
                  </div>
                  {isSettling === 'UPI' && (
                    <div className="absolute inset-0 bg-blue-600/5 flex items-center justify-center">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                    </div>
                  )}
                </button>

                <button 
                  onClick={() => handleSettleOrder('Credit')}
                  disabled={isSettling !== null}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all group overflow-hidden relative ${
                    isSettling === 'Credit' ? 'border-orange-600 bg-orange-50' : 
                    isSettling === 'DONE' ? 'opacity-50 border-slate-100' : 'border-slate-100 hover:border-slate-900'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isSettling === 'Credit' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white'
                  }`}>
                    <History size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">Credit (Udhaar)</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Added to Customer Due Account</div>
                  </div>
                  {isSettling === 'Credit' && (
                    <div className="absolute inset-0 bg-orange-600/5 flex items-center justify-center">
                      <div className="animate-spin h-5 w-5 border-2 border-orange-600 border-t-transparent rounded-full" />
                    </div>
                  )}
                </button>

                {isSettling === 'DONE' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-50 rounded-[2rem] border-4 border-green-500 shadow-2xl shadow-green-100"
                  >
                    <motion.div 
                      initial={{ scale: 0 }} 
                      animate={{ scale: [0, 1.2, 1] }} 
                      transition={{ duration: 0.4 }}
                      className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg"
                    >
                      <CheckCircle2 size={40} />
                    </motion.div>
                    <span className="font-display font-black text-2xl text-green-600 uppercase tracking-widest">Done!</span>
                  </motion.div>
                )}
              </div>

              <button 
                onClick={() => setShowPaymentSelection(false)}
                className="w-full mt-6 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors"
              >
                Back
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingBill && !showPaymentSelection && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-end justify-center p-4">
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md rounded-t-[3rem] p-8 pb-10 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold">{editingBill.customerName}</h3>
                  <p className="text-sm text-slate-400 font-mono">{editingBill.billNumber}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => editingBill && setDeleteConfirm({ id: editingBill.id, number: editingBill.billNumber })}
                    className="w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-100 transition-colors"
                    title="Delete Token"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button 
                    onClick={() => setEditingBill(null)}
                    className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center"
                  >
                    <AlertCircle size={20} className="rotate-45" />
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {/* Status Options */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Update Delivery Status</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => handleStatusUpdate('Delivered')}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${editingBill.status === 'Delivered' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-100 text-slate-500'}`}
                    >
                      <CheckCircle2 size={24} />
                      <span className="text-[10px] font-bold">Delivered</span>
                    </button>
                    <button 
                      onClick={() => handleStatusUpdate('Pending')}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${editingBill.status === 'Pending' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 text-slate-500'}`}
                    >
                      <Clock size={24} />
                      <span className="text-[10px] font-bold">Pending</span>
                    </button>
                    <button 
                      onClick={() => handleStatusUpdate('Cancelled')}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${editingBill.status === 'Cancelled' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-100 text-slate-500'}`}
                    >
                      <AlertCircle size={24} />
                      <span className="text-[10px] font-bold">Cancel</span>
                    </button>
                  </div>
                </div>

                {/* Show payment status but not editable here */}
                {editingBill.status === 'Delivered' && (
                  <div className="space-y-3">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Mode</div>
                        <div className="font-bold text-slate-900">{editingBill.paymentMode}</div>
                      </div>
                      {editingBill.paymentMode === 'Pending' ? (
                        <div className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Balance Due</div>
                      ) : (
                        <div className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Paid</div>
                      )}
                    </div>

                    {editingBill.paymentMode === 'Pending' && (
                      <div className="grid grid-cols-2 gap-2 relative">
                        <button 
                          onClick={() => handlePaymentUpdate('Cash')}
                          disabled={isSettling !== null}
                          className="flex items-center justify-center gap-2 py-3 bg-green-50 text-green-600 rounded-xl font-bold border border-green-100 hover:bg-green-600 hover:text-white transition-all disabled:opacity-50"
                        >
                          <Banknote size={16} /> Cash
                        </button>
                        <button 
                          onClick={() => handlePaymentUpdate('UPI')}
                          disabled={isSettling !== null}
                          className="flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold border border-blue-100 hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50"
                        >
                          <Smartphone size={16} /> UPI
                        </button>

                        {isSettling === 'DONE' && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            className="absolute inset-0 bg-white flex items-center justify-center gap-2 z-50 rounded-xl border-2 border-green-500"
                          >
                            <CheckCircle2 size={20} className="text-green-500" />
                            <span className="font-bold text-green-600">Done!</span>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Driver Assignment */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Assign Driver</label>
                  <div className="flex flex-wrap gap-2">
                    {stats.drivers.map(d => (
                      <button 
                        key={d.id}
                        onClick={() => handleDriverUpdate(d)}
                        className={`px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${editingBill.driverName === d.name ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}
                      >
                        {d.name}
                      </button>
                    ))}
                    {stats.drivers.length === 0 && (
                      <div className="text-xs text-slate-400 italic">No drivers found. Add in settings.</div>
                    )}
                  </div>
                </div>

                {/* Tractor Assignment */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Assign Tractor</label>
                  <div className="flex flex-wrap gap-2">
                    {stats.tractors.map(t => (
                      <button 
                        key={t.id}
                        onClick={() => handleTractorUpdate(t.id!)}
                        className={`px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${editingBill.tractorId === t.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}
                      >
                        {t.name}
                      </button>
                    ))}
                    {stats.tractors.length === 0 && (
                      <div className="text-xs text-slate-400 italic">No tractors found. Add in Tractors tab.</div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => shareBillImage(editingBill, 'customer')}
                    className="bg-[#25D366] text-white flex flex-col items-center justify-center gap-1 p-4 rounded-2xl font-bold shadow-lg shadow-green-100 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    <MessageSquare size={20} />
                    <span className="text-[10px] uppercase">Customer Copy</span>
                  </button>
                  <button 
                    onClick={() => shareBillImage(editingBill, 'driver')}
                    className="bg-slate-800 text-white flex flex-col items-center justify-center gap-1 p-4 rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    <Share2 size={20} />
                    <span className="text-[10px] uppercase">Driver Copy</span>
                  </button>
                  <button 
                    onClick={() => handlePrint()}
                    className="col-span-2 material-btn bg-white border-2 border-slate-100 text-slate-900 flex items-center justify-center gap-2 py-4 shadow-sm"
                  >
                    <Printer size={20} /> Print Token
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Thermal Print Node */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
        <div ref={printRef}>
          {editingBill && <ThermalInvoice bill={editingBill} />}
        </div>
      </div>

      <ConfirmationModal 
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteToken(deleteConfirm.id)}
        title="Delete Trip Token?"
        message={`Are you sure you want to delete Token #${deleteConfirm?.number}? This will remove the record from history, but will NOT reverse manual payments or existing customer balance changes.`}
      />

      {/* Quick Voucher Modal */}
      <AnimatePresence>
        {quickVoucher && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setQuickVoucher(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            <motion.div
              layoutId="quick-voucher"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    quickVoucher.type === 'Payment' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                  }`}>
                    {quickVoucher.type === 'Payment' ? <Minus size={28} /> : <Plus size={28} />}
                  </div>
                  <div>
                    <h2 className="text-2xl font-display font-black text-slate-900 leading-tight">
                      Quick {quickVoucher.type}
                    </h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Via {quickVoucher.paymentMethod} • {new Date(quickVchForm.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setQuickVoucher(null)}
                  className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleQuickVchSubmit} className="p-8 pt-6 flex flex-col gap-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Select Account</label>
                  <select 
                    required
                    value={quickVchForm.accountId}
                    onChange={e => setQuickVchForm({ ...quickVchForm, accountId: e.target.value })}
                    className="w-full h-16 bg-slate-50 rounded-2xl px-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-bold appearance-none"
                  >
                    <option value="">-- Choose Account --</option>
                    {accounts
                      .filter(acc => {
                         if (acc.name === 'Cash' || acc.name === 'Bank Account') return false;
                         return true;
                      })
                      .sort((a,b) => a.name.localeCompare(b.name))
                      .map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.balanceType})
                        </option>
                      ))
                    }
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-black text-slate-300">₹</span>
                      <input
                        required
                        type="number"
                        placeholder="0.00"
                        value={quickVchForm.amount}
                        onChange={e => setQuickVchForm({ ...quickVchForm, amount: e.target.value })}
                        className="w-full h-16 bg-slate-50 rounded-2xl pl-10 pr-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-black text-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Date</label>
                    <input
                      type="date"
                      value={quickVchForm.date}
                      onChange={e => setQuickVchForm({ ...quickVchForm, date: e.target.value })}
                      className="w-full h-16 bg-slate-50 rounded-2xl px-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Narration / Remarks</label>
                  <input
                    placeholder="Enter short description..."
                    value={quickVchForm.description}
                    onChange={e => setQuickVchForm({ ...quickVchForm, description: e.target.value })}
                    className="w-full h-16 bg-slate-50 rounded-2xl px-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingQuickVch}
                  className={`w-full h-16 rounded-[1.25rem] font-display font-black text-lg tracking-wide shadow-lg transition-all flex items-center justify-center gap-3 ${
                    quickVoucher.type === 'Payment' 
                      ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-200' 
                      : 'bg-green-600 text-white hover:bg-green-700 shadow-green-200'
                  } disabled:opacity-50`}
                >
                  {isSavingQuickVch ? (
                    <>
                      <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={24} />
                      Save Quick {quickVoucher.type}
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
