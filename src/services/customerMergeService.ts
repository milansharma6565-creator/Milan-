import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  query, 
  where, 
  serverTimestamp, 
  writeBatch 
} from 'firebase/firestore';
import { Customer, Account, Voucher, Bill } from '../types';
import { ledgerAutomation } from './ledgerAutomation';
import { activityLogger } from './activityLogger';

export interface MergeCustomerOptions {
  primaryCustomer: Customer;
  secondaryCustomer: Customer;
  selectedAddress?: string;
  selectedVehicle?: string;
  mergeNotes?: boolean;
  franchiseId?: string;
  userEmail?: string;
}

export interface MergeResult {
  success: boolean;
  billsTransferred: number;
  vouchersUpdated: number;
  ledgerEntriesTransferred: number;
  bookingRequestsTransferred: number;
  combinedPendingAmount: number;
  mergedPhoneNumbers: string[];
  error?: string;
}

/**
 * Normalizes phone numbers to standard 10-digit format where possible
 */
const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
};

export const customerMergeService = {
  /**
   * Merges a secondary (source) customer into a primary (target) customer.
   * Transfers all bills, vouchers, ledger entries, bookings, and recalculates cumulative balance.
   */
  async mergeCustomers({
    primaryCustomer,
    secondaryCustomer,
    selectedAddress,
    selectedVehicle,
    mergeNotes = true,
    franchiseId,
    userEmail
  }: MergeCustomerOptions): Promise<MergeResult> {
    if (!primaryCustomer.id || !secondaryCustomer.id) {
      throw new Error('Both customers must have valid database IDs');
    }
    if (primaryCustomer.id === secondaryCustomer.id) {
      throw new Error('Cannot merge a customer into itself');
    }

    // 1. Fetch fresh documents for both customers
    const [priSnap, secSnap] = await Promise.all([
      getDoc(doc(db, 'customers', primaryCustomer.id)),
      getDoc(doc(db, 'customers', secondaryCustomer.id))
    ]);

    if (!priSnap.exists()) throw new Error('Primary customer no longer exists');
    if (!secSnap.exists()) throw new Error('Secondary customer no longer exists');

    const priData = { ...priSnap.data(), id: priSnap.id } as Customer;
    const secData = { ...secSnap.data(), id: secSnap.id } as Customer;

    // 2. Combine Phone Numbers (deduplicated)
    const primaryPhoneNormalized = normalizePhone(priData.mobile);
    const candidatePhones = new Set<string>();

    // Add secondary mobile
    const secPhoneNorm = normalizePhone(secData.mobile);
    if (secPhoneNorm && secPhoneNorm !== primaryPhoneNormalized) {
      candidatePhones.add(secPhoneNorm);
    }

    // Add existing primary secondaries
    (priData.secondaryMobiles || []).forEach(p => {
      const norm = normalizePhone(p);
      if (norm && norm !== primaryPhoneNormalized) candidatePhones.add(norm);
    });

    // Add secondary customer's secondaries
    (secData.secondaryMobiles || []).forEach(p => {
      const norm = normalizePhone(p);
      if (norm && norm !== primaryPhoneNormalized) candidatePhones.add(norm);
    });

    // Add alternate mobiles
    if (priData.alternateMobile) {
      const norm = normalizePhone(priData.alternateMobile);
      if (norm && norm !== primaryPhoneNormalized) candidatePhones.add(norm);
    }
    if (secData.alternateMobile) {
      const norm = normalizePhone(secData.alternateMobile);
      if (norm && norm !== primaryPhoneNormalized) candidatePhones.add(norm);
    }

    const mergedSecondaryMobiles = Array.from(candidatePhones);
    const finalAlternateMobile = priData.alternateMobile || secData.alternateMobile || (mergedSecondaryMobiles[0] || '');

    // 3. Merge Notes & Metadata
    let mergedNotes = priData.notes || '';
    if (mergeNotes && secData.notes && secData.notes.trim()) {
      const secNoteSnippet = `[Merged from ${secData.name} (+91 ${secData.mobile})]: ${secData.notes.trim()}`;
      mergedNotes = mergedNotes ? `${mergedNotes}\n${secNoteSnippet}` : secNoteSnippet;
    }

    const finalAddress = selectedAddress !== undefined 
      ? selectedAddress 
      : (priData.address || secData.address || '');

    const finalVehicleNumber = selectedVehicle !== undefined
      ? selectedVehicle
      : (priData.vehicleNumber || secData.vehicleNumber || '');

    const finalPin = priData.pin || secData.pin || '';
    const finalLoyaltyCoins = (priData.loyaltyCoins || 0) + (secData.loyaltyCoins || 0);

    // 4. Transfer Bills (bills collection)
    let billsTransferred = 0;
    const billsToUpdate: string[] = [];

    // Query by secondary customerId
    const billsByCustIdSnap = await getDocs(
      query(collection(db, 'bills'), where('customerId', '==', secData.id))
    );
    billsByCustIdSnap.forEach(b => billsToUpdate.push(b.id));

    // Also query by secondary mobile in case legacy bills didn't have customerId
    if (secData.mobile) {
      const billsByMobileSnap = await getDocs(
        query(collection(db, 'bills'), where('customerMobile', '==', secData.mobile))
      );
      billsByMobileSnap.forEach(b => {
        if (!billsToUpdate.includes(b.id)) {
          billsToUpdate.push(b.id);
        }
      });
    }

    // Batch update bills in chunks of 400
    for (let i = 0; i < billsToUpdate.length; i += 400) {
      const chunk = billsToUpdate.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const billId of chunk) {
        const billRef = doc(db, 'bills', billId);
        batch.update(billRef, {
          customerId: priData.id,
          customerName: priData.name,
          customerAddress: finalAddress || priData.address || '',
          updatedAt: serverTimestamp()
        });
      }
      await batch.commit();
      billsTransferred += chunk.length;
    }

    // 5. Transfer Booking Requests (bookingRequests collection)
    let bookingRequestsTransferred = 0;
    const bookingsSnap = await getDocs(
      query(collection(db, 'bookingRequests'), where('customerId', '==', secData.id))
    );
    if (!bookingsSnap.empty) {
      const batch = writeBatch(db);
      bookingsSnap.forEach(b => {
        batch.update(doc(db, 'bookingRequests', b.id), {
          customerId: priData.id,
          customerName: priData.name,
          updatedAt: serverTimestamp()
        });
        bookingRequestsTransferred++;
      });
      await batch.commit();
    }

    // 6. Transfer Double-Entry Ledger (Accounts & Vouchers)
    // Find or create Primary Account
    let priAccount: Account | null = null;
    let secAccount: Account | null = null;

    const allAccountsSnap = await getDocs(collection(db, 'accounts'));
    const allAccounts = allAccountsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Account));

    priAccount = allAccounts.find(a => a.customerId === priData.id) || 
                 allAccounts.find(a => a.name.trim().toLowerCase() === priData.name.trim().toLowerCase()) || null;

    secAccount = allAccounts.find(a => a.customerId === secData.id) || 
                 allAccounts.find(a => a.name.trim().toLowerCase() === secData.name.trim().toLowerCase()) || null;

    if (!priAccount) {
      const createdPriAccId = await ledgerAutomation.ensureCustomerAccount(
        priData.id, 
        priData.name, 
        priData.franchiseId || franchiseId
      );
      if (createdPriAccId) {
        const createdSnap = await getDoc(doc(db, 'accounts', createdPriAccId));
        if (createdSnap.exists()) {
          priAccount = { ...createdSnap.data(), id: createdSnap.id } as Account;
        }
      }
    }

    let vouchersUpdated = 0;
    let finalPendingAmount = 0;

    if (priAccount && secAccount && priAccount.id !== secAccount.id) {
      // Find and update all vouchers containing secondary account
      const vouchersSnap = await getDocs(collection(db, 'vouchers'));
      const vouchersToUpdate: { id: string; items: any[] }[] = [];

      vouchersSnap.forEach(vDoc => {
        const vData = vDoc.data() as Voucher;
        if (vData.items && Array.isArray(vData.items)) {
          let hasSec = false;
          const updatedItems = vData.items.map(item => {
            if (item.accountId === secAccount!.id) {
              hasSec = true;
              return {
                ...item,
                accountId: priAccount!.id,
                accountName: priAccount!.name
              };
            }
            return item;
          });

          if (hasSec) {
            vouchersToUpdate.push({ id: vDoc.id, items: updatedItems });
          }
        }
      });

      // Update vouchers in chunks
      for (let i = 0; i < vouchersToUpdate.length; i += 400) {
        const chunk = vouchersToUpdate.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const v of chunk) {
          batch.update(doc(db, 'vouchers', v.id), {
            items: v.items,
            updatedAt: serverTimestamp()
          });
        }
        await batch.commit();
        vouchersUpdated += chunk.length;
      }

      // Calculate combined cumulative balance:
      // In Indian Tally/accounting, Sundry Debtors are Debit (Dr) balances.
      // Dr > 0 means the customer owes money (Pending Dues).
      // Cr > 0 means customer has advance / we owe them money.
      const priBal = priAccount.currentBalance || 0;
      const priNet = priBal * (priAccount.balanceType === 'Cr' ? -1 : 1);

      const secBal = secAccount.currentBalance || 0;
      const secNet = secBal * (secAccount.balanceType === 'Cr' ? -1 : 1);

      const combinedNet = priNet + secNet;
      const newCurrentBalance = Math.abs(combinedNet);
      const newBalanceType: 'Dr' | 'Cr' = combinedNet >= 0 ? 'Dr' : 'Cr';

      const priOp = (priAccount.openingBalance || 0) * (priAccount.balanceType === 'Cr' ? -1 : 1);
      const secOp = (secAccount.openingBalance || 0) * (secAccount.balanceType === 'Cr' ? -1 : 1);
      const combinedOp = priOp + secOp;
      const newOpeningBalance = Math.abs(combinedOp);

      // Update primary account with the combined cumulative balance
      await updateDoc(doc(db, 'accounts', priAccount.id!), {
        currentBalance: newCurrentBalance,
        balanceType: newBalanceType,
        openingBalance: newOpeningBalance,
        customerId: priData.id,
        name: priData.name,
        updatedAt: serverTimestamp()
      });

      // Delete secondary account document from chart of accounts
      try {
        await deleteDoc(doc(db, 'accounts', secAccount.id!));
      } catch (err) {
        console.warn('Could not delete secondary account doc, marking inactive:', err);
        await updateDoc(doc(db, 'accounts', secAccount.id!), {
          currentBalance: 0,
          isHidden: true,
          mergedIntoAccountId: priAccount.id,
          updatedAt: serverTimestamp()
        });
      }

      finalPendingAmount = newBalanceType === 'Dr' ? newCurrentBalance : 0;
    } else if (secAccount && !priAccount) {
      // Re-link secondary account as the primary account
      await updateDoc(doc(db, 'accounts', secAccount.id!), {
        customerId: priData.id,
        name: priData.name,
        updatedAt: serverTimestamp()
      });
      finalPendingAmount = secAccount.balanceType === 'Dr' ? secAccount.currentBalance : 0;
    } else if (priAccount && !secAccount) {
      // Secondary customer had pending dues on customer record but no account doc
      const priBal = priAccount.currentBalance || 0;
      const priNet = priBal * (priAccount.balanceType === 'Cr' ? -1 : 1);
      const combinedNet = priNet + (secData.pendingAmount || 0);
      const newCurrentBalance = Math.abs(combinedNet);
      const newBalanceType: 'Dr' | 'Cr' = combinedNet >= 0 ? 'Dr' : 'Cr';

      await updateDoc(doc(db, 'accounts', priAccount.id!), {
        currentBalance: newCurrentBalance,
        balanceType: newBalanceType,
        updatedAt: serverTimestamp()
      });
      finalPendingAmount = newBalanceType === 'Dr' ? newCurrentBalance : 0;
    } else {
      // Neither had an account doc: sum pendingAmount fields
      finalPendingAmount = Math.max(0, (priData.pendingAmount || 0) + (secData.pendingAmount || 0));
    }

    // 7. Transfer entries in 'ledger' collection (used by WhatsAppLedgerModal)
    let ledgerEntriesTransferred = 0;
    try {
      const ledgerSnap = await getDocs(
        query(collection(db, 'ledger'), where('partyId', '==', secData.id))
      );
      for (const lDoc of ledgerSnap.docs) {
        const lData = lDoc.data();
        await addDoc(collection(db, 'ledger'), {
          ...lData,
          partyId: priData.id,
          partyName: priData.name,
          updatedAt: serverTimestamp()
        });
        await deleteDoc(doc(db, 'ledger', lDoc.id));
        ledgerEntriesTransferred++;
      }
    } catch (err) {
      console.warn('Ledger collection migration warning:', err);
    }

    // 8. Update Primary Customer Record with cumulative data
    await updateDoc(doc(db, 'customers', priData.id), {
      secondaryMobiles: mergedSecondaryMobiles,
      alternateMobile: finalAlternateMobile,
      address: finalAddress,
      vehicleNumber: finalVehicleNumber,
      notes: mergedNotes,
      loyaltyCoins: finalLoyaltyCoins,
      pin: finalPin,
      pendingAmount: finalPendingAmount,
      updatedAt: serverTimestamp()
    });

    // 9. Delete Secondary Customer Record
    await deleteDoc(doc(db, 'customers', secData.id));

    // 10. Log Activity
    await activityLogger.log({
      franchiseId: priData.franchiseId || franchiseId || '',
      franchiseName: 'Customer Management',
      userEmail: userEmail || auth.currentUser?.email || 'Admin',
      actionType: 'CUSTOMER_MERGE',
      description: `Customer "${secData.name}" (+91 ${secData.mobile}) merged into "${priData.name}" (+91 ${priData.mobile}). Cumulative balance: ₹${finalPendingAmount}.`,
      details: {
        primaryCustomerId: priData.id,
        primaryCustomerName: priData.name,
        secondaryCustomerId: secData.id,
        secondaryCustomerName: secData.name,
        billsTransferred,
        vouchersUpdated,
        ledgerEntriesTransferred,
        bookingRequestsTransferred,
        cumulativePendingBalance: finalPendingAmount,
        mergedPhoneNumbers: [priData.mobile, ...mergedSecondaryMobiles]
      }
    });

    return {
      success: true,
      billsTransferred,
      vouchersUpdated,
      ledgerEntriesTransferred,
      bookingRequestsTransferred,
      combinedPendingAmount: finalPendingAmount,
      mergedPhoneNumbers: [priData.mobile, ...mergedSecondaryMobiles]
    };
  }
};
