import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Plus, 
  LineChart,
  ClipboardList,
  Fuel,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dashboard } from './components/Dashboard';
import { CustomerManagement } from './components/CustomerManagement';
import { Billing } from './components/Billing';
import { ReportView } from './components/ReportView';
import { DriverManagement } from './components/DriverManagement';
import { Ledger } from './components/Ledger';
import { TractorDiesel } from './components/TractorDiesel';
import { Logo } from './components/Logo';
import { db } from './db';

type Tab = 'dashboard' | 'customers' | 'billing' | 'reports' | 'drivers' | 'ledger' | 'tractors';

import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { formatCurrency } from './constants';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'customers': return <CustomerManagement />;
      case 'billing': return <Billing onBillCreated={() => setActiveTab('dashboard')} />;
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
      <header className="md:hidden bg-white border-b border-slate-100 p-4 flex items-center justify-center sticky top-0 z-[40]">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-display font-bold text-lg uppercase tracking-tight text-blue-900">Rajhans</span>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-slate-200 flex-col p-6 sticky top-0 h-screen z-50">
        <div className="flex items-center gap-3 mb-10">
          <Logo size={48} />
          <span className="font-display font-bold text-xl uppercase tracking-tight text-blue-900">Rajhans</span>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <SidebarButton 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarButton 
            icon={<Users size={20} />} 
            label="Customers" 
            active={activeTab === 'customers'} 
            onClick={() => setActiveTab('customers')} 
          />
          <SidebarButton 
            icon={<FileText size={20} />} 
            label="Billing" 
            active={activeTab === 'billing'} 
            onClick={() => setActiveTab('billing')} 
          />
          <SidebarButton 
            icon={<Truck size={20} />} 
            label="Drivers" 
            active={activeTab === 'drivers'} 
            onClick={() => setActiveTab('drivers')} 
          />
          <SidebarButton 
            icon={<LineChart size={20} />} 
            label="Reports" 
            active={activeTab === 'reports'} 
            onClick={() => setActiveTab('reports')} 
          />
          <SidebarButton 
            icon={<ClipboardList size={20} />} 
            label="Ledger" 
            active={activeTab === 'ledger'} 
            onClick={() => setActiveTab('ledger')} 
          />
          <SidebarButton 
            icon={<Fuel size={20} />} 
            label="Maintenance & Diesel" 
            active={activeTab === 'tractors'} 
            onClick={() => setActiveTab('tractors')} 
          />
        </nav>

        <button 
          onClick={() => setActiveTab('billing')}
          className="mt-auto material-btn material-btn-primary w-full"
        >
          <Plus size={20} /> New Bill
        </button>
      </aside>

      <main className="flex-1 max-w-5xl mx-auto w-full md:p-8 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
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
            className="fixed bottom-24 right-6 w-16 h-16 bg-orange-500 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-orange-200 z-50 active:scale-90 transition-transform"
          >
            <Plus size={32} strokeWidth={3} />
          </motion.button>
        )}
      </div>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 h-20 flex items-center justify-around px-4 z-[40]">
        <NavButton 
          icon={<LayoutDashboard size={24} />} 
          label="Home" 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')} 
        />
        <NavButton 
          icon={<Users size={24} />} 
          label="Customers" 
          active={activeTab === 'customers'} 
          onClick={() => setActiveTab('customers')} 
        />
        <div className="w-16" /> {/* Space for FAB */}
        <NavButton 
          icon={<FileText size={24} />} 
          label="Billing" 
          active={activeTab === 'billing'} 
          onClick={() => setActiveTab('billing')} 
        />
        <NavButton 
          icon={<Truck size={24} />} 
          label="Drivers" 
          active={activeTab === 'drivers'} 
          onClick={() => setActiveTab('drivers')} 
        />
        <NavButton 
          icon={<LineChart size={24} />} 
          label="Reports" 
          active={activeTab === 'reports'} 
          onClick={() => setActiveTab('reports')} 
        />
        <NavButton 
          icon={<ClipboardList size={24} />} 
          label="Ledger" 
          active={activeTab === 'ledger'} 
          onClick={() => setActiveTab('ledger')} 
        />
        <NavButton 
          icon={<Fuel size={24} />} 
          label="Maint. & Diesel" 
          active={activeTab === 'tractors'} 
          onClick={() => setActiveTab('tractors')} 
        />
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
          ? 'bg-blue-50 text-blue-600 font-bold' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {icon}
      <span className="text-sm tracking-tight">{label}</span>
      {active && <motion.div layoutId="activeInd" className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
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

function BillingHistory() {
  const bills = useLiveQuery(() => db.bills.orderBy('date').reverse().toArray());

  return (
    <div className="flex flex-col gap-3 text-left">
      {bills?.map((bill: any) => (
        <div key={bill.id} className="p-4 bg-white rounded-2xl border border-slate-50 shadow-sm">
          <div className="flex justify-between mb-2">
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{bill.billNumber}</span>
            <span className={`text-xs font-bold ${
              bill.status === 'Delivered' ? 'text-green-500' : bill.status === 'Cancelled' ? 'text-red-500' : 'text-orange-500'
            }`}>{bill.status}</span>
          </div>
          <div className="font-bold">{bill.customerName}</div>
          <div className="flex justify-between items-end mt-1">
            <div className="text-xs text-slate-500 italic">
              {bill.tankerSize}L • {bill.quantity} Qty
            </div>
            <div className="text-xl font-display font-bold text-slate-800">
              {formatCurrency(bill.grandTotal)}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2 border-t pt-2">
            {format(bill.date, 'PPPP p')}
          </div>
        </div>
      ))}
    </div>
  );
}
