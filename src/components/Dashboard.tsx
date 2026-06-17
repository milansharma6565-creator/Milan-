import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, getDocs, doc, updateDoc, getDoc, runTransaction, addDoc, serverTimestamp, orderBy, limit, deleteDoc, where, setDoc, arrayUnion } from 'firebase/firestore';
import { Customer, Driver, Bill, Tractor, Account } from '../types';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  MessageSquare, 
  Trash2, 
  AlertCircle, 
  Printer, 
  Clock, 
  CheckCircle2, 
  Users, 
  Truck, 
  Banknote,
  Smartphone,
  Coins,
  History,
  Calendar,
  X,
  Share2,
  Minus,
  RefreshCw,
  Droplets,
  Droplet,
  Fuel,
  MapPin,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  BellRing,
  Star,
  FlaskConical as Flask,
  Package,
  HelpCircle,
  QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { formatCurrency, PAYMENT_MODES, generateBillNumber, getPublicAppUrl, copyToClipboard } from '../constants';
import { startOfDay, endOfDay, subDays, format, differenceInDays, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isToday, subMonths, addMonths } from 'date-fns';
import { generatePDF } from '../lib/pdfUtils';
import { printThermalReceipt } from '../lib/printUtils';
import { openWhatsAppDirect } from '../lib/whatsappUtils';
import { ThermalInvoice } from './ThermalInvoice';
import { InstallPWA } from './InstallPWA';
import { QRCodeSVG } from 'qrcode.react';
import { toJpeg } from 'html-to-image';
import { ConfirmationModal } from './ConfirmationModal';
import { X as LucideX } from 'lucide-react';
import { SandboxSimulatorHub } from './SandboxSimulatorHub';
import { ledgerAutomation } from '../services/ledgerAutomation';

function LiveChatAdminModal({ bill, onClose }: { bill: Bill, onClose: () => void }) {
   const [text, setText] = useState('');
   const [chatData, setChatData] = useState<any>(null);

   useEffect(() => {
     if (!bill.id) return;
     const unsubscribe = onSnapshot(doc(db, 'chats', bill.id), snap => {
       if (snap.exists()) {
           setChatData(snap.data());
           if (snap.data().adminDraft === '' && text !== '') {
               setText('');
           }
       }
     }, (error: any) => console.error("Admin Chat Error:", error?.message || error));
     return () => unsubscribe();
   }, [bill.id, text]);

   const handleChange = async (e: any) => {
     const val = e.target.value;
     setText(val);
     await setDoc(doc(db, 'chats', bill.id!), { 
       adminDraft: val, 
       updatedAt: serverTimestamp()
     }, { merge: true });
   }

   const handleSend = async () => {
      if(!text.trim()) return;
      await setDoc(doc(db, 'chats', bill.id!), {
        messages: arrayUnion({ text, sender: 'admin', timestamp: new Date() }),
        adminDraft: '',
        updatedAt: serverTimestamp()
      }, { merge: true });
      setText('');
   };

   return (
     <div className="fixed inset-0 bg-black/60 z-[70] flex items-end justify-center p-4">
       <motion.div 
         initial={{ y: "100%" }}
         animate={{ y: 0 }}
         exit={{ y: "100%" }}
         className="bg-white w-full max-w-md rounded-[3rem] p-6 shadow-2xl relative flex flex-col h-[70vh] mb-4"
       >
         <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 bg-slate-50 rounded-full z-10"><X size={20} /></button>
         <h2 className="text-xl font-display font-bold text-slate-900 mb-1">Customer Support</h2>
         <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-4 border-b border-slate-100 pb-4">Bill #{bill.billNumber} • {bill.customerName}</p>
         
         <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1">
           {(chatData?.messages || []).map((m: any, i: number) => (
             <div key={i} className={`flex ${m.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 rounded-2xl max-w-[85%] text-sm ${m.sender === 'admin' ? 'bg-slate-900 text-white rounded-br-sm' : 'bg-blue-50 text-blue-900 rounded-bl-sm border border-blue-100'}`}>
                  {m.text}
                </div>
             </div>
           ))}
           {chatData?.customerDraft && (
             <div className="flex justify-start">
               <div className="p-3 rounded-2xl bg-slate-50 text-slate-500 rounded-bl-sm text-sm border border-slate-100 animate-pulse">
                 <span className="font-bold text-[10px] uppercase block mb-1">Customer typing...</span>
                 {chatData.customerDraft}
               </div>
             </div>
           )}
         </div>

         <div className="pt-3 border-t border-slate-100 relative">
           <textarea 
             autoFocus
             value={text}
             onChange={handleChange}
             placeholder="Type your message to customer in real-time..."
             className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 pr-12 text-sm font-medium focus:border-slate-500 outline-none resize-none h-24"
           />
         </div>
       </motion.div>
     </div>
   );
}

import { Logo } from './Logo';

export function Dashboard({ franchiseId, isSuperAdmin, commissionPercentage, setActiveTab, currentFranchise }: { 
  franchiseId?: string, 
  isSuperAdmin?: boolean,
  commissionPercentage?: number,
  setActiveTab: (tab: any) => void,
  currentFranchise?: any
}) {
  const todayStart = startOfDay(new Date());

  const [franchiseDetail, setFranchiseDetail] = useState<any>(null);
  const [isSavingFranchise, setIsSavingFranchise] = useState(false);
  const [saveFranchiseSuccess, setSaveFranchiseSuccess] = useState(false);
  
  // Custom print config states
  const [editPrintName, setEditPrintName] = useState('');
  const [editPrintMobile, setEditPrintMobile] = useState('');
  const [editPrintAddress, setEditPrintAddress] = useState('');
  const [editUpiId, setEditUpiId] = useState('');
  
  const [hidePrintPanel, setHidePrintPanel] = useState(() => localStorage.getItem('hideDashboardPrintSettings') === 'true');

  useEffect(() => {
    const handleStorageChange = () => {
      setHidePrintPanel(localStorage.getItem('hideDashboardPrintSettings') === 'true');
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Hydrate print states when franchiseDetail updates
  useEffect(() => {
    const fid = franchiseId || currentFranchise?.id;
    if (!fid) return;
    const unsub = onSnapshot(doc(db, 'franchises', fid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setFranchiseDetail({ id: snap.id, ...data });
        setEditPrintName(data.printName || data.name || '');
        setEditPrintMobile(data.printMobile || data.operatorMobile || '');
        setEditPrintAddress(data.printAddress || 'Behind balaji dharm kanta, near puniya wines jaipur road sikar, Rajasthan 332001');
        setEditUpiId(data.upiId || 'rajha94133@barodampay');
      }
    });
    return () => unsub();
  }, [franchiseId, currentFranchise]);

  const handleSaveFranchiseSettings = async () => {
    const fid = franchiseId || currentFranchise?.id;
    if (!fid) return;
    setIsSavingFranchise(true);
    setSaveFranchiseSuccess(false);
    try {
      await updateDoc(doc(db, 'franchises', fid), {
        printName: editPrintName,
        printMobile: editPrintMobile,
        printAddress: editPrintAddress,
        upiId: editUpiId,
      });
      setSaveFranchiseSuccess(true);
      localStorage.setItem('hideDashboardPrintSettings', 'true');
      setHidePrintPanel(true);
      window.dispatchEvent(new Event('storage'));
      setTimeout(() => setSaveFranchiseSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving franchise settings:", err);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSavingFranchise(false);
    }
  };

  const handlePrintBookingPoster = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const fIdForPoster = franchiseDetail?.id || franchiseId || currentFranchise?.id || '';
    const bookingUrl = `${getPublicAppUrl().toString()}?mode=booking&f=${fIdForPoster}`;
    
    // SVG for the QR code
    const svgElement = document.getElementById('advertisement-qr-svg');
    const svgHtml = svgElement ? svgElement.outerHTML : '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Customer Booking QR - ${franchiseDetail?.printName || franchiseDetail?.name || 'TankerWala'}</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              text-align: center;
              padding: 40px;
              color: #1e293b;
              background-color: #ffffff;
            }
            .border-wrap {
              border: 15px solid #2563eb;
              border-radius: 40px;
              padding: 50px 30px;
              max-width: 600px;
              margin: 0 auto;
              box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            }
            .logo-header {
              font-size: 54px;
              font-weight: 900;
              color: #2563eb;
              margin: 0 0 10px 0;
              letter-spacing: -2px;
            }
            .power-badge {
              font-size: 14px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 4px;
              margin-bottom: 25px;
            }
            .banner-title {
              font-size: 32px;
              font-weight: 800;
              color: #0f172a;
              margin-bottom: 5px;
            }
            .banner-tagline {
              font-size: 20px;
              color: #4b5563;
              margin-bottom: 35px;
              font-weight: 500;
            }
            .qr-container {
              display: inline-block;
              padding: 25px;
              background: #ffffff;
              border-radius: 30px;
              border: 4px solid #f1f5f9;
              box-shadow: 0 20px 40px rgba(37,99,235,0.06);
              margin-bottom: 35px;
            }
            .scan-instructions {
              font-size: 18px;
              font-weight: 700;
              color: #1e293b;
              margin-bottom: 15px;
            }
            .franchise-info {
              margin-top: 40px;
              padding-top: 30px;
              border-top: 2px dashed #e2e8f0;
            }
            .franchise-name {
              font-size: 24px;
              font-weight: 700;
              color: #1e293b;
            }
            .franchise-phone {
              font-size: 22px;
              font-weight: 800;
              color: #2563eb;
              margin-top: 5px;
            }
          </style>
        </head>
        <body>
          <div class="border-wrap">
            <h1 class="logo-header">TankerWala</h1>
            <div class="power-badge">Powered by Rajhans</div>
            <div class="banner-title">Book Water Tanker Online Instantly</div>
            <div class="banner-tagline">Book Your Smart Water Supplier From Anywhere!</div>
            
            <div class="qr-container">
              ${svgHtml}
            </div>
            
            <div class="scan-instructions">Scan with your phone camera & Order immediately!</div>
            
            <div class="franchise-info">
              <div class="franchise-name">${franchiseDetail?.printName || franchiseDetail?.name || 'TankerWala'}</div>
              <div class="franchise-phone">📞 Ph: +91 ${editPrintMobile || franchiseDetail?.operatorMobile || '94133 39987'}</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
  
  const [bills, setBills] = useState<Bill[]>([]);
  const [bookingRequests, setBookingRequests] = useState<any[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [pendingDieselRequests, setPendingDieselRequests] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [cashBalance, setCashBalance] = useState(0);
  const [bankBalance, setBankBalance] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayBillsList = bills.filter(b => {
      const bDate = b.date instanceof Date ? b.date : new Date(b.date);
      return bDate >= todayStart;
    });

    const todayCollection = todayBillsList
      .filter(b => b.paymentMode !== 'Pending' && b.status !== 'Cancelled')
      .reduce((sum, b) => sum + b.grandTotal, 0);
      
    const totalPending = accounts
      .filter(acc => acc.group === 'Sundry Debtors' || acc.group === 'Duty Assignment' || customers.some(c => c.id === acc.customerId || c.name === acc.name))
      .reduce((sum, acc) => {
        // For Sundry Debtors (Customers), Dr balance is positive pending
        const bal = acc.balanceType === 'Dr' ? acc.currentBalance : -acc.currentBalance;
        // Only include if it's a customer-linked account
        const isCustomer = customers.some(c => c.id === acc.customerId || c.name === acc.name);
        return isCustomer ? sum + bal : sum;
      }, 0);

    const deliveredCount = bills.filter(b => b.status === 'Delivered').length;
    const unsettledCount = bills.filter(b => !b.isSettled).length;

    const chartData = Array.from({ length: 7 }).map((_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayBills = bills.filter(b => {
        const bDate = b.date instanceof Date ? b.date : new Date(b.date);
        return format(bDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd') && 
               b.status !== 'Cancelled';
      });
      return {
        name: format(date, 'EEE'),
        amount: dayBills.reduce((sum, b) => sum + b.grandTotal, 0)
      };
    });
    
    const driverStatsList = drivers.map(driver => {
      const driverBills = bills.filter(b => b.driverName === driver.name && b.status === 'Delivered');
      const tractorUsage: Record<string, number> = {};
      driverBills.forEach(b => {
        if (b.tractorId) {
          const tractorName = tractors.find(t => t.id === b.tractorId)?.name || 'Unknown';
          tractorUsage[tractorName] = (tractorUsage[tractorName] || 0) + 1;
        }
      });
      return {
        name: driver.name,
        mobile: driver.mobile,
        tripCount: driverBills.length,
        mostUsedTractor: Object.entries(tractorUsage).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
      };
    }).filter(d => d.tripCount > 0).sort((a, b) => b.tripCount - a.tripCount);

    const nowSecs = Math.floor(Date.now() / 1000);
    const oneDayInSecs = 24 * 60 * 60; // 24 hours

    const busyDrivers = new Set(
      bills
        .filter(b => {
          const createdAtSecs = b.createdAt?.seconds || (b.createdAt?.toDate ? b.createdAt.toDate().getTime() / 1000 : null) || (b.date ? new Date(b.date).getTime() / 1000 : null) || nowSecs;
          const ageSecs = nowSecs - createdAtSecs;
          return ['Assigned', 'Active', 'Filling', 'On the way', 'Reached'].includes(b.status || '') && ageSecs <= oneDayInSecs;
        })
        .map(b => b.driverId)
    );

    const busyTractors = new Set(
      bills
        .filter(b => {
          const createdAtSecs = b.createdAt?.seconds || (b.createdAt?.toDate ? b.createdAt.toDate().getTime() / 1000 : null) || (b.date ? new Date(b.date).getTime() / 1000 : null) || nowSecs;
          const ageSecs = nowSecs - createdAtSecs;
          return ['Assigned', 'Active', 'Filling', 'On the way', 'Reached'].includes(b.status || '') && ageSecs <= oneDayInSecs;
        })
        .map(b => b.tractorId)
    );

    let commissionTotal = 0;
    if (franchiseId && commissionPercentage) {
      commissionTotal = bills
        .filter(b => b.status === 'Delivered')
        .reduce((sum, b) => sum + (b.commissionAmount || (b.grandTotal * commissionPercentage) / 100), 0);
    }

    const allBillsSorted = [...bills].sort((a, b) => {
      // First sort by status: Pending should be on top
      if (a.status === 'Pending' && b.status !== 'Pending') return -1;
      if (a.status !== 'Pending' && b.status === 'Pending') return 1;
      
      // Then secondary sort by createdAt descending
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    // Calculate total water volume dispatched (in Liters) for bills that are completed ('Delivered')
    const getLiters = (b: any) => {
      let liters = 0;
      const cat = b.category || '';
      const sizeStr = String(b.tankerSize || b.bottleSize || '').toLowerCase();
      
      if (cat.includes('TANKER')) {
        const qty = b.quantity || 1;
        if (sizeStr.includes('small') || sizeStr.includes('2500')) liters = 2500 * qty;
        else if (sizeStr.includes('medium') || sizeStr.includes('3500')) liters = 3500 * qty;
        else if (sizeStr.includes('large') || sizeStr.includes('double') || sizeStr.includes('5000')) liters = 5000 * qty;
        else liters = 4000 * qty; // Default standard tanker is 4000 Liters
      } else if (cat.includes('CAN')) {
        liters = 20 * (b.quantity || 1);
      } else if (cat.includes('BOTTLE')) {
        const qty = b.quantity || 1;
        if (sizeStr.includes('500ml')) liters = 0.5 * qty * 12; // Assuming 12 bottle box
        else if (sizeStr.includes('2l')) liters = 2 * qty * 6; // Assuming 6 bottle box
        else liters = 1 * qty * 12; // Default 1L box is 12L
      }
      return liters;
    };

    const todayWaterLiters = todayBillsList
      .filter(b => b.status === 'Delivered')
      .reduce((sum, b) => sum + getLiters(b), 0);

    const monthStartObj = new Date();
    monthStartObj.setDate(1);
    monthStartObj.setHours(0, 0, 0, 0);

    const monthBillsList = bills.filter(b => {
      const bDate = b.date instanceof Date ? b.date : new Date(b.date);
      return bDate >= monthStartObj && b.status === 'Delivered';
    });

    const monthWaterLiters = monthBillsList.reduce((sum, b) => sum + getLiters(b), 0);

    const todayTankerTrips = todayBillsList
      .filter(b => b.status === 'Delivered' && (b.category || '').includes('TANKER'))
      .reduce((sum, b) => sum + (b.quantity || 1), 0);

    const monthTankerTrips = monthBillsList
      .filter(b => b.status === 'Delivered' && (b.category || '').includes('TANKER'))
      .reduce((sum, b) => sum + (b.quantity || 1), 0);

    return {
      todayCollection,
      totalPending,
      cashBalance,
      bankBalance,
      deliveredCount,
      unsettledCount,
      chartData,
      customerCount: customers.length,
      drivers,
      tractors,
      busyDrivers,
      busyTractors,
      driverStats: driverStatsList,
      commissionTotal,
      todayWaterLiters,
      monthWaterLiters,
      todayTankerTrips,
      monthTankerTrips,
      recentBills: allBillsSorted.slice(0, 10)
    };
  }, [bills, customers, drivers, tractors, cashBalance, bankBalance, accounts, franchiseId, commissionPercentage]);

  const [tokenFilter, setTokenFilter] = useState<'Today' | 'Yesterday' | 'Custom'>('Today');
  const [selectedTokenDate, setSelectedTokenDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [quickVoucher, setQuickVoucher] = useState<{
    type: 'Receipt' | 'Payment';
    paymentMethod: 'Cash' | 'Bank';
    targetAccountName?: string;
    customerId?: string;
  } | null>(null);
  const [showInsuranceAlert, setShowInsuranceAlert] = useState(false);
  const [insuranceAlerts, setInsuranceAlerts] = useState<Tractor[]>([]);

  useEffect(() => {
    if (tractors.length > 0) {
      const today = startOfDay(new Date());
      const alerts = tractors.filter(t => {
        if (!t.insuranceExpiry) return false;
        const expiryDate = new Date(t.insuranceExpiry);
        const daysToExpiry = differenceInDays(expiryDate, today);
        return daysToExpiry <= 10 && daysToExpiry >= 0;
      });
      
      if (alerts.length > 0) {
        setInsuranceAlerts(alerts);
        const lastAlertDate = sessionStorage.getItem('lastInsuranceAlertDate');
        const todayStr = today.toISOString().split('T')[0];
        if (lastAlertDate !== todayStr) {
          setShowInsuranceAlert(true);
          sessionStorage.setItem('lastInsuranceAlertDate', todayStr);
        }
      }
    }
  }, [tractors]);
  const [quickVchForm, setQuickVchForm] = useState({
    accountId: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [isSavingQuickVch, setIsSavingQuickVch] = useState(false);
  const [activeCanFilter, setActiveCanFilter] = useState<'Monthly' | 'Packaged' | 'On-Call'>('Monthly');
  const [selectedMonthlyCust, setSelectedMonthlyCust] = useState<Customer | null>(null);

  const hasCanService = (
    (franchiseDetail?.superAdminServices?.can ?? currentFranchise?.superAdminServices?.can ?? true) !== false &&
    (franchiseDetail?.servicesEnabled?.can ?? currentFranchise?.servicesEnabled?.can ?? true) !== false
  );
  const hasBottleService = (
    (franchiseDetail?.superAdminServices?.bottle ?? currentFranchise?.superAdminServices?.bottle ?? true) !== false &&
    (franchiseDetail?.servicesEnabled?.bottle ?? currentFranchise?.servicesEnabled?.bottle ?? true) !== false
  );

  useEffect(() => {
    if (!hasCanService && (activeCanFilter === 'Monthly' || activeCanFilter === 'On-Call')) {
      if (hasBottleService) {
        setActiveCanFilter('Packaged');
      }
    } else if (!hasBottleService && activeCanFilter === 'Packaged') {
      if (hasCanService) {
        setActiveCanFilter('Monthly');
      }
    }
  }, [hasCanService, hasBottleService, activeCanFilter]);
  const [smileyMood, setSmileyMood] = useState<'normal' | 'happy' | 'sad'>('normal');
  const [eatingState, setEatingState] = useState<'walking' | 'sitting' | 'eating' | 'idle'>('idle');
  const [removedDigits, setRemovedDigits] = useState<number[]>([]);

  useEffect(() => {
    if (!stats?.totalPending) return;

    const startAnimation = () => {
      setEatingState('walking');
      setRemovedDigits([]);
      
      const amountStr = Math.floor(stats.totalPending).toString();
      let digitIndex = amountStr.length - 1;

      setTimeout(() => {
        setEatingState('sitting');
        
        const performEating = () => {
          if (digitIndex < 0) {
            setEatingState('idle');
            setTimeout(startAnimation, 12000); // Wait longer before restarting
            return;
          }

          setEatingState('eating');
          
          setTimeout(() => {
            setRemovedDigits(prev => [...prev, digitIndex]);
            digitIndex--;
            setEatingState('sitting'); 
            setTimeout(performEating, 2500); // Slower eating for "relaxed" feel
          }, 1500);
        };

        setTimeout(performEating, 1500);
      }, 3500);
    };

    const initialDelay = setTimeout(startAnimation, 2000);
    return () => clearTimeout(initialDelay);
  }, [stats?.totalPending]);

  const triggerSmiley = (mood: 'happy' | 'sad') => {
    setSmileyMood(mood);
    setTimeout(() => setSmileyMood('normal'), 1200);
  };

  useEffect(() => {
    const sixtyDaysAgo = subDays(new Date(), 60);
    
    // Base Queries
    let billsQ = query(collection(db, 'bills'), where('createdAt', '>=', sixtyDaysAgo), orderBy('createdAt', 'desc'), limit(1000));
    let requestsQ = query(collection(db, 'bookingRequests'), where('status', '==', 'Pending'));
    let dieselQ = query(collection(db, 'dieselRequests'), where('status', '==', 'Pending'));
    let feedbacksQ = query(collection(db, 'feedbacks'));
    let customersQ = query(collection(db, 'customers'));
    let driversQ = query(collection(db, 'drivers'));
    let tractorsQ = query(collection(db, 'tractors'));
    let accountsQ = query(collection(db, 'accounts'));

    // Apply Franchise Filter if present
    const fid = franchiseId || (isSuperAdmin ? null : 'PLACEHOLDER_NONE');
    if (fid) {
      billsQ = query(collection(db, 'bills'), where('franchiseId', '==', fid), where('createdAt', '>=', sixtyDaysAgo), orderBy('createdAt', 'desc'), limit(1000));
      requestsQ = query(collection(db, 'bookingRequests'), where('franchiseId', '==', fid), where('status', '==', 'Pending'));
      dieselQ = query(collection(db, 'dieselRequests'), where('franchiseId', '==', fid), where('status', '==', 'Pending'));
      feedbacksQ = query(collection(db, 'feedbacks'), where('franchiseId', '==', fid));
      customersQ = query(collection(db, 'customers'), where('franchiseId', '==', fid));
      driversQ = query(collection(db, 'drivers'), where('franchiseId', '==', fid));
      tractorsQ = query(collection(db, 'tractors'), where('franchiseId', '==', fid));
      accountsQ = query(collection(db, 'accounts'), where('franchiseId', '==', fid));
    } else if (!isSuperAdmin) {
      const none = 'PLACEHOLDER_NONE';
      billsQ = query(collection(db, 'bills'), where('franchiseId', '==', none));
      requestsQ = query(collection(db, 'bookingRequests'), where('franchiseId', '==', none));
      dieselQ = query(collection(db, 'dieselRequests'), where('franchiseId', '==', none));
      feedbacksQ = query(collection(db, 'feedbacks'), where('franchiseId', '==', none));
      customersQ = query(collection(db, 'customers'), where('franchiseId', '==', none));
      driversQ = query(collection(db, 'drivers'), where('franchiseId', '==', none));
      tractorsQ = query(collection(db, 'tractors'), where('franchiseId', '==', none));
      accountsQ = query(collection(db, 'accounts'), where('franchiseId', '==', none));
    }

    const unsubBills = onSnapshot(billsQ, 
      (snapshot) => setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'bills-dashboard')
    );
    const unsubFeedbacks = onSnapshot(feedbacksQ,
      (snapshot) => {
        const sorted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeB - timeA;
        });
        setFeedbacks(sorted.slice(0, 50));
      },
      (error) => console.log('Feedbacks err:', error?.message || error)
    );
    const unsubRequests = onSnapshot(requestsQ,
      (snapshot) => {
        const sorted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => {
          const timeA = a.requestedAt?.toMillis ? a.requestedAt.toMillis() : 0;
          const timeB = b.requestedAt?.toMillis ? b.requestedAt.toMillis() : 0;
          return timeB - timeA;
        });
        setBookingRequests(sorted);
      },
      (error) => console.log('Requests err:', error?.message || error)
    );
    const unsubDiesel = onSnapshot(dieselQ,
      (snapshot) => setPendingDieselRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => console.log('Diesel Requests err:', error?.message || error)
    );
    const unsubCustomers = onSnapshot(customersQ, 
      (snapshot) => setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'customers-dashboard')
    );
    const unsubDrivers = onSnapshot(driversQ, 
      (snapshot) => setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'drivers-dashboard')
    );
    const unsubTractors = onSnapshot(tractorsQ, 
      (snapshot) => setTractors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tractor))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'tractors-dashboard')
    );
    const unsubAccounts = onSnapshot(accountsQ, 
      (snapshot) => {
        const accs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account));
        setAccounts(accs);
        
        // Derive Cash & Bank from accounts
        const cash = accs.find(a => a.name === 'Cash');
        const bank = accs.find(a => a.name === 'Bank Account');
        if (cash) setCashBalance(cash.currentBalance || 0);
        if (bank) setBankBalance(bank.currentBalance || 0);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'accounts-dashboard')
    );

    return () => {
      unsubBills();
      unsubFeedbacks();
      unsubRequests();
      unsubDiesel();
      unsubCustomers();
      unsubDrivers();
      unsubTractors();
      unsubAccounts();
    };
  }, [franchiseId, isSuperAdmin]);

  const filteredTokenBills = useMemo(() => {
    let baseBills = [...bills];
    
    // Sort logic: Pending on top, then time descending safely with fallbacks
    baseBills.sort((a, b) => {
      if (a.status === 'Pending' && b.status !== 'Pending') return -1;
      if (a.status !== 'Pending' && b.status === 'Pending') return 1;
      
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.date ? new Date(a.date).getTime() : Date.now()));
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.date ? new Date(b.date).getTime() : Date.now()));
      return timeB - timeA;
    });

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    if (tokenFilter === 'Today') {
      return baseBills.filter(b => {
        // ALWAYS show active/assigned/pending trips even if from previous days
        if (['Pending', 'Assigned', 'Filling', 'On the way', 'Reached'].includes(b.status!)) return true;
        
        // Match today's date string
        if (b.date === todayStr) return true;

        if (b.createdAt) {
          try {
            const cDate = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt.seconds * 1000);
            if (format(cDate, 'yyyy-MM-dd') === todayStr) return true;
          } catch (e) {}
        }
        
        const bDate = b.date instanceof Date ? b.date : new Date(b.date);
        return format(bDate, 'yyyy-MM-dd') === todayStr;
      });
    } else if (tokenFilter === 'Yesterday') {
      return baseBills.filter(b => {
        if (b.date === yesterdayStr) return true;

        if (b.createdAt) {
          try {
            const cDate = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt.seconds * 1000);
            if (format(cDate, 'yyyy-MM-dd') === yesterdayStr) return true;
          } catch (e) {}
        }

        const bDate = b.date instanceof Date ? b.date : new Date(b.date);
        return format(bDate, 'yyyy-MM-dd') === yesterdayStr;
      });
    } else {
      // Custom Date
      return baseBills.filter(b => {
        if (b.date === selectedTokenDate) return true;
        
        if (b.createdAt) {
          try {
            const cDate = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt.seconds * 1000);
            if (format(cDate, 'yyyy-MM-dd') === selectedTokenDate) return true;
          } catch (e) {}
        }

        const bDate = b.date instanceof Date ? b.date : new Date(b.date);
        return format(bDate, 'yyyy-MM-dd') === selectedTokenDate;
      });
    }
  }, [bills, tokenFilter, selectedTokenDate]);

  const handleQuickVchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVchForm.accountId || !quickVchForm.amount || !quickVoucher) return;

    setIsSavingQuickVch(true);
    try {
      const amount = Number(quickVchForm.amount);
      const isPayment = quickVoucher.type === 'Payment';
      let paymentAccName = quickVoucher.paymentMethod === 'Cash' ? 'Cash' : 'Bank Account';
      
      if (quickVoucher.targetAccountName) {
        paymentAccName = quickVoucher.targetAccountName;
      }
      
      const entryDate = new Date(quickVchForm.date);
      const now = new Date();
      entryDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      const fid = franchiseId || currentFranchise?.id;
      let paymentAccQuery = query(collection(db, 'accounts'), where('name', '==', paymentAccName));
      if (fid) {
        paymentAccQuery = query(collection(db, 'accounts'), where('name', '==', paymentAccName), where('franchiseId', '==', fid));
      }
      const [paymentAccSnap, otherAccSnap] = await Promise.all([
        getDocs(paymentAccQuery),
        getDoc(doc(db, 'accounts', quickVchForm.accountId))
      ]);

      const paymentAccId = paymentAccSnap.docs[0]?.id;
      if (!paymentAccId) throw new Error("Payment account not found");
      if (!otherAccSnap.exists()) throw new Error("Selected account not found");

      const externalCustId = otherAccSnap.data()?.customerId;

      await runTransaction(db, async (transaction) => {
        const paymentAccRef = doc(db, 'accounts', paymentAccId);
        const otherAccRef = doc(db, 'accounts', quickVchForm.accountId);
        const custRef = (!isPayment && externalCustId) ? doc(db, 'customers', externalCustId) : null;
        
        const [payDoc, otherDoc, custDoc] = await Promise.all([
          transaction.get(paymentAccRef),
          transaction.get(otherAccRef),
          custRef ? transaction.get(custRef) : Promise.resolve(null)
        ]);

        const payBal = payDoc.data()?.currentBalance || 0;
        const otherBal = otherDoc.data()?.currentBalance || 0;
        const otherData = otherDoc.data();

        if (isPayment && payBal < amount) {
          throw new Error(`INSUFFICIENT_FUNDS:${paymentAccName}:${payBal}`);
        }

        if (isPayment) {
          transaction.update(paymentAccRef, { currentBalance: payBal - amount });
          transaction.update(otherAccRef, { 
            currentBalance: otherBal + (otherData?.balanceType === 'Dr' ? amount : -amount) 
          });
        } else {
          transaction.update(paymentAccRef, { currentBalance: payBal + amount });
          transaction.update(otherAccRef, { 
            currentBalance: otherBal + (otherData?.balanceType === 'Cr' ? amount : -amount) 
          });
          
          if (otherData?.customerId && custDoc?.exists()) {
            transaction.update(custRef, {
              pendingAmount: Math.max(0, (custDoc.data().pendingAmount || 0) - amount),
              updatedAt: serverTimestamp()
            });
          }
        }

        const vchRef = doc(collection(db, 'vouchers'));
        transaction.set(vchRef, {
          date: entryDate,
          type: quickVoucher.type,
          voucherNumber: `QV-${Math.floor(Date.now()/1000)}`,
          items: [
            { 
              accountId: quickVchForm.accountId, 
              accountName: otherData?.name,
              amount, 
              type: isPayment ? 'Dr' : 'Cr' 
            },
            { 
              accountId: paymentAccId, 
              accountName: paymentAccName, 
              amount, 
              type: isPayment ? 'Cr' : 'Dr' 
            }
          ],
          narration: quickVchForm.description.trim() || `Quick ${quickVoucher.type} via ${quickVoucher.paymentMethod}`,
          totalAmount: amount,
          createdAt: serverTimestamp()
        });
      });

      setQuickVoucher(null);
      setQuickVchForm({ accountId: '', amount: '', description: '', date: new Date().toISOString().split('T')[0] });
      triggerSmiley('happy');
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('INSUFFICIENT_FUNDS:')) {
        const [_, acc, bal] = error.message.split(':');
        alert(`Failed: Insufficient balance in ${acc}. \nAvailable: ₹${Number(bal).toLocaleString()}`);
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'quick_voucher');
      }
    } finally {
      setIsSavingQuickVch(false);
    }
  };

  const [editingBill, setEditingBill] = React.useState<any>(null);
  const [chatBill, setChatBill] = React.useState<any>(null);
  const [showPaymentSelection, setShowPaymentSelection] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, number: string } | null>(null);

  const [isWiping, setIsWiping] = useState(false);
  const isAdmin = isSuperAdmin || !!franchiseId;
  const isMilan = isSuperAdmin || (franchiseId === 'legacy-rajhans');
  // Allow Rajhans main account also for system maintenance unless disabled by Super Admin
  const isSystemAdmin = isSuperAdmin || (
    (isMilan || currentFranchise?.email === 'rajhanssikar@gmail.com') &&
    (franchiseDetail?.allowSystemMaintenance !== false && currentFranchise?.allowSystemMaintenance !== false)
  );

  const handleMasterReset = async () => {
    if (!isSystemAdmin) {
      alert("SECURITY ALERT: This operation is restricted to System Administrators.");
      return;
    }

    const fid = franchiseId || currentFranchise?.id;
    if (!fid) {
      alert("Error: Active franchise context is missing.");
      return;
    }
    const fName = currentFranchise?.name || fid;

    if (!confirm(`⚠️ CRITICAL WARNING: This will delete ALL data (Customers, Tokens, Drivers, Ledger, Documents, etc.) for the current franchise: ${fName}. This action is IRREVERSIBLE. Are you absolutely sure?`)) return;
    if (!confirm("🚨 LAST CHANCE: You are about to wipe this franchise's database. Are you really sure?")) return;

    const promptText = prompt("Please type 'DELETE' to confirm the master reset:");
    if (promptText !== 'DELETE') {
      alert("Reset cancelled. Text did not match.");
      return;
    }

    setIsWiping(true);
    const collectionsToWipe = [
      'customers', 'bills', 'drivers', 'tractors', 'dieselLogs', 
      'maintenanceLogs', 'ledger', 'driverLocations', 'bookingRequests', 
      'vouchers', 'attendance', 'hydrantFillings', 'trips', 
      'dieselRequests', 'documents', 'chats', 'accounts', 'feedbacks',
      'accountGroups', 'bankStatementRules'
    ];

    try {
      let overallSuccessCount = 0;
      let overallFailCount = 0;

      for (const collName of collectionsToWipe) {
        try {
          let docsToDelete: any[] = [];
          
          if (collName === 'feedbacks') {
            // feedbacks has restricted listing rules in firestore.rules
            const targetIds = [fid];
            if (fid === 'legacy-rajhans') {
              targetIds.push(null, "", "rajhans", "legacy-pile");
            }
            for (const targetId of targetIds) {
              try {
                const snap = await getDocs(query(collection(db, collName), where('franchiseId', '==', targetId)));
                docsToDelete.push(...snap.docs);
              } catch (qErr) {
                console.warn(`[Master Reset] Failed filtered query for feedbacks:`, qErr);
              }
            }
          } else {
            // Most other collections are publicly listable by signed-in users.
            // Reading all documents and performing in-memory check is 100% robust
            // because it catches missing/null/empty/variant franchise IDs.
            const snap = await getDocs(collection(db, collName));
            docsToDelete = snap.docs.filter(docSnap => {
              const data = docSnap.data();
              const docFid = data.franchiseId;
              
              if (fid === 'legacy-rajhans') {
                return docFid === 'legacy-rajhans' || 
                       docFid === 'rajhans' || 
                       docFid === 'legacy-pile' || 
                       docFid === null || 
                       docFid === undefined || 
                       docFid === "";
              } else {
                return docFid === fid;
              }
            });
          }

          // De-duplicate docs by ID
          const uniqueDocs = Array.from(new Map(docsToDelete.map(d => [d.id, d])).values());

          const chunks = [];
          const chunkSize = 50; 
          for (let i = 0; i < uniqueDocs.length; i += chunkSize) {
            chunks.push(uniqueDocs.slice(i, i + chunkSize));
          }

          for (const chunk of chunks) {
            await Promise.all(chunk.map(d => deleteDoc(doc(db, collName, d.id))));
          }
          overallSuccessCount++;
        } catch (collErr: any) {
          console.warn(`[Master Reset] Failed to clean collection "${collName}":`, collErr?.message || String(collErr));
          overallFailCount++;
        }
      }
      
      // Re-initialize default chart of accounts and groups for a perfect fresh start
      try {
        console.log(`[Master Reset] Re-seeding default chart of accounts for franchise ${fName} (${fid})...`);
        await ledgerAutomation.setupFranchiseLedgers(fid, fName);
      } catch (setupErr) {
        console.error("Failed to re-initialize baseline ledgers:", setupErr);
      }
      
      alert(`✅ Fresh Start! Database wiped successfully for this franchise. Wiped successfully: ${overallSuccessCount}/${collectionsToWipe.length} categories. System is now clean.`);
      window.location.reload();
    } catch (err: any) {
      console.error("Master Reset Failed:", err?.message || String(err));
      alert("❌ Wipe failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsWiping(false);
    }
  };

  const [isDeletingDrivers, setIsDeletingDrivers] = useState(false);
  const handleDeleteDriversData = async () => {
    if (!isAdmin) return;
    const fid = franchiseId || currentFranchise?.id;
    if (!fid) {
      alert("Error: Active franchise context is missing.");
      return;
    }
    const fName = currentFranchise?.name || fid;
    if (!confirm(`⚠️ WARNING: This will delete ALL Drivers and ALL driver-related Ledger entries for franchise: ${fName}. Are you sure?`)) return;
    
    setIsDeletingDrivers(true);
    try {
      const { bulkDeleteDrivers } = await import('../services/cleanup');
      const result = await bulkDeleteDrivers(fid);
      alert(`✅ Cleanup successful! Deleted ${result.count} driver-related records.`);
      window.location.reload();
    } catch (err: any) {
      alert("❌ Operation failed: " + (err.message || String(err)));
    } finally {
      setIsDeletingDrivers(false);
    }
  };

  const [isAcceptingRequest, setIsAcceptingRequest] = useState<string | null>(null);

  const handleStatusUpdate = async (status: 'Delivered' | 'Pending' | 'Filling' | 'Cancelled') => {
    if (!editingBill?.id) return;

    if (status === 'Delivered') {
      if (!editingBill.driverId || !editingBill.tractorId) {
        alert('Assignment Required: Please assign a Driver and Tractor before marking as Delivered.');
        return;
      }
      setShowPaymentSelection(true);
      return;
    }

    try {
      // Fetch required data outside transaction
      const franchiseIdForBill = editingBill.franchiseId || 'legacy-rajhans';
      const [incomeSnap, cashSnap, bankSnap, customerSnap, franchiseDoc, loyaltyExpenseAccSnap] = await Promise.all([
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Service Income'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Cash'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Bank Account'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', editingBill.customerName), where('franchiseId', '==', franchiseIdForBill))),
        getDoc(doc(db, 'franchises', franchiseIdForBill)),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Franchise Loyalty Expense'), where('franchiseId', 'in', [franchiseIdForBill, null])))
      ]);

      let incomeAccId = incomeSnap.docs[0]?.id;
      let cashAccId = cashSnap.docs[0]?.id;
      let bankAccId = bankSnap.docs[0]?.id;
      let customerAccId = customerSnap.docs[0]?.id;
      let loyaltyExpenseAccId = loyaltyExpenseAccSnap.docs.find(d => d.data().franchiseId === franchiseIdForBill || d.data().franchiseId === null)?.id;

      // FETCH TRIPS TO SYNC OUTSIDE TRANSACTION
      const qTrips = query(collection(db, 'trips'), where('billId', '==', editingBill.id));
      const tripSnapToSync = await getDocs(qTrips);

      await runTransaction(db, async (transaction) => {
        const billRef = doc(db, 'bills', editingBill.id);
        const customerRef = doc(db, 'customers', editingBill.customerId);
        
        const incomeAccRef = incomeAccId ? doc(db, 'accounts', incomeAccId) : null;
        const cashAccRef = cashAccId ? doc(db, 'accounts', cashAccId) : null;
        const bankAccRef = bankAccId ? doc(db, 'accounts', bankAccId) : null;
        const customerAccRef = customerAccId ? doc(db, 'accounts', customerAccId) : null;
        const loyaltyExpenseAccRef = loyaltyExpenseAccId ? doc(db, 'accounts', loyaltyExpenseAccId) : null;

        // --- 1. COMBINED READS AT THE VERY START ---
        const [
          billDoc,
          custDoc,
          incomeAccDoc,
          cashAccDoc,
          bankAccDoc,
          customerAccDoc,
          loyaltyExpenseAccDoc
        ] = await Promise.all([
          transaction.get(billRef),
          transaction.get(customerRef),
          incomeAccRef ? transaction.get(incomeAccRef) : Promise.resolve(null),
          cashAccRef ? transaction.get(cashAccRef) : Promise.resolve(null),
          bankAccRef ? transaction.get(bankAccRef) : Promise.resolve(null),
          customerAccRef ? transaction.get(customerAccRef) : Promise.resolve(null),
          loyaltyExpenseAccRef ? transaction.get(loyaltyExpenseAccRef) : Promise.resolve(null)
        ]);

        if (!billDoc.exists()) throw new Error("Bill not found");
        const oldBill = billDoc.data();
        const wasDelivered = oldBill.status === 'Delivered';
        const amount = oldBill.grandTotal;
        const oldPaymentMode = oldBill.paymentMode;

        // --- 2. WRITES SECOND ---
        if (wasDelivered && oldBill.ledgerPosted && (status === 'Pending' || status === 'Filling' || status === 'Cancelled')) {
          // REVERSE ACCOUNTING
          
          // Reverse Customer's Loyalty points
          const prevEarned = oldBill.loyaltyPointsEarned || 0;
          const prevRedeemed = oldBill.loyaltyPointsRedeemed || 0;
          const netLoyaltyChange = prevEarned - prevRedeemed;
          if (custDoc.exists()) {
            const currentCoins = custDoc.data().loyaltyCoins || 0;
            const newCoinsVal = Math.max(0, currentCoins - netLoyaltyChange);
            transaction.update(customerRef, {
              loyaltyCoins: newCoinsVal,
              updatedAt: serverTimestamp()
            });
          }

          // Reverse Franchise Loyalty Expense if redeemed
          if (prevRedeemed > 0 && loyaltyExpenseAccRef && loyaltyExpenseAccDoc?.exists()) {
            transaction.update(loyaltyExpenseAccRef, {
              currentBalance: Math.max(0, (loyaltyExpenseAccDoc.data().currentBalance || 0) - prevRedeemed)
            });
          }

          // Reverse Service Income (Cr -> Dr) for the full sales total amount including old loyalty redeemed
          const prevSalesTotal = amount + prevRedeemed;
          if (incomeAccDoc?.exists()) {
            transaction.update(incomeAccRef!, { currentBalance: (incomeAccDoc.data().currentBalance || 0) - prevSalesTotal });
          }

          // Reverse Payment
          if (oldPaymentMode === 'Cash' && cashAccDoc?.exists()) {
            transaction.update(cashAccRef!, { currentBalance: (cashAccDoc.data().currentBalance || 0) - amount });
          } else if ((oldPaymentMode === 'UPI' || oldPaymentMode === 'Bank' || oldPaymentMode === 'Bank Transfer') && bankAccDoc?.exists()) {
            transaction.update(bankAccRef!, { currentBalance: (bankAccRef!.id && bankAccDoc.data().currentBalance || 0) - amount });
          } else if (oldPaymentMode === 'Pending' && customerAccDoc?.exists()) {
            transaction.update(customerAccRef!, { currentBalance: (customerAccDoc.data().currentBalance || 0) - amount });
          }

          // Reverse Customer pendingAmount if it was Credit
          if (oldPaymentMode === 'Pending' && custDoc.exists()) {
             transaction.update(customerRef, {
               pendingAmount: Math.max(0, (custDoc.data().pendingAmount || 0) - amount),
               updatedAt: serverTimestamp()
             });
          }

          // DELETE VOUCHERS
          transaction.delete(doc(db, 'vouchers', `VCH-${editingBill.id}-SALE`));
          transaction.delete(doc(db, 'vouchers', `VCH-${editingBill.id}-RECPT`));
        }

        // Update Bill
        transaction.update(billRef, { 
          status,
          isSettled: false,
          ledgerPosted: false,
          loyaltyPointsEarned: 0,
          updatedAt: serverTimestamp()
        });

        // Sync with Trips
        if (!tripSnapToSync.empty) {
          tripSnapToSync.forEach(tDoc => {
            transaction.update(doc(db, 'trips', tDoc.id), { status, updatedAt: serverTimestamp() });
          });
        }
      });

      const updated = await getDoc(doc(db, 'bills', editingBill.id));
      setEditingBill({ id: updated.id, ...updated.data() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${editingBill.id}`);
    }
  };

  const [isSettling, setIsSettling] = useState<string | null>(null);

  const handleSettleOrder = async (mode: 'Cash' | 'UPI' | 'Credit' | 'Bank') => {
    if (!editingBill?.id || isSettling) return;

    setIsSettling(mode);
    const isCredit = mode === 'Credit';
    const finalPaymentMode = isCredit ? 'Pending' : mode;

    try {
      // 1. Fetch required data outside transaction including fallback franchise & loyalty ledger details
      const franchiseIdForBill = editingBill.franchiseId || 'legacy-rajhans';
      const [
        incomeSnap,
        cashSnap,
        bankSnap,
        debtorsGroupSnap,
        customerSnap,
        assetsGroupSnap,
        incomeGroupSnap,
        tripSnapToSync,
        franchiseDoc,
        loyaltyExpenseAccSnap,
        expensesGroupSnap
      ] = await Promise.all([
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Service Income'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Cash'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Bank Account'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Sundry Debtors'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', editingBill.customerName), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Current Assets'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Direct Incomes'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'trips'), where('billId', '==', editingBill.id))),
        getDoc(doc(db, 'franchises', franchiseIdForBill)),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Franchise Loyalty Expense'), where('franchiseId', 'in', [franchiseIdForBill, null]))),
        getDocs(query(collection(db, 'accountGroups'), where('name', 'in', ['Direct Expenses', 'Indirect Expenses', 'Expenses']), where('franchiseId', 'in', [franchiseIdForBill, null])))
      ]);

      let incomeAccId = incomeSnap.docs[0]?.id;
      let cashAccId = cashSnap.docs[0]?.id;
      let bankAccId = bankSnap.docs[0]?.id;
      let debtorsGroupId = debtorsGroupSnap.docs[0]?.id;
      let customerAccId = customerSnap.docs[0]?.id;
      let assetsGroupId = assetsGroupSnap.docs[0]?.id;
      let incomeGroupId = incomeGroupSnap.docs[0]?.id;
      let loyaltyExpenseAccId = loyaltyExpenseAccSnap.docs.find(d => d.data().franchiseId === franchiseIdForBill || d.data().franchiseId === null)?.id;
      let expenseGroupId = expensesGroupSnap.docs.find(d => d.data().franchiseId === franchiseIdForBill || d.data().franchiseId === null)?.id || expensesGroupSnap.docs[0]?.id;

      // Extract Franchise Loyalty attributes
      let loyaltyProgramEnabled = false;
      let commPct = commissionPercentage || 5;
      if (franchiseDoc.exists()) {
        const fData = franchiseDoc.data();
        loyaltyProgramEnabled = !!fData.loyaltyProgramEnabled;
        commPct = fData.commissionPercentage || commPct;
      }

      await runTransaction(db, async (transaction) => {
        const billRef = doc(db, 'bills', editingBill.id);
        const customerRef = doc(db, 'customers', editingBill.customerId);
        
        const incomeAccRef = incomeAccId ? doc(db, 'accounts', incomeAccId) : null;
        const cashAccRef = cashAccId ? doc(db, 'accounts', cashAccId) : null;
        const bankAccRef = bankAccId ? doc(db, 'accounts', bankAccId) : null;
        const customerAccRef = customerAccId ? doc(db, 'accounts', customerAccId) : null;
        const loyaltyExpenseAccRef = loyaltyExpenseAccId ? doc(db, 'accounts', loyaltyExpenseAccId) : null;

        // --- 1. COMBINED READS AT THE VERY START ---
        const [
          billDoc, 
          custDoc,
          incomeAccDoc, 
          cashAccDoc, 
          bankAccDoc, 
          customerAccDoc, 
          loyaltyExpenseAccDoc
        ] = await Promise.all([
          transaction.get(billRef),
          transaction.get(customerRef),
          incomeAccRef ? transaction.get(incomeAccRef) : Promise.resolve(null),
          cashAccRef ? transaction.get(cashAccRef) : Promise.resolve(null),
          bankAccRef ? transaction.get(bankAccRef) : Promise.resolve(null),
          customerAccRef ? transaction.get(customerAccRef) : Promise.resolve(null),
          loyaltyExpenseAccRef ? transaction.get(loyaltyExpenseAccRef) : Promise.resolve(null)
        ]);

        if (!billDoc.exists()) throw new Error("Bill not found");
        const oldBill = billDoc.data();
        const wasDelivered = oldBill.status === 'Delivered';
        const oldPaymentMode = oldBill.paymentMode;
        const amount = oldBill.grandTotal; // Net amount payable after discount/redemption

        // Calculate loyalty coins rewards and commission updates
        const redeemed = oldBill.loyaltyPointsRedeemed || 0;
        let calculatedLoyaltyPointsEarned = 0;
        let originalComm = oldBill.commissionAmount;
        
        if (!originalComm) {
          originalComm = ((oldBill.totalAmount || amount) * commPct) / 100;
        }

        if (loyaltyProgramEnabled) {
          calculatedLoyaltyPointsEarned = Math.round(originalComm * 0.70);
        }

        // Balance Service Income with pre-redemption true sale amount
        const salesTotalAmount = amount + redeemed;

        // --- 2. WRITES SECOND ---

        // A. REVERSE OLD IMPACT (If it was previously delivered and posted to ledger)
        if (wasDelivered && oldBill.ledgerPosted) {
          // Reverse Service Income (Cr -> Dr) for the full sales total amount including old loyalty redeemed
          const prevRedeemed = oldBill.loyaltyPointsRedeemed || 0;
          const prevSalesTotal = amount + prevRedeemed;
          if (incomeAccDoc?.exists()) {
            transaction.update(incomeAccRef!, {
              currentBalance: (incomeAccDoc.data().currentBalance || 0) - prevSalesTotal
            });
          }
          // Reverse Franchise Loyalty Expense if was redeemed
          if (prevRedeemed > 0 && loyaltyExpenseAccRef && loyaltyExpenseAccDoc?.exists()) {
            transaction.update(loyaltyExpenseAccRef, {
              currentBalance: Math.max(0, (loyaltyExpenseAccDoc.data().currentBalance || 0) - prevRedeemed)
            });
          }
          // Reverse Cash/Bank/Customer impacts
          if (oldPaymentMode === 'Cash' && cashAccDoc?.exists()) {
            transaction.update(cashAccRef!, { currentBalance: (cashAccDoc.data().currentBalance || 0) - amount });
          } else if ((oldPaymentMode === 'UPI' || oldPaymentMode === 'Bank') && bankAccDoc?.exists()) {
            transaction.update(bankAccRef!, { currentBalance: (bankAccDoc.data().currentBalance || 0) - amount });
          } else if (oldPaymentMode === 'Pending' && customerAccDoc?.exists()) {
            transaction.update(customerAccRef!, { currentBalance: (customerAccDoc.data().currentBalance || 0) - amount });
          }
        }

        // B. APPLY NEW IMPACT
        // Handle Missing Groups & Accounts
        if (!incomeGroupId) {
          const newGrp = doc(collection(db, 'accountGroups'));
          transaction.set(newGrp, { name: 'Direct Incomes', type: 'Income', franchiseId: franchiseIdForBill, createdAt: serverTimestamp() });
          incomeGroupId = newGrp.id;
        }
        
        let finalIncomeAccId = incomeAccId;
        if (!incomeAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { 
            name: 'Service Income', 
            groupId: incomeGroupId, 
            openingBalance: 0, 
            balanceType: 'Cr', 
            currentBalance: salesTotalAmount,
            franchiseId: franchiseIdForBill,
            createdAt: serverTimestamp() 
          });
          finalIncomeAccId = newAcc.id;
        } else {
            const baseBal = incomeAccDoc?.exists() ? incomeAccDoc.data().currentBalance || 0 : 0;
            const prevRedeemed = oldBill.loyaltyPointsRedeemed || 0;
            const prevSalesTotal = amount + prevRedeemed;
            const adjustedBase = (wasDelivered && oldBill.ledgerPosted) ? baseBal - prevSalesTotal : baseBal;
            transaction.update(incomeAccRef!, { currentBalance: adjustedBase + salesTotalAmount });
        }

        // Setup loyalty expense ledger account inside transaction if missing
        let finalLoyaltyExpenseAccId = loyaltyExpenseAccId;
        if (redeemed > 0) {
          if (!finalLoyaltyExpenseAccId) {
            if (!expenseGroupId) {
              const newGrp = doc(collection(db, 'accountGroups'));
              transaction.set(newGrp, { name: 'Direct Expenses', type: 'Expense', franchiseId: franchiseIdForBill, createdAt: serverTimestamp() });
              expenseGroupId = newGrp.id;
            }
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, {
              name: 'Franchise Loyalty Expense',
              groupId: expenseGroupId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: redeemed,
              franchiseId: franchiseIdForBill,
              createdAt: serverTimestamp()
            });
            finalLoyaltyExpenseAccId = newAcc.id;
          } else if (loyaltyExpenseAccRef && loyaltyExpenseAccDoc?.exists()) {
             const prevRedeemed = oldBill.loyaltyPointsRedeemed || 0;
             const expBase = loyaltyExpenseAccDoc.data().currentBalance || 0;
             const adjustedExp = (wasDelivered && oldBill.ledgerPosted) ? expBase - prevRedeemed : expBase;
             transaction.update(loyaltyExpenseAccRef, { currentBalance: adjustedExp + redeemed });
          }
        }

        if (!assetsGroupId) {
          const newGrp = doc(collection(db, 'accountGroups'));
          transaction.set(newGrp, { name: 'Current Assets', type: 'Asset', franchiseId: franchiseIdForBill, createdAt: serverTimestamp() });
          assetsGroupId = newGrp.id;
        }
        
        let finalCashAccId = cashAccId;
        if (!cashAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { name: 'Cash', groupId: assetsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: mode === 'Cash' ? amount : 0, franchiseId: franchiseIdForBill, createdAt: serverTimestamp() });
          finalCashAccId = newAcc.id;
        } else if (cashAccDoc?.exists()) {
            const base = cashAccDoc.data().currentBalance || 0;
            const adjusted = (wasDelivered && oldBill.ledgerPosted && oldPaymentMode === 'Cash') ? base - amount : base;
            transaction.update(cashAccRef!, { currentBalance: adjusted + (mode === 'Cash' ? amount : 0) });
        }

        let finalBankAccId = bankAccId;
        if (!bankAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { name: 'Bank Account', groupId: assetsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: (mode === 'UPI' || mode === 'Bank') ? amount : 0, franchiseId: franchiseIdForBill, createdAt: serverTimestamp() });
          finalBankAccId = newAcc.id;
        } else if (bankAccDoc?.exists()) {
            const base = bankAccDoc.data().currentBalance || 0;
            const adjusted = (wasDelivered && oldBill.ledgerPosted && (oldPaymentMode === 'UPI' || oldPaymentMode === 'Bank')) ? base - amount : base;
            transaction.update(bankAccRef!, { currentBalance: adjusted + ((mode === 'UPI' || mode === 'Bank') ? amount : 0) });
        }

        if (!debtorsGroupId) {
          const newGrp = doc(collection(db, 'accountGroups'));
          transaction.set(newGrp, { name: 'Sundry Debtors', parentGroupId: assetsGroupId, type: 'Asset', franchiseId: franchiseIdForBill, createdAt: serverTimestamp() });
          debtorsGroupId = newGrp.id;
        }
        
        let finalCustomerAccId = customerAccId;
        if (!customerAccId) {
          const newAcc = doc(collection(db, 'accounts'));
          transaction.set(newAcc, { name: oldBill.customerName, groupId: debtorsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: isCredit ? amount : 0, franchiseId: franchiseIdForBill, createdAt: serverTimestamp() });
          finalCustomerAccId = newAcc.id;
        } else if (customerAccDoc?.exists()) {
            const base = customerAccDoc.data().currentBalance || 0;
            const adjusted = (wasDelivered && oldBill.ledgerPosted && oldPaymentMode === 'Pending') ? base - amount : base;
            transaction.update(customerAccRef!, { currentBalance: adjusted + (isCredit ? amount : 0) });
        }

        // Update customer's loyalty balance in the database atomically inside transaction
        if (!oldBill.ledgerPosted && custDoc.exists()) {
          const currentCoins = custDoc.data().loyaltyCoins || 0;
          const netLoyaltyChange = calculatedLoyaltyPointsEarned - redeemed;
          const newCoinsVal = Math.max(0, currentCoins + netLoyaltyChange);
          transaction.update(customerRef, {
            loyaltyCoins: newCoinsVal,
            updatedAt: serverTimestamp()
          });
          console.log(`[Dashboard Settle] Updated customer ${oldBill.customerName} loyalty token balance in transaction: ${newCoinsVal}`);
        }

        // Deduct redeemed points from the franchise's commission on this bill
        const finalCommissionValue = Math.max(0, originalComm - (redeemed > 0 ? redeemed : 0));

        // Update Bill
        transaction.update(billRef, { 
          status: 'Delivered', 
          paymentMode: finalPaymentMode,
          isSettled: !isCredit,
          ledgerPosted: true,
          loyaltyPointsEarned: calculatedLoyaltyPointsEarned,
          commissionAmount: finalCommissionValue,
          updatedAt: serverTimestamp()
        });

        // Sync with Trips
        if (tripSnapToSync && !tripSnapToSync.empty) {
          tripSnapToSync.forEach(tDoc => {
            transaction.update(doc(db, 'trips', tDoc.id), { 
              status: 'Delivered', 
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp() 
            });
          });
        }

        // Update Customer Ledger (pendingAmount field)
        const currentPending = custDoc.exists() ? (custDoc.data().pendingAmount || 0) : 0;
        const adjustedPending = (wasDelivered && oldPaymentMode === 'Pending') ? currentPending - amount : currentPending;
        transaction.update(customerRef, {
          pendingAmount: adjustedPending + (isCredit ? amount : 0),
          updatedAt: serverTimestamp()
        });

        // --- 3. UPSERT VOUCHERS ---
        // Sales Voucher
        const salesVchId = `VCH-${editingBill.id}-SALE`;
        const salesItems = [
          { accountId: finalCustomerAccId, accountName: oldBill.customerName, amount: amount, type: 'Dr' }
        ];
        if (redeemed > 0 && finalLoyaltyExpenseAccId) {
          salesItems.push({ accountId: finalLoyaltyExpenseAccId, accountName: 'Franchise Loyalty Expense', amount: redeemed, type: 'Dr' });
        }
        salesItems.push({ accountId: finalIncomeAccId, accountName: 'Service Income', amount: salesTotalAmount, type: 'Cr' });

        transaction.set(doc(db, 'vouchers', salesVchId), {
          date: new Date(),
          type: 'Sales',
          voucherNumber: `TRP-${oldBill.billNumber}`,
          items: salesItems,
          narration: `Trip #${oldBill.billNumber} - ${oldBill.customerName} (${oldBill.tankerSize || 'Water Can'}) ${redeemed > 0 ? `| Cashback Coins Redeemed: ₹${redeemed}` : ''}`,
          totalAmount: salesTotalAmount,
          franchiseId: oldBill.franchiseId || franchiseId || null,
          createdAt: oldBill.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Receipt Voucher (if not credit)
        const receiptVchId = `VCH-${editingBill.id}-RECPT`;
        if (!isCredit) {
          const debitAccId = (mode === 'UPI' || mode === 'Bank') ? finalBankAccId : finalCashAccId;
          const debitAccName = (mode === 'UPI' || mode === 'Bank') ? 'Bank Account' : 'Cash';
          
          transaction.set(doc(db, 'vouchers', receiptVchId), {
            date: new Date(),
            type: 'Receipt',
            voucherNumber: `REC-${oldBill.billNumber}`,
            items: [
              { accountId: debitAccId, accountName: debitAccName, amount: amount, type: 'Dr' },
              { accountId: finalCustomerAccId, accountName: oldBill.customerName, amount: amount, type: 'Cr' }
            ],
            narration: `Payment for Bill #${oldBill.billNumber} via ${mode}`,
            totalAmount: amount,
            franchiseId: oldBill.franchiseId || franchiseId || null,
            createdAt: serverTimestamp()
          });
        } else {
          // If it was previously receipted but now changed to credit, delete receipt voucher
          transaction.delete(doc(db, 'vouchers', receiptVchId));
        }
      });

      // Show "Done" state for 1 second
      setIsSettling('DONE');
      triggerSmiley(mode === 'Credit' ? 'sad' : 'happy');
      
      setTimeout(() => {
        setIsSettling(null);
        setShowPaymentSelection(false);
        setEditingBill(null);
      }, 1000);

    } catch (error: any) {
      setIsSettling(null);
      handleFirestoreError(error, OperationType.WRITE, 'transaction');
    }
  };

  const handlePaymentUpdate = async (mode: typeof PAYMENT_MODES[number]) => {
    if (!editingBill?.id || isSettling) return;
    
    setIsSettling(mode);
    const oldMode = editingBill.paymentMode;
    const isCredit = mode === 'Pending';
    
    try {
      // 1. Fetch required data outside transaction
      const franchiseIdForBill = editingBill.franchiseId || 'legacy-rajhans';
      const [cashSnap, bankSnap, customerSnap, assetsGroupSnap] = await Promise.all([
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Cash'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Bank Account'), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', editingBill.customerName), where('franchiseId', '==', franchiseIdForBill))),
        getDocs(query(collection(db, 'accountGroups'), where('name', '==', 'Current Assets'), where('franchiseId', 'in', [franchiseIdForBill, null])))
      ]);

      let cashAccId = cashSnap.docs[0]?.id;
      let bankAccId = bankSnap.docs[0]?.id;
      let customerAccId = customerSnap.docs[0]?.id;
      let assetsGroupId = assetsGroupSnap.docs[0]?.id;

      await runTransaction(db, async (transaction) => {
        const billRef = doc(db, 'bills', editingBill.id);
        const customerRef = doc(db, 'customers', editingBill.customerId);
        
        const cashAccRef = cashAccId ? doc(db, 'accounts', cashAccId) : null;
        const bankAccRef = bankAccId ? doc(db, 'accounts', bankAccId) : null;
        const customerAccRef = customerAccId ? doc(db, 'accounts', customerAccId) : null;

        // --- 1. READS FIRST ---
        const [billDoc, custDoc, cashAccDoc, bankAccDoc, customerAccDoc] = await Promise.all([
          transaction.get(billRef),
          transaction.get(customerRef),
          cashAccRef ? transaction.get(cashAccRef) : Promise.resolve(null),
          bankAccRef ? transaction.get(bankAccRef) : Promise.resolve(null),
          customerAccRef ? transaction.get(customerAccRef) : Promise.resolve(null)
        ]);
        
        if (!billDoc.exists()) throw new Error("Bill not found");
        const billData = billDoc.data();
        const amount = billData.grandTotal;
        const wasDelivered = billData.status === 'Delivered';

        // --- 2. WRITES SECOND ---

        if (wasDelivered) {
          // A. REVERSE OLD PAYMENT IMPACT
          if (oldMode === 'Cash' && cashAccDoc?.exists()) {
            transaction.update(cashAccRef!, { currentBalance: (cashAccDoc.data().currentBalance || 0) - amount });
          } else if ((oldMode === 'UPI' || oldMode === 'Bank Transfer' || oldMode === 'Bank') && bankAccDoc?.exists()) {
            transaction.update(bankAccRef!, { currentBalance: (bankAccDoc.data().currentBalance || 0) - amount });
          } else if (oldMode === 'Pending' && customerAccDoc?.exists()) {
            transaction.update(customerAccRef!, { currentBalance: (customerAccDoc.data().currentBalance || 0) - amount });
          }

          // B. APPLY NEW PAYMENT IMPACT
          if (!assetsGroupId) {
            const newGrp = doc(collection(db, 'accountGroups'));
            transaction.set(newGrp, { name: 'Current Assets', type: 'Asset' });
            assetsGroupId = newGrp.id;
          }
          
          let finalCashAccId = cashAccId;
          const isNewCash = mode === 'Cash';
          if (!cashAccId && isNewCash) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, { name: 'Cash', groupId: assetsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: amount, createdAt: serverTimestamp() });
            finalCashAccId = newAcc.id;
          } else if (cashAccDoc?.exists()) {
            const base = (cashAccDoc.data().currentBalance || 0);
            const adjusted = (oldMode === 'Cash') ? base - amount : base;
            transaction.update(cashAccRef!, { currentBalance: adjusted + (isNewCash ? amount : 0) });
          }

          let finalBankAccId = bankAccId;
          const isNewBank = mode === 'UPI' || mode === 'Bank Transfer';
          if (!bankAccId && isNewBank) {
            const newAcc = doc(collection(db, 'accounts'));
            transaction.set(newAcc, { name: 'Bank Account', groupId: assetsGroupId, openingBalance: 0, balanceType: 'Dr', currentBalance: amount, createdAt: serverTimestamp() });
            finalBankAccId = newAcc.id;
          } else if (bankAccDoc?.exists()) {
            const base = (bankAccDoc.data().currentBalance || 0);
            const adjusted = (oldMode === 'UPI' || oldMode === 'Bank Transfer') ? base - amount : base;
            transaction.update(bankAccRef!, { currentBalance: adjusted + (isNewBank ? amount : 0) });
          }

          if (customerAccDoc?.exists()) {
            const base = (customerAccDoc.data().currentBalance || 0);
            const adjusted = (oldMode === 'Pending') ? base - amount : base;
            transaction.update(customerAccRef!, { currentBalance: adjusted + (isCredit ? amount : 0) });
          }

          // Update Customer pendingAmount field
          if (custDoc.exists()) {
            const currentPending = custDoc.data().pendingAmount || 0;
            const adjustedPending = (oldMode === 'Pending') ? currentPending - amount : currentPending;
            transaction.update(customerRef, {
              pendingAmount: Math.max(0, adjustedPending + (isCredit ? amount : 0)),
              updatedAt: serverTimestamp()
            });
          }

          // C. UPSERT VOUCHERS
          const receiptVchId = `VCH-${editingBill.id}-RECPT`;
          if (!isCredit) {
            const debitAccId = isNewBank ? finalBankAccId! : finalCashAccId!;
            const debitAccName = isNewBank ? 'Bank Account' : 'Cash';
            
            transaction.set(doc(db, 'vouchers', receiptVchId), {
              date: new Date(),
              type: 'Receipt',
              voucherNumber: `REC-${billData.billNumber}`,
              items: [
                { accountId: debitAccId, accountName: debitAccName, amount: amount, type: 'Dr' },
                { accountId: customerAccId, accountName: billData.customerName, amount: amount, type: 'Cr' }
              ],
              narration: `Payment mode update for Bill #${billData.billNumber} to ${mode}`,
              totalAmount: amount,
              createdAt: serverTimestamp()
            });
          } else {
            transaction.delete(doc(db, 'vouchers', receiptVchId));
          }
        }

        // Bill Update
        transaction.update(billRef, { 
          paymentMode: mode, 
          isSettled: !isCredit,
          updatedAt: serverTimestamp()
        });
      });
      
      setIsSettling('DONE');
      triggerSmiley('happy');
      setTimeout(() => {
        setIsSettling(null);
        setEditingBill(null);
      }, 1000);
    } catch (error) {
      setIsSettling(null);
      handleFirestoreError(error, OperationType.UPDATE, `bills/${editingBill?.id}`);
    }
  };

  const handleDriverUpdate = async (driver: Driver) => {
    if (editingBill?.id) {
      try {
        // Check if driver is already on an active trip (self-healing busy check)
        const qTrp = query(collection(db, 'trips'), where('driverId', '==', driver.id), where('status', 'in', ['Active', 'Filling', 'On the way', 'Reached']));
        const snap = await getDocs(qTrp);
        if (!snap.empty) {
          let actuallyBusy = false;
          for (const tDoc of snap.docs) {
            const tData = tDoc.data();
            if (tData.billId) {
              const bRef = doc(db, 'bills', tData.billId);
              const bSnap = await getDoc(bRef);
              if (bSnap.exists()) {
                const bStatus = bSnap.data().status;
                if (['Delivered', 'Cancelled'].includes(bStatus)) {
                  // Associated bill is delivered/cancelled, free driver self-healingly
                  await updateDoc(doc(db, 'trips', tDoc.id), { status: bStatus, completedAt: serverTimestamp() });
                } else {
                  actuallyBusy = true;
                }
              } else {
                // Bill doesn't exist, free driver
                await updateDoc(doc(db, 'trips', tDoc.id), { status: 'Delivered', completedAt: serverTimestamp() });
              }
            } else {
              actuallyBusy = true;
            }
          }
          if (actuallyBusy) {
            alert('Driver Busy: Currently on an active trip.');
            return;
          }
        }

        await updateDoc(doc(db, 'bills', editingBill.id), { 
          driverName: driver.name,
          driverMobile: driver.mobile,
          driverId: driver.id,
          status: 'Assigned',
          updatedAt: serverTimestamp()
        });

        // Create or Update Trip Record
        const qExisting = query(collection(db, 'trips'), where('billId', '==', editingBill.id));
        const existingSnap = await getDocs(qExisting);
        
        if (!existingSnap.empty) {
          await updateDoc(doc(db, 'trips', existingSnap.docs[0].id), {
            driverId: driver.id,
            driverName: driver.name,
            tractorId: editingBill.tractorId || 'T-01',
            remarks: editingBill.remarks || '',
            status: 'Active',
            updatedAt: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, 'trips'), {
            billId: editingBill.id,
            billNumber: editingBill.billNumber,
            driverId: driver.id,
            driverName: driver.name,
            tractorId: editingBill.tractorId || 'T-01',
            customerName: editingBill.customerName,
            customerMobile: editingBill.customerMobile,
            siteLocation: editingBill.customerAddress,
            quantity: editingBill.quantity,
            tankerSize: editingBill.tankerSize,
            remarks: editingBill.remarks || '',
            status: 'Active',
            category: editingBill.category || 'TANKER',
            franchiseId: editingBill.franchiseId || 'legacy-rajhans',
            createdAt: serverTimestamp()
          });
        }

        const updated = await getDoc(doc(db, 'bills', editingBill.id));
        setEditingBill({ id: updated.id, ...updated.data() });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `bills/${editingBill.id}`);
      }
    }
  };

  const handleTractorUpdate = async (tractorId: string) => {
    if (editingBill?.id) {
      try {
        await updateDoc(doc(db, 'bills', editingBill.id), { 
          tractorId,
          updatedAt: serverTimestamp()
        });

        // Sync with Trips
        const qTrips = query(collection(db, 'trips'), where('billId', '==', editingBill.id));
        const tripSnap = await getDocs(qTrips);
        if (!tripSnap.empty) {
          await updateDoc(doc(db, 'trips', tripSnap.docs[0].id), { tractorId, updatedAt: serverTimestamp() });
        }
        const updated = await getDoc(doc(db, 'bills', editingBill.id));
        setEditingBill({ id: updated.id, ...updated.data() });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `bills/${editingBill.id}`);
      }
    }
  };

  const handleAcceptRequest = async (request: any) => {
    if (isAcceptingRequest === request.id) return;
    setIsAcceptingRequest(request.id);
    
    try {
      // Re-fetch request to ensure it hasn't been accepted already
      const freshReqSnap = await getDoc(doc(db, 'bookingRequests', request.id));
      if (!freshReqSnap.exists() || freshReqSnap.data().status === 'Accepted') {
        alert("This request has already been accepted or no longer exists.");
        setIsAcceptingRequest(null);
        return;
      }

      let originalData: any = {};
      
      if (request.billId) {
        // 1. Get original bill details for Rebooking
        const originalBillRef = doc(db, 'bills', request.billId);
        const originalBillSnap = await getDoc(originalBillRef);
        
        if (!originalBillSnap.exists()) {
          alert("Original order not found.");
          setIsAcceptingRequest(null);
          return;
        }
        originalData = originalBillSnap.data();
      } else {
        // New web request from Customer Booking Portal
        const customerSnap = await getDoc(doc(db, 'customers', request.customerId));
        if (customerSnap.exists()) {
          const cust = customerSnap.data();
          originalData = {
            customerId: request.customerId,
            customerName: request.customerName,
            customerMobile: request.customerMobile,
            customerAddress: request.location?.address || cust.address,
            tankerSize: request.tankerSize || 'Standard',
            quantity: 1,
            rate: request.totalEstimate || cust.lastRate || 0,
            totalAmount: request.totalEstimate || cust.lastRate || 0,
            extraCharges: 0,
            discount: 0,
            grandTotal: request.totalEstimate || cust.lastRate || 0,
            remarks: request.remarks,
            deliveryLocation: request.location ? {
              lat: request.location.lat,
              lng: request.location.lng,
              address: request.location.address,
              mapLink: `https://www.google.com/maps?q=${request.location.lat},${request.location.lng}`
            } : null
          };
        } else {
            alert("Customer not found.");
            setIsAcceptingRequest(null);
            return;
        }
      }
      
      // 2. Generate new bill number
      const allBills = await getDocs(collection(db, 'bills'));
      const newBillNumber = generateBillNumber(allBills.size + 1);

      // 3. Create new bill based on original but with current time
      const newBillData = {
        ...originalData,
        category: request.category || originalData.category || 'TANKER', // Ensure category is present
        billNumber: newBillNumber,
        date: new Date().toISOString(),
        status: 'Pending',
        isSettled: false,
        paymentMode: 'Pending',
        remarks: request.remarks || originalData.remarks || '',
        createdAt: serverTimestamp(),
        franchiseId: request.franchiseId || originalData.franchiseId || franchiseId || null,
        loyaltyPointsRedeemed: request.loyaltyPointsRedeemed || 0,
        discount: (originalData.discount || 0) + (request.loyaltyPointsRedeemed || 0),
        grandTotal: Math.max(0, (originalData.grandTotal || request.totalEstimate || 0) - (request.loyaltyPointsRedeemed || 0))
      };

      try {
        await addDoc(collection(db, 'bills'), newBillData);
      } catch (billErr) {
        handleFirestoreError(billErr, OperationType.CREATE, 'bills');
        throw billErr;
      }

      // 4. Update request status
      await updateDoc(doc(db, 'bookingRequests', request.id), { 
        status: 'Accepted',
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      // Avoid double handleFirestoreError if it already happened for bills
      if (!(error instanceof Error && error.message.includes('OperationType'))) {
        handleFirestoreError(error, OperationType.UPDATE, `bookingRequests/${request.id}`);
      }
    } finally {
      setIsAcceptingRequest(null);
    }
  };

  const handleRejectRequest = async (request: any) => {
    try {
      await updateDoc(doc(db, 'bookingRequests', request.id), { 
        status: 'Rejected',
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookingRequests/${request.id}`);
    }
  };

  const handleDeleteToken = async (id: string) => {
    try {
      // 1. Fetch data outside transition
      const billSnap = await getDoc(doc(db, 'bills', id));
      if (!billSnap.exists()) return;
      const billData = billSnap.data();
      const fid = billData.franchiseId || 'legacy-rajhans';

      const [incomeSnap, cashSnap, bankSnap, customerAccSnap] = await Promise.all([
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Service Income'), where('franchiseId', '==', fid))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Cash'), where('franchiseId', '==', fid))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', 'Bank Account'), where('franchiseId', '==', fid))),
        getDocs(query(collection(db, 'accounts'), where('name', '==', billData.customerName), where('franchiseId', '==', fid)))
      ]);

      let incomeAccId = incomeSnap.docs[0]?.id;
      let cashAccId = cashSnap.docs[0]?.id;
      let bankAccId = bankSnap.docs[0]?.id;
      let customerAccId = customerAccSnap.docs[0]?.id;

      // FETCH TRIPS TO DELETE OUTSIDE TRANSACTION
      const qTrips = query(collection(db, 'trips'), where('billId', '==', id));
      const tripSnap = await getDocs(qTrips);

      await runTransaction(db, async (transaction) => {
        const billRef = doc(db, 'bills', id);
        const customerRef = doc(db, 'customers', billData.customerId);
        
        const incomeAccRef = incomeAccId ? doc(db, 'accounts', incomeAccId) : null;
        const cashAccRef = cashAccId ? doc(db, 'accounts', cashAccId) : null;
        const bankAccRef = bankAccId ? doc(db, 'accounts', bankAccId) : null;
        const customerAccRef = customerAccId ? doc(db, 'accounts', customerAccId) : null;

        // --- READS ---
        const [custDoc, incomeAccDoc, cashAccDoc, bankAccDoc, customerAccDoc] = await Promise.all([
          transaction.get(customerRef),
          incomeAccRef ? transaction.get(incomeAccRef) : Promise.resolve(null),
          cashAccRef ? transaction.get(cashAccRef) : Promise.resolve(null),
          bankAccRef ? transaction.get(bankAccRef) : Promise.resolve(null),
          customerAccRef ? transaction.get(customerAccRef) : Promise.resolve(null)
        ]);

        // --- WRITES ---
        if (billData.status === 'Delivered') {
          const amount = billData.grandTotal;
          const oldPaymentMode = billData.paymentMode;

          // Reverse Income
          if (incomeAccDoc?.exists()) {
            transaction.update(incomeAccRef!, { currentBalance: (incomeAccDoc.data().currentBalance || 0) - amount });
          }

          // Reverse Payment
          if (oldPaymentMode === 'Cash' && cashAccDoc?.exists()) {
            transaction.update(cashAccRef!, { currentBalance: (cashAccDoc.data().currentBalance || 0) - amount });
          } else if ((oldPaymentMode === 'UPI' || oldPaymentMode === 'Bank' || oldPaymentMode === 'Bank Transfer') && bankAccDoc?.exists()) {
            transaction.update(bankAccRef!, { currentBalance: (bankAccDoc.data().currentBalance || 0) - amount });
          } else if (oldPaymentMode === 'Pending' && customerAccDoc?.exists()) {
            transaction.update(customerAccRef!, { currentBalance: (customerAccDoc.data().currentBalance || 0) - amount });
          }

          // Reverse Customer pendingAmount
          if (oldPaymentMode === 'Pending' && custDoc.exists()) {
             transaction.update(customerRef, {
               pendingAmount: Math.max(0, (custDoc.data().pendingAmount || 0) - amount),
               updatedAt: serverTimestamp()
             });
          }

          // Delete Vouchers
          transaction.delete(doc(db, 'vouchers', `VCH-${id}-SALE`));
          transaction.delete(doc(db, 'vouchers', `VCH-${id}-RECPT`));
        }

        // Delete associated trips fetched outside
        tripSnap.forEach(tDoc => {
          transaction.delete(doc(db, 'trips', tDoc.id));
        });

        // Delete the bill
        transaction.delete(billRef);
      });

      setEditingBill(null);
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `bills/${id}`);
    }
  };

  const shareBillImage = async (bill: any, target: 'customer' | 'driver' = 'customer') => {
    if (!printRef.current) return;
    
    try {
      // Capture the thermal receipt as JPEG
      const dataUrl = await toJpeg(printRef.current, { 
        quality: 0.95,
        backgroundColor: '#ffffff',
        pixelRatio: 2 // Higher quality
      });
      
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `Token_${bill.billNumber}.jpg`;
      let file: any;
      // Handle file constructor safely with double guards for 'Illegal constructor'
      try {
        if (typeof window.File === 'function') {
          try {
            file = new File([blob], fileName, { type: 'image/jpeg' });
          } catch (fileConstructErr) {
            console.warn('File constructor failed, falling back to blob');
            file = blob;
          }
        } else {
          file = blob;
        }
      } catch (e) {
        file = blob;
      }

      let canShareFile = false;
      try {
        if (navigator.canShare) {
          canShareFile = navigator.canShare({ files: [file] });
        }
      } catch (canShareErr) {
        console.warn('canShare check failed', canShareErr instanceof Error ? canShareErr.message : String(canShareErr));
        canShareFile = false;
      }

      // Try Web Share API (Best for Mobile WhatsApp)
      if (navigator.share && canShareFile) {
        try {
          await navigator.share({
            files: [file],
            title: `Bill #${bill.billNumber}`,
            text: `Trip Token from TankerWala Powered by Rajhans. Target: ${target.toUpperCase()}`
          });
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') return;
          console.warn('Web Share failed, trying fallback:', shareErr instanceof Error ? shareErr.message : String(shareErr));
        }
      }

      // Try Copy to Clipboard with robust constructor check
      try {
        if (navigator.clipboard && typeof window.ClipboardItem === 'function') {
          try {
            // Use a local let to avoid potential scope issues with the constructor
            const ClipboardItemConstructor = window.ClipboardItem;
            const item = new ClipboardItemConstructor({ [blob.type]: blob });
            await navigator.clipboard.write([item]);
            alert('Token image copied! Opening WhatsApp... Just Paste (Ctrl+V) and send.');
          } catch (itemErr) {
            // Fallback for browsers that support clipboard.write but failed constructor
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = fileName;
            link.click();
          }
        } else {
          // Navigator.clipboard.write is not supported or ClipboardItem is not a constructor
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = fileName;
          link.click();
        }
      } catch (err: any) {
        console.warn('Clipboard share failed', err instanceof Error ? err.message : String(err));
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        link.click();
      }

      // Open WhatsApp text as fallback
      sendWhatsApp(bill, target);
    } catch (err: any) {
      console.error('Error sharing image:', err?.message || String(err));
      sendWhatsApp(bill, target);
    }
  };

  const sendWhatsApp = (bill: any, target: 'customer' | 'driver' = 'customer') => {
    const rawPhone = target === 'customer' ? (bill.customerMobile || '') : (bill.driverMobile || '');
    if (!rawPhone) {
      alert(`No ${target} mobile number found.`);
      return;
    }

    const cleanPhone = rawPhone.replace(/\D/g, '');
    const phone = cleanPhone.startsWith('91') && cleanPhone.length > 10 
      ? cleanPhone 
      : `91${cleanPhone.slice(-10)}`;

    const url = getPublicAppUrl();
    url.search = '';
    url.searchParams.set('o', bill.id);
    const rebookUrl = url.toString();

    const message = target === 'customer' 
      ? `*Order Token - TankerWala* 🚛\n\n` +
        `Token: #${bill.billNumber}\n` +
        `Amt: ₹${bill.grandTotal}\n` +
        `Size: ${bill.tankerSize}\n` +
        `Driver: ${bill.driverName || 'N/A'}\n\n` +
        `Rebook: ${rebookUrl}\n\n` +
        `TankerWala Powered by Rajhans`
      : `*Duty Assignment - TankerWala Powered by Rajhans* 🚛\n\n` +
        `Hi ${bill.driverName},\n` +
        `New trip assigned to you.\n\n` +
        `*Token:* #${bill.billNumber}\n` +
        `*Customer:* ${bill.customerName}\n` +
        `*Address:* ${bill.customerAddress || 'N/A'}\n` +
        `*Tanker:* ${bill.tankerSize}\n\n` +
        `Please proceed for delivery.`;
    
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const printRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = async () => {
    if (printRef.current) {
      try {
        await printThermalReceipt(printRef.current);
      } catch (err: any) {
        console.warn("Direct Printing failed, falling back to PDF:", err?.message || String(err));
        try {
          const fileName = `Token_${editingBill?.billNumber || 'Order'}`;
          await generatePDF(printRef.current, fileName);
        } catch (pdfErr: any) {
          console.error("PDF Export Error:", pdfErr?.message || String(pdfErr));
          alert("Failed to print. Try opening the application in a new tab.");
        }
      }
    }
  };

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4 text-center">
        <div className="relative">
          <div className="absolute inset-0 animate-ping opacity-25">
            <Logo size={120} className="text-blue-600/20" />
          </div>
          <div className="relative animate-bounce">
            <Logo size={80} className="text-blue-600" />
          </div>
          <p className="text-slate-500 font-bold mt-8 uppercase tracking-[0.2em] text-[10px] animate-pulse">Loading TankerWala...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-0 pb-32">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
            <Droplets size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2 flex-wrap">
              Tanker<span className="text-blue-600">Wala</span>
              {currentFranchise?.name && (
                <span className="text-xs font-black bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-xl uppercase tracking-wider">
                  {currentFranchise.name}
                </span>
              )}
            </h1>
            <p className="text-slate-500 text-xs mt-1">Dashboard Overview • Powered by Rajhans</p>
          </div>
        </div>
        {stats.unsettledCount > 0 && (
          <div className="bg-orange-100 text-orange-600 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5 animate-pulse">
            <AlertCircle size={14} /> {stats.unsettledCount} Open
          </div>
        )}
        {pendingDieselRequests.length > 0 && (
          <div className="bg-red-100 text-red-600 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5 animate-bounce ml-2">
            <Fuel size={14} /> {pendingDieselRequests.length} Fuel Req
          </div>
        )}
      </header>


      {/* Interactive Sandbox Simulator Hub removed as requested */}


      {/* Critical Alerts for Admin */}
      <AnimatePresence>
        {pendingDieselRequests.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
             <div className="bg-red-50 border border-red-100 rounded-[2.5rem] p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-center md:text-left">
                   <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shrink-0 animate-pulse">
                      <Fuel size={24} />
                   </div>
                   <div>
                      <h3 className="font-bold text-red-900">Pending Fuel Approvals</h3>
                      <p className="text-sm text-red-600 font-medium">{pendingDieselRequests.length} refuel entries from drivers need your review.</p>
                   </div>
                </div>
                <button 
                  onClick={() => {
                    // This assumes we can trigger a tab change. 
                    // In the parent (App.tsx), we need to handle this.
                    // For now, prompt manually or provide a link if possible.
                    window.location.search = '?tab=tractors';
                  }}
                  className="bg-red-600 text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                >
                  Go to Approvals
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ y: -6, scale: 1.02 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="relative bg-white p-6 rounded-[2.5rem] text-slate-900 border-t border-x border-slate-100 border-b-[8px] border-b-slate-200/90 shadow-[0_20px_40px_rgba(34,197,94,0.08),inset_0_2px_4px_rgba(255,255,255,1)] hover:border-b-[4px] hover:translate-y-[4px] overflow-hidden group min-h-[200px]"
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #f4f6f8 100%)"
          }}
        >
          {/* Mirror Shine Effect */}
          <motion.div 
            animate={{ x: ['150%', '-150%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent skew-x-20 pointer-events-none z-20"
          />

          {/* Dynamic Hourly Cash Animation: Blowing Money */}
          <div className="absolute inset-0 pointer-events-none opacity-90 overflow-hidden">
            {(() => {
              const hour = new Date().getHours();
              const theme = hour % 4;
              
              if (theme === 0) {
                // Blowing 500/2000 notes style
                return [...Array(25)].map((_, i) => (
                  <motion.div
                    key={`v-wind-${i}`}
                    initial={{ x: -100, y: Math.random() * 250, rotateZ: Math.random() * 360, opacity: 0 }}
                    animate={{ x: 500, y: (Math.random() - 0.5) * 150 + (i * 8), rotateZ: [0, 360, 720], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1 + Math.random() * 1.5, repeat: Infinity, delay: Math.random() * 5, ease: "linear" }}
                    className="absolute"
                  >
                    <div className={`w-14 h-7 border-2 rounded-[2px] flex items-center justify-center shadow-lg ${i % 2 === 0 ? 'bg-pink-100 border-pink-200' : 'bg-green-100 border-green-200'}`}>
                      <div className={`text-[10px] font-black italic ${i % 2 === 0 ? 'text-pink-700' : 'text-green-700'}`}>₹{i % 2 === 0 ? '2000' : '500'}</div>
                    </div>
                  </motion.div>
                ));
              } else if (theme === 1) {
                // Falling Coins Rain
                return [...Array(20)].map((_, i) => (
                  <motion.div
                    key={`rain-${i}`}
                    initial={{ y: -50, x: Math.random() * 350, opacity: 0 }}
                    animate={{ y: 300, opacity: [0, 1, 1, 0], rotateY: 360 }}
                    transition={{ duration: 1.5 + Math.random() * 1, repeat: Infinity, delay: Math.random() * 4 }}
                    className="absolute w-6 h-6 bg-yellow-400 rounded-full border-2 border-yellow-500 flex items-center justify-center shadow-md shadow-yellow-900/20"
                  >
                    <Coins size={12} className="text-yellow-700" />
                  </motion.div>
                ));
              } else if (theme === 2) {
                // Floating Bill Bundles
                return [...Array(12)].map((_, i) => (
                  <motion.div
                    key={`bubble-${i}`}
                    initial={{ scale: 0, x: Math.random() * 300, y: 220, opacity: 0 }}
                    animate={{ scale: [1, 1.2, 1], y: -50, x: (Math.random() * 300) + Math.sin(i) * 50, opacity: [0, 0.8, 0] }}
                    transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 5 }}
                    className="absolute w-12 h-6 bg-green-500/10 border border-green-500/20 rounded shadow-sm backdrop-blur-[1px] flex items-center justify-center"
                  >
                    <Banknote size={14} className="text-green-600/30" />
                  </motion.div>
                ));
              } else {
                // Fast Blowing Dollars (User's specific request)
                return [...Array(30)].map((_, i) => (
                  <motion.div
                    key={`dollar-fast-${i}`}
                    initial={{ x: -100, y: Math.random() * 250, rotateZ: Math.random() * 360, scale: 0.5, opacity: 0 }}
                    animate={{ x: 500, y: (Math.random() - 0.5) * 100 + (i * 6), rotateX: [0, 720], rotateZ: [0, 1080], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 0.5 + Math.random() * 0.5, repeat: Infinity, delay: Math.random() * 3, ease: "linear" }}
                    className="absolute"
                  >
                    <div className="w-12 h-6 bg-green-100 border border-green-300 rounded-[1px] flex items-center justify-center shadow-sm">
                      <span className="text-xs font-black text-green-700">$</span>
                    </div>
                  </motion.div>
                ));
              }
            })()}
          </div>

          <div className="relative z-10">
            <div className="bg-slate-900/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 border border-white/40 shadow-inner">
              <Banknote size={24} className="text-slate-800" />
            </div>
            <div className="flex items-center gap-3 mb-1 justify-between">
              <div className="text-[11px] uppercase font-black tracking-widest text-slate-500">Cash in Hand</div>
              <div className="flex gap-2 relative z-30">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickVoucher({ type: 'Receipt', paymentMethod: 'Cash' });
                  }}
                  className="w-8 h-8 rounded-xl bg-green-600 text-white shadow-lg shadow-green-100 flex items-center justify-center hover:bg-green-700 transition-all active:scale-90"
                >
                  <Plus size={18} />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickVoucher({ type: 'Payment', paymentMethod: 'Cash' });
                  }}
                  className="w-8 h-8 rounded-xl bg-red-600 text-white shadow-lg shadow-red-100 flex items-center justify-center hover:bg-red-700 transition-all active:scale-90"
                >
                  <Minus size={18} />
                </button>
              </div>
            </div>
            <div className="text-4xl font-display font-black text-slate-900 tracking-tight flex items-baseline">
              <span className="text-2xl mr-1 text-slate-400">₹</span>
              {Number(stats.cashBalance).toLocaleString()}
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ y: -6, scale: 1.02 }}
          transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
          onClick={() => setActiveTab('customers')}
          className="relative bg-white p-6 rounded-[2.5rem] border-t border-x border-orange-50 border-b-[8px] border-b-orange-200/60 shadow-[0_20px_40px_rgba(249,115,22,0.06),inset_0_2px_4px_rgba(255,255,255,1)] hover:border-b-[4px] hover:translate-y-[4px] overflow-hidden group min-h-[200px] cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #fffbf7 100%)"
          }}
        >
          {/* Digits Eating Animation Layer */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-10">
             <motion.div 
               animate={{ 
                 x: eatingState === 'walking' ? [-100, 150] : 150,
                 y: eatingState === 'idle' ? [200, 500] : 50,
                 scale: eatingState === 'eating' ? [1, 1.2, 1] : 1
               }}
               className="absolute"
             >
               <Users size={120} />
             </motion.div>
          </div>

          <div className="relative z-10">
            <div className="bg-orange-50 text-orange-600 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <Users size={24} />
            </div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] uppercase font-black tracking-widest text-slate-400">Total Pending (Ledger)</div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickVoucher({ type: 'Receipt', paymentMethod: 'Cash', customerId: 'ALL_CUSTOMERS' }); 
                }}
                className="w-10 h-10 rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-100 flex items-center justify-center hover:bg-orange-700 transition-all"
              >
                <Plus size={20} />
              </button>
            </div>
            <div className="text-4xl font-display font-black text-slate-900 tracking-tight flex items-baseline">
              <span className="text-2xl mr-1 text-orange-400">₹</span>
              <div className="flex">
                {Math.floor(stats.totalPending).toString().split('').map((digit, i) => (
                  <motion.span
                    key={i}
                    animate={removedDigits.includes(i) ? { 
                      y: -100, 
                      opacity: 0, 
                      scale: 0,
                      rotate: 45 
                    } : { y: 0, opacity: 1, scale: 1 }}
                    className="inline-block"
                  >
                    {digit}
                  </motion.span>
                ))}
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Updates direct to ledger accounts</p>
          </div>
        </motion.div>

        {franchiseId && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -6, scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
            className="relative bg-white p-6 rounded-[2.5rem] border-t border-x border-blue-50 border-b-[8px] border-b-blue-200/60 shadow-[0_20px_40px_rgba(59,130,246,0.06),inset_0_2px_4px_rgba(255,255,255,1)] hover:border-b-[4px] hover:translate-y-[4px] overflow-hidden group min-h-[200px]"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #f7faff 100%)"
            }}
          >
            <div className="absolute inset-0 pointer-events-none opacity-5">
              <div className="absolute -right-4 -bottom-4 animate-spin-slow">
                <RefreshCw size={150} />
              </div>
            </div>
            <div className="relative z-10">
              <div className="bg-blue-50 text-blue-600 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                <Coins size={24} />
              </div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] uppercase font-black tracking-widest text-slate-400">Franchise commission</div>
                <div className="bg-blue-100 text-blue-600 px-2 py-1 rounded-lg text-[9px] font-black uppercase">
                  {commissionPercentage}% Tier
                </div>
              </div>
              <div className="text-4xl font-display font-black text-slate-900 tracking-tight flex items-baseline">
                <span className="text-2xl mr-1 text-blue-400">₹</span>
                {Math.floor(stats.commissionTotal).toLocaleString()}
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Estimated earnings from delivered trips</p>
            </div>
          </motion.div>
        )}

        {/* Consolidated Bank Card */}
        {(() => {
          const firstAvailableBankAcc = accounts.find(a => a.name === 'BARODA129') 
            || accounts.find(a => a.name === 'Bank Account') 
            || accounts.find(a => a.name === 'BARODA934')
            || accounts.find(a => a.name.toLowerCase().includes('bank'));
          const defaultBankAccName = firstAvailableBankAcc ? firstAvailableBankAcc.name : 'Bank Account';
          
          const baroda129Bal = accounts.find(a => a.name === 'BARODA129')?.currentBalance || 0;
          const baroda934Bal = accounts.find(a => a.name === 'BARODA934')?.currentBalance || 0;
          const generalBankBal = accounts.find(a => a.name === 'Bank Account')?.currentBalance || 0;
          const totalBankBalance = baroda129Bal + baroda934Bal + generalBankBal;

          return (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -6, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
              className="bg-white p-6 rounded-[2.5rem] border-t border-x border-indigo-50 border-b-[8px] border-b-indigo-200/50 shadow-[0_20px_40px_rgba(99,102,241,0.06),inset_0_2px_4px_rgba(255,255,255,1)] hover:border-b-[4px] hover:translate-y-[4px] overflow-hidden min-h-[180px] relative"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #fbfbfe 100%)"
              }}
            >
              <div className="absolute inset-0 pointer-events-none opacity-[0.05] overflow-hidden">
                 {(() => {
                   const hour = new Date().getHours();
                   const theme = hour % 3;
                   if (theme === 0) {
                     return [...Array(15)].map((_, i) => (
                       <motion.div
                         key={`bank1-dots-${i}`}
                         initial={{ scale: 0, opacity: 0 }}
                         animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
                         transition={{ duration: 2, repeat: Infinity, delay: Math.random() * 5 }}
                         className="absolute w-2 h-2 bg-blue-600 rounded-full"
                         style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
                       />
                     ));
                   } else if (theme === 1) {
                     return [...Array(10)].map((_, i) => (
                       <motion.div
                         key={`bank1-rings-${i}`}
                         initial={{ scale: 0.5, opacity: 0.8 }}
                         animate={{ scale: 3, opacity: 0 }}
                         transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                         className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-blue-400 rounded-full"
                       />
                     ));
                   } else {
                     return [...Array(12)].map((_, i) => (
                       <motion.div
                         key={`bank1-bars-${i}`}
                         initial={{ height: 0 }}
                         animate={{ height: [10, 40, 10] }}
                         transition={{ duration: 1, repeat: Infinity, delay: Math.random() }}
                         className="absolute bottom-0 w-2 bg-blue-400/40 rounded-t"
                         style={{ left: `${i * 8 + 5}%` }}
                       />
                     ));
                   }
                 })()}
              </div>

              <div className="relative z-10">
                <div className="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-blue-100">
                  <Smartphone size={20} />
                </div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Consolidated Bank Account</div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setQuickVoucher({ type: 'Receipt', paymentMethod: 'Bank', targetAccountName: defaultBankAccName })}
                      className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                    >
                      <Plus size={16} />
                    </button>
                    <button 
                      onClick={() => setQuickVoucher({ type: 'Payment', paymentMethod: 'Bank', targetAccountName: defaultBankAccName })}
                      className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm"
                    >
                      <Minus size={16} />
                    </button>
                  </div>
                </div>
                <div className="text-3xl font-display font-black text-slate-900 flex items-baseline">
                  <span className="text-xl mr-1 text-blue-600">₹</span>
                  {formatCurrency(totalBankBalance).replace('₹', '')}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </div>

      {/* Automation Desk */}
      <div className="mb-8 p-6 bg-slate-900 rounded-[2.5rem] text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-10 scale-[2] pointer-events-none">
          <Droplets size={48} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Automation Desk</span>
          </div>
          <h3 className="text-xl font-display font-bold mb-6">Smart Business Insights</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Auto-Accounting Status */}
            <div className="bg-white/5 border border-white/10 p-5 rounded-3xl backdrop-blur-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-bold">Auto-Ledger Active</div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Billing & Sync</div>
                  </div>
                </div>
                <div className="text-xs text-slate-400 leading-relaxed">
                  Tokens are automatically posted to accounting ledger in real-time. No manual entry needed for sales.
                </div>
              </div>
            </div>

             {/* Daily Tanker Dispatches Card */}
             <div className="bg-white/5 border border-white/10 p-5 rounded-3xl backdrop-blur-sm flex flex-col justify-between relative overflow-hidden group">
               <div className="absolute -right-4 -bottom-4 opacity-5 text-sky-500 group-hover:scale-110 transition-transform">
                 <Truck size={80} />
               </div>
               <div className="relative z-10">
                 <div className="flex items-center gap-3 mb-3">
                   <div className="w-10 h-10 bg-sky-500/20 text-sky-450 rounded-xl flex items-center justify-center">
                     <Truck size={20} className="text-sky-400" />
                   </div>
                   <div>
                     <div className="text-xs text-slate-400 uppercase font-bold tracking-widest">Tanker Trips</div>
                     <div className="text-sm font-bold">Dispatch Stats</div>
                   </div>
                 </div>
                 <div className="space-y-2 mt-4">
                   <div className="flex items-baseline justify-between">
                     <span className="text-xs text-slate-400">Today:</span>
                     <span className="text-lg font-black text-sky-400">
                       {stats.todayTankerTrips} {stats.todayTankerTrips === 1 ? 'Trip' : 'Trips'}
                     </span>
                   </div>
                   <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
                     <span className="text-xs text-slate-400">This Month (MTD):</span>
                     <span className="text-lg font-black text-white">
                       {stats.monthTankerTrips} {stats.monthTankerTrips === 1 ? 'Trip' : 'Trips'}
                     </span>
                   </div>
                 </div>
               </div>
             </div>

            {/* Rebooking Suggestion */}
            {(() => {
              const suggestions = customers
                .filter(c => c.pendingAmount === 0)
                .slice(0, 1);
              
              if (suggestions.length === 0) return null;
              
              return suggestions.map(c => (
                <div key={c.id} className="bg-white/5 border border-white/10 p-5 rounded-3xl backdrop-blur-sm border-l-orange-500 border-l-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-orange-500/20 text-orange-400 rounded-xl flex items-center justify-center">
                        <BellRing size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-bold">High Likelihood Rebook</div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Insight</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 leading-relaxed mb-3">
                      <span className="text-white font-bold">{c.name}</span> hasn't ordered in 5 days. Usually orders every 3 days.
                    </div>
                  </div>
                  <button 
                    onClick={() => window.open(`https://wa.me/91${c.mobile}?text=${encodeURIComponent(`Hi ${c.name}, hope you're doing well! Need a water tanker refilled? - TankerWala Powered by Rajhans`)}`, '_blank')}
                    className="w-full py-2 bg-orange-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-700 transition-all mt-3"
                  >
                    Send Friendly Nudge
                  </button>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

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
        <div 
          onClick={() => setActiveTab('customers')}
          className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-50 shadow-sm cursor-pointer hover:border-purple-200 transition-all active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Users size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Customers</div>
            <div className="font-bold text-slate-800">{stats.customerCount}</div>
          </div>
        </div>
      </div>

      {/* QR Code & Custom Thermal Print Settings Panel */}
      {!hidePrintPanel && (
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100 shrink-0">
                <QrCode size={30} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 leading-tight">QR Codes & Receipt Setup</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Customer Booking QR & Thermal Print Settings</p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('hideDashboardPrintSettings', 'true');
                setHidePrintPanel(true);
                window.dispatchEvent(new Event('storage'));
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-colors border border-slate-200"
            >
              Not Now
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Card 1: Unique Customer Booking QR Banner (Advertisement) */}
            <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/60">
                  <span className="font-bold text-slate-800 text-md">Customer Booking QR Poster</span>
                  <span className="bg-blue-100 text-blue-700 text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-full">For Pamphlets & Banners</span>
                </div>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Generate and print promotional water booking banners & flyers. Customers can scan the QR code using their mobile camera to open their dynamic TankerWala booking portal.
                </p>
                
                {/* Dynamic QR Display Mockup Card */}
                <div className="flex flex-col items-center bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm max-w-sm mx-auto mb-6">
                  <Logo size={48} className="mb-1" />
                  <h3 className="text-lg font-bold uppercase text-blue-600 font-display">TankerWala</h3>
                  <span className="text-[7.5px] font-bold tracking-widest text-slate-400 uppercase leading-none pb-3 border-b border-slate-100 w-full text-center">Powered by Rajhans</span>
                  
                  <h4 className="text-sm font-extrabold text-slate-800 mt-3 mb-1">Book Water Tanker Online Instantly</h4>
                  <p className="text-[10px] text-slate-400 font-medium mb-4">Book Water Tanker Instantly From Home</p>
                  
                  <div className="p-3 bg-white border-2 border-slate-950 rounded-xl shadow-inner mb-3">
                    <QRCodeSVG 
                      id="advertisement-qr-svg"
                      value={`${getPublicAppUrl().toString()}?mode=booking&f=${franchiseDetail?.id || franchiseId || currentFranchise?.id || ''}`}
                      size={140}
                      level="H"
                      includeMargin={false}
                    />
                  </div>
                  
                  <p className="text-[9.5px] text-slate-500 font-bold leading-none text-center">Scan to order on TankerWala</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    const bookingUrl = `${getPublicAppUrl().toString()}?mode=booking&f=${franchiseDetail?.id || franchiseId || currentFranchise?.id || ''}`;
                    copyToClipboard(bookingUrl);
                    alert("Booking link copied successfully!");
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-xs transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  Copy Web Link
                </button>
                <button
                  type="button"
                  onClick={handlePrintBookingPoster}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-xs transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-blue-100"
                >
                  <Printer size={14} /> Print Banner
                </button>
              </div>

              {/* In-app dismissal action explicitly described */}
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('hideDashboardPrintSettings', 'true');
                  setHidePrintPanel(true);
                  window.dispatchEvent(new Event('storage'));
                }}
                className="mt-4 text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest text-center underline decoration-dotted decoration-slate-300"
              >
                🙅‍♂️ Not Now (Hide from dashboard)
              </button>
            </div>

            {/* Card 2: Custom Thermal Receipts Customization */}
            <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/60">
                  <span className="font-bold text-slate-800 text-md">Receipt Settings & Banking UPI QR</span>
                  <span className="bg-emerald-100 text-emerald-700 text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-full">Thermal receipt settings</span>
                </div>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Set customized contact support numbers, printer header names, and payment VPA address to receive scan-to-pay orders directly in printed papers.
                </p>

                {/* Form Inputs */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Printed Receipt Headline Name</label>
                    <input
                      type="text"
                      value={editPrintName}
                      onChange={(e) => setEditPrintName(e.target.value)}
                      placeholder={franchiseDetail?.name || 'TankerWala Sikar'}
                      className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Print Mobile Number</label>
                    <input
                      type="text"
                      value={editPrintMobile}
                      onChange={(e) => setEditPrintMobile(e.target.value)}
                      placeholder={franchiseDetail?.operatorMobile || '94133 39987'}
                      className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Print Business Address</label>
                    <textarea
                      rows={2}
                      value={editPrintAddress}
                      onChange={(e) => setEditPrintAddress(e.target.value)}
                      placeholder="Behind balaji dharm kanta, near puniya wines..."
                      className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Payment VPA UPI ID for Scan-to-Pay QR</label>
                    <input
                      type="text"
                      value={editUpiId}
                      onChange={(e) => setEditUpiId(e.target.value)}
                      placeholder="rajha94133@barodampay"
                      className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between gap-4">
                {/* Mini Payment UPI QR Live Preview */}
                <div className="flex items-center gap-3">
                  <div className="p-1 px-1.5 bg-white border border-slate-200 rounded-lg">
                    <QRCodeSVG 
                      value={`upi://pay?pa=${editUpiId || 'rajha94133@barodampay'}&pn=${encodeURIComponent(editPrintName || 'TankerWala')}&cu=INR`}
                      size={40}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase">UPI Live Preview</p>
                    <p className="text-[11px] font-mono text-slate-600 truncate max-w-[120px]">{editUpiId || 'rajha94133@barodampay'}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveFranchiseSettings}
                  disabled={isSavingFranchise}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all shadow-md shadow-emerald-100 flex items-center gap-2"
                >
                  {isSavingFranchise ? 'Saving...' : saveFranchiseSuccess ? '✓ Saved!' : 'Save Settings'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Quick Receipt Modal Check */}
      <AnimatePresence>
        {showInsuranceAlert && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-12 opacity-[0.03] scale-[3] pointer-events-none">
                <ShieldCheck size={48} />
              </div>
              
              <div className="text-center mb-8 relative">
                <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-100">
                  <BellRing size={40} className="animate-bounce" />
                </div>
                <h2 className="text-3xl font-display font-black text-slate-900 leading-tight">Insurance Renewal!</h2>
                <p className="text-slate-500 font-medium mt-2">Renew tractor insurance to stay safe</p>
              </div>

              <div className="space-y-4 max-h-[300px] overflow-y-auto mb-8 pr-2">
                {insuranceAlerts.map(t => {
                  const daysLeft = differenceInDays(new Date(t.insuranceExpiry), new Date());
                  return (
                    <div key={t.id} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400">
                          <Truck size={20} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{t.name}</div>
                          <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{t.vehicleNumber}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-black ${daysLeft <= 3 ? 'text-red-500' : 'text-orange-500'}`}>
                          {daysLeft === 0 ? 'Expires Today!' : `${daysLeft} Days Left`}
                        </div>
                        <div className="text-[9px] text-slate-400 font-bold">{new Date(t.insuranceExpiry).toLocaleDateString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={() => setShowInsuranceAlert(false)}
                className="w-full h-16 bg-slate-900 text-white rounded-2xl font-display font-black text-lg shadow-xl shadow-slate-200 active:scale-95 transition-all"
              >
                Okay, I'll Check
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Booking Requests */}
      <AnimatePresence>
        {bookingRequests.length > 0 && (
          <div className="mb-8 space-y-3">
            <h3 className="font-display font-bold text-lg flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              Rebooking Requests
            </h3>
            {bookingRequests.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center">
                    <RefreshCw size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{req.customerName}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Request for {req.tankerSize} Tanker
                    </div>
                    {req.remarks && (
                      <div className="mt-1 text-[11px] text-orange-600 bg-orange-50 px-2 py-1 rounded-lg border border-orange-100 flex items-start gap-1">
                        <MessageSquare size={10} className="mt-0.5" />
                        <span className="italic">"{req.remarks}"</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRejectRequest(req)}
                    className="px-4 py-2 bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl text-xs font-bold transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleAcceptRequest(req)}
                    disabled={isAcceptingRequest === req.id}
                    className={`px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2 ${isAcceptingRequest === req.id ? 'opacity-50' : ''}`}
                  >
                    {isAcceptingRequest === req.id ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )} 
                    {isAcceptingRequest === req.id ? 'Accepting...' : 'Accept'}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Feedbacks */}
      {feedbacks.length > 0 && (
        <div className="mb-8 space-y-3">
          <h3 className="font-display font-bold text-lg flex items-center gap-2 px-2">
            <MessageSquare size={20} className="text-yellow-500" />
            Recent Customer Feedback
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {feedbacks.slice(0, 6).map((fb) => (
              <div key={fb.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                   <div>
                     <div className="font-bold text-slate-900">{fb.customerName}</div>
                     <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Bill #{fb.billNumber}</div>
                   </div>
                   <div className="flex items-center gap-0.5 text-yellow-400">
                     {[...Array(5)].map((_, i) => (
                       <Star key={i} size={14} className={i < (fb.rating || 5) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'} />
                     ))}
                   </div>
                </div>
                {fb.comment && (
                  <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-2 rounded-lg italic">
                    "{fb.comment}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Tokens */}
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-display font-bold text-lg">Recent Bills</h3>
            <button 
              onClick={async (e) => {
                e.stopPropagation();
                const urlObj = getPublicAppUrl();
                urlObj.search = '';
                urlObj.searchParams.set('mode', 'booking');
                const url = urlObj.toString();
                
                if (navigator.share) {
                  navigator.share({
                    title: 'Book a Tanker',
                    text: 'Book your water tanker now from TankerWala Powered by Rajhans',
                    url: url
                  });
                } else {
                  await copyToClipboard(url);
                  alert('Booking Link Copied!');
                }
              }}
              className="group flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all shadow-sm"
              title="Share Booking Portal Link"
            >
              <Share2 size={12} className="group-hover:scale-110 transition-transform" /> Share Booking Link
            </button>
          </div>
          
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setTokenFilter('Today')}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                tokenFilter === 'Today' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTokenFilter('Yesterday')}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                tokenFilter === 'Yesterday' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setTokenFilter('Custom')}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                tokenFilter === 'Custom' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Date
            </button>
          </div>
        </div>

        {tokenFilter === 'Custom' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center gap-2"
          >
            <Calendar size={14} className="text-blue-600" />
            <input
              type="date"
              value={selectedTokenDate}
              onChange={(e) => setSelectedTokenDate(e.target.value)}
              className="bg-white border-2 border-slate-50 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
            />
          </motion.div>
        )}

        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {filteredTokenBills.length === 0 && (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12 text-slate-400 bg-white rounded-[2.5rem] border border-dashed border-slate-200 text-[10px] uppercase font-bold tracking-[0.2em]"
              >
                No trips found for this {tokenFilter === 'Custom' ? 'date' : 'period'}
              </motion.div>
            )}
            {filteredTokenBills.map(bill => (
              <motion.div 
                key={bill.id} 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ 
                  opacity: 0, 
                  scale: 1.15, 
                  x: 40, 
                  y: -60, 
                  rotate: 6,
                  skewX: 12,
                  filter: 'blur(30px) grayscale(100%) sepia(30%) brightness(1.3)',
                  transition: { 
                    duration: 2, 
                    ease: [0.4, 0, 1, 1], // accelerated ease in
                    opacity: { duration: 1.2 }
                  }
                }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setEditingBill(bill)}
                className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-50 shadow-sm relative overflow-hidden text-left cursor-pointer hover:border-slate-200 transition-all duration-200"
              >
              <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                bill.status === 'Cancelled' 
                  ? 'bg-slate-300' 
                  : bill.category === 'MONTHLY_CAN'
                  ? 'bg-purple-600'
                  : bill.category === 'CAN'
                  ? 'bg-amber-500'
                  : bill.category === 'BOTTLE'
                  ? 'bg-emerald-500'
                  : 'bg-sky-500'
              }`} />
              
              {!bill.isSettled && bill.status !== 'Cancelled' && (
                <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" title="Unsettled Payment" />
              )}

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  bill.status === 'Cancelled' 
                    ? 'bg-red-50 text-red-500' 
                    : bill.category === 'MONTHLY_CAN'
                    ? 'bg-purple-50 text-purple-600 ring-2 ring-purple-100'
                    : bill.category === 'CAN'
                    ? 'bg-orange-50 text-orange-600'
                    : bill.category === 'BOTTLE'
                    ? 'bg-green-50 text-green-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {(bill.category === 'CAN' || bill.category === 'MONTHLY_CAN') ? (
                    <Flask size={18} />
                  ) : bill.category === 'BOTTLE' ? (
                    <Package size={18} />
                  ) : (
                    <Truck size={18} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {bill.customerName}
                    </span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      bill.status === 'Cancelled'
                        ? 'bg-slate-100 text-slate-500'
                        : bill.category === 'MONTHLY_CAN'
                        ? 'bg-purple-100 text-purple-700 border border-purple-200'
                        : bill.category === 'CAN'
                        ? 'bg-amber-100 text-amber-700 border border-amber-200'
                        : bill.category === 'BOTTLE'
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        : 'bg-sky-100 text-sky-700 border border-sky-200'
                    }`}>
                      {bill.category === 'MONTHLY_CAN' ? '🔄 Pass' :
                       bill.category === 'CAN' ? '🏺 Can' :
                       bill.category === 'BOTTLE' ? '📦 Packaged' : '🚛 Tanker'}
                      {bill.category === 'BOTTLE' ? '' : bill.tankerSize ? ` • ${bill.tankerSize}` : ''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium leading-none">
                      <MapPin size={10} className="text-slate-400 shrink-0" />
                      <span className="truncate">{bill.customerAddress || 'No Address'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-400 font-medium">
                        {bill.createdAt?.toDate ? format(bill.createdAt.toDate(), 'dd MMM, hh:mm a') : format(new Date(bill.date), 'dd MMM, hh:mm a')}
                      </span>
                      {(bill.tractorId || bill.driverName) && (
                        <div className="flex items-center gap-1.5 ml-1">
                          <span className="w-1 h-1 rounded-full bg-slate-200" />
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                            {tractors.find(t => t.id === bill.tractorId)?.name || 'N/A'} • {bill.driverName || 'N/A'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {bill.remarks && (
                    <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 flex items-start gap-1 max-w-[250px]">
                      <MessageSquare size={10} className="mt-0.5 text-slate-400 flex-shrink-0" />
                      <span className="italic truncate">{bill.remarks}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-bold text-sm">{formatCurrency(bill.grandTotal)}</div>
                  <div className={`text-[10px] font-bold uppercase flex items-center gap-1 justify-end ${
                    bill.status === 'Delivered' ? 'text-green-500' : 
                    bill.status === 'Cancelled' ? 'text-red-500' : 
                    bill.status === 'Printed' ? 'text-slate-400 italic' : 'text-orange-500'
                  }`}>
                    {bill.status === 'Delivered' && (
                      <span className="bg-slate-100 text-slate-500 px-1 rounded lowercase font-medium border border-slate-200">
                        {bill.paymentMode === 'Pending' ? 'credit' : bill.paymentMode}
                      </span>
                    )}
                    {bill.status === 'Printed' ? 'Ready' : bill.status}
                  </div>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    sendWhatsApp(bill, 'customer');
                  }}
                  className="w-8 h-8 bg-green-50 text-green-600 rounded-full flex items-center justify-center hover:bg-green-600 hover:text-white transition-all shadow-sm flex-shrink-0"
                >
                  <MessageSquare size={16} />
                </button>
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Trip Board */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-lg">Trip Board</h3>
          <div className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold uppercase tracking-wider">
            Live Rankings
          </div>
        </div>
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          {stats.driverStats.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm italic">
              No completed trips recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {stats.driverStats.map((driver: any, index: number) => (
                <div key={driver.name} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm ${
                      index === 0 ? 'bg-yellow-100 text-yellow-600' :
                      index === 1 ? 'bg-slate-100 text-slate-500' :
                      index === 2 ? 'bg-orange-100 text-orange-600' :
                      'bg-slate-50 text-slate-400'
                    }`}>
                      #{index + 1}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{driver.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Truck size={10} className="text-blue-600" />
                        <span className="text-[10px] font-bold text-blue-600 uppercase">
                          {driver.mostUsedTractor}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-display font-black text-slate-900">
                      {driver.tripCount}
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                      Trips Done
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                <p className="text-slate-500 font-medium">Token: #{editingBill.billNumber}</p>
                <div className="mt-4 text-3xl font-display font-black text-slate-900">
                  {formatCurrency(editingBill.grandTotal)}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 relative">
                <button 
                  onClick={() => handleSettleOrder('Cash')}
                  disabled={isSettling !== null}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all group overflow-hidden relative ${
                    isSettling === 'Cash' ? 'border-green-600 bg-green-50' : 
                    isSettling === 'DONE' ? 'opacity-50 border-slate-100' : 'border-slate-100 hover:border-slate-900'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isSettling === 'Cash' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white'
                  }`}>
                    <Banknote size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">Cash Received</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Deposited to Cash Account</div>
                  </div>
                  {isSettling === 'Cash' && (
                    <div className="absolute inset-0 bg-green-600/5 flex items-center justify-center">
                      <div className="animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full" />
                    </div>
                  )}
                </button>

                <button 
                  onClick={() => handleSettleOrder('UPI')}
                  disabled={isSettling !== null}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all group overflow-hidden relative ${
                    isSettling === 'UPI' ? 'border-blue-600 bg-blue-50' : 
                    isSettling === 'DONE' ? 'opacity-50 border-slate-100' : 'border-slate-100 hover:border-slate-900'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isSettling === 'UPI' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'
                  }`}>
                    <Smartphone size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">UPI / Bank Transfer</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Deposited to Bank Account</div>
                  </div>
                  {isSettling === 'UPI' && (
                    <div className="absolute inset-0 bg-blue-600/5 flex items-center justify-center">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                    </div>
                  )}
                </button>

                <button 
                  onClick={() => handleSettleOrder('Credit')}
                  disabled={isSettling !== null}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all group overflow-hidden relative ${
                    isSettling === 'Credit' ? 'border-orange-600 bg-orange-50' : 
                    isSettling === 'DONE' ? 'opacity-50 border-slate-100' : 'border-slate-100 hover:border-slate-900'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isSettling === 'Credit' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white'
                  }`}>
                    <History size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">Credit (Udhaar)</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Added to Customer Due Account</div>
                  </div>
                  {isSettling === 'Credit' && (
                    <div className="absolute inset-0 bg-orange-600/5 flex items-center justify-center">
                      <div className="animate-spin h-5 w-5 border-2 border-orange-600 border-t-transparent rounded-full" />
                    </div>
                  )}
                </button>

                {isSettling === 'DONE' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-50 rounded-[2rem] border-4 border-green-500 shadow-2xl shadow-green-100"
                  >
                    <motion.div 
                      initial={{ scale: 0, rotate: -20 }} 
                      animate={{ scale: 1, rotate: 0 }} 
                      transition={{ 
                        type: 'spring', 
                        bounce: 0.5, 
                        duration: 0.5 
                      }}
                      className="text-green-600"
                    >
                      <Logo size={80} />
                    </motion.div>
                    <div className="flex flex-col items-center">
                      <span className="font-display font-black text-2xl text-green-600 uppercase tracking-widest">Done!</span>
                      <div className="w-12 h-1 bg-green-500 mt-1 rounded-full animate-width-expand" />
                    </div>
                  </motion.div>
                )}
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
                <div className="flex gap-2">
                  <button 
                    onClick={() => editingBill && setDeleteConfirm({ id: editingBill.id, number: editingBill.billNumber })}
                    className="w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-100 transition-colors"
                    title="Delete Bill"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button 
                    onClick={() => setEditingBill(null)}
                    className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center"
                  >
                    <AlertCircle size={20} className="rotate-45" />
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {/* Workflow Management and Payment Finalization */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Workflow Management</label>
                  
                  {editingBill.status === 'Delivered' && !editingBill.isSettled ? (
                    <div className="bg-green-50 border-2 border-green-200 rounded-[2rem] p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-white">
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-green-900 leading-tight">Trip Delivered</h4>
                          <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider">Finalize Payment - Bill #{editingBill.billNumber}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <button 
                          onClick={() => handleSettleOrder('Cash')}
                          disabled={isSettling !== null}
                          className="flex flex-col items-center justify-center gap-1 py-4 bg-white text-slate-700 rounded-2xl font-bold border-2 border-slate-100 hover:border-green-500 hover:text-green-600 transition-all shadow-sm"
                        >
                          <Coins size={20} />
                          <span className="text-[10px] uppercase">Cash</span>
                        </button>
                        <button 
                          onClick={() => handleSettleOrder('UPI')}
                          disabled={isSettling !== null}
                          className="flex flex-col items-center justify-center gap-1 py-4 bg-white text-slate-700 rounded-2xl font-bold border-2 border-slate-100 hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm"
                        >
                          <Smartphone size={20} />
                          <span className="text-[10px] uppercase">UPI</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => handleSettleOrder('Bank')}
                          disabled={isSettling !== null}
                          className="flex flex-col items-center justify-center gap-1 py-4 bg-white text-slate-700 rounded-2xl font-bold border-2 border-slate-100 hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                        >
                          <Banknote size={20} />
                          <span className="text-[10px] uppercase">Bank / TB</span>
                        </button>
                        <button 
                          onClick={() => handleSettleOrder('Credit')}
                          disabled={isSettling !== null}
                          className="flex flex-col items-center justify-center gap-1 py-4 bg-white text-slate-700 rounded-2xl font-bold border-2 border-slate-100 hover:border-orange-500 hover:text-orange-600 transition-all shadow-sm"
                        >
                          <Plus size={20} />
                          <span className="text-[10px] uppercase">Udhaar</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-4 gap-2">
                      <button 
                        onClick={() => handleStatusUpdate('Delivered')}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${editingBill.status === 'Delivered' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-100 text-slate-500'}`}
                      >
                        <CheckCircle2 size={24} />
                        <span className="text-[10px] font-bold">Delivered</span>
                      </button>
                      <button 
                        onClick={() => handleStatusUpdate('Filling')}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${editingBill.status === 'Filling' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}
                      >
                        <Truck size={24} />
                        <span className="text-[10px] font-bold">Filling</span>
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

                      {(!editingBill.driverId || !editingBill.tractorId) && (
                        <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-center animate-pulse">
                          <p className="text-[11px] font-black uppercase tracking-wider text-red-600">
                            ⚠️ First select driver and tractor then click Delivered
                          </p>
                          <p className="text-[9px] text-red-400 font-extrabold mt-0.5">
                            (पहले ड्राइवर और ट्रैक्टर चुनें, उसके बाद ही Delivered चुनें)
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Show payment status but not editable here */}
                {editingBill.status === 'Delivered' && (
                  <div className="space-y-3">
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

                    {editingBill.paymentMode === 'Pending' && (
                      <div className="grid grid-cols-2 gap-2 relative">
                        <button 
                          onClick={() => handlePaymentUpdate('Cash')}
                          disabled={isSettling !== null}
                          className="flex items-center justify-center gap-2 py-3 bg-green-50 text-green-600 rounded-xl font-bold border border-green-100 hover:bg-green-600 hover:text-white transition-all disabled:opacity-50"
                        >
                          <Banknote size={16} /> Cash
                        </button>
                        <button 
                          onClick={() => handlePaymentUpdate('UPI')}
                          disabled={isSettling !== null}
                          className="flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold border border-blue-100 hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50"
                        >
                          <Smartphone size={16} /> UPI
                        </button>

                        {isSettling === 'DONE' && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            className="absolute inset-0 bg-white flex items-center justify-center gap-2 z-50 rounded-xl border-2 border-green-500"
                          >
                            <CheckCircle2 size={20} className="text-green-500" />
                            <span className="font-bold text-green-600">Done!</span>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Driver Assignment */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Assign Driver</label>
                  <div className="flex flex-wrap gap-2">
                    {stats.drivers.map(d => {
                      const isBusy = stats.busyDrivers.has(d.id);
                      const isSelected = editingBill.driverName === d.name;
                      return (
                        <button 
                          key={d.id}
                          onClick={() => {
                            if (isBusy && !isSelected) {
                               alert('Driver Busy: Currently on an active trip.');
                               return;
                            }
                            handleDriverUpdate(d);
                          }}
                          className={`relative px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                            isSelected 
                              ? 'border-blue-500 bg-blue-50 text-blue-700' 
                              : isBusy 
                                ? 'border-amber-100 bg-amber-50 text-amber-600 opacity-60' 
                                : 'border-slate-100 text-slate-500 hover:border-blue-200'
                          }`}
                        >
                          {d.name}
                          {isBusy && !isSelected && (
                            <span className="absolute -top-2 -right-1 bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">BUSY</span>
                          )}
                        </button>
                      );
                    })}
                    {stats.drivers.length === 0 && (
                      <div className="text-xs text-slate-400 italic">No drivers found. Add in settings.</div>
                    )}
                  </div>
                </div>

                {/* Tractor Assignment */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Assign Tractor</label>
                  <div className="flex flex-wrap gap-2">
                    {stats.tractors.map(t => {
                      const isBusy = stats.busyTractors.has(t.id);
                      const isSelected = editingBill.tractorId === t.id;
                      return (
                        <button 
                          key={t.id}
                          onClick={() => {
                            if (isBusy && !isSelected) {
                               alert('Tractor Busy: Currently on an active trip.');
                               return;
                            }
                            handleTractorUpdate(t.id!);
                          }}
                          className={`relative px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                            isSelected 
                              ? 'border-blue-500 bg-blue-50 text-blue-700' 
                              : isBusy 
                                ? 'border-amber-100 bg-amber-50 text-amber-600 opacity-60' 
                                : 'border-slate-100 text-slate-500 hover:border-blue-200'
                          }`}
                        >
                          {t.name}
                          {isBusy && !isSelected && (
                            <span className="absolute -top-2 -right-1 bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">BUSY</span>
                          )}
                        </button>
                      );
                    })}
                    {stats.tractors.length === 0 && (
                      <div className="text-xs text-slate-400 italic">No tractors found. Add in Tractors tab.</div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => { setEditingBill(null); setChatBill(editingBill); }}
                    className="col-span-2 bg-blue-50 text-blue-600 border border-blue-200 flex flex-row items-center justify-center gap-2 p-4 rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all text-sm mb-2"
                  >
                    <MessageSquare size={18} />
                    <span>Customer Feedback</span>
                  </button>
                  <button 
                    onClick={() => shareBillImage(editingBill, 'customer')}
                    className="bg-[#25D366] text-white flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold shadow-lg shadow-green-100 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    <MessageSquare size={16} />
                    <span className="text-[9px] uppercase">Customer Copy</span>
                  </button>
                  <button 
                    onClick={() => shareBillImage(editingBill, 'driver')}
                    className="bg-slate-800 text-white flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    <Share2 size={16} />
                    <span className="text-[9px] uppercase">Driver Copy</span>
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        await handlePrint();
                      } catch (err) {
                        console.warn("Direct Printing failed, falling back to window.print:", err);
                      }
                      // Auto-send direct preloaded WhatsApp to customer
                      openWhatsAppDirect(editingBill, franchiseDetail || currentFranchise);
                    }}
                    className="col-span-2 material-btn bg-blue-600 text-white flex items-center justify-center gap-2 py-4 shadow-md font-extrabold hover:bg-blue-700 transition-all border border-blue-500"
                  >
                    <Printer size={20} /> Print & Auto-Send WhatsApp 🚛
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

      <ConfirmationModal 
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteToken(deleteConfirm.id)}
        title="Delete Trip Bill?"
        message={`Are you sure you want to delete Bill #${deleteConfirm?.number}? This will remove the record from history, but will NOT reverse manual payments or existing customer balance changes.`}
      />

      {/* Quick Voucher Modal */}
      <AnimatePresence>
        {quickVoucher && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setQuickVoucher(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            <motion.div
              layoutId="quick-voucher"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    quickVoucher.type === 'Payment' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                  }`}>
                    {quickVoucher.type === 'Payment' ? <Minus size={28} /> : <Plus size={28} />}
                  </div>
                  <div>
                    <h2 className="text-2xl font-display font-black text-slate-900 leading-tight">
                      Quick {quickVoucher.type}
                    </h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Via {quickVoucher.paymentMethod} • {new Date(quickVchForm.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setQuickVoucher(null)}
                  className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleQuickVchSubmit} className="p-8 pt-6 flex flex-col gap-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Select Account</label>
                  <select 
                    required
                    value={quickVchForm.accountId}
                    onChange={e => setQuickVchForm({ ...quickVchForm, accountId: e.target.value })}
                    className="w-full h-16 bg-slate-50 rounded-2xl px-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-bold appearance-none"
                  >
                    <option value="">-- Choose Account --</option>
                    {accounts
                      .filter(acc => {
                         if (acc.name === 'Cash' || acc.name === 'Bank Account') return false;
                         if (quickVoucher.customerId === 'ALL_CUSTOMERS') {
                           return acc.group === 'Sundry Debtors' || customers.some(c => c.name === acc.name || c.id === acc.customerId);
                         }
                         return true;
                      })
                      .sort((a,b) => a.name.localeCompare(b.name))
                      .map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.balanceType})
                        </option>
                      ))
                    }
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-black text-slate-300">₹</span>
                      <input
                        required
                        type="number"
                        placeholder="0.00"
                        value={quickVchForm.amount}
                        onChange={e => setQuickVchForm({ ...quickVchForm, amount: e.target.value })}
                        className="w-full h-16 bg-slate-50 rounded-2xl pl-10 pr-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-black text-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Date</label>
                    <input
                      type="date"
                      value={quickVchForm.date}
                      onChange={e => setQuickVchForm({ ...quickVchForm, date: e.target.value })}
                      className="w-full h-16 bg-slate-50 rounded-2xl px-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block ml-1">Narration / Remarks</label>
                  <input
                    placeholder="Enter short description..."
                    value={quickVchForm.description}
                    onChange={e => setQuickVchForm({ ...quickVchForm, description: e.target.value })}
                    className="w-full h-16 bg-slate-50 rounded-2xl px-5 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingQuickVch}
                  className={`w-full h-16 rounded-[1.25rem] font-display font-black text-lg tracking-wide shadow-lg transition-all flex items-center justify-center gap-3 ${
                    quickVoucher.type === 'Payment' 
                      ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-200' 
                      : 'bg-green-600 text-white hover:bg-green-700 shadow-green-200'
                  } disabled:opacity-50`}
                >
                  {isSavingQuickVch ? (
                    <>
                      <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={24} />
                      Save Quick {quickVoucher.type}
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {chatBill && (
          <LiveChatAdminModal bill={chatBill} onClose={() => setChatBill(null)} />
        )}
      </AnimatePresence>

      {/* Admin System Maintenance */}
      {isSystemAdmin && (
        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="bg-white p-6 rounded-[2.5rem] border border-red-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <ShieldCheck className="text-red-500" />
              System Maintenance
            </h3>
            <p className="text-sm text-slate-500 mb-6 font-medium">Administrative tools for database management and system resets.</p>
            
            <div className="flex flex-wrap gap-4">
               <button 
                 onClick={handleMasterReset}
                 disabled={isWiping}
                 className="flex items-center gap-3 px-6 py-4 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-600 hover:text-white transition-all border border-red-100 disabled:opacity-50 group"
               >
                 {isWiping ? (
                   <div className="animate-spin rounded-full h-5 w-5 border-2 border-red-600 border-t-transparent group-hover:border-white" />
                 ) : (
                   <Trash2 size={20} />
                 )}
                 {isWiping ? 'Wiping Database...' : 'Master Reset (Wipe All Data)'}
               </button>

               <button 
                 onClick={handleDeleteDriversData}
                 disabled={isDeletingDrivers}
                 className="flex items-center gap-3 px-6 py-4 bg-orange-50 text-orange-600 rounded-2xl font-bold hover:bg-orange-600 hover:text-white transition-all border border-orange-100 disabled:opacity-50 group"
               >
                 {isDeletingDrivers ? (
                   <div className="animate-spin rounded-full h-5 w-5 border-2 border-orange-600 border-t-transparent group-hover:border-white" />
                 ) : (
                   <Users size={20} />
                 )}
                 {isDeletingDrivers ? 'Deleting Drivers...' : 'Delete All Drivers & Related Ledger'}
               </button>
            </div>
            
            <p className="mt-4 text-[10px] font-black text-red-400 uppercase tracking-widest italic">
              * This will delete all customers, bills, drivers, documents, and ledger entries. Use with caution.
            </p>
          </div>
        </div>
      )}
      {/* Monthly Can Monitoring Details Modal */}
      <AnimatePresence>
        {selectedMonthlyCust && (
          <MonthlyCanCalendar 
            customer={selectedMonthlyCust} 
            bills={bills} 
            onClose={() => setSelectedMonthlyCust(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MonthlyCanCalendar({ customer, bills, onClose }: { customer: Customer, bills: Bill[], onClose: () => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) });

  const customerBills = bills.filter(b => b.customerId === customer.id && b.status === 'Delivered');

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white w-full max-w-4xl rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl text-slate-400 group transition-all">
              <ArrowLeft className="group-hover:-translate-x-1 transition-transform" />
            </button>
            <div>
              <h3 className="text-2xl font-black text-slate-900">{customer.name}</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Calendar size={12} /> Yearly Monitoring • {format(currentMonth, 'MMMM yyyy')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200">
             <button 
               onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
               className="p-2 hover:bg-slate-50 rounded-xl text-slate-600"
             >
               <ChevronLeft size={20} />
             </button>
             <span className="px-4 font-black text-sm min-w-[120px] text-center">{format(currentMonth, 'MMM yyyy')}</span>
             <button 
               onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
               className="p-2 hover:bg-slate-50 rounded-xl text-slate-600"
             >
               <ChevronRight size={20} />
             </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
           <div className="grid grid-cols-7 gap-2 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest py-2">
                  {d}
                </div>
              ))}
           </div>
           
           <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day, idx) => {
                const dayBills = customerBills.filter(b => isSameDay(new Date(b.date), day));
                const totalCans = dayBills.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isTodayDate = isToday(day);

                return (
                  <div 
                    key={idx} 
                    className={`min-h-[100px] p-3 rounded-2xl border transition-all flex flex-col justify-between ${
                      !isCurrentMonth ? 'bg-slate-50/30 border-transparent opacity-30' :
                      isTodayDate ? 'bg-blue-50 border-blue-200 scale-105 shadow-lg shadow-blue-100 z-10' :
                      'bg-white border-slate-100 hover:border-blue-100 hover:shadow-md'
                    }`}
                  >
                    <div className={`text-sm font-black ${isTodayDate ? 'text-blue-600' : 'text-slate-400'}`}>
                      {format(day, 'd')}
                    </div>
                    
                    {totalCans > 0 && (
                      <div className="flex flex-col gap-1.5 overflow-hidden">
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-1">
                             <Droplet size={10} className="text-blue-500" />
                             <span className="text-xs font-black text-slate-900">{totalCans}</span>
                           </div>
                           <div className="flex -space-x-1.5 overflow-hidden">
                             {dayBills.map((b, i) => (
                               <div key={b.id} title={b.driverName} className={`w-3 h-3 rounded-full border border-white shadow-sm flex items-center justify-center text-[5px] font-black text-white ${['bg-blue-400', 'bg-indigo-400', 'bg-purple-400', 'bg-cyan-400'][i % 4]}`}>
                                 {b.driverName?.charAt(0) || 'D'}
                               </div>
                             ))}
                           </div>
                        </div>
                        <div className="space-y-0.5 max-h-[40px] overflow-hide scrollbar-hide">
                          {dayBills.slice(0, 2).map((b, i) => (
                            <div key={i} className="text-[7px] text-slate-500 font-bold leading-tight truncate flex items-center gap-1">
                               <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                               {b.quantity} Can by {b.driverName?.split(' ')[0]}
                            </div>
                          ))}
                          {dayBills.length > 2 && (
                            <div className="text-[6px] text-blue-500 font-black uppercase tracking-tighter">+{dayBills.length - 2} more...</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
           </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-400" />
                <span className="text-xs font-bold text-slate-500">Delivered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-100 animate-pulse" />
                <span className="text-xs font-bold text-slate-500">Today</span>
              </div>
            </div>
            <div className="text-right">
               <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Month Cans</div>
               <div className="text-2xl font-black text-blue-600">
                  {customerBills.filter(b => isSameMonth(new Date(b.date), currentMonth)).reduce((acc, curr) => acc + (curr.quantity || 0), 0)}
               </div>
            </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
