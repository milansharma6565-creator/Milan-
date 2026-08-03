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
  const franchiseName = franchise?.printName || franchise?.name || "Rajhans Water Supply";
  const finalAmount = bill.includedPendingDues ? (bill.combinedTotalAmount || bill.grandTotal) : bill.grandTotal;
  const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent("TankerWala")}&am=${finalAmount}&cu=INR&tn=Bill%20${bill.billNumber}`;
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
    ? new Date(bill.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const formattedTime = bill.date 
    ? new Date(bill.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : '';

  return (
    <div 
      className="thermal-receipt-container bg-white p-2.5 text-black select-none" 
      style={{ width: '76mm', maxWidth: '100%', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header Branding with TankerWala Logo & Leaf Symbol */}
      <div className="flex flex-col items-center pb-2 mb-2 text-center">
        {/* Minimalist Leaf/Drop SVG Icon */}
        <div className="mb-1">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-black mx-auto">
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.4 19 2c1 2 2 4.1 2 7 0 6-4.5 11-10 11z"></path>
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>
          </svg>
        </div>

        {/* TANKERWALA Title */}
        <h1 className="text-2xl font-black uppercase text-black tracking-tight leading-none font-sans">
          TANKERWALA
        </h1>
        <div className="text-[9px] font-black uppercase text-black tracking-[0.2em] mt-0.5">
          POWERED BY RAJHANS
        </div>
        
        {/* Branch / Company Name */}
        <p className="text-[13px] font-black uppercase text-black mt-2 leading-tight">
          {franchiseName || "RAJHANS STEEL AND WATER"}
        </p>
        <p className="text-[9px] font-bold uppercase tracking-wider text-black mt-0.5">
          SUPPLIER & SERVICE
        </p>
        
        <p className="text-[8.5px] mt-1 text-center whitespace-pre-line leading-tight text-black font-semibold max-w-[95%]">
          {printAddress}
        </p>
        
        {/* Helpline Phone Pill Box */}
        <div className="mt-2.5 mb-1 border-2 border-black bg-white px-3 py-1 rounded-xl text-center w-full">
          <p className="text-[12px] font-black text-black uppercase tracking-wide leading-none">
            📞 PH: +91 {printPhone}
          </p>
        </div>
      </div>

      {/* Dashed Divider */}
      <div className="border-b-2 border-black border-dashed my-2"></div>

      {/* Bill Meta Data */}
      <div className="text-[10.5px] text-black font-bold space-y-1 my-2">
        <div className="flex justify-between items-center">
          <span className="font-extrabold">Bill No:</span> 
          <span className="font-black text-[13px]">{bill.billNumber}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-extrabold">Date & Time:</span> 
          <span className="font-black">{formattedDate} {formattedTime}</span>
        </div>
        {bill.driverName && (
          <div className="flex justify-between items-center">
            <span className="font-extrabold">Driver Name:</span> 
            <span className="font-black uppercase">{bill.driverName}</span>
          </div>
        )}
      </div>

      {/* Dashed Divider */}
      <div className="border-b-2 border-black border-dashed my-2"></div>

      {/* Customer Information */}
      <div className="text-[10.5px] text-black space-y-0.5 my-2 leading-tight">
        <div className="font-black uppercase text-[10px] tracking-wider mb-1 text-black">
          CUSTOMER DETAILS:
        </div>
        <div className="font-extrabold text-[12.5px] text-black">{bill.customerName}</div>
        <div className="font-extrabold text-[11px] flex items-center gap-1">
          <span>📱</span> {bill.customerMobile}
        </div>
        {bill.customerAddress && (
          <div className="text-[10px] font-bold mt-0.5 text-black">{bill.customerAddress}</div>
        )}
      </div>

      {/* Dashed Divider */}
      <div className="border-b-2 border-black border-dashed my-2"></div>

      {/* Item Table */}
      <div className="my-2">
        <table className="w-full text-[10.5px] text-black border-collapse">
          <thead>
            <tr className="text-[10px] font-black uppercase text-black">
              <th className="text-left py-1 pr-1">ITEM</th>
              <th className="text-center py-1">QTY</th>
              <th className="text-right py-1 pl-1">AMOUNT</th>
            </tr>
          </thead>
          <tbody className="font-bold border-t border-black border-dashed">
            <tr>
              <td className="py-2 pr-1 font-extrabold text-[11px] leading-tight text-black">
                {getItemName()}
              </td>
              <td className="text-center py-2 font-black text-[12px] align-middle">{bill.quantity}</td>
              <td className="text-right py-2 font-black text-[12px] align-middle pl-1">₹{bill.totalAmount}</td>
            </tr>
            {bill.extraCharges > 0 && (
              <tr>
                <td colSpan={2} className="py-1 text-left font-semibold">Extra Charges</td>
                <td className="text-right py-1 font-black pl-1">₹{bill.extraCharges}</td>
              </tr>
            )}
            {bill.discount > 0 && (
              <tr>
                <td colSpan={2} className="py-1 text-left font-semibold">Discount</td>
                <td className="text-right py-1 font-black pl-1">-₹{bill.discount}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dashed Divider */}
      <div className="border-b-2 border-black border-dashed my-2"></div>

      {/* Grand Total Box */}
      <div className="flex justify-between items-center border-2 border-black p-2 bg-white text-black font-black my-2">
        <span className="text-[12px] uppercase">GRAND TOTAL:</span>
        <span className="text-[17px]">₹{finalAmount}</span>
      </div>

      {/* Payment Status / Mode Row */}
      <div className="flex justify-between items-center text-[10.5px] font-bold my-2">
        <span className="font-extrabold">Payment Status / Mode:</span>
        <span className="font-black uppercase border-2 border-black px-2.5 py-1 text-[10.5px]">
          {bill.paymentMode || 'PENDING'}
        </span>
      </div>

      {/* Dashed Divider */}
      <div className="border-b-2 border-black border-dashed my-2"></div>

      {/* UPI QR Code Section */}
      <div className="my-3 flex flex-col items-center">
        <p className="text-[10px] font-black mb-1.5 uppercase tracking-wider text-center text-black">
          SCAN TO PAY VIA ANY UPI APP
        </p>
        <div className="bg-white p-2 border-2 border-black rounded-xl my-1">
          <QRCodeSVG 
            value={upiLink}
            size={110}
            level="M"
            includeMargin={true}
          />
        </div>
        <p className="text-[9.5px] font-mono font-bold text-black mt-1">{upiId}</p>
      </div>

      {/* Dashed Divider */}
      <div className="border-b-2 border-black border-dashed my-2"></div>

      {/* Important Office Notice Box */}
      <div className="my-3 text-center text-[9.5px] leading-snug text-black space-y-1.5">
        <div className="border-2 border-black py-1 px-2 font-black uppercase text-[10px] tracking-wide inline-block w-full">
          IMPORTANT OFFICE NOTICE
        </div>
        <p className="font-extrabold text-[9px] uppercase tracking-tight text-black mt-1">
          FOR NEW BOOKING ORDERS, PLEASE DO NOT CALL THE DRIVER'S NUMBER.
        </p>
        <p className="font-black text-[10px] text-black">
          Please contact only office helpline (+91 {printPhone}).
        </p>
        
        <p className="mt-2 text-[9.5px] font-black italic text-black">
          Thank you from {franchiseName || "Rajhans Steel and Water"} - Powered by Rajhans ☺️
        </p>

        {/* Paper Cut tear indicator */}
        <div className="text-[8px] text-black font-mono mt-3 tracking-widest text-center opacity-60">
          . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
        </div>
      </div>
    </div>
  );
}



