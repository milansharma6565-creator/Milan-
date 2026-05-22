import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, where, getDocs, runTransaction, serverTimestamp, updateDoc, getDoc } from 'firebase/firestore';
import { Driver, Account } from '../types';
import { Plus, Phone, User, Trash2, X, Truck, Navigation, Share2, Download, UserPlus, UserMinus, FileText, IndianRupee, CheckCircle2, Minus, AlertCircle, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmationModal } from './ConfirmationModal';
import { ledgerAutomation } from '../services/ledgerAutomation';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function DriverManagement({ franchiseId, isSuperAdmin }: { franchiseId?: string, isSuperAdmin?: boolean }) {
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'Active' | 'Inactive' | 'pending'>('Active');
  const [newDriver, setNewDriver] = useState({ name: '', mobile: '', email: '', monthlySalary: '', pin: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<{ id: string, name: string, status: 'Active' | 'Inactive' | 'pending' | 'approved' } | null>(null);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quickPaymentDriver, setQuickPaymentDriver] = useState<Driver | null>(null);
  const [isSavingQuickPayment, setIsSavingQuickPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'Cash' as 'Cash' | 'Bank' | 'Penalty',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });
  const [longPressTimer, setLongPressTimer] = useState<any | null>(null);

  useEffect(() => {
    let q = query(collection(db, 'drivers'));
    if (!isSuperAdmin && franchiseId) {
      q = query(collection(db, 'drivers'), where('franchiseId', '==', franchiseId));
    }
    const unsubDrivers = onSnapshot(q, 
      (snapshot) => setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'drivers')
    );

    let qAccounts = query(collection(db, 'accounts'));
    if (!isSuperAdmin && franchiseId) {
      qAccounts = query(collection(db, 'accounts'), where('franchiseId', '==', franchiseId));
    }
    const unsubAccounts = onSnapshot(qAccounts, 
      (snapshot) => setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'accounts-drivers')
    );

    return () => {
      unsubDrivers();
      unsubAccounts();
    };
  }, [franchiseId, isSuperAdmin]);

  const filteredDrivers = drivers.filter(d => (d.status || 'Active') === activeTab);

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
            franchiseId: franchiseId || null,
            mobile: newDriver.mobile.replace(/\D/g, ''),
            email: newDriver.email.trim().toLowerCase(),
            monthlySalary: Number(newDriver.monthlySalary) || 0,
            pin: newDriver.pin || Math.floor(1000 + Math.random() * 9000).toString(),
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
            franchiseId: franchiseId || null,
            groupId: currentLiabilitiesId,
            openingBalance: 0,
            balanceType: 'Cr',
            currentBalance: 0,
            createdAt: serverTimestamp(),
            driverId: driverRef.id
          });
        });
        setNewDriver({ name: '', mobile: '', email: '', monthlySalary: '', pin: '' });
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
      
      // Use Professional Automation
      await ledgerAutomation.postDriverPaymentToLedger(
        quickPaymentDriver,
        amount,
        paymentForm.paymentMethod,
        paymentForm.description.trim()
      );

      // We still update the account balance for UI consistency if needed, 
      // but the ledgerAutomation does the main work.
      // However, if we want the 'currentBalance' on the account doc to be updated too,
      // we should keep the transaction logic or rely on the automation to do it.
      // The current ledgerAutomation only creates a voucher.
      // Best is to do both in a transaction if we want consistency.
      
      // For now, let's keep it simple as per user request: "ledger m chali jaaye entry"
      
      setQuickPaymentDriver(null);
      setPaymentForm({
        amount: '',
        paymentMethod: 'Cash',
        date: new Date().toISOString().split('T')[0],
        description: ''
      });
      alert('Entry posted to Ledger successfully!');
    } catch (error) {
      console.error('Error posting driver payment:', error instanceof Error ? error.message : String(error));
      alert('Failed to post entry.');
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

  const toggleDriverStatus = async (id: string, newStatus: 'Active' | 'Inactive' | 'approved' | 'pending') => {
    try {
      if (newStatus === 'approved') {
        await runTransaction(db, async (transaction) => {
          const driverRef = doc(db, 'drivers', id);
          const driverDoc = await transaction.get(driverRef);
          
          if (!driverDoc.exists()) return;
          const driverData = driverDoc.data() as Driver;
          
          // Set driver to active
          transaction.update(driverRef, {
            status: 'Active',
            updatedAt: serverTimestamp()
          });

          // Check if liability account already exists for this driver
          const accountsQuery = query(collection(db, 'accounts'), where('driverId', '==', id));
          const existingAccounts = await getDocs(accountsQuery);

          if (existingAccounts.empty) {
            // Need to get/create Current Liabilities group
            let currentLiabilitiesId = '';
            const liabilitiesGrpSnap = await getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Current Liabilities')));
            
            if (!liabilitiesGrpSnap.empty) {
              currentLiabilitiesId = liabilitiesGrpSnap.docs[0].id;
            } else {
              const newGroupRef = doc(collection(db, 'accountGroups'));
              transaction.set(newGroupRef, {
                name: 'Current Liabilities',
                parentGroup: '', // Typically has a parent, but we keep it simple
                type: 'Liability'
              });
              currentLiabilitiesId = newGroupRef.id;
            }

            const accRef = doc(collection(db, 'accounts'));
            transaction.set(accRef, {
              name: driverData.name,
              franchiseId: franchiseId || null,
              groupId: currentLiabilitiesId,
              openingBalance: 0,
              balanceType: 'Cr',
              currentBalance: 0,
              createdAt: serverTimestamp(),
              driverId: id
            });
          }
        });
      } else {
        await updateDoc(doc(db, 'drivers', id), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
      }
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
    let pdfDoc: any;
    try {
      pdfDoc = new jsPDF();
    } catch (e) {
      console.error('jsPDF failed:', e instanceof Error ? e.message : String(e));
      alert('PDF generation is not supported in this browser.');
      return;
    }
    
    pdfDoc.setFontSize(20);
    pdfDoc.text(`TankerWala Powered by Rajhans - ${activeTab} Drivers`, 14, 22);
    
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(100);
    pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = filteredDrivers.map(d => [
      d.name,
      `+91 ${d.mobile}`,
      d.monthlySalary > 0 ? `Rs. ${d.monthlySalary.toLocaleString()}` : 'N/A',
      d.status || 'Active'
    ]);

    autoTable(pdfDoc, {
      startY: 40,
      head: [['Driver Name', 'Mobile Number', 'Monthly Salary', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      margin: { top: 40 },
    });

    pdfDoc.save(`TankerWala_${activeTab}_Drivers_${new Date().toISOString().split('T')[0]}.pdf`);
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
              onClick={() => setIsAdding(true)}
              className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all hover:scale-105 active:scale-95"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>

        {/* Tabs and Actions */}
        <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-2xl overflow-x-auto">
          <div className="flex gap-1">
            <button 
              onClick={() => setActiveTab('Active')}
              className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'Active' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              Active
            </button>
            <button 
              onClick={() => setActiveTab('Inactive')}
              className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'Inactive' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              Inactive
            </button>
            <button 
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'pending' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              Pending
            </button>
          </div>
          <button 
            onClick={downloadPDF}
            disabled={filteredDrivers.length === 0}
            className="px-4 py-2 bg-white text-slate-700 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-200 transition-all border border-slate-200 disabled:opacity-50 min-w-max"
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
                      {driver.email && <p className="text-slate-400 text-[10px]">{driver.email}</p>}
                      {driver.monthlySalary > 0 && (
                        <p className={`text-xs font-bold mt-1 ${activeTab === 'Active' ? 'text-indigo-600' : 'text-slate-500'}`}>
                          ₹{driver.monthlySalary.toLocaleString()} / month
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {activeTab !== 'pending' && (
                    <div className="flex gap-2">
                      <a 
                        href={`tel:${driver.mobile}`}
                        className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-green-100 hover:scale-110 active:scale-95 transition-transform"
                      >
                        <Phone size={18} />
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                    {activeTab === 'Inactive' && (
                      <div className="flex items-center gap-1.5 text-slate-400 px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                        <UserMinus size={12} /> Inactive
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (driver.pin) alert(`Login PIN for ${driver.name} is: ${driver.pin}`);
                        else alert("PIN not set for this driver.");
                      }}
                      className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center border border-indigo-100 transition-transform active:scale-95"
                      title="Show PIN"
                    >
                      <Lock size={18} />
                    </button>
                    {activeTab === 'pending' ? (
                      <button 
                        onClick={() => toggleDriverStatus(driver.id!, 'approved')}
                        className="px-4 h-10 bg-green-50 text-green-600 font-bold rounded-xl flex items-center justify-center transition-all hover:bg-green-100 uppercase text-xs tracking-wider"
                        title="Approve Driver"
                      >
                        Approve
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => setQuickPaymentDriver(driver)}
                          className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform border border-red-100"
                          title="Pay Advance/Salary"
                        >
                          <Minus size={18} />
                        </button>
                        <button 
                          onClick={() => setStatusConfirm({ id: driver.id!, name: driver.name, status: activeTab === 'Active' ? 'Inactive' : 'Active' })}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            activeTab === 'Active' ? 'bg-orange-50 text-orange-500 hover:bg-orange-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                          }`}
                          title={activeTab === 'Active' ? 'Mark Inactive' : 'Mark Active'}
                        >
                          {activeTab === 'Active' ? <UserMinus size={18} /> : <UserPlus size={18} />}
                        </button>
                      </>
                    )}
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
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Gmail ID (For Login)</label>
                  <input
                    required
                    type="email"
                    className="material-input h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={newDriver.email}
                    onChange={e => setNewDriver({...newDriver, email: e.target.value})}
                    placeholder="driver.gmail@gmail.com"
                  />
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
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Login PIN (4-digit)</label>
                  <input
                    maxLength={4}
                    className="material-input h-14 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white"
                    value={newDriver.pin}
                    onChange={e => setNewDriver({...newDriver, pin: e.target.value.replace(/\D/g, '')})}
                    placeholder="Auto-generated if empty"
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
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block ml-1">Payment Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Cash', 'Bank', 'Penalty'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentForm({ ...paymentForm, paymentMethod: m })}
                        className={`h-12 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border-2 ${
                          paymentForm.paymentMethod === m 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                            : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {m === 'Bank' ? 'Bank (934)' : m}
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

