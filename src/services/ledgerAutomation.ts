import { db } from '../firebase';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { VoucherItem, Account } from '../types';

export const ledgerAutomation = {
  /**
   * Automatically posts a Sales Voucher when a bill is generated
   */
  postBillToLedger: async (bill: any) => {
    try {
      // 1. Find or assume standard account names
      const accountsSnap = await getDocs(collection(db, 'accounts'));
      const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account));

      // Standard Ledger Architecture:
      // Debit: Customer Account (Increases what they owe us)
      // Credit: Water Sales Account (Increases our revenue)
      
      const customerAcc = accounts.find(a => a.name.toLowerCase() === bill.customerName.toLowerCase());
      const salesAcc = accounts.find(a => a.name.toLowerCase() === 'water sales') || 
                       accounts.find(a => a.name.toLowerCase().includes('sales'));

      if (!customerAcc || !salesAcc) {
        console.warn('Could not auto-post to ledger: Customer or Sales account not found.');
        return;
      }

      const items: VoucherItem[] = [
        {
          accountId: customerAcc.id!,
          accountName: customerAcc.name,
          type: 'Dr',
          amount: bill.grandTotal
        },
        {
          accountId: salesAcc.id!,
          accountName: salesAcc.name,
          type: 'Cr',
          amount: bill.grandTotal
        }
      ];

      const vchSnap = await getDocs(collection(db, 'vouchers'));
      const vchNumber = `VCH-${(vchSnap.size + 1).toString().padStart(4, '0')}`;

      await addDoc(collection(db, 'vouchers'), {
        type: 'Journal',
        voucherNumber: vchNumber,
        date: bill.date,
        items,
        narration: `Auto-generated from Token #${bill.billNumber} | ${bill.tankerSize}`,
        totalAmount: bill.grandTotal,
        billId: bill.id,
        createdAt: serverTimestamp()
      });

      console.log(`Auto-posted Bill #${bill.billNumber} to Ledger.`);
    } catch (error) {
      console.error('Ledger Automation Error:', error?.message || error);
    }
  },

  /**
   * Posts a Receipt Voucher when payment is received
   */
  postPaymentToLedger: async (bill: any, amount: number, mode: string) => {
    try {
      const accountsSnap = await getDocs(collection(db, 'accounts'));
      const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account));

      // Debit: Cash/Bank (Increases our money)
      // Credit: Customer Account (Decreases what they owe us)
      
      const paymentAccName = mode === 'Cash' ? 'Cash' : 
                            (mode === 'UPI' || mode === 'Bank Transfer') ? 'Bank Account' : 'Cash';
      
      const paymentAcc = accounts.find(a => a.name.toLowerCase() === paymentAccName.toLowerCase());
      const customerAcc = accounts.find(a => a.name.toLowerCase() === bill.customerName.toLowerCase());

      if (!paymentAcc || !customerAcc) return;

      const items: VoucherItem[] = [
        {
          accountId: paymentAcc.id!,
          accountName: paymentAcc.name,
          type: 'Dr',
          amount
        },
        {
          accountId: customerAcc.id!,
          accountName: customerAcc.name,
          type: 'Cr',
          amount
        }
      ];

      const vchSnap = await getDocs(collection(db, 'vouchers'));
      const vchNumber = `VCH-${(vchSnap.size + 1).toString().padStart(4, '0')}`;

      await addDoc(collection(db, 'vouchers'), {
        type: 'Receipt',
        voucherNumber: vchNumber,
        date: new Date().toISOString().slice(0, 10),
        items,
        narration: `Payment received for Token #${bill.billNumber} via ${mode}`,
        totalAmount: amount,
        billId: bill.id,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Payment Auto-posting error:', error?.message || error);
    }
  },

  /**
   * Posts a Payment/Deduction Voucher for a Driver
   */
  postDriverPaymentToLedger: async (driver: any, amount: number, mode: string, description: string = '') => {
    try {
      const accountsSnap = await getDocs(collection(db, 'accounts'));
      const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account));

      // Debit: Driver Account (Decreases what we owe them - Liabilities accounts are naturally Cr)
      // Credit: Cash/Bank/Penalty (Decreases our asset or increases our income)
      
      const driverAcc = accounts.find(a => a.driverId === driver.id) || 
                       accounts.find(a => a.name.toLowerCase() === driver.name.toLowerCase());
      
      let creditAccName = '';
      if (mode === 'Cash') creditAccName = 'Cash';
      else if (mode === 'Bank') creditAccName = 'Bank Account'; 
      else if (mode === 'Penalty') creditAccName = 'Penalty Recovery';

      let creditAcc = accounts.find(a => a.name.toLowerCase() === creditAccName.toLowerCase());

      // Fallback for Bank 934 or general Penalty
      if (mode === 'Bank' && !creditAcc) {
          creditAcc = accounts.find(a => a.name.toLowerCase().includes('bank'));
      }
      if (mode === 'Penalty' && !creditAcc) {
          creditAcc = accounts.find(a => a.name.toLowerCase().includes('penalty'));
      }

      // Proactive Fix: Create Penalty Recovery account if still missing
      if (mode === 'Penalty' && !creditAcc) {
        try {
          const groupsSnap = await getDocs(collection(db, 'accountGroups'));
          const incomeGroup = groupsSnap.docs.find(d => d.data().name === 'Direct Income');
          if (incomeGroup) {
            const newAccRef = await addDoc(collection(db, 'accounts'), {
              name: 'Penalty Recovery',
              groupId: incomeGroup.id,
              openingBalance: 0,
              balanceType: 'Cr',
              currentBalance: 0,
              createdAt: serverTimestamp()
            });
            creditAcc = { id: newAccRef.id, name: 'Penalty Recovery', balanceType: 'Cr', currentBalance: 0 } as Account;
          }
        } catch (e) {
          console.error("Failed to auto-create Penalty account:", e?.message || e);
        }
      }

      if (!driverAcc || !creditAcc) {
        console.error(`Missing accounts for driver payment: Driver: ${!!driverAcc}, Credit: ${!!creditAcc} (${creditAccName})`);
        return;
      }

      const items: VoucherItem[] = [
        {
          accountId: driverAcc.id!,
          accountName: driverAcc.name,
          type: 'Dr',
          amount
        },
        {
          accountId: creditAcc.id!,
          accountName: creditAcc.name,
          type: 'Cr',
          amount
        }
      ];

      const vchSnap = await getDocs(collection(db, 'vouchers'));
      const vchNumber = `DRV-${(vchSnap.size + 1).toString().padStart(4, '0')}`;

      await addDoc(collection(db, 'vouchers'), {
        type: 'Payment',
        voucherNumber: vchNumber,
        date: new Date().toISOString().slice(0, 10),
        items,
        narration: description || `Payment to ${driver.name} via ${mode}`,
        totalAmount: amount,
        driverId: driver.id,
        createdAt: serverTimestamp()
      });
      
      console.log(`Auto-posted Driver Payment (${mode}) to Ledger.`);
    } catch (error) {
      console.error('Driver Payment Automation Error:', error?.message || error);
    }
  }
};
