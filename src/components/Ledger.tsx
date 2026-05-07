import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { LedgerEntry } from '../types';
import { 
  Plus, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Filter,
  Calendar,
  IndianRupee,
  Receipt,
  Truck,
  Lightbulb,
  Wrench,
  UserCircle,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../constants';
import { ConfirmationModal } from './ConfirmationModal';

const CATEGORIES = {
  Expense: [
    { id: 'Electricity', icon: Lightbulb, color: 'text-yellow-600 bg-yellow-100' },
    { id: 'Repair', icon: Wrench, color: 'text-orange-600 bg-orange-100' },
    { id: 'Maintenance', icon: Wrench, color: 'text-blue-600 bg-blue-100' },
    { id: 'Salaries', icon: UserCircle, color: 'text-purple-600 bg-purple-100' },
    { id: 'Fuel', icon: TrendingDown, color: 'text-red-600 bg-red-100' },
    { id: 'Other', icon: Receipt, color: 'text-slate-600 bg-slate-100' },
  ],
  Income: [
    { id: 'Customer Collection', icon: UserCircle, color: 'text-green-600 bg-green-100' },
    { id: 'Other', icon: TrendingUp, color: 'text-blue-600 bg-blue-100' },
  ]
};

export function Ledger() {
  const [activeTab, setActiveTab] = useState<'transactions' | 'balancesheet'>('transactions');
  const [isAdding, setIsAdding] = useState(false);
  const [filterType, setFilterType] = useState<'All' | 'Income' | 'Expense'>('All');
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const [newEntry, setNewEntry] = useState<Partial<LedgerEntry>>({
    date: new Date().toISOString().split('T')[0],
    type: 'Expense',
    category: 'Other',
    description: '',
    amount: 0,
    paymentMode: 'Cash'
  });

  useEffect(() => {
    const q = query(collection(db, 'ledger'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, 
      (snapshot) => {
        const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry));
        setTransactions(all);

        const income = all.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
        const expense = all.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
        
        const categorySummary = all.reduce((acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
          return acc;
        }, {} as Record<string, number>);

        setStats({ income, expense, balance: income - expense, categorySummary });
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'ledger')
    );
  }, []);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntry.amount || newEntry.amount <= 0) return;

    try {
      await addDoc(collection(db, 'ledger'), {
        date: newEntry.date,
        type: newEntry.type as 'Income' | 'Expense',
        category: newEntry.category!,
        description: newEntry.description || '',
        amount: Number(newEntry.amount),
        paymentMode: newEntry.paymentMode as any,
        createdAt: serverTimestamp()
      });
      setIsAdding(false);
      setNewEntry({
        date: new Date().toISOString().split('T')[0],
        type: 'Expense',
        category: 'Other',
        description: '',
        amount: 0,
        paymentMode: 'Cash'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'ledger');
    }
  };

  const filteredTransactions = transactions?.filter(t => 
    filterType === 'All' || t.type === filterType
  );

  const handleDeleteEntry = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'ledger', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ledger/${id}`);
    }
  };

  return (
    <div className="p-4 pb-24 max-w-4xl mx-auto">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex justify-between items-center text-slate-900">
          <div>
            <h1 className="text-3xl font-display font-black tracking-tight">Ledger</h1>
            <p className="text-slate-500 font-medium font-sans">Track income & expenses</p>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="w-14 h-14 bg-slate-900 text-white rounded-[1.25rem] flex items-center justify-center shadow-xl shadow-slate-200 active:scale-95 transition-all"
          >
            <Plus size={28} />
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Income</div>
            <div className="text-lg font-bold text-green-600">{formatCurrency(stats?.income || 0)}</div>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Expense</div>
            <div className="text-lg font-bold text-red-600">{formatCurrency(stats?.expense || 0)}</div>
          </div>
          <div className="bg-slate-900 p-4 rounded-3xl shadow-lg border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Balance</div>
            <div className="text-lg font-bold text-white">{formatCurrency(stats?.balance || 0)}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
        <button 
          onClick={() => setActiveTab('transactions')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'transactions' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
        >
          Transactions
        </button>
        <button 
          onClick={() => setActiveTab('balancesheet')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'balancesheet' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
        >
          Balance Sheet
        </button>
      </div>

      {activeTab === 'transactions' ? (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {(['All', 'Income', 'Expense'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-6 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border-2 ${
                  filterType === type 
                    ? 'border-slate-900 bg-slate-900 text-white' 
                    : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredTransactions?.map((t) => {
              const category = [...CATEGORIES.Expense, ...CATEGORIES.Income].find(c => c.id === t.category);
              const Icon = category?.icon || Receipt;
              
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={t.id}
                  className="bg-white p-4 rounded-[1.75rem] border border-slate-100 flex items-center justify-between group hover:shadow-lg transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${category?.color || 'bg-slate-100 text-slate-400'}`}>
                      <Icon size={22} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{t.description || t.category}</h4>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                        <span>{new Date(t.date).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{t.paymentMode}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div className={`text-lg font-display font-black ${t.type === 'Income' ? 'text-green-600' : 'text-slate-900'}`}>
                      {t.type === 'Income' ? '+' : '-'}{formatCurrency(t.amount)}
                    </div>
                    <button 
                      onClick={() => t.id && setDeleteConfirmId(t.id)}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
            
            {filteredTransactions?.length === 0 && (
              <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Receipt className="text-slate-300" />
                </div>
                <p className="text-slate-400 font-bold">No transactions found</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
               <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Expense Breakdown</h3>
               <div className="space-y-4">
                 {Object.entries((stats?.categorySummary || {}) as Record<string, number>).filter(([cat]) => CATEGORIES.Expense.some(c => c.id === cat)).map(([cat, amount]) => (
                   <div key={cat} className="space-y-2">
                     <div className="flex justify-between text-sm font-bold">
                       <span className="text-slate-600">{cat}</span>
                       <span className="text-slate-900">{formatCurrency(amount)}</span>
                     </div>
                     <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-slate-900 rounded-full" 
                         style={{ width: `${(amount / ((stats?.expense as number) || 1)) * 100}%` }}
                       />
                     </div>
                   </div>
                 ))}
               </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
               <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">Profit / Loss</h3>
               <div className="text-center">
                 <div className={`text-4xl font-display font-black mb-2 ${(stats?.balance as number) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                   {formatCurrency(Math.abs((stats?.balance as number) || 0))}
                 </div>
                 <p className="text-slate-400 font-bold text-sm">
                   {(stats?.balance as number) >= 0 ? 'Net Profit' : 'Net Loss'} for this period
                 </p>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Entry Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: "100%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%", scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 overflow-y-auto max-h-[90vh] shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-display font-bold text-slate-900">
                    Add Transaction
                  </h2>
                  <p className="text-sm text-slate-500">Record a new income or expense</p>
                </div>
                <button 
                  onClick={() => setIsAdding(false)} 
                  className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <form onSubmit={handleAddEntry} className="flex flex-col gap-6">
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                  <button 
                    type="button"
                    onClick={() => setNewEntry({...newEntry, type: 'Expense', category: 'Other'})}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${newEntry.type === 'Expense' ? 'bg-white shadow-sm text-red-600' : 'text-slate-500'}`}
                  >
                    Expense
                  </button>
                  <button 
                    type="button"
                    onClick={() => setNewEntry({...newEntry, type: 'Income', category: 'Other'})}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${newEntry.type === 'Income' ? 'bg-white shadow-sm text-green-600' : 'text-slate-500'}`}
                  >
                    Income
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Date</label>
                    <input
                      type="date"
                      className="material-input h-14 bg-slate-50"
                      value={typeof newEntry.date === 'string' ? newEntry.date : ''}
                      onChange={e => setNewEntry({...newEntry, date: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Category</label>
                    <select
                      className="material-input h-14 bg-slate-50 appearance-none"
                      value={newEntry.category}
                      onChange={e => setNewEntry({...newEntry, category: e.target.value})}
                    >
                      {CATEGORIES[newEntry.type as 'Income' | 'Expense'].map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.id}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Amount (₹)</label>
                  <input
                    required
                    type="number"
                    className="material-input h-16 text-2xl font-black bg-slate-50"
                    placeholder="0.00"
                    value={newEntry.amount || ''}
                    onChange={e => setNewEntry({...newEntry, amount: parseFloat(e.target.value)})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Description / Notes</label>
                  <input
                    className="material-input h-14 bg-slate-50"
                    placeholder="What is this for?"
                    value={newEntry.description}
                    onChange={e => setNewEntry({...newEntry, description: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Payment Mode</label>
                  <div className="flex gap-2">
                    {['Cash', 'UPI', 'Bank Transfer'].map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setNewEntry({...newEntry, paymentMode: mode as any})}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold border-2 transition-all ${newEntry.paymentMode === mode ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 text-slate-500'}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="material-btn material-btn-primary h-16 text-lg mt-2">
                  Save Transaction
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && handleDeleteEntry(deleteConfirmId)}
        title="Delete Transaction?"
        message="Are you sure you want to delete this ledger entry? This will affect your balance sheet but won't reverse related trip tokens."
      />
    </div>
  );
}
