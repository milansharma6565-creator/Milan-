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
  const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(franchiseName)}&am=${bill.grandTotal}&cu=INR&tn=Bill%20${bill.billNumber}`;
  const printPhone = franchise?.printMobile || franchise?.operatorMobile || "94133 39987";
  const printAddress = franchise?.printAddress || "Behind balaji dharm kanta, near puniya wines jaipur road sikar, Rajasthan 332001";

  return (
    <div className="bg-white p-2.5 shadow-sm border border-slate-150" style={{ width: '80mm', margin: '0 auto', fontFamily: 'Inter' }}>
      <div className="flex flex-col items-center border-b border-dashed pb-2 mb-2">
        <Logo size={48} className="mb-1" />
        <h2 className="text-base font-black uppercase text-center leading-none text-slate-950">
          Tanker<span className="relative">Wala</span>
        </h2>
        <span className="text-[7px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5 pb-0.5">Powered by Rajhans</span>
        
        {franchise && (
          <p className="text-[12px] font-black uppercase text-slate-900 tracking-wide text-center leading-none mt-1.5 mb-1">
            {franchiseName}
          </p>
        )}
        <p className="text-[9px] text-slate-500 font-bold">Supplier & Service</p>
        <p className="text-[9px] mt-0.5 text-center whitespace-pre-line leading-tight text-slate-600">{printAddress}</p>
        
        {/* Extremely bold, clear phone number box under branding */}
        <div className="mt-2 mb-1 bg-slate-950 px-3 py-1 rounded-sm text-center">
          <p className="text-[12px] font-black text-white uppercase tracking-wider select-none leading-none">
            📞 PH: +91 {printPhone}
          </p>
        </div>
      </div>

      <div className="space-y-0.5 text-[11px] mb-2">
        <div className="flex justify-between"><span>Bill No:</span> <span className="font-extrabold text-slate-950">{bill.billNumber}</span></div>
        <div className="flex justify-between"><span>Date:</span> <span className="font-medium">{new Date(bill.date).toLocaleDateString()}</span></div>
        {bill.driverName && (
          <div className="flex justify-between items-center">
            <span>Driver:</span> 
            <div className="text-right">
              <p className="font-bold uppercase leading-none">{bill.driverName}</p>
              {bill.driverMobile && <p className="text-[9px] text-slate-500 font-medium">({bill.driverMobile})</p>}
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] border-b border-dashed pb-1.5 mb-1.5">
        <div className="font-bold uppercase mb-0.5 text-slate-800">Customer:</div>
        <div className="font-extrabold text-slate-950">{bill.customerName}</div>
        <div className="text-slate-600 font-medium">{bill.customerMobile}</div>
        <div className="text-[9px] text-slate-500 italic mt-0.5 leading-snug">{bill.customerAddress}</div>
      </div>

      <table className="w-full text-[11px] mb-2 leading-tight">
        <thead>
          <tr className="border-b border-dashed">
            <th className="text-left py-1 font-semibold text-slate-700">Item</th>
            <th className="text-right py-1 font-semibold text-slate-700">Qty</th>
            <th className="text-right py-1 font-semibold text-slate-700">Amt</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-dotted border-slate-200">
            <td className="py-1">
              {bill.category === 'CAN' 
                ? '20L RO Water Can' 
                : bill.category === 'MONTHLY_CAN'
                ? '20L RO Water Can (Monthly Plan)'
                : bill.category === 'BOTTLE' 
                ? `Packaged Water (${bill.bottleSize || 'Standard'})` 
                : `Tanker ${bill.tankerSize || 'Std'}L`}
            </td>
            <td className="text-right py-1 font-bold text-slate-950">{bill.quantity}</td>
            <td className="text-right py-1 font-bold text-slate-950">{formatCurrency(bill.totalAmount)}</td>
          </tr>
          {bill.extraCharges > 0 && (
            <tr>
              <td className="py-1 text-slate-650">Extra Charges</td>
              <td className="text-right">-</td>
              <td className="text-right py-1 font-black text-slate-950">{formatCurrency(bill.extraCharges)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="border-t border-dashed pt-1.5 space-y-0.5 text-[11px]">
        <div className="flex justify-between items-center text-xs font-black text-slate-950">
          <span>GRAND TOTAL:</span>
          <span>{formatCurrency(bill.grandTotal)}</span>
        </div>
        <div className="flex justify-between items-center text-[10px] text-slate-600">
          <span>Payment:</span>
          <span className="font-extrabold uppercase text-slate-950">{bill.paymentMode}</span>
        </div>
        {bill.paymentMode === 'Split' && bill.splitPayments && (
          <div className="bg-slate-50 p-1.5 rounded mt-1 text-[9px] space-y-0.5 border border-slate-105">
            {bill.splitPayments.cash > 0 && (
              <div className="flex justify-between text-slate-700">
                <span>Cash Paid:</span>
                <span className="font-bold">{formatCurrency(bill.splitPayments.cash)}</span>
              </div>
            )}
            {bill.splitPayments.upi > 0 && (
              <div className="flex justify-between text-slate-700">
                <span>UPI Paid:</span>
                <span className="font-bold">{formatCurrency(bill.splitPayments.upi)}</span>
              </div>
            )}
            {bill.splitPayments.pending > 0 && (
              <div className="flex justify-between text-red-650">
                <span>Pending Balance:</span>
                <span className="font-extrabold text-red-700">{formatCurrency(bill.splitPayments.pending)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-col items-center border-t border-dashed pt-2">
        <p className="text-[9px] font-black mb-1.5 uppercase text-slate-800">Scan to Pay via UPI</p>
        <div className="bg-white p-1 border-2 border-slate-950 rounded-md">
          <QRCodeSVG 
            value={upiLink}
            size={72}
            level="M"
            includeMargin={false}
          />
        </div>
        <p className="text-[8px] mt-1 font-mono text-slate-500 leading-none">{upiId}</p>
      </div>

      <div className="mt-3.5 text-center text-[9px] border-t border-dashed pt-2.5 leading-snug">
        <p className="font-black text-slate-950 border border-slate-950 py-0.5 mb-1.5 select-none">NOTE</p>
        <p className="text-slate-600 uppercase text-[8px]">For new booking orders, please do not call the driver's number.</p>
        <p className="text-slate-950 font-black mt-0.5">Please contact only the office number (+91 {printPhone}).</p>
        <p className="mt-1 text-[9px] text-slate-950 font-black italic pb-1">
          Thank you from {franchiseName} - Powered by Rajhans ☺
        </p>
      </div>
    </div>
  );
}
