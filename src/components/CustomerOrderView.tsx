import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, addDoc, collection, serverTimestamp, onSnapshot, query, where, deleteDoc, getDocs } from 'firebase/firestore';
import { Bill } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Truck, CheckCircle2, XCircle, Clock, RefreshCw, Phone, MapPin, ExternalLink, Droplets } from 'lucide-react';
import { formatCurrency } from '../constants';
import { Logo } from './Logo';
import { encodeCustomerToken } from '../lib/tokenUtils';

// Status pipeline definitions matching portal
const STATUS_STAGES = [
  { id: 'Pending', label: 'पेंडिंग ⏳', sub: 'स्वीकार की जा रही है' },
  { id: 'Assigned', label: 'असाइन 🚚', sub: 'ड्राइवर असाइन हुआ' },
  { id: 'Filling', label: 'भर रहा है 🚰', sub: 'टैंकर में पानी लोड हो रहा है' },
  { id: 'On the Way', label: 'रास्ते में है 🛣️', sub: 'लाइव लोकेशन चालू है' },
  { id: 'Delivered', label: 'डिलीवर हुआ ✅', sub: 'सफलतापूर्वक पहुंचा दिया गया' },
];
import { MapContainer, TileLayer, Marker as LeafletMarker, Polyline as LeafletPolyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom icons for the live tracking map
const driverIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
      <div class="relative w-8 h-8 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(45deg);"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const customerIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="absolute w-10 h-10 bg-emerald-500/20 rounded-full animate-pulse"></div>
      <div class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-white">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.54 20.193 4 14.99 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 32],
});

// Beautiful Leaflet Component to handle programmatic fitting bounds of both locations
function CustomerLiveMap({ driverLoc, customerLoc }: { driverLoc: { lat: number; lng: number }; customerLoc?: { lat: number; lng: number } }) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [route, setRoute] = useState<[number, number][]>([]);

  // Automatically fit bounds whenever coordinates change
  useEffect(() => {
    if (!map) return;
    if (customerLoc) {
      const bounds = L.latLngBounds(
        [driverLoc.lat, driverLoc.lng],
        [customerLoc.lat, customerLoc.lng]
      );
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([driverLoc.lat, driverLoc.lng], 15);
    }
  }, [map, driverLoc.lat, driverLoc.lng, customerLoc?.lat, customerLoc?.lng]);

  // Fetch real-time OSRM route line connecting driver and customer
  useEffect(() => {
    if (!customerLoc) return;
    fetch(`https://router.project-osrm.org/route/v1/driving/${driverLoc.lng},${driverLoc.lat};${customerLoc.lng},${customerLoc.lat}?overview=full&geometries=geojson`)
      .then(res => res.json())
      .then(data => {
        if (data.routes && data.routes.length > 0) {
          const coords = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]] as [number, number]);
          setRoute(coords);
        } else {
          setRoute([[driverLoc.lat, driverLoc.lng], [customerLoc.lat, customerLoc.lng]]);
        }
      })
      .catch(err => {
        console.warn("OSRM Customer route query failed:", err);
        setRoute([[driverLoc.lat, driverLoc.lng], [customerLoc.lat, customerLoc.lng]]);
      });
  }, [driverLoc.lat, driverLoc.lng, customerLoc?.lat, customerLoc?.lng]);

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer
        center={[driverLoc.lat, driverLoc.lng]}
        zoom={14}
        ref={setMap}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        <LeafletMarker position={[driverLoc.lat, driverLoc.lng]} icon={driverIcon} />

        {customerLoc && (
          <LeafletMarker position={[customerLoc.lat, customerLoc.lng]} icon={customerIcon} />
        )}

        {route.length > 0 && (
          <LeafletPolyline
            positions={route}
            pathOptions={{
              color: '#3b82f6', // Premium bright blue polyline
              weight: 5,
              opacity: 0.8,
              lineJoin: 'round',
              lineCap: 'round',
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}

export function CustomerOrderView({ billId }: { billId: string }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestStatus, setRequestStatus] = useState<'none' | 'pending' | 'accepted' | 'rejected'>('none');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<any>(null);
  const beepAudio = useRef<HTMLAudioElement | null>(null);
  const prevStatus = useRef<string | null>(null);

  useEffect(() => {
    const unsubBill = onSnapshot(doc(db, 'bills', billId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Bill;
        setBill(data);
        setLoading(false);
        
        // Audio Logic
        if (!beepAudio.current) {
          const audio = document.createElement('audio');
          audio.src = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
          beepAudio.current = audio;
        }
        
        if (prevStatus.current && prevStatus.current !== data.status) {
           beepAudio.current.play().catch(() => {});
        }
        prevStatus.current = data.status;
      } else {
        setError('Bill not found');
        setLoading(false);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `bills/${billId}`);
      setLoading(false);
    });

    const q = query(
        collection(db, 'bookingRequests'), 
        where('billId', '==', billId),
        where('status', 'in', ['Pending', 'Accepted'])
    );
    
    const unsubscribeRequests = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const latest = snapshot.docs.find(d => d.data().status === 'Pending' || d.data().status === 'Accepted') || snapshot.docs[0];
            setRequestId(latest.id);
            setRequestStatus(latest.data().status.toLowerCase() as any);
        } else {
            setRequestStatus('none');
            setRequestId(null);
        }
    }, (err: any) => {
      console.error("Booking requests check failed:", err?.message || String(err));
    });

    return () => {
      unsubBill();
      unsubscribeRequests();
    };
  }, [billId]);

  useEffect(() => {
    if (!bill?.driverId) {
      setDriverLocation(null);
      return;
    }
    const unsubLoc = onSnapshot(doc(db, 'driverLocations', bill.driverId), (locSnap) => {
      if (locSnap.exists()) setDriverLocation(locSnap.data());
    }, (err: any) => {
      console.error("Driver location tracking failed:", err?.message || String(err));
    });
    return () => unsubLoc();
  }, [bill?.driverId]);

  const handleRebook = async () => {
    if (!bill) return;
    setRequestStatus('pending');
    try {
      await addDoc(collection(db, 'bookingRequests'), {
        billId: bill.id,
        franchiseId: bill.franchiseId || 'legacy-rajhans',
        customerId: bill.customerId || '',
        customerName: bill.customerName || '',
        customerMobile: bill.customerMobile || '',
        tankerSize: bill.tankerSize || 'Standard',
        category: bill.category || 'TANKER',
        totalEstimate: bill.grandTotal || bill.totalAmount || 0,
        remarks: remarks.trim(),
        status: 'Pending',
        requestedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bookingRequests');
      setRequestStatus('none');
    }
  };

  const handleCancelRequest = async () => {
    if (!requestId) return;
    try {
      await deleteDoc(doc(db, 'bookingRequests', requestId));
      setRequestStatus('none');
      setRequestId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookingRequests/${requestId}`);
    }
  };

  if (loading) return (
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
      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">Loading Bill Details...</p>
    </div>
  );

  if (error || !bill) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <XCircle className="text-red-500 mb-4" size={64} />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Bill</h1>
      <p className="text-slate-500">This bill link is invalid or has expired.</p>
    </div>
  );

  const currentStatusIndex = STATUS_STAGES.findIndex(s => s.id === (bill.status || 'Pending'));
  const activeStageIndex = currentStatusIndex >= 0 ? currentStatusIndex : 0;
  
  const rebookPortalUrl = `${window.location.origin}/?mode=booking&c=${encodeCustomerToken(bill.customerMobile, bill.customerId)}`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-10">
      <div className="max-w-md w-full">
        <div className="flex flex-col items-center justify-center gap-3 mb-8">
          <Logo size={56} />
          <h1 className="text-3xl font-black text-slate-900 tracking-tight text-center">
            राजहंस <span className="relative text-blue-600">वाटर सप्लाई<span className="absolute top-full left-0 text-[10px] text-slate-400 font-medium whitespace-nowrap normal-case tracking-normal mt-0.5">TankerWala Portal</span></span>
          </h1>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden"
        >
          <div className="p-6 text-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white relative">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Truck size={36} />
            </div>
            <h2 className="text-2xl font-black tracking-tight">लाइव टैंकर स्टेटस</h2>
            <p className="text-xs opacity-90 font-medium">बिल नं: #{bill.billNumber}</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Live Pipeline Progress Tracker */}
            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Droplets size={14} className="text-blue-600" />
                टैंकर डिलीवरी प्रोग्रेस (Live Status)
              </h3>
              
              <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {STATUS_STAGES.map((stage, idx) => {
                  const isDone = idx < activeStageIndex;
                  const isCurrent = idx === activeStageIndex;
                  
                  return (
                    <div key={stage.id} className="relative flex items-start gap-3.5">
                      <div 
                        className={`absolute -left-[23px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                          isDone 
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' 
                            : isCurrent 
                              ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse' 
                              : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        {isDone ? '✓' : idx + 1}
                      </div>

                      <div className="flex-1">
                        <div className={`font-bold text-sm ${isCurrent ? 'text-blue-600 text-base font-black' : isDone ? 'text-slate-800' : 'text-slate-400'}`}>
                          {stage.label}
                        </div>
                        <p className="text-xs text-slate-400 font-medium leading-snug">
                          {stage.sub}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bill Details Info */}
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-slate-400 font-medium">ग्राहक का नाम:</span>
                <span className="font-bold text-slate-900">{bill.customerName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-slate-400 font-medium">टैंकर क्षमता/साइज:</span>
                <span className="font-bold text-slate-900">{bill.tankerSize || '5000'}L Litre</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-slate-400 font-medium">कुल राशि (Amount):</span>
                <span className="font-black text-emerald-600 text-base">{formatCurrency(bill.grandTotal || bill.totalAmount)}</span>
              </div>
            </div>

            {/* Driver GPS Location */}
            {bill.driverId && driverLocation && (
              <div className="bg-slate-50 rounded-3xl p-4 border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                      <Truck size={20} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">ड्राइवर संपर्क</p>
                       <h4 className="font-bold text-slate-900">{bill.driverName || 'राजहंस ड्राइवर'}</h4>
                    </div>
                  </div>
                  {bill.driverMobile && (
                    <a href={`tel:${bill.driverMobile}`} className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                      <Phone size={18} />
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between mb-3 px-1">
                   <div className="flex items-center gap-1.5 font-black text-[10px] text-blue-500 uppercase">
                     <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                     लाइव जीपीएस ट्रैकिंग Active
                   </div>
                   <div className="text-[10px] font-bold text-slate-400 uppercase">
                     {Math.round(driverLocation.speed || 0)} KM/H
                   </div>
                </div>

                <div className="h-52 rounded-2xl overflow-hidden relative border-2 border-white shadow-lg bg-slate-100">
                  <CustomerLiveMap
                    driverLoc={{ lat: driverLocation.latitude, lng: driverLocation.longitude }}
                    customerLoc={bill.deliveryLocation && bill.deliveryLocation.lat && bill.deliveryLocation.lng ? { lat: bill.deliveryLocation.lat, lng: bill.deliveryLocation.lng } : undefined}
                  />
                </div>
              </div>
            )}

            {/* Direct 1-Click Rebook Option at Bottom */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50/70 p-4 rounded-2xl border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                    <RefreshCw size={16} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">दोबारा ऑर्डर करें (Rebook Tanker)</h3>
                    <p className="text-[11px] text-slate-500 font-medium">1-क्लिक में नया टैंकर या वाटर केन बुक करें</p>
                  </div>
                </div>

                {requestStatus === 'none' && (
                  <div className="space-y-2 mt-3">
                    <button 
                      onClick={handleRebook}
                      className="w-full bg-blue-600 text-white h-12 rounded-xl font-black shadow-md hover:bg-blue-700 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                    >
                      <RefreshCw size={18} />
                      इसी ऑर्डर को दोबारा भेजें (Instant Rebook)
                    </button>
                    <a 
                      href={rebookPortalUrl}
                      className="w-full bg-slate-900 text-white h-11 rounded-xl font-bold shadow-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-xs"
                    >
                      <ExternalLink size={15} className="text-blue-400" />
                      पूरा कस्टमर बुकिंग पोर्टल खोलें (Full Portal)
                    </a>
                  </div>
                )}

                {requestStatus === 'pending' && (
                  <div className="bg-white p-3.5 rounded-xl text-center border border-orange-200 mt-2 shadow-xs">
                    <Clock className="text-orange-500 mx-auto mb-1 animate-pulse" size={28} />
                    <h3 className="font-black text-orange-900 text-xs">आपकी री-बुकिंग रिक्वेस्ट भेजी जा चुकी है</h3>
                    <p className="text-[11px] text-orange-700 mt-0.5">एडमिन आपकी नई बुकिंग स्वीकार कर रहा है...</p>
                    <button 
                      onClick={handleCancelRequest}
                      className="mt-2 text-xs text-red-500 underline font-extrabold cursor-pointer"
                    >
                      रिक्वेस्ट रद्द करें
                    </button>
                  </div>
                )}

                {requestStatus === 'accepted' && (
                  <div className="bg-emerald-50 p-3.5 rounded-xl text-center border border-emerald-200 mt-2">
                    <CheckCircle2 className="text-emerald-600 mx-auto mb-1" size={28} />
                    <h3 className="font-black text-emerald-900 text-xs">आपकी बुकिंग स्वीकार कर ली गई है!</h3>
                    <p className="text-[11px] text-emerald-700 mt-0.5">जल्द ही नया टैंकर असाइन किया जाएगा।</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
        
        <p className="mt-6 text-center text-slate-400 text-xs font-bold uppercase tracking-widest pb-4">
            राजहंस <span className="relative text-blue-600">वाटर सप्लाई</span>
        </p>
      </div>
    </div>
  );
}
