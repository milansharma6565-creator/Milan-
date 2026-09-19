import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GitMerge, 
  ArrowRightLeft, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Phone, 
  MapPin, 
  IndianRupee, 
  FileText, 
  Truck, 
  Info,
  Sparkles
} from 'lucide-react';
import { Customer, Account } from '../types';
import { formatCurrency } from '../constants';
import { customerMergeService, MergeResult } from '../services/customerMergeService';

interface CustomerMergeModalProps {
  customers: Customer[];
  accounts: Account[];
  initialPrimaryCustomer?: Customer | null;
  initialSecondaryCustomer?: Customer | null;
  franchiseId?: string;
  userEmail?: string;
  onClose: () => void;
  onSuccess: (result: MergeResult, primaryName: string, secondaryName: string) => void;
}

export function CustomerMergeModal({
  customers,
  accounts,
  initialPrimaryCustomer,
  initialSecondaryCustomer,
  franchiseId,
  userEmail,
  onClose,
  onSuccess
}: CustomerMergeModalProps) {
  const [primaryCustomer, setPrimaryCustomer] = useState<Customer | null>(initialPrimaryCustomer || null);
  const [secondaryCustomer, setSecondaryCustomer] = useState<Customer | null>(initialSecondaryCustomer || null);
  
  const [primarySearch, setPrimarySearch] = useState('');
  const [secondarySearch, setSecondarySearch] = useState('');

  const [selectedAddressChoice, setSelectedAddressChoice] = useState<'primary' | 'secondary'>('primary');
  const [selectedVehicleChoice, setSelectedVehicleChoice] = useState<'primary' | 'secondary'>('primary');
  const [mergeNotes, setMergeNotes] = useState(true);

  const [isMerging, setIsMerging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Helper to calculate current pending balance accurately using accounts
  const getCustomerPending = (c: Customer | null): number => {
    if (!c) return 0;
    const acc = accounts.find(a => a.customerId === c.id || a.name.trim().toLowerCase() === c.name.trim().toLowerCase());
    if (acc) {
      return acc.balanceType === 'Dr' ? (acc.currentBalance || 0) : -(acc.currentBalance || 0);
    }
    return c.pendingAmount || 0;
  };

  const primaryPending = useMemo(() => getCustomerPending(primaryCustomer), [primaryCustomer, accounts]);
  const secondaryPending = useMemo(() => getCustomerPending(secondaryCustomer), [secondaryCustomer, accounts]);
  const cumulativePending = primaryPending + secondaryPending;

  // Filter lists for selectors
  const filteredPrimaryOptions = useMemo(() => {
    const term = primarySearch.toLowerCase().trim();
    return customers.filter(c => {
      if (secondaryCustomer && c.id === secondaryCustomer.id) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.mobile.includes(term) ||
        (c.secondaryMobiles?.some(m => m.includes(term)) || false)
      );
    });
  }, [customers, primarySearch, secondaryCustomer]);

  const filteredSecondaryOptions = useMemo(() => {
    const term = secondarySearch.toLowerCase().trim();
    return customers.filter(c => {
      if (primaryCustomer && c.id === primaryCustomer.id) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.mobile.includes(term) ||
        (c.secondaryMobiles?.some(m => m.includes(term)) || false)
      );
    });
  }, [customers, secondarySearch, primaryCustomer]);

  const handleSwap = () => {
    const temp = primaryCustomer;
    setPrimaryCustomer(secondaryCustomer);
    setSecondaryCustomer(temp);
  };

  const handleMergeSubmit = async () => {
    if (!primaryCustomer || !secondaryCustomer) {
      setErrorMessage('Please select both primary and secondary customers.');
      return;
    }
    if (primaryCustomer.id === secondaryCustomer.id) {
      setErrorMessage('Primary and secondary customers cannot be the same person.');
      return;
    }

    setIsMerging(true);
    setErrorMessage(null);

    try {
      const addressToKeep = selectedAddressChoice === 'secondary' && secondaryCustomer.address
        ? secondaryCustomer.address
        : (primaryCustomer.address || secondaryCustomer.address || '');

      const vehicleToKeep = selectedVehicleChoice === 'secondary' && secondaryCustomer.vehicleNumber
        ? secondaryCustomer.vehicleNumber
        : (primaryCustomer.vehicleNumber || secondaryCustomer.vehicleNumber || '');

      const result = await customerMergeService.mergeCustomers({
        primaryCustomer,
        secondaryCustomer,
        selectedAddress: addressToKeep,
        selectedVehicle: vehicleToKeep,
        mergeNotes,
        franchiseId,
        userEmail
      });

      onSuccess(result, primaryCustomer.name, secondaryCustomer.name);
    } catch (err: any) {
      console.error('Merge Customer Error:', err);
      setErrorMessage(err?.message || 'Failed to merge customers. Please try again.');
      setIsMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
              <GitMerge size={24} />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-slate-900 leading-tight">
                Merge Customer Accounts
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Combine duplicate profiles, bills, ledger entries, and cumulative balance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isMerging}
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <XCircle size={22} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm font-bold">
              <AlertTriangle size={20} className="shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Customer Selection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
            {/* Primary Customer (Target) */}
            <div className="bg-blue-50/40 border-2 border-blue-200 rounded-3xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black tracking-wider uppercase px-2.5 py-1 bg-blue-600 text-white rounded-lg shadow-xs">
                  1. Master Profile (Keep)
                </span>
                <span className="text-[10px] text-blue-700 font-bold">यह ग्राहक रहेगा</span>
              </div>

              {!primaryCustomer ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search name or mobile..."
                      className="w-full h-11 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={primarySearch}
                      onChange={e => setPrimarySearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-1 bg-white">
                    {filteredPrimaryOptions.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">No matching customer found</div>
                    ) : (
                      filteredPrimaryOptions.slice(0, 15).map(c => {
                        const pend = getCustomerPending(c);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setPrimaryCustomer(c);
                              setPrimarySearch('');
                            }}
                            className="w-full text-left p-2 hover:bg-blue-50 rounded-lg flex items-center justify-between transition-colors"
                          >
                            <div>
                              <div className="font-bold text-xs text-slate-800">{c.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">+91 {c.mobile}</div>
                            </div>
                            <div className={`text-xs font-bold ${pend > 0 ? 'text-red-500' : 'text-green-600'}`}>
                              {formatCurrency(pend)}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-blue-100 rounded-2xl p-4 relative shadow-xs">
                  <button
                    onClick={() => setPrimaryCustomer(null)}
                    className="absolute top-3 right-3 text-[10px] text-blue-600 hover:underline font-bold"
                  >
                    Change
                  </button>
                  <h4 className="font-black text-base text-slate-900">{primaryCustomer.name}</h4>
                  <div className="flex items-center gap-1.5 text-xs text-blue-700 font-mono font-bold mt-1">
                    <Phone size={12} /> +91 {primaryCustomer.mobile}
                  </div>
                  {primaryCustomer.secondaryMobiles && primaryCustomer.secondaryMobiles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {primaryCustomer.secondaryMobiles.map(num => (
                        <span key={num} className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                          +91 {num}
                        </span>
                      ))}
                    </div>
                  )}
                  {primaryCustomer.address && (
                    <div className="flex items-start gap-1 text-[11px] text-slate-500 mt-2">
                      <MapPin size={12} className="shrink-0 mt-0.5 text-slate-400" />
                      <span className="line-clamp-2">{primaryCustomer.address}</span>
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Current Dues</span>
                    <span className={`text-sm font-black ${primaryPending > 0 ? 'text-red-500' : 'text-green-600'}`}>
                      {formatCurrency(primaryPending)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Swap Button (floating in middle on desktop) */}
            {primaryCustomer && secondaryCustomer && (
              <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <button
                  type="button"
                  onClick={handleSwap}
                  className="w-10 h-10 rounded-full bg-white border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 shadow-md flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                  title="Swap Primary & Secondary"
                >
                  <ArrowRightLeft size={16} />
                </button>
              </div>
            )}

            {/* Secondary Customer (Source to merge & delete) */}
            <div className="bg-amber-50/40 border-2 border-amber-200 rounded-3xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black tracking-wider uppercase px-2.5 py-1 bg-amber-600 text-white rounded-lg shadow-xs">
                  2. Duplicate Profile (Merge & Remove)
                </span>
                <span className="text-[10px] text-amber-700 font-bold">यह मर्ज होगा</span>
              </div>

              {!secondaryCustomer ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search name or mobile..."
                      className="w-full h-11 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                      value={secondarySearch}
                      onChange={e => setSecondarySearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-1 bg-white">
                    {filteredSecondaryOptions.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">No matching customer found</div>
                    ) : (
                      filteredSecondaryOptions.slice(0, 15).map(c => {
                        const pend = getCustomerPending(c);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSecondaryCustomer(c);
                              setSecondarySearch('');
                            }}
                            className="w-full text-left p-2 hover:bg-amber-50 rounded-lg flex items-center justify-between transition-colors"
                          >
                            <div>
                              <div className="font-bold text-xs text-slate-800">{c.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">+91 {c.mobile}</div>
                            </div>
                            <div className={`text-xs font-bold ${pend > 0 ? 'text-red-500' : 'text-green-600'}`}>
                              {formatCurrency(pend)}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-amber-100 rounded-2xl p-4 relative shadow-xs">
                  <button
                    onClick={() => setSecondaryCustomer(null)}
                    className="absolute top-3 right-3 text-[10px] text-amber-600 hover:underline font-bold"
                  >
                    Change
                  </button>
                  <h4 className="font-black text-base text-slate-900">{secondaryCustomer.name}</h4>
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 font-mono font-bold mt-1">
                    <Phone size={12} /> +91 {secondaryCustomer.mobile}
                  </div>
                  {secondaryCustomer.secondaryMobiles && secondaryCustomer.secondaryMobiles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {secondaryCustomer.secondaryMobiles.map(num => (
                        <span key={num} className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                          +91 {num}
                        </span>
                      ))}
                    </div>
                  )}
                  {secondaryCustomer.address && (
                    <div className="flex items-start gap-1 text-[11px] text-slate-500 mt-2">
                      <MapPin size={12} className="shrink-0 mt-0.5 text-slate-400" />
                      <span className="line-clamp-2">{secondaryCustomer.address}</span>
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Current Dues</span>
                    <span className={`text-sm font-black ${secondaryPending > 0 ? 'text-red-500' : 'text-green-600'}`}>
                      {formatCurrency(secondaryPending)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Swap Button */}
          {primaryCustomer && secondaryCustomer && (
            <div className="flex md:hidden justify-center -my-2">
              <button
                type="button"
                onClick={handleSwap}
                className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
              >
                <ArrowRightLeft size={14} /> Swap Primary & Secondary
              </button>
            </div>
          )}

          {/* Cumulative Ledger & Balance Summary Banner */}
          {primaryCustomer && secondaryCustomer && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900 text-white rounded-3xl p-5 shadow-xl space-y-4"
            >
              <div className="flex items-center gap-2 text-blue-400 text-xs font-black uppercase tracking-wider">
                <Sparkles size={16} />
                <span>Cumulative Ledger & Balance Calculation (नया संयुक्त हिसाब)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">{primaryCustomer.name} Dues</div>
                  <div className="text-base font-black text-blue-400">{formatCurrency(primaryPending)}</div>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">{secondaryCustomer.name} Dues</div>
                  <div className="text-base font-black text-amber-400">{formatCurrency(secondaryPending)}</div>
                </div>
                <div className="bg-blue-950/80 p-3 rounded-2xl border border-blue-700/50">
                  <div className="text-[10px] text-blue-300 font-bold uppercase">New Cumulative Dues</div>
                  <div className={`text-xl font-black ${cumulativePending > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatCurrency(cumulativePending)}
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-300 bg-slate-800/40 p-3 rounded-2xl border border-slate-700/40">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <span>
                    <strong>Mobile Numbers Combined:</strong> Both +91 {primaryCustomer.mobile} and +91 {secondaryCustomer.mobile} will be linked to {primaryCustomer.name}. Searching or billing with either number will find this customer.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <span>
                    <strong>Ledger & Bills Merged:</strong> All delivery bills, vouchers, and transactions will now be under {primaryCustomer.name}'s ledger account with running balance synced.
                  </span>
                </div>
              </div>

              {/* Merge Preferences */}
              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Preferences (प्राथमिकताएं)
                </div>

                {primaryCustomer.address && secondaryCustomer.address && primaryCustomer.address !== secondaryCustomer.address && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-800/50 p-3 rounded-xl">
                    <span className="text-xs text-slate-300">Keep Address:</span>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedAddressChoice('primary')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                          selectedAddressChoice === 'primary' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {primaryCustomer.name}'s Address
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAddressChoice('secondary')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                          selectedAddressChoice === 'secondary' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {secondaryCustomer.name}'s Address
                      </button>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={mergeNotes}
                    onChange={e => setMergeNotes(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500"
                  />
                  <span>Combine notes / remarks from both customers</span>
                </label>
              </div>
            </motion.div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info size={14} className="text-slate-400 shrink-0" />
            <span>
              {primaryCustomer && secondaryCustomer 
                ? `Ready to merge "${secondaryCustomer.name}" into "${primaryCustomer.name}"`
                : 'Select both primary and secondary customers to proceed'}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isMerging}
              className="flex-1 sm:flex-initial px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMergeSubmit}
              disabled={!primaryCustomer || !secondaryCustomer || isMerging}
              className="flex-1 sm:flex-initial px-7 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {isMerging ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Merging Accounts...</span>
                </>
              ) : (
                <>
                  <GitMerge size={16} />
                  <span>Confirm & Merge Customers</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
