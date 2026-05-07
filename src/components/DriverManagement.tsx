import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { Driver } from '../types';
import { Plus, Phone, User, Trash2, X, Truck, Navigation, Share2, Map as MapIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmationModal } from './ConfirmationModal';
import { DriverTrackingAdmin } from './DriverTrackingAdmin';

export function DriverManagement() {
  const [isAdding, setIsAdding] = useState(false);
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: '', mobile: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);

  const [drivers, setDrivers] = useState<Driver[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'drivers'));
    return onSnapshot(q, 
      (snapshot) => setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'drivers')
    );
  }, []);

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
      // Ignore abort errors from share sheet
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
      await addDoc(collection(db, 'drivers'), {
        ...newDriver,
        mobile: newDriver.mobile.replace(/\D/g, '')
      });
      setNewDriver({ name: '', mobile: '' });
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'drivers');
    }
  };

  const deleteDriver = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'drivers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `drivers/${id}`);
    }
  };

  return (
    <div className="pb-24 max-w-4xl mx-auto">
      <div className="p-4 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Tanker Drivers</h1>
            <p className="text-slate-500 text-sm">{drivers?.length || 0} active drivers</p>
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

        <div className="grid gap-4 md:grid-cols-2">
          {drivers?.map((driver) => (
            <motion.div
              key={driver.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="material-card group hover:border-blue-100 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                    <User size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{driver.name}</h3>
                    <p className="text-slate-400 text-xs font-mono">+91 {driver.mobile}</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleShareTrackingLink(driver)}
                    className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-100 transition-colors"
                    title="Share Tracking Link"
                  >
                    <Share2 size={18} />
                  </button>
                  <a 
                    href={`tel:${driver.mobile}`}
                    className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-green-100 hover:scale-110 active:scale-95 transition-transform"
                  >
                    <Phone size={18} />
                  </a>
                  <button 
                    onClick={() => driver.id && setDeleteConfirm({ id: driver.id, name: driver.name })}
                    className="w-10 h-10 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}

          {drivers?.length === 0 && (
            <div className="md:col-span-2 py-20 text-center flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                <Truck size={40} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">No Drivers Registered</h3>
                <p className="text-slate-500 text-sm">Add your tanker drivers to contact them quickly.</p>
              </div>
              <button 
                onClick={() => setIsAdding(true)}
                className="material-btn material-btn-primary"
              >
                <Plus size={20} /> Add Driver
              </button>
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
        title="Delete Driver?"
        message={`Are you sure you want to delete ${deleteConfirm?.name}? This action cannot be undone.`}
      />

      {showLiveMap && (
        <DriverTrackingAdmin onClose={() => setShowLiveMap(false)} />
      )}
    </div>
  );
}
