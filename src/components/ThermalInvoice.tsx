import React, { useState, useEffect } from 'react';
import { Bill } from '../types';
import { formatCurrency } from '../constants';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface ThermalInvoiceProps {
  bill: Bill;
}

export function ThermalInvoice({ bill }: ThermalInvoiceProps) {
  const [franchise, setFranchise] = useState<any>(null);

  useEffect(() => {
    if (!bill?.franchiseId) return;
    const unsub = onSnapshot(doc(db, 'franchises', bill.franchiseId), (snap) => {
      if (snap.exists()) {
        setFranchise(snap.data());
      }
    });
    return () => unsub();
  }, [bill?.franchiseId]);

  if (!bill) return null;

  // UPI Payment Link Customization
  const upiId = franchise?.upiId || "rajha94133@barodampay";
  const franchiseName = franchise?.printName || franchise?.name || "राजहंस वाटर सप्लाई";
  const finalAmount = bill.includedPendingDues ? (bill.combinedTotalAmount || bill.grandTotal) : bill.grandTotal;
  const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(franchiseName)}&am=${finalAmount}&cu=INR&tn=Bill%20${bill.billNumber}`;
  const printPhone = franchise?.printMobile || franchise?.operatorMobile || "94133 39987";
  const printAddress = franchise?.printAddress || "Behind Balaji Dharm Kanta, Jaipur Road, Sikar, Rajasthan 332001";

  // Item description builder
  const getItemName = () => {
    if (bill.category === 'CAN') return '20L RO Water Can';
    if (bill.category === 'MONTHLY_CAN') return '20L RO Water Can (Monthly)';
    if (bill.category === 'BOTTLE') return `Packaged Bottle (${bill.bottleSize || '1L'})`;
    return `${bill.tankerSize || '5000'}L Water Tanker`;
  };

  const formattedDate = bill.date 
    ? new Date(bill.date).toLocaleDateString('hi-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const formattedTime = bill.date 
    ? new Date(bill.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : '';

  return (
    <div 
      className="thermal-receipt-container bg-white p-2.5 text-black select-none" 
      style={{ width: '76mm', maxWidth: '100%', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header Branding */}
      <div className="flex flex-col items-center border-b-2 border-black border-dashed pb-2 mb-2 text-center">
        {/* Main Title */}
        <h1 className="text-xl font-black uppercase text-black tracking-tight leading-tight">
          {franchiseName}
        </h1>
        <div className="text-[10px] font-extrabold uppercase text-black tracking-widest mt-0.5">
          TankerWala Water Supply Service
        </div>
        <p className="text-[9px] font-bold text-black mt-0.5">शुद्ध एवं शीतल जल आपूर्ति</p>
        
        <p className="text-[8px] mt-1 text-center whitespace-pre-line leading-tight text-black font-semibold max-w-[90%]">
          {printAddress}
        </p>
        
        {/* Helpline Contact Box */}
        <div className="mt-2 mb-0.5 border-2 border-black bg-white px-2 py-1 rounded-none text-center w-full">
          <p className="text-[11px] font-black text-black uppercase tracking-wider leading-none">
            📞 हेल्पलाइन / बुकिंग: +91 {printPhone}
          </p>
        </div>
      </div>

      {/* Bill Number & DateTime Metadata */}
      <div className="text-[10px] mb-2 text-black font-bold border-b-2 border-dashed border-black pb-1.5 space-y-1">
        <div className="flex justify-between items-center">
          <span>रसीद नं (Bill No):</span> 
          <span className="font-black text-[12px] bg-black text-white px-1.5 py-0.5 rounded-none">#{bill.billNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>दिनांक व समय (Date):</span> 
          <span className="font-extrabold">{formattedDate} {formattedTime}</span>
        </div>
        {bill.driverName && (
          <div className="flex justify-between items-center">
            <span>ड्राइवर (Driver):</span> 
            <span className="font-black uppercase">{bill.driverName}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span>स्टेटस (Status):</span> 
          <span className="font-black uppercase text-[9px] border border-black px-1">{bill.status || 'Delivered'}</span>
        </div>
      </div>

      {/* Customer Information */}
      <div className="text-[10px] text-black border-b-2 border-dashed border-black pb-2 mb-2 leading-tight">
        <div className="font-black uppercase text-[9px] tracking-wider mb-1 text-black">
          👤 ग्राहक विवरण (CUSTOMER DETAILS):
        </div>
        <div className="font-extrabold text-[12px]">{bill.customerName}</div>
        <div className="font-bold text-[11px] mt-0.5">📱 {bill.customerMobile}</div>
        {bill.customerAddress && (
          <div className="text-[9px] font-semibold mt-0.5 leading-snug">{bill.customerAddress}</div>
        )}
      </div>

      {/* Itemized Charges Table */}
      <div className="mb-2">
        <table className="w-full text-[10px] text-black border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-[9px] font-black uppercase">
              <th className="text-left py-1 pr-1">विवरण (Item)</th>
              <th className="text-center py-1">मात्रा</th>
              <th className="text-right py-1">दर</th>
              <th className="text-right py-1 pl-1">कुल</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-black font-bold">
            <tr>
              <td className="py-1.5 pr-1 font-bold leading-tight">
                {getItemName()}
              </td>
              <td className="text-center py-1.5 font-black text-[11px] align-top">{bill.quantity}</td>
              <td className="text-right py-1.5 font-medium text-[10px] align-top">₹{bill.rate || (bill.totalAmount / (bill.quantity || 1))}</td>
              <td className="text-right py-1.5 font-black text-[11px] align-top pl-1">{formatCurrency(bill.totalAmount)}</td>
            </tr>
            {bill.extraCharges > 0 && (
              <tr>
                <td colSpan={3} className="py-1 text-left font-semibold">अतिरिक्त चार्ज (Extra Charges)</td>
                <td className="text-right py-1 font-black pl-1">{formatCurrency(bill.extraCharges)}</td>
              </tr>
            )}
            {bill.discount > 0 && (
              <tr>
                <td colSpan={3} className="py-1 text-left font-semibold">छूट (Discount)</td>
                <td className="text-right py-1 font-black pl-1">-{formatCurrency(bill.discount)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals & Financial Breakdown */}
      <div className="border-t-2 border-black border-dashed pt-2 space-y-1.5 text-[10px] text-black">
        <div className="flex justify-between items-center text-[11px] font-bold">
          <span>वर्तमान बिल (Current Bill):</span>
          <span className="font-extrabold">{formatCurrency(bill.grandTotal)}</span>
        </div>

        {bill.includedPendingDues && (
          <div className="my-1.5 border-2 border-dashed border-black p-1.5 rounded-none bg-white text-[9px]">
            <p className="font-black uppercase tracking-wide leading-none mb-1 text-[9px]">
              पुराना बकाया खाता (Previous Dues):
            </p>
            <p className="whitespace-pre-line leading-tight font-bold mb-1 text-black">
              {bill.previousPendingDuesDetails || `पुराना बकाया: ${formatCurrency(bill.previousPendingDuesAmount || 0)}`}
            </p>
            <div className="flex justify-between items-center font-black text-[11px] border-t border-dashed border-black pt-1 mt-1">
              <span>कुल देय राशि (NET TOTAL):</span>
              <span className="text-[12px]">{formatCurrency(bill.combinedTotalAmount || 0)}</span>
            </div>
          </div>
        )}

        {/* Grand Total Box */}
        <div className="flex justify-between items-center border-2 border-black p-1.5 bg-black text-white font-black text-[13px] my-1">
          <span>{bill.includedPendingDues ? 'कुल देय राशि (NET TOTAL):' : 'कुल राशि (GRAND TOTAL):'}</span>
          <span className="text-[15px]">{formatCurrency(finalAmount)}</span>
        </div>

        {/* Payment Mode & Details */}
        <div className="flex justify-between items-center text-[10px] font-bold pt-1">
          <span>भुगतान स्थिति (Payment):</span>
          <span className="font-black uppercase border-2 border-black px-2 py-0.5 text-[10px]">
            {bill.paymentMode || 'Cash'}
          </span>
        </div>

        {bill.paymentMode === 'Split' && bill.splitPayments && (
          <div className="border border-black p-1.5 rounded-none mt-1 text-[9px] space-y-0.5 bg-white font-bold">
            {bill.splitPayments.cash > 0 && (
              <div className="flex justify-between">
                <span>नकद दिया (Cash):</span>
                <span className="font-black">{formatCurrency(bill.splitPayments.cash)}</span>
              </div>
            )}
            {bill.splitPayments.upi > 0 && (
              <div className="flex justify-between">
                <span>UPI दिया:</span>
                <span className="font-black">{formatCurrency(bill.splitPayments.upi)}</span>
              </div>
            )}
            {bill.splitPayments.pending > 0 && (
              <div className="flex justify-between font-black text-black">
                <span>शेष बकाया (Pending):</span>
                <span className="underline">{formatCurrency(bill.splitPayments.pending)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* UPI QR Code Section */}
      <div className="mt-3 flex flex-col items-center border-t-2 border-dashed border-black pt-2">
        <p className="text-[10px] font-black mb-1 uppercase tracking-wider text-center">
          📲 UPI से ऑनलाइन भुगतान के लिए स्कैन करें
        </p>
        <div className="bg-white p-2 border-2 border-black my-1">
          <QRCodeSVG 
            value={upiLink}
            size={96}
            level="M"
            includeMargin={true}
          />
        </div>
        <p className="text-[9px] font-mono font-bold leading-none text-black mt-0.5">UPI ID: {upiId}</p>
        <p className="text-[8px] font-bold text-black mt-0.5">PhonePe | GPay | Paytm | BHIM Supported</p>
      </div>

      {/* Important Notice & Office Rules */}
      <div className="mt-3 text-center text-[9px] border-t-2 border-dashed border-black pt-2 leading-tight text-black pb-6 space-y-1">
        <div className="border-2 border-black p-1 font-black uppercase text-[9px]">
          ⚠️ आवश्यक सूचना (IMPORTANT)
        </div>
        <p className="font-extrabold text-[8.5px] leading-snug">
          नया टैंकर ऑर्डर करने के लिए ड्राइवर को कॉल न करें।
        </p>
        <p className="font-black text-[9.5px]">
          कृपया केवल ऑफिस हेल्पलाइन (+91 {printPhone}) पर संपर्क करें।
        </p>
        
        <p className="mt-2 text-[9px] font-black italic">
          धन्यवाद! फिर सेवा का अवसर दें 🌸
        </p>
        <p className="text-[8px] font-bold uppercase tracking-widest text-black">
          {franchiseName} - Powered by Rajhans
        </p>

        {/* Paper Cut tear indicator */}
        <div className="text-[8px] text-black font-mono mt-3 uppercase tracking-widest">
          - - - - - - - - - - - - - - - - - - - - - - - -
        </div>
      </div>
    </div>
  );
}


