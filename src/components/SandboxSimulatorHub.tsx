import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  Sparkles, 
  Smartphone, 
  Users, 
  Truck, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  ArrowRight,
  ShieldCheck,
  Send,
  Plus,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SandboxSimulatorHubProps {
  franchiseId: string;
  currentFranchise: any;
}

export function SandboxSimulatorHub({ franchiseId, currentFranchise }: SandboxSimulatorHubProps) {
  const [activeTrips, setActiveTrips] = useState<any[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [simulatingBooking, setSimulatingBooking] = useState(false);
  const [isConversionRequested, setIsConversionRequested] = useState(false);

  // Monitor active trips for driver simulation
  useEffect(() => {
    if (!franchiseId) return;
    const q = query(
      collection(db, 'trips'),
      where('franchiseId', '==', franchiseId),
      where('status', 'in', ['Active', 'Filling', 'On the way', 'Reached'])
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveTrips(data);
      setLoadingTrips(false);
    }, (err) => {
      console.error('Error fetching simulator active trips:', err);
      setLoadingTrips(false);
    });

    return () => unsubscribe();
  }, [franchiseId]);

  // Sync conversion requested status from franchise document
  useEffect(() => {
    if (!currentFranchise) return;
    setIsConversionRequested(currentFranchise.conversionRequested || false);
  }, [currentFranchise]);

  // Helper to seed all-important mock data inside Sandbox
  const handleSeedDemoData = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);

      // 1. Create 3 Demo Customers
      const demoCustomers = [
        {
          franchiseId,
          name: "Hotel Sikar Palace (Commercial)",
          mobile: "9928374829",
          address: "Piprali Bypass Rd, Sikar",
          pendingAmount: 0,
          category: "TANKER",
          createdAt: serverTimestamp()
        },
        {
          franchiseId,
          name: "Sharma Agriculture Farm",
          mobile: "9414828109",
          address: "Harsh Rd, Sikar",
          pendingAmount: 1800,
          category: "STANDBY_TANKER",
          createdAt: serverTimestamp()
        },
        {
          franchiseId,
          name: "Ambuja Cement Plant Site",
          mobile: "9829011223",
          address: "Industrial Area Phase I, Sikar",
          pendingAmount: 0,
          category: "TANKER",
          createdAt: serverTimestamp()
        }
      ];

      for (const cust of demoCustomers) {
        const docRef = doc(collection(db, 'customers'));
        batch.set(docRef, cust);
      }

      // 2. Create 2 Demo Drivers (one is pre-coded with details)
      const demoDrivers = [
        {
          franchiseId,
          name: "Rajesh Kumar Yadav",
          mobile: "9988112233",
          monthlySalary: 18000,
          status: "Active",
          pin: "1234",
          email: "rajesh.driver@gmail.com",
          createdAt: serverTimestamp()
        },
        {
          franchiseId,
          name: "Amit Singh Shekhawat",
          mobile: "9112233445",
          monthlySalary: 16500,
          status: "Active",
          pin: "5678",
          email: "amit.driver@gmail.com",
          createdAt: serverTimestamp()
        }
      ];

      for (const drv of demoDrivers) {
        const docRef = doc(collection(db, 'drivers'));
        batch.set(docRef, drv);
      }

      // 3. Create 2 Demo Tractors
      const demoTractors = [
        {
          franchiseId,
          name: "Swaraj 855 FE (T-01)",
          vehicleNumber: "RJ-23-RA-8291",
          createdAt: serverTimestamp()
        },
        {
          franchiseId,
          name: "Mahindra Arjun Ultra (T-02)",
          vehicleNumber: "RJ-23-RA-1104",
          createdAt: serverTimestamp()
        }
      ];

      for (const trac of demoTractors) {
        const docRef = doc(collection(db, 'tractors'));
        batch.set(docRef, trac);
      }

      // 4. Create historic bills so reports show instant chart data
      const pastBills = [
        {
          franchiseId,
          billNumber: "BW-DEMO-001",
          date: serverTimestamp(),
          customerId: "temp-c1",
          customerName: "Hotel Sikar Palace (Commercial)",
          customerMobile: "9928374829",
          customerAddress: "Piprali Bypass Rd, Sikar",
          category: "TANKER",
          tankerSize: "5000 Liters",
          quantity: 2,
          rate: 600,
          totalAmount: 1200,
          extraCharges: 0,
          discount: 100,
          grandTotal: 1100,
          commissionAmount: 55,
          paymentMode: "UPI",
          status: "Delivered",
          isSettled: true,
          createdAt: serverTimestamp()
        },
        {
          franchiseId,
          billNumber: "BW-DEMO-002",
          date: serverTimestamp(),
          customerId: "temp-c2",
          customerName: "Sharma Agriculture Farm",
          customerMobile: "9414828109",
          customerAddress: "Harsh Rd, Sikar",
          category: "STANDBY_TANKER",
          tankerSize: "6000 Liters",
          quantity: 1,
          rate: 700,
          totalAmount: 700,
          extraCharges: 50,
          discount: 0,
          grandTotal: 750,
          commissionAmount: 37.5,
          paymentMode: "Cash",
          status: "Delivered",
          isSettled: true,
          createdAt: serverTimestamp()
        }
      ];

      for (const b of pastBills) {
        const docRef = doc(collection(db, 'bills'));
        batch.set(docRef, b);
      }

      await batch.commit();

      // Seed current asset balance directly for immediate metrics beauty
      const accountsSnap = await getDocs(collection(db, 'accounts'));
      const cashAcc = accountsSnap.docs.find(d => d.data().name === 'Cash' && d.data().franchiseId === franchiseId);
      const bankAcc = accountsSnap.docs.find(d => d.data().name === 'Bank Account' && d.data().franchiseId === franchiseId);
      const serviceAcc = accountsSnap.docs.find(d => d.data().name === 'Service Income' && d.data().franchiseId === franchiseId);

      if (cashAcc) {
        await updateDoc(doc(db, 'accounts', cashAcc.id), { currentBalance: 750 });
      }
      if (bankAcc) {
        await updateDoc(doc(db, 'accounts', bankAcc.id), { currentBalance: 1100 });
      }
      if (serviceAcc) {
        await updateDoc(doc(db, 'accounts', serviceAcc.id), { currentBalance: 1850 });
      }

      alert("🎉 Cinematic Trial Data seeded successfully! View your Live Map, Customers, Drivers, Fleet and Ledger screens to see the fully loaded dashboard.");
    } catch (e: any) {
      alert("Error seeding trial data: " + e.message);
    } finally {
      setSeeding(false);
    }
  };

  // Helper to mock client booking requests sending to dispatch terminal
  const handleSimulateCustomerBooking = async () => {
    if (simulatingBooking) return;
    setSimulatingBooking(true);
    try {
      await addDoc(collection(db, 'bookingRequests'), {
        franchiseId,
        customerId: "demo-trial-cust",
        customerName: "Radisson Blu Resort (Sikar Site)",
        customerMobile: "9900228811",
        category: "TANKER",
        tankerSize: "5000 Liters",
        quantity: 1,
        remarks: "Urgent tanker dispatch requested for hospitality wing pool filling.",
        status: "Pending",
        requestedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      alert("⚡ Simulated Customer Booking Request sent successfully!\n\nA booking alert will now pop up instantly on your current Franchise terminal. Click 'Accept Request' to set up a new Token & Assign physical fleet!");
    } catch (e: any) {
      alert("Simulation error: " + e.message);
    } finally {
      setSimulatingBooking(false);
    }
  };

  // Helper to simulator driver trip progression stages
  const handleStepDriverSim = async (trip: any, nextStatus: string) => {
    try {
      const tripRef = doc(db, 'trips', trip.id);
      const billRef = doc(db, 'bills', trip.billId);

      if (nextStatus === 'Delivered') {
        // Complete the delivery with real accounts integration
        await updateDoc(tripRef, { status: 'Delivered', completedAt: serverTimestamp() });
        await updateDoc(billRef, { 
          status: 'Delivered', 
          paymentStatus: 'Paid',
          paymentMode: 'UPI',
          isSettled: true,
          completedAt: serverTimestamp() 
        });

        // Auto post ledger so they instantly see account balances update in real-time
        const ledgData = {
          franchiseId,
          date: serverTimestamp(),
          type: 'Income',
          category: 'Water Sales',
          partyName: trip.customerName,
          description: `Water Dispatched via virtual simulator (Token #${trip.billNumber || 'T'})`,
          amount: 500,
          paymentMode: 'UPI',
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'ledger'), ledgData);

        // Adjust bank account ledger balance dynamically!
        const accountsSnap = await getDocs(collection(db, 'accounts'));
        const bankAcc = accountsSnap.docs.find(d => d.data().name === 'Bank Account' && d.data().franchiseId === franchiseId);
        const serviceAcc = accountsSnap.docs.find(d => d.data().name === 'Service Income' && d.data().franchiseId === franchiseId);
        if (bankAcc) {
          await updateDoc(doc(db, 'accounts', bankAcc.id), { currentBalance: (bankAcc.data().currentBalance || 0) + 500 });
        }
        if (serviceAcc) {
          await updateDoc(doc(db, 'accounts', serviceAcc.id), { currentBalance: (serviceAcc.data().currentBalance || 0) + 500 });
        }

        alert("🚚 Trip successfully marked DELIVERED and accounts posted! Your Bank Account balance has increased by ₹500 in real-time.");
      } else {
        await updateDoc(tripRef, { status: nextStatus });
        await updateDoc(billRef, { status: nextStatus });
      }
    } catch (e: any) {
      alert("Error updating virtual driver state: " + e.message);
    }
  };

  // Helper to toggle conversion state and alert Super Admin
  const handleRequestConversion = async () => {
    try {
      await updateDoc(doc(db, 'franchises', franchiseId), {
        conversionRequested: true
      });
      setIsConversionRequested(true);
      alert("📬 Conversion request sent successfully to Super Admin! Milan Sharma (Super Admin) will review your trial metrics and unlock your official licensed partner console.");
    } catch (e: any) {
      alert("Error requesting conversion: " + e.message);
    }
  };

  return (
    <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 border border-white/10 relative overflow-hidden mb-8 shadow-xl">
      {/* Decorative ambient background */}
      <div className="absolute right-0 top-0 w-80 h-80 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute left-1/3 bottom-0 w-60 h-60 bg-blue-500/5 rounded-full blur-[60px] pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/30">
              <Sparkles className="animate-spin-slow" size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-amber-500/30 text-amber-300 font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-500/20">
                  Interactive Sandbox Active
                </span>
              </div>
              <h2 className="text-xl font-black tracking-tight mt-1">Rajhans Sikar Water • Trial Hub</h2>
              <p className="text-slate-400 text-xs mt-0.5 font-medium">Test customer order dispatching and driver workflows on one single terminal</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isConversionRequested ? (
              <span className="bg-green-500/20 text-green-300 border border-green-500/30 rounded-2xl px-5 py-3 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={18} className="text-green-400" />
                Conversion Requested
              </span>
            ) : (
              <button
                onClick={handleRequestConversion}
                className="bg-amber-500 text-slate-950 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/15 flex items-center gap-2 hover:scale-105 active:scale-95"
              >
                <ShieldCheck size={16} />
                I am interested • Upgrade to Real
              </button>
            )}
          </div>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
          
          {/* Section A: Seeders & Bookings */}
          <div className="space-y-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Testing Tools (One-click Simulations)</p>
            
            <div className="bg-white/5 border border-white/5 rounded-3xl p-6 flex items-start gap-4 hover:bg-white/10 transition-colors">
              <div className="w-10 h-10 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                <Smartphone size={20} />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-blue-200">Simulate Customer App Booking</h4>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">Sends an immediate booking request from a digital customer to your dispatch monitor. Test accepting, rejecting, and tracking incoming tanker orders.</p>
                <button
                  onClick={handleSimulateCustomerBooking}
                  disabled={simulatingBooking}
                  className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {simulatingBooking ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} />}
                  Simulate Client Request
                </button>
              </div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-3xl p-6 flex items-start gap-4 hover:bg-white/10 transition-colors">
              <div className="w-10 h-10 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                <Play size={20} />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-amber-300">Populate Rich Sandbox Data</h4>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed font-normal">Populate your ledger accounts, fuel logs, tractor files, registered drivers, and historic customer databases instantly in 1 click.</p>
                <button
                  onClick={handleSeedDemoData}
                  disabled={seeding}
                  className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {seeding ? <RefreshCw className="animate-spin" size={14} /> : <Plus size={14} />}
                  Seed Trial Environment
                </button>
              </div>
            </div>
          </div>

          {/* Section B: Virtual Driver App Simulator */}
          <div className="space-y-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Virtual Driver App Console (Simulate Active Missions)</p>
            
            <div className="bg-white/5 border border-white/5 rounded-3xl p-6 flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Truck className="text-amber-400" size={18} />
                    <span className="font-bold text-sm">Virtual Driver App Applet</span>
                  </div>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-black tracking-widest uppercase">
                    {activeTrips.length} Active {activeTrips.length === 1 ? 'Trip' : 'Trips'}
                  </span>
                </div>

                {loadingTrips ? (
                  <p className="text-slate-500 text-xs py-10 text-center">Checking active dispatches...</p>
                ) : activeTrips.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <AlertCircle className="mx-auto text-slate-500" size={24} />
                    <p className="text-slate-400 text-xs">No active dispatches found.</p>
                    <p className="text-slate-500 text-[10px] max-w-xs mx-auto px-4 font-normal leading-relaxed">
                      To test: Create a billing entry or accept a Booking, assign a driver/tractor and click status to dispatch, then control that driver right here!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
                    {activeTrips.map((trip) => {
                      const statusTransMap: { [key: string]: { label: string, color: string, next: string } } = {
                        'Active': { label: 'Start Filling', color: 'bg-blue-600 hover:bg-blue-500 text-white', next: 'Filling' },
                        'Filling': { label: 'Depart to Client', color: 'bg-indigo-600 hover:bg-indigo-500 text-white', next: 'On the way' },
                        'On the way': { label: 'Confirm Arrival', color: 'bg-teal-600 hover:bg-teal-500 text-white', next: 'Reached' },
                        'Reached': { label: 'Simulate UPI Delivery', color: 'bg-green-600 hover:bg-green-500 text-white hover:scale-105', next: 'Delivered' }
                      };

                      const currentTrans = statusTransMap[trip.status];

                      return (
                        <div key={trip.id} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                          <div className="flex items-center justify-between">
                            <span className="text-amber-300 font-bold text-xs">{trip.customerName}</span>
                            <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-md font-bold uppercase">
                              {trip.status}
                            </span>
                          </div>
                          
                          <div className="mt-2 text-[10px] text-slate-400 font-medium flex flex-wrap gap-2">
                            <span>Driver: {trip.driverName}</span>
                            <span>•</span>
                            <span>Token #{trip.billNumber}</span>
                          </div>

                          {currentTrans && (
                            <button
                              onClick={() => handleStepDriverSim(trip, currentTrans.next)}
                              className={`mt-3 w-full py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${currentTrans.color}`}
                            >
                              <span>{currentTrans.label}</span>
                              <ArrowRight size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-[10px] text-slate-500 text-center font-normal mt-4 pt-2 border-t border-white/5">
                Simulated actions behave exactly like a physical smartphone driver app trigger!
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
