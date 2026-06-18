import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, runTransaction, orderBy, deleteDoc, getDocs, where, limit, Timestamp, updateDoc } from 'firebase/firestore';
import { Tractor, DieselLog, MaintenanceLog, Bill, Account } from '../types';
import { 
  Plus, 
  Truck, 
  TrendingDown, 
  Settings,
  Calendar,
  IndianRupee,
  Fuel,
  Activity,
  Wrench,
  AlertCircle,
  Download,
  FileText,
  Trash2,
  Edit2,
  CheckCircle2,
  Smartphone,
  Banknote,
  History,
  X,
  BellRing
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../constants';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, format, subDays } from 'date-fns';
import { ConfirmationModal } from './ConfirmationModal';

import { Logo } from './Logo';

export function TractorDiesel({ franchiseId, isSuperAdmin }: { franchiseId?: string, isSuperAdmin?: boolean }) {
  const [activeView, setActiveView] = useState<'diesel' | 'maintenance'>('diesel');
  const [isAddingDiesel, setIsAddingDiesel] = useState(false);
  const [isAddingMaintenance, setIsAddingMaintenance] = useState(false);
  const [showTractorModal, setShowTractorModal] = useState(false);
  const [editingTractor, setEditingTractor] = useState<any | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'tractor' | 'diesel' | 'maint', id: string, name?: string } | null>(null);
  
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [dieselLogs, setDieselLogs] = useState<DieselLog[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quickPayment, setQuickPayment] = useState<{
    tractor: Tractor;
    type: 'Diesel' | 'Maintenance';
    amount: string;
    liters: string;
    paymentMode: 'Cash' | 'Bank' | 'Udhaar';
    selectedAccountId: string;
    accountName: string;
    description: string;
  } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const pressTimer = React.useRef<NodeJS.Timeout | null>(null);

  const [dieselRequests, setDieselRequests] = useState<any[]>([]);

  useEffect(() => {
    const fid = franchiseId || (isSuperAdmin ? null : 'PLACEHOLDER_NONE');
    
    let qTractors = query(collection(db, 'tractors'));
    let qDiesel = query(collection(db, 'dieselLogs'), orderBy('date', 'desc'));
    let qMaint = query(collection(db, 'maintenanceLogs'), orderBy('date', 'desc'));
    let qAccounts = query(collection(db, 'accounts'));
    let qRequests = query(collection(db, 'dieselRequests'));

    if (fid) {
      qTractors = query(collection(db, 'tractors'), where('franchiseId', '==', fid));
      qDiesel = query(collection(db, 'dieselLogs'), where('franchiseId', '==', fid), orderBy('date', 'desc'));
      qMaint = query(collection(db, 'maintenanceLogs'), where('franchiseId', '==', fid), orderBy('date', 'desc'));
      qAccounts = query(collection(db, 'accounts'), where('franchiseId', '==', fid));
      qRequests = query(collection(db, 'dieselRequests'), where('franchiseId', '==', fid));
    }

    const unsubTractors = onSnapshot(qTractors, 
      (snapshot) => setTractors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tractor))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'tractors')
    );
    const unsubDiesel = onSnapshot(qDiesel, 
      (snapshot) => setDieselLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DieselLog))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'dieselLogs')
    );
    const unsubMaint = onSnapshot(qMaint, 
      (snapshot) => setMaintenanceLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceLog))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'maintenanceLogs')
    );
    const ninetyDaysAgo = subDays(new Date(), 90);
    let qBills = query(collection(db, 'bills'), where('createdAt', '>=', ninetyDaysAgo), orderBy('createdAt', 'desc'));
    if (fid) {
      qBills = query(collection(db, 'bills'), where('franchiseId', '==', fid), where('createdAt', '>=', ninetyDaysAgo), orderBy('createdAt', 'desc'));
    }
    const unsubBills = onSnapshot(qBills, 
      (snapshot) => setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'bills')
    );
    const unsubAcc = onSnapshot(qAccounts,
      (snapshot) => {
        const raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account));
        const deduplicated: Account[] = [];
        const seenNames = new Set<string>();
        let bankCount = 0;
        raw.forEach(acc => {
          const normName = acc.name.trim().toLowerCase();
          const isBank = normName.includes('bank') || normName.includes('bob');
          if (isBank) {
            if (!seenNames.has(normName) && bankCount < 3) {
              deduplicated.push(acc);
              seenNames.add(normName);
              bankCount++;
            }
          } else {
            if (!seenNames.has(normName)) {
              deduplicated.push(acc);
              seenNames.add(normName);
            }
          }
        });
        setAccounts(deduplicated);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'accounts')
    );
    const unsubRequests = onSnapshot(qRequests,
      (snapshot) => {
        const pending = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((req: any) => req.status === 'Pending');
        setDieselRequests(pending);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'dieselRequests')
    );

    return () => {
      unsubTractors();
      unsubDiesel();
      unsubMaint();
      unsubBills();
      unsubAcc();
      unsubRequests();
    };
  }, [franchiseId, isSuperAdmin]);

  const [reportConfig, setReportConfig] = useState({
    period: 'monthly' as 'daily' | 'weekly' | 'monthly',
    includeMaintenance: true,
    tractorId: 'all' as string | 'all'
  });

  const [newDiesel, setNewDiesel] = useState({
    date: new Date().toISOString().split('T')[0],
    tractorId: '',
    liters: 0,
    amount: 0,
    description: '',
    paymentMode: 'Cash' as 'Cash' | 'Bank' | 'Udhaar',
    pendingRequestId: ''
  });

  const [newMaintenance, setNewMaintenance] = useState({
    date: new Date().toISOString().split('T')[0],
    tractorId: '',
    amount: 0,
    description: '',
    paymentMode: 'Cash' as 'Cash' | 'Bank' | 'Udhaar'
  });

  const [newTractor, setNewTractor] = useState({
    name: '',
    vehicleNumber: '',
    insuranceExpiry: ''
  });

  const tractorStats = React.useMemo(() => {
    if (!tractors || !bills || !dieselLogs || !maintenanceLogs) return {};
    
    return tractors.reduce((acc, tractor) => {
      const trips = bills.filter(b => b.tractorId === tractor.id).length;
      const fuelTotal = dieselLogs.filter(l => l.tractorId === tractor.id).reduce((sum, l) => sum + l.amount, 0);
      const maintTotal = maintenanceLogs.filter(l => l.tractorId === tractor.id).reduce((sum, l) => sum + l.amount, 0);
      const fuelLiters = dieselLogs.filter(l => l.tractorId === tractor.id).reduce((sum, l) => sum + l.liters, 0);
      
      acc[tractor.id!] = { trips, fuelTotal, fuelLiters, maintTotal };
      return acc;
    }, {} as Record<string, { trips: number, fuelTotal: number, fuelLiters: number, maintTotal: number }>);
  }, [tractors, bills, dieselLogs, maintenanceLogs]);

  const handleAddDiesel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiesel.tractorId || !newDiesel.amount) return;

    const tractor = tractors?.find(t => t.id === newDiesel.tractorId);
    if (!tractor) return;

    const mode = newDiesel.paymentMode;
    const accountName = mode === 'Cash' ? 'Cash' : mode === 'Bank' ? 'Bank Account' : 'Shrinath Petrol Pump';
    
    let qFuel = query(collection(db, 'accounts'), where('name', '==', 'Fuel Expense'));
    let qPay = query(collection(db, 'accounts'), where('name', '==', accountName));
    let qAssets = query(collection(db, 'accountGroups'), where('name', '==', 'Current Assets'));
    let qExp = query(collection(db, 'accountGroups'), where('name', '==', 'Direct Expenses'));
    let qLiab = query(collection(db, 'accountGroups'), where('name', '==', 'Current Liabilities'));

    if (!isSuperAdmin && franchiseId) {
      qFuel = query(qFuel, where('franchiseId', '==', franchiseId));
      qPay = query(qPay, where('franchiseId', '==', franchiseId));
      qAssets = query(qAssets, where('franchiseId', '==', franchiseId));
      qExp = query(qExp, where('franchiseId', '==', franchiseId));
      qLiab = query(qLiab, where('franchiseId', '==', franchiseId));
    }

    try {
      const [fuelAccSnap, paymentAccSnap, assetsGrpSnap, expGrpSnap, liabGrpSnap] = await Promise.all([
        getDocs(qFuel),
        getDocs(qPay),
        getDocs(qAssets),
        getDocs(qExp),
        getDocs(qLiab)
      ]);
      
      let fuelAccId = fuelAccSnap.docs[0]?.id;
      let paymentAccId = paymentAccSnap.docs[0]?.id;
      let assetsGrpId = assetsGrpSnap.docs[0]?.id;
      let expGrpId = expGrpSnap.docs[0]?.id;
      let liabGrpId = liabGrpSnap.docs[0]?.id;

      await runTransaction(db, async (transaction) => {
        const fuelAccRef = fuelAccId ? doc(db, 'accounts', fuelAccId) : null;
        const paymentAccRef = paymentAccId ? doc(db, 'accounts', paymentAccId) : null;

        // --- 1. READS FIRST ---
        const [fuelAccDoc, paymentAccDoc] = await Promise.all([
          fuelAccRef ? transaction.get(fuelAccRef) : Promise.resolve(null),
          paymentAccRef ? transaction.get(paymentAccRef) : Promise.resolve(null)
        ]);

        // --- VALIDATION: Prevent Negative Cash/Bank ---
        if (mode !== 'Udhaar') {
          const currentBal = paymentAccDoc?.exists() ? (paymentAccDoc.data().currentBalance || 0) : 0;
          if (currentBal < Number(newDiesel.amount)) {
            throw new Error(`INSUFFICIENT_FUNDS:${accountName}:${currentBal}`);
          }
        }

        // --- 2. WRITES SECOND ---
        // Ensure Groups & Accounts
        if (!expGrpId) {
          const newGrp = doc(collection(db, 'accountGroups'));
          transaction.set(newGrp, { name: 'Direct Expenses', type: 'Expense', franchiseId: franchiseId || null });
          expGrpId = newGrp.id;
        }

        let finalFuelAccId = fuelAccId;
        if (!fuelAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { 
            name: 'Fuel Expense', 
            franchiseId: franchiseId || null,
            groupId: expGrpId, 
            openingBalance: 0, 
            balanceType: 'Dr', 
            currentBalance: Number(newDiesel.amount), 
            createdAt: serverTimestamp() 
          });
          finalFuelAccId = newAcc.id;
        } else if (fuelAccDoc?.exists()) {
          transaction.update(fuelAccRef!, {
            currentBalance: (fuelAccDoc.data().currentBalance || 0) + Number(newDiesel.amount)
          });
        }

        let finalPaymentAccId = paymentAccId;
        if (mode === 'Udhaar') {
          if (!liabGrpId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { name: 'Current Liabilities', type: 'Liability', franchiseId: franchiseId || null });
            liabGrpId = newGrp.id;
          }
          if (!paymentAccId) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, {
              name: 'Shrinath Petrol Pump',
              franchiseId: franchiseId || null,
              groupId: liabGrpId,
              openingBalance: 0,
              balanceType: 'Cr',
              currentBalance: Number(newDiesel.amount),
              createdAt: serverTimestamp()
            });
            finalPaymentAccId = newAcc.id;
          } else if (paymentAccDoc?.exists()) {
            transaction.update(paymentAccRef!, {
              currentBalance: (paymentAccDoc.data().currentBalance || 0) + Number(newDiesel.amount)
            });
          }
        } else {
          if (!assetsGrpId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { name: 'Current Assets', type: 'Asset', franchiseId: franchiseId || null });
            assetsGrpId = newGrp.id;
          }
          if (!paymentAccId) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, {
              name: accountName,
              franchiseId: franchiseId || null,
              groupId: assetsGrpId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: -Number(newDiesel.amount),
              createdAt: serverTimestamp()
            });
            finalPaymentAccId = newAcc.id;
          } else if (paymentAccDoc?.exists()) {
            transaction.update(paymentAccRef!, {
              currentBalance: (paymentAccDoc.data().currentBalance || 0) - Number(newDiesel.amount)
            });
          }
        }

        // --- 3. LOG & VOUCHER ---
        const dieselRef = doc(collection(db, 'dieselLogs'));
        transaction.set(dieselRef, {
          tractorId: tractor.id!,
          franchiseId: franchiseId || null,
          tractorName: tractor.name,
          date: newDiesel.date,
          liters: Number(newDiesel.liters),
          amount: Number(newDiesel.amount),
          description: newDiesel.description,
          paymentMode: mode,
          paymentAccountId: finalPaymentAccId,
          createdAt: serverTimestamp()
        });

        const voucherRef = doc(collection(db, 'vouchers'));
        transaction.set(voucherRef, {
          date: new Date(newDiesel.date),
          franchiseId: franchiseId || null,
          type: mode === 'Udhaar' ? 'Journal' : 'Payment',
          voucherNumber: `FL-${Math.floor(Date.now()/1000)}`,
          items: [
            { accountId: finalFuelAccId, accountName: 'Fuel Expense', amount: Number(newDiesel.amount), type: 'Dr' },
            { accountId: finalPaymentAccId, accountName: accountName, amount: Number(newDiesel.amount), type: 'Cr' }
          ],
          narration: `Diesel for ${tractor.name} (${newDiesel.liters}L): ${newDiesel.description} [${mode}]`,
          totalAmount: Number(newDiesel.amount),
          createdAt: serverTimestamp()
        });

        if (newDiesel.pendingRequestId) {
          const reqRef = doc(db, 'dieselRequests', newDiesel.pendingRequestId);
          transaction.update(reqRef, {
            status: 'Approved',
            updatedAt: serverTimestamp()
          });
        }
      });

      setIsAddingDiesel(false);
      setNewDiesel({ date: new Date().toISOString().split('T')[0], tractorId: '', liters: 0, amount: 0, description: '', paymentMode: 'Cash', pendingRequestId: '' });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('INSUFFICIENT_FUNDS:')) {
        const [_, acc, bal] = error.message.split(':');
        alert(`Failed: Insufficient balance in ${acc}. \nAvailable: ₹${Number(bal).toLocaleString()}`);
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'transaction');
      }
    }
  };

  const handleAddMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaintenance.tractorId || !newMaintenance.amount) return;

    const tractor = tractors?.find(t => t.id === newMaintenance.tractorId);
    if (!tractor) return;

    const mode = newMaintenance.paymentMode;
    const accountName = mode === 'Cash' ? 'Cash' : mode === 'Bank' ? 'Bank Account' : 'Shrinath Petrol Pump';
    
    let qMaint = query(collection(db, 'accounts'), where('name', '==', 'Maintenance'));
    let qPay = query(collection(db, 'accounts'), where('name', '==', accountName));
    let qAssets = query(collection(db, 'accountGroups'), where('name', '==', 'Current Assets'));
    let qExp = query(collection(db, 'accountGroups'), where('name', '==', 'Direct Expenses'));
    let qLiab = query(collection(db, 'accountGroups'), where('name', '==', 'Current Liabilities'));

    if (!isSuperAdmin && franchiseId) {
      qMaint = query(qMaint, where('franchiseId', '==', franchiseId));
      qPay = query(qPay, where('franchiseId', '==', franchiseId));
      qAssets = query(qAssets, where('franchiseId', '==', franchiseId));
      qExp = query(qExp, where('franchiseId', '==', franchiseId));
      qLiab = query(qLiab, where('franchiseId', '==', franchiseId));
    }

    try {
      const [maintAccSnap, paymentAccSnap, assetsGrpSnap, expGrpSnap, liabGrpSnap] = await Promise.all([
        getDocs(qMaint),
        getDocs(qPay),
        getDocs(qAssets),
        getDocs(qExp),
        getDocs(qLiab)
      ]);
      
      let maintAccId = maintAccSnap.docs[0]?.id;
      let paymentAccId = paymentAccSnap.docs[0]?.id;
      let assetsGrpId = assetsGrpSnap.docs[0]?.id;
      let expGrpId = expGrpSnap.docs[0]?.id;
      let liabGrpId = liabGrpSnap.docs[0]?.id;

      await runTransaction(db, async (transaction) => {
        const maintAccRef = maintAccId ? doc(db, 'accounts', maintAccId) : null;
        const paymentAccRef = paymentAccId ? doc(db, 'accounts', paymentAccId) : null;

        // --- 1. READS FIRST ---
        const [maintAccDoc, paymentAccDoc] = await Promise.all([
          maintAccRef ? transaction.get(maintAccRef) : Promise.resolve(null),
          paymentAccRef ? transaction.get(paymentAccRef) : Promise.resolve(null)
        ]);

        // --- VALIDATION: Prevent Negative Cash/Bank ---
        if (mode !== 'Udhaar') {
          const currentBal = paymentAccDoc?.exists() ? (paymentAccDoc.data().currentBalance || 0) : 0;
          if (currentBal < Number(newMaintenance.amount)) {
            throw new Error(`INSUFFICIENT_FUNDS:${accountName}:${currentBal}`);
          }
        }

        // --- 2. WRITES SECOND ---
        // Ensure Groups & Accounts
        if (!expGrpId) {
          const newGrp = doc(collection(db, 'accountGroups'));
          transaction.set(newGrp, { name: 'Direct Expenses', type: 'Expense', franchiseId: franchiseId || null });
          expGrpId = newGrp.id;
        }

        let finalMaintAccId = maintAccId;
        if (!maintAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { 
            name: 'Maintenance', 
            franchiseId: franchiseId || null,
            groupId: expGrpId, 
            openingBalance: 0, 
            balanceType: 'Dr', 
            currentBalance: Number(newMaintenance.amount), 
            createdAt: serverTimestamp() 
          });
          finalMaintAccId = newAcc.id;
        } else if (maintAccDoc?.exists()) {
          transaction.update(maintAccRef!, {
            currentBalance: (maintAccDoc.data().currentBalance || 0) + Number(newMaintenance.amount)
          });
        }

        let finalPaymentAccId = paymentAccId;
        if (mode === 'Udhaar') {
          if (!liabGrpId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { name: 'Current Liabilities', type: 'Liability', franchiseId: franchiseId || null });
            liabGrpId = newGrp.id;
          }
          if (!paymentAccId) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, {
              name: 'Shrinath Petrol Pump',
              franchiseId: franchiseId || null,
              groupId: liabGrpId,
              openingBalance: 0,
              balanceType: 'Cr',
              currentBalance: Number(newMaintenance.amount),
              createdAt: serverTimestamp()
            });
            finalPaymentAccId = newAcc.id;
          } else if (paymentAccDoc?.exists()) {
            transaction.update(paymentAccRef!, {
              currentBalance: (paymentAccDoc.data().currentBalance || 0) + Number(newMaintenance.amount)
            });
          }
        } else {
          if (!assetsGrpId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { name: 'Current Assets', type: 'Asset', franchiseId: franchiseId || null });
            assetsGrpId = newGrp.id;
          }
          if (!paymentAccId) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, {
              name: accountName,
              franchiseId: franchiseId || null,
              groupId: assetsGrpId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: -Number(newMaintenance.amount),
              createdAt: serverTimestamp()
            });
            finalPaymentAccId = newAcc.id;
          } else if (paymentAccDoc?.exists()) {
            transaction.update(paymentAccRef!, {
              currentBalance: (paymentAccDoc.data().currentBalance || 0) - Number(newMaintenance.amount)
            });
          }
        }

        // --- 3. LOG & VOUCHER ---
        const maintRef = doc(collection(db, 'maintenanceLogs'));
        transaction.set(maintRef, {
          tractorId: tractor.id!,
          franchiseId: franchiseId || null,
          tractorName: tractor.name,
          date: newMaintenance.date,
          amount: Number(newMaintenance.amount),
          description: newMaintenance.description,
          paymentMode: mode,
          paymentAccountId: finalPaymentAccId,
          createdAt: serverTimestamp()
        });

        const voucherRef = doc(collection(db, 'vouchers'));
        transaction.set(voucherRef, {
          date: new Date(newMaintenance.date),
          franchiseId: franchiseId || null,
          type: mode === 'Udhaar' ? 'Journal' : 'Payment',
          voucherNumber: `MT-${Math.floor(Date.now()/1000)}`,
          items: [
            { accountId: finalMaintAccId, accountName: 'Maintenance', amount: Number(newMaintenance.amount), type: 'Dr' },
            { accountId: finalPaymentAccId, accountName: accountName, amount: Number(newMaintenance.amount), type: 'Cr' }
          ],
          narration: `Maintenance for ${tractor.name}: ${newMaintenance.description} [${mode}]`,
          totalAmount: Number(newMaintenance.amount),
          createdAt: serverTimestamp()
        });
      });

      setIsAddingMaintenance(false);
      setNewMaintenance({ date: new Date().toISOString().split('T')[0], tractorId: '', amount: 0, description: '', paymentMode: 'Cash' });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('INSUFFICIENT_FUNDS:')) {
        const [_, acc, bal] = error.message.split(':');
        alert(`Failed: Insufficient balance in ${acc}. \nAvailable: ₹${Number(bal).toLocaleString()}`);
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'transaction');
      }
    }
  };

  const handleQuickPaymentSubmit = async () => {
    if (!quickPayment || !quickPayment.amount) return;

    try {
      const { tractor, type, amount, liters, paymentMode, selectedAccountId, accountName, description } = quickPayment;
      const amountNum = Number(amount);
      const litersNum = Number(liters || 0);

      const mode = paymentMode;
      const finalAccountName = mode === 'Cash' ? 'Cash' : mode === 'Bank' ? 'Bank Account' : accountName;
      
      const [expAccName, expAccGroup] = type === 'Diesel' ? ['Fuel Expense', 'Direct Expenses'] : ['Maintenance', 'Direct Expenses'];

      let qExpAcc = query(collection(db, 'accounts'), where('name', '==', expAccName));
      let qPayAcc = query(collection(db, 'accounts'), where('name', '==', finalAccountName));
      let qAssetsAcc = query(collection(db, 'accountGroups'), where('name', '==', 'Current Assets'));
      let qExpGrpAcc = query(collection(db, 'accountGroups'), where('name', '==', expAccGroup));
      let qLiabGrpAcc = query(collection(db, 'accountGroups'), where('name', '==', 'Current Liabilities'));

      if (!isSuperAdmin && franchiseId) {
        qExpAcc = query(qExpAcc, where('franchiseId', '==', franchiseId));
        qPayAcc = query(qPayAcc, where('franchiseId', '==', franchiseId));
        qAssetsAcc = query(qAssetsAcc, where('franchiseId', '==', franchiseId));
        qExpGrpAcc = query(qExpGrpAcc, where('franchiseId', '==', franchiseId));
        qLiabGrpAcc = query(qLiabGrpAcc, where('franchiseId', '==', franchiseId));
      }

      const [expenseAccSnap, paymentAccSnap, assetsGrpSnap, expGrpSnap, liabGrpSnap] = await Promise.all([
        getDocs(qExpAcc),
        getDocs(qPayAcc),
        getDocs(qAssetsAcc),
        getDocs(qExpGrpAcc),
        getDocs(qLiabGrpAcc)
      ]);
      
      let expenseAccId = expenseAccSnap.docs[0]?.id;
      let paymentAccId = paymentAccSnap.docs[0]?.id;
      let assetsGrpId = assetsGrpSnap.docs[0]?.id;
      let expGrpId = expGrpSnap.docs[0]?.id;
      let liabGrpId = liabGrpSnap.docs[0]?.id;

      await runTransaction(db, async (transaction) => {
        const expAccRef = expenseAccId ? doc(db, 'accounts', expenseAccId) : null;
        const paymentAccRef = paymentAccId ? doc(db, 'accounts', paymentAccId) : null;

        const [expAccDoc, paymentAccDoc] = await Promise.all([
          expAccRef ? transaction.get(expAccRef) : Promise.resolve(null),
          paymentAccRef ? transaction.get(paymentAccRef) : Promise.resolve(null)
        ]);

        if (mode !== 'Udhaar') {
          const currentBal = paymentAccDoc?.exists() ? (paymentAccDoc.data().currentBalance || 0) : 0;
          if (currentBal < amountNum) {
            throw new Error(`INSUFFICIENT_FUNDS:${finalAccountName}:${currentBal}`);
          }
        }

        if (!expGrpId) {
          const newGrp = doc(collection(db, 'accountGroups'));
          transaction.set(newGrp, { name: expAccGroup, type: 'Expense', franchiseId: franchiseId || null });
          expGrpId = newGrp.id;
        }

        let finalExpAccId = expenseAccId;
        if (!expenseAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { 
            name: expAccName, 
            franchiseId: franchiseId || null,
            groupId: expGrpId, 
            openingBalance: 0, 
            balanceType: 'Dr', 
            currentBalance: amountNum, 
            createdAt: serverTimestamp() 
          });
          finalExpAccId = newAcc.id;
        } else if (expAccDoc?.exists()) {
          transaction.update(expAccRef!, {
            currentBalance: (expAccDoc.data().currentBalance || 0) + amountNum
          });
        }

        let finalPaymentAccId = paymentAccId;
        if (mode === 'Udhaar') {
          // If udhaar, we use the selected account (already fetched above or provided by user)
          if (!liabGrpId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { name: 'Current Liabilities', type: 'Liability', franchiseId: franchiseId || null });
            liabGrpId = newGrp.id;
          }
          if (!paymentAccId) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, {
              name: finalAccountName,
              franchiseId: franchiseId || null,
              groupId: liabGrpId,
              openingBalance: 0,
              balanceType: 'Cr',
              currentBalance: amountNum,
              createdAt: serverTimestamp()
            });
            finalPaymentAccId = newAcc.id;
          } else if (paymentAccDoc?.exists()) {
            transaction.update(paymentAccRef!, {
              currentBalance: (paymentAccDoc.data().currentBalance || 0) + amountNum
            });
          }
        } else {
          if (!assetsGrpId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { name: 'Current Assets', type: 'Asset', franchiseId: franchiseId || null });
            assetsGrpId = newGrp.id;
          }
          if (!paymentAccId) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, {
              name: finalAccountName,
              franchiseId: franchiseId || null,
              groupId: assetsGrpId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: -amountNum,
              createdAt: serverTimestamp()
            });
            finalPaymentAccId = newAcc.id;
          } else if (paymentAccDoc?.exists()) {
            transaction.update(paymentAccRef!, {
              currentBalance: (paymentAccDoc.data().currentBalance || 0) - amountNum
            });
          }
        }

        // LOG
        const logRef = doc(collection(db, type === 'Diesel' ? 'dieselLogs' : 'maintenanceLogs'));
        transaction.set(logRef, {
          tractorId: tractor.id!,
          franchiseId: franchiseId || null,
          tractorName: tractor.name,
          date: new Date().toISOString().split('T')[0],
          ...(type === 'Diesel' ? { liters: litersNum } : {}),
          amount: amountNum,
          description: description || `Quick ${type}`,
          paymentMode: mode,
          paymentAccountId: finalPaymentAccId,
          createdAt: serverTimestamp()
        });

        // VOUCHER
        const voucherRef = doc(collection(db, 'vouchers'));
        transaction.set(voucherRef, {
          date: new Date(),
          franchiseId: franchiseId || null,
          type: mode === 'Udhaar' ? 'Journal' : 'Payment',
          voucherNumber: `${type === 'Diesel' ? 'FL' : 'MT'}-${Math.floor(Date.now()/1000)}`,
          items: [
            { accountId: finalExpAccId, accountName: expAccName, amount: amountNum, type: 'Dr' },
            { accountId: finalPaymentAccId, accountName: finalAccountName, amount: amountNum, type: 'Cr' }
          ],
          narration: `Quick ${type} for ${tractor.name}: ${description} [${mode}]`,
          totalAmount: amountNum,
          createdAt: serverTimestamp()
        });
      });

      setQuickPayment(null);
      setShowDone(true);
      setTimeout(() => setShowDone(false), 3000);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('INSUFFICIENT_FUNDS:')) {
        const [_, acc, bal] = error.message.split(':');
        alert(`Failed: Insufficient balance in ${acc}. \nAvailable: ₹${Number(bal).toLocaleString()}`);
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'quick-payment');
      }
    }
  };

  const handlePressStart = (tractor: Tractor) => {
    pressTimer.current = setTimeout(() => {
      setQuickPayment({
        tractor,
        type: 'Diesel',
        amount: '',
        liters: '',
        paymentMode: 'Cash',
        selectedAccountId: '',
        accountName: '',
        description: 'Quick log'
      });
    }, 500);
  };

  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const generateReport = async () => {
    if (!tractors) return;

    let doc: any;
    try {
      doc = new jsPDF();
    } catch (e: any) {
      console.error('jsPDF failed:', e instanceof Error ? e.message : String(e));
      alert('PDF generation is not supported in this browser.');
      return;
    }
    const now = new Date();
    let start: Date;
    let end: Date;

    const periodLabel = reportConfig.period.charAt(0).toUpperCase() + reportConfig.period.slice(1);

    switch (reportConfig.period) {
      case 'daily':
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case 'weekly':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'monthly':
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
    }

    // Filter Data
    const filteredTractors = reportConfig.tractorId === 'all' 
      ? tractors 
      : tractors.filter(t => t.id === reportConfig.tractorId);

    doc.setFontSize(22);
    doc.text('TankerWala Powered by Rajhans - Tractor Report', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${periodLabel} (${start.toLocaleDateString()} - ${end.toLocaleDateString()})`, 14, 28);
    doc.text(`Generated on: ${now.toLocaleString()}`, 14, 33);

    let yPos = 45;

    for (const tractor of filteredTractors) {
      if (yPos > 240) { doc.addPage(); yPos = 20; }

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text(`${tractor.name} (${tractor.vehicleNumber})`, 14, yPos);
      yPos += 7;

      const tractorDiesel = dieselLogs?.filter(l => 
        l.tractorId === tractor.id && 
        isWithinInterval(new Date(l.date), { start, end })
      ) || [];

      const tractorMaintenance = maintenanceLogs?.filter(l => 
        l.tractorId === tractor.id && 
        isWithinInterval(new Date(l.date), { start, end })
      ) || [];

      const tractorTrips = bills?.filter(b => 
        b.tractorId === tractor.id && 
        isWithinInterval(new Date(b.date), { start, end })
      ) || [];

      const totalDiesel = tractorDiesel.reduce((sum, l) => sum + l.amount, 0);
      const totalLiters = tractorDiesel.reduce((sum, l) => sum + l.liters, 0);
      const totalMaint = tractorMaintenance.reduce((sum, l) => sum + l.amount, 0);

      // Summary Table for this tractor
      autoTable(doc, {
        startY: yPos,
        head: [['Fuel (L)', 'Fuel Cost', 'Trips', 'Maintenance']],
        body: [[
          totalLiters.toFixed(1),
          `Rs. ${totalDiesel.toLocaleString()}`,
          tractorTrips.length,
          reportConfig.includeMaintenance ? `Rs. ${totalMaint.toLocaleString()}` : 'N/A'
        ]],
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85] }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      // Activity Details
      if (tractorDiesel.length > 0) {
        doc.setFontSize(10);
        doc.text(`Diesel Logs for ${tractor.name}:`, 14, yPos);
        yPos += 5;
        autoTable(doc, {
          startY: yPos,
          head: [['Date', 'Liters', 'Amount', 'Note']],
          body: tractorDiesel.map(l => [
            new Date(l.date).toLocaleDateString(),
            l.liters.toFixed(1),
            `Rs. ${l.amount.toLocaleString()}`,
            l.description || '-'
          ]),
          theme: 'grid',
          headStyles: { fillColor: [71, 85, 105] },
          styles: { fontSize: 8, overflow: 'linebreak' },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 20, halign: 'right' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 'auto' }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      if (reportConfig.includeMaintenance && tractorMaintenance.length > 0) {
        if (yPos > 240) { doc.addPage(); yPos = 20; }
        doc.setFontSize(10);
        doc.text(`Maintenance Logs for ${tractor.name}:`, 14, yPos);
        yPos += 5;
        autoTable(doc, {
          startY: yPos,
          head: [['Date', 'Amount', 'Description']],
          body: tractorMaintenance.map(l => [
            new Date(l.date).toLocaleDateString(),
            `Rs. ${l.amount.toLocaleString()}`,
            l.description
          ]),
          styles: { fontSize: 8, overflow: 'linebreak' },
          headStyles: { fillColor: [234, 88, 12] },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 30, halign: 'right' },
            2: { cellWidth: 'auto' }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      } else {
        yPos += 5;
      }
    }

    doc.save(`Tractor_Report_${periodLabel}_${now.getTime()}.pdf`);
    setShowReportModal(false);
  };

  const handleAddTractor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTractor.name || !newTractor.vehicleNumber || !newTractor.insuranceExpiry) return;

    try {
      await addDoc(collection(db, 'tractors'), {
        ...newTractor,
        franchiseId: franchiseId || null,
        createdAt: serverTimestamp()
      });
      setShowTractorModal(false);
      setNewTractor({ name: '', vehicleNumber: '', insuranceExpiry: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tractors');
    }
  };

  const handleDeleteTractor = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tractors', id));
      alert("✅ Tractor deleted successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tractors/${id}`);
    }
  };

  const handleDeleteLog = async (type: 'diesel' | 'maint', id: string) => {
    try {
      await deleteDoc(doc(db, type === 'diesel' ? 'dieselLogs' : 'maintenanceLogs', id));
      alert(`✅ ${type === 'diesel' ? 'Diesel Log' : 'Maintenance Log'} deleted successfully!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${type === 'diesel' ? 'dieselLogs' : 'maintenanceLogs'}/${id}`);
    }
  };

  const handleEditTractorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTractor || !editingTractor.name || !editingTractor.vehicleNumber) return;

    try {
      const tractorRef = doc(db, 'tractors', editingTractor.id);
      await updateDoc(tractorRef, {
        name: editingTractor.name.trim(),
        vehicleNumber: editingTractor.vehicleNumber.trim().toUpperCase(),
        insuranceExpiry: editingTractor.insuranceExpiry
      });

      // Synchronize associated account name in Ledger
      const qAcc = query(collection(db, 'accounts'), where('tractorId', '==', editingTractor.id));
      const accSnap = await getDocs(qAcc);
      if (!accSnap.empty) {
        const accDoc = accSnap.docs[0];
        await updateDoc(accDoc.ref, {
          name: editingTractor.name.trim()
        });
      }

      setEditingTractor(null);
      alert("✅ Tractor details and associated ledger account updated successfully!");
    } catch (error: any) {
      console.error(error);
      alert("Error updating tractor details: " + (error?.message || error));
    }
  };

  return (
    <div className="p-4 pb-24 max-w-4xl mx-auto">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex justify-between items-center text-slate-900">
          <div>
            <h1 className="text-3xl font-display font-black tracking-tight">Maintenance & Diesel</h1>
            <p className="text-slate-500 font-medium font-sans">Manage fleet and tractor expenses</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowReportModal(true)}
              className="w-14 h-14 bg-white border-2 border-slate-100 text-slate-900 rounded-[1.25rem] flex items-center justify-center shadow-sm active:scale-95 transition-all"
              title="Reports"
            >
              <FileText size={28} />
            </button>
            <button 
              onClick={() => setShowTractorModal(true)}
              className="w-14 h-14 bg-white border-2 border-slate-100 text-slate-900 rounded-[1.25rem] flex items-center justify-center shadow-sm active:scale-95 transition-all"
            >
              <Settings size={28} />
            </button>
            <div className="relative group">
               <button 
                className="w-14 h-14 bg-slate-900 text-white rounded-[1.25rem] flex items-center justify-center shadow-xl shadow-slate-200 active:scale-95 transition-all"
              >
                <Plus size={28} />
              </button>
              <div className="absolute top-0 right-0 pt-16 flex flex-col gap-2 opacity-0 group-hover:opacity-100 group-active:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-20">
                <button 
                  onClick={() => setIsAddingDiesel(true)}
                  className="whitespace-nowrap px-4 py-3 bg-white border border-slate-100 shadow-xl rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50"
                >
                  <Fuel size={14} className="text-orange-500" /> Log Diesel
                </button>
                <button 
                  onClick={() => setIsAddingMaintenance(true)}
                  className="whitespace-nowrap px-4 py-3 bg-white border border-slate-100 shadow-xl rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50"
                >
                  <Wrench size={14} className="text-blue-500" /> Log Maintenance
                </button>
              </div>
            </div>
          </div>
        </div>

        {dieselRequests.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
              <BellRing size={14} className="text-orange-500 animate-pulse" /> Pending Driver Fuel Entries
            </h3>
            <div className="space-y-4">
              {dieselRequests.map((req: any) => (
                <div key={req.id} className="bg-white border-2 border-orange-100 p-5 rounded-[2.5rem] shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-[0.03] scale-150 rotate-12">
                    <Fuel size={48} />
                  </div>

                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Photos Section */}
                    <div className="flex gap-2 shrink-0">
                      <div className="relative group/img">
                        <img 
                          src={req.zeroMeterPhoto} 
                          alt="Zero Meter" 
                          className="w-24 h-24 object-cover rounded-2xl border-2 border-slate-100 hover:border-orange-300 transition-all cursor-zoom-in"
                          onClick={() => window.open(req.zeroMeterPhoto)}
                        />
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/60 text-[8px] text-white px-2 py-0.5 rounded-full font-bold uppercase">Zero Meter</span>
                      </div>
                      <div className="relative group/img">
                        <img 
                          src={req.receiptPhoto} 
                          alt="Receipt" 
                          className="w-24 h-24 object-cover rounded-2xl border-2 border-slate-100 hover:border-orange-300 transition-all cursor-zoom-in"
                          onClick={() => window.open(req.receiptPhoto)}
                        />
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/60 text-[8px] text-white px-2 py-0.5 rounded-full font-bold uppercase">Receipt</span>
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="text-lg font-black text-slate-900">{req.driverName}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider">{req.tractorName}</span>
                            <span className="text-[10px] font-bold text-slate-400 capitalize">{req.date}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-black text-slate-900">{formatCurrency(req.amount)}</div>
                          <div className="text-xs font-bold text-slate-400">{req.liters} Liters</div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setNewDiesel({ 
                              date: req.date, 
                              tractorId: req.tractorId, 
                              liters: req.liters, 
                              amount: req.amount, 
                              description: `Approved request from ${req.driverName}`, 
                              paymentMode: 'Udhaar', 
                              pendingRequestId: req.id 
                            });
                            setIsAddingDiesel(true);
                          }}
                          className="flex-1 h-12 bg-orange-500 text-white font-black text-xs rounded-xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 active:scale-95"
                        >
                          Approve entry
                        </button>
                        <button 
                          onClick={async () => {
                            if(window.confirm('Reject and delete this entry?')) {
                              await deleteDoc(doc(db, 'dieselRequests', req.id));
                            }
                          }}
                          className="px-4 h-12 bg-slate-50 text-slate-400 font-bold text-xs rounded-xl hover:bg-slate-100 transition-all active:scale-95"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fleet Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tractors?.map(tractor => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={tractor.id} 
              onMouseDown={() => handlePressStart(tractor)}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onTouchStart={() => handlePressStart(tractor)}
              onTouchEnd={handlePressEnd}
              className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden relative cursor-pointer active:scale-95 transition-all select-none"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] scale-[2.5] pointer-events-none">
                <Truck size={48} />
              </div>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <Truck size={28} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">{tractor.name}</h4>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md inline-block uppercase tracking-wider">
                      {tractor.vehicleNumber}
                    </p>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTractor(tractor);
                      }}
                      className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                      title="Edit Tractor"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tractor.id) setDeleteConfirm({ type: 'tractor', id: tractor.id, name: tractor.name });
                      }}
                      className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-4 pt-4 border-t border-slate-50">
                <div className="bg-slate-50/50 p-3 rounded-2xl">
                  <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    <Fuel size={10} /> Fuel Cost
                  </div>
                  <div className="text-lg font-black text-slate-800">₹{(tractorStats[tractor.id!]?.fuelTotal || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400 font-bold">{tractorStats[tractor.id!]?.fuelLiters?.toFixed(1) || 0}L consumed</div>
                </div>

                <div className="bg-slate-50/50 p-3 rounded-2xl">
                  <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    <Wrench size={10} /> Maint. Cost
                  </div>
                  <div className="text-lg font-black text-orange-600">₹{(tractorStats[tractor.id!]?.maintTotal || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400 font-bold">{tractorStats[tractor.id!]?.trips || 0} Total Trips</div>
                </div>
              </div>
            </motion.div>
          ))}
          {tractors?.length === 0 && (
            <div className="sm:col-span-2 text-center py-16 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
               <Truck className="mx-auto text-slate-300 mb-4" size={48} />
               <p className="text-slate-400 font-bold">No tractors added yet</p>
               <button onClick={() => setShowTractorModal(true)} className="text-blue-500 font-bold text-sm mt-2">Add your first tractor</button>
            </div>
          )}
        </div>
      </div>

      {/* Activity Selector */}
      <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
        <button 
          onClick={() => setActiveView('diesel')}
          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeView === 'diesel' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
        >
          <Fuel size={14} /> Diesel Logs
        </button>
        <button 
          onClick={() => setActiveView('maintenance')}
          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeView === 'maintenance' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
        >
          <Wrench size={14} /> Maintenance
        </button>
      </div>

      {/* Activity List */}
      <div className="space-y-3">
        {activeView === 'diesel' ? (
          dieselLogs?.slice(0, 20).map(log => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              key={log.id} 
              className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between group hover:shadow-lg hover:border-slate-200 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Fuel size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{log.tractorName}</h4>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                    <span>{log.liters}L</span>
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] uppercase tracking-wider ${
                      log.paymentMode === 'Udhaar' ? 'bg-orange-50 text-orange-600' : 
                      log.paymentMode === 'Bank' ? 'bg-blue-50 text-blue-600' : 
                      'bg-green-50 text-green-600'
                    }`}>
                      {log.paymentMode || 'Cash'}
                    </span>
                    <span>•</span>
                    <span>{new Date(log.date).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex items-center gap-3">
                <div className="text-lg font-black text-red-600">{formatCurrency(log.amount)}</div>
                <button 
                  onClick={() => log.id && setDeleteConfirm({ type: 'diesel', id: log.id })}
                  className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          maintenanceLogs?.slice(0, 20).map(log => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              key={log.id} 
              className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between group hover:shadow-lg hover:border-slate-200 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Wrench size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{log.tractorName}</h4>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                    <span className="truncate max-w-[150px]">{log.description}</span>
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] uppercase tracking-wider ${
                      log.paymentMode === 'Udhaar' ? 'bg-orange-50 text-orange-600' : 
                      log.paymentMode === 'Bank' ? 'bg-blue-50 text-blue-600' : 
                      'bg-green-50 text-green-600'
                    }`}>
                      {log.paymentMode || 'Cash'}
                    </span>
                    <span>•</span>
                    <span>{new Date(log.date).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex items-center gap-3">
                <div className="text-lg font-black text-orange-600">{formatCurrency(log.amount)}</div>
                <button 
                  onClick={() => log.id && setDeleteConfirm({ type: 'maint', id: log.id })}
                  className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))
        )}
        
        {((activeView === 'diesel' && dieselLogs?.length === 0) || (activeView === 'maintenance' && maintenanceLogs?.length === 0)) && (
          <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
            <p className="text-slate-400 font-bold italic">No logs found in this category</p>
          </div>
        )}
      </div>

      {/* Log Diesel Modal */}
      <AnimatePresence>
        {isAddingDiesel && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: "100%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%", scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-display font-bold text-slate-900">Log Diesel</h2>
                  <p className="text-sm text-slate-500">Record a new fuel purchase</p>
                </div>
                <button onClick={() => setIsAddingDiesel(false)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <form onSubmit={handleAddDiesel} className="flex flex-col gap-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Select Tractor</label>
                  <select
                    required
                    className="material-input h-14 bg-slate-50 appearance-none"
                    value={newDiesel.tractorId}
                    onChange={e => setNewDiesel({...newDiesel, tractorId: e.target.value})}
                  >
                    <option value="">Select Tractor</option>
                    {tractors?.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.vehicleNumber})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Date</label>
                    <input
                      type="date"
                      className="material-input h-14 bg-slate-50"
                      value={newDiesel.date}
                      onChange={e => setNewDiesel({...newDiesel, date: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Liters</label>
                    <input
                      required
                      type="number" step="0.01"
                      className="material-input h-14 bg-slate-50"
                      value={newDiesel.liters || ''}
                      onChange={e => setNewDiesel({...newDiesel, liters: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Total Amount (₹)</label>
                  <input
                    required
                    type="number"
                    className="material-input h-16 text-2xl font-black bg-slate-50"
                    placeholder="0"
                    value={newDiesel.amount || ''}
                    onChange={e => setNewDiesel({...newDiesel, amount: parseFloat(e.target.value)})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Payment Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'Cash', label: 'Cash', icon: Banknote, color: 'text-green-600', bg: 'bg-green-50' },
                      { id: 'Bank', label: 'Bank', icon: Smartphone, color: 'text-blue-600', bg: 'bg-blue-50' },
                      { id: 'Udhaar', label: 'Udhaar', icon: History, color: 'text-orange-600', bg: 'bg-orange-50' }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setNewDiesel({ ...newDiesel, paymentMode: m.id as any })}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                          newDiesel.paymentMode === m.id 
                            ? `border-slate-900 ${m.bg}` 
                            : 'border-slate-50 text-slate-400 opacity-60'
                        }`}
                      >
                        <m.icon size={20} className={newDiesel.paymentMode === m.id ? m.color : ''} />
                        <span className="text-[10px] font-black uppercase tracking-wider">{m.label}</span>
                      </button>
                    ))}
                  </div>
                  {newDiesel.paymentMode === 'Udhaar' && (
                    <p className="mt-2 text-[10px] text-orange-600 font-bold flex items-center gap-1">
                      <AlertCircle size={10} /> Will be added to Shrinath Petrol Pump account
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Short Note</label>
                  <input
                    className="material-input h-14 bg-slate-50"
                    placeholder="e.g. Full tank"
                    value={newDiesel.description}
                    onChange={e => setNewDiesel({...newDiesel, description: e.target.value})}
                  />
                </div>

                <button type="submit" className="material-btn material-btn-primary h-16 text-lg mt-2 shadow-lg shadow-blue-100">
                  Save Diesel Log
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Log Maintenance Modal */}
      <AnimatePresence>
        {isAddingMaintenance && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: "100%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%", scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-display font-bold text-slate-900">Maintenance Expense</h2>
                  <p className="text-sm text-slate-500">Record a new repair or service</p>
                </div>
                <button onClick={() => setIsAddingMaintenance(false)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <form onSubmit={handleAddMaintenance} className="flex flex-col gap-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Select Tractor</label>
                  <select
                    required
                    className="material-input h-14 bg-slate-50 appearance-none"
                    value={newMaintenance.tractorId}
                    onChange={e => setNewMaintenance({...newMaintenance, tractorId: e.target.value})}
                  >
                    <option value="">Select Tractor</option>
                    {tractors?.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.vehicleNumber})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Date</label>
                  <input
                    type="date"
                    className="material-input h-14 bg-slate-50"
                    value={newMaintenance.date}
                    onChange={e => setNewMaintenance({...newMaintenance, date: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Total Amount (₹)</label>
                  <input
                    required
                    type="number"
                    className="material-input h-16 text-2xl font-black bg-slate-50"
                    placeholder="0"
                    value={newMaintenance.amount || ''}
                    onChange={e => setNewMaintenance({...newMaintenance, amount: parseFloat(e.target.value)})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Payment Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'Cash', label: 'Cash', icon: Banknote, color: 'text-green-600', bg: 'bg-green-50' },
                      { id: 'Bank', label: 'Bank', icon: Smartphone, color: 'text-blue-600', bg: 'bg-blue-50' },
                      { id: 'Udhaar', label: 'Udhaar', icon: History, color: 'text-orange-600', bg: 'bg-orange-50' }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setNewMaintenance({ ...newMaintenance, paymentMode: m.id as any })}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                          newMaintenance.paymentMode === m.id 
                            ? `border-slate-900 ${m.bg}` 
                            : 'border-slate-50 text-slate-400 opacity-60'
                        }`}
                      >
                        <m.icon size={20} className={newMaintenance.paymentMode === m.id ? m.color : ''} />
                        <span className="text-[10px] font-black uppercase tracking-wider">{m.label}</span>
                      </button>
                    ))}
                  </div>
                  {newMaintenance.paymentMode === 'Udhaar' && (
                    <p className="mt-2 text-[10px] text-orange-600 font-bold flex items-center gap-1">
                      <AlertCircle size={10} /> Will be added to Shrinath Petrol Pump account
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Description / Repair Details</label>
                  <textarea
                    required
                    rows={3}
                    className="material-input p-4 min-h-[100px] bg-slate-50"
                    placeholder="e.g. Tire tube replacement, Engine oil change"
                    value={newMaintenance.description}
                    onChange={e => setNewMaintenance({...newMaintenance, description: e.target.value})}
                  />
                </div>

                <button type="submit" className="material-btn bg-orange-600 hover:bg-orange-700 text-white h-16 text-lg mt-2 shadow-lg shadow-orange-100">
                  Save Maintenance Log
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Download Report</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Select Period & Options</p>
                </div>
                <button onClick={() => setShowReportModal(false)} className="text-slate-400">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Report Period</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['daily', 'weekly', 'monthly'].map(p => (
                      <button
                        key={p}
                        onClick={() => setReportConfig({...reportConfig, period: p as any})}
                        className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider border-2 transition-all ${reportConfig.period === p ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-50 text-slate-400'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Include Maintenance?</label>
                  <div className="flex bg-slate-50 p-1 rounded-xl">
                    <button
                      onClick={() => setReportConfig({...reportConfig, includeMaintenance: true})}
                      className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${reportConfig.includeMaintenance ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
                    >
                      Yes, include
                    </button>
                    <button
                      onClick={() => setReportConfig({...reportConfig, includeMaintenance: false})}
                      className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${!reportConfig.includeMaintenance ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
                    >
                      Diesel Only
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Select Tractor</label>
                  <select
                    className="material-input h-14 bg-slate-50 appearance-none"
                    value={reportConfig.tractorId}
                    onChange={e => setReportConfig({...reportConfig, tractorId: e.target.value})}
                  >
                    <option value="all">FLeet Summary (All)</option>
                    {tractors?.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={generateReport}
                  className="w-full material-btn material-btn-primary h-16 mt-4 shadow-xl shadow-blue-100 flex items-center justify-center gap-3"
                >
                  <Download size={20} /> Download PDF
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Tractor Modal */}
      <AnimatePresence>
        {showTractorModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-900">Add New Tractor</h2>
                <button onClick={() => setShowTractorModal(false)} className="text-slate-400">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              <form onSubmit={handleAddTractor} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tractor Name</label>
                  <input
                    required
                    className="material-input h-14 bg-slate-50"
                    placeholder="e.g. Swaraj 744"
                    value={newTractor.name}
                    onChange={e => setNewTractor({...newTractor, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Vehicle Number</label>
                  <input
                    required
                    className="material-input h-14 bg-slate-50"
                    placeholder="e.g. RJ-14-GH-1234"
                    value={newTractor.vehicleNumber}
                    onChange={e => setNewTractor({...newTractor, vehicleNumber: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Insurance Expiry Date</label>
                  <input
                    required
                    type="date"
                    className="material-input h-14 bg-slate-50"
                    value={newTractor.insuranceExpiry}
                    onChange={e => setNewTractor({...newTractor, insuranceExpiry: e.target.value})}
                  />
                </div>
                <button type="submit" className="w-full material-btn material-btn-primary h-14 mt-4 shadow-lg shadow-blue-100">
                  Add Tractor
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {editingTractor && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-900">Edit Tractor Details</h2>
                <button onClick={() => setEditingTractor(null)} className="text-slate-400 cursor-pointer">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              <form onSubmit={handleEditTractorSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tractor Name</label>
                  <input
                    required
                    className="material-input h-14 bg-slate-50"
                    placeholder="e.g. Swaraj 744"
                    value={editingTractor.name}
                    onChange={e => setEditingTractor({...editingTractor, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Vehicle Number</label>
                  <input
                    required
                    className="material-input h-14 bg-slate-50"
                    placeholder="e.g. RJ-14-GH-1234"
                    value={editingTractor.vehicleNumber}
                    onChange={e => setEditingTractor({...editingTractor, vehicleNumber: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Insurance Expiry Date</label>
                  <input
                    required
                    type="date"
                    className="material-input h-14 bg-slate-50"
                    value={editingTractor.insuranceExpiry || ''}
                    onChange={e => setEditingTractor({...editingTractor, insuranceExpiry: e.target.value})}
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => setEditingTractor(null)}
                    className="flex-1 border border-slate-200 text-slate-500 font-bold h-14 rounded-xl text-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 material-btn material-btn-primary h-14 shadow-lg shadow-blue-100 cursor-pointer">
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (!deleteConfirm) return;
          if (deleteConfirm.type === 'tractor') handleDeleteTractor(deleteConfirm.id);
          else handleDeleteLog(deleteConfirm.type, deleteConfirm.id);
        }}
        title={`Delete ${deleteConfirm?.type === 'tractor' ? 'Tractor' : deleteConfirm?.type === 'diesel' ? 'Diesel Log' : 'Maintenance Log'}?`}
        message={
          deleteConfirm?.type === 'tractor' 
            ? `Delete tractor "${deleteConfirm.name}"? Diesel and maintenance logs for this tractor will remain in history.`
            : `Are you sure you want to delete this ${deleteConfirm?.type === 'diesel' ? 'diesel' : 'maintenance'} log? Ledger entries created with this log will not be deleted.`
        }
      />

      {/* Quick Payment Modal */}
      <AnimatePresence>
        {quickPayment && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative overflow-hidden"
            >
               <div className="absolute top-0 right-0 p-8 opacity-[0.03] scale-[2] pointer-events-none">
                {quickPayment.type === 'Diesel' ? <Fuel size={48} /> : <Wrench size={48} />}
              </div>

              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-display font-black text-slate-900">Quick {quickPayment.type}</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{quickPayment.tractor.name}</p>
                </div>
                <button onClick={() => setQuickPayment(null)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                 {/* Type Selector */}
                 <div className="flex bg-slate-50 p-1 rounded-xl">
                  {['Diesel', 'Maintenance'].map(t => (
                    <button
                      key={t}
                      onClick={() => setQuickPayment({...quickPayment, type: t as any})}
                      className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${quickPayment.type === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* Amount Input */}
                <div className="grid grid-cols-1 gap-3">
                   {quickPayment.type === 'Diesel' && (
                     <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Liters</label>
                        <input
                          type="number" step="0.01"
                          placeholder="0.00"
                          className="material-input h-14 bg-slate-50 font-black"
                          value={quickPayment.liters}
                          onChange={e => setQuickPayment({...quickPayment, liters: e.target.value})}
                        />
                     </div>
                   )}
                   <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Total Amount (₹)</label>
                      <input
                        type="number"
                        placeholder="0"
                        className="material-input h-16 text-2xl font-black bg-slate-50"
                        value={quickPayment.amount}
                        onChange={e => setQuickPayment({...quickPayment, amount: e.target.value})}
                        autoFocus
                      />
                   </div>
                </div>

                {/* Mode Selector */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Payment Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'Cash', label: 'Cash', icon: Banknote },
                      { id: 'Bank', label: 'Bank', icon: Smartphone },
                      { id: 'Udhaar', label: 'Udhaar', icon: History }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setQuickPayment({ 
                          ...quickPayment, 
                          paymentMode: m.id as any,
                          accountName: m.id === 'Udhaar' ? 'Shrinath Petrol Pump' : '' 
                        })}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                          quickPayment.paymentMode === m.id 
                            ? 'border-slate-900 bg-slate-50 text-slate-900' 
                            : 'border-slate-50 text-slate-300'
                        }`}
                      >
                        <m.icon size={18} />
                        <span className="text-[9px] font-black uppercase">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Udhaar Account Selector */}
                {quickPayment.paymentMode === 'Udhaar' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Select Credit Account</label>
                    <select
                      className="material-input h-14 bg-slate-50 appearance-none text-sm font-bold"
                      value={quickPayment.accountName}
                      onChange={e => setQuickPayment({...quickPayment, accountName: e.target.value})}
                    >
                      <option value="Shrinath Petrol Pump">Shrinath Petrol Pump (Default)</option>
                      {accounts
                        .filter(a => a.name !== 'Cash' && a.name !== 'Bank Account' && a.name !== 'Fuel Expense' && a.name !== 'Maintenance')
                        .sort((a,b) => a.name.localeCompare(b.name))
                        .map(acc => (
                          <option key={acc.id} value={acc.name}>{acc.name}</option>
                        ))
                      }
                    </select>
                  </div>
                )}

                <button 
                  onClick={handleQuickPaymentSubmit}
                  disabled={!quickPayment.amount}
                  className="w-full h-16 bg-slate-900 text-white rounded-[1.5rem] font-display font-black text-lg shadow-xl shadow-slate-200 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
                >
                  Pay Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Notification */}
      <AnimatePresence>
        {showDone && (
          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.5 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-4 border border-blue-500/30"
          >
            <div className="text-blue-400">
               <Logo size={32} />
            </div>
            <span className="font-display font-black text-lg">Entry Saved!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
