import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
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
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { formatCurrency } from '../constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function DriverAttendance() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Fetch drivers
    const driversUnsub = onSnapshot(query(collection(db, 'drivers')), (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver)));
    });

    // Fetch attendance for current month
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    
    // We fetch broader range to handle month views
    const attendanceQuery = query(
      collection(db, 'attendance'),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end))
    );

    const attendanceUnsub = onSnapshot(attendanceQuery, (snapshot) => {
      setAttendance(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        date: (doc.data().date as Timestamp).toDate()
      } as AttendanceRecord)));
      setLoading(false);
    });

    return () => {
      driversUnsub();
      attendanceUnsub();
    };
  }, [selectedDate]);

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
        driverName: driver.name,
        date: Timestamp.fromDate(selectedDate),
        status,
        createdAt: serverTimestamp()
      });

      // --- AUTOMATED SALARY ACCRUAL ---
      if (status !== 'Absent' && driver.monthlySalary > 0) {
        const factor = status === 'Full Day' ? 1 : 0.5;
        const dailyAmt = Math.round((driver.monthlySalary / 30) * factor);

        // 1. Find or Create Salary Expense account
        const expSnap = await getDocs(query(collection(db, 'accounts'), where('name', '==', 'Salary Expense')));
        let expId = expSnap.docs[0]?.id;

        if (!expId) {
          // Find/Create Indirect Expenses group
          const groupSnap = await getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Indirect Expenses')));
          let groupId = groupSnap.docs[0]?.id;
          
          if (!groupId) {
             const liabilitiesSnap = await getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Expenses')));
             const liabilitiesId = liabilitiesSnap.docs[0]?.id;
             const newGroup = await addDoc(collection(db, 'accountGroups'), {
               name: 'Indirect Expenses',
               parentGroupId: liabilitiesId || '',
               type: 'Expense'
             });
             groupId = newGroup.id;
          }

          const newAcc = await addDoc(collection(db, 'accounts'), {
            name: 'Salary Expense',
            groupId: groupId,
            openingBalance: 0,
            balanceType: 'Dr',
            currentBalance: 0,
            createdAt: serverTimestamp()
          });
          expId = newAcc.id;
        }

        // 2. Find or Create specific Driver Account
        const driverAccSnap = await getDocs(query(collection(db, 'accounts'), where('name', '==', driver.name)));
        let driverAccId = driverAccSnap.docs[0]?.id;

        if (!driverAccId) {
           // Find/Create Current Liabilities group
           const groupSnap = await getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Current Liabilities')));
           let groupId = groupSnap.docs[0]?.id;

           if (!groupId) {
             const parentSnap = await getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Liabilities')));
             let parentId = parentSnap.docs[0]?.id;
             if (!parentId) {
               const newParent = await addDoc(collection(db, 'accountGroups'), { name: 'Liabilities', type: 'Liability' });
               parentId = newParent.id;
             }
             const newGroup = await addDoc(collection(db, 'accountGroups'), { name: 'Current Liabilities', parentGroupId: parentId, type: 'Liability' });
             groupId = newGroup.id;
           }

           const newAcc = await addDoc(collection(db, 'accounts'), {
             name: driver.name,
             groupId: groupId,
             openingBalance: 0,
             balanceType: 'Cr',
             currentBalance: 0,
             createdAt: serverTimestamp(),
             driverId: driver.id
           });
           driverAccId = newAcc.id;
        }

        if (expId && driverAccId) {
          // Unique voucher number to prevent duplicates for same day/driver
          const vchNo = `ATT-${driver.id.slice(0,4)}-${format(selectedDate, 'ddMMyy')}`;
          
          // Check if already accrued for this specific ID (prevents double entry on re-clicks)
          const existingVch = await getDocs(query(collection(db, 'vouchers'), where('voucherNumber', '==', vchNo)));
          
          if (existingVch.empty) {
            await addDoc(collection(db, 'vouchers'), {
              date: selectedDate,
              type: 'Journal',
              voucherNumber: vchNo,
              items: [
                { accountId: expId, accountName: 'Salary Expense', amount: dailyAmt, type: 'Dr' }, // Expense Inc
                { accountId: driverAccId, accountName: driver.name, amount: dailyAmt, type: 'Cr' } // Liability Inc (Driver's Balance)
              ],
              narration: `Daily Salary Accrued: ${driver.name} - ${status} (${format(selectedDate, 'dd MMM')})`,
              totalAmount: dailyAmt,
              createdAt: serverTimestamp()
            });
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
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
    const doc = new jsPDF();
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

  const postSalaryToLedger = async (driver: Driver) => {
    if (!driver.id) return;
    const stats = calculateMonthlyStats(driver.id);
    const dailyRate = driver.monthlySalary / 30;
    const salary = Math.round(stats.totalDays * dailyRate);
    
    if (salary <= 0) {
      alert("No work recorded for this driver this month.");
      return;
    }

    if (!confirm(`Post ₹${salary.toLocaleString()} as Salary Expense for ${driver.name}?`)) return;

    setSaving(true);
    try {
      // Find Salary Account
      const accSnap = await getDocs(query(collection(db, 'accounts'), where('name', '==', 'Salary Payable')));
      const payId = accSnap.docs[0]?.id;

      const cashSnap = await getDocs(query(collection(db, 'accounts'), where('name', '==', 'Cash')));
      const cashAccId = cashSnap.docs[0]?.id;

      if (!payId || !cashAccId) {
        alert("Accounting accounts (Salary Payable/Cash) not found. Check Setup.");
        return;
      }

      await addDoc(collection(db, 'vouchers'), {
        date: new Date(),
        type: 'Payment',
        voucherNumber: `SLY-${format(new Date(), 'HHmm')}`,
        items: [
          { accountId: payId, accountName: 'Salary Payable', amount: salary, type: 'Dr' },
          { accountId: cashAccId, accountName: 'Cash', amount: salary, type: 'Cr' }
        ],
        narration: `Salary payout for ${driver.name} - ${format(selectedDate, 'MMM yyyy')} (${stats.totalDays} days)`,
        totalAmount: salary,
        createdAt: serverTimestamp()
      });
      
      alert("Salary posted to ledger successfully!");
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
                        <button 
                          onClick={() => postSalaryToLedger(driver)}
                          className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          Post Ledger <ArrowRight size={10} />
                        </button>
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
