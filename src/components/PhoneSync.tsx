import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  MessageSquare, 
  Smartphone, 
  Search, 
  Clock, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed, 
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertCircle,
  Copy,
  CheckCircle2,
  ExternalLink,
  Filter,
  X
} from 'lucide-react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, limit, Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../firebase';

interface CallLog {
  id: string;
  number: string;
  name: string;
  type: 'Incoming' | 'Outgoing' | 'Missed' | 'Rejected';
  duration: number;
  timestamp: string | Timestamp;
  createdAt: string;
}

interface SMSLog {
  id: string;
  address: string;
  body: string;
  timestamp: string | Timestamp;
  type: 'Inbox' | 'Sent';
  createdAt: string;
}

export function PhoneSync() {
  const [activeSubTab, setActiveSubTab] = useState<'calls' | 'sms'>('calls');
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [smsLogs, setSmsLogs] = useState<SMSLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubCalls = onSnapshot(
      query(collection(db, 'callLogs'), orderBy('timestamp', 'desc'), limit(100)),
      (snapshot) => {
        setCallLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallLog)));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'callLogs')
    );

    const unsubSMS = onSnapshot(
      query(collection(db, 'smsLogs'), orderBy('timestamp', 'desc'), limit(100)),
      (snapshot) => {
        setSmsLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SMSLog)));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'smsLogs')
    );

    return () => {
      unsubCalls();
      unsubSMS();
    };
  }, []);

  const filteredCalls = callLogs.filter(log => 
    log.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.name && log.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredSMS = smsLogs.filter(log => 
    log.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.body.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (ts: any) => {
    if (!ts) return 'N/A';
    const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
    return format(date, 'hh:mm a');
  };

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
    return format(date, 'dd MMM yyyy');
  };

  const getCallIcon = (type: string) => {
    switch (type) {
      case 'Incoming': return <PhoneIncoming className="text-green-500" size={18} />;
      case 'Outgoing': return <PhoneOutgoing className="text-blue-500" size={18} />;
      case 'Missed': return <PhoneMissed className="text-red-500" size={18} />;
      default: return <Phone className="text-slate-400" size={18} />;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[2.5rem] font-display font-black text-slate-900 leading-none mb-2">Business Phone</h1>
          <p className="text-slate-500 font-medium flex items-center gap-2">
            <Smartphone size={16} />
            Live call & SMS sync from your device
          </p>
        </div>
        <button 
          onClick={() => setShowSetup(true)}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-transform active:scale-95 shadow-lg shadow-slate-200"
        >
          <Smartphone size={18} />
          Sync Setup
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveSubTab('calls')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeSubTab === 'calls' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Phone size={18} />
          Call Logs
        </button>
        <button
          onClick={() => setActiveSubTab('sms')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeSubTab === 'sms' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <MessageSquare size={18} />
          SMS History
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by number or name..."
            className="w-full bg-slate-50 border-none rounded-xl h-12 pl-12 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="h-12 w-12 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-all">
            <Filter size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 gap-4">
        {activeSubTab === 'calls' ? (
          filteredCalls.length > 0 ? (
            filteredCalls.map((log) => (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={log.id}
                className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:border-blue-100 transition-colors"
              >
                <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                  {getCallIcon(log.type)}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    {log.name || log.number}
                    {log.name && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase">{log.number}</span>}
                  </h3>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={12} />
                      {formatTime(log.timestamp)}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDate(log.timestamp)}
                    </span>
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                      {log.duration}s
                    </span>
                  </div>
                </div>
                <button className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                  <ArrowUpRight size={18} />
                </button>
              </motion.div>
            ))
          ) : (
            <div className="bg-white p-20 rounded-[3rem] border border-dashed border-slate-200 text-center">
              <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-6 text-slate-300">
                <Phone size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">No Call Records</h3>
              <p className="text-slate-500 max-w-xs mx-auto">Call logs will appear here once you setup the sync on your device.</p>
            </div>
          )
        ) : (
          filteredSMS.length > 0 ? (
            filteredSMS.map((log) => (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={log.id}
                className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3 group hover:border-blue-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                      <MessageSquare size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{log.address}</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock size={10} />
                          {formatTime(log.timestamp)}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 text-xs">
                          {formatDate(log.timestamp)}
                        </span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${log.type === 'Inbox' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                          {log.type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl text-sm text-slate-700 font-medium">
                  {log.body}
                </div>
              </motion.div>
            ))
          ) : (
            <div className="bg-white p-20 rounded-[3rem] border border-dashed border-slate-200 text-center">
              <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-6 text-slate-300">
                <MessageSquare size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">No SMS Records</h3>
              <p className="text-slate-500 max-w-xs mx-auto">Your business messages will be displayed here in real-time.</p>
            </div>
          )
        )}
      </div>

      {/* Setup Modal */}
      <AnimatePresence>
        {showSetup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowSetup(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">Sync Setup</h2>
                    <p className="text-slate-500 font-medium">Follow these steps to connect your phone</p>
                  </div>
                </div>
                <button onClick={() => setShowSetup(false)} className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-all">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 max-h-[60vh] overflow-y-auto">
                <div className="space-y-8">
                  <div className="flex gap-6">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black flex-shrink-0">1</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">Download Sync App</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Install <span className="font-bold text-slate-900">MacroDroid</span> or <span className="font-bold text-slate-900">SMS Gateway</span> from Google Play Store on your business phone.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-6">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black flex-shrink-0">2</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">Set Up Triggers</h4>
                      <p className="text-sm text-slate-500 leading-relaxed mb-4">
                        Add triggers for "Call Received", "Call Made", and "SMS Received". Set the action to "HTTP Request".
                      </p>
                      <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between group">
                        <code className="text-xs font-mono text-blue-600 truncate">
                           https://your-app-api.com/sync
                        </code>
                        <button className="text-slate-400 group-hover:text-blue-600 transition-colors">
                          <Copy size={16} />
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1 font-bold uppercase tracking-wider">
                        <AlertCircle size={10} />
                        Use your unique Firebase Database ID for direct sync
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-6">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black flex-shrink-0">3</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">Grant Permissions</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Allow the app to access "Call Logs", "Contacts", and "SMS" so it can send data to this dashboard.
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white text-blue-600 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-blue-900 mb-1">Done!</h4>
                        <p className="text-sm text-blue-700/70">
                          Once configured, your calls and messages will appear here instantly, even if you are not using this computer.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50 flex gap-4">
                <button 
                  onClick={() => setShowSetup(false)}
                  className="flex-1 h-14 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-white/50 transition-all"
                >
                  Close
                </button>
                <button className="flex-1 h-14 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                  Contact Support
                  <ExternalLink size={18} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
