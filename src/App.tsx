import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  ReceiptIndianRupee,
  FileBox,
  Truck,
  BookOpen,
  Menu,
  X,
  LogOut,
  LogIn,
  Plus,
  History,
  Ticket,
  LineChart,
  ClipboardList,
  Fuel,
  Navigation,
  CheckCircle2,
  Droplets,
  Smartphone,
  ShieldCheck,
  LayoutGrid,
  FileText,
  Globe,
  Briefcase,
  ShieldAlert,
  Database,
  Settings as LucideSettings,
  Cpu,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DriverLiveTracking } from "./components/DriverLiveTracking";
import { CustomerOrderView } from "./components/CustomerOrderView";
import PhoneSync from "./components/PhoneSync";
import { Logo } from "./components/Logo";
import { PremiumTractor } from "./components/PremiumTractor";
import { GoodMorningGreeting } from "./components/GoodMorningGreeting";
import { WishesOverlay } from "./components/WishesOverlay";

import { Dashboard } from "./components/Dashboard";
import { CustomerManagement } from "./components/CustomerManagement";
import { Billing } from "./components/Billing";
import { Ledger } from "./components/Ledger";
import { TractorDiesel } from "./components/TractorDiesel";
import { ReportView } from "./components/ReportView";
import { DriverManagement } from "./components/DriverManagement";
import { DriverAttendance } from "./components/DriverAttendance";
import { DriverTrackingAdmin } from "./components/DriverTrackingAdmin";
import { HydrantFilling } from "./components/HydrantFilling";
import { DocumentVault } from "./components/DocumentVault";
import { Settings } from "./components/Settings";
import { BackupRestore } from "./components/BackupRestore";
import { LetterheadGenerator } from "./components/LetterheadGenerator";
import { FranchiseManagement } from "./components/FranchiseManagement";
import { DriverApp } from "./components/DriverApp";
import { CustomerBookingPortal } from "./components/CustomerBookingPortal";
import { Ecosystem } from "./components/Ecosystem";
import { TendersMarketplace } from "./components/TendersMarketplace";
import { MotorController } from "./components/MotorController";
import {
  auth,
  googleProvider,
  signInWithPopup,
  onAuthStateChanged,
  db,
  handleFirestoreError,
  OperationType,
} from "./firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { Franchise } from "./types";
import { ledgerAutomation } from "./services/ledgerAutomation";

type Tab =
  | "dashboard"
  | "customers"
  | "billing"
  | "reports"
  | "drivers"
  | "ledger"
  | "tractors"
  | "live-map"
  | "attendance"
  | "filling"
  | "sync"
  | "documents"
  | "letterpad"
  | "ecosystem"
  | "franchise"
  | "settings"
  | "backup"
  | "tenders"
  | "motor-control";

import { format } from "date-fns";
import { formatCurrency, getPublicAppUrl, copyToClipboard } from "./constants";

function LazyLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-white/40 backdrop-blur-md rounded-[2.5rem] border border-slate-100/50 shadow-sm">
      <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-600 rounded-full animate-spin mx-auto" />
      <h3 className="mt-6 text-sm font-black text-slate-800 tracking-wide uppercase">Shuffling assets</h3>
      <p className="mt-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] animate-pulse">
        Optimizing module load speed...
      </p>
    </div>
  );
}

export default function App() {
  let driverId: string | null = null;
  let orderId: string | null = null;
  let isDriverMode = false;
  let isCustomerMode = false;

  try {
    const queryParams = new URLSearchParams(window.location.search);
    driverId = queryParams.get("driverId");
    orderId = queryParams.get("o");
    
    // Support Capacitor native APK mode selection via global window property, localStorage or url params
    const modeObj = (window as any).CAPACITOR_APP_MODE || localStorage.getItem("CAPACITOR_APP_MODE") || queryParams.get("mode");
    isDriverMode = modeObj === "driver";
    isCustomerMode = modeObj === "booking";
  } catch (e) {
    console.warn("URLSearchParams failed in body:", e instanceof Error ? e.message : String(e));
  }

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    let tabParam: Tab | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      tabParam = params.get("tab") as Tab;
    } catch (e) {
      console.warn("URLSearchParams failed:", e instanceof Error ? e.message : String(e));
    }

    if (
      tabParam &&
      [
        "dashboard",
        "customers",
        "billing",
        "reports",
        "drivers",
        "ledger",
        "tractors",
        "live-map",
        "attendance",
        "filling",
        "sync",
        "documents",
        "tenders",
        "settings",
        "backup",
        "letterpad",
      ].includes(tabParam)
    ) {
      return tabParam;
    }
    return "dashboard";
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginInProgress, setLoginInProgress] = useState(false);
  const [pendingFuelCount, setPendingFuelCount] = useState(0);
  const [currentFranchise, setCurrentFranchise] = useState<Franchise | null>(
    null,
  );
  const [franchiseLoaded, setFranchiseLoaded] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [inspectedFranchiseId, setInspectedFranchiseId] = useState<
    string | null
  >(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  useEffect(() => {
    const handleFirestoreErrorEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.isQuota) {
        setQuotaError(customEvent.detail.message || "Quota limit exceeded");
      }
    };
    window.addEventListener('firestore-error', handleFirestoreErrorEvent);
    return () => window.removeEventListener('firestore-error', handleFirestoreErrorEvent);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        setUser(authUser);
        const email = authUser.email || "";

        // Super Admin Check
        if (email === "milan.sharma6565@gmail.com") {
          setIsSuperAdmin(true);
          setInspectedFranchiseId(null);
          setActiveTab("franchise");
        } else {
          setInspectedFranchiseId(null);

          // Check if Driver Mode
          if (isDriverMode) {
            const qDriver = query(
              collection(db, "drivers"),
              where("email", "==", email.toLowerCase()),
              where("status", "==", "Active")
            );
            const snapDriver = await getDocs(qDriver);
            if (snapDriver.empty) {
              await auth.signOut();
              alert(`ACCESS DENIED: No authorized driver found for ${email}. Please contact your franchise to register your Gmail ID.`);
              return;
            }
          }
          setIsSuperAdmin(false);
        }
      } else {
        setUser(null);
        setCurrentFranchise(null);
        setFranchiseLoaded(false);
        setIsSuperAdmin(false);
        setInspectedFranchiseId(null);
      }
      setLoading(false);
    });
  }, []);

  // Synchronize franchise details in real-time
  useEffect(() => {
    if (!user) {
      setCurrentFranchise(null);
      setFranchiseLoaded(false);
      return;
    }

    let unsub: (() => void) | null = null;
    setFranchiseLoaded(false);

    // Robust helper to get document with automatic online retries if client is offline on startup
    const getDocWithRetry = async (docRef: any, maxRetries = 6, delayMs = 1500) => {
      let attempt = 0;
      while (attempt < maxRetries) {
        try {
          return await getDoc(docRef);
        } catch (err: any) {
          attempt++;
          const isOffline = err?.message?.toLowerCase().includes('offline') || err?.code === 'unavailable';
          if (isOffline && attempt < maxRetries) {
            console.warn(`Firestore getDoc offline, retrying in ${delayMs}ms... (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
          throw err;
        }
      }
    };

    if (isSuperAdmin) {
      if (inspectedFranchiseId) {
        unsub = onSnapshot(doc(db, "franchises", inspectedFranchiseId), (snap) => {
          if (snap.exists()) {
            setCurrentFranchise({ id: snap.id, ...snap.data() } as Franchise);
          }
          setFranchiseLoaded(true);
        }, (err) => {
          setFranchiseLoaded(true);
        });
      } else {
        setCurrentFranchise(null);
        setFranchiseLoaded(true);
      }
    } else {
      const email = user.email || "";
      if (email === "rajhanssikar@gmail.com") {
        const fId = "legacy-rajhans";
        const fName = "Rajhans Steel and Water";
        setCurrentFranchise({
          id: fId,
          name: fName,
          email: "rajhanssikar@gmail.com",
          commissionPercentage: 5,
          authorizedBy: "System",
          status: "Active",
          createdAt: new Date(),
        });
        
        // Auto-seed franchise document and default ledgers
        (async () => {
          try {
            const fDocRef = doc(db, "franchises", fId);
            const fSnap = await getDocWithRetry(fDocRef);
            if (!fSnap.exists()) {
              await setDoc(fDocRef, {
                name: fName,
                email: "rajhanssikar@gmail.com",
                location: "Sikar",
                commissionPercentage: 5,
                status: "Active",
                authorizedBy: "System",
                isTesting: false,
                createdAt: serverTimestamp()
              });
            }
            await ledgerAutomation.setupFranchiseLedgers(fId, fName);
          } catch (err) {
            console.error("Auto-initializing legacy-rajhans failed:", err instanceof Error ? err.message : String(err));
            handleFirestoreError(err, OperationType.WRITE, 'franchise-autoseed-rajhans');
          } finally {
            setFranchiseLoaded(true);
          }
        })();
      } else if (email === "rajhanspilefoundation@gmail.com") {
        const fId = "legacy-pile";
        const fName = "Rajhans Pile Foundation";
        setCurrentFranchise({
          id: fId,
          name: fName,
          email: "rajhanspilefoundation@gmail.com",
          commissionPercentage: 5,
          authorizedBy: "System",
          status: "Active",
          createdAt: new Date(),
        });

        // Auto-seed franchise document and default ledgers
        (async () => {
          try {
            const fDocRef = doc(db, "franchises", fId);
            const fSnap = await getDocWithRetry(fDocRef);
            if (!fSnap.exists()) {
              await setDoc(fDocRef, {
                name: fName,
                email: "rajhanspilefoundation@gmail.com",
                location: "Sikar",
                commissionPercentage: 5,
                status: "Active",
                authorizedBy: "System",
                isTesting: false,
                createdAt: serverTimestamp()
              });
            }
            await ledgerAutomation.setupFranchiseLedgers(fId, fName);
          } catch (err) {
            console.error("Auto-initializing legacy-pile failed:", err instanceof Error ? err.message : String(err));
            handleFirestoreError(err, OperationType.WRITE, 'franchise-autoseed-pile');
          } finally {
            setFranchiseLoaded(true);
          }
        })();
      } else {
        const q = query(
          collection(db, "franchises"),
          where("email", "==", email.toLowerCase())
        );
        unsub = onSnapshot(q, (snap) => {
          if (!snap.empty) {
            setCurrentFranchise({
              id: snap.docs[0].id,
              ...snap.docs[0].data(),
            } as Franchise);
          } else {
            setCurrentFranchise(null);
          }
          setFranchiseLoaded(true);
        }, (err) => {
          setFranchiseLoaded(true);
        });
      }
    }

    return () => {
      if (unsub) unsub();
    };
  }, [user, isSuperAdmin, inspectedFranchiseId]);

  useEffect(() => {
    const q = isSuperAdmin
      ? query(
          collection(db, "dieselRequests"),
          where("status", "==", "Pending"),
        )
      : currentFranchise
        ? query(
            collection(db, "dieselRequests"),
            where("status", "==", "Pending"),
            where("franchiseId", "==", currentFranchise.id),
          )
        : null;

    if (!q) {
      setPendingFuelCount(0);
      return;
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPendingFuelCount(snap.size);
      },
      (err) => {
        console.warn("Diesel requests count check failed:", err.message);
      },
    );
    return () => unsub();
  }, [isSuperAdmin, currentFranchise]);

  const handleLogin = async () => {
    if (loginInProgress) return;
    setLoginInProgress(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || "";

      if (
        email === "milan.sharma6565@gmail.com" ||
        email === "rajhanssikar@gmail.com"
      ) {
        return;
      }

      if (isDriverMode) {
        const qDriver = query(
          collection(db, "drivers"),
          where("email", "==", email.toLowerCase()),
          where("status", "==", "Active"),
        );
        const snapDriver = await getDocs(qDriver);
        if (snapDriver.empty) {
          await auth.signOut();
          alert(`ACCESS DENIED: No authorized driver found for ${email}. Please contact your franchise to register your Gmail ID.`);
          return;
        }
      } else {
        // Check if they are a registered franchisee
        const qFranchise = query(
          collection(db, "franchises"),
          where("email", "==", email.toLowerCase()),
        );
        const snapFranchise = await getDocs(qFranchise);

        if (snapFranchise.empty) {
          await auth.signOut();
          alert(
            `ACCESS DENIED: No authorized franchise found for ${email}. Please contact the administrator.`,
          );
          return;
        }

        const fStatus = snapFranchise.docs[0].data().status;
        if (fStatus !== "Active" && fStatus !== "Testing") {
          await auth.signOut();
          alert(
            `ACCESS DENIED: Your franchise account is currently ${fStatus || "Suspended"}. Please contact Milan Sharma (Admin).`,
          );
          return;
        }
      }
    } catch (error: any) {
      console.error("Login failed:", error?.message || String(error));
      if (error.code === "auth/popup-blocked") {
        const wantsRedirect = window.confirm(
          "Login popup was blocked by your browser.\n\nWould you like to try redirect-based login instead? If this still fails, please open the app in a new tab.",
        );
        if (wantsRedirect) {
          import("./firebase").then(
            ({ signInWithRedirect, auth, googleProvider }) => {
              signInWithRedirect(auth, googleProvider).catch((err) => {
                alert("Redirect login failed: " + err.message);
              });
            },
          );
          return;
        }
      } else if (error.code === "auth/unauthorized-domain") {
        const domain = window.location.hostname;
        alert(
          `ACCESS DENIED: The domain "${domain}" is not authorized in your Firebase Console.\n\nTo fix this:\n1. Go to Firebase Console\n2. Authentication > Settings > Authorized Domains\n3. Add "${domain}" to the list.`,
        );
      } else if (error.code === "auth/popup-closed-by-user") {
        // Just ignore
      } else if (error.code === "auth/network-request-failed") {
        const domain = window.location.hostname;
        alert(
          `NETWORK ERROR: Firebase couldn't connect to the auth server.\n\nMost common fixes:\n1. Ensure "${domain}" is added to "Authorized Domains" in your Firebase Console.\n2. Disable "Prevent Cross-Site Tracking" or "Block Third-Party Cookies" in your browser settings (often an issue in Safari/Chrome).\n3. Check if an Ad-Blocker is blocking Google's login scripts.`,
        );
      } else {
        alert(
          `Login failed (${error.code}): ${error.message}\n\nTip: If nothing happened, please check if your browser blocked the sign-in popup.`,
        );
      }
    } finally {
      setLoginInProgress(false);
    }
  };

  const handleLogout = () => auth.signOut();

  // Driver App View
  if (isDriverMode) {
    return (
      <React.Suspense fallback={<LazyLoader />}>
        <DriverApp />
      </React.Suspense>
    );
  }

  // If driverId is present, show tracking page regardless of auth
  if (driverId) {
    return <DriverLiveTracking driverId={driverId} />;
  }

  // If orderId is present, show customer view regardless of auth
  if (orderId) {
    return <CustomerOrderView billId={orderId} />;
  }

  // Customer Booking view
  if (isCustomerMode) {
    return (
      <React.Suspense fallback={<LazyLoader />}>
        <CustomerBookingPortal />
      </React.Suspense>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center opacity-10 animate-pulse scale-[2.5]">
            <Logo size={120} />
          </div>
          <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center relative z-10 shadow-2xl shadow-blue-200">
            <Logo size={48} color="white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">TankerWala</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">
          Initializing System...
        </p>
      </div>
    );
  }

  if (!user) {
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl max-w-md w-full text-center border border-slate-100 flex flex-col items-center"
        >
          <div className="mb-12 w-full">
            <PremiumTractor />
          </div>

          <h2 className="text-4xl font-display font-black text-slate-900 mb-2 tracking-tight">
            Tanker<span className="relative text-blue-600">Wala<span className="absolute top-full left-0 text-[10px] text-slate-400 font-medium whitespace-nowrap normal-case tracking-normal mt-0.5">Powered by Rajhans</span></span>
          </h2>
          
          <p className="text-slate-500 font-medium mb-10 max-w-[280px] mx-auto text-sm leading-relaxed">
            Ultimate Water Management Ecosystem for Enterprises & Homes.
          </p>
          
          <button 
            onClick={handleLogin}
            disabled={loginInProgress}
            className={`w-full ${loginInProgress ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800 shadow-slate-200"} text-white h-16 rounded-[1.5rem] font-bold flex items-center justify-center gap-3 shadow-2xl shadow-blue-200 transition-all active:scale-95 text-lg group`}
          >
            {loginInProgress ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <div className="w-8 h-8 bg-white rounded-xl p-1.5 flex items-center justify-center transition-transform group-hover:rotate-12">
                 <Logo size={20} />
              </div>
            )}
            {loginInProgress ? "Signing in..." : "Login with Google"}
          </button>

          {isIframe && (
            <div className="mt-6 bg-blue-50/50 border border-blue-100 p-4 rounded-2xl text-left w-full text-xs text-blue-950 leading-relaxed">
              <p className="font-extrabold mb-1 text-blue-900">Running inside Preview?</p>
              If your Google login fails or doesn't open a popup, click the button below to open the app in a new tab:
              <a
                href={window.location.href}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block text-center w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2 px-3 rounded-xl transition-all"
              >
                Open in New Tab
              </a>
            </div>
          )}
          
          <p className="mt-8 text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Authorized Access Only</p>
        </motion.div>
      </div>
    );
  }

  if (!franchiseLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center opacity-10 animate-pulse scale-[2.5]">
            <Logo size={120} />
          </div>
          <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center relative z-10 shadow-2xl shadow-blue-200">
            <Logo size={48} color="white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">TankerWala</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">
          Loading Franchise...
        </p>
      </div>
    );
  }

  if (!isSuperAdmin && !currentFranchise) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl max-w-md w-full text-center border border-slate-100 flex flex-col items-center">
          <div className="w-20 h-20 bg-amber-50 rounded-[2rem] flex items-center justify-center text-amber-500 mb-6 border border-amber-100 animate-pulse">
            <ShieldAlert size={40} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
            Authorization Pending
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Your Google Account (<span className="font-bold text-slate-800">{user.email}</span>) is not linked to any active regional franchise.
          </p>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6 text-left w-full text-xs text-slate-500 leading-relaxed">
            <p className="font-bold text-slate-700 mb-1 text-slate-800">Proposed Next Steps:</p>
            Please contact Milan Sharma (<span className="font-semibold text-slate-800">milan.sharma6565@gmail.com</span>) to register your regional branch and activate your workspace credentials.
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white h-14 rounded-2xl font-bold transition-all text-sm"
          >
            Sign Out & Switch Account
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    // Check if franchise is suspended
    if (
      currentFranchise &&
      currentFranchise.status === "Suspended" &&
      !isSuperAdmin
    ) {
      return (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-white rounded-[3rem] border border-red-100 shadow-xl shadow-red-50">
          <div className="w-24 h-24 bg-red-50 rounded-[2rem] flex items-center justify-center text-red-500 mb-6 animate-bounce">
            <X size={48} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
            Account Suspended
          </h2>
          <p className="text-slate-500 font-medium max-w-md mx-auto">
            Access to this franchise console has been restricted. Please contact
            the Super Admin for payment information or to restore access.
          </p>
          <div className="mt-8 pt-8 border-t border-slate-100 w-full max-w-xs mx-auto">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
              Contact Support
            </p>
            <p className="text-sm font-bold text-slate-900">
              milan.sharma6565@gmail.com
            </p>
          </div>
        </div>
      );
    }

    // Check if granular feature is locked
    if (
      activeTab !== "dashboard" &&
      currentFranchise?.lockedFeatures?.includes(activeTab) &&
      !isSuperAdmin
    ) {
      return (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-white rounded-[3rem] border border-orange-100 shadow-xl shadow-orange-50">
          <div className="w-24 h-24 bg-orange-50 rounded-[2rem] flex items-center justify-center text-orange-500 mb-6 animate-pulse">
            <ShieldCheck size={48} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
            Feature Locked
          </h2>
          <p className="text-slate-500 font-medium max-w-md mx-auto">
            This module has been restricted for your regional branch. Please
            clear pending dues or contact the admin to unlock these
            capabilities.
          </p>
        </div>
      );
    }

    const props = {
      franchiseId: currentFranchise?.id,
      isSuperAdmin,
      commissionPercentage: currentFranchise?.commissionPercentage,
      setActiveTab,
      currentFranchise,
    };
    switch (activeTab) {
      case "dashboard":
        return <Dashboard {...props} />;
      case "customers":
        return <CustomerManagement {...props} />;
      case "billing":
        return (
          <Billing onBillCreated={() => setActiveTab("reports")} {...props} />
        );
      case "drivers":
        return <DriverManagement {...props} />;
      case "attendance":
        return <DriverAttendance {...props} />;
      case "live-map":
        return <DriverTrackingAdmin isTab {...props} />;
      case "reports":
        return <ReportView {...props} />;
      case "ledger":
        return <Ledger {...props} />;
      case "tractors":
        return <TractorDiesel {...props} />;
      case "filling":
        return <HydrantFilling {...props} />;
      case "sync":
        return <PhoneSync />;
      case "settings":
        return <Settings {...props} />;
      case "backup":
        return <BackupRestore franchiseId={currentFranchise?.id || ""} currentFranchise={currentFranchise} />;
      case "documents":
        return <DocumentVault userEmail={user?.email || ""} />;
      case "letterpad":
        return <LetterheadGenerator currentFranchise={currentFranchise} />;
      case "motor-control":
        return <MotorController franchiseId={currentFranchise?.id} currentFranchise={currentFranchise} />;
      case "tenders":
        return <TendersMarketplace franchiseId={currentFranchise?.id || ""} currentFranchise={currentFranchise} isSuperAdmin={isSuperAdmin} />;
      case "ecosystem":
        return isSuperAdmin ? <Ecosystem /> : <Dashboard {...props} />;
      case "franchise":
        return isSuperAdmin ? (
          <FranchiseManagement
            onSelectFranchise={(f) => {
              if (f) {
                setInspectedFranchiseId(f.id!);
                setActiveTab("dashboard");
              } else {
                setInspectedFranchiseId(null);
              }
            }}
          />
        ) : (
          <Dashboard {...props} />
        );
      default:
        return <Dashboard {...props} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative overflow-hidden">
      {quotaError && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-10 max-w-xl w-full border border-slate-100 flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 border border-red-100 animate-pulse">
              <ShieldAlert size={32} />
            </div>
            
            <h2 className="text-2xl font-display font-black text-slate-900 mb-3 tracking-tight">
              Firestore Database Quota Exceeded
            </h2>
            
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">
              This app's Firebase Firestore daily free-tier read limit (50,000 requests) has been reached. No data can be read or written until the quota resets or billing is configured.
            </p>

            <div className="w-full bg-slate-50 border border-slate-200/80 p-5 rounded-3xl text-left text-xs text-slate-600 space-y-4 mb-6">
              <div>
                <p className="font-extrabold text-slate-800 uppercase tracking-wide text-[10px] mb-1">💡 Indian Billing Regulatory Hold (Error [OR_BACR2_44]):</p>
                <p className="leading-relaxed">
                  If you are trying to upgrade to the Blaze Plan from India, Google requires submitting tax details (PAN/GSTIN) and making a <strong>one-time prepaid payment of at least ₹1,000</strong> to verify your account. If you do not want to pay this, you can bypass it 100% for free!
                </p>
              </div>

              <div className="border-t border-slate-200/60 pt-3 space-y-2.5">
                <p className="font-extrabold text-slate-800 uppercase tracking-wide text-[10px] mb-0.5">🚀 Free Solutions / Workarounds:</p>
                <div className="flex gap-2">
                  <span className="text-blue-600 font-bold">1.</span>
                  <p><strong>Database Hot-Swap (Free & Unlimited):</strong> You can create a brand new, free Firebase project (takes 2 minutes) and paste its config in our <strong>Database Setup</strong> page. Every new project gets a fresh 50,000 free reads daily!</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-blue-600 font-bold">2.</span>
                  <p><strong>Offline Backup & Restore:</strong> Even with this quota freeze, our app retrieves your database records safely from your browser's offline cache! Go to <strong>Backup & Restore</strong> to download your backup, swap your database config, and restore your business instantly.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mb-3">
              <button 
                onClick={() => {
                  setActiveTab("settings");
                  setQuotaError(null);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-bold transition-all text-xs uppercase tracking-wider active:scale-95 shadow-md shadow-blue-50 flex items-center justify-center gap-1.5"
              >
                🛠️ Setup Free Database
              </button>

              <button 
                onClick={() => {
                  setActiveTab("backup");
                  setQuotaError(null);
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 h-12 rounded-xl font-bold transition-all text-xs uppercase tracking-wider active:scale-95 flex items-center justify-center gap-1.5"
              >
                💾 Export Cache Backup
              </button>
            </div>

            <button 
              onClick={() => setQuotaError(null)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white h-11 rounded-xl font-bold transition-all text-xs uppercase tracking-wider active:scale-95"
            >
              Close Warning
            </button>
          </motion.div>
        </div>
      )}

      {/* Cinematic Ambient Glow Nodes */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-15%] w-[600px] h-[600px] bg-sky-400/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[40%] right-[10%] w-[350px] h-[350px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      <GoodMorningGreeting />
      {/* Mobile Top Header */}
      <header className="md:hidden bg-white border-b border-slate-100 p-4 flex items-center justify-between sticky top-0 z-[40]">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <h1 className="font-bold text-lg leading-tight pb-3">
            Tanker
            <span className="relative text-blue-600">
              Wala
              <span className="absolute top-[90%] left-0 text-[6px] text-slate-400 font-medium whitespace-nowrap tracking-normal normal-case mt-[2px]">
                Powered by Rajhans
              </span>
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Real-time connection status pill */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
            isOnline 
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
              : 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </div>

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600"
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside
        className={`md:flex md:w-64 bg-white border-r border-slate-200 flex-col px-6 pt-12 pb-6 sticky top-0 h-screen z-50 ${isSidebarOpen ? "flex fixed inset-0 w-full" : "hidden"}`}
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100/80">
          <div className="flex items-center gap-2.5 group">
            <div className="text-slate-900 transition-all group-hover:scale-105 drop-shadow-sm shrink-0">
              <Logo size={36} />
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="font-display font-black text-base text-slate-900 leading-none">
                Tanker
                <span className="text-blue-600 ml-0.5 relative inline-block">
                  Wala
                  <span className="absolute top-[100%] left-0 text-[6px] text-slate-400 font-bold whitespace-nowrap tracking-normal normal-case leading-none mt-0.5">
                    by Rajhans
                  </span>
                </span>
              </h1>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-1 flex-1 scrollbar-hide overflow-y-auto pr-0.5">
          {(!isSuperAdmin || inspectedFranchiseId) && (
            <>
              <SidebarButton
                icon={<LayoutDashboard size={20} />}
                label="Dashboard"
                active={activeTab === "dashboard"}
                onClick={() => {
                  setActiveTab("dashboard");
                  setIsSidebarOpen(false);
                }}
              />
              <SidebarButton
                icon={<Navigation size={20} />}
                label="Live Map"
                active={activeTab === "live-map"}
                onClick={() => {
                  setActiveTab("live-map");
                  setIsSidebarOpen(false);
                }}
              />
              <SidebarButton
                icon={<Truck size={20} />}
                label="Drivers"
                active={activeTab === "drivers"}
                onClick={() => {
                  setActiveTab("drivers");
                  setIsSidebarOpen(false);
                }}
              />
              {!currentFranchise?.lockedFeatures?.includes("tractors") && (
                <SidebarButton
                  icon={<Fuel size={20} />}
                  label="Tractors & Fleet"
                  active={activeTab === "tractors"}
                  onClick={() => {
                    setActiveTab("tractors");
                    setIsSidebarOpen(false);
                  }}
                />
              )}
              {!currentFranchise?.lockedFeatures?.includes("attendance") && (
                <SidebarButton
                  icon={<CheckCircle2 size={20} />}
                  label="Attendance"
                  active={activeTab === "attendance"}
                  onClick={() => {
                    setActiveTab("attendance");
                    setIsSidebarOpen(false);
                  }}
                />
              )}
              {!currentFranchise?.lockedFeatures?.includes("customers") && (
                <SidebarButton
                  icon={<Users size={20} />}
                  label="Customers"
                  active={activeTab === "customers"}
                  onClick={() => {
                    setActiveTab("customers");
                    setIsSidebarOpen(false);
                  }}
                />
              )}
              {!currentFranchise?.lockedFeatures?.includes("billing") && (
                <SidebarButton
                  icon={<Ticket size={20} />}
                  label="Create Bill"
                  active={activeTab === "billing"}
                  onClick={() => {
                    setActiveTab("billing");
                    setIsSidebarOpen(false);
                  }}
                />
              )}
              {!currentFranchise?.lockedFeatures?.includes("ledger") && (
                <SidebarButton
                  icon={<ClipboardList size={20} />}
                  label="Ledger"
                  active={activeTab === "ledger"}
                  onClick={() => {
                    setActiveTab("ledger");
                    setIsSidebarOpen(false);
                  }}
                />
              )}
              {!currentFranchise?.lockedFeatures?.includes("filling") && (
                <SidebarButton
                  icon={<Droplets size={20} />}
                  label="Hydrant Filling"
                  active={activeTab === "filling"}
                  onClick={() => {
                    setActiveTab("filling");
                    setIsSidebarOpen(false);
                  }}
                />
              )}
              {!currentFranchise?.lockedFeatures?.includes("sync") && (
                <SidebarButton
                  icon={<Smartphone size={20} />}
                  label="Phone Sync"
                  active={activeTab === "sync"}
                  onClick={() => {
                    setActiveTab("sync");
                    setIsSidebarOpen(false);
                  }}
                />
              )}
              {!currentFranchise?.lockedFeatures?.includes("documents") && (
                <SidebarButton
                  icon={<FileBox size={20} />}
                  label="Documents"
                  active={activeTab === "documents"}
                  onClick={() => {
                    setActiveTab("documents");
                    setIsSidebarOpen(false);
                  }}
                />
              )}
              {/* Add Letterpad explicitly */}
              <SidebarButton
                  icon={<FileText size={20} />}
                  label="AI Letterpad"
                  active={activeTab === "letterpad"}
                  onClick={() => {
                    setActiveTab("letterpad");
                    setIsSidebarOpen(false);
                  }}
              />
              <SidebarButton
                  icon={<Cpu size={20} />}
                  label="IoT Motor Control"
                  active={activeTab === "motor-control"}
                  onClick={() => {
                    setActiveTab("motor-control");
                    setIsSidebarOpen(false);
                  }}
              />
              <SidebarButton
                  icon={<Briefcase size={20} />}
                  label="Active Tenders"
                  active={activeTab === "tenders"}
                  onClick={() => {
                    setActiveTab("tenders");
                    setIsSidebarOpen(false);
                  }}
              />
              <SidebarButton
                icon={<LucideSettings size={20} />}
                label="Settings"
                active={activeTab === "settings"}
                onClick={() => {
                  setActiveTab("settings");
                  setIsSidebarOpen(false);
                }}
              />
              <SidebarButton
                icon={<Database size={20} />}
                label="Backup & Restore"
                active={activeTab === "backup"}
                onClick={() => {
                  setActiveTab("backup");
                  setIsSidebarOpen(false);
                }}
              />
            </>
          )}
          {isSuperAdmin && (
            <>
              <SidebarButton
                icon={<ShieldCheck size={20} />}
                label="Franchises"
                active={activeTab === "franchise"}
                onClick={() => {
                  setActiveTab("franchise");
                  setInspectedFranchiseId(null);
                  setIsSidebarOpen(false);
                }}
              />
              <SidebarButton
                icon={<Globe size={20} />}
                label="Ecosystem"
                active={activeTab === "ecosystem"}
                onClick={() => {
                  setActiveTab("ecosystem");
                  setInspectedFranchiseId(null);
                  setIsSidebarOpen(false);
                }}
              />
              <SidebarButton
                icon={<Briefcase size={20} />}
                label="Active Tenders"
                active={activeTab === "tenders"}
                onClick={() => {
                  setActiveTab("tenders");
                  setInspectedFranchiseId(null);
                  setIsSidebarOpen(false);
                }}
              />
            </>
          )}
        </nav>

        <div className="pt-4 border-t border-slate-100 mt-auto bg-white/50 space-y-3.5">
          {(!isSuperAdmin || inspectedFranchiseId) && (
            <div className="px-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-0.5">
                Quick Portals
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={async () => {
                    const url = getPublicAppUrl();
                    url.searchParams.set("mode", "booking");
                    url.searchParams.delete("tab");
                    if (currentFranchise?.id) {
                      url.searchParams.set("f", currentFranchise.id);
                    }
                    const link = url.toString();
                    await copyToClipboard(link);
                    alert("Customer Portal link copied!");
                  }}
                  className="p-1.5 md:p-2 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl text-center text-[10px] font-bold text-slate-600 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 duration-150"
                  title="Copy Customer Self-Booking URL"
                >
                  <Users size={12} className="text-slate-400" />
                  Cust. Link
                </button>
                <button
                  onClick={async () => {
                    const url = getPublicAppUrl();
                    url.searchParams.set("mode", "driver");
                    url.searchParams.delete("tab");
                    if (currentFranchise?.id) {
                      url.searchParams.set("f", currentFranchise.id);
                    }
                    const link = url.toString();
                    await copyToClipboard(link);
                    alert("Driver App link copied!");
                  }}
                  className="p-1.5 md:p-2 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl text-center text-[10px] font-bold text-slate-600 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 duration-150"
                  title="Copy Dispatch & Driver App URL"
                >
                  <Truck size={12} className="text-slate-400" />
                  Driver Link
                </button>
              </div>
            </div>
          )}

          {/* User Profile & Logout & Connection Status in one sleek horizontal card */}
          <div className="bg-slate-50/70 p-2 md:p-2.5 rounded-2xl border border-slate-100 flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-slate-200 relative shrink-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || ""}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 text-xs font-bold font-sans">
                    {user.displayName ? user.displayName.substring(0, 1) : "A"}
                  </div>
                )}
                {/* Status indicator on top of avatar */}
                <span className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white ${isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
              </div>
              <div className="flex flex-col min-w-0">
                <p className="text-[11px] md:text-xs font-bold text-slate-900 truncate tracking-tight pr-1 leading-tight">
                  {user.displayName || "Admin"}
                </p>
                <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider truncate leading-tight">
                  {isSuperAdmin
                    ? "Super Admin"
                    : currentFranchise
                      ? currentFranchise.name
                      : "Staff"}
                </p>
                <p className="text-[7px] font-bold text-slate-400 -mt-0.5 tracking-tight flex items-center gap-1 leading-none mt-0.5">
                  <span className={`w-1 h-1 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {isOnline ? 'Active Sync' : 'Offline Mode'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-white border border-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all shadow-sm active:scale-95 flex items-center justify-center cursor-pointer hover:border-red-100 shrink-0"
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 max-w-6xl mx-auto w-full md:p-8 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {isSuperAdmin && inspectedFranchiseId && currentFranchise && (
              <div className="mb-6 bg-slate-900 text-white rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-4 border-4 border-blue-600 animate-in fade-in slide-in-from-top duration-500">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight leading-tight">
                      Inspection Mode: {currentFranchise.name}
                    </h3>
                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">
                      You are viewing all data for this regional partner
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setInspectedFranchiseId(null)}
                  className="bg-white text-slate-900 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-2"
                >
                  <X size={16} strokeWidth={3} />
                  Exit View
                </button>
              </div>
            )}
            <React.Suspense fallback={<LazyLoader />}>
              {renderContent()}
            </React.Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Action Button (Mobile Only) */}
      <div className="md:hidden">
        {(!isSuperAdmin || inspectedFranchiseId) && activeTab !== "billing" && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={() => setActiveTab("billing")}
            className="fixed bottom-24 right-6 w-16 h-16 bg-blue-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-blue-200 z-50 active:scale-90 transition-transform"
          >
            <Plus size={32} strokeWidth={3} />
          </motion.button>
        )}
      </div>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 h-20 flex items-center justify-around px-4 z-[40]">
        {(!isSuperAdmin || inspectedFranchiseId) && (
          <>
            {!currentFranchise?.lockedFeatures?.includes("attendance") && (
              <NavButton
                icon={<CheckCircle2 size={24} />}
                label="Atten."
                active={activeTab === "attendance"}
                onClick={() => setActiveTab("attendance")}
              />
            )}
            <NavButton
              icon={<LayoutDashboard size={24} />}
              label="Dashboard"
              active={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
            />
            {!currentFranchise?.lockedFeatures?.includes("customers") && (
              <NavButton
                icon={<Users size={24} />}
                label="Customers"
                active={activeTab === "customers"}
                onClick={() => setActiveTab("customers")}
              />
            )}
            <div className="w-16" />
            {!currentFranchise?.lockedFeatures?.includes("ledger") && (
              <NavButton
                icon={<BookOpen size={24} />}
                label="Ledger"
                active={activeTab === "ledger"}
                onClick={() => setActiveTab("ledger")}
              />
            )}
          </>
        )}
        {isSuperAdmin && !inspectedFranchiseId && (
          <>
            <NavButton
              icon={<ShieldCheck size={24} />}
              label="Franchises"
              active={activeTab === "franchise"}
              onClick={() => setActiveTab("franchise")}
            />
            <NavButton
              icon={<Globe size={24} />}
              label="Ecosystem"
              active={activeTab === "ecosystem"}
              onClick={() => setActiveTab("ecosystem")}
            />
            <NavButton
              icon={<Briefcase size={24} />}
              label="Tenders"
              active={activeTab === "tenders"}
              onClick={() => setActiveTab("tenders")}
            />
          </>
        )}
      </nav>
    </div>
  );
}

function SidebarButton({
  icon,
  label,
  active,
  onClick,
  badgeCount,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badgeCount?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-200 cursor-pointer ${
        active
          ? "bg-blue-600 text-white font-bold shadow-md shadow-blue-50/50"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`transition-transform duration-200 shrink-0 ${active ? "text-white scale-105" : "text-slate-400 group-hover:text-slate-600"}`}>
          {React.cloneElement(icon as React.ReactElement<any>, { size: 18 })}
        </div>
        <span className="text-xs font-semibold tracking-tight truncate">{label}</span>
      </div>
      {badgeCount && badgeCount > 0 ? (
        <span
          className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${active ? "bg-white text-blue-600" : "bg-red-500 text-white animate-bounce"}`}
        >
          {badgeCount}
        </span>
      ) : null}
    </button>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
  badgeCount,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badgeCount?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all relative ${active ? "text-blue-600 scale-110" : "text-slate-400 hover:text-slate-600"}`}
    >
      {icon}
      <span className="text-[10px] font-bold tracking-tight">{label}</span>
      {badgeCount && badgeCount > 0 ? (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
          {badgeCount}
        </span>
      ) : null}
    </button>
  );
}
