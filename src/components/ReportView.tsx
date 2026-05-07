import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Bill } from '../db';
import { Download, Calendar, CheckSquare, ListFilter, AlertCircle, Printer, XCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { formatCurrency } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { useReactToPrint } from 'react-to-print';
import { ThermalInvoice } from './ThermalInvoice';
import { useRef } from 'react';

export function ReportView() {
  const [selectedBillForPrint, setSelectedBillForPrint] = useState<Bill | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const [activeSubTab, setActiveSubTab] = useState<'history' | 'settlement'>('history');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  const reportData = useLiveQuery(async () => {
    const bills = await db.bills
      .where('date')
      .between(startOfDay(new Date(dateRange.start)), endOfDay(new Date(dateRange.end)))
      .toArray();

    const totalSales = bills.reduce((sum, b) => b.status !== 'Cancelled' ? sum + b.grandTotal : sum, 0);
    const collected = bills.reduce((sum, b) => {
      if (b.status === 'Cancelled') return sum;
      if (b.paymentMode === 'Split' && b.splitPayments) {
        return sum + (b.splitPayments.cash || 0) + (b.splitPayments.upi || 0) + (b.splitPayments.bank || 0);
      }
      return b.paymentMode !== 'Pending' ? sum + b.grandTotal : sum;
    }, 0);
    const pending = bills.reduce((sum, b) => {
      if (b.status === 'Cancelled') return sum;
      if (b.paymentMode === 'Split' && b.splitPayments) {
        return sum + (b.splitPayments.pending || 0);
      }
      return b.paymentMode === 'Pending' ? sum + b.grandTotal : sum;
    }, 0);
    
    const tankerCounts = bills.reduce((acc, b) => {
      if (b.status === 'Cancelled') return acc;
      acc[b.tankerSize] = (acc[b.tankerSize] || 0) + b.quantity;
      return acc;
    }, {} as Record<string, number>);

    return { bills, totalSales, collected, pending, tankerCounts };
  }, [dateRange]);

  const unsettledBills = useLiveQuery(
    () => db.bills.where('isSettled').equals(0 as any).toArray() // index is numeric boolean usually or just check false
  );

  const handleSettle = async (bill: Bill) => {
    if (bill.id && !bill.isSettled) {
      // 1. Mark as settled
      await db.bills.update(bill.id, { isSettled: true });
      
      // 2. Add to customer pending if there is any pending amount
      if (bill.status === 'Delivered') {
        let pendingToAdd = 0;
        if (bill.paymentMode === 'Pending') {
          pendingToAdd = bill.grandTotal;
        } else if (bill.paymentMode === 'Split' && bill.splitPayments) {
          pendingToAdd = bill.splitPayments.pending;
        }

        if (pendingToAdd > 0) {
          const customer = await db.customers.get(bill.customerId);
          if (customer) {
            await db.customers.update(bill.customerId, {
              pendingAmount: (customer.pendingAmount || 0) + pendingToAdd
            });
          }
        }
      }
    }
  };

  const settleAll = async () => {
    if (!unsettledBills) return;
    for (const bill of unsettledBills) {
      await handleSettle(bill);
    }
    alert('All bills posted to ledger successfully!');
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Bill_${selectedBillForPrint?.billNumber || 'Order'}`,
    onAfterPrint: () => setSelectedBillForPrint(null)
  });

  if (!reportData) return null;

  return (
    <div className="p-4 pb-24">
      {/* Reprint Modal */}
      <AnimatePresence>
        {selectedBillForPrint && (
          <div className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                <span className="font-bold text-slate-800">Re-print Bill</span>
                <button onClick={() => setSelectedBillForPrint(null)} className="bg-white p-2 rounded-full shadow-sm text-slate-400">
                  <XCircle size={20}/>
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto bg-slate-50 flex justify-center">
                <div ref={printRef}>
                  <ThermalInvoice bill={selectedBillForPrint} />
                </div>
              </div>
              <div className="p-4 bg-white border-t">
                <button 
                  onClick={() => handlePrint()} 
                  className="w-full material-btn material-btn-primary flex items-center justify-center gap-2 py-4 shadow-xl shadow-blue-100"
                >
                  <Printer size={20} /> Confirm Re-print
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Reports</h1>
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveSubTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${activeSubTab === 'history' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-500'}`}
          >
            History
          </button>
          <button 
            onClick={() => setActiveSubTab('settlement')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${activeSubTab === 'settlement' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-500'}`}
          >
            Day End
          </button>
        </div>
      </div>

      {activeSubTab === 'history' ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="material-card mb-6">
            <div className="flex items-center gap-2 mb-4 text-slate-500 font-bold text-xs uppercase">
              <Calendar size={14} /> Filter Date Range
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input 
                type="date" 
                className="material-input p-2 text-sm" 
                value={dateRange.start}
                onChange={e => setDateRange({...dateRange, start: e.target.value})}
              />
              <input 
                type="date" 
                className="material-input p-2 text-sm" 
                value={dateRange.end}
                onChange={e => setDateRange({...dateRange, end: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 mb-6">
            <div className="bg-slate-900 text-white p-6 rounded-3xl">
              <div className="text-slate-400 text-xs font-bold uppercase mb-1">Total Sales</div>
              <div className="text-3xl font-display font-bold">{formatCurrency(reportData.totalSales)}</div>
              <div className="grid grid-cols-2 gap-4 mt-4 border-t border-slate-800 pt-4">
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Collected</div>
                  <div className="text-green-400 font-bold">{formatCurrency(reportData.collected)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Pending</div>
                  <div className="text-orange-400 font-bold">{formatCurrency(reportData.pending)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="material-card mb-6">
            <h3 className="font-bold mb-4">Tanker Distribution</h3>
            <div className="space-y-3">
              {Object.entries(reportData.tankerCounts).map(([size, count]) => (
                <div key={size} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-slate-600 font-medium">{size}L Tankers</span>
                  </div>
                  <span className="font-bold">{count} Delivered</span>
                </div>
              ))}
            </div>
          </div>

          <h3 className="font-bold mb-4">Transaction History</h3>
          <div className="flex flex-col gap-3">
            {reportData.bills.slice(0, 20).map(bill => (
              <div key={bill.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-50">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setSelectedBillForPrint(bill)}
                    className="p-2.5 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                  >
                    <Printer size={18} />
                  </button>
                  <div>
                    <div className="font-bold text-sm tracking-tight text-slate-800">{bill.customerName}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{format(bill.date, 'dd MMM yyyy')} • {bill.billNumber}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-slate-900">{formatCurrency(bill.grandTotal)}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${bill.paymentMode === 'Pending' ? 'text-orange-500' : 'text-green-500'}`}>
                    {bill.paymentMode}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-orange-50 border border-orange-100 p-4 rounded-3xl mb-6 flex items-start gap-3">
            <AlertCircle className="text-orange-500 shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="font-bold text-orange-900 text-sm">Post to Ledger</h4>
              <p className="text-xs text-orange-700 leading-relaxed mt-1">
                Bills will be added to customer account balances and closed for the day after settlement.
              </p>
            </div>
          </div>

          {unsettledBills && unsettledBills.length > 0 ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold text-slate-500">{unsettledBills.length} Unsettled Bills</span>
                <button 
                  onClick={settleAll}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase shadow-lg shadow-blue-100"
                >
                  Settle All Today
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {unsettledBills.map(bill => (
                  <div key={bill.id} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-bold">{bill.customerName}</div>
                        <div className="text-[10px] text-slate-400 font-mono italic">{bill.billNumber}</div>
                      </div>
                      <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                        bill.status === 'Delivered' ? 'bg-green-100 text-green-600' : 
                        bill.status === 'Cancelled' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                      }`}>
                        {bill.status}
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-50">
                      <div className="text-sm font-bold text-slate-800">{formatCurrency(bill.grandTotal)}</div>
                      <button 
                        onClick={() => handleSettle(bill)}
                        className="text-blue-600 text-xs font-bold flex items-center gap-1"
                      >
                        Settle <CheckSquare size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                <CheckSquare size={40} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">All Settled!</h3>
              <p className="text-slate-400 text-sm max-w-[200px] mx-auto mt-1">No pending bills for today's ledger.</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

