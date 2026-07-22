import React, { useState, useEffect } from 'react';
import { Bill } from '../types';
import { formatCurrency } from '../constants';
import { Logo } from './Logo';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface ThermalInvoiceProps {
  bill: Bill;
}

export function ThermalInvoice({ bill }: ThermalInvoiceProps) {
  const [franchise, setFranchise] = useState<any>(null);

  useEffect(() => {
    if (!bill.franchiseId) return;
    const unsub = onSnapshot(doc(db, 'franchises', bill.franchiseId), (snap) => {
      if (snap.exists()) {
        setFranchise(snap.data());
      }
    });
    return () => unsub();
  }, [bill.franchiseId]);

  // UPI Payment Link Customization
  const upiId = franchise?.upiId || "rajha94133@barodampay"; // Custom or Business UPI ID
  const franchiseName = franchise?.printName || franchise?.name || "TankerWala";
  const finalAmount = bill.includedPendingDues ? (bill.combinedTotalAmount || bill.grandTotal) : bill.grandTotal;
  const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(franchiseName)}&am=${finalAmount}&cu=INR&tn=Bill%20${bill.billNumber}`;
  const printPhone = franchise?.printMobile || franchise?.operatorMobile || "94133 39987";
  const printAddress = franchise?.printAddress || "Behind balaji dharm kanta, near puniya wines jaipur road sikar, Rajasthan 332001";

  return (
    <div 
      className="thermal-receipt-container bg-white p-3 text-black" 
      style={{ width: '80mm', maxWidth: '100%', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Header Branding */}
      <div className="flex flex-col items-center border-b-2 border-dashed border-black pb-2 mb-2 text-center">
        <div className="filter grayscale contrast-200 mb-1">
          <Logo size={42} />
        </div>
        <h2 className="text-lg font-black uppercase leading-none text-black tracking-tight">
          Tanker<span className="underline decoration-2">Wala</span>
        </h2>
        <span className="text-[8px] text-black font-extrabold uppercase tracking-widest leading-none mt-1">
          Powered by Rajhans
        </span>
        
        {franchise && (
          <p className="text-[13px] font-black uppercase text-black tracking-wide leading-tight mt-1.5">
            {franchiseName}
          </p>
        )}
        <p className="text-[9px] text-black font-bold uppercase mt-0.5">Supplier & Service</p>
        <p className="text-[9px] mt-0.5 text-center whitespace-pre-line leading-tight text-black font-medium">{printAddress}</p>
        
        {/* High-Contrast Phone Number Box (Crisp on 203 DPI Thermal Paper) */}
        <div className="mt-2 mb-0.5 border-2 border-black bg-white px-2.5 py-1 rounded-sm text-center w-full">
          <p className="text-[12px] font-black text-black uppercase tracking-wider leading-none">
            📞 PH: +91 {printPhone}
          </p>
        </div>
      </div>

      {/* Bill & Date Info */}
      <div className="space-y-0.5 text-[11px] mb-2 text-black font-bold border-b border-dashed border-black pb-1.5">
        <div className="flex justify-between"><span>Bill No:</span> <span className="font-black">{bill.billNumber}</span></div>
        <div className="flex justify-between"><span>Date & Time:</span> <span className="font-bold">{new Date(bill.date).toLocaleDateString()} {new Date(bill.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        {bill.driverName && (
          <div className="flex justify-between items-center">
            <span>Driver Name:</span> 
            <span className="font-black uppercase">{bill.driverName}</span>
          </div>
        )}
      </div>

      {/* Customer Info */}
      <div className="text-[11px] text-black border-b-2 border-dashed border-black pb-2 mb-2">
        <div className="font-black uppercase mb-0.5 text-[10px]">CUSTOMER DETAILS:</div>
        <div className="font-extrabold text-[12px]">{bill.customerName}</div>
        <div className="font-bold">📱 {bill.customerMobile}</div>
        {bill.customerAddress && (
          <div className="text-[10px] font-medium leading-tight mt-0.5">{bill.customerAddress}</div>
        )}
      </div>

      {/* Items Table */}
      <table className="w-full text-[11px] text-black mb-2 leading-tight">
        <thead>
          <tr className="border-b-2 border-black border-dashed text-[10px]">
            <th className="text-left py-1 font-black uppercase">Item</th>
            <th className="text-right py-1 font-black uppercase">Qty</th>
            <th className="text-right py-1 font-black uppercase">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dashed divide-black">
          <tr>
            <td className="py-1.5 font-bold pr-1">
              {bill.category === 'CAN' 
                ? '20L RO Water Can' 
                : bill.category === 'MONTHLY_CAN'
                ? '20L RO Water Can (Monthly)'
                : bill.category === 'BOTTLE' 
                ? `Packaged Water (${bill.bottleSize || 'Standard'})` 
                : `Tanker Water ${bill.tankerSize || 'Std'}L`}
            </td>
            <td className="text-right py-1.5 font-black text-[12px] align-top">{bill.quantity}</td>
            <td className="text-right py-1.5 font-black text-[12px] align-top">{formatCurrency(bill.totalAmount)}</td>
          </tr>
          {bill.extraCharges > 0 && (
            <tr>
              <td className="py-1 font-bold">Extra Charges</td>
              <td className="text-right py-1">-</td>
              <td className="text-right py-1 font-black">{formatCurrency(bill.extraCharges)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totals Section */}
      <div className="border-t-2 border-dashed border-black pt-2 space-y-1 text-[11px] text-black">
        <div className="flex justify-between items-center text-[12px] font-black border-2 border-black p-1.5 bg-white">
          <span>{bill.includedPendingDues ? 'CURRENT BILL TOTAL:' : 'GRAND TOTAL:'}</span>
          <span className="text-[14px]">{formatCurrency(bill.grandTotal)}</span>
        </div>

        {bill.includedPendingDues && (
          <div className="my-1.5 border-2 border-dashed border-black p-2 rounded bg-white text-[10px]">
            <p className="font-black uppercase tracking-wide leading-none mb-1 text-[10px]">Previous Pending Dues Breakdown:</p>
            <p className="whitespace-pre-line leading-tight font-bold mb-1.5 text-black">
              {bill.previousPendingDuesDetails}
            </p>
            <div className="flex justify-between items-center font-black text-[12px] border-t-2 border-dashed border-black pt-1">
              <span>NET COMBINED TOTAL:</span>
              <span className="text-[13px]">{formatCurrency(bill.combinedTotalAmount || 0)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center text-[11px] font-bold border-b border-dashed border-black pb-1 pt-0.5">
          <span>Payment Status / Mode:</span>
          <span className="font-black uppercase border border-black px-1.5 py-0.5">{bill.paymentMode}</span>
        </div>

        {bill.paymentMode === 'Split' && bill.splitPayments && (
          <div className="border border-black p-1.5 rounded mt-1 text-[10px] space-y-0.5 bg-white font-bold">
            {bill.splitPayments.cash > 0 && (
              <div className="flex justify-between">
                <span>Cash Paid:</span>
                <span className="font-black">{formatCurrency(bill.splitPayments.cash)}</span>
              </div>
            )}
            {bill.splitPayments.upi > 0 && (
              <div className="flex justify-between">
                <span>UPI Paid:</span>
                <span className="font-black">{formatCurrency(bill.splitPayments.upi)}</span>
              </div>
            )}
            {bill.splitPayments.pending > 0 && (
              <div className="flex justify-between underline">
                <span>Pending Balance:</span>
                <span className="font-black">{formatCurrency(bill.splitPayments.pending)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* QR Code Section */}
      <div className="mt-3 flex flex-col items-center border-t-2 border-dashed border-black pt-2">
        <p className="text-[10px] font-black mb-1.5 uppercase tracking-wide">SCAN TO PAY VIA ANY UPI APP</p>
        <div className="bg-white p-1.5 border-2 border-black rounded-md">
          <QRCodeSVG 
            value={upiLink}
            size={88}
            level="M"
            includeMargin={false}
          />
        </div>
        <p className="text-[9px] mt-1 font-mono font-bold leading-none text-black">{upiId}</p>
      </div>

      {/* Footer Instructions & Paper Feed Space */}
      <div className="mt-3 text-center text-[9px] border-t-2 border-dashed border-black pt-2 leading-tight text-black pb-8">
        <p className="font-black border border-black py-0.5 mb-1 select-none">IMPORTANT OFFICE NOTICE</p>
        <p className="uppercase text-[8px] font-bold">For new booking orders, please do not call the driver's number.</p>
        <p className="font-black text-[10px] mt-0.5">Please contact only office helpline (+91 {printPhone}).</p>
        <p className="mt-1 text-[9px] font-black italic">
          Thank you from {franchiseName} - Powered by Rajhans ☺
        </p>
        {/* Paper Tear-Off Margin */}
        <div className="text-[8px] text-black font-mono mt-2 uppercase tracking-widest opacity-80">
          - - - - - - - - - - - - - - - - - - - - - -
        </div>
      </div>
    </div>
  );
}

