import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, runTransaction, orderBy, deleteDoc, getDocs, where } from 'firebase/firestore';
import { HydrantFilling as HydrantFillingType, Account, AccountGroup } from '../types';
import { 
  Plus, 
  Search, 
  Printer, 
  Trash2, 
  Filter, 
  Download,
  Calendar,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Droplets,
  History,
  Smartphone,
  Banknote,
  Stamp,
  Truck,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../constants';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import { ConfirmationModal } from './ConfirmationModal';
import { toPng } from 'html-to-image';

import { Logo } from './Logo';

export function HydrantFilling({ franchiseId, isSuperAdmin }: { franchiseId?: string, isSuperAdmin?: boolean }) {
  const [fillings, setFillings] = useState<HydrantFillingType[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tractors, setTractors] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Inward' | 'Outward'>('All');
  const [timeFilter, setTimeFilter] = useState<'Monthly' | 'Yearly' | 'All'>('Monthly');
  const [printingFilling, setPrintingFilling] = useState<HydrantFillingType | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<HydrantFillingType | null>(null);
  
  const [partySuggestions, setPartySuggestions] = useState<string[]>([]);
  const [vehicleSuggestions, setVehicleSuggestions] = useState<string[]>([]);
  const [showPartySuggestions, setShowPartySuggestions] = useState(false);
  const [showVehicleSuggestions, setShowVehicleSuggestions] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);
  const printThermal = () => {
    if (!printRef.current || !printingFilling) return;
    
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      
      const content = printRef.current.innerHTML;
      const style = `
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
          body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; width: 80mm; }
          .text-center { text-align: center; }
          .font-black { font-weight: 900; }
          .font-bold { font-weight: 700; }
          .uppercase { text-transform: uppercase; }
          .text-lg { font-size: 18px; }
          .text-sm { font-size: 14px; }
          .text-xs { font-size: 11px; }
          .border-b-2 { border-bottom: 2px solid; }
          .border-t-2 { border-top: 2px solid; }
          .border-t { border-top: 1px solid; }
          .border-dashed { border-style: dashed; }
          .border-slate-300 { border-color: #cbd5e1; }
          .border-slate-200 { border-color: #e2e8f0; }
          .pb-4 { padding-bottom: 16px; }
          .pt-4 { padding-top: 16px; }
          .pt-2 { padding-top: 8px; }
          .mb-4 { margin-bottom: 16px; }
          .mb-6 { margin-bottom: 24px; }
          .my-8 { margin-top: 32px; margin-bottom: 32px; }
          .space-y-3 > * + * { margin-top: 12px; }
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .justify-center { justify-content: center; }
          .items-center { align-items: center; }
          .italic { font-style: italic; }
          .text-slate-400 { color: #94a3b8; }
          .text-blue-800 { color: #1e40af; }
          .text-blue-900\\/10 { color: rgba(30, 58, 138, 0.1); }
          .relative { position: relative; }
          .absolute { position: absolute; }
          .inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
          .rounded-full { border-radius: 9999px; }
          .border-\\[5px\\] { border-width: 5px; }
          .border-blue-700\\/40 { border-color: rgba(29, 78, 216, 0.4); }
          .border-blue-700\\/20 { border-color: rgba(29, 78, 216, 0.2); }
          .w-28 { width: 112px; }
          .h-28 { height: 112px; }
          .p-3 { padding: 12px; }
          .m-1 { margin: 4px; }
          .text-\\[9px\\] { font-size: 9px; }
          .text-\\[10px\\] { font-size: 10px; }
          .text-\\[14px\\] { font-size: 14px; }
          .text-3xl { font-size: 30px; }
          .rotate-\\[-5deg\\] { transform: rotate(-5deg); }
          .-rotate-12 { transform: rotate(-12deg); }
          .top-1/2 { top: 50%; }
          .left-1/2 { left: 50%; }
          .-translate-x-1/2 { transform: translateX(-50%); }
          .-translate-y-1/2 { transform: translateY(-50%); }
          .select-none { user-select: none; }
          .pointer-events-none { pointer-events: none; }
          @media print {
            @page { size: 80mm; margin: 0; }
            body { width: 80mm; padding: 10px; }
          }
        </style>
      `;
      
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`<!DOCTYPE html><html><head>${style}</head><body>${content}</body></html>`);
        doc.close();
        
        // Use a timeout as a reliable fallback for styles and potential assets
        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 1000);
          }
        }, 1000);
      }
    } catch (e) {
      console.error('Print Error:', e instanceof Error ? e.message : String(e));
      alert('Printing failed. Please ensure popups are allowed or try again.');
    }
  };

  const [downloadingFilling, setDownloadingFilling] = useState<HydrantFillingType | null>(null);
  
  const downloadToken = async () => {
    if (!printRef.current || !downloadingFilling) return;
    
    try {
      // Ensure the printable area is visible but hidden from user flow
      const container = printRef.current;
      container.parentElement?.classList.remove('hidden');
      
      const dataUrl = await toPng(container, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      
      container.parentElement?.classList.add('hidden');
      
      const link = document.createElement('a');
      link.download = `Token_${downloadingFilling.tokenNumber}.png`;
      link.href = dataUrl;
      link.click();
      setDownloadingFilling(null);
    } catch (e) {
      console.error('Download Error:', e instanceof Error ? e.message : String(e));
      alert('Download failed. Please try again.');
    }
  };

  useEffect(() => {
    if (downloadingFilling) {
      setTimeout(() => {
        downloadToken();
      }, 500);
    }
  }, [downloadingFilling]);

  useEffect(() => {
    if (printingFilling) {
      setTimeout(() => {
        printThermal();
        setPrintingFilling(null);
      }, 500);
    }
  }, [printingFilling]);

  const [formData, setFormData] = useState({
    type: 'Inward' as 'Inward' | 'Outward',
    partyName: 'TankerWala Powered by Rajhans',
    vehicleNumber: '',
    rate: '100',
    quantity: '1',
    paymentMode: 'Cash' as 'Cash' | 'Bank' | 'Udhaar',
    paymentAccountId: '',
    remarks: ''
  });

  useEffect(() => {
    const fid = franchiseId || (isSuperAdmin ? null : 'PLACEHOLDER_NONE');

    let fillingsQuery = query(collection(db, 'hydrantFillings'), orderBy('date', 'desc'));
    if (fid) {
      fillingsQuery = query(collection(db, 'hydrantFillings'), where('franchiseId', '==', fid), orderBy('date', 'desc'));
    }
    const unsubFillings = onSnapshot(fillingsQuery, 
      (snapshot) => setFillings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HydrantFillingType))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'hydrantFillings')
    );

    let accountsQuery = query(collection(db, 'accounts'));
    if (fid) {
      accountsQuery = query(collection(db, 'accounts'), where('franchiseId', '==', fid));
    }
    const unsubAcc = onSnapshot(accountsQuery,
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

    let tractorsQuery = query(collection(db, 'tractors'));
    if (fid) {
      tractorsQuery = query(collection(db, 'tractors'), where('franchiseId', '==', fid));
    }
    const unsubTractors = onSnapshot(tractorsQuery,
      (snapshot) => setTractors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'tractors')
    );
    return () => { unsubFillings(); unsubAcc(); unsubTractors(); };
  }, [isSuperAdmin, franchiseId]);

  useEffect(() => {
    // Generate suggestions based on mode and history
    if (formData.paymentMode === 'Udhaar') {
      const partyType = formData.type === 'Inward' ? 'Sundry Debtors' : 'Sundry Creditors';
      // Find group ID first (approximate)
      const suggestions = accounts.map(a => a.name);
      setPartySuggestions([...new Set(suggestions)]);
    } else {
      const history = fillings.filter(f => f.type === formData.type).map(f => f.partyName);
      setPartySuggestions([...new Set(history)]);
    }

    if (formData.type === 'Outward') {
      const tSuggestions = tractors.map(t => `${t.name} (${t.vehicleNumber})`);
      setVehicleSuggestions(tSuggestions);
    } else {
      setVehicleSuggestions([...new Set(fillings.filter(f => f.type === 'Inward').map(f => f.vehicleNumber || ''))]);
    }
  }, [formData.paymentMode, formData.type, accounts, fillings, tractors]);

  const [showDone, setShowDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    try {
      const amount = Number(formData.rate) * Number(formData.quantity);
      const tokenNumber = formData.type === 'Inward' ? `IN-${Date.now().toString().slice(-6)}` : `OUT-${Date.now().toString().slice(-6)}`;
      
      await runTransaction(db, async (transaction) => {
        const fillingRef = doc(collection(db, 'hydrantFillings'));
        const voucherRef = doc(collection(db, 'vouchers'));
        
        const incomeAccName = 'Hydrant Filling Income';
        const expenseAccName = 'Tanker Filling Expense';
        
        const [incomeAccSnap, expenseAccSnap, assetsGrpSnap, incGrpSnap, expGrpSnap] = await Promise.all([
          getDocs(query(collection(db, 'accounts'), where('name', '==', incomeAccName), where('franchiseId', '==', franchiseId || null))),
          getDocs(query(collection(db, 'accounts'), where('name', '==', expenseAccName), where('franchiseId', '==', franchiseId || null))),
          getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Current Assets'), where('franchiseId', '==', franchiseId || null))),
          getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Indirect Incomes'), where('franchiseId', '==', franchiseId || null))),
          getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Direct Expenses'), where('franchiseId', '==', franchiseId || null)))
        ]);

        let incomeAccId = incomeAccSnap.docs[0]?.id;
        let expenseAccId = expenseAccSnap.docs[0]?.id;
        let incGrpId = incGrpSnap.docs[0]?.id;
        let expGrpId = expGrpSnap.docs[0]?.id;
        
        const mode = formData.paymentMode;
        let paymentAccName = mode === 'Cash' ? 'Cash' : mode === 'Bank' ? 'Bank Account' : formData.partyName;
        
        // Prevent duplicate ledger accounts by looking up case-insensitively using preloaded state
        const matchedPaymentAcc = accounts.find(a => a.name.toLowerCase().trim() === paymentAccName.toLowerCase().trim());
        let paymentAccId = matchedPaymentAcc?.id;
        let isNewPaymentAcc = false;

        if (!paymentAccId) {
          isNewPaymentAcc = true;
          const tempDocRef = doc(collection(db, 'accounts'));
          paymentAccId = tempDocRef.id;
        }

        // Perform all TRANSACTIONAL READS first
        const paymentAccRef = isNewPaymentAcc ? null : doc(db, 'accounts', paymentAccId);
        const incAccRef = incomeAccId ? doc(db, 'accounts', incomeAccId) : null;
        const expAccRef = expenseAccId ? doc(db, 'accounts', expenseAccId) : null;

        const [paymentAccDoc, incAccDoc, expAccDoc] = await Promise.all([
          paymentAccRef ? transaction.get(paymentAccRef) : Promise.resolve(null),
          incAccRef ? transaction.get(incAccRef) : Promise.resolve(null),
          expAccRef ? transaction.get(expAccRef) : Promise.resolve(null)
        ]);

        // NOW PERFORM ALL WRITES
        
        let assetsGrpId = assetsGrpSnap.docs[0]?.id;
        
        // Auto-create category accounts if missing
        if (!incomeAccId) {
          if (!incGrpId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { 
              name: 'Indirect Incomes', 
              type: 'Income',
              franchiseId: franchiseId || null,
              createdAt: serverTimestamp()
            });
            incGrpId = newGrp.id;
          }
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { 
            name: incomeAccName, 
            groupId: incGrpId, 
            openingBalance: 0, 
            balanceType: 'Cr', 
            currentBalance: amount, 
            franchiseId: franchiseId || null,
            createdAt: serverTimestamp() 
          });
          incomeAccId = newAcc.id;
        }

        if (!expenseAccId) {
          if (!expGrpId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { 
              name: 'Direct Expenses', 
              type: 'Expense',
              franchiseId: franchiseId || null,
              createdAt: serverTimestamp()
            });
            expGrpId = newGrp.id;
          }
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { 
            name: expenseAccName, 
            groupId: expGrpId, 
            openingBalance: 0, 
            balanceType: 'Dr', 
            currentBalance: amount, 
            franchiseId: franchiseId || null,
            createdAt: serverTimestamp() 
          });
          expenseAccId = newAcc.id;
        }

        if (isNewPaymentAcc) {
          if (mode === 'Cash' || mode === 'Bank') {
            if (!assetsGrpId) {
              const newGrp = doc(collection(db, 'accountGroups'));
              transaction.set(newGrp, { 
                name: 'Current Assets', 
                type: 'Asset',
                franchiseId: franchiseId || null,
                createdAt: serverTimestamp()
              });
              assetsGrpId = newGrp.id;
            }
            const newAcc = doc(db, 'accounts', paymentAccId);
            const initialBal = formData.type === 'Inward' ? amount : -amount;
            transaction.set(newAcc, {
              name: paymentAccName,
              groupId: assetsGrpId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: initialBal,
              franchiseId: franchiseId || null,
              createdAt: serverTimestamp()
            });
          } else if (mode === 'Udhaar') {
            const grpName = formData.type === 'Inward' ? 'Sundry Debtors' : 'Sundry Creditors';
            const grpSnap = await getDocs(query(collection(db, 'accountGroups'), where('name', '==', grpName), where('franchiseId', '==', franchiseId || null)));
            let grpId = grpSnap.docs[0]?.id;
            if (!grpId) {
              const newG = doc(collection(db, 'accountGroups'));
              transaction.set(newG, { 
                name: grpName, 
                type: formData.type === 'Inward' ? 'Asset' : 'Liability',
                franchiseId: franchiseId || null,
                createdAt: serverTimestamp()
              });
              grpId = newG.id;
            }
            const newAcc = doc(db, 'accounts', paymentAccId);
            transaction.set(newAcc, { 
              name: paymentAccName, 
              groupId: grpId, 
              openingBalance: 0, 
              balanceType: formData.type === 'Inward' ? 'Dr' : 'Cr', 
              currentBalance: amount, 
              franchiseId: franchiseId || null,
              createdAt: serverTimestamp() 
            });
          }
        }

        const fillingData: any = {
          tokenNumber,
          date: new Date().toISOString(),
          type: formData.type,
          partyName: formData.partyName,
          vehicleNumber: formData.vehicleNumber,
          rate: Number(formData.rate),
          quantity: Number(formData.quantity),
          totalAmount: amount,
          paymentMode: mode,
          paymentAccountId: paymentAccId,
          status: 'Completed',
          remarks: formData.remarks,
          franchiseId: franchiseId || null,
          createdAt: serverTimestamp()
        };

        transaction.set(fillingRef, fillingData);

        if (formData.type === 'Inward') {
          transaction.set(voucherRef, {
            voucherNumber: `VCH-${tokenNumber}`,
            date: new Date(),
            type: mode === 'Udhaar' ? 'Sales' : 'Receipt',
            items: [
              { accountId: paymentAccId, accountName: paymentAccName, amount: amount, type: 'Dr' },
              { accountId: incomeAccId, accountName: incomeAccName, amount: amount, type: 'Cr' }
            ],
            narration: `Hydrant filling for ${formData.partyName} (${formData.vehicleNumber}) [Token: ${tokenNumber}]`,
            totalAmount: amount,
            franchiseId: franchiseId || null,
            createdAt: serverTimestamp()
          });
          
          if (paymentAccId && paymentAccRef && !isNewPaymentAcc) {
            const currentBal = paymentAccDoc?.exists() ? (paymentAccDoc.data().currentBalance || 0) : 0;
            transaction.update(paymentAccRef, { 
              currentBalance: (paymentAccDoc?.exists() && paymentAccDoc.data().balanceType === 'Cr') ? currentBal - amount : currentBal + amount 
            });
          }
          // Update income account
          if (incomeAccId && incAccRef) {
            transaction.update(incAccRef, { currentBalance: (incAccDoc?.data()?.currentBalance || 0) + amount });
          }
        } else {
          transaction.set(voucherRef, {
            voucherNumber: `VCH-${tokenNumber}`,
            date: new Date(),
            type: mode === 'Udhaar' ? 'Purchase' : 'Payment',
            items: [
              { accountId: expenseAccId, accountName: expenseAccName, amount: amount, type: 'Dr' },
              { accountId: paymentAccId, accountName: paymentAccName, amount: amount, type: 'Cr' }
            ],
            narration: `Self tanker filling @ ${formData.partyName} (${formData.vehicleNumber}) [Token: ${tokenNumber}]`,
            totalAmount: amount,
            franchiseId: franchiseId || null,
            createdAt: serverTimestamp()
          });

          if (paymentAccId && paymentAccRef && !isNewPaymentAcc) {
            const currentBal = paymentAccDoc?.exists() ? (paymentAccDoc.data().currentBalance || 0) : 0;
            transaction.update(paymentAccRef, { 
              currentBalance: (paymentAccDoc?.exists() && paymentAccDoc.data().balanceType === 'Dr') ? currentBal - amount : currentBal + amount 
            });
          }
          // Update expense account
          if (expenseAccId && expAccRef) {
            transaction.update(expAccRef, { currentBalance: (expAccDoc?.data()?.currentBalance || 0) + amount });
          }
        }
      });

      setShowAddForm(false);
      setShowDone(true);
      setTimeout(() => setShowDone(false), 3000);
      setFormData({
        type: 'Inward',
        partyName: '',
        vehicleNumber: '',
        rate: '100',
        quantity: '1',
        paymentMode: 'Cash',
        paymentAccountId: '',
        remarks: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'hydrantFillings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'hydrantFillings', deleteConfirm.id!));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'hydrantFillings');
    }
  };

  const filteredFillings = fillings.filter(f => {
    const matchesSearch = f.partyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         f.vehicleNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         f.tokenNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'All' || f.type === filterType;
    
    let matchesTime = true;
    const fillingDate = new Date(f.date);
    const now = new Date();
    
    if (timeFilter === 'Monthly') {
      matchesTime = isWithinInterval(fillingDate, { start: startOfMonth(now), end: endOfMonth(now) });
    } else if (timeFilter === 'Yearly') {
      matchesTime = isWithinInterval(fillingDate, { start: startOfYear(now), end: endOfYear(now) });
    }
    
    return matchesSearch && matchesType && matchesTime;
  });

  const now = new Date();
  const startOfThisMonth = startOfMonth(now);
  const endOfThisMonth = endOfMonth(now);
  const startOfThisYear = startOfYear(now);
  const endOfThisYear = endOfYear(now);

  const monthlySelfCount = fillings.filter(f => {
    if (f.type !== 'Outward') return false;
    const d = new Date(f.date);
    return isWithinInterval(d, { start: startOfThisMonth, end: endOfThisMonth });
  }).length;

  const monthlyOthersCount = fillings.filter(f => {
    if (f.type !== 'Inward') return false;
    const d = new Date(f.date);
    return isWithinInterval(d, { start: startOfThisMonth, end: endOfThisMonth });
  }).length;

  const yearlySelfCount = fillings.filter(f => {
    if (f.type !== 'Outward') return false;
    const d = new Date(f.date);
    return isWithinInterval(d, { start: startOfThisYear, end: endOfThisYear });
  }).length;

  const yearlyOthersCount = fillings.filter(f => {
    if (f.type !== 'Inward') return false;
    const d = new Date(f.date);
    return isWithinInterval(d, { start: startOfThisYear, end: endOfThisYear });
  }).length;

  const stats = {
    totalInward: filteredFillings.filter(f => f.type === 'Inward').reduce((sum, f) => sum + f.totalAmount, 0),
    totalOutward: filteredFillings.filter(f => f.type === 'Outward').reduce((sum, f) => sum + f.totalAmount, 0),
    countInward: filteredFillings.filter(f => f.type === 'Inward').length,
    countOutward: filteredFillings.filter(f => f.type === 'Outward').length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 pb-32">
       {/* Header */}
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight">Hydrant Filling</h1>
          <p className="text-slate-500 font-medium">Manage filling station tokens and accounting</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-slate-200 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <Plus size={20} />
          New Filling
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4">
            <ArrowUpRight size={24} />
          </div>
          <div className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Filling Income</div>
          <div className="text-3xl font-display font-black text-slate-900">{formatCurrency(stats.totalInward)}</div>
          <div className="text-xs font-bold text-green-600 mt-1">{stats.countInward} Inward Fillings</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4">
            <ArrowDownLeft size={24} />
          </div>
          <div className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Filling Expense</div>
          <div className="text-3xl font-display font-black text-slate-900">{formatCurrency(stats.totalOutward)}</div>
          <div className="text-xs font-bold text-red-600 mt-1">{stats.countOutward} Outward Fillings</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
            <Truck size={24} />
          </div>
          <div className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Self Filling (हमारा)</div>
          <div className="mt-2 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase">This Month</span>
              <span className="text-xl font-display font-black text-slate-900">{monthlySelfCount} <span className="text-[10px] font-bold text-slate-400">Tankers</span></span>
            </div>
            <div className="flex items-baseline justify-between border-t border-slate-50 pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">This Year</span>
              <span className="text-sm font-display font-bold text-indigo-600">{yearlySelfCount} <span className="text-[9px] font-bold text-slate-400">Tankers</span></span>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
            <Users size={24} />
          </div>
          <div className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Other Filling (बाहर)</div>
          <div className="mt-2 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase">This Month</span>
              <span className="text-xl font-display font-black text-slate-900">{monthlyOthersCount} <span className="text-[10px] font-bold text-slate-400">Tankers</span></span>
            </div>
            <div className="flex items-baseline justify-between border-t border-slate-50 pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">This Year</span>
              <span className="text-sm font-display font-bold text-amber-600">{yearlyOthersCount} <span className="text-[9px] font-bold text-slate-400">Tankers</span></span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search party, vehicle or token..."
            className="material-input pl-12 h-12 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <div className="flex bg-slate-50 p-1 rounded-xl">
            {['All', 'Inward', 'Outward'].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t as any)}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${filterType === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
              >
                {t}
              </button>
            ))}
          </div>
          
          <div className="flex bg-slate-50 p-1 rounded-xl">
            {['Monthly', 'Yearly', 'All'].map(t => (
              <button
                key={t}
                onClick={() => setTimeFilter(t as any)}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${timeFilter === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFillings.map((f, idx) => (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            key={f.id}
            className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
          >
            <div className={`absolute top-0 right-0 p-8 opacity-[0.03] scale-[2.5] pointer-events-none ${f.type === 'Inward' ? 'text-green-600' : 'text-red-600'}`}>
              {f.type === 'Inward' ? <ArrowUpRight size={48} /> : <ArrowDownLeft size={48} />}
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${f.type === 'Inward' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {f.type === 'Inward' ? 'Filling Others' : 'Self Filling'}
              </span>
              <span className="text-[10px] font-bold text-slate-400">{format(new Date(f.date), 'dd MMM, hh:mm a')}</span>
            </div>

            <h3 className="text-xl font-display font-black text-slate-900 mb-1">{f.partyName}</h3>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-md">{f.vehicleNumber}</span>
              <span className="text-[10px] font-bold text-slate-400">#{f.tokenNumber}</span>
            </div>

            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-2xl font-display font-black text-slate-900">{formatCurrency(f.totalAmount)}</span>
              <span className="text-xs font-bold text-slate-400">@ ₹{f.rate}</span>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${f.paymentMode === 'Udhaar' ? 'bg-orange-400' : 'bg-green-400'}`} />
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">{f.paymentMode}</span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setDownloadingFilling(f)}
                  className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all"
                  title="Download Token"
                >
                  <Download size={18} />
                </button>
                <button 
                  onClick={() => setPrintingFilling(f)}
                  className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all"
                  title="Print Token"
                >
                  <Printer size={18} />
                </button>
                <button 
                  onClick={() => setDeleteConfirm(f)}
                  className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Form Modal */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-xl rounded-[3rem] p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-display font-black text-slate-900">New Filling Entry</h2>
                  <p className="text-slate-500 font-medium text-sm">Issue token and log payment</p>
                </div>
                <button onClick={() => setShowAddForm(false)} className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex bg-slate-50 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, type: 'Inward', partyName: 'TankerWala Powered by Rajhans', rate: '100'})}
                    className={`flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${formData.type === 'Inward' ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}
                  >
                    Filling Others
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, type: 'Outward', partyName: '', rate: '100'})}
                    className={`flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${formData.type === 'Outward' ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}
                  >
                    Self Filling
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Party Name / Hydrant</label>
                    <input 
                      required
                      type="text"
                      className="material-input w-full h-14"
                      placeholder="e.g. Ram Singh Tanker"
                      value={formData.partyName}
                      autoComplete="off"
                      onFocus={() => setShowPartySuggestions(true)}
                      onBlur={() => setTimeout(() => setShowPartySuggestions(false), 200)}
                      onChange={(e) => setFormData({...formData, partyName: e.target.value})}
                    />
                    <AnimatePresence>
                      {showPartySuggestions && partySuggestions.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute z-[210] top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-xl max-h-48 overflow-y-auto"
                        >
                          {partySuggestions.filter(p => p.toLowerCase().includes(formData.partyName.toLowerCase())).map((p, i) => (
                            <button
                              key={i}
                              type="button"
                              className="w-full text-left px-5 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 transition-colors"
                              onClick={() => setFormData({ ...formData, partyName: p })}
                            >
                              {p}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="relative">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Vehicle Number</label>
                    <input 
                      type="text"
                      className="material-input w-full h-14"
                      placeholder="e.g. RJ14 GB 1234"
                      value={formData.vehicleNumber}
                      autoComplete="off"
                      onFocus={() => setShowVehicleSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowVehicleSuggestions(false), 200)}
                      onChange={(e) => setFormData({...formData, vehicleNumber: e.target.value})}
                    />
                    <AnimatePresence>
                      {showVehicleSuggestions && vehicleSuggestions.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute z-[210] top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-xl max-h-48 overflow-y-auto"
                        >
                          {vehicleSuggestions.filter(v => v.toLowerCase().includes(formData.vehicleNumber.toLowerCase())).map((v, i) => (
                            <button
                              key={i}
                              type="button"
                              className="w-full text-left px-5 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 transition-colors"
                              onClick={() => setFormData({ ...formData, vehicleNumber: v.split(' (')[1]?.replace(')', '') || v })}
                            >
                              {v}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Rate (₹)</label>
                    <input 
                      required
                      type="number"
                      className="material-input w-full h-14 text-xl font-black"
                      value={formData.rate}
                      onChange={(e) => setFormData({...formData, rate: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Quantity (Tankers)</label>
                    <input 
                      required
                      type="number"
                      className="material-input w-full h-14 text-xl font-black"
                      value={formData.quantity}
                      onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block ml-1">Payment Mode</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'Cash', label: 'Cash', icon: Banknote },
                      { id: 'Bank', label: 'Bank', icon: Smartphone },
                      { id: 'Udhaar', label: 'Udhaar', icon: History }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, paymentMode: m.id as any })}
                        className={`flex flex-col items-center gap-2 p-4 rounded-3xl border-2 transition-all ${
                          formData.paymentMode === m.id 
                            ? 'border-slate-900 bg-slate-50 text-slate-900 shadow-inner' 
                            : 'border-slate-50 text-slate-300'
                        }`}
                      >
                        <m.icon size={20} />
                        <span className="text-[10px] font-black uppercase tracking-tight">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  disabled={isSaving}
                  className="w-full h-20 bg-slate-900 text-white rounded-[2rem] font-display font-black text-xl shadow-2xl shadow-slate-200 active:scale-95 transition-all disabled:opacity-50"
                  type="submit"
                >
                  {isSaving ? 'Processing...' : `Issue Bill - ${formatCurrency(Number(formData.rate) * Number(formData.quantity))}`}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print/Download View Hidden */}
      <div className="hidden">
        <div ref={printRef} className="p-8 w-[80mm] font-mono text-xs text-slate-900 bg-white">
          <div className="text-center border-b-2 border-dashed border-slate-300 pb-4 mb-4">
             <h2 className="text-lg font-black uppercase tracking-tighter pb-3">
               Tanker<span className="relative">Wala<span className="absolute top-full left-0 text-[8px] text-slate-500 font-medium whitespace-nowrap normal-case tracking-normal mt-0.5">Powered by Rajhans</span></span>
             </h2>
             <p className="text-[10px]">Tanker Hydrant & Filling Point</p>
             <p className="text-[10px]">Sikar, Rajasthan | 9876543210</p>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="font-bold">TOKEN NO:</span>
              <span className="text-sm font-black">{(printingFilling || downloadingFilling)?.tokenNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>DATE:</span>
              <span className="font-bold">{(printingFilling || downloadingFilling) && format(new Date((printingFilling || downloadingFilling)!.date), 'dd/MM/yyyy HH:mm')}</span>
            </div>
            <div className="flex justify-between">
              <span>PARTY:</span>
              <span className="font-bold uppercase">{(printingFilling || downloadingFilling)?.partyName}</span>
            </div>
            <div className="flex justify-between">
              <span>VEHICLE:</span>
              <span className="font-bold uppercase">{(printingFilling || downloadingFilling)?.vehicleNumber || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span>TYPE:</span>
              <span className="font-bold uppercase">{(printingFilling || downloadingFilling)?.type === 'Inward' ? 'Filling Others' : 'Self Filling'}</span>
            </div>
            <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 text-sm">
              <span className="font-bold uppercase">TOTAL AMT:</span>
              <span className="font-black">₹{(printingFilling || downloadingFilling)?.totalAmount}</span>
            </div>
          </div>

          {/* CIRCULAR STAMP */}
          <div className="flex justify-center my-8">
            <div className="relative w-28 h-28 rounded-full border-[5px] border-blue-700/40 flex items-center justify-center p-3 text-center">
              <div className="absolute inset-0 rounded-full border border-blue-700/20 m-1" />
              <div className="text-[9px] font-black uppercase text-blue-800 tracking-tighter leading-[1.1] rotate-[-5deg]">
                Tanker<span className="relative">Wala<span className="absolute top-full left-0 text-[6px] text-slate-500 font-medium whitespace-nowrap normal-case tracking-normal mt-0.5">Powered by Rajhans</span></span><br/>
                <span className="text-[14px] mt-2 block">TOKEN</span>
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-black text-blue-900/10 -rotate-12 select-none pointer-events-none">
                #{(printingFilling || downloadingFilling)?.tokenNumber.split('-')[1]}
              </div>
            </div>
          </div>

          <div className="text-center pt-4 border-t-2 border-dashed border-slate-300">
            <p className="text-[10px] font-bold">Authorized Filling Token</p>
            <p className="text-[9px] mt-1 italic text-slate-400">Computer Generated Receipt</p>
          </div>
        </div>
      </div>

      <ConfirmationModal 
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Delete Filling Record?"
        message="This will remove the filling record. Accounting entries will persist in ledger."
      />

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
