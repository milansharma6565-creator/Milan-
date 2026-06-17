import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, updateDoc, doc, where, getDoc, runTransaction, orderBy } from 'firebase/firestore';
import { Customer, Bill } from '../types';
import { Download, Calendar, CheckSquare, ListFilter, MapPin, AlertCircle, Printer, XCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { formatCurrency } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { generatePDF } from '../lib/pdfUtils';
import { printThermalReceipt } from '../lib/printUtils';
import { openWhatsAppDirect } from '../lib/whatsappUtils';
import { ThermalInvoice } from './ThermalInvoice';
import { useRef } from 'react';

export function ReportView({ franchiseId, isSuperAdmin }: { franchiseId?: string, isSuperAdmin?: boolean }) {
  const [selectedBillForPrint, setSelectedBillForPrint] = useState<Bill | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const [activeSubTab, setActiveSubTab] = useState<'history' | 'settlement'>('history');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  const [reportData, setReportData] = useState<any>(null);
  const [unsettledBills, setUnsettledBills] = useState<Bill[]>([]);

  useEffect(() => {
    let q = query(
      collection(db, 'bills'),
      where('date', '>=', dateRange.start),
      where('date', '<=', dateRange.end + 'T23:59:59')
    );

    if (!isSuperAdmin && franchiseId) {
      q = query(q, where('franchiseId', '==', franchiseId));
    }

    return onSnapshot(q, 
      (snapshot) => {
        const bills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill));
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

        setReportData({ bills, totalSales, collected, pending, tankerCounts });
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'bills-history')
    );
  }, [dateRange, franchiseId, isSuperAdmin]);

  useEffect(() => {
    let q = query(
      collection(db, 'bills'),
      where('isSettled', '==', false)
    );

    if (!isSuperAdmin && franchiseId) {
      q = query(q, where('franchiseId', '==', franchiseId));
    }

    return onSnapshot(q, 
      (snapshot) => setUnsettledBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'unsettled-bills')
    );
  }, [franchiseId, isSuperAdmin]);

  const handleSettle = async (bill: Bill) => {
    if (bill.id && !bill.isSettled) {
      try {
        await runTransaction(db, async (transaction) => {
          const billRef = doc(db, 'bills', bill.id!);
          const customerRef = doc(db, 'customers', bill.customerId);

          // 1. Calculate values for read (if needed)
          let pendingToAdd = 0;
          if (bill.status === 'Delivered') {
            if (bill.paymentMode === 'Pending') {
              pendingToAdd = bill.grandTotal;
            } else if (bill.paymentMode === 'Split' && bill.splitPayments) {
              pendingToAdd = bill.splitPayments.pending;
            }
          }

          // 2. READS FIRST
          let currentPending = 0;
          let customerExists = false;
          if (pendingToAdd > 0) {
            const custDoc = await transaction.get(customerRef);
            if (custDoc.exists()) {
              currentPending = custDoc.data().pendingAmount || 0;
              customerExists = true;
            }
          }

          // 3. WRITES LAST
          transaction.update(billRef, { isSettled: true });

          if (pendingToAdd > 0 && customerExists) {
            transaction.update(customerRef, {
              pendingAmount: currentPending + pendingToAdd
            });
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `settle/${bill.id}`);
      }
    }
  };

  const settleAll = async () => {
    if (!unsettledBills) return;
    for (const bill of unsettledBills) {
      await handleSettle(bill);
    }
    alert('All tokens posted to ledger successfully!');
  };

  const handlePrint = async () => {
    if (printRef.current) {
      const currentBill = selectedBillForPrint;
      try {
        await printThermalReceipt(printRef.current);
        setSelectedBillForPrint(null);
      } catch (err: any) {
        console.warn("Direct Printing failed, falling back to PDF:", err?.message || String(err));
        try {
          const fileName = `Token_${selectedBillForPrint?.billNumber || 'Order'}`;
          await generatePDF(printRef.current, fileName);
          setSelectedBillForPrint(null);
        } catch (pdfErr: any) {
          console.error("PDF Export Error:", pdfErr?.message || String(pdfErr));
          alert("Failed to print. Try opening the application in a new tab.");
        }
      }

      // Automatically trigger prefilled WhatsApp to the customer on print click
      if (currentBill) {
        openWhatsAppDirect(currentBill);
      }
    }
  };

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
                <span className="font-bold text-slate-800">Re-print Trip Token</span>
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
                  onClick={async () => {
                    try {
                      await handlePrint();
                    } catch (err) {
                      alert("Printing is restricted in this preview. Please open the app in a new tab to print.");
                    }
                  }} 
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
                  <span className="font-bold">{(count as number)} Delivered</span>
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
                    <div className="font-bold text-sm tracking-tight text-slate-800 flex items-center gap-2">
                      {bill.customerName}
                      <span className="text-[9px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 flex items-center gap-1">
                        <MapPin size={8} /> {bill.customerAddress || 'No Address'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                      {bill.createdAt?.toDate 
                        ? format(bill.createdAt.toDate(), 'dd MMM yyyy, hh:mm a') 
                        : format(new Date(bill.date), 'dd MMM yyyy, hh:mm a')} • {bill.billNumber}
                    </div>
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
                Trip Tokens will be added to customer account balances and closed for the day after settlement.
              </p>
            </div>
          </div>

          {unsettledBills && unsettledBills.length > 0 ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold text-slate-500">{unsettledBills.length} Unsettled Tokens</span>
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
              <p className="text-slate-400 text-sm max-w-[200px] mx-auto mt-1">No pending trip tokens for today's ledger.</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

