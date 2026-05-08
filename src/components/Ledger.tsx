import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  orderBy, 
  deleteDoc, 
  doc, 
  writeBatch,
  getDocs,
  where,
  limit,
  updateDoc,
  increment,
  Timestamp
} from 'firebase/firestore';
import { Account, AccountGroup, Voucher, VoucherType, VoucherItem } from '../types';
import { 
  Plus, 
  Search, 
  BookOpen, 
  FileText, 
  LayoutGrid, 
  History, 
  ChevronRight,
  ArrowRightLeft,
  Calendar,
  IndianRupee,
  Receipt,
  Trash2,
  Filter,
  CheckCircle2,
  X,
  CreditCard,
  Banknote,
  ArrowUpRight,
  ArrowDownLeft,
  Settings2,
  ChevronDown,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../constants';
import { format } from 'date-fns';
import { ConfirmationModal } from './ConfirmationModal';

type AccountingTab = 'vouchers' | 'daybook' | 'ledgers' | 'reports' | 'accounts';

const DEFAULT_GROUPS: Partial<AccountGroup>[] = [
  { name: 'Assets', type: 'Asset' },
  { name: 'Liabilities', type: 'Liability' },
  { name: 'Income', type: 'Income' },
  { name: 'Expenses', type: 'Expense' },
  { name: 'Cash-in-hand', parentGroupId: 'Assets', type: 'Asset' },
  { name: 'Bank Accounts', parentGroupId: 'Assets', type: 'Asset' },
  { name: 'Sundry Debtors', parentGroupId: 'Assets', type: 'Asset' },
  { name: 'Sundry Creditors', parentGroupId: 'Liabilities', type: 'Liability' },
  { name: 'Indirect Expenses', parentGroupId: 'Expenses', type: 'Expense' },
  { name: 'Direct Income', parentGroupId: 'Income', type: 'Income' },
];

export function Ledger() {
  const [activeTab, setActiveTab] = useState<AccountingTab>('daybook');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);

  // Modal States
  const [isAddingVoucher, setIsAddingVoucher] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Fetch Groups
    const groupsUnsub = onSnapshot(collection(db, 'accountGroups'), 
      (snapshot) => {
        const g = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccountGroup));
        setGroups(g);
        if (g.length === 0 && !isInitializing) {
          setupInitialData();
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'accountGroups')
    );

    // 2. Fetch Accounts
    const accountsUnsub = onSnapshot(collection(db, 'accounts'), 
      (snapshot) => {
        setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account)));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'accounts')
    );

    // 3. Fetch Vouchers
    const vouchersUnsub = onSnapshot(query(collection(db, 'vouchers'), orderBy('date', 'desc'), limit(500)), 
      (snapshot) => {
        setVouchers(snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          date: doc.data().date instanceof Timestamp ? doc.data().date.toDate() : new Date(doc.data().date)
        } as Voucher)));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'vouchers')
    );

    return () => {
      groupsUnsub();
      accountsUnsub();
      vouchersUnsub();
    };
  }, []);

  const setupInitialData = async () => {
    setIsInitializing(true);
    try {
      const batch = writeBatch(db);
      
      // Create Groups
      const groupRefs: Record<string, string> = {};
      for (const gData of DEFAULT_GROUPS) {
        const ref = doc(collection(db, 'accountGroups'));
        batch.set(ref, gData);
        groupRefs[gData.name!] = ref.id;
      }

      // Default Accounts
      const defaultAccounts = [
        { name: 'Cash', group: 'Cash-in-hand', opening: 0, type: 'Dr' },
        { name: 'Bank Account', group: 'Bank Accounts', opening: 0, type: 'Dr' },
        { name: 'Fuel Expense', group: 'Indirect Expenses', opening: 0, type: 'Dr' },
        { name: 'Maintenance', group: 'Indirect Expenses', opening: 0, type: 'Dr' },
        { name: 'Salary Expense', group: 'Indirect Expenses', opening: 0, type: 'Dr' },
      ];

      for (const acc of defaultAccounts) {
        const ref = doc(collection(db, 'accounts'));
        batch.set(ref, {
          name: acc.name,
          groupId: groupRefs[acc.group],
          openingBalance: acc.opening,
          balanceType: acc.type,
          currentBalance: acc.opening,
          createdAt: serverTimestamp()
        });
      }

      await batch.commit();
    } catch (error) {
      console.error("Setup error:", error);
      handleFirestoreError(error, OperationType.WRITE, 'initial-setup');
    } finally {
      setIsInitializing(false);
    }
  };

  const getAccountBalance = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    
    // Balance calculation
    let balance = acc.openingBalance;
    vouchers.forEach(v => {
      v.items.forEach(item => {
        if (item.accountId === accountId) {
          if (item.type === acc.balanceType) {
            balance += item.amount;
          } else {
            balance -= item.amount;
          }
        }
      });
    });
    return balance;
  };

  const stats = useMemo(() => {
    const cashId = accounts.find(a => a.name === 'Cash')?.id;
    const bankId = accounts.find(a => a.name === 'Bank Account')?.id;
    
    return {
      cash: cashId ? getAccountBalance(cashId) : 0,
      bank: bankId ? getAccountBalance(bankId) : 0,
      vouchersCount: vouchers.length
    };
  }, [accounts, vouchers]);

  if (loading || isInitializing) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-bold text-slate-800">Booting Accounting Engine...</h2>
        <p className="text-slate-500 max-w-xs mt-2">Setting up ledgers and groups for a professional experience.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight">Accounting Ledger</h1>
          <p className="text-slate-500 font-medium font-sans">Double-entry bookkeeping system</p>
        </div>
        
        <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
          <AccountingTabButton active={activeTab === 'daybook'} onClick={() => setActiveTab('daybook')} icon={<BookOpen size={18} />} label="Daybook" />
          <AccountingTabButton active={activeTab === 'vouchers'} onClick={() => setActiveTab('vouchers')} icon={<LayoutGrid size={18} />} label="Vouchers" />
          <AccountingTabButton active={activeTab === 'ledgers'} onClick={() => setActiveTab('ledgers')} icon={<FileText size={18} />} label="Ledgers" />
          <AccountingTabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<History size={18} />} label="Reports" />
          <AccountingTabButton active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} icon={<Settings2 size={18} />} label="Setup" />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="min-h-[400px]">
        {activeTab === 'daybook' && <Daybook vouchers={vouchers} onAddVoucher={() => setIsAddingVoucher(true)} />}
        {activeTab === 'vouchers' && <VoucherManager vouchers={vouchers} onAdd={() => setIsAddingVoucher(true)} />}
        {activeTab === 'ledgers' && <LedgerStatements accounts={accounts} vouchers={vouchers} />}
        {activeTab === 'reports' && <FinancialReports accounts={accounts} vouchers={vouchers} groups={groups} />}
        {activeTab === 'accounts' && <AccountSetup accounts={accounts} groups={groups} onAddAccount={() => setIsAddingAccount(true)} />}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isAddingVoucher && (
          <VoucherEntryModal 
            onClose={() => setIsAddingVoucher(false)} 
            accounts={accounts} 
          />
        )}
        {isAddingAccount && (
          <AccountEntryModal 
            onClose={() => setIsAddingAccount(false)} 
            groups={groups} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountingTabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
        active 
          ? 'bg-white shadow-sm text-slate-900' 
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

// --- SUB COMPONENTS ---

/** Daybook View */
function Daybook({ vouchers, onAddVoucher }: { vouchers: Voucher[], onAddVoucher: () => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filtered = vouchers.filter(v => 
    v.narration.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.voucherNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            placeholder="Search daybook (Ctrl + F)..."
            className="w-full h-12 pl-12 pr-4 bg-slate-50 rounded-2xl text-sm font-medium border-none focus:ring-2 ring-slate-900/5 transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={onAddVoucher}
          className="h-12 px-6 bg-slate-900 text-white rounded-2xl flex items-center gap-2 text-sm font-bold shadow-lg shadow-slate-200 active:scale-95 transition-all"
        >
          <Plus size={18} />
          <span>New Voucher</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-8">Date</th>
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vch No.</th>
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Particulars</th>
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right pr-8">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(v => (
              <tr key={v.id} className="hover:bg-slate-50/80 transition-colors group">
                <td className="p-4 pl-8">
                  <p className="text-sm font-bold text-slate-700">{format(v.date, 'dd MMM yyyy')}</p>
                </td>
                <td className="p-4">
                  <p className="text-xs font-mono font-bold text-slate-400">{v.voucherNumber}</p>
                </td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                    v.type === 'Payment' ? 'bg-red-50 text-red-600' :
                    v.type === 'Receipt' ? 'bg-green-50 text-green-600' :
                    v.type === 'Contra' ? 'bg-blue-50 text-blue-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {v.type}
                  </span>
                </td>
                <td className="p-4">
                  <div className="max-w-md">
                    <p className="text-sm font-bold text-slate-900 line-clamp-1">
                      {v.items[0]?.accountName} {v.items.length > 1 && `& others`}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium truncate">{v.narration}</p>
                  </div>
                </td>
                <td className="p-4 pr-8 text-right">
                  <p className="text-sm font-display font-black text-slate-900">{formatCurrency(v.totalAmount)}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div className="p-20 text-center text-slate-300">
          <History size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-bold text-sm uppercase tracking-widest">No entries found for today</p>
        </div>
      )}
    </div>
  );
}

/** Voucher Entry Modal */
function VoucherEntryModal({ onClose, accounts }: { onClose: () => void, accounts: Account[] }) {
  const [vchType, setVchType] = useState<VoucherType>('Payment');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vchNo, setVchNo] = useState(`V-${Math.floor(1000 + Math.random() * 9000)}`);
  const [items, setItems] = useState<VoucherItem[]>([
    { accountId: '', accountName: '', amount: 0, type: 'Dr' },
    { accountId: '', accountName: '', amount: 0, type: 'Cr' }
  ]);
  const [narration, setNarration] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totals = useMemo(() => {
    return items.reduce((acc, item) => {
      if (item.type === 'Dr') acc.dr += item.amount;
      else acc.cr += item.amount;
      return acc;
    }, { dr: 0, cr: 0 });
  }, [items]);

  const isValid = totals.dr === totals.cr && totals.dr > 0 && items.every(i => i.accountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'vouchers'), {
        date: new Date(date),
        type: vchType,
        voucherNumber: vchNo,
        items,
        narration,
        totalAmount: totals.dr,
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'vouchers');
    } finally {
      setSubmitting(false);
    }
  };

  const addItem = () => {
    setItems([...items, { accountId: '', accountName: '', amount: 0, type: totals.dr > totals.cr ? 'Cr' : 'Dr' }]);
  };

  const updateItem = (index: number, updates: Partial<VoucherItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    
    // If accountId changes, set accountName automatically
    if (updates.accountId) {
      const acc = accounts.find(a => a.id === updates.accountId);
      newItems[index].accountName = acc?.name || '';
    }
    
    setItems(newItems);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <header className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${
              vchType === 'Payment' ? 'bg-red-500' :
              vchType === 'Receipt' ? 'bg-green-500' :
              vchType === 'Contra' ? 'bg-blue-500' :
              'bg-slate-900'
            }`}>
              <Receipt size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-display font-black text-slate-900">Voucher Entry</h2>
              <div className="flex gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Ref: {vchNo}</span>
                <span>•</span>
                <span>Real-time Tally Mode</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full">
            <X size={24} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 flex flex-col gap-8">
          {/* Top Bar: Type, Date, No */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Voucher Type</label>
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                {(['Payment', 'Receipt', 'Contra', 'Journal'] as VoucherType[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setVchType(type)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      vchType === type 
                        ? 'bg-white shadow-sm text-slate-900' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Date</label>
              <input 
                type="date"
                className="w-full h-12 px-4 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Ref Number</label>
              <input 
                placeholder="V-001"
                className="w-full h-12 px-4 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                value={vchNo}
                onChange={e => setVchNo(e.target.value)}
              />
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div className="col-span-1">Type</div>
              <div className="col-span-6">Account Parent / Particulars</div>
              <div className="col-span-4 text-right">Amount (₹)</div>
              <div className="col-span-1"></div>
            </div>
            
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-1">
                  <select 
                    className={`w-full h-12 px-1 rounded-2xl text-xs font-black appearance-none text-center border-none focus:ring-2 ring-slate-900/5 ${
                      item.type === 'Dr' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'
                    }`}
                    value={item.type}
                    onChange={e => updateItem(idx, { type: e.target.value as 'Dr' | 'Cr' })}
                  >
                    <option value="Dr">Dr</option>
                    <option value="Cr">Cr</option>
                  </select>
                </div>
                <div className="col-span-6">
                  <select 
                    required
                    className="w-full h-12 px-4 bg-slate-50 rounded-2xl text-sm font-bold border-none appearance-none"
                    value={item.accountId}
                    onChange={e => updateItem(idx, { accountId: e.target.value })}
                  >
                    <option value="">Select Account...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4">
                  <input 
                    required
                    type="number"
                    placeholder="0.00"
                    className="w-full h-12 px-4 bg-slate-50 rounded-2xl text-sm font-bold border-none text-right"
                    value={item.amount || ''}
                    onChange={e => updateItem(idx, { amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  <button 
                    type="button"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}

            <button 
              type="button"
              onClick={addItem}
              className="w-full py-3 border-2 border-dashed border-slate-100 rounded-2xl text-xs font-bold text-slate-400 hover:border-slate-200 hover:text-slate-500 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={14} /> Add Line Entry
            </button>
          </div>

          <div className="bg-slate-50 rounded-[2rem] p-6 space-y-4 border border-slate-100">
             <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                <div className="flex-1 w-full space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Narration</label>
                  <textarea 
                    className="w-full h-24 p-4 bg-white rounded-2xl text-sm font-medium border-none resize-none placeholder:text-slate-300"
                    placeholder="Describe this transaction..."
                    value={narration}
                    onChange={e => setNarration(e.target.value)}
                  />
                </div>
                <div className="w-full md:w-64 space-y-3">
                  <div className="flex justify-between text-sm font-bold text-slate-500">
                    <span>Total Debit</span>
                    <span className="text-indigo-600">{formatCurrency(totals.dr)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-500">
                    <span>Total Credit</span>
                    <span className="text-amber-600">{formatCurrency(totals.cr)}</span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className={`flex justify-between text-lg font-black ${totals.dr === totals.cr ? 'text-slate-900' : 'text-red-500'}`}>
                    <span>Difference</span>
                    <span>{formatCurrency(Math.abs(totals.dr - totals.cr))}</span>
                  </div>
                </div>
             </div>
          </div>

          <button 
            disabled={!isValid || submitting}
            className={`w-full h-16 rounded-2xl font-display font-black text-lg shadow-xl transition-all ${
              isValid ? 'bg-slate-900 text-white shadow-slate-200 active:scale-[0.98]' : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Posting Voucher...' : 'Save & Print Voucher'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

/** Account Entry Modal */
function AccountEntryModal({ onClose, groups }: { onClose: () => void, groups: AccountGroup[] }) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [opening, setOpening] = useState(0);
  const [type, setType] = useState<'Dr' | 'Cr'>('Dr');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !groupId) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'accounts'), {
        name,
        groupId,
        openingBalance: opening,
        balanceType: type,
        currentBalance: opening,
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
       handleFirestoreError(error, OperationType.WRITE, 'accounts');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
      >
        <div className="flex justify-between items-center mb-8">
           <div>
             <h2 className="text-2xl font-display font-black text-slate-900">Create Ledger</h2>
             <p className="text-sm text-slate-500">Add new account to your chart</p>
           </div>
           <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900"><X /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Account Name</label>
            <input 
              required
              className="w-full h-14 px-5 bg-slate-50 rounded-2xl text-base font-bold border-none"
              placeholder="e.g. Sales A/c, Petrol Expenses"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Under Group</label>
            <select 
              required
              className="w-full h-14 px-5 bg-slate-50 rounded-2xl text-base font-bold border-none appearance-none"
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
            >
              <option value="">Select Group...</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Opening Bal</label>
              <input 
                type="number"
                className="w-full h-14 px-5 bg-slate-50 rounded-2xl text-base font-bold border-none"
                value={opening || ''}
                onChange={e => setOpening(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Type</label>
              <div className="flex bg-slate-100 p-1 rounded-2xl h-14">
                <button 
                  type="button"
                  onClick={() => setType('Dr')}
                  className={`flex-1 rounded-xl text-sm font-bold transition-all ${type === 'Dr' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                >
                  Dr
                </button>
                <button 
                  type="button"
                  onClick={() => setType('Cr')}
                  className={`flex-1 rounded-xl text-sm font-bold transition-all ${type === 'Cr' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500'}`}
                >
                  Cr
                </button>
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={submitting}
            className="w-full h-16 bg-slate-900 text-white rounded-2xl font-display font-black text-lg shadow-xl shadow-slate-200 active:scale-[0.98] transition-all"
          >
            {submitting ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

/** Ledger Statements View */
function LedgerStatements({ accounts, vouchers }: { accounts: Account[], vouchers: Voucher[] }) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const statement = useMemo(() => {
    if (!selectedAccountId) return [];
    
    const acc = accounts.find(a => a.id === selectedAccountId);
    if (!acc) return [];

    const lines: any[] = [];
    
    // 1. Opening Balance
    lines.push({
      date: null,
      particulars: 'Opening Balance',
      dr: acc.balanceType === 'Dr' ? acc.openingBalance : 0,
      cr: acc.balanceType === 'Cr' ? acc.openingBalance : 0,
      vchType: 'OP',
      balance: acc.openingBalance,
      balType: acc.balanceType
    });

    // 2. Transactions
    let runningBalance = acc.balanceType === 'Dr' ? acc.openingBalance : -acc.openingBalance;
    
    const relevantVouchers = vouchers
      .filter(v => v.items.some(i => i.accountId === selectedAccountId))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    relevantVouchers.forEach(v => {
      const item = v.items.find(i => i.accountId === selectedAccountId)!;
      const otherItems = v.items.filter(i => i.accountId !== selectedAccountId);
      
      if (item.type === 'Dr') runningBalance += item.amount;
      else runningBalance -= item.amount;

      lines.push({
        date: v.date,
        particulars: otherItems.map(oi => oi.accountName).join(', ') || 'Various',
        dr: item.type === 'Dr' ? item.amount : 0,
        cr: item.type === 'Cr' ? item.amount : 0,
        vchType: v.type,
        vchNo: v.voucherNumber,
        balance: Math.abs(runningBalance),
        balType: runningBalance >= 0 ? 'Dr' : 'Cr'
      });
    });

    return lines;
  }, [selectedAccountId, accounts, vouchers]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Search Sidebar */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Select Account</label>
          <div className="space-y-1">
            {accounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id!)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  selectedAccountId === acc.id ? 'bg-slate-900 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600'
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Account Statement */}
      <div className="lg:col-span-3">
        {selectedAccountId ? (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-display font-black text-slate-900">
                  {accounts.find(a => a.id === selectedAccountId)?.name}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Statement (Historical)</p>
              </div>
              <button className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900"><Printer size={20} /></button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-8">Date</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Particulars</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Debit</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Credit</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right pr-8">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {statement.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-8 text-sm font-bold text-slate-500">
                        {row.date ? format(row.date, 'dd MMM yy') : '-'}
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-bold text-slate-800">{row.particulars}</p>
                        {row.vchNo && <p className="text-[10px] font-mono text-slate-400">{row.vchType} / {row.vchNo}</p>}
                      </td>
                      <td className="p-4 text-right text-sm font-bold text-indigo-600">
                        {row.dr > 0 ? formatCurrency(row.dr) : ''}
                      </td>
                      <td className="p-4 text-right text-sm font-bold text-amber-600">
                        {row.cr > 0 ? formatCurrency(row.cr) : ''}
                      </td>
                      <td className="p-4 pr-8 text-right font-display font-black text-slate-900">
                        {formatCurrency(row.balance)} <span className="text-[10px] font-black">{row.balType}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="h-full bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-12 text-center">
             <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm mb-4">
               <FileText size={32} />
             </div>
             <h3 className="font-bold text-slate-400 uppercase tracking-widest mb-2">Statement Viewer</h3>
             <p className="text-xs text-slate-400 max-w-xs">Select an account from the list to view its real-time transaction ledger.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Account Management View */
function AccountSetup({ accounts, groups, onAddAccount }: { accounts: Account[], groups: AccountGroup[], onAddAccount: () => void }) {
  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
         <h3 className="text-lg font-display font-bold text-slate-900">Chart of Accounts</h3>
         <button 
           onClick={onAddAccount}
           className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all text-sm"
         >
           <Plus size={18} /> New Ledger
         </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         {groups.map(g => {
           const groupAccounts = accounts.filter(a => a.groupId === g.id);
           return (
             <div key={g.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">{g.name}</h4>
                  <span className="text-[10px] font-bold text-slate-400 px-2 py-0.5 bg-slate-50 rounded-full">{g.type}</span>
                </div>
                <div className="space-y-2">
                  {groupAccounts.map(a => (
                    <div key={a.id} className="flex justify-between items-center text-sm">
                      <span className="font-bold text-slate-600">{a.name}</span>
                      <span className="text-slate-400 font-mono text-xs">{formatCurrency(a.currentBalance || 0)}</span>
                    </div>
                  ))}
                  {groupAccounts.length === 0 && <p className="text-xs text-slate-300 italic">No accounts yet</p>}
                </div>
             </div>
           );
         })}
       </div>
    </div>
  );
}

/** Reporting View */
function FinancialReports({ accounts, vouchers, groups }: { accounts: Account[], vouchers: Voucher[], groups: AccountGroup[] }) {
  const [reportType, setReportType] = useState<'trial' | 'pl' | 'bs'>('trial');
  
  const getBal = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId)!;
    let balance = acc.balanceType === 'Dr' ? acc.openingBalance : -acc.openingBalance;
    vouchers.forEach(v => {
      v.items.forEach(item => {
        if (item.accountId === accountId) {
          if (item.type === 'Dr') balance += item.amount;
          else balance -= item.amount;
        }
      });
    });
    return balance;
  };

  const trialBalance = useMemo(() => {
    return accounts.map(a => {
      const bal = getBal(a.id!);
      return {
        name: a.name,
        dr: bal >= 0 ? Math.abs(bal) : 0,
        cr: bal < 0 ? Math.abs(bal) : 0
      };
    }).filter(a => a.dr > 0 || a.cr > 0);
  }, [accounts, vouchers]);

  const plData = useMemo(() => {
    const incomeGroups = groups.filter(g => g.type === 'Income').map(g => g.id);
    const expenseGroups = groups.filter(g => g.type === 'Expense').map(g => g.id);
    
    const incomes = accounts.filter(a => incomeGroups.includes(a.groupId)).map(a => ({ name: a.name, amount: Math.abs(getBal(a.id!)) }));
    const expenses = accounts.filter(a => expenseGroups.includes(a.groupId)).map(a => ({ name: a.name, amount: Math.abs(getBal(a.id!)) }));
    
    const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    
    return { incomes, expenses, totalIncome, totalExpense, net: totalIncome - totalExpense };
  }, [accounts, vouchers, groups]);

  return (
    <div className="space-y-6">
       <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
          <button onClick={() => setReportType('trial')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${reportType === 'trial' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Trial Balance</button>
          <button onClick={() => setReportType('pl')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${reportType === 'pl' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Profit & Loss</button>
          <button onClick={() => setReportType('bs')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${reportType === 'bs' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Balance Sheet</button>
       </div>

       {reportType === 'trial' && (
         <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden p-8">
            <h3 className="text-xl font-display font-black text-slate-900 mb-6">Trial Balance</h3>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="p-4 pl-8">Account Name</th>
                  <th className="p-4 text-right">Debit (Dr)</th>
                  <th className="p-4 text-right pr-8">Credit (Cr)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {trialBalance.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="p-4 pl-8 text-sm font-bold text-slate-700">{a.name}</td>
                    <td className="p-4 text-right text-sm font-bold text-indigo-600">{a.dr > 0 ? formatCurrency(a.dr) : ''}</td>
                    <td className="p-4 text-right text-sm font-bold text-amber-600 pr-8">{a.cr > 0 ? formatCurrency(a.cr) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white">
                <tr className="font-display font-black text-lg">
                  <td className="p-4 pl-8">Grand Totals</td>
                  <td className="p-4 text-right">{formatCurrency(trialBalance.reduce((s, a) => s + a.dr, 0))}</td>
                  <td className="p-4 text-right pr-8">{formatCurrency(trialBalance.reduce((s, a) => s + a.cr, 0))}</td>
                </tr>
              </tfoot>
            </table>
         </div>
       )}

       {reportType === 'pl' && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Revenue / Income</h4>
              <div className="space-y-3">
                {plData.incomes.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-sm font-bold text-slate-700">
                    <span>{i.name}</span>
                    <span>{formatCurrency(i.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-50 flex justify-between text-lg font-display font-black text-green-600">
                <span>Total Income</span>
                <span>{formatCurrency(plData.totalIncome)}</span>
              </div>
            </div>
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Expenditure / Losses</h4>
              <div className="space-y-3">
                {plData.expenses.map((e, idx) => (
                  <div key={idx} className="flex justify-between text-sm font-bold text-slate-700">
                    <span>{e.name}</span>
                    <span>{formatCurrency(e.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-50 flex justify-between text-lg font-display font-black text-red-600">
                <span>Total Expenses</span>
                <span>{formatCurrency(plData.totalExpense)}</span>
              </div>
            </div>
            <div className="md:col-span-2 p-8 rounded-[2.5rem] bg-slate-900 flex justify-between items-center text-white">
               <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Net Accounting Result</h4>
                  <p className="font-display font-black text-3xl">{formatCurrency(Math.abs(plData.net))}</p>
               </div>
               <div className="text-right">
                  <p className={`font-black text-lg ${plData.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {plData.net >= 0 ? '+ PROFIT' : '- LOSS'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Adjusted Current Period</p>
               </div>
            </div>
         </div>
       )}

       {reportType === 'bs' && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Liabilities & Capital</h4>
              <div className="space-y-4">
                {groups.filter(g => g.type === 'Liability' || g.type === 'Equity').map(g => {
                  const grpAccs = accounts.filter(a => a.groupId === g.id);
                  const bal = grpAccs.reduce((s, a) => s + Math.abs(getBal(a.id!)), 0);
                  if (bal === 0) return null;
                  return (
                    <div key={g.id} className="space-y-1">
                      <div className="flex justify-between text-sm font-bold text-slate-900">
                        <span>{g.name}</span>
                        <span>{formatCurrency(bal)}</span>
                      </div>
                      {grpAccs.map(a => (
                        <div key={a.id} className="flex justify-between text-[10px] text-slate-400 font-bold pl-4">
                          <span>{a.name}</span>
                          <span>{formatCurrency(Math.abs(getBal(a.id!)))}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold text-green-600 pt-2 border-t border-slate-50 border-dashed">
                  <span>Profit & Loss A/c (Net Profit)</span>
                  <span>{formatCurrency(Math.max(0, plData.net))}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-900 flex justify-between text-lg font-display font-black text-slate-900">
                <span>Total Liabilities</span>
                <span>{formatCurrency(
                  groups.filter(g => g.type === 'Liability' || g.type === 'Equity')
                    .reduce((s, g) => s + accounts.filter(a => a.groupId === g.id).reduce((s2, a) => s2 + Math.abs(getBal(a.id!)), 0), 0) + 
                  Math.max(0, plData.net)
                )}</span>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Assets</h4>
              <div className="space-y-4">
                {groups.filter(g => g.type === 'Asset').map(g => {
                  const grpAccs = accounts.filter(a => a.groupId === g.id);
                  const bal = grpAccs.reduce((s, a) => s + Math.abs(getBal(a.id!)), 0);
                  if (bal === 0) return null;
                  return (
                    <div key={g.id} className="space-y-1">
                      <div className="flex justify-between text-sm font-bold text-slate-900">
                        <span>{g.name}</span>
                        <span>{formatCurrency(bal)}</span>
                      </div>
                      {grpAccs.map(a => (
                        <div key={a.id} className="flex justify-between text-[10px] text-slate-400 font-bold pl-4">
                          <span>{a.name}</span>
                          <span>{formatCurrency(Math.abs(getBal(a.id!)))}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold text-red-600 pt-2 border-t border-slate-50 border-dashed">
                  <span>Profit & Loss A/c (Net Loss)</span>
                  <span>{formatCurrency(Math.abs(Math.min(0, plData.net)))}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-900 flex justify-between text-lg font-display font-black text-slate-900">
                <span>Total Assets</span>
                <span>{formatCurrency(
                  groups.filter(g => g.type === 'Asset')
                    .reduce((s, g) => s + accounts.filter(a => a.groupId === g.id).reduce((s2, a) => s2 + Math.abs(getBal(a.id!)), 0), 0) + 
                  Math.abs(Math.min(0, plData.net))
                )}</span>
              </div>
            </div>
         </div>
       )}
    </div>
  );
}

function VoucherManager({ vouchers, onAdd }: { vouchers: Voucher[], onAdd: () => void }) {
  return (
    <div className="space-y-6">
       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <VoucherTypeCard type="Payment" amount={vouchers.filter(v => v.type === 'Payment').reduce((s, v) => s + v.totalAmount, 0)} count={vouchers.filter(v => v.type === 'Payment').length} color="bg-red-50 text-red-600 border-red-100" icon={<ArrowUpRight />} />
         <VoucherTypeCard type="Receipt" amount={vouchers.filter(v => v.type === 'Receipt').reduce((s, v) => s + v.totalAmount, 0)} count={vouchers.filter(v => v.type === 'Receipt').length} color="bg-green-50 text-green-600 border-green-100" icon={<ArrowDownLeft />} />
         <VoucherTypeCard type="Contra" amount={vouchers.filter(v => v.type === 'Contra').reduce((s, v) => s + v.totalAmount, 0)} count={vouchers.filter(v => v.type === 'Contra').length} color="bg-blue-50 text-blue-600 border-blue-100" icon={<ArrowRightLeft />} />
         <button onClick={onAdd} className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl shadow-slate-200 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all">
            <Plus size={32} />
            <span className="font-bold uppercase tracking-widest text-[10px]">Create Entry</span>
         </button>
       </div>
    </div>
  );
}

function VoucherTypeCard({ type, amount, count, color, icon }: { type: string, amount: number, count: number, color: string, icon: React.ReactNode }) {
  return (
    <div className={`p-6 rounded-[2rem] border ${color} space-y-4`}>
       <div className="flex justify-between items-center">
         <div className="p-2 bg-white/50 rounded-xl">{icon}</div>
         <span className="text-[10px] font-black uppercase tracking-widest">{count} entries</span>
       </div>
       <div>
         <h4 className="text-xs font-bold opacity-80 uppercase tracking-widest">{type}</h4>
         <p className="text-xl font-display font-black">{formatCurrency(amount)}</p>
       </div>
    </div>
  );
}
