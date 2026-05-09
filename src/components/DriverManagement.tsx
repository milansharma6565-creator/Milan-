import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, where, getDocs, runTransaction, serverTimestamp, updateDoc, getDoc } from 'firebase/firestore';
import { Driver, Account } from '../types';
import { Plus, Phone, User, Trash2, X, Truck, Navigation, Share2, Map as MapIcon, Download, UserPlus, UserMinus, FileText, IndianRupee, CheckCircle2, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmationModal } from './ConfirmationModal';
import { DriverTrackingAdmin } from './DriverTrackingAdmin';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function DriverManagement() {
  const [isAdding, setIsAdding] = useState(false);
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [activeTab, setActiveTab] = useState<'Active' | 'Inactive'>('Active');
  const [newDriver, setNewDriver] = useState({ name: '', mobile: '', monthlySalary: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<{ id: string, name: string, status: 'Active' | 'Inactive' } | null>(null);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quickPaymentDriver, setQuickPaymentDriver] = useState<Driver | null>(null);
  const [isSavingQuickPayment, setIsSavingQuickPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'Cash' as 'Cash' | 'Bank',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'drivers'));
    const unsubDrivers = onSnapshot(q, 
      (snapshot) => setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'drivers')
    );

    const unsubAccounts = onSnapshot(collection(db, 'accounts'), 
      (snapshot) => setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'accounts-drivers')
    );

    return () => {
      unsubDrivers();
      unsubAccounts();
    };
  }, []);

  const filteredDrivers = drivers.filter(d => (d.status || 'Active') === activeTab);

  const handleShareTrackingLink = async (driver: Driver) => {
    if (!driver.id) {
      alert("Error: Driver ID missing. Please refresh and try again.");
      return;
    }
    
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const url = `${baseUrl}?driverId=${driver.id}`;
    
    const shareText = `Hi ${driver.name}, please open this link to start sharing your live location for tanker tracking at Rajhans Steel and Water: ${url}`;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Rajhans Driver Tracking',
          text: shareText,
          url: url
        });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Tracking link copied to clipboard!\n\nSend this link to the driver.');
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Share error:', err);
        await navigator.clipboard.writeText(url);
        alert('Tracking link copied to clipboard!');
      }
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriver.name || !newDriver.mobile) return;
    
    try {
      const [liabilitiesSnap, currentLiabilitiesSnap] = await Promise.all([
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Liabilities'))),
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Current Liabilities')))
      ]);

      let liabilitiesId = liabilitiesSnap.docs[0]?.id;
      let currentLiabilitiesId = currentLiabilitiesSnap.docs[0]?.id;

      try {
        await runTransaction(db, async (transaction) => {
          const driverRef = doc(collection(db, 'drivers'));
          const driverData = {
            ...newDriver,
            mobile: newDriver.mobile.replace(/\D/g, ''),
            monthlySalary: Number(newDriver.monthlySalary) || 0,
            status: 'Active',
            createdAt: serverTimestamp()
          };
          transaction.set(driverRef, driverData);

          if (!liabilitiesId && !currentLiabilitiesId) {
            const newParentRef = doc(collection(db, 'accountGroups'));
            transaction.set(newParentRef, {
              name: 'Liabilities',
              type: 'Liability'
            });
            liabilitiesId = newParentRef.id;
          }

          if (!currentLiabilitiesId) {
            const newGroupRef = doc(collection(db, 'accountGroups'));
            transaction.set(newGroupRef, {
              name: 'Current Liabilities',
              parentGroupId: liabilitiesId || '',
              type: 'Liability'
            });
            currentLiabilitiesId = newGroupRef.id;
          }

          const accRef = doc(collection(db, 'accounts'));
          transaction.set(accRef, {
            name: newDriver.name,
            groupId: currentLiabilitiesId,
            openingBalance: 0,
            balanceType: 'Cr',
            currentBalance: 0,
            createdAt: serverTimestamp(),
            driverId: driverRef.id
          });
        });
        setNewDriver({ name: '', mobile: '', monthlySalary: '' });
        setIsAdding(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'drivers-transaction');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'account-groups-fetch');
    }
  };

  const handleQuickPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPaymentDriver || !paymentForm.amount) return;

    setIsSavingQuickPayment(true);
    try {
      const amount = Number(paymentForm.amount);
      const paymentAccName = paymentForm.paymentMethod === 'Cash' ? 'Cash' : 'Bank Account';
      
      let driverAccount = accounts.find(acc => acc.driverId === quickPaymentDriver.id);
      
      // Fallback to name matching if driverId link is missing (for older entries)
      if (!driverAccount) {
        driverAccount = accounts.find(acc => acc.name === quickPaymentDriver.name);
      }

      const paymentAccount = accounts.find(acc => acc.name === paymentAccName);
      if (!paymentAccount) throw new Error(`${paymentAccName} account not found`);

      // Add time to date
      const entryDate = new Date(paymentForm.date);
      const now = new Date();
      entryDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      await runTransaction(db, async (transaction) => {
        const payAccRef = doc(db, 'accounts', paymentAccount.id);
        
        let drvAccRef: any;
        let isCreatingNewAccount = !driverAccount;

        if (driverAccount) {
          drvAccRef = doc(db, 'accounts', driverAccount.id);
        } else {
          drvAccRef = doc(collection(db, 'accounts'));
        }

        // READS FIRST
        const payDoc = await transaction.get(payAccRef);
        let drvDocSnapshot = null;
        if (!isCreatingNewAccount) {
          drvDocSnapshot = await transaction.get(drvAccRef);
        }

        const payBal = payDoc.data()?.currentBalance || 0;

        // Validation
        if (payBal < amount) {
          throw new Error(`INSUFFICIENT_FUNDS:${paymentAccName}:${payBal}`);
        }

        // WRITES START HERE
        let driverAccountToUseId = drvAccRef.id;
        let driverAccountToUseName = isCreatingNewAccount ? quickPaymentDriver.name : driverAccount!.name;

        if (isCreatingNewAccount) {
          const newAccData = {
            name: quickPaymentDriver.name,
            group: 'Direct Expenses',
            openingBalance: 0,
            currentBalance: amount,
            balanceType: 'Dr',
            driverId: quickPaymentDriver.id,
            createdAt: serverTimestamp()
          };
          transaction.set(drvAccRef, newAccData);
        } else {
          const currentDrvBal = drvDocSnapshot?.data()?.currentBalance || 0;
          const balType = drvDocSnapshot?.data()?.balanceType || 'Dr';
          transaction.update(drvAccRef, { 
            currentBalance: currentDrvBal + (balType === 'Dr' ? amount : -amount) 
          });
        }

        transaction.update(payAccRef, { currentBalance: payBal - amount });

        // Record Voucher
        const vchRef = doc(collection(db, 'vouchers'));
        transaction.set(vchRef, {
          date: entryDate,
          type: 'Payment',
          voucherNumber: `DRV-P-${Math.floor(Date.now()/1000)}`,
          items: [
            { accountId: driverAccountToUseId, accountName: driverAccountToUseName, amount, type: 'Dr' },
            { accountId: paymentAccount.id, accountName: paymentAccount.name, amount, type: 'Cr' }
          ],
          narration: paymentForm.description.trim() || `Quick payment to ${quickPaymentDriver.name} via ${paymentForm.paymentMethod}`,
          totalAmount: amount,
          createdAt: serverTimestamp()
        });
      });

      setQuickPaymentDriver(null);
      setPaymentForm({
        amount: '',
        paymentMethod: 'Cash',
        date: new Date().toISOString().split('T')[0],
        description: ''
      });
      // triggerSmiley('happy') - Dashboard has this, DriverMgmt doesn't.
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('INSUFFICIENT_FUNDS:')) {
        const [_, acc, bal] = error.message.split(':');
        alert(`Failed: Insufficient balance in ${acc}. \nAvailable: ₹${Number(bal).toLocaleString()}`);
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'driver-quick-payment');
      }
    } finally {
      setIsSavingQuickPayment(false);
    }
  };

  const handleStartPress = (driver: Driver) => {
    const timer = setTimeout(() => {
      setQuickPaymentDriver(driver);
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

  const toggleDriverStatus = async (id: string, newStatus: 'Active' | 'Inactive') => {
    try {
      await updateDoc(doc(db, 'drivers', id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      setStatusConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `drivers/${id}`);
    }
  };

  const deleteDriver = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'drivers', id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `drivers/${id}`);
    }
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text(`Rajhans Steel & Water - ${activeTab} Drivers`, 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = filteredDrivers.map(d => [
      d.name,
      `+91 ${d.mobile}`,
      d.monthlySalary > 0 ? `Rs. ${d.monthlySalary.toLocaleString()}` : 'N/A',
      d.status || 'Active'
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Driver Name', 'Mobile Number', 'Monthly Salary', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      margin: { top: 40 },
    });

    doc.save(`Rajhans_${activeTab}_Drivers_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="pb-24 max-w-4xl mx-auto">
      <div className="p-4 flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Tanker Drivers</h1>
            <p className="text-slate-500 text-sm">{drivers?.length || 0} total registered drivers</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowLiveMap(true)}
              className="px-5 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center gap-2 font-bold hover:bg-indigo-100 transition-all active:scale-95"
            >
              <MapIcon size={20} />
              <span className="hidden sm:inline">Live Map</span>
            </button>
            <button 
              onClick={() => setIsAdding(true)}
              className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all hover:scale-105 active:scale-95"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>

        {/* Tabs and Actions */}
        <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-2xl">
          <div className="flex gap-1">
            <button 
              onClick={() => setActiveTab('Active')}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'Active' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              Active
            </button>
            <button 
              onClick={() => setActiveTab('Inactive')}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'Inactive' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              Inactive
            </button>
          </div>
          <button 
            onClick={downloadPDF}
            disabled={filteredDrivers.length === 0}
            className="px-4 py-2 bg-white text-slate-700 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-200 transition-all border border-slate-200 disabled:opacity-50"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Download PDF</span>
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {filteredDrivers.map((driver) => (
            <motion.div
              key={driver.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onMouseDown={() => handleStartPress(driver)}
              onMouseUp={handleEndPress}
              onMouseLeave={handleEndPress}
              onTouchStart={() => handleStartPress(driver)}
              onTouchEnd={handleEndPress}
              className={`material-card group transition-all duration-300 relative overflow-hidden active:scale-[0.98] cursor-pointer ${
                activeTab === 'Inactive' ? 'opacity-75 grayscale-[0.5]' : 'hover:border-blue-100 hover:shadow-xl hover:shadow-blue-500/5'
              }`}
            >
              {longPressTimer && (
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, ease: "linear" }}
                  className="absolute top-0 left-0 h-1 bg-blue-500 z-10"
                />
              )}
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                      activeTab === 'Active' ? 'bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500' : 'bg-slate-200 text-slate-500'
                    }`}>
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{driver.name}</h3>
                      <p className="text-slate-400 text-xs font-mono">+91 {driver.mobile}</p>
                      {driver.monthlySalary > 0 && (
                        <p className={`text-xs font-bold mt-1 ${activeTab === 'Active' ? 'text-indigo-600' : 'text-slate-500'}`}>
                          ₹{driver.monthlySalary.toLocaleString()} / month
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <a 
                      href={`tel:${driver.mobile}`}
                      className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-green-100 hover:scale-110 active:scale-95 transition-transform"
                    >
                      <Phone size={18} />
                    </a>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                  <div className="flex gap-1.5">
                    {activeTab === 'Active' ? (
                      <button 
                        onClick={() => handleShareTrackingLink(driver)}
                        className="h-10 px-4 bg-indigo-50 text-indigo-600 rounded-xl flex items-center gap-2 text-xs font-bold hover:bg-indigo-100 transition-colors"
                      >
                        <Share2 size={16} /> Share Link
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-400 px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                        <UserMinus size={12} /> Inactive
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <button 
                      onClick={() => setStatusConfirm({ id: driver.id!, name: driver.name, status: activeTab === 'Active' ? 'Inactive' : 'Active' })}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        activeTab === 'Active' ? 'bg-orange-50 text-orange-500 hover:bg-orange-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                      title={activeTab === 'Active' ? 'Mark Inactive' : 'Mark Active'}
                    >
                      {activeTab === 'Active' ? <UserMinus size={18} /> : <UserPlus size={18} />}
                    </button>
                    <button 
                      onClick={() => driver.id && setDeleteConfirm({ id: driver.id, name: driver.name })}
                      className="w-10 h-10 bg-slate-50 text-slate-300 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Delete Permanently"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {filteredDrivers.length === 0 && (
            <div className="md:col-span-2 py-20 text-center flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                {activeTab === 'Active' ? <Truck size={40} /> : <UserPlus size={40} />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">No {activeTab} Drivers</h3>
                <p className="text-slate-500 text-sm">
                  {activeTab === 'Active' ? 'Add your tanker drivers to contact them quickly.' : 'No drivers in history yet.'}
                </p>
              </div>
              {activeTab === 'Active' && (
                <button 
                  onClick={() => setIsAdding(true)}
                  className="material-btn material-btn-primary"
                >
                  <Plus size={20} /> Add New Driver
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: "100%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%", scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-display font-bold text-slate-900">Add Driver</h2>
                  <p className="text-sm text-slate-500">Enter driver details</p>
                </div>
                <button 
                  onClick={() => setIsAdding(false)} 
                  className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleAddDriver} className="flex flex-col gap-5">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Driver Name</label>
                  <input
                    required
                    autoFocus
                    className="material-input h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={newDriver.name}
                    onChange={e => setNewDriver({...newDriver, name: e.target.value})}
                    placeholder="e.g. Pappu Driver"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Mobile Number</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono">+91</span>
                    <input
                      required
                      type="tel"
                      maxLength={10}
                      className="material-input pl-16 h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                      value={newDriver.mobile}
                      onChange={e => setNewDriver({...newDriver, mobile: e.target.value})}
                      placeholder="10 digit number"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Monthly Salary (₹)</label>
                  <input
                    required
                    type="number"
                    className="material-input h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={newDriver.monthlySalary}
                    onChange={e => setNewDriver({...newDriver, monthlySalary: e.target.value})}
                    placeholder="e.g. 15000"
                  />
                </div>
                
                <button type="submit" className="material-btn material-btn-primary h-16 text-lg mt-4 shadow-blue-500/20">
                  Save Driver
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && deleteDriver(deleteConfirm.id)}
        title="Delete Permanently?"
        message={`Are you sure you want to delete ${deleteConfirm?.name}? This will remove all their records permanently from the system.`}
      />

      <ConfirmationModal 
        isOpen={!!statusConfirm}
        onClose={() => setStatusConfirm(null)}
        onConfirm={() => statusConfirm && toggleDriverStatus(statusConfirm.id, statusConfirm.status)}
        title={statusConfirm?.status === 'Inactive' ? 'Deactivate Driver?' : 'Reactivate Driver?'}
        message={`Move ${statusConfirm?.name} to ${statusConfirm?.status} list?`}
      />

      {showLiveMap && (
        <DriverTrackingAdmin onClose={() => setShowLiveMap(false)} />
      )}

      {/* Quick Payment Modal */}
      <AnimatePresence>
        {quickPaymentDriver && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setQuickPaymentDriver(null)}
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
                  <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                    <Minus size={28} />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-black text-slate-900 leading-tight">
                      Pay - {quickPaymentDriver.name}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Quick Driver Payment
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setQuickPaymentDriver(null)}
                  className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleQuickPaymentSubmit} className="p-8 pt-6 flex flex-col gap-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block ml-1">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Cash', 'Bank'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentForm({ ...paymentForm, paymentMethod: m })}
                        className={`h-12 rounded-xl font-bold text-sm transition-all border-2 ${
                          paymentForm.paymentMethod === m 
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
                        value={paymentForm.amount}
                        onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                        className="w-full h-14 bg-slate-50 rounded-[1.25rem] pl-8 pr-4 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-black text-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block ml-1">Date</label>
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })}
                      className="w-full h-14 bg-slate-50 rounded-[1.25rem] px-4 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block ml-1">Description</label>
                  <input
                    placeholder="Salary / Advance..."
                    value={paymentForm.description}
                    onChange={e => setPaymentForm({ ...paymentForm, description: e.target.value })}
                    className="w-full h-14 bg-slate-50 rounded-[1.25rem] px-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingQuickPayment}
                  className="w-full h-16 bg-blue-600 text-white rounded-[1.25rem] font-display font-black text-lg shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-2"
                >
                  {isSavingQuickPayment ? (
                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={24} />
                      Confirm Payment
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

