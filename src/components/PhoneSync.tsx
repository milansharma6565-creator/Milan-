import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Phone, MessageSquare, RefreshCw, CheckCircle, XCircle, Settings, Smartphone } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { format } from 'date-fns';

interface SyncLog {
  id: string;
  type: 'CALL' | 'SMS';
  number: string;
  content?: string;
  timestamp: any;
  status: 'PENDING' | 'PROCESSED';
}

const PhoneSync: React.FC = () => {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncKey, setSyncKey] = useState('RAJHANS_' + Math.random().toString(36).substring(7).toUpperCase());

  useEffect(() => {
    const q = query(
      collection(db, 'phone_sync_logs'),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SyncLog[];
      setLogs(newLogs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'phone_sync_logs'));

    return () => unsubscribe();
  }, []);

  const triggerManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Phone Synchronization</h1>
          <p className="text-gray-500 text-sm">Sync calls and SMS with your business dashboard</p>
        </div>
        <button
          onClick={triggerManualSync}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          Sync Now
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Status Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-50 rounded-lg text-green-600">
              <Smartphone className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-gray-800">Connection Status</h2>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Device Connected</span>
              <span className="text-green-600 font-medium">Active</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Sync Key</span>
              <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{syncKey}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Last Synced</span>
              <span className="text-gray-700">Just now</span>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-gray-50">
            <button className="w-full flex items-center justify-center gap-2 text-sm text-blue-600 font-medium hover:underline">
              <Settings className="w-4 h-4" />
              Configuration Guide
            </button>
          </div>
        </motion.div>

        {/* Sync Logs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 col-span-2 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h2 className="font-semibold text-gray-800">Recent Activity</h2>
            <span className="text-xs text-gray-400">Showing last 10 entries</span>
          </div>
          <div className="divide-y divide-gray-50">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div key={log.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${log.type === 'CALL' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                      {log.type === 'CALL' ? <Phone className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{log.number}</p>
                      <p className="text-xs text-gray-500">
                        {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'MMM dd, HH:mm') : 'Recent'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {log.content && (
                      <p className="text-sm text-gray-600 max-w-[200px] truncate">{log.content}</p>
                    )}
                    <span className={`flex items-center gap-1 text-xs font-medium ${log.status === 'PROCESSED' ? 'text-green-600' : 'text-orange-600'}`}>
                      {log.status === 'PROCESSED' ? <CheckCircle className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                      {log.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-gray-400">
                <Smartphone className="w-12 h-12 mx-auto mb-4 opacity-10" />
                <p>No sync logs found</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Integration Instructions */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h3 className="text-blue-900 font-semibold mb-2">How to connect your phone?</h3>
        <ol className="list-decimal list-inside text-sm text-blue-800 space-y-2">
          <li>Install the "SMS Forwarder" or "MacroDroid" app on your Android phone.</li>
          <li>Set up a rule to forward incoming SMS/Calls to <strong>/api/sync</strong> endpoint.</li>
          <li>Include the Sync Key <strong>{syncKey}</strong> in the JSON payload.</li>
          <li>Calls will be automatically logged and associated with your customers.</li>
        </ol>
      </div>
    </div>
  );
};

export default PhoneSync;
