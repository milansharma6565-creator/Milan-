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
  Fuel
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dashboard } from './components/Dashboard';
import { CustomerManagement } from './components/CustomerManagement';
import { Billing } from './components/Billing';
import { Ledger } from './components/Ledger';
import { TractorDiesel } from './components/TractorDiesel';
import { ReportView } from './components/ReportView';
import { DriverManagement } from './components/DriverManagement';
import { DriverLiveTracking } from './components/DriverLiveTracking';
import { Logo } from './components/Logo';
import { auth, googleProvider, signInWithPopup, onAuthStateChanged } from './firebase';
import { User } from 'firebase/auth';

type Tab = 'dashboard' | 'customers' | 'billing' | 'reports' | 'drivers' | 'ledger' | 'tractors';

import { format } from 'date-fns';
import { formatCurrency } from './constants';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
  }, []);

  const queryParams = new URLSearchParams(window.location.search);
  const driverId = queryParams.get('driverId');

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Login failed:', error);
      if (error.code === 'auth/unauthorized-domain') {
        alert('This domain is not authorized in Firebase Console. Please add it to "Authentication > Settings > Authorized Domains".');
      } else if (error.code === 'auth/popup-closed-by-user') {
        // Just ignore
      } else {
        alert(`Login failed: ${error.message}`);
      }
    }
  };

  const handleLogout = () => auth.signOut();

  // If driverId is present, show tracking page regardless of auth
  if (driverId) {
    return <DriverLiveTracking driverId={driverId} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[2.5rem] shadow-xl max-w-md w-full text-center border border-slate-100"
        >
          <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200 text-white">
            <Truck size={40} />
          </div>
          <h1 className="text-3xl font-display font-black text-slate-900 mb-2 whitespace-pre-wrap">Rajhans steel and Water</h1>
          <p className="text-slate-500 font-medium mb-8">Management System • Water Tanker Service</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-slate-900 text-white h-14 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
          >
            <LogIn size={20} />
            Sign in with Google
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
      case 'reports': return <ReportView />;
      case 'ledger': return <Ledger />;
      case 'tractors': return <TractorDiesel />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-white border-b border-slate-100 p-4 flex items-center justify-between sticky top-0 z-[40]">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-display font-bold text-lg uppercase tracking-tight text-blue-900">Rajhans</span>
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
          <div className="flex items-center gap-3">
            <Logo size={48} />
            <span className="font-display font-bold text-xl uppercase tracking-tight text-blue-900">Rajhans</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden">
            <X size={24} />
          </button>
        </div>

        <nav className="flex flex-col gap-2 flex-1 scrollbar-hide overflow-y-auto">
          <SidebarButton icon={<LayoutDashboard size={20} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Users size={20} />} label="Customers" active={activeTab === 'customers'} onClick={() => { setActiveTab('customers'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Ticket size={20} />} label="Create Token" active={activeTab === 'billing'} onClick={() => { setActiveTab('billing'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Truck size={20} />} label="Drivers" active={activeTab === 'drivers'} onClick={() => { setActiveTab('drivers'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<LineChart size={20} />} label="Reports" active={activeTab === 'reports'} onClick={() => { setActiveTab('reports'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<ClipboardList size={20} />} label="Ledger" active={activeTab === 'ledger'} onClick={() => { setActiveTab('ledger'); setIsSidebarOpen(false); }} />
          <SidebarButton icon={<Fuel size={20} />} label="Fleet & Fuel" active={activeTab === 'tractors'} onClick={() => { setActiveTab('tractors'); setIsSidebarOpen(false); }} />
        </nav>

        <div className="pt-6 border-t border-slate-100 mt-auto">
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

      {/* Mobile Nav Button (Floating New Token) */}
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
        <NavButton icon={<LayoutDashboard size={24} />} label="Home" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavButton icon={<Users size={24} />} label="Customers" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
        <div className="w-16" />
        <NavButton icon={<History size={24} />} label="History" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
        <NavButton icon={<BookOpen size={24} />} label="Ledger" active={activeTab === 'ledger'} onClick={() => setActiveTab('ledger')} />
      </nav>
    </div>
  );
}

function SidebarButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
        active 
          ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-100' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <div className={`${active ? 'text-white' : 'text-slate-400'}`}>
        {icon}
      </div>
      <span className="text-sm tracking-tight">{label}</span>
    </button>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-blue-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
    >
      {icon}
      <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'opacity-100' : 'opacity-0'}`}>
        {label}
      </span>
    </button>
  );
}
