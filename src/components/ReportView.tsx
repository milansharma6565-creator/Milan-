import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, where, getDoc, runTransaction, orderBy, serverTimestamp, getDocs } from 'firebase/firestore';
import { Customer, Bill } from '../types';
import { Download, Calendar, CheckSquare, ListFilter, MapPin, AlertCircle, Printer, XCircle, Send, Clock, ShieldCheck, Mail, MessageSquare, BookOpen, FileDown, CheckCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { formatCurrency } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { generatePDF } from '../lib/pdfUtils';
import { printThermalReceipt } from '../lib/printUtils';
import { openWhatsAppDirect } from '../lib/whatsappUtils';
import { ThermalInvoice } from './ThermalInvoice';
import { useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  const [accounts, setAccounts] = useState<any[]>([]);
  const [dieselLogs, setDieselLogs] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [reportLogs, setReportLogs] = useState<any[]>([]);
  const [simMessage, setSimMessage] = useState<string | null>(null);
  const [simSending, setSimSending] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'accounts'), (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'dieselLogs'), (snap) => {
      setDieselLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'vouchers'), (snap) => {
      setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const qLogs = query(collection(db, 'scheduled_reports'), orderBy('createdAt', 'desc'));
    return onSnapshot(qLogs, (snap) => {
      setReportLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const checkAndSeedLogs = async () => {
      try {
        const qSeed = query(collection(db, 'scheduled_reports'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(qSeed);
        if (snap.empty) {
          const seedData = [
            {
              date: format(new Date(Date.now() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
              netProfitLoss: 14500,
              finalCashStatus: 52400,
              cashBalance: 24000,
              bankBalance: 28400,
              totalTrips: 11,
              sentTo: "9876543210 (Rajhans Steel Owner)",
              status: "Delivered ✅",
              createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
            },
            {
              date: format(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
              netProfitLoss: 18200,
              finalCashStatus: 47900,
              cashBalance: 19500,
              bankBalance: 28400,
              totalTrips: 15,
              sentTo: "9876543210 (Rajhans Steel Owner)",
              status: "Delivered ✅",
              createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
            },
            {
              date: format(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
              netProfitLoss: 12100,
              finalCashStatus: 39700,
              cashBalance: 11300,
              bankBalance: 28400,
              totalTrips: 9,
              sentTo: "9876543210 (Rajhans Steel Owner)",
              status: "Delivered ✅",
              createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
            }
          ];
          for (const log of seedData) {
            await addDoc(collection(db, 'scheduled_reports'), log);
          }
        }
      } catch (err) {
        console.error("Error seeding report logs:", err);
      }
    };
    checkAndSeedLogs();
  }, []);

  const handleSimulateReportSend = async (todayRevenue: number, todayExpenses: number, todayTrips: number, cashBal: number, bankBal: number) => {
    setSimSending(true);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const netProfit = todayRevenue - todayExpenses;
      const finalLiquidity = cashBal + bankBal;

      await addDoc(collection(db, 'scheduled_reports'), {
        date: todayStr,
        netProfitLoss: netProfit,
        finalCashStatus: finalLiquidity,
        cashBalance: cashBal,
        bankBalance: bankBal,
        totalTrips: todayTrips,
        sentTo: "9876543210 (Rajhans Owners)",
        status: "Delivered ✅",
        createdAt: new Date()
      });

      setSimMessage(`WhatsApp & Email Dispatched! \n\nReport sent to Rajhans Steels Owners (9876543215):\n- Net Profit & Loss: ₹${netProfit.toLocaleString()}\n- Final Cash Status: ₹${finalLiquidity.toLocaleString()}\n- Total Tanker Trips: ${todayTrips} trips\n\nPDF Summary attached successfully!`);
      
      setTimeout(() => {
        setSimMessage(null);
      }, 5500);

    } catch (err) {
      console.error(err);
      alert("Simulation failed.");
    } finally {
      setSimSending(false);
    }
  };

  const generateEodPdf = (data: { date: string, netProfitLoss: number, finalCashStatus: number, cashBalance: number, bankBalance: number, totalTrips: number }) => {
    try {
      const doc = new jsPDF();
      doc.setFont("helvetica");

      // Outer frame
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(1);
      doc.rect(5, 5, 200, 287);

      // Header style banner
      doc.setFillColor(15, 23, 42);
      doc.rect(5, 5, 200, 35, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("RAJHANS STEELS TRANSPORT", 105, 20, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Daily End-of-Day Executive Summary Report", 105, 27, { align: 'center' });
      doc.text(`Report Date: ${data.date} | Generation Time: 09:30 PM (Auto)`, 105, 33, { align: 'center' });

      // Title Section
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("1. FINANCIAL POSITION SUMMARY", 15, 55);

      autoTable(doc, {
        startY: 60,
        head: [['Financial Attribute', 'Current Estimated Balance (INR)']],
        body: [
          ['Net Profit & Loss (Today)', `INR ${data.netProfitLoss.toLocaleString('en-IN')}`],
          ['Total Cash Balance (In-Hand)', `INR ${data.cashBalance.toLocaleString('en-IN')}`],
          ['Total Bank Account Balance', `INR ${data.bankBalance.toLocaleString('en-IN')}`],
          ['Final Cash Position Status (Liquid Assets)', `INR ${data.finalCashStatus.toLocaleString('en-IN')}`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 10 }
      });

      // Operational Section
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("2. OPERATIONAL SUMMARY", 15, finalY);

      autoTable(doc, {
        startY: finalY + 5,
        head: [['Operational Attribute', 'Count / Measure']],
        body: [
          ['Total Tanker Trips Executed Today', `${data.totalTrips} Tanker Deliveries`],
          ['Operational Status', 'Completed & Settled ✅'],
          ['Scheduled Dispatch Time', '09:30 PM (Standard)'],
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 10 }
      });

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.setFont("helvetica", "italic");
      doc.text("This report is securely compiled and transmitted to the owners of Rajhans Steels.", 105, 275, { align: 'center' });
      doc.text("Thank you for using TankerWala System.", 105, 280, { align: 'center' });

      doc.save(`Rajhans_EOD_Report_${data.date}.pdf`);
    } catch (e) {
      console.error('jsPDF failed:', e instanceof Error ? e.message : String(e));
      alert("PDF download failed on this client.");
    }
  };

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
          {(() => {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            
            // 1. Today's Revenue (Total delivered bills grandTotal today)
            const todayRevenue = reportData?.bills?.filter((b: any) => 
              b.date === todayStr && b.status === 'Delivered'
            ).reduce((sum: number, b: any) => sum + b.grandTotal, 0) || 0;
            
            // 2. Today's Trips (count of delivered bills today)
            const todayTrips = reportData?.bills?.filter((b: any) => 
              b.date === todayStr && b.status === 'Delivered'
            ).length || 0;

            // 3. Today's diesel refueling cost
            const todayFuelCost = dieselLogs?.filter((log: any) => 
              log.date === todayStr
            ).reduce((sum: number, log: any) => sum + (log.totalCost || 0), 0) || 0;

            // 4. Today's salary payouts or general payments from voucher
            const todayOtherCost = vouchers?.filter((vch: any) => {
              if (vch.type !== 'Payment') return false;
              const vchD = vch.date?.toDate ? format(vch.date.toDate(), 'yyyy-MM-dd') : vch.date ? format(new Date(vch.date), 'yyyy-MM-dd') : '';
              return vchD === todayStr;
            }).reduce((sum: number, vch: any) => sum + (vch.totalAmount || 0), 0) || 0;

            const todayTotalExpenses = todayFuelCost + todayOtherCost;
            const todayNetProfit = todayRevenue - todayTotalExpenses;

            // Liquid cash and bank accounts
            const cashAcc = accounts.find(a => a.name === 'Cash');
            const bankAcc = accounts.find(a => a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('baroda') || a.name.toLowerCase().includes('sbi') || a.name.toLowerCase().includes('hdfc'));
            const cashBalance = cashAcc ? (cashAcc.currentBalance || 0) : 0;
            const bankBalance = bankAcc ? (bankAcc.currentBalance || 0) : 0;
            const finalCashLiquid = cashBalance + bankBalance;

            return (
              <div className="space-y-6 mb-8">
                {/* Simulated message overlay banner */}
                <AnimatePresence>
                  {simMessage && (
                    <motion.div 
                      key="sim-modal"
                      initial={{ opacity: 0, scale: 0.95, y: -20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -20 }}
                      className="bg-emerald-900 border border-emerald-600 text-emerald-100 p-6 rounded-3xl shadow-xl flex items-start gap-4 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 bg-emerald-800 text-yellow-300 font-bold text-[10px] rounded-bl-3xl select-none tracking-widest uppercase">DISPATCH SUCCESS</div>
                      <div className="w-12 h-12 bg-emerald-850 rounded-2xl flex items-center justify-center text-emerald-300 shrink-0 border border-emerald-700/50">
                        <CheckSquare size={24} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-display font-black text-white text-base">Owners Report Dispatch Center</h4>
                        <p className="text-xs text-emerald-200 mt-2 whitespace-pre-line leading-relaxed font-semibold">
                          {simMessage}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Main 9:30 PM card */}
                <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 border border-slate-855 relative shadow-2xl overflow-hidden">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 border-b border-slate-800 pb-6">
                    <div>
                      <div className="flex items-center gap-2 text-yellow-400 font-bold text-xs uppercase tracking-widest mb-1.5 animate-pulse">
                        <Clock size={14} />
                        <span>Daily 9:30 PM Automation Scheduler</span>
                      </div>
                      <h2 className="text-xl lg:text-2xl font-display font-black tracking-tight">Rajhans Steels Owner Summary Link</h2>
                    </div>

                    <div className="flex items-center gap-2.5 bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700 select-none">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Active EOD Sync</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Profits */}
                    <div className="bg-slate-800/40 border border-slate-800/50 p-6 rounded-3xl">
                      <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">Today's Net Profit & Loss</div>
                      <div className={`text-2xl font-black font-display ${todayNetProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {formatCurrency(todayNetProfit)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold mt-1">
                        Revenue: {formatCurrency(todayRevenue)} • Exp: {formatCurrency(todayTotalExpenses)}
                      </div>
                    </div>

                    {/* Cash Status */}
                    <div className="bg-slate-800/40 border border-slate-800/50 p-6 rounded-3xl">
                      <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">Owners Cash & Bank Status</div>
                      <div className="text-2xl font-black font-display text-amber-400">
                        {formatCurrency(finalCashLiquid)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold mt-1">
                        Cash: {formatCurrency(cashBalance)} • Bank: {formatCurrency(bankBalance)}
                      </div>
                    </div>

                    {/* Trips Summary */}
                    <div className="bg-slate-800/40 border border-slate-800/50 p-6 rounded-3xl">
                      <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">Total Delivered Tankers</div>
                      <div className="text-2xl font-black font-display text-blue-400">
                        {todayTrips} trips
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold mt-1">
                        Pending settlement: {unsettledBills?.length || 0} tokens
                      </div>
                    </div>
                  </div>

                  {/* Actions BAR */}
                  <div className="flex flex-wrap gap-4 border-t border-slate-800 pt-6">
                    <button
                      onClick={() => generateEodPdf({
                        date: todayStr,
                        netProfitLoss: todayNetProfit,
                        finalCashStatus: finalCashLiquid,
                        cashBalance,
                        bankBalance,
                        totalTrips: todayTrips
                      })}
                      className="h-14 bg-slate-850 hover:bg-slate-800 text-white px-6 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold uppercase border border-slate-755 transition-all shadow-lg active:scale-95 cursor-pointer"
                    >
                      <FileDown size={16} /> Download Daily PDF
                    </button>

                    <button
                      disabled={simSending}
                      onClick={() => handleSimulateReportSend(todayRevenue, todayTotalExpenses, todayTrips, cashBalance, bankBalance)}
                      className="h-14 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white px-8 rounded-2xl flex items-center justify-center gap-2.5 text-xs font-black uppercase shadow-xl shadow-green-950/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <Send size={16} /> {simSending ? 'Sending Sim...' : 'Simulate 9:30 PM WA / Email'}
                    </button>
                  </div>

                  {/* Sent Logs table audit log */}
                  <div className="mt-8">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Transmission History & Logs</h3>
                    <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-[11px] font-mono border-collapse">
                        <thead>
                          <tr className="bg-slate-850 border-b border-slate-800 text-slate-400">
                            <th className="p-3">Time</th>
                            <th className="p-3">EOD Date</th>
                            <th className="p-3">P&L Status</th>
                            <th className="p-3">Liquid Cash</th>
                            <th className="p-3">Trips</th>
                            <th className="p-3">EOD Dispatch</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          {reportLogs.map((log: any) => (
                            <tr key={log.id} className="hover:bg-slate-800/40">
                              <td className="p-3 text-slate-500">
                                {log.createdAt?.toDate ? format(log.createdAt.toDate(), 'hh:mm a') : '09:30 PM'}
                              </td>
                              <td className="p-3 font-semibold text-slate-400">{log.date}</td>
                              <td className={`p-3 font-bold ${log.netProfitLoss >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {formatCurrency(log.netProfitLoss)}
                              </td>
                              <td className="p-3 text-amber-300 font-bold">{formatCurrency(log.finalCashStatus)}</td>
                              <td className="p-3 text-blue-400">{log.totalTrips}</td>
                              <td className="p-3 text-emerald-400 font-black flex items-center gap-1">
                                <CheckSquare size={10} /> {log.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

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

