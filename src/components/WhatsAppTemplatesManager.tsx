import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Sparkles, 
  RotateCcw, 
  Save, 
  Check, 
  Send, 
  Search, 
  Sliders, 
  CheckCircle2, 
  AlertTriangle,
  Eye,
  Zap,
  Tag,
  Copy,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { whatsappService, WhatsAppTemplateItem } from '../services/whatsappService';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface WhatsAppTemplatesManagerProps {
  franchise?: any;
  onNotify?: (text: string, type?: 'success' | 'error') => void;
}

const DEFAULT_TEMPLATES_CLIENT: Record<string, WhatsAppTemplateItem> = {
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
*{franchiseName}* ki taraf se snehpurna namaskar. 💧

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
*{franchiseName}* ki taraf se snehpurna namaskar. 💧

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

export function WhatsAppTemplatesManager({ franchise, onNotify }: WhatsAppTemplatesManagerProps) {
  const [templates, setTemplates] = useState<Record<string, WhatsAppTemplateItem>>(DEFAULT_TEMPLATES_CLIENT);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'lifecycle' | 'account' | 'hydrant' | 'broadcast'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('booked');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessId, setSaveSuccessId] = useState<string | null>(null);
  
  // Test Send state per template
  const [testNumber, setTestNumber] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load from API & Firestore on mount
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const serverTemplates = await whatsappService.getTemplates();
        
        // Merge with franchise Firestore custom templates if present
        const franchiseCustom = franchise?.whatsappTemplates || {};
        
        const merged: Record<string, WhatsAppTemplateItem> = {
          ...DEFAULT_TEMPLATES_CLIENT,
          ...serverTemplates,
        };

        // If franchise has overrides in firestore
        Object.entries(franchiseCustom).forEach(([key, val]: [string, any]) => {
          if (merged[key]) {
            if (typeof val === 'string') {
              merged[key].template = val;
            } else if (val && typeof val === 'object') {
              merged[key] = {
                ...merged[key],
                ...val,
              };
            }
          }
        });

        setTemplates(merged);
      } catch (err) {
        console.warn('Could not load WhatsApp templates, using defaults:', err);
      }
    };

    loadTemplates();
  }, [franchise]);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    if (onNotify) {
      onNotify(text, type);
    } else {
      alert(text);
    }
  };

  // Handle template text change
  const handleTextChange = (id: string, text: string) => {
    setTemplates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        template: text,
      },
    }));
  };

  // Handle enabled toggle
  const handleToggleEnabled = (id: string) => {
    setTemplates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        enabled: !prev[id].enabled,
      },
    }));
  };

  // Insert variable into textarea
  const insertVariable = (variable: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = templates[selectedTemplateId]?.template || '';
    const updated = currentText.substring(0, start) + variable + currentText.substring(end);
    
    handleTextChange(selectedTemplateId, updated);

    // Restore focus and cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + variable.length, start + variable.length);
      }
    }, 50);
  };

  // Reset current template to default
  const handleResetToDefault = (id: string) => {
    const defaultText = templates[id]?.defaultTemplate || DEFAULT_TEMPLATES_CLIENT[id]?.defaultTemplate;
    if (!defaultText) return;
    if (window.confirm(`Reset "${templates[id]?.title}" to original default template?`)) {
      handleTextChange(id, defaultText);
      notify(`"${templates[id]?.title}" reset to default.`);
    }
  };

  // Save single template
  const handleSaveSingle = async (id: string) => {
    const target = templates[id];
    if (!target) return;
    setIsSaving(true);
    try {
      // 1. Update API
      await whatsappService.updateTemplate(id, {
        template: target.template,
        enabled: target.enabled,
      });

      // 2. Persist to Firestore if franchiseId available
      if (franchise?.id) {
        const updatedCustom = {
          ...(franchise.whatsappTemplates || {}),
          [id]: {
            template: target.template,
            enabled: target.enabled,
          },
        };
        await updateDoc(doc(db, 'franchises', franchise.id), {
          whatsappTemplates: updatedCustom,
        });
      }

      setSaveSuccessId(id);
      setTimeout(() => setSaveSuccessId(null), 3000);
      notify(`✓ "${target.title}" saved & updated successfully!`);
    } catch (err: any) {
      notify(err.message || 'Failed to save template', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Save all templates
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await whatsappService.saveTemplates(templates);

      if (franchise?.id) {
        const allCustom: Record<string, any> = {};
        Object.entries(templates).forEach(([k, v]) => {
          allCustom[k] = {
            template: v.template,
            enabled: v.enabled,
          };
        });
        await updateDoc(doc(db, 'franchises', franchise.id), {
          whatsappTemplates: allCustom,
        });
      }

      notify('✓ All WhatsApp templates saved & synced successfully!');
    } catch (err: any) {
      notify(err.message || 'Failed to save all templates', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Send test message
  const handleSendTestMessage = async () => {
    if (!testNumber.trim()) {
      notify('Please enter a 10-digit phone number', 'error');
      return;
    }
    const target = templates[selectedTemplateId];
    if (!target) return;

    setTestSending(true);
    try {
      // Generate rendered test message
      const sampleRendered = renderLivePreview(target.template);
      const res = await whatsappService.sendMessage(testNumber, sampleRendered);
      if (res.success) {
        notify(`🚀 Test template message delivered to +91 ${testNumber}!`);
        setShowTestModal(false);
      } else {
        notify(res.error || 'Failed to send test message', 'error');
      }
    } catch (err: any) {
      notify(err.message || 'Error sending test message', 'error');
    } finally {
      setTestSending(false);
    }
  };

  // Helper to render realistic sample preview with dummy data
  const renderLivePreview = (templateStr: string) => {
    const franchiseName = franchise?.printName || franchise?.name || 'Rajhans Water Supply';
    const franchisePhone = franchise?.printMobile || franchise?.operatorMobile || '9413339987';
    const upiId = franchise?.upiId || 'rajha94133@barodampay';

    const dummyMap: Record<string, string> = {
      customerName: 'Ramesh Sharma',
      name: 'Ramesh Sharma',
      billNo: '1048',
      tokenNo: 'TK-59',
      item: '5000L Water Tanker',
      quantity: '1',
      amount: '650',
      grandTotal: '650',
      dueAmount: '1,200',
      paymentMode: 'Online UPI',
      paymentStatus: 'Paid ✅',
      deliveryLocation: 'Ward No 14, Near Piprali Road, Sikar',
      driverName: 'Rajesh Gurjar',
      driverPhone: '9829123456',
      tractorNo: 'RJ-23-TB-5541',
      liveUrl: 'https://tankerwala.app/?o=1048',
      portalUrl: 'https://tankerwala.app/?o=1048',
      upiId,
      upiLink: `upi://pay?pa=${upiId}&pn=${encodeURIComponent(franchiseName)}&am=650&cu=INR`,
      franchiseName,
      franchisePhone,
      date: new Date().toLocaleDateString('en-IN'),
      cancelReason: 'Customer requested rescheduling',
    };

    let result = templateStr;
    Object.entries(dummyMap).forEach(([k, v]) => {
      const reg = new RegExp(`\\{${k}\\}`, 'gi');
      result = result.replace(reg, v);
    });
    return result;
  };

  // Filter templates
  const filteredTemplates = Object.values(templates).filter((t) => {
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.titleHi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.descriptionHi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const activeTemplate = templates[selectedTemplateId] || filteredTemplates[0] || DEFAULT_TEMPLATES_CLIENT['booked'];

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-6 rounded-3xl border border-emerald-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-wider mb-1">
            <Sparkles size={16} />
            <span>Real-time WhatsApp Template Engine</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">
            WhatsApp Automation Templates & Customizer
          </h2>
          <p className="text-xs text-emerald-200/80 font-medium mt-1 max-w-2xl">
            Custom message templates, dynamic variables ({`{customerName}, {billNo}, {amount}`}), live preview, and test delivery.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-black rounded-2xl shadow-lg flex items-center gap-2 transition-all cursor-pointer text-xs"
          >
            <Save size={16} />
            {isSaving ? 'Saving All...' : 'Save All Templates'}
          </button>
        </div>
      </div>

      {/* Category Pills & Search Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {[
            { id: 'all', label: 'All Templates', count: Object.keys(templates).length },
            { id: 'lifecycle', label: '📦 Order Lifecycle', count: Object.values(templates).filter(t => t.category === 'lifecycle').length },
            { id: 'account', label: '💰 Accounts & Billing', count: Object.values(templates).filter(t => t.category === 'account').length },
            { id: 'hydrant', label: '🚰 Hydrant Station', count: Object.values(templates).filter(t => t.category === 'hydrant').length },
            { id: 'broadcast', label: '✨ Festival & Promo', count: Object.values(templates).filter(t => t.category === 'broadcast').length },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === cat.id
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{cat.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                selectedCategory === cat.id ? 'bg-emerald-800 text-emerald-200' : 'bg-slate-200 text-slate-700'
              }`}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      </div>

      {/* Main 2-Column Workstation: Left Selector, Right Live Editor & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Col: Template List Cards */}
        <div className="lg:col-span-5 space-y-3 max-h-[750px] overflow-y-auto pr-1">
          {filteredTemplates.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 text-slate-400">
              <Info size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-xs font-bold">No templates found matching your search</p>
            </div>
          ) : (
            filteredTemplates.map((item) => {
              const isSelected = activeTemplate.id === item.id;
              const isModified = item.template !== item.defaultTemplate;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedTemplateId(item.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-emerald-50/90 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-slate-900 text-xs">{item.title}</h4>
                        {isModified && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-md">
                            Edited
                          </span>
                        )}
                      </div>
                    </div>

                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      item.category === 'lifecycle'
                        ? 'bg-blue-100 text-blue-800'
                        : item.category === 'account'
                        ? 'bg-purple-100 text-purple-800'
                        : item.category === 'hydrant'
                        ? 'bg-cyan-100 text-cyan-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {item.category}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 font-medium line-clamp-2 mt-2 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{item.variables.length} Dynamic Variables</span>
                    <span className={`font-bold ${item.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {item.enabled ? '● Active' : '○ Disabled'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Col: Editor & Live WhatsApp Preview */}
        <div className="lg:col-span-7 space-y-4">
          {activeTemplate && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
              {/* Header Info & Enable Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900">{activeTemplate.title}</h3>
                    <span className="text-xs text-slate-400 font-mono">({activeTemplate.id})</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{activeTemplate.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <span>Active Status:</span>
                    <input
                      type="checkbox"
                      checked={activeTemplate.enabled}
                      onChange={() => handleToggleEnabled(activeTemplate.id)}
                      className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Dynamic Variables Tool Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Tag size={13} className="text-emerald-600" />
                    Click to Insert Dynamic Variables:
                  </label>
                  <span className="text-[10px] text-slate-400">Inserts at cursor position</span>
                </div>

                <div className="flex flex-wrap gap-1.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                  {activeTemplate.variables.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="px-2.5 py-1 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 text-xs font-mono font-bold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs"
                    >
                      + {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Editor Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700">
                    Template Message Content (WhatsApp Syntax):
                  </label>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>*bold*, _italic_, ~strike~</span>
                    <span>•</span>
                    <span>{activeTemplate.template.length} characters</span>
                  </div>
                </div>

                <textarea
                  ref={textareaRef}
                  rows={9}
                  value={activeTemplate.template}
                  onChange={(e) => handleTextChange(activeTemplate.id, e.target.value)}
                  className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none leading-relaxed shadow-inner"
                />
              </div>

              {/* Action Buttons: Reset, Test Send, Save */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleResetToDefault(activeTemplate.id)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    Reset to Default
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTestModal(true)}
                    className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Send size={14} />
                    Send Test Preview
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleSaveSingle(activeTemplate.id)}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {saveSuccessId === activeTemplate.id ? (
                    <>
                      <Check size={16} /> Saved!
                    </>
                  ) : (
                    <>
                      <Save size={16} /> Save This Template
                    </>
                  )}
                </button>
              </div>

              {/* Live Customer WhatsApp Phone Bubble Preview */}
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 text-emerald-700">
                    <Eye size={14} /> Live Customer WhatsApp Preview:
                  </span>
                  <span className="text-[10px] text-slate-400">Sample Live Data Filled</span>
                </div>

                <div className="bg-[#0b141a] p-4 rounded-2xl border border-[#202c33] text-xs font-sans text-[#e9edef] space-y-2 whitespace-pre-wrap leading-relaxed shadow-lg max-h-64 overflow-y-auto">
                  {renderLivePreview(activeTemplate.template)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Test Message Sender Modal */}
      <AnimatePresence>
        {showTestModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Send className="text-emerald-600 w-5 h-5" />
                  <h3 className="font-black text-slate-900 text-sm">Send WhatsApp Test Message</h3>
                </div>
                <button
                  onClick={() => setShowTestModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Enter Recipient Mobile Number (10 digits):
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9413339987"
                    value={testNumber}
                    onChange={(e) => setTestNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                  <p className="font-bold text-slate-800">Template to Send:</p>
                  <p className="text-emerald-700 font-bold">{activeTemplate?.title}</p>
                  <p className="text-[10px] text-slate-500">
                    The message will be sent with sample customer data ({franchise?.printName || 'Rajhans Water Supply'}).
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSendTestMessage}
                  disabled={testSending || !testNumber.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send size={14} />
                  {testSending ? 'Sending...' : 'Send Test Now'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
