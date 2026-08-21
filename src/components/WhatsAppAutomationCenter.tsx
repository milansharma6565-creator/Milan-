import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, 
  Smartphone, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Send, 
  MessageSquare, 
  Radio, 
  Sparkles, 
  Users, 
  Check, 
  AlertTriangle, 
  PowerOff, 
  Eye, 
  Copy,
  Zap,
  Sliders,
  FileText,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { whatsappService, WhatsAppStatusResponse } from '../services/whatsappService';
import { WhatsAppTemplatesManager } from './WhatsAppTemplatesManager';
import { Customer } from '../types';

interface WhatsAppAutomationCenterProps {
  franchise?: any;
  customers?: Customer[];
  onClose?: () => void;
  isModal?: boolean;
}

export function WhatsAppAutomationCenter({
  franchise,
  customers = [],
  onClose,
  isModal = false,
}: WhatsAppAutomationCenterProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'connection' | 'lifecycle' | 'broadcast'>('templates');
  const [statusData, setStatusData] = useState<WhatsAppStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Test Message State
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('Namaste! Ye TankerWala automated WhatsApp test message hai. 💧');
  const [testSending, setTestSending] = useState(false);

  // Broadcast State
  const [broadcastPreset, setBroadcastPreset] = useState<string>('diwali');
  const [broadcastTemplate, setBroadcastTemplate] = useState(
`🪔 *शुभ दीपावली की हार्दिक शुभकामनाएं!* 🪔
प्रिय {name} जी,

*${franchise?.printName || franchise?.name || 'Rajhans Water Supply'}* की तरफ से आपको और आपके सपरिवार को दीपावली के पावन पर्व की अनंत मंगलकामनाएं! 

मां लक्ष्मी की कृपा से आपका घर-आंगन सुख, शांति, समृद्धि और उत्तम स्वास्थ्य से सदा परिपूर्ण रहे। 💧✨

📞 किसी भी शुद्ध जल आपूर्ति के लिए संपर्क करें: +91 ${franchise?.printMobile || franchise?.operatorMobile || '9413339987'}`
  );
  const [searchCustomer, setSearchCustomer] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [queueStatus, setQueueStatus] = useState<{ pendingInQueue: number; isProcessing: boolean }>({
    pendingInQueue: 0,
    isProcessing: false,
  });
  const [broadcastSending, setBroadcastSending] = useState(false);

  const pollIntervalRef = useRef<any>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch live WhatsApp status
  const fetchStatus = async () => {
    try {
      const data = await whatsappService.getStatus();
      setStatusData(data);
    } catch (err) {
      console.error('Error fetching WhatsApp status:', err);
    }
  };

  // Poll for status updates (QR scan, connection open)
  useEffect(() => {
    fetchStatus();
    pollIntervalRef.current = setInterval(async () => {
      await fetchStatus();
      try {
        const qStatus = await whatsappService.getBroadcastStatus();
        setQueueStatus(qStatus);
      } catch (e) {}
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Initialize selected customers
  useEffect(() => {
    if (customers.length > 0 && selectedCustomerIds.length === 0) {
      setSelectedCustomerIds(customers.map((c) => c.id));
    }
  }, [customers]);

  // Handle Connect / QR Refresh
  const handleConnect = async (forceRefresh = false) => {
    setActionLoading(true);
    try {
      const res = await whatsappService.connect(forceRefresh);
      setStatusData(res);
      showToast(forceRefresh ? 'Fresh QR Code generated!' : 'WhatsApp Web connection initialized');
    } catch (e: any) {
      showToast(e.message || 'Failed to initialize connection', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Disconnect
  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect WhatsApp and log out this device? You can link again anytime with QR.')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await whatsappService.disconnect();
      setStatusData(res || {
        status: 'disconnected',
        qrCodeDataUrl: null,
        rawQr: null,
        user: null,
        connectedAt: null,
        autoNotifications: {
          onOrderBooked: true,
          onFilling: true,
          onDispatched: true,
          onDelivered: true,
          onCancelled: true,
        },
      });
      showToast('WhatsApp session logged out and disconnected successfully.');
    } catch (e: any) {
      // Force local disconnected state even if network threw
      setStatusData((prev) => prev ? {
        ...prev,
        status: 'disconnected',
        user: null,
        qrCodeDataUrl: null,
        rawQr: null,
        connectedAt: null,
      } : null);
      showToast(e.message || 'WhatsApp session disconnected.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Send Test Message
  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      showToast('Please enter a 10-digit phone number', 'error');
      return;
    }
    setTestSending(true);
    try {
      const res = await whatsappService.sendMessage(testPhone, testMsg);
      if (res.success) {
        showToast('Test WhatsApp message delivered successfully! 🚀');
      } else {
        showToast(res.error || 'Failed to send test message', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error sending test message', 'error');
    } finally {
      setTestSending(false);
    }
  };

  // Handle Toggle Lifecycle Notifications
  const handleToggleNotification = async (key: keyof WhatsAppStatusResponse['autoNotifications']) => {
    if (!statusData) return;
    const current = statusData.autoNotifications[key];
    const newSettings = { [key]: !current };
    try {
      const res = await whatsappService.updateSettings(newSettings);
      if (res.success) {
        setStatusData({
          ...statusData,
          autoNotifications: {
            ...statusData.autoNotifications,
            [key]: !current,
          },
        });
        showToast('Auto-notification setting updated!');
      }
    } catch (e: any) {
      showToast('Failed to update setting', 'error');
    }
  };

  // Preset Message Templates
  const handlePresetSelect = (presetKey: string) => {
    setBroadcastPreset(presetKey);
    const franchiseName = franchise?.printName || franchise?.name || 'Rajhans Water Supply';
    const franchisePhone = franchise?.printMobile || franchise?.operatorMobile || '9413339987';

    switch (presetKey) {
      case 'diwali':
        setBroadcastTemplate(
`🪔 *शुभ दीपावली की हार्दिक शुभकामनाएं!* 🪔
प्रिय {name} जी,

*${franchiseName}* की तरफ से आपको और आपके पूरे परिवार को दीपावली के पावन पर्व की अनंत मंगलकामनाएं! 

मां लक्ष्मी की कृपा से आपका घर-आंगन सुख, शांति, समृद्धि और उत्तम स्वास्थ्य से सदा परिपूर्ण रहे। 💧✨

📞 शुद्ध जल आपूर्ति एवं टैंकर बुकिंग: +91 ${franchisePhone}`
        );
        break;

      case 'holi':
        setBroadcastTemplate(
`🎨 *रंगों के पावन पर्व होली की हार्दिक शुभकामनाएं!* 🎨
प्रिय {name} जी,

*${franchiseName}* की ओर से आपको और आपके परिवार को होली की ढेर सारी शुभकामनाएं! रंगों का यह पावन पर्व आपके जीवन में खुशियों, समृद्धि और उत्तम स्वास्थ्य के नए रंग भरे। 💧🌸

💧 20L RO Can / टैंकर सेवा हेल्पलाइन: +91 ${franchisePhone}`
        );
        break;

      case 'newyear':
        setBroadcastTemplate(
`✨ *नव वर्ष की हार्दिक शुभकामनाएं!* ✨
प्रिय {name} जी,

नया साल आपके और आपके परिवार के लिए नई उमंग, अपार सफलता और उत्तम स्वास्थ्य लेकर आए। 
*${franchiseName}* हमेशा आपकी विश्वसनीय जल सेवा के लिए तत्पर है। 💧🌱

📞 संपर्क: +91 ${franchisePhone}`
        );
        break;

      case 'summer_offer':
        setBroadcastTemplate(
`☀️ *गर्मी में शुद्ध जल की गारंटी - स्पेशल डिस्काउंट ऑफर!* ☀️
प्रिय {name} जी,

इस भीषण गर्मी में अपने परिवार और बिजनेस के लिए पाएं 100% शुद्ध और शीतल जल:
💧 *20L RO Water Can* - तुरंत डिलीवरी
🚜 *5000L / 6000L / 10,000L टैंकर* - 1 कॉल में आपके द्वार

📞 आज ही ऑर्डर बुक करें: +91 ${franchisePhone}
*${franchiseName}* 💧`
        );
        break;

      case 'monthly_pass':
        setBroadcastTemplate(
`💧 *20L RO Water Can - मंथली पास स्पेशल प्लान* 💧
नमस्ते {name} जी!

अब रोज़-रोज़ ऑर्डर करने की झंझट खत्म! 
🎉 *मात्र ₹600/महीना* में पाएं 20L RO Water Cans + *फ्री हॉट एंड कोल्ड डिस्पेंसर सपोर्ट*!

📞 तुरंत एक्टिवेट करने के लिए कॉल करें: +91 ${franchisePhone}
*${franchiseName}*`
        );
        break;

      case 'custom':
        setBroadcastTemplate(
`नमस्ते {name} जी! 💧

*${franchiseName}* की तरफ से विशेष सूचना...

हेल्पलाइन: +91 ${franchisePhone}`
        );
        break;
    }
  };

  // Start Broadcast
  const handleStartBroadcast = async () => {
    if (!statusData || statusData.status !== 'connected') {
      showToast('Please connect WhatsApp first before broadcasting!', 'error');
      return;
    }

    const targetCustomers = customers.filter((c) => selectedCustomerIds.includes(c.id));
    if (targetCustomers.length === 0) {
      showToast('Please select at least one customer to send broadcast', 'error');
      return;
    }

    if (!window.confirm(`Start WhatsApp Broadcast to ${targetCustomers.length} selected customers? Messages will be sent safely with anti-ban delay.`)) {
      return;
    }

    setBroadcastSending(true);
    try {
      const recipients = targetCustomers.map((c) => ({
        phone: c.mobile,
        name: c.name,
      }));

      const res = await whatsappService.queueBroadcast(recipients, broadcastTemplate, franchise);
      if (res.success) {
        showToast(`🚀 ${res.queuedCount} messages queued in background successfully!`);
        const q = await whatsappService.getBroadcastStatus();
        setQueueStatus(q);
      } else {
        showToast(res.error || 'Failed to start broadcast', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error starting broadcast', 'error');
    } finally {
      setBroadcastSending(false);
    }
  };

  // Clear Broadcast Queue
  const handleClearQueue = async () => {
    try {
      await whatsappService.clearBroadcast();
      setQueueStatus({ pendingInQueue: 0, isProcessing: false });
      showToast('Broadcast queue cleared.');
    } catch (e) {}
  };

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(searchCustomer.toLowerCase()) ||
    c.mobile.includes(searchCustomer)
  );

  const isConnected = statusData?.status === 'connected' || Boolean(statusData?.user?.phone);

  return (
    <div className={`bg-white text-slate-900 rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col ${isModal ? 'max-h-[90vh] w-full max-w-5xl' : 'w-full'}`}>
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 right-6 z-[10000] px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 font-bold text-sm ${
              toastMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {toastMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {toastMessage.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
            <MessageSquare className="text-white w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black tracking-tight">WhatsApp Web Automation Hub</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                isConnected ? 'bg-emerald-400 text-emerald-950 animate-pulse' : 'bg-amber-400 text-amber-950'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-900' : 'bg-amber-900'}`} />
                {isConnected ? 'Connected & Active' : statusData?.status === 'qr_ready' ? 'Scan QR Code' : 'Disconnected'}
              </span>
            </div>
            <p className="text-xs text-emerald-100 font-medium mt-0.5">
              Zero-Click WhatsApp Billing, Live Order Lifecycle Status, & 1-Click Festival Broadcasts
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/80 px-6 pt-3 gap-2 sm:gap-3">
        <button
          onClick={() => setActiveTab('templates')}
          className={`pb-3 px-3 sm:px-4 text-xs sm:text-sm font-black flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'templates'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText size={17} />
          <span>Message Templates & Customizer</span>
          <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
            15+ Templates
          </span>
        </button>

        <button
          onClick={() => setActiveTab('connection')}
          className={`pb-3 px-3 sm:px-4 text-xs sm:text-sm font-black flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'connection'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <QrCode size={17} />
          QR & Device Connect
        </button>

        <button
          onClick={() => setActiveTab('lifecycle')}
          className={`pb-3 px-3 sm:px-4 text-xs sm:text-sm font-black flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'lifecycle'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Zap size={17} />
          Automated Triggers
        </button>

        <button
          onClick={() => setActiveTab('broadcast')}
          className={`pb-3 px-3 sm:px-4 text-xs sm:text-sm font-black flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'broadcast'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Radio size={17} />
          Festival Wishes & Broadcast
          {queueStatus.pendingInQueue > 0 && (
            <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
              {queueStatus.pendingInQueue} Sending
            </span>
          )}
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="p-6 overflow-y-auto flex-1 space-y-6">
        {/* ========================================================================= */}
        {/* TAB 0: TEMPLATES & CUSTOMIZATION */}
        {/* ========================================================================= */}
        {activeTab === 'templates' && (
          <WhatsAppTemplatesManager
            franchise={franchise}
            onNotify={showToast}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 1: QR & DEVICE CONNECTION */}
        {/* ========================================================================= */}
        {activeTab === 'connection' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Col: QR or Connected Status */}
            <div className="lg:col-span-6 bg-slate-50 rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col items-center text-center">
              {isConnected ? (
                <div className="w-full space-y-4 py-4">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center border-4 border-emerald-200 shadow-inner">
                    <CheckCircle2 size={42} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">WhatsApp Device Linked!</h3>
                    <p className="text-xs text-slate-500 font-bold mt-1">
                      Connected as: <span className="text-emerald-700 font-mono text-sm">+{statusData?.user?.phone}</span>
                    </p>
                    {statusData?.user?.name && (
                      <p className="text-xs text-slate-400 font-medium">({statusData.user.name})</p>
                    )}
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-left text-xs space-y-1.5 text-emerald-900">
                    <p className="font-bold flex items-center gap-1.5 text-emerald-800">
                      <Zap size={14} className="text-emerald-600" /> Real-time Automation Active
                    </p>
                    <p>• Bills, receipts, and order statuses are now sent automatically without manual clicks.</p>
                    <p>• Linked session is persistent. Reconnection occurs automatically in background.</p>
                  </div>

                  <button
                    onClick={handleDisconnect}
                    disabled={actionLoading}
                    className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black rounded-2xl border border-rose-200 flex items-center justify-center gap-2 transition-all cursor-pointer text-xs shadow-sm hover:border-rose-300"
                  >
                    <PowerOff size={16} />
                    {actionLoading ? 'Disconnecting...' : 'Disconnect / Log Out Device'}
                  </button>
                </div>
              ) : statusData?.status === 'qr_ready' && statusData.qrCodeDataUrl ? (
                <div className="space-y-4">
                  <div className="p-3 bg-white rounded-3xl border-2 border-emerald-500 shadow-lg inline-block">
                    <img
                      src={statusData.qrCodeDataUrl}
                      alt="WhatsApp Web QR Code"
                      className="w-64 h-64 rounded-2xl object-contain"
                    />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-black text-slate-800 text-base">Scan QR with your WhatsApp</h4>
                    <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">
                      Scan the QR code to link your business WhatsApp account.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleConnect(true)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <RefreshCw size={14} className={actionLoading ? 'animate-spin' : ''} />
                      Refresh QR Code
                    </button>
                    <button
                      onClick={handleDisconnect}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <PowerOff size={14} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-6">
                  <div className="w-20 h-20 rounded-full bg-slate-200 text-slate-500 mx-auto flex items-center justify-center border-4 border-slate-300">
                    <Smartphone size={36} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">WhatsApp Not Connected</h3>
                    <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto mt-1">
                      Link your WhatsApp number to enable automated digital bills, live tracking, and status updates.
                    </p>
                  </div>

                  <button
                    onClick={() => handleConnect(false)}
                    disabled={actionLoading}
                    className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 mx-auto transition-all cursor-pointer text-sm"
                  >
                    <QrCode size={18} />
                    {actionLoading ? 'Generating QR Code...' : 'Generate WhatsApp QR Code'}
                  </button>
                </div>
              )}
            </div>

            {/* Right Col: Instant Test Message & Active Features */}
            <div className="lg:col-span-6 space-y-6">
              {/* Instant Test Message Box */}
              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                    <Send size={16} className="text-teal-600" />
                    Send Instant Test Message
                  </h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {isConnected ? 'Ready to Send' : 'Link Device First'}
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">Recipient Phone Number (with or without 91):</label>
                    <input
                      type="text"
                      placeholder="e.g. 9413339987"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="w-full mt-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600">Test Message:</label>
                    <textarea
                      rows={2}
                      value={testMsg}
                      onChange={(e) => setTestMsg(e.target.value)}
                      className="w-full mt-1 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <button
                    onClick={handleSendTest}
                    disabled={testSending || !isConnected}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isConnected
                        ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-md'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Send size={14} />
                    {testSending ? 'Sending...' : 'Send WhatsApp Test'}
                  </button>
                </div>
              </div>

              {/* Automation Overview Card */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                <h4 className="font-black text-slate-800 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Enabled Zero-Click Automations
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 font-medium">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Instant Digital Billing</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Live Driver GPS Link</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Hydrant Filling Alerts</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Festival Bulk Broadcast</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ORDER LIFECYCLE AUTOMATIONS */}
        {/* ========================================================================= */}
        {activeTab === 'lifecycle' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Toggles */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Sliders size={18} className="text-emerald-600" />
                    Automated Event Triggers
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Whenever an event happens on Dashboard, Driver App, or Hydrant, WhatsApp will notify the customer automatically.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  {/* Event 1: Order Booked */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-xs text-slate-900">1. Order Booked / Pending Confirmation</h5>
                      <p className="text-[11px] text-slate-500">Sends confirmation, order number, and live tracking link.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={statusData?.autoNotifications.onOrderBooked ?? true}
                      onChange={() => handleToggleNotification('onOrderBooked')}
                      className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                    />
                  </div>

                  {/* Event 2: Water Filling */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-xs text-slate-900">2. Water Filling at Hydrant</h5>
                      <p className="text-[11px] text-slate-500">Notifies customer when tractor is loading water at hydrant point.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={statusData?.autoNotifications.onFilling ?? true}
                      onChange={() => handleToggleNotification('onFilling')}
                      className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                    />
                  </div>

                  {/* Event 3: Out for Delivery */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-xs text-slate-900">3. Out for Delivery / Dispatched</h5>
                      <p className="text-[11px] text-slate-500">Sends Tractor No, Driver Name, Driver Phone & Live Siren Map Link.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={statusData?.autoNotifications.onDispatched ?? true}
                      onChange={() => handleToggleNotification('onDispatched')}
                      className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                    />
                  </div>

                  {/* Event 4: Delivered */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-xs text-slate-900">4. Delivered & Digital Receipt</h5>
                      <p className="text-[11px] text-slate-500">Sends delivery confirmation, total bill amount & instant UPI payment link.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={statusData?.autoNotifications.onDelivered ?? true}
                      onChange={() => handleToggleNotification('onDelivered')}
                      className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                    />
                  </div>

                  {/* Event 5: Cancelled */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-xs text-slate-900">5. Order Cancelled Notice</h5>
                      <p className="text-[11px] text-slate-500">Sends cancellation reason and helpline number to rebook.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={statusData?.autoNotifications.onCancelled ?? true}
                      onChange={() => handleToggleNotification('onCancelled')}
                      className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Live Message Preview */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Eye size={14} /> Customer WhatsApp Preview
                  </span>
                  <span className="text-[10px] text-slate-400">Live Delivery Template</span>
                </div>

                <div className="bg-[#0b141a] p-4 rounded-2xl border border-[#202c33] text-xs font-sans text-[#e9edef] space-y-2 whitespace-pre-wrap leading-relaxed shadow-inner">
{`🚚 *Out for Delivery (Rawaana Ho Gaya)!*
Namaste Ramesh Kumar, aapka water tanker delivery ke liye nikal chuka hai!

🧾 *Order No:* #1042
🚜 *Tractor No:* RJ-23-TB-5541
👤 *Driver Name:* Rajesh Singh
📞 *Driver Phone:* 9829123456

🌐 *Driver Live Map Tracking & Siren:*
👉 https://tankerwala.app/?o=1042

Kripya delivery point par gate khula rakhein.
*${franchise?.printName || 'Rajhans Water Supply'}* 💧`}
                </div>

                <p className="text-[11px] text-slate-400 text-center font-medium">
                  Dynamic variables like Driver, Tractor, Amount, and UPI ID are automatically inserted for each order.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: FESTIVAL WISHES & BULK BROADCAST */}
        {/* ========================================================================= */}
        {activeTab === 'broadcast' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Col: Template Selection & Message Editor */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Sparkles size={18} className="text-amber-500" />
                    Festival Wishes & Promotional Broadcast
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Send personalized WhatsApp messages to all or selected customers with 1-click.
                  </p>
                </div>

                {/* Preset Chips */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600">Choose Quick Festival / Event Preset:</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'diwali', label: '🪔 Happy Diwali' },
                      { id: 'holi', label: '🎨 Happy Holi' },
                      { id: 'newyear', label: '✨ New Year' },
                      { id: 'summer_offer', label: '☀️ Summer Offer' },
                      { id: 'monthly_pass', label: '💧 Monthly Pass Promo' },
                      { id: 'custom', label: '✍️ Custom Text' },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          broadcastPreset === preset.id
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template Editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-600">Message Content (WhatsApp Formatted):</label>
                    <span className="text-[10px] text-slate-400">Supported variables: {'{name}'}, {'{date}'}</span>
                  </div>
                  <textarea
                    rows={8}
                    value={broadcastTemplate}
                    onChange={(e) => setBroadcastTemplate(e.target.value)}
                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none leading-relaxed"
                  />
                </div>

                {/* Anti-ban Safe Queue status */}
                {queueStatus.pendingInQueue > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <RefreshCw size={20} className="text-amber-600 animate-spin" />
                      <div>
                        <h5 className="font-bold text-xs text-amber-900">
                          Sending in Progress: {queueStatus.pendingInQueue} messages remaining
                        </h5>
                        <p className="text-[11px] text-amber-700">
                          Safe anti-ban delay (2.5s gap between messages) is active.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleClearQueue}
                      className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700"
                    >
                      Pause / Clear
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Customer Selector & Send Button */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4 flex flex-col h-[520px]">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                    <Users size={16} className="text-emerald-600" />
                    Select Customers ({selectedCustomerIds.length}/{customers.length})
                  </h4>
                  <button
                    onClick={() => {
                      if (selectedCustomerIds.length === customers.length) {
                        setSelectedCustomerIds([]);
                      } else {
                        setSelectedCustomerIds(customers.map((c) => c.id));
                      }
                    }}
                    className="text-[11px] text-emerald-700 font-bold hover:underline cursor-pointer"
                  >
                    {selectedCustomerIds.length === customers.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {/* Search */}
                <input
                  type="text"
                  placeholder="Search customer name or mobile..."
                  value={searchCustomer}
                  onChange={(e) => setSearchCustomer(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />

                {/* Customer List */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filteredCustomers.map((cust) => {
                    const isSelected = selectedCustomerIds.includes(cust.id);
                    return (
                      <div
                        key={cust.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedCustomerIds(selectedCustomerIds.filter((id) => id !== cust.id));
                          } else {
                            setSelectedCustomerIds([...selectedCustomerIds, cust.id]);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-300'
                            : 'bg-white border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-slate-900">{cust.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">+{cust.mobile}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Broadcast Send Button */}
                <button
                  onClick={handleStartBroadcast}
                  disabled={broadcastSending || selectedCustomerIds.length === 0 || !isConnected}
                  className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                    isConnected && selectedCustomerIds.length > 0
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:opacity-95 shadow-emerald-600/30'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Send size={18} />
                  {broadcastSending
                    ? 'Starting Broadcast...'
                    : `Send WhatsApp Broadcast to ${selectedCustomerIds.length} Customers`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
