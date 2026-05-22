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
  setDoc
} from 'firebase/firestore';
import { Franchise, Bill } from '../types';
import { formatCurrency } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { ledgerAutomation } from '../services/ledgerAutomation';

export function FranchiseManagement({ onSelectFranchise }: { onSelectFranchise?: (f: Franchise | null) => void }) {
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFranchiseBills, setSelectedFranchiseBills] = useState<Bill[]>([]);
  const [viewStatsId, setViewStatsId] = useState<string | null>(null);
  const [editingFranchiseId, setEditingFranchiseId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    location: '',
    coordinates: null as { lat: number, lng: number } | null,
    commissionPercentage: 5,
    gstNumber: '',
    proprietorName: '',
    aadharNumber: ''
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
        const existingEmails = snap.docs.map(d => d.data().email);
        
        const legacy = [
          { id: "legacy-rajhans", name: "Rajhans Steel and Water", email: "rajhanssikar@gmail.com", location: "Sikar" },
          { id: "legacy-pile", name: "Rajhans Pile Foundation", email: "rajhanspilefoundation@gmail.com", location: "Sikar" }
        ];

        for (const leg of legacy) {
          if (!existingEmails.includes(leg.email)) {
            await setDoc(doc(db, 'franchises', leg.id), {
              name: leg.name,
              email: leg.email,
              location: leg.location,
              commissionPercentage: 5,
              status: 'Active',
              authorizedBy: 'System',
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
        await updateDoc(doc(db, 'franchises', editingFranchiseId), {
           ...formData,
           updatedAt: serverTimestamp()
        });
      } else {
        const newFranchiseRef = await addDoc(collection(db, 'franchises'), {
          ...formData,
          status: 'Active',
          authorizedBy: auth.currentUser?.email || 'System',
          createdAt: serverTimestamp()
        });
        
        // Auto-provision default ledger accounts (Cash, Bank, Service Income) for this franchise
        await ledgerAutomation.setupFranchiseLedgers(newFranchiseRef.id, formData.name);
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
      gstNumber: '', proprietorName: '', aadharNumber: '' 
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
      aadharNumber: f.aadharNumber || ''
    });
    setShowAddModal(true);
  };

  const handleAddNewFranchise = () => {
    setEditingFranchiseId(null);
    resetForm();
    setShowAddModal(true);
  };

  const handleDeleteFranchise = async (id: string) => {
    if (!confirm('Are you sure you want to remove this franchisee? All related access will be revoked immediately.')) return;
    try {
      await deleteDoc(doc(db, 'franchises', id));
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
                    onClick={() => handleDeleteFranchise(f.id!)}
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
                     f.status === 'Active' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                   }`}>
                     {f.status}
                   </span>
                </div>
              </div>

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
    </div>
  );
}
