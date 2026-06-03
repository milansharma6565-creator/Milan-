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
    <div className="bg-white p-6 shadow-sm border border-slate-200" style={{ width: '80mm', margin: '0 auto', fontFamily: 'Inter' }}>
      <div className="flex flex-col items-center border-b border-dashed pb-4 mb-4">
        <Logo size={64} className="mb-2" />
        <h2 className="text-xl font-bold uppercase pb-4 text-center">
          Tanker<span className="relative">Wala<span className="absolute top-[80%] left-0 text-[8px] text-slate-500 font-medium whitespace-nowrap normal-case tracking-normal mt-0.5">Powered by Rajhans</span></span>
        </h2>
        {franchise && (
          <p className="text-[11px] font-extrabold uppercase text-slate-800 tracking-widest text-center leading-tight mt-1.5 mb-1.5">
            {franchiseName}
          </p>
        )}
        <p className="text-xs text-slate-500">Supplier & Service</p>
        <p className="text-[10px] mt-1 text-center whitespace-pre-line leading-snug">{printAddress}</p>
        <p className="text-[10px] font-bold mt-1">Ph: +91 {printPhone}</p>
      </div>

      <div className="space-y-1 text-xs mb-4">
        <div className="flex justify-between"><span>Bill No:</span> <span className="font-bold">{bill.billNumber}</span></div>
        <div className="flex justify-between"><span>Date:</span> <span>{new Date(bill.date).toLocaleDateString()}</span></div>
        {bill.driverName && (
          <div className="flex justify-between items-center">
            <span>Driver:</span> 
            <div className="text-right">
              <p className="font-bold uppercase leading-none">{bill.driverName}</p>
              {bill.driverMobile && <p className="text-[10px] text-slate-400 font-medium">({bill.driverMobile})</p>}
            </div>
          </div>
        )}
      </div>

      <div className="text-xs border-b border-dashed pb-2 mb-2">
        <div className="font-bold uppercase mb-1">Customer:</div>
        <div>{bill.customerName}</div>
        <div>{bill.customerMobile}</div>
        <div className="text-[10px] text-slate-500 italic mt-1 leading-tight">{bill.customerAddress}</div>
      </div>

      <table className="w-full text-xs mb-4">
        <thead>
          <tr className="border-b border-dashed">
            <th className="text-left py-1">Item</th>
            <th className="text-right py-1">Qty</th>
            <th className="text-right py-1">Amt</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-2">
              {bill.category === 'CAN' 
                ? '20L RO Water Can' 
                : bill.category === 'MONTHLY_CAN'
                ? '20L RO Water Can (Monthly Plan)'
                : bill.category === 'BOTTLE' 
                ? `Packaged Water (${bill.bottleSize || 'Standard'})` 
                : `Tanker ${bill.tankerSize || 'Std'}L`}
            </td>
            <td className="text-right">{bill.quantity}</td>
            <td className="text-right">{formatCurrency(bill.totalAmount)}</td>
          </tr>
          {bill.extraCharges > 0 && (
            <tr>
              <td className="py-1">Extra Charges</td>
              <td className="text-right">-</td>
              <td className="text-right">{formatCurrency(bill.extraCharges)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="border-t border-dashed pt-2 space-y-1">
        <div className="flex justify-between items-center text-sm font-bold">
          <span>GRAND TOTAL:</span>
          <span>{formatCurrency(bill.grandTotal)}</span>
        </div>
        <div className="flex justify-between items-center text-[10px]">
          <span>Payment:</span>
          <span className="font-bold uppercase">{bill.paymentMode}</span>
        </div>
        {bill.paymentMode === 'Split' && bill.splitPayments && (
          <div className="bg-slate-50 p-2 rounded mt-1 text-[9px] space-y-0.5 border border-slate-100">
            {bill.splitPayments.cash > 0 && (
              <div className="flex justify-between">
                <span>Cash Paid:</span>
                <span className="font-bold">{formatCurrency(bill.splitPayments.cash)}</span>
              </div>
            )}
            {bill.splitPayments.upi > 0 && (
              <div className="flex justify-between">
                <span>UPI Paid:</span>
                <span className="font-bold">{formatCurrency(bill.splitPayments.upi)}</span>
              </div>
            )}
            {bill.splitPayments.pending > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Pending Balance:</span>
                <span className="font-bold">{formatCurrency(bill.splitPayments.pending)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col items-center border-t border-dashed pt-4">
        <p className="text-[10px] font-bold mb-2 uppercase text-slate-700">Scan to Pay via UPI</p>
        <div className="bg-white p-2 border-2 border-slate-900 rounded-lg shadow-sm">
          <QRCodeSVG 
            value={upiLink}
            size={100}
            level="H"
            includeMargin={false}
          />
        </div>
        <p className="text-[9px] mt-2 font-medium text-slate-500">{upiId}</p>
      </div>

      <div className="mt-6 text-center text-[9px] border-t border-dashed pt-4 leading-relaxed">
        <p className="font-bold text-slate-900 border border-slate-900 p-1 mb-2">NOTE</p>
        <p className="text-slate-600 uppercase">For new booking orders, please do not call the driver's number.</p>
        <p className="text-slate-900 font-bold mt-0.5">Please contact only the office number (+91 {printPhone}).</p>
        <p className="mt-2 text-[9px] text-slate-900 font-bold italic pb-4">
          Thank you from {franchiseName} - Powered by Rajhans ☺
        </p>
      </div>
    </div>
  );
}
