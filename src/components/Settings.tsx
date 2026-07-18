import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { 
  Settings as SettingsIcon, 
  Truck, 
  Fuel, 
  Printer, 
  QrCode, 
  Copy, 
  Eye, 
  Check, 
  Sparkles, 
  Smile, 
  ShieldAlert, 
  Flame, 
  Heart,
  Droplet,
  Smartphone,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DriverManagement } from './DriverManagement';
import { TractorDiesel } from './TractorDiesel';
import { BackupRestore } from './BackupRestore';
import { QRCodeSVG } from 'qrcode.react';
import { getPublicAppUrl, copyToClipboard } from '../constants';
import { activityLogger } from '../services/activityLogger';

interface SettingsProps {
  franchiseId?: string;
  isSuperAdmin?: boolean;
  currentFranchise?: any;
}

// Banner Template Interface
interface BannerTemplate {
  id: string;
  title: string;
  category: 'funny' | 'serious' | 'classic' | 'fast';
  sloganHi: string;
  sloganEn: string;
  bgGradient: string;
  textColor: string;
  accentBadge: string;
  accentBadgeBg: string;
  illustrationDesc: string;
  itemsIncluded: string[];
}

export function Settings({ franchiseId, isSuperAdmin, currentFranchise }: SettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'print' | 'drivers' | 'fleet' | 'pricing' | 'apps'>('print');
  const [franchiseDetail, setFranchiseDetail] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Print Configuration form states
  const [editPrintName, setEditPrintName] = useState('');
  const [editPrintMobile, setEditPrintMobile] = useState('');
  const [editPrintAddress, setEditPrintAddress] = useState('');
  const [editUpiId, setEditUpiId] = useState('');
  const [editLetterheadTemplateId, setEditLetterheadTemplateId] = useState('classic-royal');

  // Services enabled states
  const [servicesEnabled, setServicesEnabled] = useState({
    tanker: true,
    can: true,
    bottle: true
  });

  const [superAdminServices, setSuperAdminServices] = useState({
    tanker: true,
    can: true,
    bottle: true
  });

  // Customized base rates states
  const [rates, setRates] = useState<any>({
    tankerBase: 350,
    standbyTankerBase: 900,
    standbyTankerExtraDay: 600,
    monthlyTankerBase: 10000,
    can20lBase: 80,
    can20lBookingBase: 30,
    monthlyCanBase: 600,
    bottle500ml: 10,
    bottle1l: 20,
    bottle2l: 35,
    tanker5000L: 400,
    tanker7500L: 600,
    tanker10000L: 800,
    tanker15000L: 1200,
  });
  const [isRatesSaving, setIsRatesSaving] = useState(false);
  const [ratesSaveSuccess, setRatesSaveSuccess] = useState(false);

  // Selected banner template for dynamic printing
  const [selectedTemplateId, setSelectedTemplateId] = useState('classic-1');
  
  const [isDashboardPrintHidden, setIsDashboardPrintHidden] = useState(() => localStorage.getItem('hideDashboardPrintSettings') === 'true');

  // Load franchise configuration
  useEffect(() => {
    const fid = franchiseId || currentFranchise?.id;
    if (!fid) return;
    const unsub = onSnapshot(doc(db, 'franchises', fid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setFranchiseDetail({ id: snap.id, ...data });
        setEditPrintName(data.printName || data.name || '');
        setEditPrintMobile(data.printMobile || data.operatorMobile || '');
        setEditPrintAddress(data.printAddress || 'Behind balaji dharm kanta, near puniya wines jaipur road sikar, Rajasthan 332001');
        setEditUpiId(data.upiId || 'rajha94133@barodampay');
        setEditLetterheadTemplateId(data.letterheadTemplateId || 'classic-royal');
        setServicesEnabled(data.servicesEnabled || { tanker: true, can: true, bottle: true });
        setSuperAdminServices(data.superAdminServices || { tanker: true, can: true, bottle: true });
        
        const cr = data.customRates || {};
        setRates({
          tankerBase: cr.tankerBase !== undefined ? cr.tankerBase : 350,
          standbyTankerBase: cr.standbyTankerBase !== undefined ? cr.standbyTankerBase : 900,
          standbyTankerExtraDay: cr.standbyTankerExtraDay !== undefined ? cr.standbyTankerExtraDay : 600,
          monthlyTankerBase: cr.monthlyTankerBase !== undefined ? cr.monthlyTankerBase : 10000,
          can20lBase: cr.can20lBase !== undefined ? cr.can20lBase : 80,
          can20lBookingBase: cr.can20lBookingBase !== undefined ? cr.can20lBookingBase : 30,
          monthlyCanBase: cr.monthlyCanBase !== undefined ? cr.monthlyCanBase : 600,
          bottle500ml: cr.bottle500ml !== undefined ? cr.bottle500ml : 10,
          bottle1l: cr.bottle1l !== undefined ? cr.bottle1l : 20,
          bottle2l: cr.bottle2l !== undefined ? cr.bottle2l : 35,
          tanker5000L: cr.tanker5000L !== undefined ? cr.tanker5000L : 400,
          tanker7500L: cr.tanker7500L !== undefined ? cr.tanker7500L : 600,
          tanker10000L: cr.tanker10000L !== undefined ? cr.tanker10000L : 800,
          tanker15000L: cr.tanker15000L !== undefined ? cr.tanker15000L : 1200,
        });
      }
    });
    return () => unsub();
  }, [franchiseId, currentFranchise]);

  const handleServiceToggle = async (key: 'tanker' | 'can' | 'bottle') => {
    const fid = franchiseId || currentFranchise?.id;
    if (!fid) return;

    const newValue = !servicesEnabled[key];
    const updated = { ...servicesEnabled, [key]: newValue };

    // Optimistically update local view
    setServicesEnabled(updated);

    try {
      await updateDoc(doc(db, 'franchises', fid), {
        servicesEnabled: updated
      });
      
      await activityLogger.log({
        franchiseId: fid,
        franchiseName: franchiseDetail?.name || 'Franchise',
        userEmail: '',
        actionType: 'SERVICE_TOGGLE',
        description: `Service "${key.toUpperCase()}" updated to: ${newValue ? 'ENABLED' : 'DISABLED'}`,
        details: { service: key, enabled: newValue }
      });
    } catch (err) {
      console.error("Error saving service status:", err);
      // Revert upon failure
      setServicesEnabled(servicesEnabled);
      alert("Failed to update status in real-time. Please try again.");
    }
  };

  const handleSavePrintSettings = async () => {
    const fid = franchiseId || currentFranchise?.id;
    if (!fid) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateDoc(doc(db, 'franchises', fid), {
        printName: editPrintName,
        printMobile: editPrintMobile,
        printAddress: editPrintAddress,
        upiId: editUpiId,
        letterheadTemplateId: editLetterheadTemplateId,
        servicesEnabled: servicesEnabled
      });
      
      await activityLogger.log({
        franchiseId: fid,
        franchiseName: editPrintName || franchiseDetail?.name || 'Franchise',
        userEmail: '',
        actionType: 'PRINT_SETTING_CHANGE',
        description: `Updated receipt header template & booking settings. Contact Name: ${editPrintName}`,
      });

      setSaveSuccess(true);
      // Saved successfully, save dashboard preference to hide receipt warning
      localStorage.setItem('hideDashboardPrintSettings', 'true');
      window.dispatchEvent(new Event('storage')); // Notify dashboard of changes
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error updating print configurations:", err);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault();
    const fid = franchiseId || currentFranchise?.id;
    if (!fid) return;
    setIsRatesSaving(true);
    setRatesSaveSuccess(false);

    try {
      const currentRates = franchiseDetail?.customRates || {};
      const changes: string[] = [];

      const keysWithLabels: { [key: string]: string } = {
        tankerBase: 'Tanker Booking Portal Base',
        standbyTankerBase: 'Standby Tanker Day 1 Base',
        standbyTankerExtraDay: 'Standby Tanker Daily Extra',
        monthlyTankerBase: 'Monthly Tanker Base',
        can20lBase: '20L Can Billing Rate',
        can20lBookingBase: '20L Can Booking Rate',
        monthlyCanBase: 'Monthly Can Base Rate',
        bottle500ml: '500ml Package Bottle',
        bottle1l: '1L Package Bottle',
        bottle2l: '2L Package Bottle',
        tanker5000L: '5000L Tanker Size Rate',
        tanker7500L: '7500L Tanker Size Rate',
        tanker10000L: '10000L Tanker Size Rate',
        tanker15000L: '15000L Tanker Size Rate',
      };

      const keysDefaults: { [key: string]: number } = {
        tankerBase: 350,
        standbyTankerBase: 900,
        standbyTankerExtraDay: 600,
        monthlyTankerBase: 10000,
        can20lBase: 80,
        can20lBookingBase: 30,
        monthlyCanBase: 600,
        bottle500ml: 10,
        bottle1l: 20,
        bottle2l: 35,
        tanker5000L: 400,
        tanker7500L: 600,
        tanker10000L: 800,
        tanker15000L: 1200,
      };

      Object.keys(rates).forEach((key) => {
        const oldValue = currentRates[key] !== undefined ? currentRates[key] : keysDefaults[key];
        const newValue = Number(rates[key]);
        if (oldValue !== newValue) {
          changes.push(`${keysWithLabels[key] || key}: ₹${oldValue} ➔ ₹${newValue}`);
        }
      });

      await updateDoc(doc(db, 'franchises', fid), {
        customRates: rates
      });

      if (changes.length > 0) {
        await activityLogger.log({
          franchiseId: fid,
          franchiseName: franchiseDetail?.name || 'Franchise',
          userEmail: '',
          actionType: 'RATE_CHANGE',
          description: `Updated service base rates: ${changes.join(', ')}`,
          details: { oldRates: currentRates, newRates: rates, diff: changes }
        });
      }

      setRatesSaveSuccess(true);
      setTimeout(() => setRatesSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving pricing rates:", err);
      alert("Failed to save rates. Please try again.");
    } finally {
      setIsRatesSaving(false);
    }
  };

  // High-conversion banner themes list
  const templates: BannerTemplate[] = [
    {
      id: 'classic-1',
      title: 'Standard Pure',
      category: 'classic',
      sloganHi: 'Order Pure Water At Your Doorstep',
      sloganEn: 'RO Cans • Packaged Bottles • Smart Water Tankers',
      bgGradient: 'from-blue-600 to-cyan-500',
      textColor: 'text-white',
      accentBadge: '100% Pure & Safe',
      accentBadgeBg: 'bg-emerald-500/20 text-emerald-200',
      illustrationDesc: 'Pure RO water cans, packaging bottles and fast water tanker booking services are available.',
      itemsIncluded: ['Water Tanker', '20L RO Water Can', 'Packaged Bottles']
    },
    {
      id: 'funny-1',
      title: 'Humorous Neighborhood',
      category: 'funny',
      sloganHi: 'Stop asking neighbors for water, brother!',
      sloganEn: 'Order RO Can & Tanker instantly on TankerWala 😊',
      bgGradient: 'from-amber-500 to-orange-600',
      textColor: 'text-white',
      accentBadge: 'Smile and Order',
      accentBadgeBg: 'bg-white/20 text-amber-100',
      illustrationDesc: 'How long will you ask neighbors for water? Scan today and solve your water problem permanently!',
      itemsIncluded: ['Full Tanker', '20L Chill Cans', 'Premium Catering Supplies']
    },
    {
      id: 'funny-2',
      title: 'Party & Event Special',
      category: 'funny',
      sloganHi: 'No thirsty guests at your events!',
      sloganEn: 'Superfast Water Supply for Special Occasions',
      bgGradient: 'from-purple-600 to-rose-500',
      textColor: 'text-white',
      accentBadge: 'Your Event Partner',
      accentBadgeBg: 'bg-pink-500/30 text-pink-200',
      illustrationDesc: 'Get water delivered in minutes for your special wedding or birthday events.',
      itemsIncluded: ['Event Bulk Supply', 'Chilled 20L Water Cans', 'Mineral Retail Bottles']
    },
    {
      id: 'serious-1',
      title: 'Health-First Family',
      category: 'serious',
      sloganHi: 'Pure Water, Healthy Family',
      sloganEn: 'Protect Your Children with 100% Filtered RO Water Cans',
      bgGradient: 'from-emerald-600 to-teal-500',
      textColor: 'text-white',
      accentBadge: 'Conforming to WHO Standards',
      accentBadgeBg: 'bg-white/20 text-emerald-100',
      illustrationDesc: 'Say goodbye to diseases, bring pure RO water cans. Every drop safe and reliable.',
      itemsIncluded: ['Laboratory Tested Cans', 'Packaged Pure Water', 'Certified Supply Tankers']
    },
    {
      id: 'fast-1',
      title: 'Instant Urgent Support',
      category: 'fast',
      sloganHi: 'Out of water? Don\'t worry! Just scan',
      sloganEn: 'Lightning Fast Delivery in 20 Minutes!',
      bgGradient: 'from-red-600 to-red-400',
      textColor: 'text-white',
      accentBadge: 'Emergency Water Service',
      accentBadgeBg: 'bg-yellow-400 text-red-950',
      illustrationDesc: 'No waiting lines! Just scan and get water delivered instantly at your doorstep.',
      itemsIncluded: ['Instant Tanker', 'Express RO Can Deliveries', 'Priority Hydrant Refills']
    }
  ];

  const handlePrintBannerTemplate = (template: BannerTemplate) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const currentFId = franchiseDetail?.id || franchiseId || currentFranchise?.id || '';
    const bookingUrl = `${getPublicAppUrl().toString()}?mode=booking&f=${currentFId}`;
    
    // Create an inline SVG generated values
    const upiStr = `upi://pay?pa=${editUpiId}&pn=${encodeURIComponent(editPrintName || 'TankerWala')}&cu=INR`;

    printWindow.document.write(`
      <html>
        <head>
          <title>Banners - ${template.title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Mukta:wght@400;700;800&family=Outfit:wght@400;700;900&display=swap');
            body {
              font-family: 'Mukta', 'Outfit', sans-serif;
              text-align: center;
              padding: 0;
              margin: 0;
              background-color: #f8fafc;
              color: #0f172a;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .poster-container {
              max-width: 800px;
              margin: 0 auto;
              background: #ffffff;
              box-shadow: 0 4px 50px rgba(0,0,0,0.06);
              border-radius: 40px;
              overflow: hidden;
              padding-bottom: 50px;
            }
            .header-banner {
              background: linear-gradient(135deg, ${template.id === 'classic-1' ? '#2563eb, #06b6d4' : template.id === 'funny-1' ? '#f59e0b, #ea580c' : template.id === 'funny-2' ? '#9333ea, #f43f5e' : template.id === 'serious-1' ? '#059669, #14b8a6' : '#dc2626, #f87171'});
              color: #ffffff;
              padding: 60px 40px;
              border-bottom-right-radius: 50px;
              border-bottom-left-radius: 50px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            }
            .logo-brand {
              font-size: 54px;
              font-weight: 900;
              margin: 0 0 5px 0;
              letter-spacing: -2px;
            }
            .brand-sub {
              font-size: 13px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 5px;
              opacity: 0.9;
              margin-bottom: 30px;
            }
            .main-slogan {
              font-size: 46px;
              font-weight: 800;
              line-height: 1.2;
              margin-bottom: 10px;
              text-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .sub-slogan {
              font-size: 20px;
              opacity: 0.95;
              font-weight: 500;
            }
            .badge-item {
              display: inline-block;
              padding: 6px 18px;
              font-size: 14px;
              font-weight: 700;
              border-radius: 100px;
              background-color: rgba(255,255,255,0.25);
              border: 1px solid rgba(255,255,255,0.4);
              margin-bottom: 25px;
              color: #ffffff;
            }
            .middle-section {
              padding: 40px px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .desc-text {
              font-size: 19px;
              color: #475569;
              max-width: 600px;
              margin: 20px auto 35px auto;
              line-height: 1.6;
              font-weight: 500;
            }
            .qr-wrapper {
              display: inline-block;
              background: #ffffff;
              padding: 25px;
              border-radius: 35px;
              box-shadow: 0 20px 50px rgba(0,0,0,0.08);
              border: 4px solid #f1f5f9;
              margin-bottom: 30px;
            }
            .scan-step {
              font-size: 22px;
              font-weight: 800;
              color: #0f172a;
              margin-bottom: 10px;
            }
            .scan-tip {
              font-size: 15px;
              color: #64748b;
              margin-bottom: 35px;
            }
            .items-container {
              display: flex;
              justify-content: center;
              gap: 15px;
              margin-bottom: 40px;
              flex-wrap: wrap;
            }
            .item-badge {
              background: #f1f5f9;
              color: #334155;
              padding: 10px 24px;
              font-size: 16px;
              font-weight: 700;
              border-radius: 12px;
              border: 1px solid #e2e8f0;
            }
            .footer-info {
              background: #f8fafc;
              margin: 0 40px;
              padding: 30px;
              border-radius: 30px;
              border: 2px dashed #cbd5e1;
            }
            .branch-info {
              font-size: 22px;
              font-weight: 800;
              color: #1e293b;
            }
            .branch-contact {
              font-size: 26px;
              font-weight: 800;
              color: #2563eb;
              margin-top: 8px;
            }
          </style>
        </head>
        <body>
          <div class="poster-container">
            <div class="header-banner">
              <div class="logo-brand">TankerWala</div>
              <div class="brand-sub">Powered by Rajhans</div>
              <div class="badge-item">${template.accentBadge}</div>
              <div class="main-slogan">${template.sloganHi}</div>
              <div class="sub-slogan">${template.sloganEn}</div>
            </div>
            
            <div class="middle-section">
              <p class="desc-text">${template.illustrationDesc}</p>
              
              <div class="qr-wrapper">
                <!-- Direct injection of Google API dynamic web QR code generator for printable safety -->
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingUrl)}" width="220" height="220" />
              </div>
              
              <div class="scan-step">Scan QR Code & Order!📱</div>
              <div class="scan-tip">Open Camera / Google Lens, scan QR to visit the booking portal</div>
              
              <div class="items-container">
                ${template.itemsIncluded.map(item => `<div class="item-badge">${item}</div>`).join('')}
              </div>
              
              <div class="footer-info">
                <div class="branch-info">${editPrintName || franchiseDetail?.name || 'TankerWala'}</div>
                <div class="branch-contact">📞 Ph: +91 ${editPrintMobile || franchiseDetail?.operatorMobile || '94133 39987'}</div>
              </div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8">
      
      {/* Header section with setting metadata */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">
            <SettingsIcon size={14} className="text-blue-500 animate-spin-slow" />
            <span>Regional Administrative Hub</span>
          </div>
          <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight">
            Hub Settings & Management
          </h1>
        </div>

        {/* Dynamic sub tab keys switcher */}
        <div className="bg-white border border-slate-100 p-1.5 rounded-2xl flex items-center shadow-sm">
          <button
            type="button"
            onClick={() => setActiveSubTab('print')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeSubTab === 'print' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Printer size={14} /> Print Settings
          </button>
          
          <button
            type="button"
            onClick={() => setActiveSubTab('drivers')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeSubTab === 'drivers' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Truck size={14} /> Drivers Setup
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('fleet')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeSubTab === 'fleet' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Fuel size={14} /> Fleet Maintenance
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('pricing')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeSubTab === 'pricing' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Sparkles size={14} className="text-amber-400 animate-pulse" /> Custom Rates
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('apps')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeSubTab === 'apps' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Smartphone size={14} className="text-blue-500 animate-pulse" /> Mobile Apps & APK
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.15 }}
        >
          {activeSubTab === 'print' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              
              {/* Form panel configuration keys */}
              <div className="xl:col-span-1 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center">
                      <Printer size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">Receipt Configuration</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Thermal Receipt Settings</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
                        Franchise Headline Name
                      </label>
                      <input
                        type="text"
                        value={editPrintName}
                        onChange={(e) => setEditPrintName(e.target.value)}
                        placeholder={franchiseDetail?.name || 'TankerWala Sikar'}
                        className="w-full bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl text-xs text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
                        Receipt Helpline Number
                      </label>
                      <input
                        type="text"
                        value={editPrintMobile}
                        onChange={(e) => setEditPrintMobile(e.target.value)}
                        placeholder="94133 39987"
                        className="w-full bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl text-xs text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
                        Business Details Address
                      </label>
                      <textarea
                        rows={2}
                        value={editPrintAddress}
                        onChange={(e) => setEditPrintAddress(e.target.value)}
                        placeholder="Receipt bottom address list"
                        className="w-full bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
                        Payments VPA / Merchant UPI ID
                      </label>
                      <input
                        type="text"
                        value={editUpiId}
                        onChange={(e) => setEditUpiId(e.target.value)}
                        placeholder="rajha94133@barodampay"
                        className="w-full bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* Premium Letterhead Design Templates Selector */}
                    <div className="mt-4 pt-4 border-t border-slate-100/80">
                      <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2">
                        Select Letterhead Template
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'classic-royal', name: 'Royal Navy', desc: 'Sleek Navy Banner Accent', border: 'border-blue-900', bg: 'bg-blue-900' },
                          { id: 'emerald-clean', name: 'Emerald Clean', desc: 'Fresh Cool Mint Accent', border: 'border-emerald-700', bg: 'bg-emerald-700' },
                          { id: 'tech-slate', name: 'Tech Slate', desc: 'Minimal Bold Carbon Style', border: 'border-slate-800', bg: 'bg-slate-800' },
                          { id: 'warm-saffron', name: 'Warm Saffron', desc: 'Amber Gold Traditional', border: 'border-amber-600', bg: 'bg-amber-600' }
                        ].map((lh) => {
                          const isSelected = editLetterheadTemplateId === lh.id;
                          return (
                            <button
                              key={lh.id}
                              type="button"
                              onClick={() => setEditLetterheadTemplateId(lh.id)}
                              className={`text-left p-2 px-3 rounded-xl border transition-all flex flex-col justify-between h-20 ${
                                isSelected 
                                  ? `border-slate-800 bg-slate-50 ring-2 ring-slate-800` 
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="text-[10px] font-black text-slate-800">{lh.name}</span>
                                <div className={`w-2 h-2 rounded-full ${lh.bg}`}></div>
                              </div>
                              <div className="w-full mt-1">
                                <div className={`h-1.5 w-10 rounded-full mb-0.5 ${lh.bg}`}></div>
                                <div className="h-0.5 w-6 bg-slate-200 rounded-full"></div>
                              </div>
                              <span className="text-[8px] text-slate-400 font-bold leading-none truncate w-full mt-1 block">{lh.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ecosystem Services Offered Toggles */}
                    <div className="mt-6 pt-6 border-t border-slate-100/80">
                      <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2">
                        Ecosystem Offerings
                      </label>
                      <p className="text-[10px] text-slate-400 font-semibold mb-4 leading-relaxed">
                        Toggle what services are available to nearest customers. Turning off a service hides it from their Booking Portal.
                      </p>
                      
                      <div className="grid grid-cols-1 gap-2.5">
                        {/* Tanker Toggle */}
                        <div className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                          !superAdminServices.tanker 
                            ? 'bg-slate-100/70 border-slate-200/50 opacity-70' 
                            : 'bg-slate-50 border-slate-100'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">🚰</span>
                            <div>
                              <span className="font-extrabold text-xs text-slate-700 block flex items-center gap-2">
                                Tanker Service
                                {!superAdminServices.tanker && (
                                  <span className="text-[8px] font-bold uppercase text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                                    Disabled by Admin
                                  </span>
                                )}
                              </span>
                              <span className="text-[9px] text-slate-400 font-bold block">
                                {!superAdminServices.tanker ? 'Super Admin has locked this service (Not Authorized)' : 'Water Tankers (5000L+)'}
                              </span>
                            </div>
                          </div>
                          <label className={`relative inline-flex items-center ${superAdminServices.tanker ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                            <input 
                              type="checkbox" 
                              checked={superAdminServices.tanker && servicesEnabled.tanker}
                              disabled={!superAdminServices.tanker}
                              onChange={() => handleServiceToggle('tanker')}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        {/* 20L Can Toggle */}
                        <div className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                          !superAdminServices.can 
                            ? 'bg-slate-100/70 border-slate-200/50 opacity-70' 
                            : 'bg-slate-50 border-slate-100'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">🧴</span>
                            <div>
                              <span className="font-extrabold text-xs text-slate-700 block flex items-center gap-2">
                                20L Can Service
                                {!superAdminServices.can && (
                                  <span className="text-[8px] font-bold uppercase text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                                    Disabled by Admin
                                  </span>
                                )}
                              </span>
                              <span className="text-[9px] text-slate-400 font-bold block">
                                {!superAdminServices.can ? 'Super Admin has locked this service (Not Authorized)' : 'Chilled RO Water Cans'}
                              </span>
                            </div>
                          </div>
                          <label className={`relative inline-flex items-center ${superAdminServices.can ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                            <input 
                              type="checkbox" 
                              checked={superAdminServices.can && servicesEnabled.can}
                              disabled={!superAdminServices.can}
                              onChange={() => handleServiceToggle('can')}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        {/* Packaged Water Bottle Toggle */}
                        <div className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                          !superAdminServices.bottle 
                            ? 'bg-slate-100/70 border-slate-200/50 opacity-70' 
                            : 'bg-slate-50 border-slate-100'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">🍾</span>
                            <div>
                              <span className="font-extrabold text-xs text-slate-700 block flex items-center gap-2">
                                Packaged Water
                                {!superAdminServices.bottle && (
                                  <span className="text-[8px] font-bold uppercase text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                                    Disabled by Admin
                                  </span>
                                )}
                              </span>
                              <span className="text-[9px] text-slate-400 font-bold block">
                                {!superAdminServices.bottle ? 'Super Admin has locked this service (Not Authorized)' : '500ml, 1L, 2L Bulk Bottles'}
                              </span>
                            </div>
                          </div>
                          <label className={`relative inline-flex items-center ${superAdminServices.bottle ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                            <input 
                              type="checkbox" 
                              checked={superAdminServices.bottle && servicesEnabled.bottle}
                              disabled={!superAdminServices.bottle}
                              onChange={() => handleServiceToggle('bottle')}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <QRCodeSVG 
                        value={`upi://pay?pa=${editUpiId || 'rajha94133@barodampay'}&pn=${encodeURIComponent(editPrintName || 'TankerWala')}&cu=INR`}
                        size={36}
                      />
                      <div>
                        <p className="text-[9px] font-extrabold text-slate-400 uppercase">Interactive QR</p>
                        <p className="text-[10px] text-slate-700 font-mono truncate max-w-[110px]">{editUpiId || 'rajha94133@barodampay'}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSavePrintSettings}
                    disabled={isSaving}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-xl transition-all shadow-md shadow-emerald-50 flex items-center justify-center gap-1.5 mb-4"
                  >
                    {isSaving ? 'Processing...' : saveSuccess ? '✓ Successfully Saved!' : 'Save Print Configuration'}
                  </button>

                  {/* Re-enable print panel toggle option */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Dashboard Print Checklist?</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Show print card on dashboard</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isDashboardPrintHidden) {
                          localStorage.removeItem('hideDashboardPrintSettings');
                          setIsDashboardPrintHidden(false);
                          alert("Visible on Dashboard!");
                        } else {
                          localStorage.setItem('hideDashboardPrintSettings', 'true');
                          setIsDashboardPrintHidden(true);
                          alert("Hidden from Dashboard!");
                        }
                        window.dispatchEvent(new Event('storage'));
                      }}
                      className="px-3 py-1.5 bg-white border border-slate-350 hover:bg-slate-50 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl shadow-sm transition-colors shrink-0"
                    >
                      {isDashboardPrintHidden ? '🔄 Show on Dashboard' : '🙈 Hide from Dashboard'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Banners & Templates Gallery (A4 pamphlet and brochures) */}
              <div className="xl:col-span-2 space-y-6">
                <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 mb-6 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-indigo-500 text-white rounded-2xl flex items-center justify-center shadow-md shadow-indigo-100">
                        <Sparkles size={22} className="animate-pulse" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-slate-900 leading-tight">Flyers & Banners Multi-Templates</h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">New, creative and informative pamphlet designs every day</p>
                      </div>
                    </div>
                    
                    {/* Copy Link button shortcut */}
                    <button
                      type="button"
                      onClick={() => {
                        const bookingUrl = `${getPublicAppUrl().toString()}?mode=booking&f=${franchiseDetail?.id || franchiseId || currentFranchise?.id || ''}`;
                        copyToClipboard(bookingUrl);
                        alert("Interactive booking link copied to clipboard!");
                      }}
                      className="border-2 border-slate-100 hover:border-slate-200 bg-white px-4 py-2 rounded-xl text-slate-700 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all w-fit"
                    >
                      <Copy size={12} /> Copy Link
                    </button>
                  </div>

                  {/* Grid layout of pamphlets templates */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {templates.map((template) => {
                      const isActive = selectedTemplateId === template.id;
                      return (
                        <div 
                          key={template.id}
                          className={`relative border-2 rounded-3xl overflow-hidden transition-all flex flex-col justify-between ${
                            isActive ? 'border-indigo-600 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          {/* Card Header Illustration */}
                          <div className={`p-5 bg-gradient-to-tr ${template.bgGradient} ${template.textColor}`}>
                            <div className="flex items-center justify-between gap-2 mb-4">
                              <span className="text-[9px] font-black uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full">
                                {template.category === 'funny' ? '😂 Funny Theme' : template.category === 'serious' ? '🛡️ Health Theme' : template.category === 'fast' ? '⚡ Superfast' : '🚰 Classic Premium'}
                              </span>
                              <div className={`text-[9px] font-black px-2 py-0.5 rounded-full ${template.accentBadgeBg}`}>
                                {template.accentBadge}
                              </div>
                            </div>
                            
                            <h3 className="text-lg font-extrabold leading-tight mb-1 font-display">
                              {template.sloganHi}
                            </h3>
                            <p className="text-[10px] opacity-85 font-semibold">
                              {template.sloganEn}
                            </p>
                          </div>

                          {/* Detail fields */}
                          <div className="p-5 flex-1 bg-white">
                            <p className="text-[11px] text-slate-500 font-medium mb-4 leading-relaxed line-clamp-2">
                              {template.illustrationDesc}
                            </p>

                            <div className="flex flex-wrap gap-1.5 mb-4">
                              {template.itemsIncluded.slice(0, 3).map((item, idx) => (
                                <span key={idx} className="bg-slate-50 text-slate-600 text-[9.5px] font-semibold px-2 py-1 rounded-md border border-slate-100">
                                  ✓ {item}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Print Action Bottom Bar */}
                          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedTemplateId(template.id)}
                              className={`px-3 py-2 rounded-xl font-bold text-xs transition-all ${
                                isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              Selected
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTemplateId(template.id);
                                handlePrintBannerTemplate(template);
                              }}
                              className="flex-1 bg-slate-900 hover:bg-indigo-950 text-white font-bold text-xs uppercase tracking-wider py-2 rounded-xl flex items-center justify-center gap-1 shadow-sm transition-all"
                            >
                              <Printer size={12} /> Print Flyer
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          )}

          {activeSubTab === 'drivers' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-50 shadow-sm p-4 sm:p-6 overflow-hidden">
              <DriverManagement franchiseId={franchiseId} isSuperAdmin={isSuperAdmin} />
            </div>
          )}

          {activeSubTab === 'fleet' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-50 shadow-sm p-4 sm:p-6 overflow-hidden">
              <TractorDiesel franchiseId={franchiseId} isSuperAdmin={isSuperAdmin} />
            </div>
          )}

          {activeSubTab === 'pricing' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-50 shadow-sm p-6 sm:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <Sparkles className="text-amber-500 animate-pulse" size={22} />
                    Custom Base Rates Setup
                  </h2>
                  <p className="text-xs font-bold text-slate-400 mt-1 uppercase">
                    Configure your personalized base rates for automated estimations & billing
                  </p>
                </div>
                {ratesSaveSuccess && (
                  <div className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl flex items-center gap-1.5 animate-bounce">
                    <Check size={14} /> Rates saved successfully & logged
                  </div>
                )}
              </div>

              <form onSubmit={handleSaveRates} className="space-y-8">
                {/* 1. Water Tanker Section */}
                <div>
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-4 border-l-4 border-blue-600 pl-2.5">
                    🚰 Water Tanker Pricing
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        Portal Base Rate
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.tankerBase}
                        onChange={(e) => setRates({ ...rates, tankerBase: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹350"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Standard booking base (default: ₹350)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        5000L Capacity Rate
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.tanker5000L}
                        onChange={(e) => setRates({ ...rates, tanker5000L: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹400"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">5000 Litre tanker price (default: ₹400)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        7500L Capacity Rate
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.tanker5000L}
                        onChange={(e) => setRates({ ...rates, tanker7500L: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹600"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">7500 Litre tanker price (default: ₹600)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        10000L Capacity Rate
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.tanker10000L}
                        onChange={(e) => setRates({ ...rates, tanker10000L: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹800"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">10000 Litre tanker price (default: ₹800)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        15000L Capacity Rate
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.tanker15000L}
                        onChange={(e) => setRates({ ...rates, tanker15000L: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹1200"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">15000 Litre tanker price (default: ₹1200)</span>
                    </div>
                  </div>
                </div>

                {/* 2. Cans & RO Water */}
                <div>
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-4 border-l-4 border-amber-500 pl-2.5">
                    🧴 Cans & Monthly Plans Pricing
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        20L Can Billing Rate
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.can20lBase}
                        onChange={(e) => setRates({ ...rates, can20lBase: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹80"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Per-can invoice charge (default: ₹80)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        20L Can Booking Portal Rate
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.can20lBookingBase}
                        onChange={(e) => setRates({ ...rates, can20lBookingBase: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹30"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Booking portal starting rate (default: ₹30)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        Monthly RO Can Subscription Plan
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.monthlyCanBase}
                        onChange={(e) => setRates({ ...rates, monthlyCanBase: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹600"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Monthly plan value (default: ₹600)</span>
                    </div>
                  </div>
                </div>

                {/* 3. Packaged Bottles */}
                <div>
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-4 border-l-4 border-emerald-500 pl-2.5">
                    🍾 Packaged Bottles Pricing
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        500ml Packaged Bottle
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.bottle500ml}
                        onChange={(e) => setRates({ ...rates, bottle500ml: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹10"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Selling price (default: ₹10)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        1 Litre Packaged Bottle
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.bottle1l}
                        onChange={(e) => setRates({ ...rates, bottle1l: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹20"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Selling price (default: ₹20)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        2 Litre Packaged Bottle
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.bottle2l}
                        onChange={(e) => setRates({ ...rates, bottle2l: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹35"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Selling price (default: ₹35)</span>
                    </div>
                  </div>
                </div>

                {/* 4. Rentals & Standby */}
                <div>
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-4 border-l-4 border-violet-500 pl-2.5">
                    🚜 Rental & Standby Services Pricing
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        Standby Tanker Rental Day 1
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.standbyTankerBase}
                        onChange={(e) => setRates({ ...rates, standbyTankerBase: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹900"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Day 1 rate (default: ₹900)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        Standby Tanker Rental Day 2+ (Extra)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.standbyTankerExtraDay}
                        onChange={(e) => setRates({ ...rates, standbyTankerExtraDay: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹600"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Additional days rate (default: ₹600)</span>
                    </div>

                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                        Monthly Tanker Rental Plan
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={rates.monthlyTankerBase}
                        onChange={(e) => setRates({ ...rates, monthlyTankerBase: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder="Default: ₹10000"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block font-semibold">Monthly subscription value (default: ₹10000)</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                  <button
                    type="submit"
                    disabled={isRatesSaving}
                    className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-2xl flex items-center gap-1.5 shadow-md shadow-blue-100 transition-all disabled:opacity-50"
                  >
                    {isRatesSaving ? 'Saving...' : 'Save Base Rates'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeSubTab === 'apps' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-50 shadow-sm p-6 sm:p-8 space-y-8 animate-in fade-in slide-in-from-bottom duration-300">
              <div className="border-b border-slate-100 pb-4 mb-4">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <Smartphone className="text-blue-500 animate-pulse" size={22} />
                  Mobile App & Android APK Setup Center
                </h2>
                <p className="text-xs font-bold text-slate-400 mt-1 uppercase">
                  Launch or package your Driver app and Customer booking networks as native Android apps
                </p>
              </div>

              {/* Grid with 2 primary columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* COLUMN 1: INSTALLABLE PWA SYSTEM (NO CODE APK FEEL) */}
                <div className="space-y-6">
                  <div className="bg-blue-50/50 p-5 rounded-3xl border border-blue-100">
                    <h3 className="text-sm font-extrabold text-blue-900 flex items-center gap-2 mb-2">
                       <span className="flex h-2 w-2 relative">
                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                         <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                       </span>
                       Recommended: Instant PWA Installer
                    </h3>
                    <p className="text-xs text-blue-700 leading-relaxed font-medium">
                      Both our applications are built with highly advanced Progressive Web App (PWA) technology. They install instantly onto any standard Android, bypassing Google Play Store requirements.
                    </p>
                  </div>

                  {/* 1. CUSTOMER PORTAL */}
                  <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 flex flex-col md:flex-row items-center gap-6">
                    <div className="bg-white p-3 rounded-2xl border border-slate-200/60 shadow-sm shrink-0">
                      <QRCodeSVG 
                        value={`${getPublicAppUrl().toString()}?mode=booking&f=${franchiseDetail?.id || franchiseId || currentFranchise?.id || ''}`}
                        size={120}
                        includeMargin={true}
                      />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <span className="bg-blue-100 text-blue-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-md">Customer App</span>
                        <h4 className="text-sm font-black text-slate-800 mt-1.5">Online Tanker & Can Booking</h4>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">Let customers book tankers, buy water cans, pay online & track live status from their native app dashboard.</p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${getPublicAppUrl().toString()}?mode=booking&f=${franchiseDetail?.id || franchiseId || currentFranchise?.id || ''}`;
                            copyToClipboard(url);
                            alert("Customer Booking App URL copied successfully!");
                          }}
                          className="bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-xl text-slate-700 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <Copy size={12} /> Copy App URL
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${getPublicAppUrl().toString()}?mode=booking&f=${franchiseDetail?.id || franchiseId || currentFranchise?.id || ''}`;
                            window.open(url, '_blank');
                          }}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl flex items-center gap-1 leading-none shadow-sm transition-all cursor-pointer"
                        >
                          <Eye size={12} /> Launch Live app
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 2. DRIVER APP */}
                  <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 flex flex-col md:flex-row items-center gap-6">
                    <div className="bg-white p-3 rounded-2xl border border-slate-200/60 shadow-sm shrink-0">
                      <QRCodeSVG 
                        value={`${getPublicAppUrl().toString()}?mode=driver`}
                        size={120}
                        includeMargin={true}
                      />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <span className="bg-violet-100 text-violet-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-md">Driver Logistics App</span>
                        <h4 className="text-sm font-black text-slate-800 mt-1.5">Driver Navigation & Deliveries</h4>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">Required for tractor drivers to mark attendance, receive pending diesel requests, update delivery jobs & transmit background live GPS map locations.</p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${getPublicAppUrl().toString()}?mode=driver`;
                            copyToClipboard(url);
                            alert("Driver App URL copied successfully!");
                          }}
                          className="bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-xl text-slate-700 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <Copy size={12} /> Copy App URL
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${getPublicAppUrl().toString()}?mode=driver`;
                            window.open(url, '_blank');
                          }}
                          className="bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl flex items-center gap-1 leading-none shadow-sm transition-all cursor-pointer"
                        >
                          <Eye size={12} /> Launch Live app
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-5 rounded-3xl">
                    <h4 className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5 mb-2">
                      💡 How to Install PWA App on any Android Smartphone:
                    </h4>
                    <ol className="text-[11px] text-amber-800 space-y-2 list-decimal pl-4 font-medium">
                      <li>Scan the **QR Code** using your phone's camera, or send the **Copied URL** via WhatsApp.</li>
                      <li>Open the link inside **Google Chrome** on the Android smartphone.</li>
                      <li>Tap the **3-Dots Menu icon** in the top-right corner of Chrome.</li>
                      <li>Select **"Add to Home Screen"** or **"Install App"** from the drop-down.</li>
                      <li>An elegant app shortcut icon will appear on your device's home screen. When clicked, it loads directly in immersive full-screen standalone format with optimal security and performance.</li>
                    </ol>
                  </div>
                </div>

                {/* COLUMN 2: HARD-APKCATION BUILD (CAPACITOR CLI STEP-BY-STEP) */}
                <div className="bg-slate-900 text-slate-100 p-6 sm:p-8 rounded-[2.5rem] border border-slate-800 shadow-xl flex flex-col justify-between">
                  <div className="space-y-6">
                    <div>
                      <span className="bg-blue-600/20 text-blue-400 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border border-blue-500/30">Official Build Hub</span>
                      <h3 className="text-lg font-black text-white mt-2 flex items-center gap-2">
                        Native Android APK Builder (.apk)
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        If you want a physical binary `.apk` package to submit to the **Google Play Store** or distribute as a manual download link, you can utilize the industry-standard framework called **Capacitor**. We have pre-configured everything for you!
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Preloaded Configuration File Detected</p>
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto select-all max-h-40">
                          {`// capacitor.config.json\n{\n  "appId": "com.tankerwala.app",\n  "appName": "TankerWala Powered by Rajhans",\n  "webDir": "dist",\n  "server": {\n    "androidScheme": "https",\n    "allowNavigation": ["*"]\n  }\n}`}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Run These Commands Locally To Generate Custom APKs:</p>
                        
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4 font-mono text-[11px]">
                          <div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase">Step 1: Install Mobile Framework (Only First Time)</p>
                            <p className="text-slate-300 mt-1">npm install @capacitor/core @capacitor/cli @capacitor/android</p>
                            <p className="text-slate-300 mt-1">npx cap add android</p>
                          </div>
                          
                          <div className="border-t border-slate-900/50 pt-3">
                            <p className="text-[9px] text-emerald-405 font-bold uppercase text-emerald-400">Step 2: Run 1-Click Automated Setup for Desired App</p>
                            <div className="space-y-2 mt-1.5">
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase font-bold">A) For Customer App APK:</p>
                                <p className="text-emerald-400">npm run build:customer</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase font-bold">B) For Driver App APK:</p>
                                <p className="text-emerald-400">npm run build:driver</p>
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-slate-900/50 pt-3">
                            <p className="text-[9px] text-blue-400 font-bold uppercase">Step 3: Export Android .apk</p>
                            <p className="text-slate-300 mt-1">npx cap sync android</p>
                            <p className="text-slate-300 mt-1">npx cap open android</p>
                            <p className="text-[10px] text-slate-400 mt-1.5 font-sans leading-relaxed">This opens Android Studio instantly. From the menu bar, just click: <strong className="text-white">Build &gt; Build Bundle(s)/APK(s) &gt; Build APK(s)</strong>. Your APK is compiled representing the selected mode immediately!</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-800 text-[11px] text-slate-400">
                    <p className="font-bold text-slate-300 mb-1">💡 Pro-tip on Google API Keys:</p>
                    Ensure your Google Maps API keys are added in your environment variables. Android WebView allows tracking automatically as long as the user authorizes the platform's standard location popup request!
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
