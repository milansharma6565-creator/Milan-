import { db } from '../firebase';
import { collection, query, where, getDocs, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { generateBillNumber } from '../constants';
import { activityLogger } from './activityLogger';

export const scheduledBillsService = {
  /**
   * Checks for all scheduled bills whose scheduledDate has arrived (or passed)
   * and converts them automatically into real active bills with the proper sequential bill number.
   */
  async checkAndActivateScheduledBills(franchiseId?: string) {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      let q = query(
        collection(db, 'bills'),
        where('isScheduled', '==', true),
        where('scheduledStatus', '==', 'Pending_Activation')
      );

      if (franchiseId) {
        q = query(
          collection(db, 'bills'),
          where('franchiseId', '==', franchiseId),
          where('isScheduled', '==', true),
          where('scheduledStatus', '==', 'Pending_Activation')
        );
      }

      const snap = await getDocs(q);
      if (snap.empty) return;

      const dueDocs = snap.docs.filter(d => {
        const data = d.data();
        if (!data.scheduledDate) return false;
        return data.scheduledDate <= todayStr;
      });

      if (dueDocs.length === 0) return;

      console.log(`📅 [Scheduled Bills Service] Found ${dueDocs.length} due scheduled bill(s) to activate.`);

      for (const billDoc of dueDocs) {
        const billData = billDoc.data();
        const docId = billDoc.id;
        const currentFid = billData.franchiseId || franchiseId || null;

        try {
          // 1. Find highest query bill number to ensure correct sequential ordering
          let highestQueryNum = 0;
          try {
            let numQ = query(collection(db, 'bills'));
            if (currentFid) {
              numQ = query(collection(db, 'bills'), where('franchiseId', '==', currentFid));
            }
            const numSnap = await getDocs(numQ);
            numSnap.docs.forEach(doc => {
              const bNum = doc.data().billNumber || '';
              // Exclude temporary SCHED numbers when finding max numeric bill
              if (!bNum.startsWith('SCHED')) {
                const parsed = parseInt(bNum.replace(/\D/g, ''), 10);
                if (!isNaN(parsed) && parsed > highestQueryNum) {
                  highestQueryNum = parsed;
                }
              }
            });
          } catch (e) {
            console.warn("Soft fail scanning highest bill number for scheduled activation:", e);
          }

          const counterRef = doc(db, 'counters', currentFid ? `bill_sequence_${currentFid}` : 'bill_sequence_global');
          let activatedBillNumber = '';

          await runTransaction(db, async (transaction) => {
            const counterSnap = await transaction.get(counterRef);
            let lastSequence = 0;
            if (counterSnap.exists()) {
              lastSequence = counterSnap.data().lastSequence || 0;
            }

            const nextSeq = Math.max(highestQueryNum, lastSequence) + 1;
            activatedBillNumber = generateBillNumber(nextSeq);

            // Update counter
            transaction.set(counterRef, { lastSequence: nextSeq }, { merge: true });

            // Update bill document to activated state
            const targetBillRef = doc(db, 'bills', docId);
            transaction.update(targetBillRef, {
              billNumber: activatedBillNumber,
              status: 'Pending',
              scheduledStatus: 'Activated',
              date: new Date().toISOString(),
              createdAt: serverTimestamp(),
            });

            // If a driver was assigned, create/update trip
            if (billData.driverId) {
              const newTripRef = doc(collection(db, 'trips'));
              transaction.set(newTripRef, {
                billId: docId,
                franchiseId: currentFid,
                billNumber: activatedBillNumber,
                driverId: billData.driverId,
                driverName: billData.driverName,
                customerName: billData.customerName,
                customerMobile: billData.customerMobile,
                siteLocation: billData.customerAddress,
                category: billData.category,
                quantity: billData.quantity,
                tankerSize: billData.tankerSize || null,
                bottleSize: billData.bottleSize || null,
                status: 'Active',
                createdAt: serverTimestamp()
              });
            }
          });

          console.log(`✅ [Scheduled Bills Service] Activated scheduled bill #${activatedBillNumber} for ${billData.customerName}`);

          // Activity log
          await activityLogger.log({
            franchiseId: currentFid || '',
            franchiseName: 'Franchise',
            userEmail: '',
            actionType: 'NEW_BILL',
            description: `[Auto Scheduled Activation] Bill #${activatedBillNumber} for "${billData.customerName}" automatically activated for today. Total: ₹${billData.grandTotal}`,
            details: { billId: docId, billNumber: activatedBillNumber, total: billData.grandTotal }
          });

        } catch (err) {
          console.error(`Failed to activate scheduled bill ${docId}:`, err);
        }
      }
    } catch (err) {
      console.error("Scheduled bills activation task error:", err);
    }
  }
};
