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
      className="thermal-receipt-container bg-white p-2 text-black select-none border-2 border-black" 
      style={{ width: '76mm', maxWidth: '100%', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header Branding with Official TankerWala Logo */}
      <div className="flex flex-col items-center pb-1 text-center border-b border-black border-dashed">
        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          {/* Official TankerWala Logo Icon */}
          <svg width="22" height="22" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-black">
            <path d="M50 8C50 8 20 45 20 65C20 81.5685 33.4315 95 50 95C66.5685 95 80 81.5685 80 65C80 45 50 8 50 8Z" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" fill="none" />
            <rect x="34" y="48" width="22" height="16" rx="2" fill="currentColor" />
            <path d="M56 54H66L70 60V64H56V54Z" fill="currentColor" />
            <circle cx="41" cy="65" r="3.5" fill="white" stroke="currentColor" strokeWidth="2" />
            <circle cx="63" cy="65" r="3.5" fill="white" stroke="currentColor" strokeWidth="2" />
          </svg>
          <div className="text-left">
            <h1 className="text-lg font-black uppercase text-black tracking-tight leading-none">
              TANKERWALA
            </h1>
            <div className="text-[7.5px] font-black uppercase text-black tracking-widest">
              POWERED BY RAJHANS
            </div>
          </div>
        </div>

        {/* Company & Address */}
        <p className="text-[11px] font-black uppercase text-black leading-tight">
          {franchiseName || "RAJHANS STEEL AND WATER"}
        </p>
        <p className="text-[7.5px] text-center leading-tight text-black font-semibold max-w-[98%] mt-0.5">
          {printAddress}
        </p>
        <p className="text-[9.5px] font-black text-black mt-0.5">
          📞 PH: +91 {printPhone}
        </p>
      </div>

      {/* Bill & Customer Details in Compact Grid */}
      <div className="text-[9.5px] text-black font-bold py-1 border-b border-black border-dashed space-y-0.5">
        <div className="flex justify-between items-center">
          <span>Bill No: <strong className="font-black text-[11px]">#{bill.billNumber}</strong></span>
          <span>Date: <strong>{formattedDate} {formattedTime}</strong></span>
        </div>
        {bill.driverName && (
          <div className="flex justify-between items-center text-[9px]">
            <span>Driver: <strong className="uppercase">{bill.driverName}</strong></span>
            <span>Status: <strong className="uppercase">{bill.status || 'Delivered'}</strong></span>
          </div>
        )}
        <div className="border-t border-dotted border-gray-400 pt-0.5 mt-0.5 flex justify-between items-start">
          <div>
            <span className="text-[8px] uppercase tracking-wider text-gray-700 block">Customer:</span>
            <strong className="text-[10.5px] font-black block leading-tight">{bill.customerName}</strong>
          </div>
          <div className="text-right">
            <span className="text-[9.5px] font-extrabold block">📱 {bill.customerMobile}</span>
            {bill.customerAddress && <span className="text-[8px] font-semibold text-gray-800 block">{bill.customerAddress}</span>}
          </div>
        </div>
      </div>

      {/* Item Table - Ultra Compact */}
      <div className="py-1 border-b border-black border-dashed">
        <table className="w-full text-[9.5px] text-black border-collapse">
          <thead>
            <tr className="text-[8.5px] font-black uppercase text-black border-b border-black">
              <th className="text-left py-0.5">ITEM</th>
              <th className="text-center py-0.5">QTY</th>
              <th className="text-right py-0.5">AMOUNT</th>
            </tr>
          </thead>
          <tbody className="font-bold">
            <tr>
              <td className="py-0.5 font-black text-[10px] leading-tight">{getItemName()}</td>
              <td className="text-center py-0.5 font-black text-[10.5px]">{bill.quantity}</td>
              <td className="text-right py-0.5 font-black text-[10.5px]">₹{bill.totalAmount}</td>
            </tr>
            {bill.extraCharges > 0 && (
              <tr className="text-[8.5px]">
                <td colSpan={2} className="py-0.2 text-left font-semibold">Extra Charges</td>
                <td className="text-right py-0.2 font-black">₹{bill.extraCharges}</td>
              </tr>
            )}
            {bill.discount > 0 && (
              <tr className="text-[8.5px]">
                <td colSpan={2} className="py-0.2 text-left font-semibold">Discount</td>
                <td className="text-right py-0.2 font-black">-₹{bill.discount}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Grand Total & Payment Mode Combined */}
      <div className="py-1 border-b border-black border-dashed">
        <div className="flex justify-between items-center bg-black text-white px-1.5 py-1 font-black my-0.5">
          <span className="text-[10px] uppercase">GRAND TOTAL:</span>
          <span className="text-[14px]">₹{finalAmount}</span>
        </div>
        <div className="flex justify-between items-center text-[9px] font-bold mt-0.5">
          <span>Payment Status / Mode:</span>
          <span className="font-black uppercase border border-black px-1.5 py-0.2 text-[9px]">
            {bill.paymentMode || 'PENDING'}
          </span>
        </div>
      </div>

      {/* UPI QR Code Section - Compact */}
      <div className="py-1 flex items-center justify-between border-b border-black border-dashed px-1">
        <div className="text-left">
          <p className="text-[8.5px] font-black uppercase text-black leading-tight">
            SCAN TO PAY VIA UPI
          </p>
          <p className="text-[8px] font-mono font-bold text-black mt-0.5">{upiId}</p>
          <p className="text-[7.5px] text-gray-700 mt-0.5 font-semibold">GPay / PhonePe / Paytm</p>
        </div>
        <div className="bg-white p-1 border border-black rounded">
          <QRCodeSVG 
            value={upiLink}
            size={70}
            level="M"
            includeMargin={false}
          />
        </div>
      </div>

      {/* Important Office Notice - Minimal */}
      <div className="pt-1 text-center text-[8px] leading-tight text-black space-y-0.5">
        <p className="font-extrabold text-[8px] uppercase tracking-tight text-black">
          ⚠️ FOR NEW BOOKINGS DO NOT CALL DRIVER. CALL HELPLINE: <strong>+91 {printPhone}</strong>
        </p>
        <p className="text-[8px] font-black italic text-black">
          Thank you! - TankerWala ({franchiseName || "Rajhans"})
        </p>
      </div>
    </div>
  );
}



