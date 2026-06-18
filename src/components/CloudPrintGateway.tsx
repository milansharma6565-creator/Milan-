import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { Printer, Volume2, VolumeX, History, CheckCircle, RefreshCw, X, CloudLightning, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ThermalInvoice } from './ThermalInvoice';
import { printThermalReceipt } from '../lib/printUtils';
import { formatCurrency } from '../constants';

interface CloudPrintGatewayProps {
  franchiseId: string;
  userName: string;
}

export default function CloudPrintGateway({ franchiseId, userName }: CloudPrintGatewayProps) {
  const [isListening, setIsListening] = useState<boolean>(() => {
    return localStorage.getItem(`cloud_print_active_${franchiseId}`) === 'true';
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [pendingJobs, setPendingJobs] = useState<any[]>([]);
  const [historyJobs, setHistoryJobs] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  // Play a reliable dual-tone ding chime using Web Audio API (avoids missing asset files)
  const triggerAlarmSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Tone 1
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      gain1.gain.setValueAtTime(0.3, audioCtx.currentTime);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.15);
      
      // Tone 2
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gain2.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.3);
      }, 180);
    } catch (e) {
      console.warn("Audio Context sound failed:", e);
    }
  };

  // Persist listener state
  useEffect(() => {
    localStorage.setItem(`cloud_print_active_${franchiseId}`, String(isListening));
  }, [isListening, franchiseId]);

  // Real-time listener for Pending print jobs
  useEffect(() => {
    if (!isListening || !franchiseId) {
      setPendingJobs([]);
      return;
    }

    const q = query(
      collection(db, 'print_jobs'),
      where('franchiseId', '==', franchiseId),
      where('status', '==', 'pending')
    );

    const unsub = onSnapshot(q, (snap) => {
      const jobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort client-side by createdAt asc
      jobs.sort((a: any, b: any) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tA - tB;
      });

      // Beep if a new pending job is added
      if (jobs.length > pendingJobs.length && jobs.length > 0) {
        triggerAlarmSound();
      }
      setPendingJobs(jobs);
    }, (err) => {
      console.error("Cloud Print Listener Error:", err);
    });

    return () => unsub();
  }, [isListening, franchiseId, pendingJobs.length, soundEnabled]);

  // Real-time listener for Past Printed Jobs (History)
  useEffect(() => {
    if (!franchiseId) return;

    const q = query(
      collection(db, 'print_jobs'),
      where('franchiseId', '==', franchiseId),
      where('status', '==', 'completed')
    );

    const unsub = onSnapshot(q, (snap) => {
      const jobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort client-side by createdAt desc and limit to 10
      jobs.sort((a: any, b: any) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA; // desc
      });

      setHistoryJobs(jobs.slice(0, 10));
    }, (err) => {
      console.error("Cloud Print History Listener Error:", err);
    });

    return () => unsub();
  }, [franchiseId]);

  // Handle direct printing and status updating
  const handlePrintJob = async (job: any) => {
    if (isPrinting || !printContainerRef.current) return;
    setIsPrinting(true);
    try {
      // 1. Trigger the thermal page printing sequence
      await printThermalReceipt(printContainerRef.current);
      
      // 2. Mark this job as completed in DB
      await updateDoc(doc(db, 'print_jobs', job.id), {
        status: 'completed',
        printedAt: serverTimestamp(),
        printedBy: userName || 'Desktop Client'
      });
    } catch (err: any) {
      console.error("Cloud print processing failed:", err);
      alert("Print failed: " + (err.message || String(err)));
    } finally {
      setIsPrinting(false);
    }
  };

  // Dismiss / Cancel print job
  const handleCancelJob = async (jobId: string) => {
    if (window.confirm("Do you want to cancel and remove this remote print job?")) {
      try {
        await updateDoc(doc(db, 'print_jobs', jobId), {
          status: 'cancelled',
          cancelledAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Failed to cancel job:", err);
      }
    }
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm relative overflow-hidden">
      {/* Background soft styling representing clouds & printer */}
      <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
        <Printer size={120} className="text-blue-500" />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-4 mb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Printer className="text-blue-600 animate-pulse" size={22} />
            Desktop Print Gateway
            <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-0.5 rounded-full font-bold">क्लाउड प्रिंटर</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium">Auto-receive & print bills sent from your mobile phone</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border transition-all ${
              soundEnabled 
                ? 'bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100' 
                : 'bg-red-50 border-red-100 text-red-500'
            }`}
            title={soundEnabled ? "Disable Alert Chime" : "Enable Alert Chime"}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-2.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-bold ${
              showHistory 
                ? 'bg-blue-50 border-blue-100 text-blue-600' 
                : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History size={15} />
            Logs
          </button>

          {/* Master Listener Toggle Button */}
          <button
            onClick={() => setIsListening(!isListening)}
            className={`px-5 py-2.5 rounded-xl font-bold uppercase text-xs tracking-wider border transition-all shadow-sm flex items-center gap-1.5 cursor-pointer ${
              isListening
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isListening ? 'bg-white animate-ping' : 'bg-slate-400'}`} />
            {isListening ? 'Gateway ON' : 'Turn Gateway ON'}
          </button>
        </div>
      </div>

      {/* Warning if disabled */}
      {!isListening && (
        <div className="bg-slate-50 border border-slate-100/80 rounded-2xl p-5 text-center flex flex-col items-center justify-center min-h-[140px]">
          <CloudLightning size={32} className="text-slate-300 mb-2.5" />
          <h3 className="text-sm font-bold text-slate-700">Remote Print Gateway is Offline</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Toggling **"Gateway ON"** enables this desktop computer to listen and auto-print when you request bills to be printed from your mobile app while working on-field.
          </p>
        </div>
      )}

      {/* Main Realtime Print Queue Card Popups */}
      {isListening && (
        <div className="space-y-3">
          {pendingJobs.length === 0 ? (
            <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-2xl p-5 text-center flex flex-col items-center justify-center min-h-[140px]">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2 animate-bounce">
                <CheckCircle size={20} />
              </div>
              <h3 className="text-sm font-bold text-emerald-800">Listening to Cloud Print Queue</h3>
              <p className="text-xs text-emerald-600/80 mt-0.5">
                All clear! Send a remote print command from your mobile phone to print instant bills.
              </p>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-150 rounded-2xl p-6 relative overflow-hidden animate-pulse shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
                    <Printer size={24} />
                  </div>
                  <div>
                    <div className="text-[9px] font-black uppercase text-red-500 tracking-[0.2em]">Remote Print Command</div>
                    <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                      Bill No {pendingJobs[0].billNumber} for {pendingJobs[0].customerName}
                    </h3>
                    <p className="text-xs text-slate-550 mt-1 font-medium">
                      Billing Amount: <span className="font-extrabold text-slate-900">{formatCurrency(pendingJobs[0].billData?.grandTotal || pendingJobs[0].billData?.totalAmount || 0)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2.5 py-0.5 rounded-full uppercase">Pending...</span>
                  <button 
                    onClick={() => handleCancelJob(pendingJobs[0].id)}
                    className="p-1 px-2.5 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded-lg text-[10px] font-bold transition flex items-center gap-1 border border-slate-150"
                  >
                    <X size={10} /> Cancel Job
                  </button>
                </div>
              </div>

              {/* Render bill secretly inside visible desktop frame so refs can extract HTML content to modern iframe print system */}
              <div className="mt-5 border-t border-red-200/60 pt-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="hidden">
                  <div ref={printContainerRef}>
                    {pendingJobs[0]?.billData && <ThermalInvoice bill={pendingJobs[0].billData} />}
                  </div>
                </div>

                <button
                  onClick={() => handlePrintJob(pendingJobs[0])}
                  disabled={isPrinting}
                  className="w-full h-14 bg-red-600 hover:bg-red-700 text-white rounded-xl font-extrabold shadow-lg shadow-red-100 flex items-center justify-center gap-3 active:scale-95 text-sm uppercase tracking-wider transition-all cursor-pointer border border-red-700"
                >
                  {isPrinting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                      <span>Printing Page...</span>
                    </>
                  ) : (
                    <>
                      <Printer size={18} strokeWidth={2.5} />
                      <span>Print Thermal Bill Now (प्रिंट दबाएं) 📞</span>
                    </>
                  )}
                </button>
                
                {pendingJobs.length > 1 && (
                  <div className="text-xs font-black text-rose-700 animate-pulse uppercase tracking-wider text-center shrink-0">
                    +{pendingJobs.length - 1} more jobs in queue
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Print History Logs Section */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 border-t border-slate-100 pt-5 overflow-hidden"
          >
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">Recent Remote Prints</h3>
            {historyJobs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No past jobs registered in this session.</p>
            ) : (
              <div className="divide-y divide-slate-50 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                {historyJobs.map((job) => (
                  <div key={job.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span>#{job.billNumber}</span>
                        <span className="text-slate-400">•</span>
                        <span className="truncate max-w-[120px]">{job.customerName}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Printed on: {job.printedAt ? new Date(job.printedAt.seconds * 1000).toLocaleTimeString() : 'N/A'} by {job.printedBy}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-slate-900">{formatCurrency(job.billData?.grandTotal || job.billData?.totalAmount || 0)}</span>
                      <span className="p-1 rounded bg-emerald-50 text-emerald-600 font-bold text-[9px] uppercase tracking-wider flex items-center gap-0.5">
                        <CheckCircle size={10} /> Ok
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
