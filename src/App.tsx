import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  ReceiptIndianRupee, 
  FileBox, 
  Truck, 
  BookOpen,
  Menu,
  X,
  LogOut,
  LogIn,
  Plus,
  History,
  Ticket,
  LineChart,
  ClipboardList,
  Fuel,
  Navigation,
  CheckCircle2,
  Droplets,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dashboard } from './components/Dashboard';
import { CustomerManagement } from './components/CustomerManagement';
import { Billing } from './components/Billing';
import { Ledger } from './components/Ledger';
import { TractorDiesel } from './components/TractorDiesel';
import { ReportView } from './components/ReportView';
import { DriverManagement } from './components/DriverManagement';
import { DriverAttendance } from './components/DriverAttendance';
import { DriverTrackingAdmin } from './components/DriverTrackingAdmin';
import { DriverLiveTracking } from './components/DriverLiveTracking';
import { CustomerOrderView } from './components/CustomerOrderView';
import { HydrantFilling } from './components/HydrantFilling';
import PhoneSync from './components/PhoneSync';
import { DocumentVault } from './components/DocumentVault';
import { Logo } from './components/Logo';
import { GoodMorningGreeting } from './components/GoodMorningGreeting';
import { DriverApp } from './components/DriverApp';
import { CustomerBookingPortal } from './components/CustomerBookingPortal';
import { auth, googleProvider, signInWithPopup, onAuthStateChanged, db } from './firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { User } from 'firebase/auth';

type Tab = 'dashboard' | 'customers' | 'billing' | 'reports' | 'drivers' | 'ledger' | 'tractors' | 'live-map' | 'attendance' | 'filling' | 'sync' | 'documents';

import { format } from 'date-fns';
import { formatCurrency, getPublicAppUrl, copyToClipboard } from './constants';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    let tabParam: Tab | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      tabParam = params.get('tab') as Tab;
    } catch (e) {
      console.warn('URLSearchParams failed:', e);
    }
    
    if (tabParam && ['dashboard', 'customers', 'billing', 'reports', 'drivers', 'ledger', 'tractors', 'live-map', 'attendance', 'filling', 'sync', 'documents'].includes(tabParam)) {
      return tabParam;
    }
    return 'dashboard';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginInProgress, setLoginInProgress] = useState(false);
  const [pendingFuelCount, setPendingFuelCount] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'dieselRequests'), where('status', '==', 'Pending')), (snap) => {
      setPendingFuelCount(snap.size);
    }, (err) => {
      console.warn("Diesel requests count check failed (likely unauthenticated):", err.message);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
  }, []);

  let driverId: string | null = null;
  let orderId: string | null = null;
  let isDriverMode = false;
  let isCustomerMode = false;
  
  try {
    const queryParams = new URLSearchParams(window.location.search);
    driverId = queryParams.get('driverId');
    orderId = queryParams.get('o');
    isDriverMode = queryParams.get('mode') === 'driver';
    isCustomerMode = queryParams.get('mode') === 'booking';
  } catch (e) {
    console.warn('URLSearchParams failed in body:', e);
  }

  const handleLogin = async () => {
    if (loginInProgress) return;
    setLoginInProgress(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const authorizedEmails = ['rajhanssikar@gmail.com', 'milan.sharma6565@gmail.com'];
      
      // If NOT an admin, check if they are a registered driver
      if (!authorizedEmails.includes(result.user.email || '')) {
        // We will check during the next render if they have a driver profile
        // but for now, if they are NOT on the driver portal and NOT an admin, reject
        if (!isDriverMode) {
          await auth.signOut();
          alert(`ACCESS DENIED: Only authorized administrative accounts can access this system.`);
          return;
        }
      }
    } catch (error: any) {
      console.error('Login failed:', error?.message || String(error));
      if (error.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        alert(`ACCESS DENIED: The domain "${domain}" is not authorized in your Firebase Console.\n\nTo fix this:\n1. Go to Firebase Console\n2. Authentication > Settings > Authorized Domains\n3. Add "${domain}" to the list.`);
      } else if (error.code === 'auth/popup-closed-by-user') {
        // Just ignore
      } else if (error.code === 'auth/network-request-failed') {
        const domain = window.location.hostname;
        alert(`NETWORK ERROR: Firebase couldn't connect to the auth server.\n\nMost common fixes:\n1. Ensure "${domain}" is added to "Authorized Domains" in your Firebase Console.\n2. Disable "Prevent Cross-Site Tracking" or "Block Third-Party Cookies" in your browser settings (often an issue in Safari/Chrome).\n3. Check if an Ad-Blocker is blocking Google's login scripts.`);
      } else {
        alert(`Login failed (${error.code}): ${error.message}\n\nTip: If nothing happened, please check if your browser blocked the sign-in popup.`);
      }
    } finally {
      setLoginInProgress(false);
    }
  };

  const handleLogout = () => auth.signOut();

  // Driver App View
  if (isDriverMode) {
    return <DriverApp />;
  }

  // If driverId is present, show tracking page regardless of auth
  if (driverId) {
    return <DriverLiveTracking driverId={driverId} />;
  }

  // If orderId is present, show customer view regardless of auth
  if (orderId) {
    return <CustomerOrderView billId={orderId} />;
  }

  // Customer Booking view
  if (isCustomerMode) {
    return <CustomerBookingPortal />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center opacity-10 animate-pulse scale-[2.5]">
            <Logo size={120} />
          </div>
          <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center relative z-10 shadow-2xl shadow-blue-200">
            <Logo size={48} color="white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">TankerWala</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">Initializing System...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full text-center border border-slate-100"
        >
          <div className="bg-slate-900 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-100">
            <Logo size={56} color="white" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-1 tracking-tight text-center flex justify-center pb-2">
            Tanker<span className="relative text-blue-600">Wala<span className="absolute top-[95%] left-0 text-[11px] text-slate-400 font-medium whitespace-nowrap tracking-normal normal-case">Powered by Rajhans</span></span>
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-10 mb-2">Internal Management Portal</p>
          <p className="text-slate-500 font-medium mb-10 text-sm">Secure access for fleet administrators</p>
          
          <button 
            onClick={handleLogin}
            disabled={loginInProgress}
            className={`w-full ${loginInProgress ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 shadow-slate-200'} text-white h-14 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg`}
          >
            {loginInProgress ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <LogIn size={20} />
            )}
            {loginInProgress ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </motion.div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'customers': return <CustomerManagement />;
      case 'billing': return <Billing onBillCreated={() => setActiveTab('reports')} />;
      case 'drivers': return <DriverManagement />;
      case 'attendance': return <DriverAttendance />;
      case 'live-map': return <DriverTrackingAdmin isTab />;
      case 'reports': return <ReportView />;
      case 'ledger': return <Ledger />;
      case 'tractors': return <TractorDiesel />;
      case 'filling': return <HydrantFilling />;
      case 'sync': return <PhoneSync />;
      case 'documents': return <DocumentVault userEmail={user?.email || ''} />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <GoodMorningGreeting />
      {/* Mobile Top Header */}
      <header className="md:hidden bg-white border-b border-slate-100 p-4 flex items-center justify-between sticky top-0 z-[40]">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <h1 className="font-bold text-lg leading-tight pb-3">
            Tanker<span className="relative text-blue-600">Wala<span className="absolute top-[90%] left-0 text-[6px] text-slate-400 font-medium whitespace-nowrap tracking-normal normal-case mt-[2px]">Powered by Rajhans</span></span>
          </h1>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600"
        >
          <Menu size={24} />
        </button>
      </header>

      {/* Desktop Sidebar */}
      <aside className={`md:flex md:w-64 bg-white border-r border-slate-200 flex-col p-6 sticky top-0 h-screen z-50 ${isSidebarOpen ? 'flex fixed inset-0 w-full' : 'hidden'}`}>
        <div className="flex items-center justify-between mb-10">
          <div className="flex flex-col items-center gap-3 group px-2 text-center pb-4 border-b border-slate-100 mb-6 w-full">
            <div className="text-slate-900 transition-all group-hover:scale-110 drop-shadow-sm">
              <Logo size={56} />
            </div>
            <h1 className="font-display font-black text-xl tracking-tight text-slate-900 flex flex-col">
              Tanker<span className="relative text-blue-600 text-2xl -mt-1">Wala<span className="absolute top-[90%] left-0 text-[8px] text-slate-400 font-medium whitespace-nowrap tracking-normal normal-case mt-0.5">Powered by Rajhans</span></span>
            </h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden">
            <X size={24} />
          </button>
        </div>

        <nav className="flex flex-col gap-2 flex-1 scrollbar-hide overflow-y-auto">
          <SidebarButton icon={<LayoutDashboard size={20} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Navigation size={20} />} label="Live Map" active={activeTab === 'live-map'} onClick={() => { setActiveTab('live-map'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<CheckCircle2 size={20} />} label="Attendance" active={activeTab === 'attendance'} onClick={() => { setActiveTab('attendance'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Users size={20} />} label="Customers" active={activeTab === 'customers'} onClick={() => { setActiveTab('customers'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Ticket size={20} />} label="Create Token" active={activeTab === 'billing'} onClick={() => { setActiveTab('billing'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Truck size={20} />} label="Drivers" active={activeTab === 'drivers'} onClick={() => { setActiveTab('drivers'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<ClipboardList size={20} />} label="Ledger" active={activeTab === 'ledger'} onClick={() => { setActiveTab('ledger'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Droplets size={20} />} label="Hydrant Filling" active={activeTab === 'filling'} onClick={() => { setActiveTab('filling'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Smartphone size={20} />} label="Phone Sync" active={activeTab === 'sync'} onClick={() => { setActiveTab('sync'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<FileBox size={20} />} label="Documents" active={activeTab === 'documents'} onClick={() => { setActiveTab('documents'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Fuel size={20} />} label="Fleet & Fuel" active={activeTab === 'tractors'} onClick={() => { setActiveTab('tractors'); setIsSidebarOpen(false); }} badgeCount={pendingFuelCount} />
        </nav>

        <div className="pt-6 border-t border-slate-100 mt-auto">
          <div className="px-2 mb-4">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Internal Portals</p>
             <div className="flex flex-col gap-2">
               <div className="flex gap-2">
                 <button 
                   onClick={async () => {
                     const url = getPublicAppUrl();
                     url.searchParams.set('mode', 'booking');
                     url.searchParams.delete('tab');
                     const link = url.toString();
                     await copyToClipboard(link);
                     alert('Portal Link Copied! You can now share this URL with your customers.');
                   }}
                   className="flex-1 p-2 bg-slate-50 border border-slate-100 rounded-xl text-center text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                 >
                   Copy Cust. Link
                 </button>
                 <button 
                   onClick={async () => {
                      const url = getPublicAppUrl();
                      url.searchParams.set('mode', 'driver');
                      url.searchParams.delete('tab');
                      const link = url.toString();
                      await copyToClipboard(link);
                      alert('Driver App Link Copied! You can now share this URL with your drivers.');
                   }}
                   className="flex-1 p-2 bg-slate-50 border border-slate-100 rounded-xl text-center text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                 >
                   Copy Driver Link
                 </button>
               </div>
               <button 
                 onClick={() => {
                   const url = getPublicAppUrl();
                   url.searchParams.set('mode', 'driver');
                   url.searchParams.delete('tab');
                   window.open(url.toString(), '_blank');
                 }}
                 className="w-full p-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors border border-blue-100"
               >
                 Test Driver App View
               </button>
             </div>
          </div>
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center overflow-hidden border border-slate-100">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
              ) : (
                <Users className="text-blue-500 w-5 h-5" />
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold text-slate-900 truncate">{user.displayName || 'Administrator'}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin Staff</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 max-w-6xl mx-auto w-full md:p-8 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Action Button (Mobile Only) */}
      <div className="md:hidden">
        {activeTab !== 'billing' && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={() => setActiveTab('billing')}
            className="fixed bottom-24 right-6 w-16 h-16 bg-blue-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-blue-200 z-50 active:scale-90 transition-transform"
          >
            <Plus size={32} strokeWidth={3} />
          </motion.button>
        )}
      </div>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 h-20 flex items-center justify-around px-4 z-[40]">
        <NavButton icon={<CheckCircle2 size={24} />} label="Atten." active={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} />
        <NavButton icon={<LayoutDashboard size={24} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavButton icon={<Users size={24} />} label="Customers" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
        <div className="w-16" />
        <NavButton icon={<Fuel size={24} />} label="Fleet" active={activeTab === 'tractors'} onClick={() => setActiveTab('tractors')} badgeCount={pendingFuelCount} />
        <NavButton icon={<BookOpen size={24} />} label="Ledger" active={activeTab === 'ledger'} onClick={() => setActiveTab('ledger')} />
      </nav>
    </div>
  );
}

function SidebarButton({ icon, label, active, onClick, badgeCount }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, badgeCount?: number }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200 ${
        active 
          ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-100' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`${active ? 'text-white' : 'text-slate-400'}`}>
          {icon}
        </div>
        <span className="text-sm tracking-tight">{label}</span>
      </div>
      {badgeCount && badgeCount > 0 ? (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${active ? 'bg-white text-blue-600' : 'bg-red-500 text-white animate-bounce'}`}>
          {badgeCount}
        </span>
      ) : null}
    </button>
  );
}

function NavButton({ icon, label, active, onClick, badgeCount }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, badgeCount?: number }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all relative ${active ? 'text-blue-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
    >
      {icon}
      <span className="text-[10px] font-bold tracking-tight">{label}</span>
      {badgeCount && badgeCount > 0 ? (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
          {badgeCount}
        </span>
      ) : null}
    </button>
  );
}
