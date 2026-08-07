import { Bill } from '../types';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { encodeCustomerToken } from './tokenUtils';

/**
 * Formats a Bill and Franchise info into a clean digital WhatsApp message
 * with live status link and encrypted customer rebook link in Hindi/English.
 */
export const getWhatsAppBillLink = (bill: Bill, franchise?: any) => {
  const upiId = franchise?.upiId || "rajha94133@barodampay";
  const franchiseName = franchise?.printName || franchise?.name || "Rajhans Water Supply";
  const printPhone = franchise?.printMobile || franchise?.operatorMobile || "9413339987";

  const origin = window.location.origin;

  // Single Live Tanker Status & Rebook Link (Customer Portal)
  const portalUrl = `${origin}/?o=${bill.id}`;

  // Item & capacity description
  let capacityText = `${bill.tankerSize || '5000'}L (Litre Tanker)`;
  if (bill.category === 'CAN' || bill.category === 'MONTHLY_CAN') {
    capacityText = `20L RO Water Can (${bill.quantity || 1} Pcs)`;
  } else if (bill.category === 'BOTTLE') {
    capacityText = `Bottled Water (${bill.bottleSize || '1L'}, ${bill.quantity || 1} Pcs)`;
  }

  // Current status badge text matching portal status
  const currentStatus = bill.status || 'Pending';
  let statusBadge = 'Pending ⏳';
  if (currentStatus === 'Assigned') statusBadge = 'Assigned 🚚';
  else if (currentStatus === 'Filling') statusBadge = 'Filling 🚰';
  else if (currentStatus === 'On the way' as any || currentStatus === 'On the Way' as any) statusBadge = 'On the Way 🛣️';
  else if (currentStatus === 'Scheduled') statusBadge = 'Scheduled 📅';
  else if (currentStatus === 'Delivered') statusBadge = 'Delivered ✅';

  const message = 
`Hello ${bill.customerName}! 💧
Your Water Supply Digital Invoice:

🧾 Bill No: #${bill.billNumber}
💧 Capacity / Item: ${capacityText}
💰 Total Amount: ₹${bill.grandTotal || bill.totalAmount}
📌 Payment Mode: ${bill.paymentMode || 'Cash'}

🚚 Status: ${statusBadge}

🌐 Track Live & Rebook Order:
👉 ${portalUrl}

For Online Payment (UPI ID: ${upiId}):
upi://pay?pa=${upiId}&pn=${encodeURIComponent(franchiseName)}&am=${bill.grandTotal}&cu=INR

Thank you!
${franchiseName} 💧
📞 Helpline: +91 ${printPhone}`;

  // Filter non-digit characters to build correct phone number
  const cleanMobile = bill.customerMobile.replace(/\D/g, '');
  const phone = cleanMobile.startsWith('91') ? cleanMobile : `91${cleanMobile}`;
  
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
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
  const url = getWhatsAppBillLink(bill, activeFranchise);
  window.open(url, '_blank');
};

