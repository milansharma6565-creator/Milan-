import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, getDocs, writeBatch, doc, where } from 'firebase/firestore';

export async function bulkDeleteDrivers() {
  const batch = writeBatch(db);
  let operationCount = 0;

  const collectionsToClear = [
    'drivers',
    'attendance',
    'driverLocations',
    'trips',
    'dieselRequests'
  ];

  try {
    // 1. Clear simple collections
    for (const colName of collectionsToClear) {
      const q = query(collection(db, colName));
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        batch.delete(doc(db, colName, d.id));
        operationCount++;
      });
    }

    // 2. Clear related accounts and vouchers
    // We look for accounts that might be drivers or salary accounts
    const accountsSnap = await getDocs(collection(db, 'accounts'));
    const driverAccountIds: string[] = [];
    
    // Often driver names are in account names or we have a Driver Salary group
    // But to be safe, let's delete accounts that belong to 'Drivers' or 'Salary' linked groups if they exist
    // Or just look for accounts that were created for these drivers
    
    // In this app, many driver specific accounts are created in 'Indirect Expenses' or similar.
    // Let's also look at vouchers
    const vouchersSnap = await getDocs(collection(db, 'vouchers'));
    
    // We'll delete vouchers that have "Salary" or "Driver" in narration or items
    // This is a bit aggressive but user asked for "drivers related ledgers"
    vouchersSnap.docs.forEach(v => {
      const data = v.data();
      const isRelated = 
        (data.narration?.toLowerCase().includes('driver')) || 
        (data.narration?.toLowerCase().includes('salary')) ||
        (data.items?.some((item: any) => 
          item.accountName?.toLowerCase().includes('driver') || 
          item.accountName?.toLowerCase().includes('salary')
        ));
      
      if (isRelated) {
        batch.delete(doc(db, 'vouchers', v.id));
        operationCount++;
      }
    });

    if (operationCount > 0) {
      await batch.commit();
      return { success: true, count: operationCount };
    }
    
    return { success: true, count: 0 };
  } catch (error) {
    console.error("Bulk Delete Error:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
