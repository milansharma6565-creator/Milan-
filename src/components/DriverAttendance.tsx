import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  runTransaction,
  setDoc, 
  doc, 
  getDocs, 
  where,
  addDoc,
  serverTimestamp,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { Driver, AttendanceRecord, AttendanceStatus, Voucher } from '../types';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  Download, 
  User, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  FileText,
  Save,
  ArrowRight,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { formatCurrency } from '../constants';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function DriverAttendance({ franchiseId, isSuperAdmin }: { franchiseId?: string, isSuperAdmin?: boolean }) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Driver payment modal states
  const [payoutDriver, setPayoutDriver] = useState<Driver | null>(null);
  const [payoutGrossSalary, setPayoutGrossSalary] = useState<number>(0);
  const [payoutDeducedAdvance, setPayoutDeducedAdvance] = useState<number>(0);
  const [payoutSelectedAccountId, setPayoutSelectedAccountId] = useState<string>('');
  const [payoutNarration, setPayoutNarration] = useState<string>('');

  useEffect(() => {
    const fid = franchiseId || (isSuperAdmin ? null : 'PLACEHOLDER_NONE');

    // Fetch drivers
    let qDrivers = query(collection(db, 'drivers'));
    if (fid) {
      qDrivers = query(collection(db, 'drivers'), where('franchiseId', '==', fid));
    }
    const driversUnsub = onSnapshot(qDrivers, (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'drivers'));

    // Fetch attendance for current month
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    
    // We fetch broader range to handle month views
    let attendanceQuery = query(
      collection(db, 'attendance'),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end))
    );
    if (fid) {
      attendanceQuery = query(
        collection(db, 'attendance'),
        where('franchiseId', '==', fid),
        where('date', '>=', Timestamp.fromDate(start)),
        where('date', '<=', Timestamp.fromDate(end))
      );
    }

    const attendanceUnsub = onSnapshot(attendanceQuery, (snapshot) => {
      setAttendance(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        date: (doc.data().date as Timestamp).toDate()
      } as AttendanceRecord)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'attendance'));

    // Fetch accounts
    let qAccounts = query(collection(db, 'accounts'));
    if (fid) {
      qAccounts = query(collection(db, 'accounts'), where('franchiseId', '==', fid));
    }
    const accountsUnsub = onSnapshot(qAccounts, (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'accounts'));

    return () => {
      driversUnsub();
      attendanceUnsub();
      accountsUnsub();
    };
  }, [selectedDate, franchiseId, isSuperAdmin]);

  const todayStatus = useMemo(() => {
    const records: Record<string, AttendanceStatus> = {};
    attendance.filter(a => isSameDay(a.date, selectedDate)).forEach(a => {
      records[a.driverId] = a.status;
    });
    return records;
  }, [attendance, selectedDate]);

  const handleMarkAttendance = async (driver: Driver, status: AttendanceStatus) => {
    if (!driver.id) return;
    
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const docId = `${driver.id}_${dateStr}`;
    const docRef = doc(db, 'attendance', docId);

    try {
      await setDoc(docRef, {
        driverId: driver.id,
        franchiseId: franchiseId || null,
        driverName: driver.name,
        date: Timestamp.fromDate(selectedDate),
        status,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  const postMonthlyAccrualToLedger = async (driver: Driver) => {
    if (!driver.id) return;
    const stats = calculateMonthlyStats(driver.id);
    const dailyRate = driver.monthlySalary / 30;
    const totalAccruedAmt = Math.round(stats.totalDays * dailyRate);

    if (totalAccruedAmt <= 0) {
      alert("No work recorded for this driver this month.");
      return;
    }

    if (!confirm(`Post ₹${totalAccruedAmt.toLocaleString()} as Monthly Salary Accrual (Expense & Liability) for ${driver.name}?`)) return;

    setSaving(true);
    try {
      const vchNo = `ATT-${driver.id.slice(0, 4)}-${format(selectedDate, 'yyyyMM')}`;
      const vchDate = endOfMonth(selectedDate);

      // Check for existing monthly consolidated voucher
      const existingVchSnap = await getDocs(query(collection(db, 'vouchers'), where('voucherNumber', '==', vchNo)));
      const existingVchId = existingVchSnap.docs[0]?.id;

      // Find or Create Salary Expense account
      let qExp = query(collection(db, 'accounts'), where('name', '==', 'Salary Expense'));
      if (!isSuperAdmin && franchiseId) {
        qExp = query(collection(db, 'accounts'), where('franchiseId', '==', franchiseId), where('name', '==', 'Salary Expense'));
      }
      const expSnap = await getDocs(qExp);
      let expId = expSnap.docs[0]?.id;

      if (!expId) {
        let qGrp = query(collection(db, 'accountGroups'), where('name', '==', 'Indirect Expenses'));
        if (!isSuperAdmin && franchiseId) {
          qGrp = query(collection(db, 'accountGroups'), where('franchiseId', '==', franchiseId), where('name', '==', 'Indirect Expenses'));
        }
        const groupSnap = await getDocs(qGrp);
        let groupId = groupSnap.docs[0]?.id;
        if (!groupId) {
          const newGroup = await addDoc(collection(db, 'accountGroups'), { 
            name: 'Indirect Expenses', 
            type: 'Expense',
            franchiseId: franchiseId || null 
          });
          groupId = newGroup.id;
        }
        const newAcc = await addDoc(collection(db, 'accounts'), {
          name: 'Salary Expense',
          franchiseId: franchiseId || null,
          groupId: groupId,
          openingBalance: 0,
          balanceType: 'Dr',
          currentBalance: 0,
          createdAt: serverTimestamp()
        });
        expId = newAcc.id;
      }

      // Find or Create Driver Account (Liability)
      let qDrvAcc = query(collection(db, 'accounts'), where('name', '==', driver.name));
      if (!isSuperAdmin && franchiseId) {
        qDrvAcc = query(collection(db, 'accounts'), where('franchiseId', '==', franchiseId), where('name', '==', driver.name));
      }
      const driverAccSnap = await getDocs(qDrvAcc);
      let driverAccId = driverAccSnap.docs[0]?.id;

      if (!driverAccId) {
        let qGrpLiab = query(collection(db, 'accountGroups'), where('name', '==', 'Current Liabilities'));
        if (!isSuperAdmin && franchiseId) {
          qGrpLiab = query(collection(db, 'accountGroups'), where('franchiseId', '==', franchiseId), where('name', '==', 'Current Liabilities'));
        }
        const groupSnap = await getDocs(qGrpLiab);
        let groupId = groupSnap.docs[0]?.id;
        if (!groupId) {
          const newGroup = await addDoc(collection(db, 'accountGroups'), { 
            name: 'Current Liabilities', 
            type: 'Liability',
            franchiseId: franchiseId || null 
          });
          groupId = newGroup.id;
        }
        const newAcc = await addDoc(collection(db, 'accounts'), {
          name: driver.name,
          franchiseId: franchiseId || null,
          groupId: groupId, openingBalance: 0, balanceType: 'Cr', currentBalance: 0,
          createdAt: serverTimestamp(), driverId: driver.id
        });
        driverAccId = newAcc.id;
      }

      await runTransaction(db, async (transaction) => {
        const expRef = doc(db, 'accounts', expId!);
        const drvRef = doc(db, 'accounts', driverAccId!);
        const [expDoc, drvDoc] = await Promise.all([
          transaction.get(expRef),
          transaction.get(drvRef)
        ]);

        let delta = totalAccruedAmt;
        const targetVchRef = existingVchId ? doc(db, 'vouchers', existingVchId) : doc(collection(db, 'vouchers'));
        
        if (existingVchId) {
          const vchDoc = await transaction.get(targetVchRef);
          if (vchDoc.exists()) {
            delta = totalAccruedAmt - (vchDoc.data()?.totalAmount || 0);
          }
        }

        transaction.set(targetVchRef, {
          date: vchDate,
          franchiseId: franchiseId || null,
          type: 'Journal',
          voucherNumber: vchNo,
          items: [
            { accountId: expId!, accountName: 'Salary Expense', amount: totalAccruedAmt, type: 'Dr' },
            { accountId: driverAccId!, accountName: driver.name, amount: totalAccruedAmt, type: 'Cr' }
          ],
          narration: `Consolidated Monthly Salary Accrued: ${driver.name} - ${format(selectedDate, 'MMMM yyyy')} (${stats.totalDays} days active)`,
          totalAmount: totalAccruedAmt,
          createdAt: serverTimestamp()
        });

        transaction.update(expRef, { currentBalance: (expDoc.data()?.currentBalance || 0) + delta });
        transaction.update(drvRef, { currentBalance: (drvDoc.data()?.currentBalance || 0) + delta });
      });

      alert("Monthly Accrual Journal entry posted to ledger successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    } finally {
      setSaving(false);
    }
  };

  const calculateMonthlyStats = (driverId: string) => {
    const monthlyRecords = attendance.filter(a => a.driverId === driverId);
    const fullDays = monthlyRecords.filter(a => a.status === 'Full Day').length;
    const halfDays = monthlyRecords.filter(a => a.status === 'Half Day').length;
    const totalDays = fullDays + (halfDays * 0.5);
    return { fullDays, halfDays, totalDays };
  };

  const exportPDF = () => {
    let doc: any;
    try {
      doc = new jsPDF();
    } catch (e) {
      console.error('jsPDF failed:', e instanceof Error ? e.message : String(e));
      alert('PDF generation is not supported in this browser.');
      return;
    }
    const monthYear = format(selectedDate, 'MMMM yyyy');
    
    doc.setFontSize(20);
    doc.text('Driver Attendance Report', 14, 22);
    doc.setFontSize(12);
    doc.text(`Month: ${monthYear}`, 14, 30);

    const tableData = drivers.map(driver => {
      const stats = calculateMonthlyStats(driver.id!);
      const dailyRate = driver.monthlySalary / 30;
      const salary = stats.totalDays * dailyRate;
      
      return [
        driver.name,
        stats.fullDays,
        stats.halfDays,
        stats.totalDays,
        formatCurrency(driver.monthlySalary),
        formatCurrency(salary)
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Driver Name', 'Full Days', 'Half Days', 'Total Days', 'Base Salary', 'Prorated Salary']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: '#1e293b' }
    });

    doc.save(`Attendance_${monthYear}.pdf`);
  };

  const handleOpenPayoutModal = (driver: Driver) => {
    if (!driver.id) return;
    const stats = calculateMonthlyStats(driver.id);
    const dailyRate = driver.monthlySalary / 30;
    const grossSalary = Math.round(stats.totalDays * dailyRate);

    if (grossSalary <= 0) {
      alert("No work recorded for this driver this month.");
      return;
    }

     // Find advance account for driver (using driverId or clean name lookup)
    const advAcc = accounts.find(a => 
      (a.driverId === driver.id || a.name.toLowerCase().includes(driver.name.toLowerCase())) && 
      (
        a.name.toLowerCase().includes('advance') || 
        a.name.toLowerCase().includes('udhar') || 
        a.name.toLowerCase().includes('उधार') || 
        a.group?.toLowerCase().includes('advance')
      )
    );
    const outstandingAdvance = advAcc ? (advAcc.currentBalance || 0) : 0;

    // Set states
    setPayoutDriver(driver);
    setPayoutGrossSalary(grossSalary);
    // Auto-calculate advance deduction: bounded between 0, gross salary, and outstanding advance!
    const autoDeduct = Math.min(grossSalary, outstandingAdvance);
    setPayoutDeducedAdvance(autoDeduct);
    
    // Default to Cash account or first active asset account
    const defaultAcc = accounts.find(a => a.name === 'Cash') || accounts.find(a => a.name.toLowerCase().includes('bank')) || accounts[0];
    setPayoutSelectedAccountId(defaultAcc ? defaultAcc.id : '');
    
    setPayoutNarration(`Salary payout for ${driver.name} - ${format(selectedDate, 'MMM yyyy')} (${stats.totalDays} days), Gross: ₹${grossSalary.toLocaleString()}, Adv Ded: ₹${autoDeduct.toLocaleString()}`);
  };

  const handlePostSalaryPayment = async () => {
    if (!payoutDriver || !payoutSelectedAccountId) return;
    
    setSaving(true);
    try {
      const gross = payoutGrossSalary;
      const deduction = payoutDeducedAdvance;
      const net = Math.max(0, gross - deduction);

      // 1. Find Salary Payable account
      let qPay = query(collection(db, 'accounts'), where('name', '==', 'Salary Payable'));
      if (!isSuperAdmin && franchiseId) {
        qPay = query(collection(db, 'accounts'), where('franchiseId', '==', franchiseId), where('name', '==', 'Salary Payable'));
      }
      const paySnap = await getDocs(qPay);
      let payAccId = paySnap.docs[0]?.id;

      if (!payAccId) {
        // Create Salary Payable if not found
        let qGrpLiab = query(collection(db, 'accountGroups'), where('name', '==', 'Current Liabilities'));
        if (!isSuperAdmin && franchiseId) {
          qGrpLiab = query(collection(db, 'accountGroups'), where('franchiseId', '==', franchiseId), where('name', '==', 'Current Liabilities'));
        }
        const groupSnap = await getDocs(qGrpLiab);
        let groupId = groupSnap.docs[0]?.id;
        if (!groupId) {
          const newGroup = await addDoc(collection(db, 'accountGroups'), { 
            name: 'Current Liabilities', 
            type: 'Liability',
            franchiseId: franchiseId || null 
          });
          groupId = newGroup.id;
        }
        const newAcc = await addDoc(collection(db, 'accounts'), {
          name: 'Salary Payable',
          franchiseId: franchiseId || null,
          groupId: groupId, openingBalance: 0, balanceType: 'Cr', currentBalance: 0,
          createdAt: serverTimestamp()
        });
        payAccId = newAcc.id;
      }

      // 2. Find Advance Account if deduction > 0
      let advAccId = '';
      if (deduction > 0) {
        const advAcc = accounts.find(a => 
          a.name.toLowerCase().includes(payoutDriver.name.toLowerCase()) && 
          a.name.toLowerCase().includes('advance')
        );
        if (advAcc) {
          advAccId = advAcc.id;
        }
      }

      // 3. Post double entry voucher
      await runTransaction(db, async (transaction) => {
        const payRef = doc(db, 'accounts', payAccId!);
        const cashRef = doc(db, 'accounts', payoutSelectedAccountId);
        const advRef = advAccId ? doc(db, 'accounts', advAccId) : null;

        const payDoc = await transaction.get(payRef);
        const cashDoc = await transaction.get(cashRef);
        const advDoc = advRef ? await transaction.get(advRef) : null;

        const itemsList: any[] = [
          { accountId: payAccId!, accountName: 'Salary Payable', amount: gross, type: 'Dr' }
        ];

        if (net > 0) {
          itemsList.push({ 
            accountId: payoutSelectedAccountId, 
            accountName: cashDoc.data()?.name || 'Cash', 
            amount: net, 
            type: 'Cr' 
          });
        }

        if (deduction > 0 && advRef) {
          itemsList.push({ 
            accountId: advAccId, 
            accountName: advDoc?.data()?.name || 'Driver Advance', 
            amount: deduction, 
            type: 'Cr' 
          });
        }

        const vchRef = doc(collection(db, 'vouchers'));
        transaction.set(vchRef, {
          date: new Date(),
          franchiseId: franchiseId || null,
          type: 'Payment',
          voucherNumber: `SLY-${format(new Date(), 'yyyyMMdd-HHmmss')}`,
          items: itemsList,
          narration: payoutNarration,
          totalAmount: gross,
          createdAt: serverTimestamp()
        });

        // Dr Salary Payable (decreases Credit liability ledger)
        const payBal = payDoc.data()?.currentBalance || 0;
        transaction.update(payRef, { currentBalance: payBal - gross });

        // Cr Cash/Bank (decreases Debit asset ledger)
        const cashBal = cashDoc.data()?.currentBalance || 0;
        transaction.update(cashRef, { currentBalance: cashBal - net });

        // Cr Advance (decreases Debit asset ledger)
        if (deduction > 0 && advRef && advDoc) {
          const advBal = advDoc.data()?.currentBalance || 0;
          transaction.update(advRef, { currentBalance: advBal - deduction });
        }
      });

      alert("Salary payout and advance deduction posted successfully inside dual double-entry lines!");
      setPayoutDriver(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'vouchers');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-5xl mx-auto space-y-6 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight">Driver Attendance</h1>
          <p className="text-slate-500 font-medium">Daily register & salary tracking</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
           <button 
             onClick={() => setSelectedDate(d => {
               const nd = new Date(d);
               nd.setDate(nd.getDate() - 1);
               return nd;
             })}
             className="p-2 hover:bg-slate-50 rounded-xl transition-colors"
           >
             <ChevronLeft size={20} />
           </button>
           <div className="flex flex-col items-center min-w-[140px]">
             <span className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
               {format(selectedDate, 'EEEE')}
             </span>
             <span className="text-sm font-bold text-slate-900">
               {format(selectedDate, 'dd MMM yyyy')}
             </span>
           </div>
           <button 
             onClick={() => setSelectedDate(d => {
               const nd = new Date(d);
               nd.setDate(nd.getDate() + 1);
               return nd;
             })}
             className="p-2 hover:bg-slate-50 rounded-xl transition-colors"
           >
             <ChevronRight size={20} />
           </button>
           <div className="w-px h-8 bg-slate-100 mx-2" />
           <button 
             onClick={exportPDF}
             className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
             title="Download PDF Report"
           >
             <Download size={20} />
           </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Register */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-50 flex items-center justify-between">
               <h3 className="text-lg font-display font-bold text-slate-900">Monthly Roster</h3>
               <div className="flex gap-2">
                 <span className="flex items-center gap-1 text-[10px] font-black uppercase text-green-600"><CheckCircle2 size={12} /> Present</span>
                 <span className="flex items-center gap-1 text-[10px] font-black uppercase text-amber-600"><Clock size={12} /> Half</span>
                 <span className="flex items-center gap-1 text-[10px] font-black uppercase text-red-600"><XCircle size={12} /> Absent</span>
               </div>
             </div>
             
             <div className="divide-y divide-slate-50">
               {drivers.map(driver => {
                 const status = todayStatus[driver.id!];
                 const stats = calculateMonthlyStats(driver.id!);
                 
                 return (
                   <div key={driver.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all border border-slate-100 shadow-sm">
                         <User size={24} />
                       </div>
                       <div>
                         <h4 className="font-bold text-slate-900">{driver.name}</h4>
                         <p className="text-[10px] font-mono text-slate-400">+91 {driver.mobile}</p>
                       </div>
                     </div>

                     <div className="flex items-center gap-2">
                       <AttendanceButton 
                         active={status === 'Full Day'} 
                         color="green" 
                         onClick={() => handleMarkAttendance(driver, 'Full Day')}
                         icon={<CheckCircle2 size={20} />}
                         label="Full"
                       />
                       <AttendanceButton 
                         active={status === 'Half Day'} 
                         color="amber" 
                         onClick={() => handleMarkAttendance(driver, 'Half Day')}
                         icon={<Clock size={20} />}
                         label="Half"
                       />
                       <AttendanceButton 
                         active={status === 'Absent'} 
                         color="red" 
                         onClick={() => handleMarkAttendance(driver, 'Absent')}
                         icon={<XCircle size={20} />}
                         label="Away"
                       />
                     </div>
                   </div>
                 );
               })}
             </div>
             
             {drivers.length === 0 && (
                <div className="p-20 text-center text-slate-300">
                  <User size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="font-bold uppercase tracking-widest text-xs">No Drivers Found</p>
                </div>
             )}
          </div>
        </div>

        {/* Salary Summary Sidebar */}
        <div className="space-y-6">
           <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white space-y-6 shadow-xl shadow-slate-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-display font-bold">Salary Summary</h3>
                <TrendingUp size={24} className="text-emerald-400" />
              </div>
              <div className="space-y-4">
                {drivers.map(driver => {
                  const stats = calculateMonthlyStats(driver.id!);
                  const dailyRate = driver.monthlySalary / 30;
                  const estimatedSalary = Math.round(stats.totalDays * dailyRate);
                  
                  return (
                    <div key={driver.id} className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{driver.name}</span>
                        <span className="text-lg font-display font-black">{formatCurrency(estimatedSalary)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                        <span>Work: {stats.totalDays} Days</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => postMonthlyAccrualToLedger(driver)}
                            className="bg-blue-600/10 text-blue-400 px-2 py-1 rounded-md hover:bg-blue-600/20 transition-all cursor-pointer"
                            title="Accrue Monthly Salary (Journal Entry)"
                          >
                            Accrue
                          </button>
                          <button 
                            onClick={() => handleOpenPayoutModal(driver)}
                            className="bg-emerald-600/10 text-emerald-400 px-2 py-1 rounded-md hover:bg-emerald-600/20 transition-all cursor-pointer"
                            title="Payout Net Salary (with Advance Deduction)"
                          >
                            Pay Net
                          </button>
                        </div>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(stats.totalDays / 30) * 100}%` }}
                          className="h-full bg-indigo-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
           </div>

           <div className="bg-indigo-50 rounded-[2rem] p-6 border border-indigo-100 space-y-4">
             <div className="flex items-center gap-3 text-indigo-700">
                <FileText size={20} />
                <h4 className="font-display font-bold">Smart Reminders</h4>
             </div>
             <p className="text-xs text-indigo-600 leading-relaxed font-medium">
               Attendance is updated in real-time. Monthly salary is calculated as: 
               <br />
               <code className="bg-white/50 px-1 rounded">(Full Days + 0.5 * Half) * Daily Rate</code>
             </p>
            </div>
         </div>
      </div>

      <AnimatePresence>
        {payoutDriver && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: "100%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%", scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl relative border border-slate-100 text-slate-800"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-display font-black text-slate-900">Pay Net Driver Salary</h3>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-black mt-1">Driver: {payoutDriver.name}</p>
                </div>
                <button 
                  onClick={() => setPayoutDriver(null)} 
                  className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                {/* Balance & Dues Summary */}
                <div className="bg-[#f8fafc] border border-slate-100 p-5 rounded-[2rem] space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 font-bold">Gross Salary Accrued</span>
                    <span className="font-extrabold text-slate-800">{formatCurrency(payoutGrossSalary)}</span>
                  </div>

                  {(() => {
                    const advAcc = accounts.find(a => 
                      (a.driverId === payoutDriver.id || a.name.toLowerCase().includes(payoutDriver.name.toLowerCase())) && 
                      (
                        a.name.toLowerCase().includes('advance') || 
                        a.name.toLowerCase().includes('udhar') || 
                        a.name.toLowerCase().includes('उधार') || 
                        a.group?.toLowerCase().includes('advance')
                      )
                    );
                    const outstanding = advAcc ? (advAcc.currentBalance || 0) : 0;
                    return (
                      <>
                        <div className="flex justify-between text-xs border-t border-slate-100 pt-3">
                          <span className="text-slate-500 font-bold">Outstanding Advance Balance</span>
                          <span className="font-extrabold text-amber-600">
                            {formatCurrency(outstanding)} {advAcc ? `(${advAcc.name})` : '(No Advance Account)'}
                          </span>
                        </div>

                        {outstanding > 0 && (
                          <div className="flex flex-col gap-1.5 pt-3">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                Deduct Advance Amount:
                              </label>
                              <span className="text-[10px] text-slate-400 font-bold">Max: {formatCurrency(Math.min(payoutGrossSalary, outstanding))}</span>
                            </div>
                            <input
                              type="number"
                              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                              value={payoutDeducedAdvance}
                              max={Math.min(payoutGrossSalary, outstanding)}
                              min={0}
                              onChange={(e) => {
                                const limit = Math.min(payoutGrossSalary, outstanding);
                                const val = Math.min(limit, Math.max(0, Number(e.target.value) || 0));
                                setPayoutDeducedAdvance(val);
                              }}
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div className="flex justify-between text-sm border-t border-slate-200/60 pt-3 font-extrabold text-slate-900 bg-white -mx-5 -mb-5 p-5 rounded-b-[2rem]">
                    <span className="text-emerald-700">Net Payable Amount</span>
                    <span className="text-lg font-black text-emerald-600">
                      {formatCurrency(Math.max(0, payoutGrossSalary - payoutDeducedAdvance))}
                    </span>
                  </div>
                </div>

                {/* Cash/Bank Account Selection */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">
                    Select Source Account (Cash / Bank)
                  </label>
                  <select
                     className="w-full bg-[#f8fafc] text-slate-800 font-bold border border-slate-200 rounded-xl px-3 h-12 text-xs focus:border-indigo-500 focus:outline-none transition-all cursor-pointer"
                    value={payoutSelectedAccountId}
                    onChange={(e) => setPayoutSelectedAccountId(e.target.value)}
                  >
                    <option value="">-- Choose Account --</option>
                    {accounts.filter(a => 
                      a.name === 'Cash' || 
                      a.name.toLowerCase().includes('bank') || 
                      a.name.toLowerCase().includes('baroda') ||
                      a.name.toLowerCase().includes('sbi') ||
                      a.name.toLowerCase().includes('hdfc')
                    ).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (Bal: {formatCurrency(acc.currentBalance || 0)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Narration */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">
                    Narration / Remarks
                  </label>
                  <textarea
                    className="w-full bg-[#f8fafc] text-slate-800 font-medium border border-slate-200 rounded-xl p-3 text-xs focus:border-indigo-500 focus:outline-none transition-all h-16 resize-none"
                    value={payoutNarration}
                    onChange={(e) => setPayoutNarration(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    onClick={() => setPayoutDriver(null)}
                    className="flex-1 h-12 bg-slate-100 text-slate-500 font-bold text-xs rounded-xl hover:bg-slate-200 cursor-pointer active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={saving || !payoutSelectedAccountId}
                    onClick={handlePostSalaryPayment}
                    className="flex-1 h-12 bg-emerald-600 text-white font-extrabold text-xs rounded-xl hover:bg-emerald-700 cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all uppercase tracking-widest"
                  >
                    {saving ? 'Saving...' : 'Accept & Pay'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AttendanceButton({ active, color, onClick, icon, label }: { active: boolean, color: 'green' | 'amber' | 'red', onClick: () => void, icon: React.ReactNode, label: string }) {
  const colors = {
    green: active ? 'bg-green-600 text-white shadow-green-200' : 'bg-green-50 text-green-600 hover:bg-green-100',
    amber: active ? 'bg-amber-500 text-white shadow-amber-200' : 'bg-amber-50 text-amber-600 hover:bg-amber-100',
    red: active ? 'bg-red-600 text-white shadow-red-200' : 'bg-red-50 text-red-600 hover:bg-red-100'
  };

  return (
    <button
      onClick={onClick}
      className={`relative group flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all active:scale-90 ${colors[color]} ${active ? 'shadow-lg -translate-y-1' : ''}`}
    >
      {icon}
      <span className={`text-[8px] font-black uppercase tracking-widest mt-0.5 ${active ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
        {label}
      </span>
    </button>
  );
}
