import { Bill } from '../types';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Formats a Bill and Franchise info into a highly polished Unicode WhatsApp Invoice
 * with payment links, itemized breakdown, and live tracking URLs.
 */
export const getWhatsAppBillLink = (bill: Bill, franchise?: any) => {
  const upiId = franchise?.upiId || "rajha94133@barodampay";
  const franchiseName = franchise?.printName || franchise?.name || "TankerWala";
  const printPhone = franchise?.printMobile || franchise?.operatorMobile || "94133 39987";

  // Public order live tracking and view URL
  const orderUrl = `${window.location.origin}/?o=${bill.id}`;
  // UPI Payment Protocol link
  const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(franchiseName)}&am=${bill.grandTotal}&cu=INR&tn=Bill%20${bill.billNumber}`;

  let itemDesc = '';
  if (bill.category === 'CAN') {
    itemDesc = '20L RO Water Can';
  } else if (bill.category === 'MONTHLY_CAN') {
    itemDesc = '20L RO Water Can (Monthly Plan)';
  } else if (bill.category === 'BOTTLE') {
    itemDesc = `Packaged Water (${bill.bottleSize || 'Standard'})`;
  } else {
    itemDesc = `Tanker ${bill.tankerSize || 'Std'}L`;
  }

  const message = 
`*=========================*
*🚛 TANKERWALA DIGITAL INVOICE*
*=========================*

👤 *Customer Details:*
• *Name:* ${bill.customerName}
• *Mobile:* ${bill.customerMobile}
• *Address:* ${bill.customerAddress || 'N/A'}

---------------------------------
*📄 BILL DETAILS:*
• *Bill No:* #${bill.billNumber}
• *Date:* ${new Date(bill.date).toLocaleDateString()}
• *Status:* ${bill.status || 'Delivered'}
---------------------------------

*🛒 BILL ITEMS:*
• *Item:* ${itemDesc}
• *Quantity:* ${bill.quantity}
• *Rate/Total Amount:* ₹${bill.totalAmount}
${bill.extraCharges > 0 ? `• *Extra Charges:* ₹${bill.extraCharges}\n` : ''}
---------------------------------
💰 *GRAND TOTAL:* *₹${bill.grandTotal}*
💵 *Payment Mode:* *${bill.paymentMode}*
---------------------------------

*📲 CLICK TO PAY INSTANTLY VIA UPI:*
👉 ${upiLink}

*UPI ID Address:* ${upiId}

*🌐 LIVE INVOICE & REBOOK LINK:*
👉 ${orderUrl}

*⚠️ ATTENTION CUSTOMER:*
For booking support or new order delivery requests, please do not call the driver's number.
📞 Direct Helpline: +91 ${printPhone}

*Thank you from ${franchiseName} - Quality Pure Drinking Water* ☺
*Powered by Rajhans*`;

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
