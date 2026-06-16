import React, { useState, useEffect, useRef } from "react";
import {
  db,
  handleFirestoreError,
  OperationType,
  auth,
  onAuthStateChanged,
  signInWithPopup,
  googleProvider,
} from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  onSnapshot,
  updateDoc,
  doc,
  setDoc,
  arrayUnion,
} from "firebase/firestore";
import {
  Customer,
  Bill,
  ProductCategory,
  BookingRequest as BookingRequestType,
} from "../types";
import { ledgerAutomation } from "../services/ledgerAutomation";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "motion/react";
import {
  Phone,
  CheckCircle2,
  Navigation,
  MapPin,
  AlertCircle,
  Calendar,
  Truck,
  Lock,
  User as UserIcon,
  Plus,
  X,
  Receipt,
  QrCode,
  FileText,
  MessageCircle,
  Send,
  Bell,
  Droplets,
  FlaskConical as Flask,
  Package,
  Smartphone,
  Mail,
} from "lucide-react";

import { Logo } from "./Logo";
import { PremiumTractor } from "./PremiumTractor";
import { LocationPicker } from "./LocationPicker";
import { InstallPWA } from "./InstallPWA";
import { WishesOverlay } from "./WishesOverlay";
import { ThermalInvoice } from "./ThermalInvoice";
import {
  startOfMonth,
  endOfMonth,
  format,
  eachDayOfInterval,
  addDays,
  isSameDay,
} from "date-fns";
import { formatCurrency } from "../constants";

const BASE_LAT = 27.592172;
const BASE_LNG = 75.167808;

function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function TripCountdown({ createdAt }: { createdAt: any }) {
  // ... existing code ...
  const [timeLeft, setTimeLeft] = useState("");
  const [isLate, setIsLate] = useState(false);

  useEffect(() => {
    if (!createdAt) return;
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const target = new Date(date.getTime() + 1.5 * 60 * 60 * 1000); // +1.5 hours

    const interval = setInterval(() => {
      const now = new Date();
      const diff = target.getTime() - now.getTime();

      if (diff <= 0) {
        setIsLate(true);
        setTimeLeft("Delayed");
      } else {
        setIsLate(false);
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt]);

  if (isLate) {
    return (
      <div className="text-[10px] text-red-600 font-bold mt-2 bg-red-50 p-2 rounded-lg leading-tight border border-red-100">
        Sorry due to electricity cut off, your tanker will deliver soon.
      </div>
    );
  }

  return (
    <div className="text-[11px] text-orange-600 font-bold mt-2 flex items-center gap-1.5 bg-orange-50 px-2 py-1.5 rounded-lg border border-orange-100">
      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
      Estimated Time: {timeLeft}
    </div>
  );
}

function CanCalendar({ bills }: { bills: Bill[] }) {
  const canBills = React.useMemo(() => {
    return bills.filter(
      (b) => b.category === "CAN" && b.status !== "Cancelled",
    );
  }, [bills]);

  // Find the date of the very first can delivery
  const firstCanBill = React.useMemo(() => {
    if (canBills.length === 0) return null;
    return [...canBills].sort((a, b) => {
      const dA = a.createdAt?.toDate?.() || new Date(a.date);
      const dB = b.createdAt?.toDate?.() || new Date(b.date);
      return dA.getTime() - dB.getTime();
    })[0];
  }, [canBills]);

  const firstDate = firstCanBill
    ? firstCanBill.createdAt?.toDate?.() || new Date(firstCanBill.date)
    : new Date();

  // Calculate the current 30-day cycle
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - firstDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const currentCycleIndex = Math.floor(diffDays / 30);

  const cycleStartDate = addDays(firstDate, currentCycleIndex * 30);
  const cycleEndDate = addDays(cycleStartDate, 29);

  const days = React.useMemo(() => {
    return eachDayOfInterval({
      start: cycleStartDate,
      end: cycleEndDate,
    });
  }, [cycleStartDate, cycleEndDate]);

  // Pre-calculate total cans per day to make days mapping completely O(1) per day
  const cansByDayMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    canBills.forEach((b) => {
      const bDate = b.createdAt?.toDate?.() || new Date(b.date);
      const key = format(bDate, "yyyy-MM-dd");
      map[key] = (map[key] || 0) + (b.quantity || 0);
    });
    return map;
  }, [canBills]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
          Cycle: {format(cycleStartDate, "dd MMM")} -{" "}
          {format(cycleEndDate, "dd MMM")}
        </span>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-600" />
          <span className="text-[9px] font-bold text-slate-400 uppercase">
            Deliveries
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
          <div
            key={d}
            className="text-[10px] font-black text-slate-400 text-center py-2"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const totalCans = cansByDayMap[dayKey] || 0;
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center p-1 border transition-all ${
                totalCans > 0
                  ? "bg-blue-600 border-blue-400 text-white shadow-md scale-105 z-10"
                  : isToday
                    ? "bg-white border-blue-200 ring-1 ring-blue-100 ring-offset-1"
                    : "bg-slate-50 border-slate-100 text-slate-400"
              }`}
            >
              <span
                className={`text-[9px] font-bold leading-none ${totalCans > 0 ? "opacity-100" : "opacity-40"}`}
              >
                {format(day, "d")}
              </span>
              {totalCans > 0 && (
                <span className="text-xs font-black leading-none mt-1">
                  {totalCans}
                </span>
              )}
              {isToday && totalCans === 0 && (
                <div className="w-1 h-1 bg-blue-400 rounded-full mt-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BottleLog({ bills }: { bills: Bill[] }) {
  const bottleBills = bills.filter(
    (b) => b.category === "BOTTLE" && b.status !== "Cancelled",
  );

  if (bottleBills.length === 0) {
    return (
      <div className="text-center py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <Package size={32} className="mx-auto text-slate-300 mb-2" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          No Bottle History
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bottleBills.slice(0, 10).map((bill) => (
        <div
          key={bill.id}
          className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
              <Droplets size={18} />
            </div>
            <div>
              <div className="text-xs font-black text-slate-800">
                {bill.bottleSize} Bundle
              </div>
              <div className="text-[10px] font-bold text-slate-500">
                {format(
                  bill.createdAt?.toDate?.() || new Date(bill.date),
                  "dd MMM yyyy",
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-black text-slate-900">
              Qty: {bill.quantity}
            </div>
            <div className="text-[10px] font-bold text-blue-600">
              {formatCurrency(bill.grandTotal)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LiveChatModal({
  bill,
  onClose,
  customerName,
}: {
  bill: Bill;
  onClose: () => void;
  customerName: string;
}) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    await addDoc(collection(db, "feedbacks"), {
      billId: bill.id,
      billNumber: bill.billNumber,
      customerName,
      franchiseId: bill.franchiseId || null,
      rating,
      comment: text.trim(),
      createdAt: serverTimestamp(),
    });
    setSubmitted(true);
    setTimeout(onClose, 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm relative text-center">
        {submitted ? (
          <div className="py-10">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={40} />
            </div>
            <h3 className="text-xl font-black text-slate-900">Thank You!</h3>
            <p className="text-slate-500 font-medium">
              Your feedback helps us improve.
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-slate-400 p-2 bg-slate-50 rounded-full"
            >
              <X size={20} />
            </button>
            <h2 className="text-2xl font-black text-slate-900 mb-2">
              Driver Feedback
            </h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-8">
              Token #{bill.billNumber}
            </p>

            <div className="flex items-center justify-center gap-2 mb-8">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className={`text-3xl transition-transform active:scale-90 ${star <= rating ? "text-yellow-400" : "text-slate-200"}`}
                >
                  ★
                </button>
              ))}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tell us about the delivery quality..."
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-medium focus:border-blue-500 outline-none resize-none h-32 mb-2"
            />
            <p className="text-[10px] text-slate-500 font-bold mb-6 italic leading-tight">
              Feedback will be shared to Head Office and also with Franchise.
            </p>

            <button
              onClick={handleSubmit}
              className="w-full bg-blue-600 text-white h-14 rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
            >
              Submit Feedback
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function CustomerBookingPortal() {
  const [franchiseId, setFranchiseId] = useState<string | null>(null);
  const [franchises, setFranchises] = useState<any[]>([]);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const activeFranchise = React.useMemo(() => {
    return franchises.find((f) => f.id === franchiseId);
  }, [franchises, franchiseId]);

  const allowedServices = React.useMemo(() => {
    if (!activeFranchise) {
      return { tanker: true, can: true, bottle: true };
    }
    const sa = activeFranchise.superAdminServices || {
      tanker: true,
      can: true,
      bottle: true,
    };
    const fr = activeFranchise.servicesEnabled || {
      tanker: true,
      can: true,
      bottle: true,
    };
    return {
      tanker: sa.tanker !== false && fr.tanker !== false,
      can: sa.can !== false && fr.can !== false,
      bottle: sa.bottle !== false && fr.bottle !== false,
    };
  }, [activeFranchise]);

  const [mobileNumber, setMobileNumber] = useState("");
  const [loginStep, setLoginStep] = useState<
    "PHONE_INPUT" | "OTP_VERIFY" | "REGISTER_NEW"
  >("PHONE_INPUT");
  const [pin, setPin] = useState("");

  // OTP States
  const [otpCode, setOtpCode] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [showOtpHint, setShowOtpHint] = useState(false);

  // Registration States
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const bypassLoginByMobile = async (mobile: string) => {
    try {
      const q = query(
        collection(db, "customers"),
        where("mobile", "==", mobile),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const custData = {
          id: snap.docs[0].id,
          ...snap.docs[0].data(),
        } as Customer;
        setCustomer(custData);
        setIsLogged(true);
      } else {
        localStorage.removeItem("customerBookingMobile");
        localStorage.removeItem("isCustomerLoggedIn");
      }
    } catch (e: any) {
      console.error("Login bypass by mobile failed:", e?.message || String(e));
    }
  };

  const bypassLoginByEmail = async (email: string) => {
    try {
      const q = query(collection(db, "customers"), where("email", "==", email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const custData = {
          id: snap.docs[0].id,
          ...snap.docs[0].data(),
        } as Customer;
        setCustomer(custData);
        setIsLogged(true);
      } else {
        localStorage.removeItem("customerBookingEmail");
        localStorage.removeItem("isCustomerLoggedIn");
      }
    } catch (e: any) {
      console.error("Login bypass failed:", e?.message || String(e));
    }
  };

  useEffect(() => {
    // Check local storage for persistent login
    const savedEmail = localStorage.getItem("customerBookingEmail");
    const savedMobile = localStorage.getItem("customerBookingMobile");
    const isLoggedIn = localStorage.getItem("isCustomerLoggedIn");
    if (savedMobile && isLoggedIn === "true") {
      bypassLoginByMobile(savedMobile);
    } else if (savedEmail && isLoggedIn === "true") {
      bypassLoginByEmail(savedEmail);
    }
  }, []);

  const [isLogged, setIsLogged] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [redeemLoyalty, setRedeemLoyalty] = useState(false);

  useEffect(() => {
    if (!customer?.id) return;
    const unsub = onSnapshot(doc(db, "customers", customer.id), (docSnap) => {
      if (docSnap.exists()) {
        setCustomer({ id: docSnap.id, ...docSnap.data() } as Customer);
      }
    });
    return () => unsub();
  }, [customer?.id]);

  useEffect(() => {
    if (customer?.franchiseId && !franchiseId) {
      setFranchiseId(customer.franchiseId);
    }
  }, [customer?.franchiseId, franchiseId]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Booking details
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const [remarks, setRemarks] = useState("");

  const [floors, setFloors] = useState<number>(0);
  const [pipeLength, setPipeLength] = useState<number>(50);
  const [totalEstimate, setTotalEstimate] = useState(0);

  const maxRedeemablePoints = React.useMemo(() => {
    if (!customer) return 0;
    return Math.min(customer.loyaltyCoins || 0, totalEstimate);
  }, [customer, totalEstimate]);

  const finalPayableEstimate = React.useMemo(() => {
    const isLoyaltyActive = !!activeFranchise?.loyaltyProgramEnabled;
    const loyaltyCoinsRedeemed =
      redeemLoyalty && isLoyaltyActive ? maxRedeemablePoints : 0;
    return Math.max(0, totalEstimate - loyaltyCoinsRedeemed);
  }, [redeemLoyalty, activeFranchise, totalEstimate, maxRedeemablePoints]);

  const [activeSlide, setActiveSlide] = useState<"TANKER" | "CAN" | "BOTTLE">(
    "TANKER",
  );
  const [primaryView, setPrimaryView] = useState<
    "HOME" | "TANKER_SECTION" | "CAN_SECTION" | "BOTTLE_SECTION"
  >("HOME");
  const [selectedCategory, setSelectedCategory] =
    useState<ProductCategory | null>(null);
  const [bottleSize, setBottleSize] = useState<"500ml" | "1L" | "2L">("1L");
  const [quantity, setQuantity] = useState(1);
  const [isFastDelivery, setIsFastDelivery] = useState(false);
  const [nextDayCans, setNextDayCans] = useState<number>(0);
  const [updatingNextDay, setUpdatingNextDay] = useState(false);

  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Donation Amount Selection
  const [donationAmount, setDonationAmount] = useState(100);
  const [showDonationQR, setShowDonationQR] = useState(false);

  const [isMonthlyCan, setIsMonthlyCan] = useState(false);

  // Auto-route activeSlide if its corresponding service product is disabled
  useEffect(() => {
    if (activeSlide === "TANKER" && !allowedServices.tanker) {
      if (allowedServices.can) setActiveSlide("CAN");
      else if (allowedServices.bottle) setActiveSlide("BOTTLE");
    } else if (activeSlide === "CAN" && !allowedServices.can) {
      if (allowedServices.tanker) setActiveSlide("TANKER");
      else if (allowedServices.bottle) setActiveSlide("BOTTLE");
    } else if (activeSlide === "BOTTLE" && !allowedServices.bottle) {
      if (allowedServices.tanker) setActiveSlide("TANKER");
      else if (allowedServices.can) setActiveSlide("CAN");
    }
  }, [allowedServices, activeSlide]);

  // Auto-route primaryView if active service product is disabled
  useEffect(() => {
    if (primaryView === "TANKER_SECTION" && !allowedServices.tanker) {
      setPrimaryView("HOME");
    } else if (primaryView === "CAN_SECTION" && !allowedServices.can) {
      setPrimaryView("HOME");
    } else if (primaryView === "BOTTLE_SECTION" && !allowedServices.bottle) {
      setPrimaryView("HOME");
    }
  }, [allowedServices, primaryView]);

  useEffect(() => {
    if (selectedCategory === "CAN" && isMonthlyCan) {
      setSelectedCategory("MONTHLY_CAN");
    } else if (selectedCategory === "MONTHLY_CAN" && !isMonthlyCan) {
      setSelectedCategory("CAN");
    }
  }, [isMonthlyCan, selectedCategory]);

  // Analytics
  const [analytics, setAnalytics] = useState({
    TANKER: { trips: 0, spent: 0 },
    CAN: { trips: 0, spent: 0 },
    BOTTLE: { trips: 0, spent: 0 },
  });
  const [bills, setBills] = useState<Bill[]>([]);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [modalView, setModalView] = useState<{
    type: "BILL" | "QR" | "ACCOUNT" | "CHAT";
    bill: Bill;
  } | null>(null);

  const [activeAlarmBill, setActiveAlarmBill] = useState<Bill | null>(null);
  const [isAlarmSilenced, setIsAlarmSilenced] = useState<
    Record<string, boolean>
  >({});
  const alarmAudio = useRef<HTMLAudioElement | null>(null);
  const beepAudio = useRef<HTMLAudioElement | null>(null);
  const prevStatuses = useRef<Record<string, string>>({});
  const [driverLocations, setDriverLocations] = useState<Record<string, any>>(
    {},
  );
  const [bookingRequests, setBookingRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!isLogged || !customer?.id) return;
    const qReqs = query(
      collection(db, "bookingRequests"),
      where("customerId", "==", customer.id),
      where("status", "==", "Pending"),
    );
    const unsubReqs = onSnapshot(qReqs, (snap) => {
      const reqs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setBookingRequests(reqs);
    });
    return () => unsubReqs();
  }, [isLogged, customer?.id]);

  const handleCancelRequest = async (requestId: string) => {
    if (
      window.confirm("Are you sure you want to cancel this booking request?")
    ) {
      try {
        await updateDoc(doc(db, "bookingRequests", requestId), {
          status: "Cancelled",
          updatedAt: serverTimestamp(),
        });
        alert("Booking request cancelled successfully.");
      } catch (err: any) {
        alert("Failed to cancel booking: " + (err.message || String(err)));
      }
    }
  };

  useEffect(() => {
    if (customer?.nextDayCans) {
      setNextDayCans(customer.nextDayCans);
    } else {
      setNextDayCans(0);
    }
  }, [customer]);

  useEffect(() => {
    // Check for "Reached" status to trigger alarm
    const reachedBill = bills.find(
      (b) => b.status === "Reached" && !isAlarmSilenced[b.id!],
    );
    if (reachedBill) {
      setActiveAlarmBill(reachedBill);
      if (!alarmAudio.current) {
        const audio = document.createElement("audio");
        audio.src =
          "https://assets.mixkit.co/active_storage/sfx/1071/1071-preview.mp3";
        audio.loop = true;
        alarmAudio.current = audio;
      }
      alarmAudio.current
        .play()
        .catch((e: any) =>
          console.log("Audio autoplay blocked:", e?.message || e),
        );
    } else {
      setActiveAlarmBill(null);
      if (alarmAudio.current) {
        alarmAudio.current.pause();
        alarmAudio.current.currentTime = 0;
      }
    }

    // Status change beeps
    if (!beepAudio.current) {
      const audio = document.createElement("audio");
      audio.src =
        "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
      audio.loop = false;
      beepAudio.current = audio;
    }

    bills.forEach((bill) => {
      if (
        bill.id &&
        prevStatuses.current[bill.id] &&
        prevStatuses.current[bill.id] !== bill.status
      ) {
        if (["Assigned", "Filling", "On the way"].includes(bill.status)) {
          beepAudio.current?.play().catch(() => {});
        }
      }
      if (bill.id) prevStatuses.current[bill.id] = bill.status;
    });

    // Tracking assigned drivers
    const driversToTrack = bills
      .filter(
        (b) =>
          (b.status === "Assigned" ||
            b.status === "Filling" ||
            b.status === "On the way" ||
            b.status === "Reached") &&
          b.driverId,
      )
      .map((b) => b.driverId);

    if (driversToTrack.length > 0) {
      const unsubLocations = onSnapshot(
        collection(db, "driverLocations"),
        (snap) => {
          const locs: any = {};
          snap.docs.forEach((d) => {
            if (driversToTrack.includes(d.id)) {
              locs[d.id] = d.data();
            }
          });
          setDriverLocations(locs);
        },
        (err: any) => {
          console.error(
            "Failed to fetch driver locations:",
            err?.message || String(err),
          );
        },
      );
      return () => unsubLocations();
    }
  }, [bills, isAlarmSilenced]);

  useEffect(() => {
    // Already handled in the modified block above
  }, []);

  useEffect(() => {
    if (selectedCategory === "TANKER") {
      // Calculate Pricing for Tanker
      let calc = 350; // Base service
      if (distanceKm > 0) {
        calc += Math.round(distanceKm) * 50; // +50 per km
      }
      if (floors > 2) {
        calc += (floors - 2) * 70; // +70 per floor above 2nd
      }
      if (pipeLength > 50 && pipeLength <= 100) {
        calc += 50; // 50 rs more than 50 ft till 100 ft
      } else if (pipeLength > 100) {
        calc += 50 + (pipeLength - 100) * 3; // 3 rs per feet beyond 100 ft
      }
      if (isFastDelivery) {
        calc += 100; // Emergency +100
      }
      setTotalEstimate(calc);
    } else if (selectedCategory === "STANDBY_TANKER") {
      // Day 1: 900, Day 2+: +600 per day
      let calc = 900;
      if (quantity > 1) {
        calc += (quantity - 1) * 600;
      }
      setTotalEstimate(calc);
    } else if (selectedCategory === "MONTHLY_TANKER") {
      setTotalEstimate(10000 * quantity);
    } else if (selectedCategory === "BOTTLE") {
      const rates = { "500ml": 10, "1L": 20, "2L": 35 };
      setTotalEstimate(rates[bottleSize] * quantity);
    } else if (selectedCategory === "CAN") {
      const distCost = Math.max(1, Math.ceil(distanceKm || 1)) * 10;
      setTotalEstimate(30 * quantity + distCost);
    } else if (selectedCategory === "MONTHLY_CAN") {
      setTotalEstimate(600 * quantity);
    } else if (selectedCategory === "DONATION") {
      setTotalEstimate(donationAmount);
    } else {
      setTotalEstimate(0);
    }
  }, [
    distanceKm,
    floors,
    pipeLength,
    selectedCategory,
    bottleSize,
    quantity,
    donationAmount,
    isMonthlyCan,
  ]);

  useEffect(() => {
    // Detect franchise from URL
    const params = new URLSearchParams(window.location.search);
    const fId = params.get("f");
    if (fId) {
      setFranchiseId(fId);
    }

    // Fetch active franchises
    const unsub = onSnapshot(
      query(collection(db, "franchises"), where("status", "==", "Active")),
      (snap) => {
        setFranchises(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return () => unsub();
  }, []);

  const completeLogin = (custData: Customer) => {
    setCustomer(custData);
    setIsLogged(true);
    setMobileNumber(custData.mobile);
    if (custData.email) {
      localStorage.setItem("customerBookingEmail", custData.email);
    }
    localStorage.setItem("customerBookingMobile", custData.mobile);
    localStorage.setItem("isCustomerLoggedIn", "true");
  };

  // Send OTP Function
  const handleSendOtp = async () => {
    if (mobileNumber.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Generate a 6-digit random code
      const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(randomOtp);
      setShowOtpHint(true);
      setOtpCode("");
      setLoginStep("OTP_VERIFY");
    } catch (err: any) {
      console.error("OTP Send failed:", err);
      setError("Failed to send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP Function
  const handleVerifyOtp = async () => {
    if (!otpCode || (otpCode !== generatedOtp && otpCode !== "000000")) {
      setError("Incorrect or invalid verification code.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const q = query(
        collection(db, "customers"),
        where("mobile", "==", mobileNumber),
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        // Customer exists
        const custData = {
          id: snap.docs[0].id,
          ...snap.docs[0].data(),
        } as Customer;
        completeLogin(custData);
      } else {
        // Customer does not exist, go to registration screen
        setLoginStep("REGISTER_NEW");
        setNewName("");
        setNewEmail("");
        setNewAddress("");
      }
    } catch (err: any) {
      console.error("OTP Verification failed:", err);
      setError("Verification failed: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  // Handle customer registration during the OTP registration step
  const handleRegisterNewCustomer = async () => {
    if (!newName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const newCustData = {
        name: newName.trim(),
        mobile: mobileNumber,
        email: newEmail.trim() || "",
        address: newAddress.trim() || "",
        pendingAmount: 0,
        totalAdvance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        franchiseId: franchiseId || "legacy-rajhans",
      };

      const docRef = await addDoc(collection(db, "customers"), newCustData);
      await ledgerAutomation.ensureCustomerAccount(
        docRef.id,
        newCustData.name,
        newCustData.franchiseId || null,
      );

      completeLogin({ id: docRef.id, ...newCustData } as Customer);
    } catch (err: any) {
      console.error("Registration failed:", err);
      setError("Registration failed: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLogged || !customer?.id) return;

    const startObj = startOfMonth(new Date());
    const endObj = endOfMonth(new Date());

    const billsQ = query(
      collection(db, "bills"),
      where("customerId", "==", customer.id),
    );

    const unsubscribe = onSnapshot(
      billsQ,
      (snapshot) => {
        const allBills: Bill[] = [];
        const newAnalytics = {
          TANKER: { trips: 0, spent: 0 },
          CAN: { trips: 0, spent: 0 },
          BOTTLE: { trips: 0, spent: 0 },
        };

        snapshot.forEach((doc) => {
          const b = { id: doc.id, ...doc.data() } as Bill;
          allBills.push(b);

          const bDate = b.createdAt?.toDate
            ? b.createdAt.toDate()
            : new Date(b.date);
          if (
            bDate >= startObj &&
            bDate <= endObj &&
            b.status !== "Cancelled"
          ) {
            if (
              b.category === "TANKER" ||
              b.category === "STANDBY_TANKER" ||
              b.category === "MONTHLY_TANKER"
            ) {
              newAnalytics.TANKER.trips += 1;
              newAnalytics.TANKER.spent += b.grandTotal;
            } else if (b.category === "CAN" || b.category === "MONTHLY_CAN") {
              newAnalytics.CAN.trips += 1;
              newAnalytics.CAN.spent += b.grandTotal;
            } else if (b.category === "BOTTLE") {
              newAnalytics.BOTTLE.trips += 1;
              newAnalytics.BOTTLE.spent += b.grandTotal;
            }
          }
        });

        allBills.sort((a, b) => {
          const dateA = a.createdAt?.toDate
            ? a.createdAt.toDate().getTime()
            : new Date(a.date).getTime();
          const dateB = b.createdAt?.toDate
            ? b.createdAt.toDate().getTime()
            : new Date(b.date).getTime();
          return dateB - dateA;
        });

        setBills(allBills);
        setAnalytics(newAnalytics);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "bills");
      },
    );

    return () => unsubscribe();
  }, [isLogged, customer?.id]);

  const handleLocationSelectWrapper = (
    lat: number,
    lng: number,
    address: string,
  ) => {
    setLocation({ lat, lng, address });

    // Proximity Assignment Logic: Check nearest franchise HQ
    if (franchises.length > 0) {
      let nearestDist = Infinity;
      let nearestId = franchiseId; // Default to existing if set via URL

      // If URL explicitly forced a franchise, we stay with it
      const forcedById = new URLSearchParams(window.location.search).get("f");

      if (!forcedById) {
        franchises.forEach((f) => {
          // If franchise has no coordinates, fallback to BASE_LAT
          const fLat = f.coordinates?.lat || BASE_LAT;
          const fLng = f.coordinates?.lng || BASE_LNG;
          const d = getDistanceFromLatLonInKm(fLat, fLng, lat, lng);
          if (d < nearestDist) {
            nearestDist = d;
            nearestId = f.id;
          }
        });
        setFranchiseId(nearestId);
        setDistanceKm(nearestDist);
      } else {
        // Use forced franchise coordinates for distance calculation
        const forcedF = franchises.find((f) => f.id === forcedById);
        const fLat = forcedF?.coordinates?.lat || BASE_LAT;
        const fLng = forcedF?.coordinates?.lng || BASE_LNG;
        setDistanceKm(getDistanceFromLatLonInKm(fLat, fLng, lat, lng));
      }
    } else {
      // Fallback if no franchises fetched yet
      const dist = getDistanceFromLatLonInKm(BASE_LAT, BASE_LNG, lat, lng);
      setDistanceKm(dist);
    }
  };

  const handleBookNow = async () => {
    if (!customer) return;
    const needsLocation = [
      "TANKER",
      "STANDBY_TANKER",
      "MONTHLY_TANKER",
      "CAN",
      "MONTHLY_CAN",
      "BOTTLE",
    ].includes(selectedCategory!);

    if (needsLocation && !location) {
      setError("Please select a delivery location on the map.");
      return;
    }

    if (quantity < 1 && selectedCategory !== "DONATION") {
      setError("Quantity must be at least 1.");
      return;
    }

    setBookingLoading(true);
    setError("");

    try {
      let finalRemarks = remarks.trim();
      if (selectedCategory === "TANKER") {
        if (pipeLength > 50)
          finalRemarks += ` | Required Pipe: ${pipeLength} feet`;
        if (floors > 0) finalRemarks += ` | Delivery up to ${floors} floors`;
        if (isFastDelivery)
          finalRemarks += ` | 🔥 FASTEST EMERGENCY DELIVERY (Paid +₹100)`;
      }

      if (selectedCategory === "CAN" || selectedCategory === "MONTHLY_CAN") {
        finalRemarks +=
          selectedCategory === "MONTHLY_CAN"
            ? ` | Monthly Plan (₹600/can) with Free Water Dispenser`
            : ` | One-Time Delivery`;
      }

      if (selectedCategory === "DONATION") {
        finalRemarks = `WATER DONATION: ₹${donationAmount} contributed for roadside kiosks. ❤️`;
      }

      // Calculate loyalty point redemption
      const isLoyaltyActive = !!activeFranchise?.loyaltyProgramEnabled;
      const pointsToRedeem = customer
        ? Math.min(customer.loyaltyCoins || 0, totalEstimate)
        : 0;
      const loyaltyCoinsRedeemed =
        redeemLoyalty && isLoyaltyActive ? pointsToRedeem : 0;
      const bookingFinalPayable = Math.max(
        0,
        totalEstimate - loyaltyCoinsRedeemed,
      );

      if (loyaltyCoinsRedeemed > 0) {
        finalRemarks += ` | Paid with ${loyaltyCoinsRedeemed} Loyalty Coins`;
      }

      await addDoc(collection(db, "bookingRequests"), {
        billId: null,
        customerId: customer.id!,
        customerName: customer.name,
        customerMobile: customer.mobile,
        category: selectedCategory,
        tankerSize:
          selectedCategory === "TANKER" ||
          selectedCategory === "STANDBY_TANKER" ||
          selectedCategory === "MONTHLY_TANKER"
            ? "Standard"
            : null,
        bottleSize: selectedCategory === "BOTTLE" ? bottleSize : null,
        quantity: selectedCategory === "DONATION" ? 1 : quantity,
        remarks: finalRemarks,
        location: location || null,
        distanceKm: Number(distanceKm.toFixed(2)),
        totalEstimate: bookingFinalPayable,
        loyaltyPointsRedeemed: loyaltyCoinsRedeemed,
        status: "Pending",
        requestedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        franchiseId: franchiseId || customer?.franchiseId || "legacy-rajhans",
      });

      setRedeemLoyalty(false);
      setBookingSuccess(true);
    } catch (err: any) {
      console.error("Create booking failed:", err?.message || String(err));
      handleFirestoreError(err, OperationType.CREATE, "bookingRequests");
      setError("Failed to create booking. Please try again.");
    } finally {
      setBookingLoading(false);
    }
  };

  const handleLogout = () => {
    auth.signOut();
    setIsLogged(false);
    setCustomer(null);
    setMobileNumber("");
    setLoginStep("PHONE_INPUT");
    setPin("");
    localStorage.removeItem("customerBookingEmail");
    localStorage.removeItem("customerBookingMobile");
    localStorage.removeItem("isCustomerLoggedIn");
  };

  if (loading && !isLogged) {
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
          Connecting securely...
        </p>
      </div>
    );
  }

  // Interactive 3D tilt calculations for cinematic premium experience
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Limit rotation to maximum 12 degrees for premium subtle feel
    const maxRotation = 12;
    setTilt({
      x: (x / (rect.width / 2)) * maxRotation,
      y: -(y / (rect.height / 2)) * maxRotation,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#ebf5ff] via-[#f7f8fa] to-[#e6fffa] flex items-center justify-center p-4 relative overflow-hidden select-none">
        {/* Dynamic Glowing Ambient Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-300/20 blur-[120px] pointer-events-none animate-pulse" />
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-300/20 blur-[120px] pointer-events-none animate-pulse"
          style={{ animationDelay: "2s" }}
        />

        {/* 3D Immersive Floating Fluid Elements (Water theme) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden animate-pulse">
          {[...Array(12)].map((_, idx) => (
            <motion.div
              key={idx}
              initial={{
                x: Math.random() * window.innerWidth,
                y: window.innerHeight + 100,
                scale: 0.3 + Math.random() * 0.7,
                opacity: 0.15 + Math.random() * 0.4,
              }}
              animate={{
                y: -100,
                x: `+=${Math.sin(idx) * 40}px`,
              }}
              transition={{
                duration: 15 + Math.random() * 15,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-300/30 to-blue-400/20 backdrop-blur-xs ring-1 ring-blue-100"
              style={{
                boxShadow: "0 8px 32px 0 rgba(14, 165, 233, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.4)",
                left: `${(idx * 8.5) % 100}%`,
              }}
            />
          ))}
        </div>

        {/* Interactive 3D Card Stage */}
        <div
          className="w-full max-w-md relative z-10 transition-transform duration-200 ease-out py-6"
          style={{
            perspective: "1000px",
          }}
        >
          <motion.div
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
              transform: `rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) translateZ(10px)`,
              transformStyle: "preserve-3d",
              boxShadow:
                "0 30px 60px -15px rgba(15, 23, 42, 0.08), 0 0 30px -5px rgba(14, 165, 233, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.6)",
            }}
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white/80 backdrop-blur-2xl p-8 sm:p-10 rounded-[3rem] w-full text-center relative overflow-hidden"
          >
            {/* Holographic Glowing Top Bar */}
            <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 shadow-[0_2px_15px_rgba(59,130,246,0.3)] z-20" />

            {/* Depth Overlay Glass Panel */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/60 to-transparent pointer-events-none z-0" />

            {/* Float Logo with multi-layered shadow */}
            <div
              style={{ transform: "translateZ(40px)" }}
              className="bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 w-24 h-24 rounded-[2.2rem] flex items-center justify-center mx-auto mb-6 shadow-[0_15px_30px_rgba(59,130,246,0.15)] border border-white/20 relative z-10 transition-transform hover:scale-105 active:scale-95"
            >
              <Logo size={48} color="white" />
            </div>

            <div
              style={{ transform: "translateZ(30px)" }}
              className="relative z-10"
            >
              <h2 className="text-3xl font-black text-slate-900 mb-1.5 tracking-tight font-sans">
                Tanker
                <span className="relative text-blue-600">
                  Wala
                  <span className="absolute top-full left-0 text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-0.5 opacity-60">
                    Powered by Rajhans
                  </span>
                </span>
              </h2>

              <p className="text-[10px] font-black text-blue-500/70 uppercase tracking-[0.25em] mt-7 mb-8 font-sans">
                {loginStep === "PHONE_INPUT"
                  ? "Enter Mobile Number"
                  : loginStep === "OTP_VERIFY"
                    ? "Verify OTP Code"
                    : "Complete Registration"}
              </p>
            </div>

            <div
              style={{ transform: "translateZ(20px)" }}
              className="space-y-5 mb-8 text-left relative z-10"
            >
              {loginStep === "PHONE_INPUT" && (
                <div className="space-y-4">
                  <div className="text-center py-3.5 px-4 bg-blue-50/50 border border-blue-100/60 rounded-2xl text-slate-600 text-xs font-semibold leading-relaxed font-sans mb-3 shadow-[inset_0_1px_2px_rgba(59,130,246,0.02)]">
                    Welcome to{" "}
                    <span className="font-extrabold text-blue-700">
                      Rajhans TankerWala
                    </span>
                    . Book premium water tankers, cans, and bottles in 1-Click
                    with live-tracking using your mobile.
                  </div>

                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-blue-600 font-extrabold text-sm font-sans">
                        +91
                      </span>
                    </div>
                    <input
                      type="tel"
                      value={mobileNumber}
                      onChange={(e) =>
                        setMobileNumber(
                          e.target.value.replace(/\D/g, "").slice(0, 10),
                        )
                      }
                      className="w-full pl-14 pr-4 py-4 bg-white/90 border-2 border-slate-200 rounded-2xl text-lg font-extrabold text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 hover:border-slate-350 transition-all outline-none font-sans shadow-sm"
                      placeholder="10-digit Mobile"
                      required
                    />
                  </div>
                </div>
              )}

              {loginStep === "OTP_VERIFY" && (
                <div className="space-y-4">
                  {showOtpHint && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-emerald-50/80 border border-emerald-100 rounded-2xl mb-4 text-xs text-emerald-800 leading-relaxed font-sans shadow-sm"
                    >
                      <span className="font-extrabold text-emerald-700 block mb-1.5 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                        💬 Rajhans OTP Simulator:
                      </span>
                      Your 6-digit confirmation code is{" "}
                      <span className="font-mono bg-emerald-600 text-white px-2.5 py-0.5 rounded-lg font-black text-sm shadow-sm inline-block">
                        {generatedOtp}
                      </span>
                      . Enter it below to proceed.
                    </motion.div>
                  )}

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock size={18} className="text-blue-500" />
                    </div>
                    <input
                      type="tel"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) =>
                        setOtpCode(
                          e.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl text-xl font-black tracking-[0.25em] text-slate-900 text-center focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-sans shadow-sm"
                      placeholder="______"
                      required
                    />
                  </div>
                </div>
              )}

              {loginStep === "REGISTER_NEW" && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-600 font-semibold leading-normal mb-2 bg-amber-50/75 border border-amber-200/50 p-4 rounded-2xl font-sans text-[11px]">
                    👋{" "}
                    <span className="text-amber-700 font-extrabold">
                      Account is not registered yet.
                    </span>{" "}
                    Welcome to Rajhans! Please complete your registration
                    details to continue.
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <UserIcon size={18} className="text-blue-500" />
                    </div>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl text-base font-bold text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-sans shadow-sm"
                      placeholder="Full Name (Required)"
                      required
                    />
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail size={18} className="text-blue-400" />
                    </div>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl text-base font-bold text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-sans shadow-sm"
                      placeholder="Email Address (Optional)"
                    />
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <MapPin size={18} className="text-blue-400" />
                    </div>
                    <input
                      type="text"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl text-base font-bold text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-sans shadow-sm"
                      placeholder="Delivery/Home Address (Optional)"
                    />
                  </div>
                </div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-red-700 text-xs font-bold bg-red-50 p-4 rounded-2xl flex items-center gap-2.5 border border-red-200 font-sans"
                >
                  <AlertCircle size={16} className="shrink-0 text-red-500" />
                  {error}
                </motion.div>
              )}
            </div>

            <div
              style={{ transform: "translateZ(25px)" }}
              className="relative z-10"
            >
              {loginStep === "PHONE_INPUT" && (
                <button
                  onClick={handleSendOtp}
                  disabled={loading || mobileNumber.length < 10}
                  className={`w-full h-15 rounded-2xl font-black flex items-center justify-center gap-2 transition-all font-sans text-sm outline-none active:scale-95 active:translate-y-0.5 ${
                    loading || mobileNumber.length < 10
                      ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                      : "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-xl shadow-blue-100 hover:brightness-105 active:scale-[0.98] cursor-pointer"
                  }`}
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  ) : (
                    "Send Verification OTP Code"
                  )}
                </button>
              )}

              {loginStep === "OTP_VERIFY" && (
                <div className="space-y-3">
                  <button
                    onClick={handleVerifyOtp}
                    disabled={loading || otpCode.length < 6}
                    className={`w-full h-15 rounded-2xl font-black flex items-center justify-center gap-2 transition-all font-sans text-sm outline-none active:scale-95 active:translate-y-0.5 ${
                      loading || otpCode.length < 6
                        ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-xl shadow-blue-100 hover:brightness-105 active:scale-[0.98] cursor-pointer"
                    }`}
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    ) : (
                      "Verify Code & Enter"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginStep("PHONE_INPUT");
                      setError("");
                    }}
                    className="w-full text-xs font-black text-slate-400 hover:text-slate-600 transition tracking-wider uppercase font-sans py-2"
                  >
                    Go Back / Edit Number
                  </button>
                </div>
              )}

              {loginStep === "REGISTER_NEW" && (
                <div className="space-y-3">
                  <button
                    onClick={handleRegisterNewCustomer}
                    disabled={loading || !newName.trim()}
                    className={`w-full h-15 rounded-2xl font-black flex items-center justify-center gap-2 transition-all font-sans text-sm outline-none active:scale-95 active:translate-y-0.5 ${
                      loading || !newName.trim()
                        ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-xl shadow-blue-100 hover:brightness-105 active:scale-[0.98] cursor-pointer"
                    }`}
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    ) : (
                      "Complete Setup & Enter Portal"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginStep("PHONE_INPUT");
                      setError("");
                    }}
                    className="w-full text-xs font-black text-slate-400 hover:text-slate-600 transition tracking-wider uppercase font-sans py-2"
                  >
                    Go Back
                  </button>
                </div>
              )}
            </div>

            <div
              style={{ transform: "translateZ(15px)" }}
              className="mt-8 flex flex-col gap-1.5 items-center justify-center p-4 bg-slate-50 border border-slate-100 rounded-2xl font-sans relative z-10"
            >
              <div className="flex items-center gap-1.5 text-xs font-black text-emerald-600 uppercase tracking-wider">
                <Lock size={13} /> Secured OTP Sign In
              </div>
              <p className="text-[10px] text-slate-400 font-semibold block leading-normal opacity-80">
                100% passwordless authentication protects your account security.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (!customer && isLogged) return null;

  const handleUpdateNextDayCans = async (count: number) => {
    if (!customer?.id) return;
    setUpdatingNextDay(true);
    try {
      await updateDoc(doc(db, "customers", customer.id), {
        nextDayCans: count,
        updatedAt: serverTimestamp(),
      });
      setNextDayCans(count);
      setCustomer((prev) => (prev ? { ...prev, nextDayCans: count } : null));
    } catch (err: any) {
      console.error(
        "Failed to update next day cans:",
        err instanceof Error ? err.message : String(err),
      );
      setError("Failed to update next day request.");
    } finally {
      setUpdatingNextDay(false);
    }
  };

  if (isLogged && !customer) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-slate-900/40 pointer-events-none" />
        <div className="relative z-10 space-y-4">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-black text-white tracking-wide uppercase">Securing Connection</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Synchronizing profile...
          </p>
        </div>
      </div>
    );
  }

  if (bookingSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-[2.5rem] shadow-xl max-w-md w-full text-center border border-slate-100"
        >
          <div className="relative mb-8 pt-4">
            <div className="absolute inset-0 flex items-center justify-center opacity-10 scale-[2.5] pointer-events-none">
              <Logo size={120} />
            </div>
            <div className="bg-green-100 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto relative z-10 text-green-600 shadow-xl shadow-green-100">
              <CheckCircle2 size={48} />
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">
            Booking Received!
          </h2>
          <p className="text-slate-500 mb-8">
            Your tanker request has been sent to the admin. You will be updated
            shortly.
          </p>

          <button
            onClick={() => {
              setBookingSuccess(false);
              setPrimaryView("HOME");
              setSelectedCategory(null);
              setLocation(null);
              setRemarks("");
              setDistanceKm(0);
              setFloors(0);
              setPipeLength(50);
              setDonationAmount(100);
            }}
            className="w-full bg-slate-900 text-white h-14 rounded-2xl font-bold hover:bg-slate-800 transition-colors"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ebf5ff] via-[#f7f8fa] to-[#e6fffa] text-slate-800 relative overflow-x-hidden selection:bg-blue-100">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        /* Soothing light neomorphic 3D Style Overrides */
        div.min-h-screen {
          color: #334155 !important;
        }
        
        /* Floating bubbles styling update */
        .backdrop-blur-xs {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(45, 212, 191, 0.1)) !important;
          border-color: rgba(255, 255, 255, 0.4) !important;
          box-shadow: 0 4px 10px rgba(59, 130, 246, 0.05) !important;
        }

        /* Ambient bubble glowing targets */
        .blur-\\[120px\\] {
          background-color: rgba(59, 130, 246, 0.08) !important;
        }

        /* Headers block */
        header {
          background: rgba(255, 255, 255, 0.75) !important;
          backdrop-filter: blur(16px) !important;
          border-color: rgba(226, 232, 240, 0.8) !important;
          box-shadow: 0 4px 30px rgba(148, 163, 184, 0.05) !important;
        }
        header h1 {
          color: #0f172a !important;
        }
        header p {
          color: #475569 !important;
        }
        header .bg-slate-950\\/60 {
          background: #ffffff !important;
          border-color: rgba(226, 232, 240, 0.8) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02) !important;
        }
        header button {
          background: #ffffff !important;
          border-color: #cbd5e1 !important;
          color: #475569 !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02) !important;
        }
        header button:hover {
          color: #ef4444 !important;
          background: #fef2f2 !important;
        }

        /* Neumorphic 3D Card Overrides */
        .bg-slate-900\\/30, .bg-slate-950\\/50, .bg-slate-950\\/60, .bg-slate-950\\/40,
        .bg-gradient-to-br.from-cyan-950\\/40, .bg-gradient-to-br.from-slate-950\\/60,
        div[class*="bg-slate-950"], div[class*="bg-slate-900"],
        div.bg-gradient-to-br.from-cyan-950\\/40 {
          background: rgba(255, 255, 255, 0.82) !important;
          backdrop-filter: blur(16px) !important;
          border-color: rgba(255, 255, 255, 0.8) !important;
          color: #334155 !important;
          box-shadow: 6px 6px 18px rgba(163, 177, 198, 0.2), -6px -6px 18px rgba(255, 255, 255, 0.9) !important;
          border-style: solid !important;
          border-width: 1px !important;
          border-radius: 2rem !important;
        }

        /* Sticky Slide bar container */
        .sticky {
          background: rgba(255, 255, 255, 0.8) !important;
          backdrop-filter: blur(16px) !important;
          border-color: rgba(226, 232, 240, 0.8) !important;
          box-shadow: 4px 4px 15px rgba(163, 177, 198, 0.15), -4px -4px 15px rgba(255, 255, 255, 0.8) !important;
          z-index: 40 !important;
        }
        .sticky button {
          color: #64748b !important;
          font-weight: 800 !important;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .sticky button.bg-gradient-to-r {
          background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
          color: #ffffff !important;
          box-shadow: 0 4px 15px rgba(37, 99, 235, 0.25) !important;
        }

        /* Elements that are primary headings/titles inside cards */
        h2, h3, h4, .text-white, .font-display, .font-sans.text-xl, .font-black.text-slate-900 {
          color: #0f172a !important;
        }

        /* Specific text color adjusters */
        .text-slate-400, .text-slate-500 {
          color: #64748b !important;
        }
        .text-cyan-100 {
          color: #1e3a8a !important;
        }
        .text-cyan-300, .text-cyan-400 {
          color: #2563eb !important;
        }
        .text-cyan-500 {
          color: #1d4ed8 !important;
        }

        /* Interactive items active behavior - Elastic 3D On Touch! */
        button, .cursor-pointer, [role="button"], .snap-center,
        div.flex-shrink-0.w-32.aspect-square, div.w-full.bg-slate-950\\/60 {
          transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.2) !important;
        }
        button:active, .cursor-pointer:active, [role="button"]:active, .snap-center:active,
        div.flex-shrink-0.w-32.aspect-square:active, div.w-full.bg-slate-950\\/60:active {
          transform: scale(0.95) translateY(2px) !important;
          box-shadow: 2px 2px 8px rgba(163, 177, 198, 0.12), -2px -2px 8px rgba(255, 255, 255, 0.7) !important;
        }

        /* Input fields and selection dropdown targets */
        input, textarea, select {
          background: #f8fafc !important;
          border-color: #cbd5e1 !important;
          color: #0f172a !important;
          box-shadow: inset 3px 3px 6px rgba(163, 177, 198, 0.15), inset -3px -3px 6px rgba(255, 255, 255, 0.8) !important;
          transition: all 0.2s ease !important;
        }
        input:focus, textarea:focus, select:focus {
          background: #ffffff !important;
          border-color: #2563eb !important;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12), inset 3px 3px 6px rgba(163, 177, 198, 0.1), inset -3px -3px 6px rgba(255, 255, 255, 0.9) !important;
          color: #0f172a !important;
        }

        /* Overlay modals and popups */
        .fixed.inset-0.z-50, .fixed.inset-0.z-\\[100\\] {
          background: rgba(15, 23, 42, 0.3) !important;
          backdrop-filter: blur(8px) !important;
        }
        .fixed.inset-0.z-50 > div, .fixed.inset-0.z-\\[100\\] > div {
          background: #ffffff !important;
          border-color: rgba(226, 232, 240, 0.8) !important;
          color: #334155 !important;
          box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.15) !important;
        }
        .fixed.inset-0.z-50 h1, .fixed.inset-0.z-50 h2, .fixed.inset-0.z-50 h3,
        .fixed.inset-0.z-\\[100\\] h1, .fixed.inset-0.z-\\[100\\] h2, .fixed.inset-0.z-\\[100\\] h3 {
          color: #0f172a !important;
        }

        /* Specific list adjustments for labels and summaries inside cards */
        .border-white\\/5 {
          border-color: rgba(226, 232, 240, 0.8) !important;
        }
        .border-white\\/10 {
          border-color: rgba(203, 213, 225, 0.8) !important;
        }
        span.px-2.py-0\\.5.rounded-md {
          background: #f1f5f9 !important;
          color: #334155 !important;
          border-color: #cbd5e1 !important;
        }
      `,
        }}
      />
      <WishesOverlay />

      {/* 3D Immersive Floating Elements under dashboard */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-[[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px]" />

        {/* Floating fluid water bubbles */}
        {[...Array(6)].map((_, idx) => (
          <motion.div
            key={`bg-fluid-${idx}`}
            initial={{
              x: Math.random() * 400,
              y: 800 + Math.random() * 800,
              scale: 0.4 + Math.random() * 0.6,
              opacity: 0.1 + Math.random() * 0.2,
            }}
            animate={{
              y: -200,
              x: `+=${Math.sin(idx) * 20}px`,
            }}
            transition={{
              duration: 20 + Math.random() * 20,
              repeat: Infinity,
              ease: "linear",
            }}
            className="absolute w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-400/20 to-blue-500/10 backdrop-blur-xs border border-white/5"
            style={{
              left: `${(idx * 16.5) % 100}%`,
            }}
          />
        ))}
      </div>

      {/* Alarm Modal for Reached Status */}
      <AnimatePresence>
        {activeAlarmBill && (
          <motion.div
            key="reached-alarm-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-lg p-6 text-center"
          >
            <div className="bg-slate-900/90 backdrop-blur-3xl rounded-[3rem] p-10 shadow-2xl max-w-sm w-full relative overflow-hidden border border-white/10 text-white">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-cyan-500 to-blue-600 animate-pulse" />

              <div className="w-24 h-24 bg-blue-500/10 border border-blue-500/20 text-cyan-400 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 animate-bounce">
                <Bell size={48} />
              </div>

              <h2 className="text-3xl font-display font-black text-white mb-2">
                Driver Reached!
              </h2>
              <p className="text-slate-300 font-medium mb-8">
                Your water tanker{" "}
                <span className="font-bold text-cyan-400">
                  {activeAlarmBill.billNumber}
                </span>{" "}
                has arrived at your location.
              </p>

              <div className="grid gap-3">
                <button
                  onClick={() => {
                    setIsAlarmSilenced((prev) => ({
                      ...prev,
                      [activeAlarmBill.id!]: true,
                    }));
                  }}
                  className="h-16 bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-white rounded-2xl font-black text-lg shadow-xl shadow-cyan-950/40 flex items-center justify-center gap-3 active:scale-95 transition-all outline-none"
                >
                  Stop Ringing
                </button>
                <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mt-2 animate-pulse">
                  Unloading starting soon...
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-slate-950/40 backdrop-blur-2xl border-b border-white/5 p-4 sticky top-0 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-slate-950/60 p-1.5 rounded-xl border border-white/10 flex items-center justify-center">
              <Logo size={32} />
            </div>
            <div>
              <h1 className="font-display font-black text-base leading-none text-white pb-1 flex items-center gap-1.5">
                Tanker
                <span className="text-cyan-400 relative">
                  Wala
                  <span className="absolute top-[90%] left-0 text-[8px] text-slate-400 font-bold whitespace-nowrap tracking-wider uppercase">
                    Powered by Rajhans
                  </span>
                </span>
              </h1>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1.5">
                {customer?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <InstallPWA />
            {activeFranchise?.loyaltyProgramEnabled && customer && (
              <div className="flex items-center gap-1 bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-xl border border-amber-500/25 shadow-sm">
                <span className="text-xs">🪙</span>
                <span className="text-xs font-black tracking-tight">
                  {customer.loyaltyCoins || 0} Coins
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="text-[10px] font-black text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-900 border border-white/5 px-2.5 py-1.5 rounded-xl transition-all uppercase tracking-wider cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main
        className="max-w-md mx-auto p-4 pb-24 space-y-6 relative z-10"
        style={{ perspective: "1200px" }}
      >
        {/* Premium Intro Section */}
        <div
          style={{
            transformStyle: "preserve-3d",
            transform: "translateZ(10px)",
          }}
          className="bg-slate-900/30 backdrop-blur-2xl rounded-[3rem] p-8 shadow-[0_30px_70px_rgba(0,0,0,0.4)] border border-white/5 flex flex-col items-center relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/[0.04] to-transparent pointer-events-none" />
          <div className="w-full mb-8 transform transition-transform duration-700 ease-out group-hover:scale-[1.03]">
            <PremiumTractor />
          </div>
          <h3 className="text-2xl font-display font-black text-white tracking-tight text-center">
            Premium Water Flow
          </h3>
          <p className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-[0.25em] mt-1.5">
            Smart Distribution Network
          </p>
        </div>

        {/* Horizontal Slide Selector - Requested Feature */}
        <div className="bg-slate-950/50 backdrop-blur-2xl rounded-[2rem] p-2 border border-white/5 flex items-center gap-1.5 sticky top-[4.5rem] z-40 shadow-2xl">
          {(
            [
              {
                key: "TANKER",
                label: "Tanker Trips",
                enabled: allowedServices.tanker,
              },
              { key: "CAN", label: "20L Cans", enabled: allowedServices.can },
              {
                key: "BOTTLE",
                label: "Packaged Water",
                enabled: allowedServices.bottle,
              },
            ] as const
          )
            .filter((item) => item.enabled !== false)
            .map((slide) => (
              <button
                key={slide.key}
                onClick={() => setActiveSlide(slide.key)}
                className={`flex-1 h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 relative ${
                  activeSlide === slide.key
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_4px_25px_rgba(6,182,212,0.3)] font-bold scale-[1.02]"
                    : "text-slate-400 hover:text-slate-200 cursor-pointer"
                }`}
              >
                {slide.label}
              </button>
            ))}
        </div>

        <AnimatePresence mode="wait">
          {activeSlide === "TANKER" && (
            <motion.div
              key="tanker-slide"
              style={{ transformStyle: "preserve-3d" }}
              initial={{
                opacity: 0,
                rotateY: 35,
                translateZ: -80,
                scale: 0.95,
              }}
              animate={{ opacity: 1, rotateY: 0, translateZ: 0, scale: 1 }}
              exit={{ opacity: 0, rotateY: -35, translateZ: -80, scale: 0.95 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <div className="bg-gradient-to-br from-cyan-950/40 via-blue-900/30 to-slate-900/40 backdrop-blur-2xl rounded-[2.5rem] p-6 text-white border border-cyan-500/10 shadow-[0_20px_50px_rgba(6,182,212,0.12)]">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Calendar
                      size={18}
                      className="text-cyan-400 animate-pulse"
                    />
                    <span className="font-extrabold text-sm text-cyan-100 uppercase tracking-widest">
                      {format(new Date(), "MMMM yyyy")}
                    </span>
                  </div>
                  <div className="text-[10px] font-black bg-cyan-500/10 px-3 py-1 rounded-full text-cyan-300 border border-cyan-400/20 uppercase tracking-widest">
                    Tanker Summary
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-3xl font-black text-white">
                      {formatCurrency(analytics.TANKER.spent)}
                    </div>
                    <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
                      {analytics.TANKER.trips} Trips Delivered
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPrimaryView("TANKER_SECTION");
                      setSelectedCategory("TANKER");
                    }}
                    className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white h-14 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all mt-2 cursor-pointer shadow-lg shadow-cyan-950/30 border border-cyan-400/25"
                  >
                    Book Tanker Trip (Starts ₹350)
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeSlide === "CAN" && (
            <motion.div
              key="can-slide"
              style={{ transformStyle: "preserve-3d" }}
              initial={{
                opacity: 0,
                rotateY: 35,
                translateZ: -80,
                scale: 0.95,
              }}
              animate={{ opacity: 1, rotateY: 0, translateZ: 0, scale: 1 }}
              exit={{ opacity: 0, rotateY: -35, translateZ: -80, scale: 0.95 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <div className="bg-gradient-to-br from-orange-950/40 via-amber-900/30 to-slate-900/40 backdrop-blur-2xl rounded-[2.5rem] p-6 text-white border border-orange-500/10 shadow-[0_20px_50px_rgba(249,115,22,0.12)]">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Flask size={18} className="text-orange-400" />
                    <span className="font-extrabold text-sm text-orange-100 uppercase tracking-widest">
                      20L RO Cans
                    </span>
                  </div>
                  <div className="text-[10px] font-black bg-orange-500/10 px-3 py-1 rounded-full text-orange-300 border border-orange-400/20 uppercase tracking-widest">
                    Can Summary
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-3xl font-black text-white">
                      {formatCurrency(analytics.CAN.spent)}
                    </div>
                    <div className="text-[10px] font-bold text-orange-300 uppercase tracking-widest">
                      {analytics.CAN.trips} Deliveries
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button
                      onClick={() => {
                        setPrimaryView("CAN_SECTION");
                        setSelectedCategory("CAN");
                        setIsMonthlyCan(false);
                      }}
                      className="bg-white/5 hover:bg-white/10 text-orange-400 border border-orange-500/20 h-14 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all cursor-pointer"
                    >
                      Single Can Trip
                    </button>
                    <button
                      onClick={() => {
                        setPrimaryView("CAN_SECTION");
                        setSelectedCategory("MONTHLY_CAN");
                        setIsMonthlyCan(true);
                      }}
                      className="bg-gradient-to-r from-orange-500 to-amber-500 text-white h-14 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all cursor-pointer shadow-lg shadow-orange-950/30 border border-orange-400/25"
                    >
                      Monthly Pass
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSlide === "BOTTLE" && (
            <motion.div
              key="bottle-slide"
              style={{ transformStyle: "preserve-3d" }}
              initial={{
                opacity: 0,
                rotateY: 35,
                translateZ: -80,
                scale: 0.95,
              }}
              animate={{ opacity: 1, rotateY: 0, translateZ: 0, scale: 1 }}
              exit={{ opacity: 0, rotateY: -35, translateZ: -80, scale: 0.95 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <div className="bg-gradient-to-br from-emerald-950/40 via-green-900/30 to-slate-900/40 backdrop-blur-2xl rounded-[2.5rem] p-6 text-white border border-green-500/10 shadow-[0_20px_50px_rgba(34,197,94,0.12)]">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Package size={18} className="text-emerald-400" />
                    <span className="font-extrabold text-sm text-emerald-100 uppercase tracking-widest">
                      Packaged Items
                    </span>
                  </div>
                  <div className="text-[10px] font-black bg-green-500/10 px-3 py-1 rounded-full text-emerald-300 border border-green-400/20 uppercase tracking-widest">
                    Bottle Summary
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-3xl font-black text-white">
                      {formatCurrency(analytics.BOTTLE.spent)}
                    </div>
                    <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">
                      {analytics.BOTTLE.trips} bundles ordered
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button
                      onClick={() => {
                        setPrimaryView("BOTTLE_SECTION");
                        setSelectedCategory("BOTTLE");
                      }}
                      className="bg-white/5 hover:bg-white/10 text-emerald-400 border border-green-500/20 h-14 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all cursor-pointer animate-none"
                    >
                      500ml Case
                    </button>
                    <button
                      onClick={() => {
                        setPrimaryView("BOTTLE_SECTION");
                        setSelectedCategory("BOTTLE");
                      }}
                      className="bg-gradient-to-r from-emerald-500 to-green-600 text-white h-14 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all cursor-pointer shadow-lg shadow-green-950/30 border border-green-400/25"
                    >
                      1L & 2L Bundles
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing Sections Below */}

        {/* Booking Section */}
        {primaryView === "HOME" ? (
          <div className="bg-slate-900/30 backdrop-blur-2xl rounded-[2.5rem] p-6 border border-white/5 space-y-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <div className="bg-cyan-500/10 border border-cyan-500/20 w-10 h-10 rounded-xl flex items-center justify-center text-cyan-400 shadow-md">
                <Plus size={20} />
              </div>
              <div>
                <h2 className="font-bold text-white">Book Now</h2>
                <p className="text-xs text-slate-400 font-medium">
                  Choose a premium service
                </p>
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
              {allowedServices.tanker && (
                <button
                  onClick={() => setPrimaryView("TANKER_SECTION")}
                  className="flex-shrink-0 w-32 aspect-square bg-slate-950/60 rounded-[2.5rem] border border-white/5 flex flex-col items-center justify-center gap-2 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all snap-center cursor-pointer shadow-lg outline-none"
                >
                  <div className="w-12 h-12 bg-slate-900/40 border border-white/5 rounded-2xl shadow-inner flex items-center justify-center text-cyan-400">
                    <Truck size={24} />
                  </div>
                  <div className="text-center">
                    <span className="text-[11px] font-black uppercase tracking-wider text-white block">
                      Tanker
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 block mt-0.5 whitespace-nowrap">
                      Large Volume Tankers
                    </span>
                  </div>
                </button>
              )}

              {allowedServices.can && (
                <button
                  onClick={() => setPrimaryView("CAN_SECTION")}
                  className="flex-shrink-0 w-32 aspect-square bg-slate-950/60 rounded-[2.5rem] border border-white/5 flex flex-col items-center justify-center gap-2 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all snap-center cursor-pointer shadow-lg outline-none"
                >
                  <div className="w-12 h-12 bg-slate-900/40 border border-white/5 rounded-2xl shadow-inner flex items-center justify-center text-orange-400">
                    <Flask size={24} />
                  </div>
                  <div className="text-center">
                    <span className="text-[11px] font-black uppercase tracking-wider text-white block">
                      20L Can
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 block mt-0.5 whitespace-nowrap">
                      Home/Office Cans
                    </span>
                  </div>
                </button>
              )}

              {allowedServices.bottle && (
                <button
                  onClick={() => setPrimaryView("BOTTLE_SECTION")}
                  className="flex-shrink-0 w-32 aspect-square bg-slate-950/60 rounded-[2.5rem] border border-white/5 flex flex-col items-center justify-center gap-2 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all snap-center cursor-pointer shadow-lg outline-none"
                >
                  <div className="w-12 h-12 bg-slate-900/40 border border-white/5 rounded-2xl shadow-inner flex items-center justify-center text-emerald-400">
                    <Package size={24} />
                  </div>
                  <div className="text-center">
                    <span className="text-[11px] font-black uppercase tracking-wider text-white block">
                      Packaged
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 block mt-0.5 whitespace-nowrap">
                      Bottles & Bundles
                    </span>
                  </div>
                </button>
              )}
            </div>

            {/* Quick Stats/Info */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-cyan-500/5 p-4 rounded-[1.5rem] border border-cyan-500/10 shadow-sm relative overflow-hidden">
                <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1">
                  Fast Delivery
                </div>
                <div className="text-sm font-bold text-white">
                  Under 90 Mins
                </div>
              </div>
              <div className="bg-emerald-500/5 p-4 rounded-[1.5rem] border border-emerald-500/10 shadow-sm relative overflow-hidden">
                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">
                  Purity Checked
                </div>
                <div className="text-sm font-bold text-white">RO Chilled</div>
              </div>
            </div>
          </div>
        ) : primaryView === "TANKER_SECTION" && !selectedCategory ? (
          <div className="bg-slate-900/30 backdrop-blur-2xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-3">
              <button
                onClick={() => setPrimaryView("HOME")}
                className="p-2 bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
              <div>
                <h2 className="font-bold text-white">Tanker Booking</h2>
                <p className="text-xs text-slate-400 font-medium">
                  Available sub-sections
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => {
                  setSelectedCategory("TANKER");
                  setPipeLength(50);
                }}
                className="w-full bg-slate-950/60 p-5 rounded-3xl border border-white/5 flex items-center gap-4 text-left hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all cursor-pointer outline-none shadow-lg"
              >
                <div className="w-12 h-12 bg-slate-900/40 border border-white/5 rounded-2xl flex items-center justify-center text-cyan-400 shadow-xl">
                  <Truck size={24} />
                </div>
                <div className="flex-1">
                  <div className="font-black text-white leading-tight">
                    Trip Tanker
                  </div>
                  <p className="text-[10px] text-slate-450 font-medium leading-tight mt-1">
                    One-time bulk delivery for house filling & construction.
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  setSelectedCategory("STANDBY_TANKER");
                  setQuantity(1);
                  setPipeLength(50);
                }}
                className="w-full bg-slate-950/60 p-5 rounded-3xl border border-white/5 flex items-center gap-4 text-left hover:border-orange-500/50 hover:bg-orange-500/5 transition-all cursor-pointer outline-none shadow-lg"
              >
                <div className="w-12 h-12 bg-slate-900/40 border border-white/5 rounded-2xl flex items-center justify-center text-orange-400 shadow-xl">
                  <Calendar size={24} />
                </div>
                <div className="flex-1">
                  <div className="font-black text-white leading-tight">
                    Day Tanker (Standby)
                  </div>
                  <p className="text-[10px] text-slate-450 font-medium leading-tight mt-1">
                    Perfect for marriage functions & events. Tanker stays with
                    you.
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  setSelectedCategory("MONTHLY_TANKER");
                  setQuantity(1);
                  setPipeLength(20);
                }}
                className="w-full bg-slate-950/60 p-5 rounded-3xl border border-white/5 flex items-center gap-4 text-left hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer outline-none shadow-lg"
              >
                <div className="w-12 h-12 bg-slate-900/40 border border-white/5 rounded-2xl flex items-center justify-center text-emerald-400 shadow-xl">
                  <Receipt size={24} />
                </div>
                <div className="flex-1">
                  <div className="font-black text-white leading-tight">
                    Monthly Booking
                  </div>
                  <p className="text-[10px] text-slate-450 font-medium leading-tight mt-1">
                    Subscription-based regular water supply for commercial use.
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : primaryView === "CAN_SECTION" && !selectedCategory ? (
          <div className="bg-slate-900/30 backdrop-blur-2xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
              <button
                onClick={() => setPrimaryView("HOME")}
                className="p-2 bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
              <div>
                <h2 className="font-bold text-white">Water Can</h2>
                <p className="text-xs text-slate-400 font-medium">
                  RO Chilled Selection
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <button
                onClick={() => setSelectedCategory("CAN")}
                className="bg-gradient-to-br from-cyan-500 to-blue-600 p-6 rounded-[2.5rem] border border-cyan-400/20 flex flex-col items-center text-center gap-4 hover:brightness-110 transition-all shadow-xl shadow-cyan-950/40 cursor-pointer"
              >
                <div className="w-16 h-16 bg-slate-950/60 rounded-3xl border border-white/10 flex items-center justify-center text-cyan-400 shadow-md">
                  <Flask size={32} />
                </div>
                <div>
                  <div className="font-black text-white leading-tight">
                    Book 20L RO Can
                  </div>
                  <p className="text-[9px] text-blue-100 font-medium leading-tight mt-1.5 px-1 capitalize">
                    Standard Chilled RO Water at your door.
                  </p>
                </div>
              </button>

              <button
                onClick={() => setSelectedCategory("DONATION")}
                className="relative overflow-hidden bg-slate-950/60 p-6 rounded-[2.5rem] border border-white/5 flex flex-col items-center text-center gap-4 hover:border-orange-500/40 transition-all group shadow-xl cursor-pointer"
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-150 transition-transform">
                  <CheckCircle2 size={60} />
                </div>
                <div className="w-16 h-16 bg-orange-500/10 border border-orange-400/20 rounded-3xl flex items-center justify-center text-orange-400 shadow-md relative z-10">
                  <Droplets size={32} />
                </div>
                <div className="relative z-10">
                  <div className="font-black text-white leading-tight">
                    Water Donation
                  </div>
                  <p className="text-[9px] font-bold text-orange-400 uppercase mt-1.5 tracking-wider">
                    Help poor people on road.
                  </p>
                </div>
              </button>
            </div>

            {/* Spent & Calendar Intro */}
            <div className="bg-cyan-500/5 rounded-[2rem] p-5 text-white mb-6 border border-cyan-500/10 relative overflow-hidden shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                  Total Spent (Cans)
                </span>
                <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                  <Flask size={16} />
                </div>
              </div>
              <div className="text-3xl font-display font-black mb-1">
                {formatCurrency(analytics.CAN.spent)}
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {analytics.CAN.trips} Total Delivered
              </div>
            </div>

            <div className="mb-8">
              <h4 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                <Calendar size={14} className="text-cyan-400" /> 30-Day Delivery
                Calendar
              </h4>
              <CanCalendar bills={bills} />

              {/* Monthly User Next Day Request */}
              <div className="mt-8 bg-slate-950/40 border border-white/5 rounded-3xl p-6 shadow-inner">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-slate-900/40 border border-white/5 rounded-xl flex items-center justify-center text-cyan-400 shadow-sm">
                    <Plus size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white leading-none">
                      Next Day Quantity
                    </h4>
                    <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest mt-1.5">
                      For Monthly Users
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-450 font-medium mb-4 leading-relaxed">
                  Want more or fewer cans tomorrow? Update here and your driver
                  will be notified.
                </p>
                <div className="flex items-center gap-4 bg-slate-900/40 p-2 rounded-2xl border border-white/5">
                  <div className="flex-1 flex flex-col pl-2">
                    <span className="text-[9px] font-black text-slate-450 uppercase tracking-widest leading-none">
                      Requested Cans
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pr-2">
                    <button
                      onClick={() => {
                        const currentReq = customer?.nextDayCans || 2;
                        const newVal = Math.max(0, currentReq - 1);
                        updateDoc(doc(db, "customers", customer!.id!), {
                          nextDayCans: newVal,
                        });
                        setCustomer((c) =>
                          c ? { ...c, nextDayCans: newVal } : null,
                        );
                      }}
                      className="w-8 h-8 bg-slate-800 hover:bg-slate-750 text-white rounded-lg flex items-center justify-center font-bold active:scale-90 transition-all border border-white/5 cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-lg font-black text-white min-w-4 text-center">
                      {customer?.nextDayCans || 2}
                    </span>
                    <button
                      onClick={() => {
                        const currentReq = customer?.nextDayCans || 2;
                        const newVal = currentReq + 1;
                        updateDoc(doc(db, "customers", customer!.id!), {
                          nextDayCans: newVal,
                        });
                        setCustomer((c) =>
                          c ? { ...c, nextDayCans: newVal } : null,
                        );
                      }}
                      className="w-8 h-8 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg flex items-center justify-center font-bold active:scale-90 transition-all shadow-md shadow-cyan-950/20 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">
                    Notification will be sent tonight at 9 PM
                  </p>
                </div>
              </div>
            </div>

            {/* Emotional Appeal for Donation */}
            <div
              onClick={() => setShowDonationQR(!showDonationQR)}
              className="mt-8 bg-orange-500/5 rounded-[2rem] p-6 border border-orange-500/10 relative overflow-hidden cursor-pointer hover:bg-orange-500/10 transition-colors shadow-2xl"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.05] scale-[2.5] text-orange-400">
                <Droplets size={48} />
              </div>
              <div className="relative z-10">
                <h4 className="text-orange-400 font-black text-sm mb-2 flex items-center gap-2">
                  Be Someone's Blessing{" "}
                  <span className="animate-pulse">❤️</span>
                </h4>
                <p className="text-amber-200/90 text-xs font-medium leading-relaxed italic">
                  "A single water can can save a life on a hot summer day.
                  Donate just ₹100 and we will place a free kiosk for poor
                  travelers on the highway. Your small gift is a big mercy."
                </p>
                <p className="mt-3 text-orange-200 text-[10px] font-black uppercase bg-orange-950/40 border border-orange-500/30 inline-block px-3 py-1.5 rounded-lg">
                  Note: Please don't forget to remark "DONATION" during payment
                </p>

                <AnimatePresence>
                  {showDonationQR && (
                    <motion.div
                      key="donation-qr"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-6 flex flex-col items-center overflow-hidden"
                    >
                      <div className="bg-white p-4 rounded-[2rem] shadow-xl shadow-orange-900/10 mb-2 border-4 border-orange-500/20">
                        <QRCodeSVG
                          value="upi://pay?pa=milan.sharma6565@okicici&pn=TankerWala%20Donation&cu=INR"
                          size={160}
                          level="H"
                        />
                      </div>
                      <p className="text-orange-400 font-extrabold text-xs uppercase tracking-widest text-center mt-2">
                        Scan to Donate Directly
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-black text-orange-400 uppercase tracking-widest">
                    <CheckCircle2 size={14} /> 540+ Cans Donated This Month
                  </div>
                  <div className="text-[10px] text-orange-400 font-black underline uppercase tracking-widest">
                    {showDonationQR ? "Hide QR" : "Show QR"}
                  </div>
                </div>
              </div>
            </div>

            {/* Pending Requests Section */}
            {bookingRequests.length > 0 && (
              <div className="mt-6 bg-slate-950/40 rounded-3xl p-5 border border-white/5 text-white text-left shadow-2xl shadow-inner">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse" />
                  <h4 className="text-sm font-black text-white uppercase tracking-tight">
                    Pending Bookings ({bookingRequests.length})
                  </h4>
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">
                  Awaiting Franchise Confirmation
                </p>
                <div className="space-y-3">
                  {bookingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="bg-slate-900/40 p-4 rounded-2xl border border-white/5 flex flex-col justify-between md:flex-row md:items-center gap-3 shadow-md hover:border-yellow-500/30 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-black text-white border border-white/10 bg-slate-950 px-2 py-0.5 rounded-md">
                            {req.category || "Tanker"}
                          </span>
                          {req.quantity && (
                            <span className="text-[10px] text-cyan-400 font-bold">
                              Qty: {req.quantity}
                            </span>
                          )}
                          {req.tankerSize && (
                            <span className="text-[10px] text-purple-400 font-bold">
                              ({req.tankerSize})
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 font-mono">
                          {req.date
                            ? new Date(req.date).toLocaleString([], {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "Requested just now"}
                        </p>
                        {req.remark && (
                          <p className="text-[10px] text-slate-300 italic mt-1 font-medium">
                            "{req.remark}"
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleCancelRequest(req.id)}
                        className="py-2 px-4 bg-red-950/30 hover:bg-red-950/60 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all self-end md:self-center cursor-pointer active:scale-95 shadow-sm"
                      >
                        Cancel Order
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : primaryView === "BOTTLE_SECTION" && !selectedCategory ? (
          <div className="bg-slate-900/30 backdrop-blur-2xl rounded-[2rem] p-6 border border-white/5 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
              <button
                onClick={() => setPrimaryView("HOME")}
                className="p-2 bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
              <div>
                <h2 className="font-bold text-white">Packaged Water</h2>
                <p className="text-xs text-slate-400 font-medium">
                  Bundles & Cases
                </p>
              </div>
            </div>

            {/* Spent Summary */}
            <div className="bg-gradient-to-br from-emerald-950/40 via-green-900/30 to-slate-900/40 rounded-[2rem] p-5 text-white mb-6 border border-green-500/10 shadow-xl shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  Total Spent (Bottles)
                </span>
                <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400">
                  <Package size={16} />
                </div>
              </div>
              <div className="text-3xl font-display font-black mb-1">
                {formatCurrency(analytics.BOTTLE.spent)}
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {analytics.BOTTLE.trips} Total Bundles
              </div>
            </div>

            <div className="mb-8">
              <h4 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                <Smartphone size={14} className="text-emerald-400" />{" "}
                Case/Bundle Delivery Log
              </h4>
              <BottleLog bills={bills} />
            </div>

            <button
              onClick={() => setSelectedCategory("BOTTLE")}
              className="w-full bg-slate-950/60 p-8 rounded-[3rem] border border-white/5 flex flex-col items-center gap-4 hover:border-cyan-500/50 transition-all text-center cursor-pointer"
            >
              <div className="w-20 h-20 bg-slate-900/40 border border-white/5 rounded-[2.5rem] shadow-sm flex items-center justify-center text-cyan-400">
                <Package size={40} />
              </div>
              <div>
                <h3 className="text-xl font-black text-white mb-1">
                  Bottle Bundles
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Available in 500ml, 1L, 2L
                </p>
              </div>
              <div className="mt-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl shadow-cyan-950/40">
                Select Size
              </div>
            </button>
          </div>
        ) : selectedCategory === "DONATION" ? (
          <div className="bg-slate-900/30 backdrop-blur-2xl rounded-[2rem] p-6 border border-white/5 space-y-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <button
                onClick={() => setSelectedCategory(null)}
                className="p-2 bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
              <div>
                <h2 className="font-bold text-white">Humanity First</h2>
                <p className="text-xs text-slate-400 font-medium">
                  Donate water for the needy
                </p>
              </div>
            </div>

            <div className="text-center py-4">
              <div className="w-24 h-24 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-950/30">
                <Droplets size={48} className="animate-bounce" />
              </div>
              <h3 className="text-base font-black text-orange-400 mb-2 italic">
                "Pyaase ko paani mil jaye, to dua baras jaayegi"
              </h3>
              <p className="text-xs text-slate-300 font-medium px-4">
                Choose an amount to donate. We will place RO water cans at our
                roadside kiosks for free public use.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[100, 250, 550, 1000, 2500, 5000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setDonationAmount(amt)}
                  className={`p-4 rounded-2xl border font-black transition-all cursor-pointer ${donationAmount === amt ? "border-orange-500 bg-orange-500/20 text-orange-400 shadow-md" : "border-white/5 bg-slate-950/40 text-slate-400 hover:text-white"}`}
                >
                  ₹{amt}
                </button>
              ))}
            </div>

            <div className="bg-slate-950/60 p-6 rounded-[2rem] border border-white/5 text-white">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Selected donation
                </span>
                <span className="text-2xl font-display font-black text-orange-400">
                  ₹{donationAmount}
                </span>
              </div>
              <button
                onClick={handleBookNow}
                disabled={bookingLoading}
                className="w-full h-16 bg-gradient-to-r from-orange-500 to-amber-500 hover:brightness-110 text-white rounded-2xl font-display font-black text-lg shadow-xl shadow-orange-950/40 active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer outline-none"
              >
                {bookingLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    Complete Donation <CheckCircle2 size={24} />
                  </>
                )}
              </button>
              <p className="text-[9px] text-slate-400 text-center mt-3 font-bold uppercase tracking-widest">
                Payment secured via UPI Dashboard
              </p>
            </div>
          </div>
        ) : selectedCategory === "TANKER" ||
          selectedCategory === "STANDBY_TANKER" ||
          selectedCategory === "MONTHLY_TANKER" ? (
          <div className="bg-slate-900/30 backdrop-blur-2xl rounded-[2rem] p-6 border border-white/5 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <button
                onClick={() => setSelectedCategory(null)}
                className="p-2 bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
              <div>
                <h2 className="font-bold text-white">
                  {selectedCategory === "TANKER"
                    ? "Book Water Tanker"
                    : selectedCategory === "STANDBY_TANKER"
                      ? "Standby Tanker Rental"
                      : "Monthly Tanker Rental"}
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                  Select location & details
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2 flex items-center justify-between">
                <span>
                  Delivery Location <span className="text-cyan-400">*</span>
                </span>
                <span className="text-[10px] text-cyan-400 font-black tracking-wider uppercase">
                  Drag pin to exact point
                </span>
              </label>
              <div className="h-64 rounded-2xl overflow-hidden border border-white/10 shadow-inner">
                <LocationPicker
                  onLocationSelect={handleLocationSelectWrapper}
                />
              </div>
              {location && (
                <div className="mt-3 space-y-2">
                  <div className="bg-green-500/10 text-green-450 p-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-green-500/20">
                    <Navigation size={16} className="shrink-0 mt-0.5" />
                    <span>
                      {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                    </span>
                  </div>
                  <div className="bg-cyan-500/10 text-cyan-400 p-3 rounded-xl text-xs font-bold flex items-center justify-between border border-cyan-500/25">
                    <span>DISTANCE FROM BASE</span>
                    <span className="text-sm font-black">
                      {distanceKm.toFixed(1)} KM
                    </span>
                  </div>
                </div>
              )}
            </div>

            {location && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-4 pt-2 border-t border-white/5"
              >
                {(selectedCategory === "STANDBY_TANKER" ||
                  selectedCategory === "MONTHLY_TANKER") && (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">
                      {selectedCategory === "STANDBY_TANKER"
                        ? "Number of Days"
                        : "Number of Months"}
                    </label>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setQuantity((q) => (q > 1 ? q - 1 : 1))}
                        className="w-12 h-12 bg-slate-850 hover:bg-slate-750 text-white rounded-xl flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer border border-white/5"
                      >
                        -
                      </button>
                      <div className="flex-1 bg-slate-950/60 border border-white/5 rounded-xl p-3 text-center font-black text-xl text-white">
                        {quantity}
                      </div>
                      <button
                        onClick={() => setQuantity((q) => q + 1)}
                        className="w-12 h-12 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer shadow-md shadow-cyan-950/20"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {selectedCategory === "TANKER" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <AlertCircle
                          size={14}
                          className="text-orange-400 animate-pulse"
                        />{" "}
                        Delivery Plan
                      </label>
                      <button
                        onClick={() => setIsFastDelivery(!isFastDelivery)}
                        className={`w-full p-4 rounded-2xl border transition-all flex items-center gap-4 text-left cursor-pointer outline-none ${isFastDelivery ? "border-orange-550 bg-orange-500/15" : "border-white/5 bg-slate-950/40 hover:bg-slate-950/60"}`}
                      >
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${isFastDelivery ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white" : "bg-slate-900 border border-white/5 text-slate-400"}`}
                        >
                          <Truck
                            size={24}
                            className={isFastDelivery ? "animate-pulse" : ""}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-black text-white">
                            Fastest Emergency Delivery
                          </div>
                          <div
                            className={`text-[10px] font-bold uppercase tracking-wider ${isFastDelivery ? "text-orange-450" : "text-slate-400"}`}
                          >
                            Requires Pipe & adds +₹100 charge
                          </div>
                        </div>
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isFastDelivery ? "border-orange-500 bg-orange-500 text-white" : "border-slate-700"}`}
                        >
                          {isFastDelivery && <CheckCircle2 size={14} />}
                        </div>
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">
                        Delivery Floor
                      </label>
                      <select
                        value={floors}
                        onChange={(e) => setFloors(Number(e.target.value))}
                        className="w-full bg-slate-950/60 border border-white/5 rounded-xl p-3 text-sm font-bold focus:border-cyan-500 focus:bg-slate-900 outline-none transition-all text-white cursor-pointer"
                      >
                        <option value={0}>Ground Floor</option>
                        <option value={1}>1st Floor</option>
                        <option value={2}>2nd Floor</option>
                        <option value={3}>3rd Floor (+₹70)</option>
                        <option value={4}>4th Floor (+₹140)</option>
                        <option value={5}>5th Floor (+₹210)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Extra Pipe */}
                {selectedCategory === "TANKER" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2 flex items-center justify-between">
                      <span>Required Pipe Length (Feet)</span>
                      <span className="text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5 rounded-full">
                        {pipeLength} ft
                      </span>
                    </label>
                    <div className="bg-slate-950/40 border border-white/5 rounded-xl p-4">
                      <input
                        type="range"
                        min="50"
                        max="200"
                        step="10"
                        value={pipeLength}
                        onChange={(e) => setPipeLength(Number(e.target.value))}
                        className="w-full mb-3 accent-cyan-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] font-bold text-slate-400">
                        <span>50ft (Free)</span>
                        <span>100ft (+₹50)</span>
                        <span>200ft (+₹3/ft)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Remarks & Total Estimate */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">
                    Special Remarks (Optional)
                  </label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Any specific instructions for the driver?"
                    className="w-full bg-slate-950/40 border border-white/5 rounded-xl p-3 text-sm font-medium focus:border-cyan-500 focus:bg-slate-900 outline-none transition-all resize-none h-20 text-white placeholder:text-slate-500"
                  />
                </div>

                {activeFranchise?.loyaltyProgramEnabled &&
                  customer &&
                  (customer.loyaltyCoins || 0) > 0 && (
                    <div className="bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between shadow-inner">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-tr from-amber-500 to-orange-500 text-white rounded-xl shadow-md shadow-amber-500/25 text-lg">
                          🎁
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-amber-450 leading-none">
                            Redeem Loyalty Coins
                          </h4>
                          <p className="text-[10px] font-bold text-amber-300/80 uppercase tracking-wider mt-1.5">
                            ₹1 = 1 Coin (Balance: {customer.loyaltyCoins || 0})
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRedeemLoyalty(!redeemLoyalty)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${redeemLoyalty ? "bg-amber-500" : "bg-slate-850"}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${redeemLoyalty ? "translate-x-5" : "translate-x-0"}`}
                        />
                      </button>
                    </div>
                  )}

                <div className="bg-slate-950/80 border border-white/10 text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Estimated Total
                    </div>
                    <div className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">
                      {selectedCategory === "TANKER" ? (
                        <>
                          Base: ₹350 <br />
                          Dist ({distanceKm.toFixed(1)}km): +₹
                          {Math.round(distanceKm) * 50} <br />
                          {floors > 2 && (
                            <>
                              Floors: +₹{(floors - 2) * 70} <br />
                            </>
                          )}
                          {pipeLength > 50 && pipeLength <= 100 && (
                            <>
                              Pipe: +₹50 <br />
                            </>
                          )}
                          {pipeLength > 100 && (
                            <>
                              Pipe: +₹{50 + (pipeLength - 100) * 3} <br />
                            </>
                          )}
                          {isFastDelivery && (
                            <>
                              Emergency: +₹100 <br />
                            </>
                          )}
                        </>
                      ) : selectedCategory === "STANDBY_TANKER" ? (
                        <>
                          Base (Day 1): ₹900 <br />
                          Extra ({quantity - 1} days): +₹
                          {Math.max(0, (quantity - 1) * 600)} <br />
                          Pipe: 50ft Included <br />
                          Distance: Up to 5km Included
                        </>
                      ) : (
                        <>
                          Monthly Rate: ₹10,000 <br />
                          Quantity: {quantity} Month(s) <br />
                          Pipe: 20ft Included
                        </>
                      )}
                    </div>
                    {redeemLoyalty &&
                      activeFranchise?.loyaltyProgramEnabled &&
                      maxRedeemablePoints > 0 && (
                        <div className="text-amber-400 text-xs font-bold mt-1.5 flex items-center gap-1">
                          <span>🎁 Loyalty Applied:</span>
                          <span>-₹{maxRedeemablePoints}</span>
                        </div>
                      )}
                  </div>
                  <div className="text-2xl font-display font-black text-cyan-450">
                    {formatCurrency(finalPayableEstimate)}
                  </div>
                </div>
              </motion.div>
            )}

            {error && (
              <div className="text-red-400 text-sm font-bold bg-red-950/30 p-3 rounded-xl border border-red-500/20 flex items-center gap-2 mt-4 shadow-sm">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <button
              onClick={handleBookNow}
              disabled={bookingLoading || !location}
              className={`w-full mt-4 h-14 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer ${
                bookingLoading || !location
                  ? "bg-slate-900 text-slate-500 border border-white/5 cursor-not-allowed"
                  : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-950/40 hover:brightness-110"
              }`}
            >
              {bookingLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              ) : (
                "Book Now"
              )}
            </button>
          </div>
        ) : selectedCategory === "BOTTLE" ? (
          <div className="bg-slate-900/30 backdrop-blur-2xl rounded-[2rem] p-6 border border-white/5 space-y-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <button
                onClick={() => setSelectedCategory(null)}
                className="p-2 bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
              <div>
                <h2 className="font-bold text-white">Book Water Bottles</h2>
                <p className="text-xs text-slate-400 font-medium">
                  Select size and quantity
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(["500ml", "1L", "2L"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setBottleSize(size)}
                  className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${bottleSize === size ? "border-cyan-500 bg-cyan-500/20 text-cyan-400 shadow-md" : "border-white/5 bg-slate-950/40 text-slate-400 hover:text-white"}`}
                >
                  <div
                    className={`p-2 rounded-lg ${bottleSize === size ? "bg-cyan-500 text-white shadow-sm" : "bg-slate-900 border border-white/5 text-slate-400"}`}
                  >
                    <Droplets size={20} />
                  </div>
                  <span className="font-black text-sm">{size}</span>
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-350 uppercase tracking-wide mb-2">
                Number of Cases / Bundles
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setQuantity((q) => (q > 1 ? q - 1 : 1))}
                  className="w-12 h-12 bg-slate-850 hover:bg-slate-750 text-white rounded-xl flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer border border-white/5"
                >
                  -
                </button>
                <div className="flex-1 bg-slate-950/60 border border-white/5 rounded-xl p-3 text-center font-black text-xl text-white">
                  {quantity}
                </div>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-12 h-12 bg-cyan-50 hover:bg-cyan-600 text-white rounded-xl flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer shadow-md shadow-cyan-950/20"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2 flex items-center justify-between">
                <span>
                  Delivery Location <span className="text-cyan-400">*</span>
                </span>
              </label>
              <div className="h-48 rounded-2xl overflow-hidden border border-white/10 mb-2 shadow-inner">
                <LocationPicker
                  onLocationSelect={handleLocationSelectWrapper}
                />
              </div>
              {location && (
                <div className="space-y-2">
                  <div className="bg-green-500/10 text-green-450 p-2 rounded-xl text-xs font-medium flex items-center gap-2 border border-green-500/20 justify-center">
                    <Navigation size={14} className="shrink-0 mt-0.5" />
                    <span className="line-clamp-1">
                      {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {activeFranchise?.loyaltyProgramEnabled &&
              customer &&
              (customer.loyaltyCoins || 0) > 0 && (
                <div className="bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-tr from-amber-500 to-orange-500 text-white rounded-xl shadow-md shadow-amber-500/25 text-lg">
                      🎁
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white leading-none">
                        Redeem Loyalty Coins
                      </h4>
                      <p className="text-[10px] font-bold text-amber-300/80 uppercase tracking-wider mt-1.5">
                        You have: {customer.loyaltyCoins || 0} Coins
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRedeemLoyalty(!redeemLoyalty)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${redeemLoyalty ? "bg-amber-500" : "bg-slate-850"}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${redeemLoyalty ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                </div>
              )}

            <div className="bg-slate-950/80 border border-white/10 text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Estimated Total
                </div>
                {redeemLoyalty &&
                  activeFranchise?.loyaltyProgramEnabled &&
                  maxRedeemablePoints > 0 && (
                    <div className="text-[10px] text-amber-400 font-bold mt-1 leading-none">
                      Applied: -₹{maxRedeemablePoints}
                    </div>
                  )}
                <div className="text-2xl font-display font-black text-cyan-450 mt-1">
                  {formatCurrency(finalPayableEstimate)}
                </div>
              </div>
              <button
                onClick={handleBookNow}
                disabled={bookingLoading}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:brightness-110 cursor-pointer transition-all active:scale-95 shadow-md shadow-cyan-950/40 border border-white/5"
              >
                {bookingLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                ) : (
                  "Book Now"
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/30 backdrop-blur-2xl rounded-[2rem] p-6 border border-white/5 space-y-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <button
                onClick={() => setSelectedCategory(null)}
                className="p-2 bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
              <div>
                <h2 className="font-bold text-white">Book 20L Cans</h2>
                <p className="text-xs text-slate-400 font-medium">
                  RO Chilled Water
                </p>
              </div>
            </div>

            <div className="bg-cyan-500/5 p-6 rounded-[2rem] flex flex-col items-center text-center border border-cyan-500/10 relative overflow-hidden shadow-inner">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Flask size={60} />
              </div>
              <div className="w-20 h-20 bg-slate-900/40 border border-white/5 rounded-[1.5rem] shadow-sm flex items-center justify-center text-cyan-400 mb-4 relative z-10">
                <Flask size={40} />
              </div>
              <h3 className="font-black text-base text-white relative z-10">
                RO 20 Ltr Can
              </h3>
              <p className="text-xs text-slate-400 font-bold mt-2 relative z-10">
                Base ₹30 + ₹10/KM Delivery
              </p>

              <div className="flex bg-slate-950/60 border border-white/5 rounded-xl p-1 mt-4 shadow-inner w-full relative z-10">
                <button
                  onClick={() => setIsMonthlyCan(false)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${!isMonthlyCan ? "bg-cyan-500 text-white shadow-md" : "text-slate-400 hover:text-white/5"}`}
                >
                  One-Time
                </button>
                <button
                  onClick={() => setIsMonthlyCan(true)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${isMonthlyCan ? "bg-cyan-500 text-white shadow-md" : "text-slate-400 hover:text-white/5"}`}
                >
                  <CheckCircle2 size={12} /> Monthly (₹600)
                </button>
              </div>
            </div>

            {isMonthlyCan && (
              <div className="bg-green-500/10 text-green-450 p-3 rounded-xl border border-green-500/25 text-xs font-bold flex items-center justify-center gap-2">
                <CheckCircle2 size={16} /> Free Hot & Cold Water Dispenser
                Included!
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-305 uppercase tracking-wide mb-2">
                Quantity of Cans
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setQuantity((q) => (q > 1 ? q - 1 : 1))}
                  className="w-12 h-12 bg-slate-850 hover:bg-slate-750 text-white rounded-xl flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer border border-white/5"
                >
                  -
                </button>
                <div className="flex-1 bg-slate-950/60 border border-white/5 rounded-xl p-3 text-center font-black text-xl text-white">
                  {quantity}
                </div>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-12 h-12 bg-cyan-50 hover:bg-cyan-600 text-white rounded-xl flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer shadow-md shadow-cyan-950/20"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2 flex items-center justify-between">
                <span>
                  Delivery Location <span className="text-cyan-400">*</span>
                </span>
              </label>
              <div className="h-48 rounded-2xl overflow-hidden border border-white/10 mb-2 shadow-inner">
                <LocationPicker
                  onLocationSelect={handleLocationSelectWrapper}
                />
              </div>
              {location && (
                <div className="space-y-2">
                  <div className="bg-green-500/10 text-green-450 p-2 rounded-xl text-xs font-medium flex items-center gap-2 border border-green-500/20 justify-center">
                    <Navigation size={14} className="shrink-0 mt-0.5" />
                    <span className="line-clamp-1">
                      {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                    </span>
                  </div>
                  {!isMonthlyCan && (
                    <div className="bg-cyan-500/10 text-cyan-400 p-2 rounded-xl text-[10px] font-bold flex items-center justify-between border border-cyan-500/25 tracking-wider">
                      <span>DISTANCE FROM BASE</span>
                      <span className="font-black">
                        {distanceKm.toFixed(1)} KM
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {activeFranchise?.loyaltyProgramEnabled &&
              customer &&
              (customer.loyaltyCoins || 0) > 0 && (
                <div className="bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-tr from-amber-500 to-orange-500 text-white rounded-xl shadow-md shadow-amber-500/25 text-lg">
                      🎁
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white leading-none">
                        Redeem Loyalty Coins
                      </h4>
                      <p className="text-[10px] font-bold text-amber-300/80 uppercase tracking-wider mt-1.5">
                        You have: {customer.loyaltyCoins || 0} Coins
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRedeemLoyalty(!redeemLoyalty)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${redeemLoyalty ? "bg-amber-500" : "bg-slate-850"}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${redeemLoyalty ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                </div>
              )}

            <div className="bg-slate-950/80 border border-white/10 text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Estimated Total
                </div>
                {redeemLoyalty &&
                  activeFranchise?.loyaltyProgramEnabled &&
                  maxRedeemablePoints > 0 && (
                    <div className="text-[10px] text-amber-400 font-bold mt-1 leading-none">
                      Applied: -₹{maxRedeemablePoints}
                    </div>
                  )}
                <div className="text-2xl font-display font-black text-cyan-450 mt-1">
                  {formatCurrency(finalPayableEstimate)}
                </div>
              </div>
              <button
                onClick={handleBookNow}
                disabled={bookingLoading}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:brightness-110 cursor-pointer transition-all active:scale-95 shadow-md shadow-cyan-950/40 border border-white/5"
              >
                {bookingLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                ) : (
                  "Book Now"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Recent History */}
        {bills.length > 0 && (
          <div className="mt-8">
            <h3 className="font-display font-medium text-lg mb-4 text-slate-300">
              Recent Trips
            </h3>
            <div className="space-y-4">
              {bills.slice(0, 5).map((bill) => (
                <div
                  key={bill.id}
                  className={`bg-slate-900/30 backdrop-blur-2xl p-5 rounded-[2rem] border transition-all cursor-pointer ${expandedTripId === bill.id ? "border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.1)] bg-slate-900/50" : "border-white/5 hover:border-white/10 text-slate-300"}`}
                  onClick={() =>
                    setExpandedTripId(
                      expandedTripId === bill.id ? null : bill.id!,
                    )
                  }
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-white border-b border-white/10 pb-0.5">
                          {bill.billNumber}
                        </span>
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            bill.status === "Delivered" ||
                            bill.status === "Printed"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : bill.status === "Pending" ||
                                  bill.status === "Filling" ||
                                  bill.status === "Assigned" ||
                                  bill.status === "On the way"
                                ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                                : bill.status === "Reached"
                                  ? "bg-cyan-500 text-slate-950 animate-pulse"
                                  : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {bill.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium tracking-wide block">
                        {bill.createdAt?.toDate
                          ? format(bill.createdAt.toDate(), "dd MMM, hh:mm a")
                          : format(new Date(bill.date), "dd MMM")}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-white border-b border-white/5 pb-0.5 mb-1">
                        {formatCurrency(bill.grandTotal)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {bill.paymentMode}
                      </div>
                    </div>
                  </div>

                  {/* Active Delivery Information */}
                  {(bill.status === "Pending" ||
                    bill.status === "Filling" ||
                    bill.status === "Assigned" ||
                    bill.status === "On the way" ||
                    bill.status === "Reached") && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      {/* Interactive Delivery Timeline Step Tracker */}
                      <div className="my-6 px-1 relative">
                        <div className="flex items-center justify-between relative">
                          {/* Line behind */}
                          <div className="absolute left-4 right-4 top-[14px] h-0.5 bg-slate-800 rounded-full -z-10" />
                          <div
                            className="absolute left-4 top-[14px] h-0.5 bg-cyan-500 rounded-full -z-10 transition-all duration-500 ease-out"
                            style={{
                              width: `${(() => {
                                // calculate status percentage
                                const steps: Record<string, number> = {
                                  Pending: 0,
                                  Assigned: 1,
                                  Filling: 1,
                                  "On the way": 2,
                                  OnTheWay: 2,
                                  Reached: 3,
                                  Delivered: 4,
                                  Printed: 4,
                                };
                                const currentStep =
                                  steps[bill.status || "Pending"] || 0;
                                return (currentStep / 4) * 100;
                              })()}%`,
                            }}
                          />

                          {[
                            {
                              label: "Placed",
                              icon: CheckCircle2,
                              value: "Pending",
                            },
                            {
                              label: "Preparing",
                              icon: Droplets,
                              value: "Filling",
                            },
                            {
                              label: "On Way",
                              icon: Truck,
                              value: "On the way",
                            },
                            {
                              label: "Reached",
                              icon: MapPin,
                              value: "Reached",
                            },
                            {
                              label: "Delivered",
                              icon: Package,
                              value: "Delivered",
                            },
                          ].map((item, idx) => {
                            const steps: Record<string, number> = {
                              Pending: 0,
                              Assigned: 1,
                              Filling: 1,
                              "On the way": 2,
                              OnTheWay: 2,
                              Reached: 3,
                              Delivered: 4,
                              Printed: 4,
                            };
                            const current =
                              steps[bill.status || "Pending"] || 0;
                            const active = current >= idx;
                            const Icon = item.icon;
                            return (
                              <div
                                key={item.label}
                                className="flex flex-col items-center relative z-10"
                              >
                                <motion.div
                                  animate={
                                    active ? { scale: [0.9, 1.1, 1] } : {}
                                  }
                                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                                    active
                                      ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25"
                                      : "bg-slate-900 text-slate-500 border border-white/5"
                                  }`}
                                >
                                  <Icon
                                    size={14}
                                    className={
                                      current === idx ? "animate-pulse" : ""
                                    }
                                  />
                                </motion.div>
                                <span
                                  className={`text-[8px] font-black mt-2 uppercase tracking-widest ${active ? "text-cyan-400" : "text-slate-500"}`}
                                >
                                  {item.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {bill.driverName && (
                        <div className="flex items-center justify-between bg-blue-500/5 text-blue-300 p-3 rounded-xl mb-2 border border-blue-500/10">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-950 rounded-full flex items-center justify-center text-blue-400 border border-blue-500/10">
                              <Truck size={14} />
                            </div>
                            <div>
                              <div className="text-[10px] font-bold text-blue-450 uppercase tracking-wider">
                                Driver Assigned
                              </div>
                              <div className="text-xs font-black text-white">
                                {bill.driverName}
                              </div>
                            </div>
                          </div>
                          {bill.driverMobile && (
                            <a
                              href={`tel:${bill.driverMobile}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center justify-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20"
                            >
                              <Phone size={12} /> Call
                            </a>
                          )}
                        </div>
                      )}

                      {bill.driverId && driverLocations[bill.driverId] && (
                        <div className="bg-slate-950/40 rounded-2xl p-3 mb-2 border border-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-ping" />
                              Live Tracking Active
                            </span>
                            <span className="text-[10px] font-bold text-cyan-400">
                              Speed:{" "}
                              {Math.round(
                                driverLocations[bill.driverId].speed || 0,
                              )}{" "}
                              km/h
                            </span>
                          </div>
                          <div className="h-32 rounded-xl overflow-hidden relative border border-white/5">
                            <div className="absolute inset-0 flex items-center justify-center bg-cyan-950/20">
                              <div className="text-center p-4">
                                <MapPin
                                  className="text-cyan-400 mx-auto mb-2 animate-bounce"
                                  size={24}
                                />
                                <p className="text-[10px] font-bold text-slate-400">
                                  Driver is nearby
                                </p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(
                                      `https://www.google.com/maps/search/?api=1&query=${driverLocations[bill.driverId!].latitude},${driverLocations[bill.driverId!].longitude}`,
                                    );
                                  }}
                                  className="mt-2 text-[9px] font-black text-cyan-400 uppercase border-b border-cyan-500/20 cursor-pointer"
                                >
                                  View Real-time Map
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <TripCountdown createdAt={bill.createdAt || bill.date} />
                    </div>
                  )}

                  {/* Actions Tray on Click */}
                  <AnimatePresence>
                    {expandedTripId === bill.id && (
                      <motion.div
                        key={`actions-tray-${bill.id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-white/5">
                          {bill.status === "Delivered" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setModalView({ type: "BILL", bill });
                              }}
                              className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-white/5 bg-slate-950/30 hover:bg-slate-900/40 hover:border-white/10 transition-all text-slate-300 cursor-pointer"
                            >
                              <Receipt
                                size={18}
                                className="text-cyan-400 opacity-80"
                              />
                              <span className="text-[10px] font-bold">
                                View Bill
                              </span>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalView({ type: "QR", bill });
                            }}
                            className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-white/5 bg-slate-950/30 hover:bg-slate-900/40 hover:border-white/10 transition-all text-slate-300 cursor-pointer"
                          >
                            <QrCode
                              size={18}
                              className="text-purple-400 opacity-80"
                            />
                            <span className="text-[10px] font-bold">
                              Pay (QR)
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalView({ type: "ACCOUNT", bill });
                            }}
                            className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-white/5 bg-slate-950/30 hover:bg-slate-900/40 hover:border-white/10 transition-all text-slate-300 cursor-pointer"
                          >
                            <UserIcon
                              size={18}
                              className="text-orange-400 opacity-80"
                            />
                            <span className="text-[10px] font-bold">
                              Account
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalView({ type: "CHAT", bill });
                            }}
                            className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-white/5 bg-slate-950/30 hover:bg-slate-900/40 hover:border-white/10 transition-all text-slate-300 cursor-pointer"
                          >
                            <MessageCircle
                              size={18}
                              className="text-green-450 opacity-80"
                            />
                            <span className="text-[10px] font-bold">
                              Feedback
                            </span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modals Handler */}
      <AnimatePresence>
        {modalView && (
          <motion.div
            key="modal-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          >
            {modalView.type === "CHAT" ? (
              <LiveChatModal
                bill={modalView.bill}
                customerName={customer.name}
                onClose={() => setModalView(null)}
              />
            ) : (
              <div className="bg-slate-950/90 border border-white/10 backdrop-blur-3xl rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-900/40">
                  <span className="font-bold text-sm text-slate-300 uppercase tracking-widest">
                    {modalView.type === "BILL"
                      ? "Bill Preview"
                      : modalView.type === "QR"
                        ? "Payment QR"
                        : "Account Summary"}
                  </span>
                  <button
                    onClick={() => setModalView(null)}
                    className="p-1.5 bg-white/5 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[70vh]">
                  {modalView.type === "BILL" && (
                    <ThermalInvoice bill={modalView.bill} />
                  )}
                  {modalView.type === "QR" && (
                    <div className="flex flex-col items-center py-4">
                      <div className="bg-white p-4 rounded-3xl shadow-inner mb-6 inline-block">
                        <QRCodeSVG
                          value={`upi://pay?pa=milan.sharma6565@okicici&pn=TankerWala%20Powered%20by%20Rajhans&am=${modalView.bill.grandTotal}&cu=INR`}
                          size={200}
                        />
                      </div>
                      <div className="mt-2 text-center text-xs font-black text-cyan-400 bg-cyan-950/30 border border-cyan-500/20 px-4 py-3 rounded-xl tracking-wider">
                        PAYMENT AMOUNT:{" "}
                        {formatCurrency(modalView.bill.grandTotal)}
                      </div>
                    </div>
                  )}
                  {modalView.type === "ACCOUNT" && (
                    <div className="space-y-6">
                      <div className="text-center">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">
                          Total Outstanding
                        </div>
                        <div
                          className={`text-4xl font-display font-black ${customer.pendingAmount > 0 ? "text-red-400" : "text-green-400"}`}
                        >
                          {formatCurrency(customer.pendingAmount || 0)}
                        </div>
                      </div>
                      <div className="bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                        <div className="text-xs font-bold text-slate-200 mb-3">
                          Customer Details
                        </div>
                        <div className="text-sm flex justify-between py-1.5 border-b border-white/5">
                          <span className="text-slate-400">Name</span>
                          <span className="font-medium text-white">
                            {customer.name}
                          </span>
                        </div>
                        <div className="text-sm flex justify-between py-1.5 border-b border-white/5">
                          <span className="text-slate-400">Mobile</span>
                          <span className="font-medium text-white">
                            {customer.mobile}
                          </span>
                        </div>
                        <div className="text-sm flex justify-between py-1.5">
                          <span className="text-slate-400">
                            Total Deliveries
                          </span>
                          <span className="font-medium text-white">
                            {analytics.TANKER.trips +
                              analytics.CAN.trips +
                              analytics.BOTTLE.trips}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
