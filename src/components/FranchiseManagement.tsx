import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Mail, 
  User, 
  MapPin, 
  Percent, 
  ShieldCheck, 
  Trash2, 
  TrendingUp,
  Receipt,
  X,
  FileText,
  Edit,
  Navigation
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  onSnapshot, 
  query, 
  where,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
  orderBy,
  setDoc,
  limit
} from 'firebase/firestore';
import { Franchise, Bill } from '../types';
import { formatCurrency } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { ledgerAutomation } from '../services/ledgerAutomation';
import { activityLogger } from '../services/activityLogger';
import { ConfirmationModal } from './ConfirmationModal';

export function FranchiseManagement({ onSelectFranchise }: { onSelectFranchise?: (f: Franchise | null) => void }) {
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFranchiseBills, setSelectedFranchiseBills] = useState<Bill[]>([]);
  const [viewStatsId, setViewStatsId] = useState<string | null>(null);
  const [editingFranchiseId, setEditingFranchiseId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    location: '',
    coordinates: null as { lat: number, lng: number } | null,
    commissionPercentage: 5,
    gstNumber: '',
    proprietorName: '',
    aadharNumber: '',
    isTesting: false,
    servicesEnabled: {
      tanker: true,
      can: true,
      bottle: true
    },
    superAdminServices: {
      tanker: true,
      can: true,
      bottle: true
    },
    loyaltyProgramEnabled: false,
    allowSystemMaintenance: true
  });

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setFormData(prev => ({
          ...prev,
          coordinates: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          }
        }));
      }, (err) => {
        alert("Failed to get location. Please enable location permissions.");
      });
    }
  };

  useEffect(() => {
    let unsub = () => {};
    
    const seedLegacyFranchises = async () => {
      try {
        const snap = await getDocs(collection(db, 'franchises'));
        if (snap.empty) {
          const legacy = [
            { id: "legacy-rajhans", name: "Rajhans Steel and Water", email: "rajhanssikar@gmail.com", location: "Sikar" },
            { id: "legacy-pile", name: "Rajhans Pile Foundation", email: "rajhanspilefoundation@gmail.com", location: "Sikar" }
          ];

          for (const leg of legacy) {
            await setDoc(doc(db, 'franchises', leg.id), {
              name: leg.name,
              email: leg.email,
              location: leg.location,
              commissionPercentage: 5,
              status: 'Active',
              authorizedBy: 'System',
              isTesting: false,
              createdAt: serverTimestamp()
            });
          }
        }
      } catch (err) {
        console.error("Seed legacy failed", err instanceof Error ? err.message : String(err));
      }
    };

    seedLegacyFranchises().then(() => {
      const q = query(collection(db, 'franchises'), orderBy('createdAt', 'desc'));
      unsub = onSnapshot(q, (snap) => {
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Franchise));
        setFranchises(data);
        setLoading(false);
      }, (err) => {
        console.error("Error fetching franchises:", err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    });

    return () => unsub();
  }, []);

  const handleAddFranchise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (editingFranchiseId) {
        // Collect update differences list
        const orig = franchises.find(f => f.id === editingFranchiseId);
        const diffs: string[] = [];
        if (orig) {
          if (orig.name !== formData.name) diffs.push(`Name: "${orig.name}" ➔ "${formData.name}"`);
          if (orig.commissionPercentage !== formData.commissionPercentage) diffs.push(`Commission: ${orig.commissionPercentage}% ➔ ${formData.commissionPercentage}%`);
          
          const oldT = orig.superAdminServices?.tanker ?? true;
          const newT = formData.superAdminServices?.tanker ?? true;
          if (oldT !== newT) diffs.push(`Tanker authorized: ${oldT ? 'ON' : 'OFF'} ➔ ${newT ? 'ON' : 'OFF'}`);

          const oldC = orig.superAdminServices?.can ?? true;
          const newC = formData.superAdminServices?.can ?? true;
          if (oldC !== newC) diffs.push(`Can authorized: ${oldC ? 'ON' : 'OFF'} ➔ ${newC ? 'ON' : 'OFF'}`);

          const oldB = orig.superAdminServices?.bottle ?? true;
          const newB = formData.superAdminServices?.bottle ?? true;
          if (oldB !== newB) diffs.push(`Bottle authorized: ${oldB ? 'ON' : 'OFF'} ➔ ${newB ? 'ON' : 'OFF'}`);

          const oldL = orig.loyaltyProgramEnabled ?? false;
          const newL = formData.loyaltyProgramEnabled ?? false;
          if (oldL !== newL) diffs.push(`Loyalty program: ${oldL ? 'ON' : 'OFF'} ➔ ${newL ? 'ON' : 'OFF'}`);

          const oldM = orig.allowSystemMaintenance ?? true;
          const newM = formData.allowSystemMaintenance ?? true;
          if (oldM !== newM) diffs.push(`System maintenance authorized: ${oldM ? 'ON' : 'OFF'} ➔ ${newM ? 'ON' : 'OFF'}`);
        }

        await updateDoc(doc(db, 'franchises', editingFranchiseId), {
           ...formData,
           status: formData.isTesting ? 'Testing' : 'Active',
           updatedAt: serverTimestamp()
        });

        await activityLogger.log({
          franchiseId: editingFranchiseId,
          franchiseName: formData.name,
          userEmail: auth.currentUser?.email || 'Super Admin',
          actionType: 'FRANCHISE_UPDATED',
          description: `Super Admin updated franchise configurations. ${diffs.length > 0 ? 'Changes: ' + diffs.join(', ') : 'No settings changed.'}`,
          details: { changes: diffs, formData }
        });
      } else {
        const newFranchiseRef = await addDoc(collection(db, 'franchises'), {
          ...formData,
          status: formData.isTesting ? 'Testing' : 'Active',
          authorizedBy: auth.currentUser?.email || 'System',
          createdAt: serverTimestamp()
        });
        
        // Auto-provision default ledger accounts (Cash, Bank, Service Income) for this franchise
        await ledgerAutomation.setupFranchiseLedgers(newFranchiseRef.id, formData.name);

        await activityLogger.log({
          franchiseId: newFranchiseRef.id,
          franchiseName: formData.name,
          userEmail: auth.currentUser?.email || 'Super Admin',
          actionType: 'FRANCHISE_CREATED',
          description: `Super Admin authorized new franchise partner "${formData.name}" in location "${formData.location}"`
        });
      }
      setShowAddModal(false);
      setEditingFranchiseId(null);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingFranchiseId ? OperationType.UPDATE : OperationType.CREATE, 'franchises');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ 
      name: '', email: '', location: '', coordinates: null, commissionPercentage: 5, 
      gstNumber: '', proprietorName: '', aadharNumber: '', isTesting: false,
      servicesEnabled: { tanker: true, can: true, bottle: true },
      superAdminServices: { tanker: true, can: true, bottle: true },
      loyaltyProgramEnabled: false,
      allowSystemMaintenance: true
    });
  };

  const handleEditClick = (f: Franchise) => {
    setEditingFranchiseId(f.id!);
    setFormData({
      name: f.name,
      email: f.email,
      location: f.location || '',
      coordinates: f.coordinates || null,
      commissionPercentage: f.commissionPercentage || 5,
      gstNumber: f.gstNumber || '',
      proprietorName: f.proprietorName || '',
      aadharNumber: f.aadharNumber || '',
      isTesting: f.isTesting || f.status === 'Testing' || false,
      servicesEnabled: f.servicesEnabled || { tanker: true, can: true, bottle: true },
      superAdminServices: f.superAdminServices || f.servicesEnabled || { tanker: true, can: true, bottle: true },
      loyaltyProgramEnabled: f.loyaltyProgramEnabled || false,
      allowSystemMaintenance: f.allowSystemMaintenance ?? true
    });
    setShowAddModal(true);
  };

  const handleAddNewFranchise = () => {
    setEditingFranchiseId(null);
    resetForm();
    setShowAddModal(true);
  };

  const handleDeleteFranchise = async (id: string) => {
    try {
      const fToDelete = franchises.find(f => f.id === id);
      const name = fToDelete?.name || 'Unknown';
      await deleteDoc(doc(db, 'franchises', id));
      await activityLogger.log({
        franchiseId: id,
        franchiseName: name,
        userEmail: auth.currentUser?.email || 'Super Admin',
        actionType: 'FRANCHISE_DELETED',
        description: `Super Admin deleted franchise "${name}"`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'franchises');
    }
  };

  const toggleStatus = async (f: Franchise) => {
    const newStatus = f.status === 'Active' ? 'Suspended' : 'Active';
    if (!confirm(`Are you sure you want to ${newStatus === 'Active' ? 'activate' : 'SUSPEND'} this franchise?`)) return;
    try {
      await updateDoc(doc(db, 'franchises', f.id!), { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'franchises');
    }
  };

  const handleViewStats = async (franchiseId: string) => {
    if (viewStatsId === franchiseId) {
      setViewStatsId(null);
      return;
    }
    setViewStatsId(franchiseId);
    try {
      const q = query(collection(db, 'bills'), where('franchiseId', '==', franchiseId));
      const snap = await getDocs(q);
      const bills = snap.docs.map(d => d.data() as Bill);
      setSelectedFranchiseBills(bills);
    } catch (error) {
      console.error("Error fetching franchise stats:", error instanceof Error ? error.message : String(error));
    }
  };

  const calculateCommission = (bills: Bill[]) => {
    return bills.reduce((sum, b) => sum + (b.commissionAmount || 0), 0);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 animate-pulse">
      <Building2 size={48} className="text-slate-200 mb-4" />
      <div className="h-4 w-48 bg-slate-100 rounded-full mb-2" />
      <div className="h-3 w-32 bg-slate-50 rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <ShieldCheck className="text-blue-600" size={28} />
            Franchise Management
          </h2>
          <p className="text-slate-500 text-sm font-medium">Authorize and monitor regional franchisees</p>
        </div>
        <button 
          onClick={handleAddNewFranchise}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-slate-100 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={20} />
          Add Franchisee
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {franchises.map((f) => {
          const isViewingStats = viewStatsId === f.id;
          return (
            <motion.div 
              key={f.id}
              layout
              className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm hover:shadow-xl hover:shadow-slate-100/50 transition-all group"
            >
              {f.conversionRequested && (
                <div className="mb-6 p-5 bg-green-50 border border-green-100 rounded-3xl flex items-center justify-between gap-3 animate-pulse">
                  <div>
                    <p className="text-xs font-black text-green-800 uppercase tracking-wider">Conversion Requested 📬</p>
                    <p className="text-[10px] text-green-600 font-bold mt-0.5">They are pleased with testing and requested to become an active commercial partner.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm(`Approve commercial status conversion for "${f.name}"?`)) {
                        try {
                          await updateDoc(doc(db, 'franchises', f.id!), {
                            status: 'Active',
                            isTesting: false,
                            conversionRequested: false
                          });
                          alert('🎉 Congratulations! This franchise is now officially active and has full access to the live ecosystems.');
                        } catch (err) {
                          alert('Error completing conversion.');
                        }
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all shadow-md shrink-0"
                  >
                    Approve Upgrade
                  </button>
                </div>
              )}

              <div className="flex items-start justify-between mb-6">
                <div className="flex gap-4">
                  <div className="w-16 h-16 bg-blue-50 rounded-[1.25rem] flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                    <Building2 size={32} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{f.name}</h3>
                    <p className="flex items-center gap-1.5 text-slate-400 text-sm font-medium mt-0.5">
                      <Mail size={14} />
                      {f.email}
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-2">
                       <MapPin size={10} />
                       {f.location || 'Not Specified'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                       {f.proprietorName && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">{f.proprietorName}</span>}
                       {f.gstNumber && <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">GST: {f.gstNumber}</span>}
                       {f.aadharNumber && <span className="text-[10px] bg-green-50 text-green-500 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">Aadhar: {f.aadharNumber}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleEditClick(f)}
                    className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors"
                  >
                    <Edit size={20} />
                  </button>
                  <button 
                    onClick={() => setDeleteConfirm({ id: f.id!, name: f.name })}
                    className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-50 p-5 rounded-3xl">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Commission Rate</p>
                   <p className="text-2xl font-black text-slate-900 flex items-center gap-1">
                     {f.commissionPercentage || 0} <Percent size={16} className="text-blue-500" />
                   </p>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleStatus(f)}>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status (Click to toggle)</p>
                   <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                     f.status === 'Active' ? 'bg-green-100 text-green-600' : 
                     f.status === 'Testing' ? 'bg-amber-100 text-amber-700 animate-pulse' :
                     'bg-red-100 text-red-600'
                   }`}>
                     {f.status}
                   </span>
                </div>
              </div>

              {/* Conversion Option for Testing Franchises */}
              {(f.isTesting || f.status === 'Testing') && (
                <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-amber-800">Trial Mode Active</p>
                    <p className="text-[10px] text-amber-600 font-medium">Testing applets & simulated logins enabled.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm(`Convert "${f.name}" from Testing Sandbox to an OFFICIAL COMMERCIAL PARTNER?`)) {
                        try {
                          await updateDoc(doc(db, 'franchises', f.id!), {
                            status: 'Active',
                            isTesting: false
                          });
                          alert('🎉 Converted successfully! They are now an official commercial franchise.');
                        } catch (err) {
                          alert('Error converting franchise.');
                        }
                      }
                    }}
                    className="bg-amber-600 hover:bg-amber-750 text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl transition-all"
                  >
                    Convert to Real
                  </button>
                </div>
              )}

              {/* Granular Feature Locking */}
              <div className="mb-8">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Active Features (Lock/Unlock)</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'dashboard', label: 'Dashboard' },
                    { id: 'billing', label: 'Create Token' },
                    { id: 'ledger', label: 'Ledger' },
                    { id: 'customers', label: 'Customers' },
                    { id: 'reports', label: 'Reports' },
                    { id: 'drivers', label: 'Drivers' },
                    { id: 'tractors', label: 'Fleet/Fuel' },
                    { id: 'live-map', label: 'Tracking' },
                    { id: 'attendance', label: 'Attendance' },
                    { id: 'filling', label: 'Hydrant' },
                    { id: 'documents', label: 'Vault' }
                  ].map(feat => {
                    const isLocked = f.lockedFeatures?.includes(feat.id);
                    return (
                      <button
                        key={feat.id}
                        onClick={async () => {
                          const currentLocked = f.lockedFeatures || [];
                          const newLocked = isLocked 
                            ? currentLocked.filter(id => id !== feat.id)
                            : [...currentLocked, feat.id];
                          try {
                            await updateDoc(doc(db, 'franchises', f.id!), { lockedFeatures: newLocked });
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, 'franchises');
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
                          isLocked 
                            ? 'bg-red-50 border-red-200 text-red-500 opacity-60' 
                            : 'bg-green-50 border-green-200 text-green-600 shadow-sm'
                        }`}
                      >
                        {feat.label} {isLocked ? '(LOCKED)' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {onSelectFranchise && (
                  <button 
                    onClick={() => onSelectFranchise(f)}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all"
                  >
                    <ShieldCheck size={20} />
                    Inspect All Data
                  </button>
                )}
                
                <button 
                  onClick={() => handleViewStats(f.id!)}
                  className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
                    isViewingStats 
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' 
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <TrendingUp size={20} />
                  {isViewingStats ? 'Hide Stats' : 'View Performance'}
                </button>
                
                <AnimatePresence>
                  {isViewingStats && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-6 grid grid-cols-2 gap-4 border-t border-slate-100 mt-3">
                        <div className="bg-blue-50/50 p-4 rounded-2xl">
                          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Total Sales</p>
                          <p className="text-lg font-black text-blue-900">{formatCurrency(selectedFranchiseBills.reduce((sum, b) => sum + b.grandTotal, 0))}</p>
                        </div>
                        <div className="bg-indigo-50/50 p-4 rounded-2xl">
                          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Commission</p>
                          <p className="text-lg font-black text-indigo-900">{formatCurrency(calculateCommission(selectedFranchiseBills))}</p>
                        </div>
                        <div className="col-span-2 bg-slate-900 p-4 rounded-2xl flex items-center justify-between">
                           <div className="flex items-center gap-3">
                             <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-white">
                               <Receipt size={16} />
                             </div>
                             <span className="text-xs font-bold text-white uppercase tracking-widest">Total Orders</span>
                           </div>
                           <span className="text-xl font-black text-white">{selectedFranchiseBills.length}</span>
                        </div>
                                   {/* Custom Rates Status Dashboard */}
                        <div className="col-span-2 mt-2 bg-slate-50 border border-slate-100 p-5 rounded-3xl text-left">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5 font-sans">
                            🏷️ Custom Base Rates
                          </h4>
                          {f.customRates ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-sans">
                              <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                <span className="text-slate-400 block font-bold uppercase tracking-wide">Tanker Base</span>
                                <span className="font-extrabold text-slate-800">₹{f.customRates.tankerBase ?? 350}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                <span className="text-slate-400 block font-bold uppercase tracking-wide">20L Can Billing</span>
                                <span className="font-extrabold text-slate-800">₹{f.customRates.can20lBase ?? 80}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                <span className="text-slate-400 block font-bold uppercase tracking-wide">20L Can Booking</span>
                                <span className="font-extrabold text-slate-800">₹{f.customRates.can20lBookingBase ?? 30}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                <span className="text-slate-400 block font-bold uppercase tracking-wide">Monthly Can</span>
                                <span className="font-extrabold text-slate-800">₹{f.customRates.monthlyCanBase ?? 600}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                <span className="text-slate-400 block font-bold uppercase tracking-wide">Standby Day 1</span>
                                <span className="font-extrabold text-slate-800">₹{f.customRates.standbyTankerBase ?? 900}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                <span className="text-slate-400 block font-bold uppercase tracking-wide">Standby Extra</span>
                                <span className="font-extrabold text-slate-800">₹{f.customRates.standbyTankerExtraDay ?? 600}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-500 font-bold italic font-sans pl-1">No custom rates set yet. Using system default regional rates.</p>
                          )}
                        </div>

                        {/* Loyalty Point Program Status */}
                        <div className="col-span-2 mt-2 bg-gradient-to-br from-blue-50/60 to-indigo-50/60 border border-blue-100/60 p-5 rounded-3xl text-left">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-sans">
                            🎁 Loyalty Point Program
                          </h4>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${f.loyaltyProgramEnabled ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                              <span className="text-xs font-black text-slate-700 font-sans">
                                {f.loyaltyProgramEnabled ? 'ACTIVATED (70% Cashback)' : 'DISABLED'}
                              </span>
                            </div>
                            <span className="text-[9px] bg-blue-600/10 text-blue-800 px-2 py-0.5 rounded-full font-black uppercase font-sans">1 Coin = ₹1</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-2 font-bold leading-relaxed font-sans">
                            {f.loyaltyProgramEnabled 
                              ? 'Customers of this franchise earn loyalty points equal to 70% of the franchise commission on every delivery. Earned points can be redeemed on checkouts.'
                              : 'Loyalty program is currently disabled. Customers will not earn cashback coin benefits or be able to apply existing tokens.'}
                          </p>
                        </div>

                        {/* Activity Logs Audit Trail stream */}
                        <div className="col-span-2 mt-2 bg-slate-50 border border-slate-100 p-5 rounded-3xl text-left">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center justify-between font-sans">
                            <span>📜 Real-Time Audit Log</span>
                            <span className="text-[9px] bg-blue-100 text-blue-700 font-extrabold px-1.5 py-0.5 rounded-md uppercase">Live stream</span>
                          </h4>
                          {f.id && <FranchiseActivityLogs franchiseId={f.id} />}
                        </div>
                     </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}

        {franchises.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
            <Building2 size={48} className="text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No franchisees authorized yet</p>
          </div>
        )}
      </div>

      <AnimatePresence>
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[95vh]"
          >
            <div className="p-8 bg-slate-900 text-white relative flex-shrink-0">
               <button onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 text-white/60 hover:text-white transition-colors" type="button">
                 <X size={24} />
               </button>
               <Building2 size={40} className="mb-4 text-blue-400" />
               <h3 className="text-2xl font-black tracking-tight">{editingFranchiseId ? 'Edit Franchisee' : 'Authorize Franchisee'}</h3>
               <p className="text-white/60 text-sm">{editingFranchiseId ? 'Update details of partner' : 'Grant system access to a new regional partner'}</p>
            </div>

            <form onSubmit={handleAddFranchise} className="p-8 space-y-6 overflow-y-auto">
              <div className="space-y-4">
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block px-2">Franchise Name</label>
                   <div className="relative">
                     <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <input 
                       required
                       value={formData.name}
                       onChange={e => setFormData({...formData, name: e.target.value})}
                       className="w-full h-14 pl-12 pr-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                       placeholder="Enter franchise business name"
                     />
                   </div>
                 </div>

                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block px-2">Proprietor Name</label>
                   <div className="relative">
                     <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <input 
                       required
                       value={formData.proprietorName}
                       onChange={e => setFormData({...formData, proprietorName: e.target.value})}
                       className="w-full h-14 pl-12 pr-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                       placeholder="Enter proprietor full name"
                     />
                   </div>
                 </div>

                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block px-2">Owner Email (Google Account)</label>
                   <div className="relative">
                     <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <input 
                       required
                       type="email"
                       value={formData.email}
                       onChange={e => setFormData({...formData, email: e.target.value.toLowerCase()})}
                       className="w-full h-14 pl-12 pr-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                       placeholder="example@gmail.com"
                     />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block px-2">GST Number</label>
                     <div className="relative">
                       <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                       <input 
                         required
                         value={formData.gstNumber}
                         onChange={e => setFormData({...formData, gstNumber: e.target.value})}
                         className="w-full h-14 pl-12 pr-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                         placeholder="Enter GSTIN"
                       />
                     </div>
                   </div>
                   <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block px-2">Aadhar Number</label>
                     <div className="relative">
                       <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                       <input 
                         required
                         value={formData.aadharNumber}
                         onChange={e => setFormData({...formData, aadharNumber: e.target.value})}
                         className="w-full h-14 pl-12 pr-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                         placeholder="Enter Aadhar"
                       />
                     </div>
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block px-2">Location</label>
                     <div className="relative">
                       <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                       <input 
                         required
                         value={formData.location}
                         onChange={e => setFormData({...formData, location: e.target.value})}
                         className="w-full h-14 pl-12 pr-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                         placeholder="City/Region"
                       />
                     </div>
                   </div>
                   <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block px-2">Commission %</label>
                     <div className="relative">
                       <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                       <input 
                         required
                         type="number"
                         min="0"
                         max="100"
                         value={formData.commissionPercentage}
                         onChange={e => setFormData({...formData, commissionPercentage: Number(e.target.value)})}
                         className="w-full h-14 pl-12 pr-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                       />
                     </div>
                   </div>
                 </div>
                 
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block px-2">GPS Coordinates (HQ Location)</label>
                    <button 
                      type="button"
                      onClick={getCurrentLocation}
                      className="w-full h-12 bg-blue-50 text-blue-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-all text-xs"
                    >
                      <Navigation size={16} />
                      {formData.coordinates ? `Captured: ${formData.coordinates.lat.toFixed(4)}, ${formData.coordinates.lng.toFixed(4)}` : 'Capture Current GPS Location'}
                    </button>
                 </div>

                 {/* Future Testing Switch */}
                 <div className="flex items-center justify-between p-5 bg-amber-50 rounded-2xl border border-amber-100/50 mt-4">
                   <div>
                     <span className="font-bold text-xs text-amber-800 block">Trial / Testing Franchise</span>
                     <span className="text-[10px] text-amber-600 block">Deploy sandbox simulated logins and demo mock driver apps.</span>
                   </div>
                   <label className="relative inline-flex items-center cursor-pointer">
                     <input 
                       type="checkbox" 
                       checked={formData.isTesting}
                       onChange={e => setFormData({ ...formData, isTesting: e.target.checked })}
                       className="sr-only peer"
                     />
                     <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                   </label>
                 </div>
              </div>

                  {/* Super Admin Service Selection Toggles */}
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 mt-4">
                    <span className="font-bold text-xs text-slate-950 block mb-1 font-sans">Ecosystem Service Offerings</span>
                    <span className="text-[10px] text-slate-400 font-semibold block mb-4">Set which service products this franchise is authorized to sell and deliver.</span>
                    
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 font-sans">Water Tanker</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.superAdminServices?.tanker}
                            onChange={e => setFormData({ 
                              ...formData, 
                              superAdminServices: { ...formData.superAdminServices || { tanker: true, can: true, bottle: true }, tanker: e.target.checked }
                            })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                        <span className="text-xs font-bold text-slate-700 font-sans">20L RO Water Can</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.superAdminServices?.can}
                            onChange={e => setFormData({ 
                              ...formData, 
                              superAdminServices: { ...formData.superAdminServices || { tanker: true, can: true, bottle: true }, can: e.target.checked }
                            })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                        <span className="text-xs font-bold text-slate-700 font-sans">Packaged Water Bottles</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.superAdminServices?.bottle}
                            onChange={e => setFormData({ 
                              ...formData, 
                              superAdminServices: { ...formData.superAdminServices || { tanker: true, can: true, bottle: true }, bottle: e.target.checked }
                            })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Super Admin Loyalty Program Switch */}
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 mt-4">
                    <span className="font-bold text-xs text-slate-950 block mb-1 font-sans">🎁 Customer Loyalty Point Program</span>
                    <span className="text-[10px] text-slate-400 font-semibold block mb-4">Enable 70% Franchise Commission cash back in loyalty tokens for customers on delivery.</span>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 font-sans">Loyalty Coins (70% Comm. Cash Back)</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={formData.loyaltyProgramEnabled}
                          onChange={e => setFormData({ 
                            ...formData, 
                            loyaltyProgramEnabled: e.target.checked
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>

                  {/* Super Admin Allow System Maintenance Toggle */}
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 mt-4">
                    <span className="font-bold text-xs text-slate-950 block mb-1 font-sans">🛡️ System Maintenance Connection</span>
                    <span className="text-[10px] text-slate-400 font-semibold block mb-4">Allow this franchise administrator to access full system maintenance, master database reset, and data deletion tools.</span>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 font-sans">Allow System Maintenance</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={formData.allowSystemMaintenance}
                          onChange={e => setFormData({ 
                            ...formData, 
                            allowSystemMaintenance: e.target.checked
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>

              <div className="flex gap-4 pt-4 sticky bottom-0 bg-white shadow-[0_-20px_20px_-10px_rgba(255,255,255,1)]">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 h-14 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all border border-slate-100"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex-[2] h-14 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ShieldCheck size={20} />}
                  Authorize Now
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
          if (deleteConfirm) {
            handleDeleteFranchise(deleteConfirm.id);
            setDeleteConfirm(null);
          }
        }}
        title="Delete Franchisee?"
        message={`Are you sure you want to delete franchisee "${deleteConfirm?.name}"? All related access will be revoked immediately and irreversibly.`}
      />
    </div>
  );
}

function FranchiseActivityLogs({ franchiseId }: { franchiseId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'activities'),
      where('franchiseId', '==', franchiseId),
      orderBy('createdAt', 'desc'),
      limit(6)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(items);
      setLoading(false);
    }, (err) => {
      console.error("Error loading activity auditing trail:", err);
      // Fallback in case orderBy fails due to missing composite index in Firestore
      // Fetch without orderBy, and sort client-side
      try {
        const qFallback = query(
          collection(db, 'activities'),
          where('franchiseId', '==', franchiseId),
          limit(30)
        );
        onSnapshot(qFallback, (fallbackSnap) => {
          const fallbackItems = fallbackSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          const sorted = [...fallbackItems].sort((a: any, b: any) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });
          setLogs(sorted.slice(0, 6));
          setLoading(false);
        });
      } catch (innerErr) {
        console.error("Fallback error:", innerErr);
        setLoading(false);
      }
    });
    return () => unsub();
  }, [franchiseId]);

  if (loading) {
    return <p className="text-[10px] text-slate-400 font-bold block">Loading logs stream...</p>;
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-4 bg-white rounded-2xl border border-slate-100">
        <p className="text-[11px] text-slate-400 font-semibold italic">No direct logs recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {logs.map((log: any) => {
        const timeStr = log.createdAt?.seconds 
          ? new Date(log.createdAt.seconds * 1000).toLocaleString() 
          : 'Just now...';
        return (
          <div key={log.id} className="bg-white p-3 rounded-2xl border border-slate-100 text-[11px] hover:border-blue-100 transition-colors">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                log.actionType === 'RATE_CHANGE' ? 'bg-amber-100 text-amber-700' :
                log.actionType === 'SERVICE_TOGGLE' ? 'bg-indigo-100 text-indigo-750' :
                log.actionType === 'NEW_BILL' ? 'bg-green-100 text-green-700' :
                log.actionType === 'FRANCHISE_CREATED' ? 'bg-rose-100 text-rose-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {log.actionType || 'General'}
              </span>
              <span className="text-[9px] font-bold text-slate-400">{timeStr}</span>
            </div>
            <p className="font-bold text-slate-800 leading-normal mb-1">{log.description}</p>
            {log.userEmail && <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">By: {log.userEmail}</span>}
          </div>
        );
      })}
    </div>
  );
}
