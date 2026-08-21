import path from "path";
import fs from "fs";
import QRCode from "qrcode";
import pino from "pino";

// Interface for WhatsApp Service State
export interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "qr_ready" | "connected";
  qrCodeDataUrl: string | null;
  rawQr: string | null;
  user: {
    id: string;
    name?: string;
    phone?: string;
  } | null;
  connectedAt: string | null;
  autoNotifications: {
    onOrderBooked: boolean;
    onFilling: boolean;
    onDispatched: boolean;
    onDelivered: boolean;
    onCancelled: boolean;
    onPaymentReminder?: boolean;
    onPaymentReceipt?: boolean;
    onMonthlyPass?: boolean;
    onHydrantToken?: boolean;
  };
}

export interface WhatsAppTemplateConfig {
  id: string;
  title: string;
  titleHi: string;
  category: 'lifecycle' | 'account' | 'hydrant' | 'broadcast';
  eventType?: string;
  description: string;
  descriptionHi: string;
  template: string;
  defaultTemplate: string;
  variables: string[];
  enabled: boolean;
}

export const DEFAULT_WHATSAPP_TEMPLATES: Record<string, WhatsAppTemplateConfig> = {
  booked: {
    id: 'booked',
    title: 'Order Booked / Confirmation',
    titleHi: 'आर्डर कन्फर्मेशन (बिना लाइव ट्रैकिंग)',
    category: 'lifecycle',
    eventType: 'booked',
    description: 'Triggered automatically when a new delivery order is placed or booked.',
    descriptionHi: 'नया आर्डर बुक होते ही ग्राहक को तुरंत कन्फर्मेशन मैसेज भेजता है।',
    variables: ['{customerName}', '{billNo}', '{item}', '{amount}', '{paymentMode}', '{deliveryLocation}', '{franchiseName}', '{franchisePhone}', '{date}'],
    enabled: true,
    defaultTemplate: `💧 *नमस्ते {customerName} जी!*
आपका पानी टैंकर / आर्डर सफलतापूर्वक बुक हो गया है।

🧾 *बिल संख्या:* #{billNo}
📦 *आइटम:* {item}
💰 *राशि:* ₹{amount} ({paymentMode})
📍 *डिलीवरी पता:* {deliveryLocation}

धन्यवाद!
*{franchiseName}* 💧
📞 हेल्पलाइन: +91 {franchisePhone}`,
    template: `💧 *नमस्ते {customerName} जी!*
आपका पानी टैंकर / आर्डर सफलतापूर्वक बुक हो गया है।

🧾 *बिल संख्या:* #{billNo}
📦 *आइटम:* {item}
💰 *राशि:* ₹{amount} ({paymentMode})
📍 *डिलीवरी पता:* {deliveryLocation}

धन्यवाद!
*{franchiseName}* 💧
📞 हेल्पलाइन: +91 {franchisePhone}`,
  },

  filling: {
    id: 'filling',
    title: 'Water Filling at Hydrant',
    titleHi: 'हाइड्रेंट पर पानी भराई शुरू (Filling Status)',
    category: 'lifecycle',
    eventType: 'filling',
    description: 'Triggered when tractor/tanker is loading fresh water at the hydrant filling station.',
    descriptionHi: 'जब टैंकर में हाइड्रेंट स्टेशन से शुद्ध पानी भरा जा रहा हो।',
    variables: ['{customerName}', '{billNo}', '{item}', '{tractorNo}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `🚰 *नमस्ते {customerName} जी!*
आपकी *बिल संख्या #{billNo}* के लिए शुद्ध पानी का टैंकर भरा जा रहा है।

🚜 *ट्रैक्टर / टैंकर संख्या:* {tractorNo}
⏳ *स्थिति:* हाइड्रेंट पर पानी भराई जारी

कुछ ही देर में टैंकर आपके पते के लिए रवाना होगा।
*{franchiseName}* 💧
📞 हेल्पलाइन: +91 {franchisePhone}`,
    template: `🚰 *नमस्ते {customerName} जी!*
आपकी *बिल संख्या #{billNo}* के लिए शुद्ध पानी का टैंकर भरा जा रहा है।

🚜 *ट्रैक्टर / टैंकर संख्या:* {tractorNo}
⏳ *स्थिति:* हाइड्रेंट पर पानी भराई जारी

कुछ ही देर में टैंकर आपके पते के लिए रवाना होगा।
*{franchiseName}* 💧
📞 हेल्पलाइन: +91 {franchisePhone}`,
  },

  dispatched: {
    id: 'dispatched',
    title: 'Out for Delivery / Dispatched (रवाना)',
    titleHi: 'डिलीवरी के लिए रवाना (ड्राइवर नाम + थर्मल बिल कॉपी)',
    category: 'lifecycle',
    eventType: 'dispatched',
    description: 'Triggered when driver starts trip. Sends Driver name, Driver phone, Tractor No & attaches thermal receipt copy.',
    descriptionHi: 'टैंकर रवाना होते ही ड्राइवर का नाम, मोबाइल नंबर व थर्मल बिल कॉपी संलग्न कर भेजता है।',
    variables: ['{customerName}', '{billNo}', '{item}', '{tractorNo}', '{driverName}', '{driverPhone}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `🚚 *नमस्ते {customerName} जी!*
आपकी *बिल संख्या #{billNo}* डिलीवरी के लिए रवाना हो चुकी है।

👤 *ड्राइवर का नाम:* {driverName}
📞 *ड्राइवर मोबाइल:* {driverPhone}
🚜 *ट्रैक्टर संख्या:* {tractorNo}

📄 *आपके बिल की थर्मल रसीद नीचे संलग्न (Attach) है।*
कृपया डिलीवरी पॉइंट पर गेट खुला रखें।
*{franchiseName}* 💧
📞 हेल्पलाइन: +91 {franchisePhone}`,
    template: `🚚 *नमस्ते {customerName} जी!*
आपकी *बिल संख्या #{billNo}* डिलीवरी के लिए रवाना हो चुकी है।

👤 *ड्राइवर का नाम:* {driverName}
📞 *ड्राइवर मोबाइल:* {driverPhone}
🚜 *ट्रैक्टर संख्या:* {tractorNo}

📄 *आपके बिल की थर्मल रसीद नीचे संलग्न (Attach) है।*
कृपया डिलीवरी पॉइंट पर गेट खुला रखें।
*{franchiseName}* 💧
📞 हेल्पलाइन: +91 {franchisePhone}`,
  },

  delivered: {
    id: 'delivered',
    title: 'Delivered & Thank You Note',
    titleHi: 'पानी डिलीवर एवं धन्यवाद नोट',
    category: 'lifecycle',
    eventType: 'delivered',
    description: 'Triggered upon successful delivery completion. Sends thank you note and receipt summary.',
    descriptionHi: 'डिलीवरी पूरी होते ही धन्यवाद संदेश एवं पेमेंट विवरण भेजता है।',
    variables: ['{customerName}', '{billNo}', '{item}', '{amount}', '{paymentStatus}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `💐 *Thank you for ordering tanker from {franchiseName}!* 💧

नमस्ते {customerName} जी, आपका पानी सफलतापूर्वक डिलीवर हो गया है।

🧾 *बिल संख्या:* #{billNo}
💰 *राशि:* ₹{amount}
📌 *पेमेंट स्थिति:* {paymentStatus}

आपकी सेवा में सदा तत्पर! 💧
📞 सपोर्ट: +91 {franchisePhone}`,
    template: `💐 *Thank you for ordering tanker from {franchiseName}!* 💧

नमस्ते {customerName} जी, आपका पानी सफलतापूर्वक डिलीवर हो गया है।

🧾 *बिल संख्या:* #{billNo}
💰 *राशि:* ₹{amount}
📌 *पेमेंट स्थिति:* {paymentStatus}

आपकी सेवा में सदा तत्पर! 💧
📞 सपोर्ट: +91 {franchisePhone}`,
  },

  cancelled: {
    id: 'cancelled',
    title: 'Order Cancelled Notice',
    titleHi: 'आर्डर रद्द खेद सूचना',
    category: 'lifecycle',
    eventType: 'cancelled',
    description: 'Triggered when an order is cancelled with regret message and support helpline.',
    descriptionHi: 'आर्डर रद्द होने पर खेद संदेश एवं पुनः सेवा की आशा व्यक्त करता है।',
    variables: ['{customerName}', '{billNo}', '{cancelReason}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `❌ *नमस्ते {customerName} जी!*
हमें खेद है कि आपका टैंकर आर्डर #{billNo} कैंसिल हुआ है। आशा करते हैं अगली बार हमारी सेवा बेहतर होगी।

किसी भी सहायता के लिए संपर्क करें:
📞 हेल्पलाइन: +91 {franchisePhone}
*{franchiseName}* 💧`,
    template: `❌ *नमस्ते {customerName} जी!*
हमें खेद है कि आपका टैंकर आर्डर #{billNo} कैंसिल हुआ है। आशा करते हैं अगली बार हमारी सेवा बेहतर होगी।

किसी भी सहायता के लिए संपर्क करें:
📞 हेल्पलाइन: +91 {franchisePhone}
*{franchiseName}* 💧`,
  },

  bill_generated: {
    id: 'bill_generated',
    title: 'Digital Tax Invoice / Standard Bill',
    titleHi: 'डिजिटल टैक्स इनवॉइस / बिल',
    category: 'lifecycle',
    eventType: 'bill_generated',
    description: 'Sent when invoice is shared or exported manually.',
    descriptionHi: 'ग्राहकों को बिल शेयर करने के लिए प्रयुक्त डिजिटल इनवॉइस फॉर्मेट।',
    variables: ['{customerName}', '{billNo}', '{item}', '{amount}', '{paymentMode}', '{liveUrl}', '{upiId}', '{upiLink}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `🧾 *Digital Tax Invoice / Water Bill*
Namaste {customerName}!

🧾 *Bill No:* #{billNo}
💧 *Service / Item:* {item}
💰 *Grand Total:* ₹{amount}
📌 *Payment Mode:* {paymentMode}

🌐 *View & Download Digital Bill:*
👉 {liveUrl}

💳 *Instant UPI Payment Link:*
{upiLink}

Thank you!
*{franchiseName}* 💧
📞 Helpline: +91 {franchisePhone}`,
    template: `🧾 *Digital Tax Invoice / Water Bill*
Namaste {customerName}!

🧾 *Bill No:* #{billNo}
💧 *Service / Item:* {item}
💰 *Grand Total:* ₹{amount}
📌 *Payment Mode:* {paymentMode}

🌐 *View & Download Digital Bill:*
👉 {liveUrl}

💳 *Instant UPI Payment Link:*
{upiLink}

Thank you!
*{franchiseName}* 💧
📞 Helpline: +91 {franchisePhone}`,
  },

  payment_reminder: {
    id: 'payment_reminder',
    title: 'Outstanding Udhaar / Payment Reminder',
    titleHi: 'उधार / बकाया राशि पेमेंट रिमाइंडर',
    category: 'account',
    eventType: 'payment_reminder',
    description: 'Friendly reminder sent to customers regarding pending balance and instant UPI pay link.',
    descriptionHi: 'ग्राहक को बकाया राशि की विनम्र याददिहानी और 1-क्लिक UPI लिंक।',
    variables: ['{customerName}', '{dueAmount}', '{upiId}', '{upiLink}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `🙏 *Namaste {customerName} ji!*
*${`{franchiseName}`}* ki taraf se snehpurna namaskar. 💧

Aapke water delivery account me kul bakaya rashi (Outstanding Due):
💰 *Pending Amount:* ₹{dueAmount}

Kripya suvidhajanak tarike se UPI se bhugtan karne ke liye neeche diye link par click karein:
💳 *1-Click UPI Payment:*
{upiLink}

(UPI ID: {upiId})

Aapke nirantar sahyog ke liye hardik dhanyawad!
*{franchiseName}* 💧
📞 Helpline: +91 {franchisePhone}`,
    template: `🙏 *Namaste {customerName} ji!*
*${`{franchiseName}`}* ki taraf se snehpurna namaskar. 💧

Aapke water delivery account me kul bakaya rashi (Outstanding Due):
💰 *Pending Amount:* ₹{dueAmount}

Kripya suvidhajanak tarike se UPI se bhugtan karne ke liye neeche diye link par click karein:
💳 *1-Click UPI Payment:*
{upiLink}

(UPI ID: {upiId})

Aapke nirantar sahyog ke liye hardik dhanyawad!
*{franchiseName}* 💧
📞 Helpline: +91 {franchisePhone}`,
  },

  payment_receipt: {
    id: 'payment_receipt',
    title: 'Payment Received Acknowledgment',
    titleHi: 'पेमेंट प्राप्ति रसीद सूचना',
    category: 'account',
    eventType: 'payment_receipt',
    description: 'Sent when customer makes a payment or voucher receipt is posted in ledger.',
    descriptionHi: 'पेमेंट प्राप्त होने पर ग्राहक को तुरंत धन्यवाद एवं रसीद मेसेज भेजता है।',
    variables: ['{customerName}', '{amount}', '{paymentMode}', '{date}', '{dueAmount}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `💐 *Payment Received (Raseed)!*
Namaste {customerName} ji!

Hamein aapka bhugtan prapt ho gaya hai:
💰 *Amount Received:* ₹{amount}
📌 *Payment Mode:* {paymentMode}
📅 *Date:* {date}
📊 *Remaining Balance:* ₹{dueAmount}

Samay par bhugtan karne ke liye aapka hardik aabhar!
*{franchiseName}* 💧
📞 Support: +91 {franchisePhone}`,
    template: `💐 *Payment Received (Raseed)!*
Namaste {customerName} ji!

Hamein aapka bhugtan prapt ho gaya hai:
💰 *Amount Received:* ₹{amount}
📌 *Payment Mode:* {paymentMode}
📅 *Date:* {date}
📊 *Remaining Balance:* ₹{dueAmount}

Samay par bhugtan karne ke liye aapka hardik aabhar!
*{franchiseName}* 💧
📞 Support: +91 {franchisePhone}`,
  },

  monthly_pass_renew: {
    id: 'monthly_pass_renew',
    title: 'Monthly Can Pass Plan Activation',
    titleHi: '20L Can मंथली पास एक्टिवेशन',
    category: 'account',
    eventType: 'monthly_pass_renew',
    description: 'Sent when customer activates or renews 20L RO Water Can monthly subscription plan.',
    descriptionHi: 'ग्राहक का 20L केन मासिक पास प्लान एक्टिवेट होने पर कन्फर्मेशन।',
    variables: ['{customerName}', '{amount}', '{date}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `🎉 *Monthly Water Pass Activated!*
Namaste {customerName} ji!

Aapka 20L RO Water Can *Monthly Subscription Pass* successfully activate ho chuka hai!
💰 *Plan Rate:* ₹{amount}/month
✨ *Feature:* Free Daily RO Can Delivery + Dispenser Support
📅 *Activation Date:* {date}

Shuddh aur sheetal jal aapke dwar par!
*{franchiseName}* 💧
📞 Helpline: +91 {franchisePhone}`,
    template: `🎉 *Monthly Water Pass Activated!*
Namaste {customerName} ji!

Aapka 20L RO Water Can *Monthly Subscription Pass* successfully activate ho chuka hai!
💰 *Plan Rate:* ₹{amount}/month
✨ *Feature:* Free Daily RO Can Delivery + Dispenser Support
📅 *Activation Date:* {date}

Shuddh aur sheetal jal aapke dwar par!
*{franchiseName}* 💧
📞 Helpline: +91 {franchisePhone}`,
  },

  hydrant_token: {
    id: 'hydrant_token',
    title: 'Hydrant Filling Token Slip',
    titleHi: 'हाइड्रेंट टोकन एवं वाटर फिलिंग पर्ची',
    category: 'hydrant',
    eventType: 'hydrant_token',
    description: 'Sent when a tanker filling token is created at the Hydrant filling station.',
    descriptionHi: 'हाइड्रेंट स्टेशन पर टैंकर भराई टोकन कटने पर पर्ची मेसेज।',
    variables: ['{customerName}', '{tokenNo}', '{item}', '{amount}', '{tractorNo}', '{paymentMode}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `🚰 *Hydrant Filling Token Slip*
Namaste {customerName}!

Aapka water filling token create ho chuka hai:
🏷️ *Token No:* #{tokenNo}
🚜 *Vehicle / Tractor:* {tractorNo}
💧 *Quantity / Item:* {item}
💰 *Total Amount:* ₹{amount} ({paymentMode})

*{franchiseName} Hydrant Station* 💧
📞 Support: +91 {franchisePhone}`,
    template: `🚰 *Hydrant Filling Token Slip*
Namaste {customerName}!

Aapka water filling token create ho chuka hai:
🏷️ *Token No:* #{tokenNo}
🚜 *Vehicle / Tractor:* {tractorNo}
💧 *Quantity / Item:* {item}
💰 *Total Amount:* ₹{amount} ({paymentMode})

*{franchiseName} Hydrant Station* 💧
📞 Support: +91 {franchisePhone}`,
  },

  diwali: {
    id: 'diwali',
    title: 'Happy Diwali Wishes & Greeting',
    titleHi: '🪔 शुभ दीपावली मंगलकामनाएं',
    category: 'broadcast',
    eventType: 'broadcast_diwali',
    description: 'Broadcast template for festive Diwali greetings with franchise branding.',
    descriptionHi: 'दीपावली के पावन पर्व पर सभी सम्मानित ग्राहकों को 1-क्लिक ब्रॉडकास्ट बधाई सन्देश।',
    variables: ['{customerName}', '{franchiseName}', '{franchisePhone}', '{date}'],
    enabled: true,
    defaultTemplate: `🪔 *शुभ दीपावली की हार्दिक शुभकामनाएं!* 🪔
प्रिय {customerName} जी,

*{franchiseName}* की तरफ से आपको और आपके पूरे परिवार को दीपावली के पावन पर्व की अनंत मंगलकामनाएं! 

मां लक्ष्मी की कृपा से आपका घर-आंगन सुख, शांति, समृद्धि और उत्तम स्वास्थ्य से सदा परिपूर्ण रहे। 💧✨

📞 शुद्ध जल आपूर्ति एवं टैंकर बुकिंग: +91 {franchisePhone}`,
    template: `🪔 *शुभ दीपावली की हार्दिक शुभकामनाएं!* 🪔
प्रिय {customerName} जी,

*{franchiseName}* की तरफ से आपको और आपके पूरे परिवार को दीपावली के पावन पर्व की अनंत मंगलकामनाएं! 

मां लक्ष्मी की कृपा से आपका घर-आंगन सुख, शांति, समृद्धि और उत्तम स्वास्थ्य से सदा परिपूर्ण रहे। 💧✨

📞 शुद्ध जल आपूर्ति एवं टैंकर बुकिंग: +91 {franchisePhone}`,
  },

  holi: {
    id: 'holi',
    title: 'Happy Holi Greetings',
    titleHi: '🎨 रंगों का त्योहार होली बधाई',
    category: 'broadcast',
    eventType: 'broadcast_holi',
    description: 'Broadcast template for colorful Holi festive wishes.',
    descriptionHi: 'होली के उत्सव पर सभी ग्राहकों को रंगारंग शुभकामना सन्देश।',
    variables: ['{customerName}', '{franchiseName}', '{franchisePhone}', '{date}'],
    enabled: true,
    defaultTemplate: `🎨 *रंगों के पावन पर्व होली की हार्दिक शुभकामनाएं!* 🎨
प्रिय {customerName} जी,

*{franchiseName}* की ओर से आपको और आपके परिवार को होली की ढेर सारी शुभकामनाएं! रंगों का यह पावन पर्व आपके जीवन में खुशियों, समृद्धि और उत्तम स्वास्थ्य के नए रंग भरे। 💧🌸

💧 20L RO Can / टैंकर सेवा हेल्पलाइन: +91 {franchisePhone}`,
    template: `🎨 *रंगों के पावन पर्व होली की हार्दिक शुभकामनाएं!* 🎨
प्रिय {customerName} जी,

*{franchiseName}* की ओर से आपको और आपके परिवार को होली की ढेर सारी शुभकामनाएं! रंगों का यह पावन पर्व आपके जीवन में खुशियों, समृद्धि और उत्तम स्वास्थ्य के नए रंग भरे। 💧🌸

💧 20L RO Can / टैंकर सेवा हेल्पलाइन: +91 {franchisePhone}`,
  },

  newyear: {
    id: 'newyear',
    title: 'Happy New Year Wishes',
    titleHi: '✨ नव वर्ष मंगलकामनाएं',
    category: 'broadcast',
    eventType: 'broadcast_newyear',
    description: 'Broadcast template for welcoming the new year with customers.',
    descriptionHi: 'नव वर्ष पर ग्राहकों को नव वर्ष की शुभकामनाएं।',
    variables: ['{customerName}', '{franchiseName}', '{franchisePhone}', '{date}'],
    enabled: true,
    defaultTemplate: `✨ *नव वर्ष की हार्दिक शुभकामनाएं!* ✨
प्रिय {customerName} जी,

नया साल आपके और आपके परिवार के लिए नई उमंग, अपार सफलता और उत्तम स्वास्थ्य लेकर आए। 
*{franchiseName}* हमेशा आपकी विश्वसनीय जल सेवा के लिए तत्पर है। 💧🌱

📞 संपर्क: +91 {franchisePhone}`,
    template: `✨ *नव वर्ष की हार्दिक शुभकामनाएं!* ✨
प्रिय {customerName} जी,

नया साल आपके और आपके परिवार के लिए नई उमंग, अपार सफलता और उत्तम स्वास्थ्य लेकर आए। 
*{franchiseName}* हमेशा आपकी विश्वसनीय जल सेवा के लिए तत्पर है। 💧🌱

📞 संपर्क: +91 {franchisePhone}`,
  },

  summer_offer: {
    id: 'summer_offer',
    title: 'Summer Season Discount Offer',
    titleHi: '☀️ ग्रीष्मकालीन स्पेशल डिस्काउंट ऑफर',
    category: 'broadcast',
    eventType: 'broadcast_summer',
    description: 'Promotional broadcast message for peak summer bulk water discounts.',
    descriptionHi: 'गर्मियों में वाटर टैंकर व आरओ केन स्पेशल ऑफर का प्रचार सन्देश।',
    variables: ['{customerName}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `☀️ *गर्मी में शुद्ध जल की गारंटी - स्पेशल ऑफर!* ☀️
प्रिय {customerName} जी,

इस भीषण गर्मी में अपने परिवार और बिजनेस के लिए पाएं 100% शुद्ध और शीतल जल:
💧 *20L RO Water Can* - तुरंत डिलीवरी
🚜 *5000L / 6000L / 10,000L टैंकर* - 1 कॉल में आपके द्वार

📞 आज ही ऑर्डर बुक करें: +91 {franchisePhone}
*{franchiseName}* 💧`,
    template: `☀️ *गर्मी में शुद्ध जल की गारंटी - स्पेशल ऑफर!* ☀️
प्रिय {customerName} जी,

इस भीषण गर्मी में अपने परिवार और बिजनेस के लिए पाएं 100% शुद्ध और शीतल जल:
💧 *20L RO Water Can* - तुरंत डिलीवरी
🚜 *5000L / 6000L / 10,000L टैंकर* - 1 कॉल में आपके द्वार

📞 आज ही ऑर्डर बुक करें: +91 {franchisePhone}
*{franchiseName}* 💧`,
  },

  monthly_pass_promo: {
    id: 'monthly_pass_promo',
    title: 'Monthly RO Can Pass Promotion',
    titleHi: '💧 मंथली पास स्पेशल प्लान प्रमोशन',
    category: 'broadcast',
    eventType: 'broadcast_monthly_pass',
    description: 'Promotional broadcast for regular households and shops to subscribe to monthly cans.',
    descriptionHi: 'मंथली पास प्लान का प्रचार सन्देश।',
    variables: ['{customerName}', '{franchiseName}', '{franchisePhone}'],
    enabled: true,
    defaultTemplate: `💧 *20L RO Water Can - मंथली पास स्पेशल प्लान* 💧
नमस्ते {customerName} जी!

अब रोज़-रोज़ ऑर्डर करने की झंझट खत्म! 
🎉 *मात्र ₹600/महीना* में पाएं 20L RO Water Cans + *फ्री हॉट एंड कोल्ड डिस्पेंसर सपोर्ट*!

📞 तुरंत एक्टिवेट करने के लिए कॉल करें: +91 {franchisePhone}
*{franchiseName}*`,
    template: `💧 *20L RO Water Can - मंथली पास स्पेशल प्लान* 💧
नमस्ते {customerName} जी!

अब रोज़-रोज़ ऑर्डर करने की झंझट खत्म! 
🎉 *मात्र ₹600/महीना* में पाएं 20L RO Water Cans + *फ्री हॉट एंड कोल्ड डिस्पेंसर सपोर्ट*!

📞 तुरंत एक्टिवेट करने के लिए कॉल करें: +91 {franchisePhone}
*{franchiseName}*`,
  },

  custom_broadcast: {
    id: 'custom_broadcast',
    title: 'Custom Announcement Template',
    titleHi: '✍️ कस्टम ब्रॉडकास्ट व सामान्य घोषणा',
    category: 'broadcast',
    eventType: 'broadcast_custom',
    description: 'Free-form custom broadcast message template for general notices and announcements.',
    descriptionHi: 'अपनी इच्छानुसार कोई भी सामान्य घोषणा या सूचना भेजने हेतु टेम्पलेट।',
    variables: ['{customerName}', '{franchiseName}', '{franchisePhone}', '{date}'],
    enabled: true,
    defaultTemplate: `नमस्ते {customerName} जी! 💧

*{franchiseName}* की तरफ से विशेष सूचना...

हेल्पलाइन: +91 {franchisePhone}`,
    template: `नमस्ते {customerName} जी! 💧

*{franchiseName}* की तरफ से विशेष सूचना...

हेल्पलाइन: +91 {franchisePhone}`,
  },
};

class WhatsAppEngine {
  private socket: any = null;
  private status: WhatsAppStatus["status"] = "disconnected";
  private qrCodeDataUrl: string | null = null;
  private rawQr: string | null = null;
  private connectedUser: WhatsAppStatus["user"] = null;
  private connectedAt: string | null = null;
  private isInitializing = false;
  private isExplicitlyDisconnected = false;
  private initPromise: Promise<WhatsAppStatus> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private authDir = path.join(process.cwd(), ".whatsapp_auth");
  private autoNotifications = {
    onOrderBooked: true,
    onFilling: true,
    onDispatched: true,
    onDelivered: true,
    onCancelled: true,
  };
  private broadcastQueue: Array<{
    id: string;
    phone: string;
    message: string;
    customerName?: string;
  }> = [];
  private isProcessingQueue = false;

  constructor() {
    // Ensure auth folder exists
    if (!fs.existsSync(this.authDir)) {
      try {
        fs.mkdirSync(this.authDir, { recursive: true });
      } catch (e) {
        console.error("Failed to create WhatsApp auth dir:", e);
      }
    }
  }

  public getStatus(): WhatsAppStatus {
    if (this.isExplicitlyDisconnected || this.status === "disconnected") {
      return {
        status: "disconnected",
        qrCodeDataUrl: null,
        rawQr: null,
        user: null,
        connectedAt: null,
        autoNotifications: this.autoNotifications,
      };
    }

    // If we have an authenticated user, preserve the connected status
    const effectiveStatus = this.connectedUser ? "connected" : this.status;

    return {
      status: effectiveStatus,
      qrCodeDataUrl: this.connectedUser ? null : this.qrCodeDataUrl,
      rawQr: this.connectedUser ? null : this.rawQr,
      user: this.connectedUser,
      connectedAt: this.connectedAt,
      autoNotifications: this.autoNotifications,
    };
  }

  public updateAutoNotificationSettings(settings: Partial<WhatsAppStatus["autoNotifications"]>) {
    this.autoNotifications = {
      ...this.autoNotifications,
      ...settings,
    };
    return this.autoNotifications;
  }

  public async initialize(forceRefresh = false): Promise<WhatsAppStatus> {
    this.isExplicitlyDisconnected = false;

    if (this.initPromise && !forceRefresh) {
      return this.initPromise;
    }

    if (this.socket && this.connectedUser && !forceRefresh) {
      const wsState = this.socket?.ws?.readyState;
      if (wsState === undefined || wsState === 1) {
        return this.getStatus();
      }
    }

    this.initPromise = this._doInitialize(forceRefresh).finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  private async _doInitialize(forceRefresh = false): Promise<WhatsAppStatus> {
    if (forceRefresh) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      if (this.socket) {
        try {
          this.socket.end(new Error("Force refreshing QR"));
        } catch (e) {}
        this.socket = null;
      }
      this.status = "connecting";
      this.rawQr = null;
      this.qrCodeDataUrl = null;
      this.connectedUser = null;
    }

    this.isInitializing = true;
    if (!this.connectedUser) {
      this.status = "connecting";
    }

    try {
      // Dynamically import baileys
      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = baileys;

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      // Check if credentials are already registered on disk
      const registeredJid = state?.creds?.me?.id || "";
      if (registeredJid) {
        const cleanPhone = registeredJid.split("@")[0]?.split(":")[0] || "";
        this.connectedUser = {
          id: registeredJid,
          phone: cleanPhone,
          name: state?.creds?.me?.name || "TankerWala WhatsApp Admin",
        };
        this.status = "connected";
        this.connectedAt = this.connectedAt || new Date().toISOString();
      }
      
      let version: [number, number, number] = [2, 3000, 1015901307];
      try {
        const v = await fetchLatestBaileysVersion();
        if (v && v.version) {
          version = v.version;
        }
      } catch (err) {
        // Fallback version
      }

      const logger = pino({ level: "silent" }) as any;

      // Create Baileys Socket with Signal Key Store caching
      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore ? makeCacheableSignalKeyStore(state.keys, logger) : state.keys,
        },
        logger,
        printQRInTerminal: false,
        browser: ["TankerWala Portal", "Chrome", "122.0.6261.94"],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
        emitOwnEvents: false,
        fireInitQueries: true,
      });

      this.socket = sock;

      // Handle Credentials update (saving authentication state)
      sock.ev.on("creds.update", () => {
        saveCreds();
        const updatedJid = state?.creds?.me?.id || "";
        if (updatedJid && !this.connectedUser) {
          const cleanPhone = updatedJid.split("@")[0]?.split(":")[0] || "";
          this.connectedUser = {
            id: updatedJid,
            phone: cleanPhone,
            name: state?.creds?.me?.name || "TankerWala WhatsApp Admin",
          };
          this.status = "connected";
          this.rawQr = null;
          this.qrCodeDataUrl = null;
          this.connectedAt = new Date().toISOString();
        }
      });

      // Handle Connection updates (QR code & Connection status)
      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update || {};

        if (qr && !this.connectedUser) {
          this.rawQr = qr;
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 320,
              color: {
                dark: "#0f172a",
                light: "#ffffff",
              },
            });
            this.status = "qr_ready";
            console.log("📱 [WHATSAPP] Fresh QR Code generated ready to scan");
          } catch (qrErr) {
            console.error("Failed to generate QR data url:", qrErr);
          }
        }

        if (connection === "open") {
          this.status = "connected";
          this.rawQr = null;
          this.qrCodeDataUrl = null;
          this.connectedAt = this.connectedAt || new Date().toISOString();

          const userJid = sock?.user?.id || state?.creds?.me?.id || "";
          const cleanPhone = userJid ? (userJid.split("@")[0]?.split(":")[0] || "") : "";
          this.connectedUser = {
            id: userJid || "whatsapp_user",
            phone: cleanPhone,
            name: sock?.user?.name || state?.creds?.me?.name || "TankerWala WhatsApp Admin",
          };

          console.log(`✅ [WHATSAPP] Session connected as +${this.connectedUser.phone} (${this.connectedUser.name})`);
        } else if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason?.loggedOut || statusCode === 401;

          console.log(`⚠️ [WHATSAPP] Connection closed (status: ${statusCode || 'closed'}). Logged out: ${isLoggedOut}, Explicit: ${this.isExplicitlyDisconnected}`);

          // Reset dead socket immediately so subsequent requests know to re-initialize
          if (this.socket === sock) {
            this.socket = null;
          }

          if (this.isExplicitlyDisconnected || isLoggedOut) {
            console.log("🔒 [WHATSAPP] Session officially disconnected / logged out.");
            if (this.reconnectTimer) {
              clearTimeout(this.reconnectTimer);
              this.reconnectTimer = null;
            }
            this.connectedUser = null;
            this.connectedAt = null;
            this.socket = null;
            this.status = "disconnected";
            this.rawQr = null;
            this.qrCodeDataUrl = null;

            // Clear auth folder
            try {
              if (fs.existsSync(this.authDir)) {
                fs.rmSync(this.authDir, { recursive: true, force: true });
                fs.mkdirSync(this.authDir, { recursive: true });
              }
            } catch (clearErr) {
              console.error("Failed to clear auth folder on logout:", clearErr);
            }
          } else {
            // Transient disconnect (e.g. 515 restartRequired, 408 timed out, network blip)
            if (!this.connectedUser && !state.creds?.me) {
              this.status = "connecting";
            } else {
              this.status = "connected";
            }

            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
              if (!this.isExplicitlyDisconnected) {
                this.initialize(false).catch(console.error);
              }
            }, 1500);
          }
        }
      });

      this.isInitializing = false;
      return this.getStatus();
    } catch (error: any) {
      console.error("❌ [WHATSAPP] Initialization error:", error);
      this.isInitializing = false;
      return this.getStatus();
    }
  }

  public async disconnect(): Promise<WhatsAppStatus> {
    try {
      this.isExplicitlyDisconnected = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.socket) {
        const oldSock = this.socket;
        this.socket = null;
        try {
          if (oldSock.ev) {
            oldSock.ev.removeAllListeners('connection.update');
            oldSock.ev.removeAllListeners('creds.update');
          }
        } catch (e) {}
        try {
          await oldSock.logout();
        } catch (e) {}
        try {
          oldSock.end(new Error("User requested disconnect"));
        } catch (e) {}
      }

      this.socket = null;
      this.status = "disconnected";
      this.rawQr = null;
      this.qrCodeDataUrl = null;
      this.connectedUser = null;
      this.connectedAt = null;
      this.isInitializing = false;
      this.initPromise = null;

      // Clean storage files
      if (fs.existsSync(this.authDir)) {
        try {
          fs.rmSync(this.authDir, { recursive: true, force: true });
          fs.mkdirSync(this.authDir, { recursive: true });
        } catch (e) {}
      }

      console.log("🔒 [WHATSAPP] Disconnected and auth session cleared.");
      return this.getStatus();
    } catch (err) {
      console.error("Error disconnecting WhatsApp session:", err);
      this.status = "disconnected";
      this.socket = null;
      this.connectedUser = null;
      return this.getStatus();
    }
  }

  /**
   * Helper to ensure active, open WhatsApp socket with authenticated user
   */
  private async ensureSocketReady(maxWaitMs = 6000): Promise<any> {
    if (this.isExplicitlyDisconnected) {
      return null;
    }

    const hasCredsOnDisk = fs.existsSync(path.join(this.authDir, "creds.json"));
    if (!this.connectedUser && !hasCredsOnDisk) {
      return null;
    }

    const isSocketReady = () => {
      if (!this.socket) return false;
      const wsState = this.socket?.ws?.readyState;
      if (wsState !== undefined && wsState !== 1) return false;
      // Must have authenticated user identity established
      const userId = this.socket?.user?.id || this.connectedUser?.id;
      return Boolean(userId);
    };

    if (!isSocketReady()) {
      this.initialize(false).catch(() => {});
    }

    const start = Date.now();
    while (!isSocketReady() && Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 350));
    }

    if (this.socket && this.connectedUser) {
      if (!this.socket.user) {
        this.socket.user = {
          id: this.connectedUser.id,
          name: this.connectedUser.name || "TankerWala WhatsApp Admin",
        } as any;
      }
    }

    return isSocketReady() ? this.socket : null;
  }

  /**
   * Send single WhatsApp message to standard Indian or International phone number
   */
  public async sendMessage(rawPhone: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const cleanPhone = rawPhone ? String(rawPhone).replace(/\D/g, "") : "";
      if (!cleanPhone || cleanPhone.length < 10) {
        return { success: false, error: "Invalid phone number." };
      }

      const sock = await this.ensureSocketReady(6000);
      const hasUser = Boolean(sock?.user?.id || this.connectedUser?.id);
      if (!sock || !hasUser) {
        return {
          success: false,
          error: "WhatsApp is not connected. Please scan QR Code in Settings > WhatsApp to link your account.",
        };
      }

      // Format to WhatsApp JID (add 91 country code if standard 10 digit Indian number)
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const jid = `${formattedPhone}@s.whatsapp.net`;

      // Safety: make sure sock.user is populated so Baileys does not crash on .id
      if (!sock.user && this.connectedUser) {
        sock.user = {
          id: this.connectedUser.id,
          name: this.connectedUser.name || "TankerWala WhatsApp Admin",
        } as any;
      }

      try {
        const result = await sock.sendMessage(jid, { text });
        return {
          success: true,
          messageId: result?.key?.id || "msg_sent",
        };
      } catch (sendErr: any) {
        const errMsg = String(sendErr?.message || sendErr || "");
        if (errMsg.includes("Connection Closed") || errMsg.includes("closed") || errMsg.includes("reading 'id'") || errMsg.includes("output")) {
          console.warn(`⚠️ [WHATSAPP] Connection issue while sending to ${rawPhone}. Re-initializing socket...`);
          this.socket = null;
          await this.initialize(false);
          const freshSock = await this.ensureSocketReady(6000);
          if (freshSock && (freshSock.user?.id || this.connectedUser?.id)) {
            if (!freshSock.user && this.connectedUser) {
              freshSock.user = { id: this.connectedUser.id, name: this.connectedUser.name || "TankerWala WhatsApp Admin" } as any;
            }
            try {
              const retryResult = await freshSock.sendMessage(jid, { text });
              return {
                success: true,
                messageId: retryResult?.key?.id || "msg_sent",
              };
            } catch (retryErr: any) {
              // fall through to error handling
            }
          }
        }
        
        if (errMsg.includes("reading 'id'")) {
          return {
            success: false,
            error: "WhatsApp account is not linked. Please scan QR Code in Settings > WhatsApp to connect.",
          };
        }

        throw sendErr;
      }
    } catch (err: any) {
      console.error(`Failed to send WhatsApp message to ${rawPhone}:`, err);
      const errMsg = String(err?.message || "");
      return {
        success: false,
        error: errMsg.includes("reading 'id'")
          ? "WhatsApp is not linked. Please scan QR Code in Settings to connect."
          : (err.message || "Failed to deliver WhatsApp message."),
      };
    }
  }

  /**
   * Send media (Image / PDF bill thermal receipt) via WhatsApp
   */
  public async sendMedia(
    rawPhone: string,
    dataUrlOrBuffer: string | Buffer,
    caption?: string,
    mimetype = "image/jpeg",
    fileName = "Receipt.jpg"
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const cleanPhone = rawPhone ? String(rawPhone).replace(/\D/g, "") : "";
      if (!cleanPhone || cleanPhone.length < 10) {
        return { success: false, error: "Invalid phone number." };
      }

      const sock = await this.ensureSocketReady(6000);
      const hasUser = Boolean(sock?.user?.id || this.connectedUser?.id);
      if (!sock || !hasUser) {
        return {
          success: false,
          error: "WhatsApp is not connected. Please scan QR Code in Settings > WhatsApp to link your account.",
        };
      }

      // Format to WhatsApp JID (add 91 country code if standard 10 digit Indian number)
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const jid = `${formattedPhone}@s.whatsapp.net`;

      // Safety: make sure sock.user is populated so Baileys does not crash on .id
      if (!sock.user && this.connectedUser) {
        sock.user = {
          id: this.connectedUser.id,
          name: this.connectedUser.name || "TankerWala WhatsApp Admin",
        } as any;
      }

      let buffer: Buffer;
      if (Buffer.isBuffer(dataUrlOrBuffer)) {
        buffer = dataUrlOrBuffer;
      } else if (typeof dataUrlOrBuffer === "string" && dataUrlOrBuffer.startsWith("data:")) {
        const base64Data = dataUrlOrBuffer.split(",")[1] || dataUrlOrBuffer;
        buffer = Buffer.from(base64Data, "base64");
      } else if (typeof dataUrlOrBuffer === "string") {
        buffer = Buffer.from(dataUrlOrBuffer, "base64");
      } else {
        return { success: false, error: "Invalid media payload" };
      }

      const payload = mimetype.startsWith("image/")
        ? { image: buffer, caption: caption || "", mimetype, fileName }
        : { document: buffer, caption: caption || "", mimetype, fileName };

      try {
        const result = await sock.sendMessage(jid, payload);
        return {
          success: true,
          messageId: result?.key?.id || "media_sent",
        };
      } catch (mediaErr: any) {
        const errMsg = String(mediaErr?.message || mediaErr || "");
        if (errMsg.includes("Connection Closed") || errMsg.includes("closed") || errMsg.includes("reading 'id'") || errMsg.includes("output")) {
          console.warn(`⚠️ [WHATSAPP] Connection issue while sending media to ${rawPhone}. Reconnecting and retrying...`);
          this.socket = null;
          await this.initialize(false);
          const freshSock = await this.ensureSocketReady(6000);
          if (freshSock && (freshSock.user?.id || this.connectedUser?.id)) {
            if (!freshSock.user && this.connectedUser) {
              freshSock.user = { id: this.connectedUser.id, name: this.connectedUser.name || "TankerWala WhatsApp Admin" } as any;
            }
            try {
              const retryResult = await freshSock.sendMessage(jid, payload);
              return {
                success: true,
                messageId: retryResult?.key?.id || "media_sent",
              };
            } catch (retryErr) {
              // fall through
            }
          }
        }
        
        if (errMsg.includes("reading 'id'")) {
          return {
            success: false,
            error: "WhatsApp account is not linked. Please scan QR Code in Settings > WhatsApp to connect.",
          };
        }

        throw mediaErr;
      }
    } catch (err: any) {
      console.error(`Failed to send WhatsApp media to ${rawPhone}:`, err);
      // Fallback to text if media delivery fails
      if (caption) {
        return this.sendMessage(rawPhone, caption);
      }
      const errMsg = String(err?.message || "");
      return {
        success: false,
        error: errMsg.includes("reading 'id'")
          ? "WhatsApp is not linked. Please scan QR Code in Settings to connect."
          : (err.message || "Failed to send media via WhatsApp."),
      };
    }
  }

  // Templates Store
  private templates: Record<string, WhatsAppTemplateConfig> = { ...DEFAULT_WHATSAPP_TEMPLATES };

  /**
   * Return all registered WhatsApp templates (customized + defaults)
   */
  public getTemplates(): Record<string, WhatsAppTemplateConfig> {
    return this.templates;
  }

  /**
   * Update and save custom template configuration
   */
  public updateTemplate(id: string, updates: Partial<WhatsAppTemplateConfig>): WhatsAppTemplateConfig | null {
    if (!this.templates[id]) {
      // Create if valid structure
      if (updates.template && updates.title) {
        this.templates[id] = {
          id,
          title: updates.title || id,
          titleHi: updates.titleHi || updates.title || id,
          category: updates.category || 'lifecycle',
          description: updates.description || '',
          descriptionHi: updates.descriptionHi || '',
          variables: updates.variables || ['{customerName}', '{billNo}', '{amount}', '{franchiseName}', '{franchisePhone}'],
          enabled: updates.enabled !== undefined ? updates.enabled : true,
          defaultTemplate: updates.defaultTemplate || updates.template,
          template: updates.template,
        };
        return this.templates[id];
      }
      return null;
    }

    this.templates[id] = {
      ...this.templates[id],
      ...updates,
      template: updates.template !== undefined ? updates.template : this.templates[id].template,
      enabled: updates.enabled !== undefined ? updates.enabled : this.templates[id].enabled,
    };

    return this.templates[id];
  }

  /**
   * Bulk set or restore templates from client / franchise config
   */
  public setTemplates(customTemplates: Record<string, Partial<WhatsAppTemplateConfig>>): Record<string, WhatsAppTemplateConfig> {
    Object.entries(customTemplates).forEach(([id, config]) => {
      if (this.templates[id]) {
        this.templates[id] = {
          ...this.templates[id],
          ...config,
        };
      }
    });
    return this.templates;
  }

  /**
   * Helper to replace dynamic variable placeholders in any template
   */
  public resolveTemplateVariables(templateStr: string, data: Record<string, any>): string {
    let result = templateStr;
    Object.entries(data).forEach(([key, val]) => {
      const regex = new RegExp(`\\{${key}\\}`, "gi");
      result = result.replace(regex, val !== undefined && val !== null ? String(val) : "");
    });
    return result;
  }

  /**
   * Formats and delivers real-time Lifecycle Order Notifications with custom template support
   */
  public async sendOrderLifecycleNotification(
    bill: any,
    eventType: string,
    franchise?: any,
    customTemplateOverride?: string,
    imageDataUrl?: string
  ): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
    const rawMobile = bill?.customerMobile || bill?.mobile || bill?.phone;
    if (!bill || !rawMobile) {
      return { success: false, error: "No customer mobile found on bill." };
    }

    // Check if auto-notification is enabled for this event
    if (eventType === "booked" && !this.autoNotifications.onOrderBooked) return { success: true, skipped: true };
    if (eventType === "filling" && !this.autoNotifications.onFilling) return { success: true, skipped: true };
    if (eventType === "dispatched" && !this.autoNotifications.onDispatched) return { success: true, skipped: true };
    if (eventType === "delivered" && !this.autoNotifications.onDelivered) return { success: true, skipped: true };
    if (eventType === "cancelled" && !this.autoNotifications.onCancelled) return { success: true, skipped: true };

    const franchiseName = franchise?.printName || franchise?.name || "Rajhans Water Supply";
    const franchisePhone = franchise?.printMobile || franchise?.operatorMobile || "9413339987";
    const upiId = franchise?.upiId || "rajha94133@barodampay";
    const customerName = bill.customerName || bill.name || "Valued Customer";
    const billNo = bill.billNumber || bill.tokenNumber || bill.id?.slice(0, 6) || "N/A";
    const amount = bill.grandTotal || bill.totalAmount || bill.amount || 0;
    const dueAmount = bill.dueAmount !== undefined ? bill.dueAmount : (bill.pendingAmount !== undefined ? bill.pendingAmount : (bill.previousPendingDuesAmount || amount));
    const paymentMode = bill.paymentMode || "Cash";
    const paymentStatus = bill.paymentStatus || (bill.isSettled ? "Paid ✅" : paymentMode);

    let capacityText = `${bill.tankerSize || "5000"}L Water Tanker`;
    if (bill.category === "CAN" || bill.category === "MONTHLY_CAN") {
      capacityText = `20L RO Water Can (${bill.quantity || 1} Pcs)`;
    } else if (bill.category === "BOTTLE") {
      capacityText = `Packaged Water Bottle (${bill.bottleSize || "1L"}, ${bill.quantity || 1} Pcs)`;
    }

    const livePortalUrl = bill.id ? `https://${process.env.AIS_DOMAIN || "tankerwala.app"}/?o=${bill.id}` : `https://${process.env.AIS_DOMAIN || "tankerwala.app"}`;
    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(franchiseName)}&am=${amount}&cu=INR`;

    // 1. Resolve template from: (a) Explicit override, (b) Franchise custom templates, (c) Server custom template, (d) Default template
    const templateConfig = this.templates[eventType] || DEFAULT_WHATSAPP_TEMPLATES[eventType];
    const franchiseCustomTemplate = franchise?.whatsappTemplates?.[eventType]?.template || franchise?.whatsappTemplates?.[eventType];
    const rawTemplate = customTemplateOverride || (typeof franchiseCustomTemplate === 'string' ? franchiseCustomTemplate : null) || templateConfig?.template || DEFAULT_WHATSAPP_TEMPLATES[eventType]?.defaultTemplate;

    if (!rawTemplate) {
      return { success: false, error: `No template found for event: ${eventType}` };
    }

    // 2. Replace all dynamic variables
    const variableMap: Record<string, any> = {
      name: customerName,
      customerName,
      customerMobile: rawMobile,
      billNo,
      tokenNo: bill.tokenNumber || billNo,
      item: capacityText,
      quantity: bill.quantity || 1,
      amount,
      grandTotal: amount,
      dueAmount,
      paymentMode,
      paymentStatus,
      deliveryLocation: bill.deliveryLocation?.address || bill.customAddress || bill.customerAddress || "Your registered address",
      driverName: bill.driverName || "Official Delivery Driver",
      driverPhone: bill.driverMobile || bill.driverPhone || franchisePhone,
      tractorNo: bill.tractorNumber || bill.vehicleNumber || bill.tractorId || "Assigned Tractor",
      liveUrl: livePortalUrl,
      portalUrl: livePortalUrl,
      upiId,
      upiLink,
      franchiseName,
      franchisePhone,
      date: bill.date ? String(bill.date).slice(0, 10) : new Date().toLocaleDateString("en-IN"),
      cancelReason: bill.cancelReason || "Cancelled by request",
    };

    const message = this.resolveTemplateVariables(rawTemplate, variableMap);

    // If image data URL is provided (e.g. thermal invoice JPG during dispatch), send as media with caption
    if (imageDataUrl) {
      return this.sendMedia(rawMobile, imageDataUrl, message, "image/jpeg", `Bill_${billNo}.jpg`);
    }

    return this.sendMessage(rawMobile, message);
  }

  /**
   * Process Bulk WhatsApp Broadcast with smart Anti-Ban Queue (2.5s delay between messages)
   */
  public async queueBroadcast(
    recipients: Array<{ phone: string; name: string }>,
    messageTemplate: string,
    franchise?: any
  ): Promise<{ queuedCount: number }> {
    const franchiseName = franchise?.printName || franchise?.name || "Rajhans Water Supply";
    const franchisePhone = franchise?.printMobile || franchise?.operatorMobile || "9413339987";

    const newItems = recipients.map((r, index) => {
      let personalized = messageTemplate
        .replace(/\{name\}/gi, r.name || "Customer")
        .replace(/\{customerName\}/gi, r.name || "Customer")
        .replace(/\{phone\}/gi, r.phone || "")
        .replace(/\{franchiseName\}/gi, franchiseName)
        .replace(/\{franchisePhone\}/gi, franchisePhone)
        .replace(/\{date\}/gi, new Date().toLocaleDateString("en-IN"));

      return {
        id: `bc_${Date.now()}_${index}`,
        phone: r.phone,
        message: personalized,
        customerName: r.name,
      };
    });

    this.broadcastQueue.push(...newItems);
    this.startQueueWorker();

    return { queuedCount: newItems.length };
  }

  public getBroadcastQueueStatus() {
    return {
      pendingInQueue: this.broadcastQueue.length,
      isProcessing: this.isProcessingQueue,
    };
  }

  public clearBroadcastQueue() {
    const count = this.broadcastQueue.length;
    this.broadcastQueue = [];
    return { clearedCount: count };
  }

  private async startQueueWorker() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.broadcastQueue.length > 0) {
      if (this.status !== "connected" && !this.connectedUser) {
        console.warn("⚠️ [WHATSAPP BROADCAST] Pausing queue: WhatsApp not connected.");
        break;
      }

      const item = this.broadcastQueue.shift();
      if (item) {
        try {
          await this.sendMessage(item.phone, item.message);
          console.log(`📤 [WHATSAPP BROADCAST] Sent to ${item.phone} (${item.customerName || "Customer"})`);
        } catch (err) {
          console.error(`Failed to send broadcast item to ${item.phone}:`, err);
        }

        // Smart Anti-Ban delay: wait 2500ms between messages
        await new Promise((res) => setTimeout(res, 2500));
      }
    }

    this.isProcessingQueue = false;
  }
}

// Global Singleton Instance
export const whatsappEngine = new WhatsAppEngine();

// Auto-initialize silently in background on server boot
whatsappEngine.initialize().catch(() => {});
