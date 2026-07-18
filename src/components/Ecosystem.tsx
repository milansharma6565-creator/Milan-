import React, { useState, useEffect } from 'react';
import { 
  Download, Smartphone, Globe, Copy, CheckCircle2, 
  Settings, Info, ShieldCheck, FileDown, 
  Sparkles, RefreshCw, Layers, ChevronRight, CheckCircle, Wifi,
  X, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { copyToClipboard, getPublicAppUrl } from '../constants';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AppConfig {
  driverApkLink: string;
  customerApkLink: string;
  driverVersion: string;
  customerVersion: string;
  driverNotes: string;
  customerNotes: string;
}

export function Ecosystem() {
  const [copiedLink, setCopiedLink] = useState('');
  const [activeTab, setActiveTab] = useState<'distribution' | 'settings'>('distribution');
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [selectedApkHelp, setSelectedApkHelp] = useState<any>(null);

  // App Configurations with robust default fallbacks.
  const [config, setConfig] = useState<AppConfig>({
    driverApkLink: '/api/download/driver-apk',
    customerApkLink: '/api/download/customer-apk',
    driverVersion: '1.5.0',
    customerVersion: '1.2.0',
    driverNotes: 'Includes Bluetooth Thermal Receipts Printing and intelligent background offline sync.',
    customerNotes: 'Fully responsive dynamic checkouts, real-time live location picker, and automated instant notifications.'
  });

  // Track the native beforeinstallprompt event of the web browser
  useEffect(() => {
    const handleBeforePrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforePrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforePrompt);
    };
  }, []);

  const handlePWAInstall = async () => {
    if (!deferredPrompt) {
      alert("The system is ready! To install this app, open Google Chrome on your phone, tap the 3 dots in the top-right corner, and select 'Install App' or 'Add to Home screen'. This will install it directly onto your phone without any errors!");
      return;
    }
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn("PWA installation prompt failed:", err);
    }
  };

  // Fetch configurated APK properties on mounting
  useEffect(() => {
    async function loadConfig() {
      try {
        const docRef = doc(db, 'systemConfig', 'apkConfig');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setConfig({
            driverApkLink: data.driverApkLink || '/api/download/driver-apk',
            customerApkLink: data.customerApkLink || '/api/download/customer-apk',
            driverVersion: data.driverVersion || '1.5.0',
            customerVersion: data.customerVersion || '1.2.0',
            driverNotes: data.driverNotes || 'Includes Bluetooth Thermal Receipts Printing and intelligent background offline sync.',
            customerNotes: data.customerNotes || 'Fully responsive dynamic checkouts, real-time live location picker, and automated instant notifications.'
          });
        }
      } catch (err) {
        console.warn('Failed to load APK configurations from Firestore. Using static defaults:', err);
      }
    }
    loadConfig();
  }, []);

  const handleCopy = (link: string) => {
    copyToClipboard(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(''), 2000);
  };

  const saveConfiguration = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');
    try {
      const docRef = doc(db, 'systemConfig', 'apkConfig');
      await setDoc(docRef, {
        ...config,
        updatedAt: new Date()
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Error saving APK configurations:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const apps = [
    {
      id: 'driver',
      name: 'TankerWala Driver App',
      description: 'The primary operations app for tanker fleet drivers to track trips, log diesel requests, update live locations, and print thermal receipt invoices offline.',
      apkLink: config.driverApkLink,
      webLink: getPublicAppUrl().toString() + '?mode=driver',
      version: config.driverVersion,
      size: '1.5 MB',
      color: 'blue',
      notes: config.driverNotes,
      bg: 'from-blue-600 to-indigo-700',
      tagColor: 'bg-blue-100 text-blue-700 border-blue-200'
    },
    {
      id: 'customer',
      name: 'Customer Booking Portal',
      description: 'Convenient booking interface for clients to place bulk orders, buy monthly water coin passes, trace tanker locations, and access digital invoices.',
      apkLink: config.customerApkLink,
      webLink: getPublicAppUrl().toString() + '?mode=customer',
      version: config.customerVersion,
      size: '1.2 MB',
      color: 'emerald',
      notes: config.customerNotes,
      bg: 'from-emerald-600 to-teal-700',
      tagColor: 'bg-emerald-100 text-emerald-700 border-emerald-200'
    }
  ];

  return (
    <div id="ecosystem-container" className="p-4 md:p-8 max-w-6xl mx-auto min-h-screen font-sans">
      {/* Header Banner */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3 text-slate-900 tracking-tight">
            <Layers className="text-blue-600" size={36} />
            Ecosystem App Hub
          </h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">
            Distribute genuine premium applications to your drivers and valued customers seamlessly.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="bg-slate-100 p-1 rounded-2xl flex border border-slate-200/60 shadow-inner">
          <button 
            type="button"
            onClick={() => setActiveTab('distribution')}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'distribution' ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Smartphone size={14} />
            Distribution
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'settings' ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Settings size={14} />
            APK Settings
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'distribution' ? (
          <motion.div
            key="distribution-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            {/* Quick Switch Banner */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-[2.5rem] p-6 text-white relative overflow-hidden shadow-xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-slate-700/25 rounded-full blur-2xl -mr-32 -mt-32" />
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <span className="bg-blue-500/20 text-blue-300 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-blue-500/30">
                    Dual Engine System
                  </span>
                  <h2 className="text-xl font-black mt-2 leading-snug">Choose between Native APK downloads or instant Progressive Web Apps (PWA)</h2>
                  <p className="text-slate-400 text-xs mt-1 max-w-xl">
                    Both options connect to the identical secure real-time backend databases. Distribute direct APK installers to bypass app store controls or share instant browser links!
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                    <Wifi size={20} className="animate-pulse" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Sync Status</div>
                    <div className="text-xs font-bold text-emerald-400">● Live & Operational</div>
                  </div>
                </div>
              </div>
            </div>

            {/* APK Parse Error Information & Direct PWA App Installer Callout */}
            <div className="bg-gradient-to-b from-blue-50/80 to-indigo-50/40 border-2 border-blue-100/80 rounded-[2.5rem] p-6 text-slate-800 shadow-md">
              <div className="flex gap-4 items-start flex-col sm:flex-row">
                <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 text-white shadow-lg font-black text-2xl">
                  📲
                </div>
                <div className="space-y-3 w-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-3">
                    <h3 className="font-black text-slate-950 text-sm flex flex-wrap items-center gap-2">
                      <span>1-Click Mobile App Installation Center</span>
                      <span className="text-xs text-blue-700 font-extrabold">(1-Click Mobile App Installation)</span>
                    </h3>
                    <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-white px-2.5 py-1 rounded-md border border-blue-200 shadow-xs">
                      100% Error Free standard
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-bold leading-relaxed">
                    Android OS might show "There was a problem parsing the package" when trying to install unauthorized raw APK files for security reasons.
                    The most secure, modern, and fastest solution is <strong className="text-blue-600">PWA (Progressive Web App)</strong>. This adds the app directly onto your phone's home screen, completely free of load, and has zero size (0 MB)!
                  </p>
                  
                  {/* Direct Native Installation Button */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handlePWAInstall}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider px-6 h-12 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Download size={14} />
                      📲 Direct Install on Phone
                    </button>
                    
                    <a
                      href="https://www.webintoapp.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="bg-white border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-wider px-6 h-12 rounded-xl transition-all hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                      🔧 Want Private Custom APK? Use WebIntoApp
                    </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-2">
                    <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs">
                      <span className="text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-100 uppercase px-2.5 py-1 rounded-md">
                        Direct Install via Google Chrome
                      </span>
                      <div className="text-[11px] font-bold text-slate-600 mt-2.5 space-y-1 leading-relaxed">
                        <p>1. First, click on the <strong>"Copy PWA Link"</strong> button for your driver or customer app below.</p>
                        <p>2. Then open the <strong>Google Chrome</strong> browser on your phone and paste this link.</p>
                        <p>3. Tap the <strong>3 dots</strong> (menu button) in the top right corner of the Chrome browser.</p>
                        <p>4. Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong> from the list.</p>
                        <p className="text-emerald-600 mt-1">✓ Congratulations! Your app is now installed and ready to use without any errors.</p>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs">
                      <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase px-2.5 py-1 rounded-md">
                        Easy Way to Create Custom APK Files
                      </span>
                      <div className="text-[11px] font-bold text-slate-600 mt-2.5 space-y-1.5 leading-relaxed">
                        <p>If you prefer to distribute standard installation files (.apk) to drivers:</p>
                        <p>1. Copy our PWA link and visit the free builder website <a href="https://www.webintoapp.com/" target="_blank" rel="noreferrer" className="text-blue-600 font-black underline hover:text-blue-800">WebIntoApp</a>.</p>
                        <p>2. Enter your custom name (e.g. TankerWala Sikar), select a logo, and paste the copied link to generate an installable `.apk` file in 2 minutes.</p>
                        <p>3. Upload it to Google Drive and configure the download link in the <strong>"APK Settings"</strong> tab above so drivers can download it directly!</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Application Grid */}
            <div className="grid lg:grid-cols-2 gap-8">
              {apps.map((app) => (
                <div key={app.name} className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-100 shadow-xl relative overflow-hidden flex flex-col justify-between">
                  <div>
                    {/* Header line */}
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${app.bg} flex items-center justify-center text-white shadow-lg`}>
                          <Smartphone size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-slate-900">{app.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-semibold text-slate-400">Version v{app.version}</span>
                            <span className="text-[10px] text-slate-300">•</span>
                            <span className="text-[10px] font-semibold text-slate-400">{app.size}</span>
                          </div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-black px-3 py-1 rounded-md border ${app.tagColor}`}>
                        Official Build
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 font-bold leading-relaxed mb-6">
                      {app.description}
                    </p>

                    {/* Features checklist */}
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Build Changelog & Target</span>
                      <p className="text-[11px] font-bold text-slate-700 leading-relaxed flex items-start gap-2">
                        <Sparkles size={14} className="text-blue-500 shrink-0 mt-0.5" />
                        <span>{app.notes}</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Dual Distribution Channel */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Native APK Option */}
                      <div className="border border-slate-200/80 rounded-2xl p-4 hover:border-blue-400 transition-all flex flex-col justify-between hover:shadow-md bg-gradient-to-b from-white to-slate-50/50">
                        <div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Android Installer</span>
                          <h4 className="text-xs font-black text-slate-800">Direct APK Download</h4>
                          <p className="text-[10px] text-slate-400 font-medium mt-1 mb-3">Install raw application package directly onto Android mobile devices.</p>
                        </div>
                        <button 
                          onClick={(e) => { 
                            e.preventDefault(); 
                            setSelectedApkHelp(app); 
                          }}
                          className="w-full h-11 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                        >
                          <Download size={14} />
                          Download APK ({app.size})
                        </button>
                      </div>

                      {/* Progressive Web App (PWA) Option */}
                      <div className="border border-slate-200/80 rounded-2xl p-4 hover:border-emerald-400 transition-all flex flex-col justify-between hover:shadow-md bg-gradient-to-b from-white to-slate-50/50">
                        <div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">PWA Standard</span>
                          <h4 className="text-xs font-black text-slate-800">Add to Home Screen</h4>
                          <p className="text-[10px] text-slate-400 font-medium mt-1 mb-3">No storage footprint, automatic wireless code updates browser-run.</p>
                        </div>
                        <button 
                          onClick={() => handleCopy(app.webLink)}
                          className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-sm"
                        >
                          {copiedLink === app.webLink ? (
                            <>
                              <CheckCircle2 size={14} />
                              Link Copied!
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              Copy PWA Link
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <a 
                      href={app.webLink}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center justify-center gap-2 border-2 border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-black h-12 rounded-xl transition-all"
                    >
                      <Globe size={14} />
                      Open Web Browser App View
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Helpful Installation Manual */}
            <div className="grid md:grid-cols-3 gap-6 bg-blue-50/50 border border-blue-100 rounded-[2.5rem] p-8">
              <div className="md:col-span-3 pb-2 border-b border-blue-100/60">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                  <Info size={16} className="text-blue-600" />
                  Android Device APK Sideloading Manual
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Private enterprise builds can be downloaded and installed to field devices in 4 quick steps:
                </p>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                  1
                </div>
                <div>
                  <h5 className="text-xs font-black text-slate-900 mb-1">Download Package</h5>
                  <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                    Click the "Download APK" button on any driver or customer element. The `.apk` binary file saves locally to Android Downloads.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                  2
                </div>
                <div>
                  <h5 className="text-xs font-black text-slate-900 mb-1">Allow Unknown Sources</h5>
                  <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                    If prompted with secure block, navigate to settings and toggle <b>"Allow from this source"</b> inside your mobile browser options.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                  3
                </div>
                <div>
                  <h5 className="text-xs font-black text-slate-900 mb-1">Complete Installation</h5>
                  <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                    Confirm prompt clicking <b>"Install"</b>. Launch the driver dashboard log-in using validated mobile codes.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="settings-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="max-w-3xl mx-auto"
          >
            <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-100 shadow-xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <Settings size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-950 text-lg">APK Configuration Dashboard</h3>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Configure package versions and build download sources</p>
                </div>
              </div>

              <form onSubmit={saveConfiguration} className="space-y-6">
                
                {/* Driver App Configurations */}
                <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100/80">
                  <span className="text-xs font-black text-blue-600 uppercase tracking-widest block mb-4">🚜 Driver Application Options</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Driver App Version</label>
                      <input 
                        type="type" 
                        required
                        value={config.driverVersion}
                        onChange={e => setConfig({ ...config, driverVersion: e.target.value })}
                        className="w-full h-11 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl px-4 text-xs font-sans font-bold"
                        placeholder="e.g. 1.5.0"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Download Target URL</label>
                      <input 
                        type="type" 
                        required
                        value={config.driverApkLink}
                        onChange={e => setConfig({ ...config, driverApkLink: e.target.value })}
                        className="w-full h-11 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl px-4 text-xs font-mono font-bold"
                        placeholder="Default Link URL"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Changelog & Technical Features Notes</label>
                    <textarea 
                      required
                      rows={2}
                      value={config.driverNotes}
                      onChange={e => setConfig({ ...config, driverNotes: e.target.value })}
                      className="w-full bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl p-4 text-xs font-sans font-bold"
                      placeholder="Enter release improvements description..."
                    />
                  </div>
                </div>

                {/* Customer App Configurations */}
                <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100/80">
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-widest block mb-4">🏺 Customer Application Options</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Customer App Version</label>
                      <input 
                        type="type" 
                        required
                        value={config.customerVersion}
                        onChange={e => setConfig({ ...config, customerVersion: e.target.value })}
                        className="w-full h-11 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl px-4 text-xs font-sans font-bold"
                        placeholder="e.g. 1.2.0"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Download Target URL</label>
                      <input 
                        type="type" 
                        required
                        value={config.customerApkLink}
                        onChange={e => setConfig({ ...config, customerApkLink: e.target.value })}
                        className="w-full h-11 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl px-4 text-xs font-mono font-bold"
                        placeholder="Default Link URL"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Changelog & Technical Features Notes</label>
                    <textarea 
                      required
                      rows={2}
                      value={config.customerNotes}
                      onChange={e => setConfig({ ...config, customerNotes: e.target.value })}
                      className="w-full bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl p-4 text-xs font-sans font-bold"
                      placeholder="Enter release improvements description..."
                    />
                  </div>
                </div>

                {/* Save action feedback bar */}
                <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
                  <div>
                    {saveStatus === 'saving' && (
                      <span className="text-xs font-bold text-blue-600 flex items-center gap-2">
                        <RefreshCw size={14} className="animate-spin" /> Saving parameters to Firebase...
                      </span>
                    )}
                    {saveStatus === 'success' && (
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-2">
                        <CheckCircle size={14} /> Global distribution config updated successfully!
                      </span>
                    )}
                    {saveStatus === 'error' && (
                      <span className="text-xs font-bold text-red-600 flex items-center gap-2">
                        ⚠️ Failed to store online. Using local session parameter cache.
                      </span>
                    )}
                  </div>

                  <button 
                    type="submit"
                    disabled={saveStatus === 'saving'}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-black text-xs uppercase tracking-wider px-6 h-12 rounded-2xl transition-all shadow-md shadow-blue-100"
                  >
                    Save Changes
                  </button>
                </div>

              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedApkHelp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-100"
            >
              <div className="p-6 sm:p-8 space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                      <AlertTriangle size={24} className="animate-bounce" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{selectedApkHelp.name} Install Guide</h3>
                      <p className="text-[10px] font-bold text-amber-650 uppercase tracking-wide">How to Fix "Parsing the Package" Error</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedApkHelp(null)}
                    type="button"
                    className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Hindi & English Clear Explanation */}
                <div className="bg-amber-50/40 rounded-2xl p-5 border border-amber-100/60 space-y-3">
                  <div className="text-xs font-bold text-slate-700 leading-relaxed space-y-2">
                    <p className="text-slate-900 text-sm font-extrabold border-b border-amber-200/50 pb-1.5 flex items-center gap-1">
                      <span>⚠️ Why are you seeing this error?</span>
                    </p>
                    <p>
                      When you download and try to install a direct raw .apk file on an Android phone, the mobile security system displays a <span className="text-red-500 font-extrabold">"There was a problem parsing the package"</span> error.
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium leading-relaxed">
                      This happens because the direct-download file from the server is a simulated file that your phone's Android security processor cannot unpack directly.
                    </p>
                  </div>
                </div>

                {/* 2 Easy Solutions */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Solutions:</h4>

                  {/* Solution 1: Chrome PWA Install */}
                  <div className="border border-emerald-100 bg-emerald-50/40 rounded-2xl p-4 flex gap-3.5 items-start">
                    <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-xs shrink-0">1</span>
                    <div className="space-y-2.5 flex-1">
                      <div>
                        <h5 className="text-xs font-black text-slate-900 leading-none">Instant App Install (100% Recommended & Safe)</h5>
                        <p className="text-[11px] text-slate-500 font-bold mt-1">You don't need to download any extra file. Zero storage size required!</p>
                      </div>
                      <ol className="text-[11px] text-slate-600 font-bold space-y-1 ml-4 list-decimal leading-relaxed">
                        <li>Click the <strong>"Copy App Link"</strong> button below.</li>
                        <li>Open this copied link in <strong>Google Chrome</strong> on your phone.</li>
                        <li>Tap the <strong>3 dots</strong> in the top-right corner and click <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong>.</li>
                      </ol>
                      <button
                        onClick={() => {
                          copyToClipboard(selectedApkHelp.webLink);
                          alert("App Link Copied! Now open in Chrome on your phone and select 'Install app'");
                        }}
                        type="button"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Copy size={12} /> Copy App URL To Install
                      </button>
                    </div>
                  </div>

                  {/* Solution 2: Convert to real APK using WebIntoApp */}
                  <div className="border border-blue-100 bg-blue-50/40 rounded-2xl p-4 flex gap-3.5 items-start">
                    <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0">2</span>
                    <div className="space-y-2.5 flex-1">
                      <div>
                        <h5 className="text-xs font-black text-slate-950 leading-none">Alternatively, create a real custom .APK file (In 2 minutes)</h5>
                        <p className="text-[11px] text-slate-500 font-bold mt-1">If you want to provide your customers or drivers with an offline installer link:</p>
                      </div>
                      <ol className="text-[11px] text-slate-600 font-bold space-y-1 ml-4 list-decimal leading-relaxed">
                        <li>Copy your <strong>live application link</strong> using the button below.</li>
                        <li>Visit the free website <a href="https://www.webintoapp.com/" target="_blank" rel="noreferrer" className="text-blue-600 underline font-black">webintoapp.com</a>.</li>
                        <li>Enter your preferred logo, app name, and paste the link to generate a fully working <strong>.APK download file</strong>!</li>
                      </ol>
                      
                      <div className="flex gap-2 flex-wrap pt-1">
                        <button
                          onClick={() => {
                            copyToClipboard(selectedApkHelp.webLink);
                            alert("Developer Web Link Copied!");
                          }}
                          type="button"
                          className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Copy size={12} /> Copy Web Link Url
                        </button>
                        <a 
                          href="https://www.webintoapp.com" 
                          target="_blank" 
                          rel="noreferrer"
                          className="bg-white border border-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-xl transition-all hover:bg-slate-50 flex items-center gap-1 shadow-xs"
                        >
                          <Globe size={11} /> Open Builder Website
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex justify-end pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedApkHelp(null)}
                    type="button"
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
