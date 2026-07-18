import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, where, orderBy, runTransaction, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { Customer, Bill, LedgerEntry, Account } from '../types';
import { Plus, Search, Building2, Phone, MapPin, IndianRupee, Download, UserPlus, Users, Clock, ArrowLeft, Calendar, CheckCircle2, XCircle, Printer, Edit2, Trash2, MessageSquare, Minus, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../constants';
import { generatePDF, addSwanWatermarkToPDF } from '../lib/pdfUtils';
import { printThermalReceipt } from '../lib/printUtils';
import { openWhatsAppDirect } from '../lib/whatsappUtils';
import { ThermalInvoice } from './ThermalInvoice';
import { ConfirmationModal } from './ConfirmationModal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { ledgerAutomation } from '../services/ledgerAutomation';

const parseFirestoreDate = (val: any): Date => {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
};

export function CustomerManagement({ franchiseId, isSuperAdmin }: { franchiseId?: string, isSuperAdmin?: boolean }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    mobile: '',
    address: '',
    alternateMobile: '',
    vehicleNumber: '',
    notes: '',
    pin: ''
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quickReceiptCustomer, setQuickReceiptCustomer] = useState<Customer | null>(null);
  const [isSavingQuickReceipt, setIsSavingQuickReceipt] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    amount: '',
    paymentMethod: 'Cash' as 'Cash' | 'Bank',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);
  const [shareLedgerCustomer, setShareLedgerCustomer] = useState<Customer | null>(null);
  
  const [validationError, setValidationError] = useState<{ name?: string; mobile?: string }>({});
  const [showOnlyPendingDues, setShowOnlyPendingDues] = useState(false);

  // Real-time duplicate checking for New Customer
  useEffect(() => {
    if (!isAdding || !newCustomer.name) {
      setValidationError(prev => ({ ...prev, name: undefined }));
      return;
    }
    
    const checkName = async () => {
      const q = query(collection(db, 'customers'), where('name', '==', newCustomer.name.trim()));
      const snap = await getDocs(q);
      
      const nameExists = !snap.empty;
      const mobileExists = snap.docs.some(doc => doc.data().mobile === newCustomer.mobile);

      if (nameExists && !mobileExists && newCustomer.mobile) {
        setValidationError(prev => ({ ...prev, name: 'name already exist try different name' }));
      } else if (nameExists && mobileExists) {
        setValidationError(prev => ({ ...prev, name: 'customer already exist' }));
      } else {
        setValidationError(prev => ({ ...prev, name: undefined }));
      }
    };

    const timer = setTimeout(checkName, 500);
    return () => clearTimeout(timer);
  }, [newCustomer.name, newCustomer.mobile, isAdding]);

  // Real-time duplicate checking for Editing Customer
  useEffect(() => {
    if (!editingCustomer || !editingCustomer.name) {
      setValidationError(prev => ({ ...prev, name: undefined }));
      return;
    }
    
    const checkName = async () => {
      const q = query(collection(db, 'customers'), where('name', '==', editingCustomer.name.trim()));
      const snap = await getDocs(q);
      
      const otherSameName = snap.docs.filter(doc => doc.id !== editingCustomer.id);
      const nameExists = otherSameName.length > 0;
      const mobileExists = otherSameName.some(doc => doc.data().mobile === editingCustomer.mobile);

      if (nameExists && !mobileExists && editingCustomer.mobile) {
        setValidationError(prev => ({ ...prev, name: 'name already exist try different name' }));
      } else if (nameExists && mobileExists) {
        setValidationError(prev => ({ ...prev, name: 'customer already exist' }));
      } else {
        setValidationError(prev => ({ ...prev, name: undefined }));
      }
    };

    const timer = setTimeout(checkName, 500);
    return () => clearTimeout(timer);
  }, [editingCustomer?.name, editingCustomer?.mobile]);

  useEffect(() => {
    let q = query(collection(db, 'customers'), orderBy('name'));
    if (franchiseId) {
      q = query(collection(db, 'customers'), where('franchiseId', '==', franchiseId), orderBy('name'));
    }
    const unsubCustomers = onSnapshot(q, 
      (snapshot) => {
        const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        if (!searchTerm) {
          setCustomers(all);
        } else {
          const term = searchTerm.toLowerCase();
          const filtered = all.filter(c => 
            c.name.toLowerCase().includes(term) || 
            c.mobile.includes(term) ||
            (c.secondaryMobiles?.some(m => m.includes(term)) || false)
          );
          setCustomers(filtered);
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'customers')
    );

    let qAccounts = query(collection(db, 'accounts'));
    if (!isSuperAdmin && franchiseId) {
      qAccounts = query(collection(db, 'accounts'), where('franchiseId', '==', franchiseId));
    }
    const unsubAccounts = onSnapshot(qAccounts, 
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
      (error) => handleFirestoreError(error, OperationType.LIST, 'accounts-customers')
    );

    return () => {
      unsubCustomers();
      unsubAccounts();
    };
  }, [searchTerm, franchiseId, isSuperAdmin]);

  const customerBalancesCombined = useMemo(() => {
    return customers.map(customer => {
      const customerAccount = accounts.find(acc => acc.customerId === customer.id || acc.name === customer.name);
      const currentPending = customerAccount ? (customerAccount.balanceType === 'Dr' ? customerAccount.currentBalance : -customerAccount.currentBalance) : 0;
      return {
        customer,
        currentPending,
      };
    });
  }, [customers, accounts]);

  const displayedCustomers = useMemo(() => {
    if (showOnlyPendingDues) {
      return customerBalancesCombined.filter(item => item.currentPending > 0);
    }
    return customerBalancesCombined;
  }, [customerBalancesCombined, showOnlyPendingDues]);

  const totalDuesAmount = useMemo(() => {
    return displayedCustomers.reduce((sum, item) => sum + Math.max(0, item.currentPending), 0);
  }, [displayedCustomers]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name || !newCustomer.mobile) return;
    
    try {
      // Check for duplicate mobile or name
      let qMobile = query(collection(db, 'customers'), where('mobile', '==', newCustomer.mobile));
      let qName = query(collection(db, 'customers'), where('name', '==', newCustomer.name.trim()));
      
      if (!isSuperAdmin && franchiseId) {
        qMobile = query(collection(db, 'customers'), where('franchiseId', '==', franchiseId), where('mobile', '==', newCustomer.mobile));
        qName = query(collection(db, 'customers'), where('franchiseId', '==', franchiseId), where('name', '==', newCustomer.name.trim()));
      }
      
      const [mobileSnap, nameSnap] = await Promise.all([getDocs(qMobile), getDocs(qName)]);
      
      if (!mobileSnap.empty) {
        alert('A customer with this mobile number already exists!');
        return;
      }

      if (!nameSnap.empty) {
        alert('A customer with this name already exists!');
        return;
      }

      const docRef = await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        franchiseId: franchiseId || null,
        name: newCustomer.name.trim(),
        pin: newCustomer.pin || Math.floor(1000 + Math.random() * 9000).toString(),
        pendingAmount: 0,
        createdAt: serverTimestamp()
      });

      setIsAdding(false);
      setNewCustomer({ name: '', mobile: '', address: '', alternateMobile: '', vehicleNumber: '', notes: '', pin: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'customers');
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !editingCustomer.name || !editingCustomer.mobile) return;
    
    try {
      // Check for duplicate mobile or name (excluding self)
      const qMobile = query(collection(db, 'customers'), where('mobile', '==', editingCustomer.mobile));
      const qName = query(collection(db, 'customers'), where('name', '==', editingCustomer.name.trim()));
      
      const [mobileSnap, nameSnap] = await Promise.all([getDocs(qMobile), getDocs(qName)]);
      
      const mobileDuplicate = mobileSnap.docs.find(doc => doc.id !== editingCustomer.id);
      const nameDuplicate = nameSnap.docs.find(doc => doc.id !== editingCustomer.id);
      
      if (mobileDuplicate) {
        alert('Another customer with this mobile number already exists!');
        return;
      }

      if (nameDuplicate) {
        alert('Another customer with this name already exists!');
        return;
      }

      const { id, ...updateData } = editingCustomer;
      await updateDoc(doc(db, 'customers', id!), {
        ...updateData,
        name: editingCustomer.name.trim(),
        updatedAt: serverTimestamp()
      } as any);
      setEditingCustomer(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `customers/${editingCustomer.id}`);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'customers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
    }
  };

  const exportPDF = (onlyPending: boolean = false) => {
    const items = customers.map(c => {
      const customerAccount = accounts.find(acc => acc.customerId === c.id || acc.name === c.name);
      const currentPending = customerAccount ? (customerAccount.balanceType === 'Dr' ? customerAccount.currentBalance : -customerAccount.currentBalance) : 0;
      return { customer: c, pending: currentPending };
    });
    
    const listToExport = onlyPending ? items.filter(i => i.pending > 0) : items;
    
    if (!listToExport || listToExport.length === 0) {
      alert(onlyPending ? 'No customers with pending amount found.' : 'No customers to export.');
      return;
    }
    
    let doc: any;
    try {
      doc = new jsPDF();
    } catch (e) {
      console.error('jsPDF failed:', e instanceof Error ? e.message : String(e));
      alert('PDF generation is not supported in this browser.');
      return;
    }
    const title = onlyPending ? 'TankerWala Powered by Rajhans - Pending Dues List' : 'TankerWala Powered by Rajhans - Customer List';
    doc.text(title, 14, 15);
    
    const pdfFormatCurrency = (val: number) => `Rs. ${val.toLocaleString('en-IN')}`;
    
    const tableData = listToExport.map(item => [
      item.customer.name,
      `+91 ${item.customer.mobile}`,
      item.customer.address || '-',
      pdfFormatCurrency(item.pending)
    ]);

    // Append Grand Total Row at the bottom of the table
    const grandDuesTotal = listToExport.reduce((sum, item) => sum + item.pending, 0);
    tableData.push([
      'Grand Total',
      '',
      '',
      pdfFormatCurrency(grandDuesTotal)
    ]);

    autoTable(doc, {
      head: [['Name', 'Mobile', 'Address', 'Pending Amount']],
      body: tableData,
      startY: 25,
      theme: 'grid',
      headStyles: { fillColor: onlyPending ? [220, 38, 38] : [37, 99, 235] },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold' }
      },
      styles: { fontSize: 9 }
    });

    const fileName = onlyPending ? `TankerWala_Pending_Dues_${format(new Date(), 'dd_MMM')}.pdf` : 'TankerWala_Steel_Water_Customer_List.pdf';
    addSwanWatermarkToPDF(doc);
    doc.save(fileName);
  };

  const handleQuickReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickReceiptCustomer || !receiptForm.amount) return;

    setIsSavingQuickReceipt(true);
    try {
      const amount = Number(receiptForm.amount);
      const paymentAccName = receiptForm.paymentMethod === 'Cash' ? 'Cash' : 'Bank Account';
      
      let customerAccount = accounts.find(acc => acc.customerId === quickReceiptCustomer.id);
      if (!customerAccount) {
        customerAccount = accounts.find(acc => acc.name === quickReceiptCustomer.name);
      }

      const paymentAccount = accounts.find(acc => acc.name === paymentAccName);
      if (!paymentAccount) throw new Error(`${paymentAccName} account not found`);

      const entryDate = new Date(receiptForm.date);
      const now = new Date();
      entryDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      await runTransaction(db, async (transaction) => {
        const payAccRef = doc(db, 'accounts', paymentAccount.id);
        let custAccRef: any;
        let isCreatingNewAccount = !customerAccount;

        if (customerAccount) {
          custAccRef = doc(db, 'accounts', customerAccount.id);
        } else {
          custAccRef = doc(collection(db, 'accounts'));
        }

        const payDoc = await transaction.get(payAccRef);
        let custDocSnapshot = null;
        if (!isCreatingNewAccount) {
          custDocSnapshot = await transaction.get(custAccRef);
        }

        const payBal = payDoc.data()?.currentBalance || 0;

        let custAccountToUseId = custAccRef.id;
        let custAccountToUseName = isCreatingNewAccount ? quickReceiptCustomer.name : customerAccount!.name;

        if (isCreatingNewAccount) {
          const newAccData = {
            name: quickReceiptCustomer.name,
            group: 'Sundry Debtors',
            openingBalance: 0,
            currentBalance: amount, // For receipt, Dr means we owe them or they paid? Wait.
            // Sundry Debtors are Dr. Receipt means we Credit them.
            // So if they pay ₹100, their balance goes from 0 back to -100 (Cr).
            // Actually, usually users have Dr balance. 
            balanceType: 'Dr',
            customerId: quickReceiptCustomer.id,
            createdAt: serverTimestamp()
          };
          transaction.set(custAccRef, {
            ...newAccData,
            currentBalance: -amount // Correct for first receipt
          });
        } else {
          const curCustBal = custDocSnapshot?.data()?.currentBalance || 0;
          const balType = custDocSnapshot?.data()?.balanceType || 'Dr';
          transaction.update(custAccRef, { 
            currentBalance: curCustBal + (balType === 'Cr' ? amount : -amount) 
          });
        }

        transaction.update(payAccRef, { currentBalance: payBal + amount });

        const vchRef = doc(collection(db, 'vouchers'));
        transaction.set(vchRef, {
          date: entryDate,
          franchiseId: franchiseId || null,
          type: 'Receipt',
          voucherNumber: `CUST-R-${Math.floor(Date.now()/1000)}`,
          items: [
            { accountId: paymentAccount.id, accountName: paymentAccount.name, amount, type: 'Dr' },
            { accountId: custAccountToUseId, accountName: custAccountToUseName, amount, type: 'Cr' }
          ],
          narration: receiptForm.description.trim() || `Quick receipt from ${quickReceiptCustomer.name} via ${receiptForm.paymentMethod}`,
          totalAmount: amount,
          createdAt: serverTimestamp()
        });
      });

      setQuickReceiptCustomer(null);
      setReceiptForm({
        amount: '',
        paymentMethod: 'Cash',
        date: new Date().toISOString().split('T')[0],
        description: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'customer-quick-receipt');
    } finally {
      setIsSavingQuickReceipt(false);
    }
  };

  const handleStartPress = (customer: Customer) => {
    const timer = setTimeout(() => {
      setQuickReceiptCustomer(customer);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 1000);
    setLongPressTimer(timer);
  };

  const handleEndPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const shareCurrentBalance = (c: Customer) => {
    const phone = c.mobile.startsWith('91') ? c.mobile : `91${c.mobile}`;
    const message = `*Account Summary - TankerWala Powered by Rajhans* 🚛\n\n` +
      `Dear ${c.name},\n` +
      `Your current account status as of ${format(new Date(), 'dd MMM yyyy')}:\n\n` +
      `*Total Outstanding Balance:* ₹${c.pendingAmount}\n\n` +
      `Please settle the dues at your earliest convenience. Thank you!`;
    
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="pb-24 max-w-4xl mx-auto">
      <div className="p-4 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Customers</h1>
            <p className="text-slate-500 text-sm">{customers?.length || 0} registered clients</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => exportPDF(true)}
              className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center hover:bg-red-100 transition-colors border border-red-100"
              title="Download Pending Dues Only"
            >
              <Clock size={20} />
            </button>
            <button 
              onClick={() => exportPDF(false)}
              className="w-12 h-12 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center hover:bg-slate-200 transition-colors"
              title="Download All Customers"
            >
              <Download size={20} />
            </button>
            <button 
              onClick={() => setIsAdding(true)}
              className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all hover:scale-105 active:scale-95"
            >
              <UserPlus size={24} />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-stretch justify-between bg-slate-50 border border-slate-100 p-3 rounded-2xl">
          {/* Tabs for All vs Dues */}
          <div className="flex bg-slate-200/60 p-1 rounded-xl">
            <button
              onClick={() => setShowOnlyPendingDues(false)}
              className={`flex-1 sm:flex-initial px-5 py-2 text-xs font-bold rounded-lg transition-all ${
                !showOnlyPendingDues 
                  ? 'bg-white text-slate-800 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              👥 All Clients
            </button>
            <button
              onClick={() => setShowOnlyPendingDues(true)}
              className={`flex-1 sm:flex-initial px-5 py-2 text-xs font-bold rounded-lg transition-all ${
                showOnlyPendingDues 
                  ? 'bg-red-600 text-white shadow-md' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ⏳ Pending Dues Only
            </button>
          </div>

          {/* Quick search input */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by name or phone..."
              className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl pl-11 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Customer Dues Summary Banner */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-[1.8rem] p-6 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
              {showOnlyPendingDues ? '⚠️ Filtered Pending Accounts' : '📊 Total Customer Portfolio'}
            </span>
            <h2 className="text-xl font-bold tracking-tight">
              {showOnlyPendingDues ? 'Pending Dues Summary' : 'Customer Account Overview'}
            </h2>
          </div>
          <div className="flex gap-4 sm:border-l sm:border-slate-700/65 sm:pl-6">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Clients Shown</div>
              <div className="text-lg font-black text-white">{displayedCustomers.length}</div>
            </div>
            <div>
              <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Total Outstanding</div>
              <div className="text-xl font-black text-red-400">₹{totalDuesAmount.toLocaleString('en-IN')}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {displayedCustomers.map(({ customer, currentPending }) => {
            return (
              <motion.div
                key={customer.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onMouseDown={() => handleStartPress(customer)}
                onMouseUp={handleEndPress}
                onMouseLeave={handleEndPress}
                onTouchStart={() => handleStartPress(customer)}
                onTouchEnd={handleEndPress}
                onClick={() => setSelectedHistoryCustomer(customer)}
                className="material-card group relative overflow-hidden hover:border-blue-100 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 cursor-pointer active:scale-[0.98]"
              >
                {longPressTimer && quickReceiptCustomer?.id !== customer.id && (
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1, ease: "linear" }}
                    className="absolute top-0 left-0 h-1 bg-blue-500 z-10"
                  />
                )}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-slate-800">{customer.name}</h3>
                      <div className="flex gap-1.5 ml-1">
                        <a 
                          href={`tel:${customer.mobile}`}
                          className="p-1 px-2.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-all"
                          onClick={(e) => e.stopPropagation()}
                          title="Call Customer"
                        >
                          <Phone size={14} />
                        </a>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            shareCurrentBalance({ ...customer, pendingAmount: currentPending });
                          }}
                          className="p-1 px-2.5 bg-[#25D366] text-white hover:bg-green-600 rounded-lg transition-all"
                          title="Direct Balance Hisab"
                        >
                          <IndianRupee size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setShareLedgerCustomer(customer);
                          }}
                          className="p-1 px-2.5 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-all"
                          title="Detailed Ledger PDF"
                        >
                          <MessageSquare size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (customer.pin) alert(`Login PIN for ${customer.name} is: ${customer.pin}`);
                            else alert("PIN not set for this customer.");
                          }}
                          className="p-1 px-2.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all"
                          title="Show PIN"
                        >
                          <Lock size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCustomer(customer);
                          }}
                          className="p-1 px-2.5 bg-slate-100 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit Customer"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (customer.id) setDeleteConfirm({ id: customer.id, name: customer.name });
                          }}
                          className="p-1 px-2.5 bg-slate-100 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete Customer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <a 
                      href={`tel:${customer.mobile}`}
                      className="flex items-center gap-2 text-blue-600 font-medium text-sm mt-1 hover:underline"
                    >
                      <Phone size={14} />
                      <span>+91 {customer.mobile}</span>
                    </a>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Total Pending</div>
                    <div className={`text-lg font-display font-bold ${currentPending > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {formatCurrency(currentPending)}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-2 text-slate-500 text-sm bg-slate-50 p-3 rounded-2xl">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                  <p className="leading-relaxed">{customer.address || "No address provided"}</p>
                </div>

                {(customer.vehicleNumber || customer.notes) && (
                  <div className="mt-4 pt-4 border-t border-slate-50 flex flex-wrap gap-2">
                    {customer.vehicleNumber && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold bg-slate-100 px-2.5 py-1 rounded-full text-slate-600">
                        <Building2 size={12} />
                        {customer.vehicleNumber}
                      </div>
                    )}
                    {customer.notes && (
                      <div className="text-[10px] font-medium text-slate-400 italic">
                        Note: {customer.notes}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
          
          {customers?.length === 0 && (
            <div className="md:col-span-2 py-20 text-center flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                <Users size={40} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">No customers found</h3>
                <p className="text-slate-500 text-sm">Add your first customer to start billing.</p>
              </div>
              <button 
                onClick={() => setIsAdding(true)}
                className="material-btn material-btn-primary"
              >
                <Plus size={20} /> Add Customer
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedHistoryCustomer && (
          <CustomerHistoryModal 
            customer={selectedHistoryCustomer} 
            franchiseId={franchiseId}
            isSuperAdmin={isSuperAdmin}
            onClose={() => setSelectedHistoryCustomer(null)}
            onShareLedger={setShareLedgerCustomer}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: "100%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%", scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 overflow-y-auto max-h-[90vh] shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-display font-bold text-slate-900">New Customer</h2>
                  <p className="text-sm text-slate-500">Register a new client for billing</p>
                </div>
                <button 
                  onClick={() => setIsAdding(false)} 
                  className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <form onSubmit={handleAddCustomer} className="flex flex-col gap-5">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Full Name *</label>
                  <input
                    required
                    className="material-input h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={newCustomer.name}
                    onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                    placeholder="e.g. Rahul Sharma"
                  />
                  {validationError.name && (
                    <p className="text-red-500 text-[10px] font-bold mt-1 ml-1">{validationError.name}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Mobile Number *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono">+91</span>
                    <input
                      required
                      type="tel"
                      pattern="[0-9]{10}"
                      className="material-input pl-16 h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                      value={newCustomer.mobile}
                      onChange={e => setNewCustomer({...newCustomer, mobile: e.target.value})}
                      placeholder="10 digit number"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Delivery Address</label>
                  <textarea
                    className="material-input min-h-[100px] py-4 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={newCustomer.address}
                    onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                    placeholder="Street name, Landmark, Building no..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Alt. Mobile</label>
                    <input
                      className="material-input h-14 bg-slate-50"
                      value={newCustomer.alternateMobile}
                      onChange={e => setNewCustomer({...newCustomer, alternateMobile: e.target.value})}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Vehicle No.</label>
                    <input
                      className="material-input h-14 bg-slate-50"
                      value={newCustomer.vehicleNumber}
                      onChange={e => setNewCustomer({...newCustomer, vehicleNumber: e.target.value})}
                      placeholder="e.g. UP14..."
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Login PIN (4-digit)</label>
                  <input
                    maxLength={4}
                    className="material-input h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={newCustomer.pin || ''}
                    onChange={e => setNewCustomer({...newCustomer, pin: e.target.value.replace(/\D/g, '')})}
                    placeholder="Auto-generated if empty"
                  />
                </div>
                
                <button type="submit" className="material-btn material-btn-primary h-16 text-lg mt-4 shadow-blue-500/20">
                  Register Customer
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: "100%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%", scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 overflow-y-auto max-h-[90vh] shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-display font-bold text-slate-900">Edit Customer</h2>
                  <p className="text-sm text-slate-500">Update customer information</p>
                </div>
                <button 
                  onClick={() => setEditingCustomer(null)} 
                  className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <form onSubmit={handleUpdateCustomer} className="flex flex-col gap-5">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Full Name *</label>
                  <input
                    required
                    className="material-input h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={editingCustomer.name}
                    onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})}
                    placeholder="e.g. Rahul Sharma"
                  />
                  {validationError.name && (
                    <p className="text-red-500 text-[10px] font-bold mt-1 ml-1">{validationError.name}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Mobile Number *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono">+91</span>
                    <input
                      required
                      type="tel"
                      pattern="[0-9]{10}"
                      className="material-input pl-16 h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                      value={editingCustomer.mobile}
                      onChange={e => setEditingCustomer({...editingCustomer, mobile: e.target.value})}
                      placeholder="10 digit number"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Delivery Address</label>
                  <textarea
                    className="material-input min-h-[100px] py-4 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={editingCustomer.address || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, address: e.target.value})}
                    placeholder="Street name, Landmark, Building no..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Alt. Mobile</label>
                    <input
                      className="material-input h-14 bg-slate-50"
                      value={editingCustomer.alternateMobile || ''}
                      onChange={e => setEditingCustomer({...editingCustomer, alternateMobile: e.target.value})}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Vehicle No.</label>
                    <input
                      className="material-input h-14 bg-slate-50"
                      value={editingCustomer.vehicleNumber || ''}
                      onChange={e => setEditingCustomer({...editingCustomer, vehicleNumber: e.target.value})}
                      placeholder="e.g. UP14..."
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Login PIN (4-digit)</label>
                  <input
                    maxLength={4}
                    className="material-input h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={(editingCustomer as any).pin || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, pin: e.target.value.replace(/\D/g, '')} as any)}
                    placeholder="4-digit PIN"
                  />
                </div>
                
                <button type="submit" className="material-btn material-btn-primary h-16 text-lg mt-4 shadow-blue-500/20">
                  Update Details
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {quickReceiptCustomer && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setQuickReceiptCustomer(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center">
                    <Plus size={28} />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-bold text-slate-900 leading-tight">
                      Receipt - {quickReceiptCustomer.name}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Quick Customer Receipt
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setQuickReceiptCustomer(null)}
                  className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <form onSubmit={handleQuickReceiptSubmit} className="p-8 pt-6 flex flex-col gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block ml-1">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Cash', 'Bank'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setReceiptForm({ ...receiptForm, paymentMethod: m })}
                        className={`h-12 rounded-xl font-bold text-sm transition-all border-2 ${
                          receiptForm.paymentMethod === m 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                            : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block ml-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-slate-300">₹</span>
                      <input
                        required
                        type="number"
                        placeholder="0"
                        value={receiptForm.amount}
                        onChange={e => setReceiptForm({ ...receiptForm, amount: e.target.value })}
                        className="w-full h-14 bg-slate-50 rounded-[1.25rem] pl-8 pr-4 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-black text-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block ml-1">Date</label>
                    <input
                      type="date"
                      value={receiptForm.date}
                      onChange={e => setReceiptForm({ ...receiptForm, date: e.target.value })}
                      className="w-full h-14 bg-slate-50 rounded-[1.25rem] px-4 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block ml-1">Description</label>
                  <input
                    placeholder="Regular Payment / Advance..."
                    value={receiptForm.description}
                    onChange={e => setReceiptForm({ ...receiptForm, description: e.target.value })}
                    className="w-full h-14 bg-slate-50 rounded-[1.25rem] px-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingQuickReceipt}
                  className="w-full h-16 bg-blue-600 text-white rounded-[1.25rem] font-display font-black text-lg shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-2"
                >
                  {isSavingQuickReceipt ? (
                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={24} />
                      Confirm Receipt
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteCustomer(deleteConfirm.id)}
        title="Delete Customer?"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? Their trip tokens and previous ledger entries will remain in history.`}
      />

      <AnimatePresence>
        {shareLedgerCustomer && (
          <WhatsAppLedgerModal 
            customer={shareLedgerCustomer}
            franchiseId={franchiseId}
            isSuperAdmin={isSuperAdmin}
            onClose={() => setShareLedgerCustomer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function WhatsAppLedgerModal({ customer, onClose, franchiseId, isSuperAdmin }: { 
  customer: Customer, 
  onClose: () => void,
  franchiseId?: string,
  isSuperAdmin?: boolean 
}) {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateShare = async () => {
    setIsGenerating(true);
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // 1. Fetch Delivered Bills
      let billsQ = query(
        collection(db, 'bills'),
        where('customerId', '==', customer.id),
        where('status', '==', 'Delivered'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      if (!isSuperAdmin && franchiseId) {
        billsQ = query(
          collection(db, 'bills'),
          where('franchiseId', '==', franchiseId),
          where('customerId', '==', customer.id),
          where('status', '==', 'Delivered'),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        );
      }
      const billsSnap = await getDocs(billsQ);
      const bills = billsSnap.docs.map(d => ({ ...d.data(), id: d.id, sortDate: parseFirestoreDate(d.data().date) }));

      // 2. Fetch Ledger Entries
      let ledgerQ = query(
        collection(db, 'ledger'),
        where('partyId', '==', customer.id),
        where('date', '>=', start.toISOString()),
        where('date', '<=', end.toISOString())
      );
      if (!isSuperAdmin && franchiseId) {
        ledgerQ = query(
          collection(db, 'ledger'),
          where('franchiseId', '==', franchiseId),
          where('partyId', '==', customer.id),
          where('date', '>=', start.toISOString()),
          where('date', '<=', end.toISOString())
        );
      }
      const ledgerSnap = await getDocs(ledgerQ);
      const payments = ledgerSnap.docs.map(d => ({ ...d.data(), id: d.id, sortDate: parseFirestoreDate(d.data().date) }));

      // Combined and sorted list
      const allEntries = [...bills, ...payments].sort((a: any, b: any) => a.sortDate.getTime() - b.sortDate.getTime());

      if (allEntries.length === 0) {
        alert('No transactions found in this date range.');
        setIsGenerating(false);
        return;
      }

    let doc: any;
    try {
      doc = new jsPDF();
    } catch (e) {
      console.error('jsPDF constructor failed:', e instanceof Error ? e.message : String(e));
      alert('PDF generation is not supported in this browser environment.');
      setIsGenerating(false);
      return;
    }
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(30, 41, 59); // Slate 800
      doc.text('TankerWala Powered by Rajhans - Customer Ledger', 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text(`Period: ${format(start, 'dd MMM yyyy')} to ${format(end, 'dd MMM yyyy')}`, 14, 28);
      
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text(`Customer: ${customer.name}`, 14, 40);
      doc.text(`Mobile: +91 ${customer.mobile}`, 14, 46);
      if (customer.address) doc.text(`Address: ${customer.address}`, 14, 52);

      let runningBalance = 0;
      const pdfFormatCurrency = (val: number) => `Rs. ${val.toLocaleString('en-IN')}`;

      const tableRows = allEntries.map((entry: any) => {
        const isBill = !!entry.billNumber;
        const date = format(entry.sortDate, 'dd/MM/yyyy');
        const desc = isBill ? `Trip Bill #${entry.billNumber} (${entry.tankerSize})` : entry.description || 'Manual Payment';
        const debit = isBill ? (entry.grandTotal || 0) : 0;
        const credit = isBill ? 0 : (entry.amount || 0);
        runningBalance += debit - credit;

        return [
          date,
          desc,
          debit > 0 ? pdfFormatCurrency(debit) : '-',
          credit > 0 ? pdfFormatCurrency(credit) : '-',
          pdfFormatCurrency(runningBalance)
        ];
      });

      autoTable(doc, {
        startY: 60,
        head: [['Date', 'Description', 'Bill Amount', 'Payment Recvd', 'Balance']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 25 }, // Date
          1: { cellWidth: 'auto' }, // Description
          2: { halign: 'right', cellWidth: 35 }, // Token Amount
          3: { halign: 'right', cellWidth: 35 }, // Payment Recvd
          4: { halign: 'right', fontStyle: 'bold', cellWidth: 35 } // Balance
        },
        styles: { fontSize: 8, overflow: 'linebreak' }, // Smaller font for better fit
        margin: { left: 14, right: 14 }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total Outstanding: ${pdfFormatCurrency(runningBalance)}`, 196, finalY, { align: 'right' });

      // Save and Share
      addSwanWatermarkToPDF(doc);
      const pdfBlob = doc.output('blob');
      const fileName = `Hisab_${customer.name}_${format(new Date(), 'dd_MMM')}.pdf`;
      let file: any;
      // Handle file constructor safely with double guards for 'Illegal constructor'
      try {
        if (typeof window.File === 'function') {
          try {
            file = new File([pdfBlob], fileName, { type: 'application/pdf' });
          } catch (fileConstructErr) {
            console.warn('File constructor failed, falling back to blob');
            file = pdfBlob;
          }
        } else {
          file = pdfBlob;
        }
      } catch (e) {
        file = pdfBlob;
      }

      let canShareFile = false;
      try {
        if (navigator.canShare) {
          canShareFile = navigator.canShare({ files: [file] });
        }
      } catch (canShareErr) {
        console.warn('canShare check failed', canShareErr instanceof Error ? canShareErr.message : String(canShareErr));
        canShareFile = false;
      }

      if (navigator.share && canShareFile) {
        await navigator.share({
          files: [file],
          title: `Hisab - ${customer.name}`,
          text: `Dear ${customer.name}, please find attached your ledger (hisab) from TankerWala Powered by Rajhans. Total Outstanding: ₹${runningBalance}.`
        });
      } else {
        // Fallback: Download and WhatsApp text
        doc.save(fileName);
        const phone = customer.mobile.startsWith('91') ? customer.mobile : `91${customer.mobile}`;
        const message = `*Hisab - TankerWala Powered by Rajhans* 🚛\n\n` +
          `Dear ${customer.name},\n` +
          `Your ledger PDF has been downloaded. Please check and share it here.\n\n` +
          `*Period:* ${format(start, 'dd MMM')} to ${format(end, 'dd MMM')}\n` +
          `*Total Outstanding:* ₹${runningBalance}\n\n` +
          `Thank you!`;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
      }
      
      onClose();
    } catch (error) {
      console.error('Error generating ledger:', error instanceof Error ? error.message : String(error));
      alert('Failed to generate ledger. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <XCircle size={24} />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={32} />
          </div>
          <h3 className="text-2xl font-display font-bold text-slate-900">Share Hisab</h3>
          <p className="text-slate-500 text-sm">Select dates for {customer.name}'s ledger</p>
        </div>

        <div className="space-y-4 mb-8">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Start Date</label>
            <input 
              type="date"
              className="material-input h-14 bg-slate-50"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">End Date</label>
            <input 
              type="date"
              className="material-input h-14 bg-slate-50"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleGenerateShare}
          disabled={isGenerating}
          className="w-full h-16 bg-green-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-200 hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50"
        >
          {isGenerating ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <><MessageSquare size={20} /> Share on WhatsApp</>
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}

function CustomerHistoryModal({ 
  customer, 
  onClose, 
  onShareLedger,
  franchiseId,
  isSuperAdmin 
}: { 
  customer: Customer, 
  onClose: () => void, 
  onShareLedger: (c: Customer) => void,
  franchiseId?: string,
  isSuperAdmin?: boolean 
}) {
  const [selectedBillForPrint, setSelectedBillForPrint] = useState<Bill | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [bills, setBills] = useState<Bill[]>([]);

  useEffect(() => {
    let q = query(
      collection(db, 'bills'), 
      where('customerId', '==', customer.id),
      where('status', '==', 'Delivered'),
      orderBy('createdAt', 'desc')
    );
    if (!isSuperAdmin && franchiseId) {
      q = query(
        collection(db, 'bills'),
        where('franchiseId', '==', franchiseId),
        where('customerId', '==', customer.id),
        where('status', '==', 'Delivered'),
        orderBy('createdAt', 'desc')
      );
    }
    return onSnapshot(q, 
      (snapshot) => setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill))),
      (error) => handleFirestoreError(error, OperationType.LIST, `bills?customerId=${customer.id}`)
    );
  }, [customer.id, franchiseId, isSuperAdmin]);

  const handlePrint = async () => {
    if (printRef.current) {
      const currentBill = selectedBillForPrint;
      try {
        await printThermalReceipt(printRef.current);
        setSelectedBillForPrint(null);
      } catch (err: any) {
        console.warn("Direct Printing failed, falling back to PDF:", err?.message || String(err));
        try {
          const fileName = `Bill_${selectedBillForPrint?.billNumber || 'Order'}`;
          await generatePDF(printRef.current, fileName);
          setSelectedBillForPrint(null);
        } catch (pdfErr: any) {
          console.error("PDF Export Error:", pdfErr?.message || String(pdfErr));
          alert("Failed to print. Try opening the application in a new tab.");
        }
      }

      // Automatically trigger prefilled WhatsApp to the customer on print click
      if (currentBill) {
        openWhatsAppDirect(currentBill);
      }
    }
  };

  const [payingAmount, setPayingAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Cash');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const handleRecordPayment = async () => {
    const amount = parseFloat(payingAmount);
    if (!amount || amount <= 0) return;
    
    setIsProcessingPayment(true);
    try {
      // Use Automation to post to professional ledger
      await ledgerAutomation.postPaymentToLedger(
        { 
          id: 'manual', 
          billNumber: 'Manual Pay', 
          customerName: customer.name 
        }, 
        amount, 
        paymentMode
      );

      // Update pendingAmount for local UI consistency
      await updateDoc(doc(db, 'customers', customer.id!), {
        pendingAmount: Math.max(0, (customer.pendingAmount || 0) - amount),
        updatedAt: serverTimestamp()
      });

      setPayingAmount('');
      alert('Payment recorded and synced with Ledger!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transaction');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center p-4"
      >
        <motion.div
          initial={{ y: "100%", scale: 0.95 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: "100%", scale: 0.95 }}
          className="bg-white w-full max-w-2xl rounded-t-[2.5rem] sm:rounded-[2.5rem] flex flex-col max-h-[90vh] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-8 border-b border-slate-100 bg-white sticky top-0 z-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <button 
                  onClick={onClose}
                  className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors mb-2 text-sm font-bold"
                >
                  <ArrowLeft size={16} /> Back to list
                </button>
                <h2 className="text-2xl font-display font-bold text-slate-900">{customer.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-sm text-slate-500 font-mono tracking-tighter opacity-80">+91 {customer.mobile}</p>
                  <button 
                    onClick={() => onShareLedger(customer)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-600 rounded-lg text-[10px] font-bold hover:bg-green-100 transition-all"
                  >
                    <MessageSquare size={12} /> Share Hisab
                  </button>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Total Pending</div>
                <div className="text-2xl font-display font-bold text-red-500">
                  {formatCurrency(customer.pendingAmount)}
                </div>
              </div>
            </div>

            {/* Quick Payment Section */}
            {customer.pendingAmount > 0 && (
              <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Receive Payment</h4>
                  <div className="flex gap-2">
                    {['Cash', 'UPI', 'Bank'].map(mode => (
                      <button 
                        key={mode}
                        onClick={() => setPaymentMode(mode as any)}
                        className={`text-[9px] font-bold px-2 py-1 rounded-md transition-all ${paymentMode === mode ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                    <input 
                      type="number"
                      placeholder="Enter amount"
                      className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-7 pr-4 text-sm font-bold focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                      value={payingAmount}
                      onChange={e => setPayingAmount(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={handleRecordPayment}
                    disabled={isProcessingPayment || !payingAmount}
                    className="bg-green-600 text-white px-6 rounded-xl text-sm font-bold hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isProcessingPayment ? '...' : 'Pay'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">Bill History</h3>
              {bills?.map((bill) => (
                <div 
                  key={bill.id} 
                  className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-slate-400 py-1 px-2 bg-slate-100 rounded-lg">#{bill.billNumber}</span>
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                           <MapPin size={10} /> {bill.customerAddress || 'No Address'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider ${
                          bill.status === 'Delivered' ? 'bg-green-100 text-green-700' : 
                          bill.status === 'Pending' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {bill.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 font-bold">
                         <Calendar size={14} className="text-slate-400" />
                         {parseFirestoreDate(bill.date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-display font-bold text-slate-900">{formatCurrency(bill.grandTotal)}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">
                        {bill.paymentMode === 'Split' ? 'Split Payment' : bill.paymentMode}
                      </div>
                      {bill.paymentMode === 'Split' && bill.splitPayments && (
                        <div className="text-[9px] text-slate-400 font-bold mt-0.5">
                          C: {formatCurrency(bill.splitPayments.cash)} • U: {formatCurrency(bill.splitPayments.upi)} • P: {formatCurrency(bill.splitPayments.pending)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 font-bold">
                          {bill.quantity}
                        </div>
                        <span>Tanker ({bill.tankerSize}L)</span>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBillForPrint(bill);
                        }}
                        className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-bold"
                      >
                        <Printer size={14} /> Re-print
                      </button>
                    </div>

                    {bill.paymentMode === 'Pending' && bill.status !== 'Cancelled' && (
                      <div className="flex items-center gap-1 text-red-500 text-xs font-bold">
                        <Clock size={12} />
                        Payment Due
                      </div>
                    )}
                    {bill.paymentMode !== 'Pending' && (
                      <div className="flex items-center gap-1 text-green-600 text-xs font-bold bg-green-50 px-2.5 py-1 rounded-full">
                         <CheckCircle2 size={12} />
                         Paid
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {bills?.length === 0 && (
                <div className="py-20 text-center text-slate-400 italic text-sm">
                  No orders found for this customer.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Reprint Modal */}
      <AnimatePresence>
        {selectedBillForPrint && (
          <div className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                <span className="font-bold">Re-print Token</span>
                <button onClick={() => setSelectedBillForPrint(null)} className="bg-white p-2 rounded-full shadow-sm">
                  <XCircle size={20}/>
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto bg-slate-50 flex justify-center">
                <div ref={printRef}>
                  <ThermalInvoice bill={selectedBillForPrint} />
                </div>
              </div>
              <div className="p-4 bg-white border-t">
                <button 
                  onClick={async () => {
                    try {
                      await handlePrint();
                    } catch (err) {
                      alert("Printing is restricted in this preview. Please open the app in a new tab to print.");
                    }
                  }} 
                  className="w-full material-btn material-btn-primary flex items-center justify-center gap-2 py-4"
                >
                  <Printer size={20} /> Confirm Re-print
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

