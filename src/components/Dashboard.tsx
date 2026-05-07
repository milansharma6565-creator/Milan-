import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  IndianRupee, 
  ArrowRight,
  TrendingDown,
  Droplets,
  Users,
  AlertCircle,
  Printer,
  Smartphone,
  Banknote,
  History,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { formatCurrency, PAYMENT_MODES } from '../constants';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { useReactToPrint } from 'react-to-print';
import { ThermalInvoice } from './ThermalInvoice';
import { toJpeg } from 'html-to-image';

export function Dashboard() {
  const todayStart = startOfDay(new Date());
  
  const stats = useLiveQuery(async () => {
    const allBills = await db.bills.toArray();
    const allCustomers = await db.customers.toArray();
    const drivers = await db.drivers.toArray();
    const tractors = await db.tractors.toArray();
    
    const todayBills = allBills.filter(b => b.date >= todayStart);

    const todayCollection = todayBills
      .filter(b => b.paymentMode !== 'Pending' && b.status !== 'Cancelled')
      .reduce((sum, b) => sum + b.grandTotal, 0);
      
    const totalPending = allCustomers.reduce((sum, c) => sum + (c.pendingAmount || 0), 0);
    const deliveredCount = allBills.filter(b => b.status === 'Delivered').length;
    const unsettledCount = allBills.filter(b => !b.isSettled).length;
    
    // Chart data for last 7 days
    const chartData = Array.from({ length: 7 }).map((_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayBills = allBills.filter(b => 
        format(b.date, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd') && 
        b.status !== 'Cancelled'
      );
      return {
        name: format(date, 'EEE'),
        amount: dayBills.reduce((sum, b) => sum + b.grandTotal, 0)
      };
    });

    return {
      todayCollection,
      totalPending,
      deliveredCount,
      unsettledCount,
      customerCount: allCustomers.length,
      drivers,
      tractors,
      chartData,
      recentBills: allBills.slice(-10).reverse()
    };
  });


  const [editingBill, setEditingBill] = React.useState<any>(null);
  const [showPaymentSelection, setShowPaymentSelection] = React.useState(false);

  const handleStatusUpdate = async (status: 'Delivered' | 'Pending' | 'Cancelled') => {
    if (editingBill?.id) {
      if (status === 'Delivered') {
        setShowPaymentSelection(true);
        return;
      }
      await db.bills.update(editingBill.id, { status });
      // Refresh editing bill to show changes
      const updated = await db.bills.get(editingBill.id);
      setEditingBill(updated);
    }
  };

  const handleSettleOrder = async (mode: 'Cash' | 'UPI' | 'Credit') => {
    if (!editingBill?.id) return;

    const isCredit = mode === 'Credit';
    const finalPaymentMode = isCredit ? 'Pending' : mode;

    try {
      await db.transaction('rw', [db.bills, db.ledger, db.customers], async () => {
        // 1. Update Bill
        await db.bills.update(editingBill.id, { 
          status: 'Delivered', 
          paymentMode: finalPaymentMode,
          isSettled: !isCredit 
        });

        // 2. Ledger & Customer Logic
        if (isCredit) {
          // Increase customer's pending amount (Due Account)
          const customer = await db.customers.get(editingBill.customerId);
          if (customer) {
            await db.customers.update(editingBill.customerId, {
              pendingAmount: (customer.pendingAmount || 0) + editingBill.grandTotal
            });
          }
        } else {
          // Record Income in Ledger (Cash/Bank Account)
          await db.ledger.add({
            date: new Date(),
            type: 'Income',
            category: 'Customer Collection',
            partyName: editingBill.customerName,
            partyId: editingBill.customerId,
            description: `Payment for Bill #${editingBill.billNumber} via ${mode}`,
            amount: editingBill.grandTotal,
            paymentMode: mode === 'UPI' ? 'UPI' : 'Cash',
            createdAt: new Date()
          });
        }
      });

      setShowPaymentSelection(false);
      setEditingBill(null);
    } catch (err) {
      alert('Error settling bill: ' + err);
    }
  };

  const handlePaymentUpdate = async (mode: typeof PAYMENT_MODES[number]) => {
    if (editingBill?.id) {
      const oldMode = editingBill.paymentMode;
      await db.bills.update(editingBill.id, { paymentMode: mode });
      
      // If moving from Pending to Paid, record in ledger and reduce customer balance
      if (oldMode === 'Pending' && mode !== 'Pending') {
        await db.ledger.add({
          date: new Date(),
          type: 'Income',
          category: 'Customer Collection',
          partyName: editingBill.customerName,
          partyId: editingBill.customerId,
          description: `Payment for Bill #${editingBill.billNumber}`,
          amount: editingBill.grandTotal,
          paymentMode: mode === 'Split' ? 'Cash' : (mode as any),
          createdAt: new Date()
        });
        
        const customer = await db.customers.get(editingBill.customerId);
        if (customer) {
          await db.customers.update(editingBill.customerId, {
            pendingAmount: Math.max(0, (customer.pendingAmount || 0) - editingBill.grandTotal)
          });
        }
      }
      
      // If moving from Paid to Pending, we should technically revert but that gets complex
      // For now, let's just handle the primary flow of settling bills.

      // Refresh editing bill
      const updated = await db.bills.get(editingBill.id);
      setEditingBill(updated);
    }
  };

  const handleDriverUpdate = async (driver: { name: string; mobile: string }) => {
    if (editingBill?.id) {
      await db.bills.update(editingBill.id, { 
        driverName: driver.name,
        driverMobile: driver.mobile
      });
      const updated = await db.bills.get(editingBill.id);
      setEditingBill(updated);
    }
  };

  const handleTractorUpdate = async (tractorId: number) => {
    if (editingBill?.id) {
      await db.bills.update(editingBill.id, { tractorId });
      const updated = await db.bills.get(editingBill.id);
      setEditingBill(updated);
    }
  };

  const shareBillImage = async (bill: any) => {
    if (!printRef.current) return;
    
    try {
      // Capture the thermal receipt as JPEG
      const dataUrl = await toJpeg(printRef.current, { 
        quality: 0.95,
        backgroundColor: '#ffffff',
        pixelRatio: 2 // Higher quality
      });
      
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `Bill_${bill.billNumber}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      // Try Web Share API (Best for Mobile WhatsApp)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Bill #${bill.billNumber}`,
          text: `Invoice from Rajhans Transport for amount ₹${bill.grandTotal}`
        });
        return;
      }

      // Try Copy to Clipboard (Excellent for Desktop users - they can just Ctrl+V in WhatsApp)
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          const item = new ClipboardItem({ [blob.type]: blob });
          await navigator.clipboard.write([item]);
          alert('Bill image copied to clipboard! opening WhatsApp... Just press Ctrl+V to send it.');
        } else {
          // Fallback: Download
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = fileName;
          link.click();
          alert('Bill Image Downloaded. You can now share it manually on WhatsApp.');
        }
      } catch (err) {
        console.warn('Clipboard share failed, falling back to download', err);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        link.click();
      }

      // Open WhatsApp link as fallback
      sendWhatsApp(bill);
    } catch (err) {
      console.error('Error sharing image:', err);
      // Fallback to text WhatsApp
      sendWhatsApp(bill);
    }
  };

  const sendWhatsApp = (bill: any) => {
    // Robust cleaning of phone number
    const cleanPhone = (bill.customerMobile || '').replace(/\D/g, '');
    const phone = cleanPhone.startsWith('91') && cleanPhone.length > 10 
      ? cleanPhone 
      : `91${cleanPhone.slice(-10)}`;

    const message = `*Bill Status Update - Rajhans Transport* 🚛\n\n` +
      `*Bill No:* #${bill.billNumber}\n` +
      `*Customer:* ${bill.customerName}\n` +
      `*Total Amount:* ₹${bill.grandTotal}\n` +
      `*Status:* ${bill.status}\n` +
      `*Driver:* ${bill.driverName || 'Not Assigned'}\n\n` +
      `Thank you for choosing Rajhans Transport!`;
    
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };


  const printRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Bill_${editingBill?.billNumber || 'Order'}`,
  });

  if (!stats) return null;

  return (
    <div className="p-4 pb-24">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
            <Droplets size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Rajhans Water</h1>
            <p className="text-slate-500 text-sm">Dashboard Overview</p>
          </div>
        </div>
        {stats.unsettledCount > 0 && (
          <div className="bg-orange-100 text-orange-600 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5 animate-pulse">
            <AlertCircle size={14} /> {stats.unsettledCount} Open
          </div>
        )}
      </header>

      {/* Hero Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }}
          className="bg-blue-600 p-5 rounded-[2.5rem] text-white shadow-xl shadow-blue-200"
        >
          <div className="bg-blue-500/50 w-10 h-10 rounded-xl flex items-center justify-center mb-4">
            <TrendingUp size={20} />
          </div>
          <div className="text-[10px] uppercase font-bold tracking-wider opacity-70 mb-1">Today's Collection</div>
          <div className="text-2xl font-display font-bold">{formatCurrency(stats.todayCollection)}</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm"
        >
          <div className="bg-orange-100 text-orange-600 w-10 h-10 rounded-xl flex items-center justify-center mb-4">
            <Clock size={20} />
          </div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Total Pending</div>
          <div className="text-2xl font-display font-bold text-slate-800">{formatCurrency(stats.totalPending)}</div>
        </motion.div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-50 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Delivered</div>
            <div className="font-bold text-slate-800">{stats.deliveredCount} Bills</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-50 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Users size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Customers</div>
            <div className="font-bold text-slate-800">{stats.customerCount}</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="material-card mb-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-display font-bold text-lg">Weekly Analytics</h3>
          <div className="text-xs text-slate-400 font-semibold uppercase">Last 7 Days</div>
        </div>
        <div className="h-48 w-full -ml-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.chartData}>
              <defs>
                <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{fontSize: 10, fill: '#94a3b8'}}
                dy={10}
              />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: 'none', 
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '10px'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="amount" 
                stroke="#2563eb" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorAmt)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Bills */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-lg">Recent Bills</h3>
          <button className="text-blue-600 text-sm font-semibold flex items-center gap-1">
            View All <ArrowRight size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {stats.recentBills.length === 0 && (
            <div className="text-center py-8 text-slate-400 bg-white rounded-3xl border border-dashed">
              No bills generated yet
            </div>
          )}
          {stats.recentBills.map(bill => (
            <motion.button 
              key={bill.id} 
              whileTap={{ scale: 0.98 }}
              onClick={() => setEditingBill(bill)}
              className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-50 shadow-sm relative overflow-hidden text-left"
            >
              {!bill.isSettled && (
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-orange-400" />
              )}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${
                  bill.status === 'Cancelled' ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'
                }`}>
                  {bill.tankerSize[0]}
                </div>
                <div>
                  <div className="font-bold">{bill.customerName}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400 font-medium">{format(bill.date, 'dd MMM, hh:mm a')}</span>
                    {(bill.tractorId || bill.driverName) && (
                      <div className="flex items-center gap-1.5 ml-1">
                        <span className="w-1 h-1 rounded-full bg-slate-200" />
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                          {stats.tractors.find(t => t.id === bill.tractorId)?.name || 'N/A'} • {bill.driverName || 'N/A'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm">{formatCurrency(bill.grandTotal)}</div>
                <div className={`text-[10px] font-bold uppercase ${
                  bill.status === 'Delivered' ? 'text-green-500' : 
                  bill.status === 'Cancelled' ? 'text-red-500' : 
                  bill.status === 'Printed' ? 'text-slate-400 italic' : 'text-orange-500'
                }`}>
                  {bill.status === 'Printed' ? 'Ready' : bill.status}
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Payment Selection Modal */}
      <AnimatePresence>
        {showPaymentSelection && editingBill && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Record Payment</h3>
                <p className="text-slate-500 font-medium">Order: #{editingBill.billNumber}</p>
                <div className="mt-4 text-3xl font-display font-black text-slate-900">
                  {formatCurrency(editingBill.grandTotal)}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => handleSettleOrder('Cash')}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-100 hover:border-slate-900 text-left transition-all group"
                >
                  <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-all">
                    <Banknote size={24} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Cash Received</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Deposited to Cash Account</div>
                  </div>
                </button>

                <button 
                  onClick={() => handleSettleOrder('UPI')}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-100 hover:border-slate-900 text-left transition-all group"
                >
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">UPI / Bank Transfer</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Deposited to Bank Account</div>
                  </div>
                </button>

                <button 
                  onClick={() => handleSettleOrder('Credit')}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-100 hover:border-slate-900 text-left transition-all group"
                >
                  <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-all">
                    <History size={24} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Credit (Udhaar)</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Added to Customer Due Account</div>
                  </div>
                </button>
              </div>

              <button 
                onClick={() => setShowPaymentSelection(false)}
                className="w-full mt-6 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors"
              >
                Back
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingBill && !showPaymentSelection && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-end justify-center p-4">
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md rounded-t-[3rem] p-8 pb-10 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold">{editingBill.customerName}</h3>
                  <p className="text-sm text-slate-400 font-mono">{editingBill.billNumber}</p>
                </div>
                <button 
                  onClick={() => setEditingBill(null)}
                  className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center"
                >
                  <AlertCircle size={20} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Status Options */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Update Delivery Status</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => handleStatusUpdate('Delivered')}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${editingBill.status === 'Delivered' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-100 text-slate-500'}`}
                    >
                      <CheckCircle2 size={24} />
                      <span className="text-[10px] font-bold">Delivered</span>
                    </button>
                    <button 
                      onClick={() => handleStatusUpdate('Pending')}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${editingBill.status === 'Pending' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 text-slate-500'}`}
                    >
                      <Clock size={24} />
                      <span className="text-[10px] font-bold">Pending</span>
                    </button>
                    <button 
                      onClick={() => handleStatusUpdate('Cancelled')}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${editingBill.status === 'Cancelled' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-100 text-slate-500'}`}
                    >
                      <AlertCircle size={24} />
                      <span className="text-[10px] font-bold">Cancel</span>
                    </button>
                  </div>
                </div>

                {/* Show payment status but not editable here */}
                {editingBill.status === 'Delivered' && (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Mode</div>
                      <div className="font-bold text-slate-900">{editingBill.paymentMode}</div>
                    </div>
                    {editingBill.paymentMode === 'Pending' ? (
                      <div className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Balance Due</div>
                    ) : (
                      <div className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Paid</div>
                    )}
                  </div>
                )}

                {/* Driver Assignment */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Assign Driver</label>
                  <div className="flex flex-wrap gap-2">
                    {stats.drivers.map(d => (
                      <button 
                        key={d.id}
                        onClick={() => handleDriverUpdate(d)}
                        className={`px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${editingBill.driverName === d.name ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}
                      >
                        {d.name}
                      </button>
                    ))}
                    {stats.drivers.length === 0 && (
                      <div className="text-xs text-slate-400 italic">No drivers found. Add in settings.</div>
                    )}
                  </div>
                </div>

                {/* Tractor Assignment */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Assign Tractor</label>
                  <div className="flex flex-wrap gap-2">
                    {stats.tractors.map(t => (
                      <button 
                        key={t.id}
                        onClick={() => handleTractorUpdate(t.id!)}
                        className={`px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${editingBill.tractorId === t.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}
                      >
                        {t.name}
                      </button>
                    ))}
                    {stats.tractors.length === 0 && (
                      <div className="text-xs text-slate-400 italic">No tractors found. Add in Tractors tab.</div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                  <button 
                    onClick={() => shareBillImage(editingBill)}
                    className="w-full bg-[#25D366] text-white flex items-center justify-center gap-3 py-4 rounded-2xl font-bold shadow-lg shadow-green-100 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    <Share2 size={24} />
                    <span>Share on WhatsApp</span>
                  </button>
                  <button 
                    onClick={() => handlePrint()}
                    className="w-full material-btn bg-slate-900 text-white flex items-center justify-center gap-2 py-4 shadow-xl shadow-slate-200"
                  >
                    <Printer size={20} /> Print Bill
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Thermal Print Node */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
        <div ref={printRef}>
          {editingBill && <ThermalInvoice bill={editingBill} />}
        </div>
      </div>
    </div>
  );
}
