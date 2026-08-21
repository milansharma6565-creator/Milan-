import { Bill } from '../types';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { whatsappService } from '../services/whatsappService';

/**
 * Formats a Bill and Franchise info into a clean digital WhatsApp message
 * with live status link and encrypted customer rebook link in Hindi/English.
 */
/**
 * Formats a Bill and Franchise info into a clean digital WhatsApp message
 * in Hindi with driver details and support helpline.
 */
export const getWhatsAppBillLink = (bill: Bill, franchise?: any) => {
  const franchiseName = franchise?.printName || franchise?.name || "Rajhans Water Supply";
  const printPhone = franchise?.printMobile || franchise?.operatorMobile || "9413339987";

  let capacityText = `${bill.tankerSize || '5000'}L Water Tanker`;
  if (bill.category === 'CAN' || bill.category === 'MONTHLY_CAN') {
    capacityText = `20L RO Water Can (${bill.quantity || 1} Pcs)`;
  } else if (bill.category === 'BOTTLE') {
    capacityText = `Packaged Water Bottle (${bill.bottleSize || '1L'}, ${bill.quantity || 1} Pcs)`;
  }

  const message = 
`💧 *नमस्ते ${bill.customerName || 'ग्राहक'} जी!*
आपका पानी टैंकर / आर्डर विवरण:

🧾 *बिल संख्या:* #${bill.billNumber}
📦 *आइटम:* ${capacityText}
💰 *कुल राशि:* ₹${bill.grandTotal || bill.totalAmount}
📌 *पेमेंट मोड:* ${bill.paymentMode || 'Cash'}
📍 *डिलीवरी पता:* ${bill.deliveryLocation?.address || bill.customerAddress || 'दर्ज पता'}

धन्यवाद!
*${franchiseName}* 💧
📞 हेल्पलाइन: +91 ${printPhone}`;

  // Filter non-digit characters to build correct phone number
  const cleanMobile = (bill.customerMobile || '').replace(/\D/g, '');
  const phone = cleanMobile.startsWith('91') && cleanMobile.length > 10 ? cleanMobile : `91${cleanMobile.slice(-10)}`;
  
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
};

/**
 * Returns formatted WhatsApp dispatch text message with Driver & Tractor details
 */
export const getWhatsAppDispatchText = (bill: Bill, franchise?: any) => {
  const franchiseName = franchise?.printName || franchise?.name || "Rajhans Water Supply";
  const printPhone = franchise?.printMobile || franchise?.operatorMobile || "9413339987";
  const driverName = bill.driverName || "Official Delivery Driver";
  const driverPhone = bill.driverMobile || printPhone;
  const tractorNo = (bill as any).tractorNumber || bill.vehicleNumber || bill.tractorId || "Assigned Tractor";

  return `🚚 *नमस्ते ${bill.customerName || 'ग्राहक'} जी!*
आपकी *बिल संख्या #${bill.billNumber}* डिलीवरी के लिए रवाना हो चुकी है।

👤 *ड्राइवर का नाम:* ${driverName}
📞 *ड्राइवर मोबाइल:* ${driverPhone}
🚜 *ट्रैक्टर संख्या:* ${tractorNo}

📄 *आपके बिल की थर्मल रसीद नीचे संलग्न (Attach) है।*
कृपया डिलीवरी पॉइंट पर गेट खुला रखें।
*${franchiseName}* 💧
📞 हेल्पलाइन: +91 ${printPhone}`;
};

/**
 * Direct opens the prefilled WhatsApp send link for the target customer
 */
export const openWhatsAppDirect = async (bill: Bill, franchise?: any) => {
  let activeFranchise = franchise;
  if (!activeFranchise && bill.franchiseId) {
    try {
      const snap = await getDoc(doc(db, 'franchises', bill.franchiseId));
      if (snap.exists()) {
        activeFranchise = snap.data();
      }
    } catch (e) {
      console.warn("Could not load franchise details for WhatsApp auto-send:", e);
    }
  }

  // First try automated direct send if WhatsApp Engine is connected
  try {
    const autoRes = await whatsappService.notifyOrder(bill, 'bill_generated', activeFranchise);
    if (autoRes.success) {
      return { mode: 'automated', success: true };
    }
  } catch (err) {
    // Fall back to opening WhatsApp URL
  }

  const url = getWhatsAppBillLink(bill, activeFranchise);
  window.open(url, '_blank');
  return { mode: 'browser_link', success: true };
};

/**
 * Dispatches automated lifecycle WhatsApp notification in the background
 */
export const dispatchWhatsAppLifecycleEvent = async (
  bill: Bill,
  eventType: 'booked' | 'filling' | 'dispatched' | 'delivered' | 'cancelled' | 'bill_generated',
  franchise?: any,
  imageDataUrl?: string
) => {
  try {
    let activeFranchise = franchise;
    if (!activeFranchise && bill.franchiseId) {
      const snap = await getDoc(doc(db, 'franchises', bill.franchiseId));
      if (snap.exists()) {
        activeFranchise = snap.data();
      }
    }
    return await whatsappService.notifyOrder(bill, eventType, activeFranchise, imageDataUrl);
  } catch (e) {
    console.warn(`[WhatsApp Auto-Dispatch] Failed to dispatch ${eventType} event:`, e);
    return { success: false, error: (e as any)?.message };
  }
};
