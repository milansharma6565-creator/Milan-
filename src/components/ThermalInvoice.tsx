import React from 'react';
import { Bill } from '../db';
import { formatCurrency } from '../constants';
import { Logo } from './Logo';

interface ThermalInvoiceProps {
  bill: Bill;
}

export function ThermalInvoice({ bill }: ThermalInvoiceProps) {
  return (
    <div className="bg-white p-6 shadow-sm border border-slate-200" style={{ width: '80mm', margin: '0 auto', fontFamily: 'Inter' }}>
      <div className="flex flex-col items-center border-b border-dashed pb-4 mb-4">
        <Logo size={64} className="mb-2" />
        <h2 className="text-xl font-bold uppercase">Rajhans Water Tanker</h2>
        <p className="text-xs text-slate-500">Supplier & Service</p>
        <p className="text-[10px] mt-1 whitespace-pre-line">Behind balaji dharm kanta, near puniya wines jaipur road sikar, Rajasthan 332001</p>
        <p className="text-[10px]">Ph: +91 94133 39987</p>
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
            <td className="py-2">Tanker {bill.tankerSize}L</td>
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

      <div className="mt-6 text-center text-[9px] border-t border-dashed pt-4 leading-relaxed">
        <p className="font-bold text-slate-900 border border-slate-900 p-1 mb-2">NOTE</p>
        <p className="text-slate-600">नये बुकिंग आदेश के लिए कृपया ड्राइवर के नंबर पर फोन न करें।</p>
        <p className="text-slate-900 font-bold mt-0.5">केवल ऑफिस के नंबर (+91 94133 39987) पर ही संपर्क करें।</p>
        <p className="mt-2 text-[8px] text-slate-400 italic">धन्यवाद - राजहंस ट्रांसपोर्ट</p>
      </div>
    </div>
  );
}
