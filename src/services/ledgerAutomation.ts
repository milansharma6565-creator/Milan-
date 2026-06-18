import { db } from '../firebase';
import { collection, addDoc, getDocs, serverTimestamp, doc, updateDoc, getDoc, query, where } from 'firebase/firestore';
import { VoucherItem, Account } from '../types';

export const ledgerAutomation = {
  /**
   * Ensures a customer has a ledger account. Creates one if missing.
   */
  ensureCustomerAccount: async (customerId: string, customerName: string, franchiseId: any): Promise<string | null> => {
    try {
      // 1. Query by customerId to see if linked account exists
      const qCust = query(collection(db, 'accounts'), where('customerId', '==', customerId));
      const custSnap = await getDocs(qCust);
      
      let customerAccDoc = !custSnap.empty ? custSnap.docs[0] : null;

      // 2. If not found, try querying by customer name
      if (!customerAccDoc) {
        const qName = query(collection(db, 'accounts'), where('name', '==', customerName));
        const nameSnap = await getDocs(qName);
        if (!nameSnap.empty) {
          customerAccDoc = nameSnap.docs[0];
        }
      }

      if (customerAccDoc) {
        // If it exists but doesn't have customerId, update it to link it
        if (!customerAccDoc.data().customerId) {
          await updateDoc(doc(db, 'accounts', customerAccDoc.id), { customerId });
        }
        return customerAccDoc.id;
      }

      // Find or create 'Sundry Debtors' group selectively
      const qGroup = query(collection(db, 'accountGroups'), where('name', '==', 'Sundry Debtors'));
      const groupsSnap = await getDocs(qGroup);
      let debtorsGroup = !groupsSnap.empty ? groupsSnap.docs[0] : null;
      let debtorsGroupId = debtorsGroup?.id;

      if (!debtorsGroupId) {
        // Find or create 'Current Assets' group selectively
        const qAssets = query(collection(db, 'accountGroups'), where('name', '==', 'Current Assets'));
        const assetsSnap = await getDocs(qAssets);
        let assetsGroup = !assetsSnap.empty ? assetsSnap.docs[0] : null;
        let assetsGroupId = assetsGroup?.id;
        
        if (!assetsGroupId) {
          const newAssetsGroupRef = await addDoc(collection(db, 'accountGroups'), {
            name: 'Current Assets',
            type: 'Asset',
            franchiseId: franchiseId || null,
            createdAt: serverTimestamp()
          });
          assetsGroupId = newAssetsGroupRef.id;
        }
        const newDebtorsGroupRef = await addDoc(collection(db, 'accountGroups'), {
          name: 'Sundry Debtors',
          parentGroupId: assetsGroupId,
          type: 'Asset',
          franchiseId: franchiseId || null,
          createdAt: serverTimestamp()
        });
        debtorsGroupId = newDebtorsGroupRef.id;
      }

      const newCustAccRef = await addDoc(collection(db, 'accounts'), {
        name: customerName,
        groupId: debtorsGroupId,
        group: 'Sundry Debtors',
        openingBalance: 0,
        currentBalance: 0,
        balanceType: 'Dr',
        customerId: customerId,
        franchiseId: franchiseId || null,
        createdAt: serverTimestamp()
      });

      return newCustAccRef.id;
    } catch (error) {
      console.error('Error ensuring customer ledger account:', error);
      return null;
    }
  },

  /**
   * Automatically posts a Sales Voucher when a bill is generated
   */
  postBillToLedger: async (bill: any) => {
    if (bill.ledgerPosted) return;
    try {
      // Fetch Franchise configuration to see if loyalty point program is active
      let loyaltyProgramEnabled = false;
      let calculatedLoyaltyPointsEarned = 0;
      let finalCommissionAmount = bill.commissionAmount || 0;

      if (bill.franchiseId) {
        try {
          const franchiseDoc = await getDoc(doc(db, 'franchises', bill.franchiseId));
          if (franchiseDoc.exists()) {
            const franchiseData = franchiseDoc.data();
            loyaltyProgramEnabled = !!franchiseData.loyaltyProgramEnabled;
            // If loyalty program is enabled, award points = 70% of commission amount
            if (loyaltyProgramEnabled) {
              const commPct = franchiseData.commissionPercentage || 5;
              let commissionVal = bill.commissionAmount;
              if (!commissionVal) {
                commissionVal = ((bill.totalAmount || bill.grandTotal || 0) * commPct) / 100;
              }
              calculatedLoyaltyPointsEarned = Math.round(commissionVal * 0.70);
              if (!bill.commissionAmount) {
                finalCommissionAmount = commissionVal;
              }
            }
          }
        } catch (err) {
          console.error("Error fetching franchise for loyalty program logic:", err);
        }
      }

      // Update customer loyaltyPoints balance in database
      const redeemed = bill.loyaltyPointsRedeemed || 0;
      let netLoyaltyChange = calculatedLoyaltyPointsEarned - redeemed;

      if (bill.customerId && (calculatedLoyaltyPointsEarned > 0 || redeemed > 0)) {
        try {
          const customerRef = doc(db, 'customers', bill.customerId);
          const customerDoc = await getDoc(customerRef);
          if (customerDoc.exists()) {
            const currentLoyaltyCoins = customerDoc.data().loyaltyCoins || 0;
            const newLoyaltyCoins = Math.max(0, currentLoyaltyCoins + netLoyaltyChange);
            await updateDoc(customerRef, {
              loyaltyCoins: newLoyaltyCoins,
              updatedAt: serverTimestamp()
            });
            console.log(`Updated Customer ${bill.customerName} loyalty balance to ${newLoyaltyCoins} (Earned: ${calculatedLoyaltyPointsEarned}, Redeemed: ${redeemed})`);
          }
        } catch (err) {
          console.error("Error updating customer loyalty coins balance:", err);
        }
      }

      // 1. Ensure customer ledger account exists and is linked
      const customerAccId = await ledgerAutomation.ensureCustomerAccount(bill.customerId, bill.customerName, bill.franchiseId);

      const accountsSnap = await getDocs(collection(db, 'accounts'));
      const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account));

      const customerAcc = accounts.find(a => a.id === customerAccId) || 
                          accounts.find(a => a.name.toLowerCase() === bill.customerName.toLowerCase());

      let salesAcc = accounts.find(a => a.name.toLowerCase() === 'service income') ||
                     accounts.find(a => a.name.toLowerCase() === 'water sales') || 
                     accounts.find(a => a.name.toLowerCase().includes('sales')) ||
                     accounts.find(a => a.name.toLowerCase().includes('income'));

      if (!salesAcc) {
        // Create Service Income account under Direct Incomes group
        try {
          const groupsSnap = await getDocs(collection(db, 'accountGroups'));
          let incomeGroup = groupsSnap.docs.find(d => d.data().name === 'Direct Incomes' || d.data().name === 'Direct Income');
          let incomeGroupId = incomeGroup?.id;
          if (!incomeGroupId) {
            const newIncomeGroupRef = await addDoc(collection(db, 'accountGroups'), {
              name: 'Direct Incomes',
              type: 'Income',
              franchiseId: bill.franchiseId || null,
              createdAt: serverTimestamp()
            });
            incomeGroupId = newIncomeGroupRef.id;
          }
          const newSalesAccRef = await addDoc(collection(db, 'accounts'), {
            name: 'Service Income',
            groupId: incomeGroupId,
            openingBalance: 0,
            balanceType: 'Cr',
            currentBalance: 0,
            franchiseId: bill.franchiseId || null,
            createdAt: serverTimestamp()
          });
          salesAcc = {
            id: newSalesAccRef.id,
            name: 'Service Income',
            groupId: incomeGroupId,
            openingBalance: 0,
            balanceType: 'Cr',
            currentBalance: 0,
            franchiseId: bill.franchiseId || null
          } as Account;
        } catch (e) {
          console.error("Failed to auto-create Sales account:", e);
        }
      }

      // Check or create franchise loyalty expense ledger if any points redeemed
      let loyaltyExpenseAcc = null;
      if (redeemed > 0) {
        loyaltyExpenseAcc = accounts.find(a => a.name.toLowerCase() === 'franchise loyalty expense' && a.franchiseId === bill.franchiseId);
        if (!loyaltyExpenseAcc) {
          try {
            const groupsSnap = await getDocs(collection(db, 'accountGroups'));
            let expenseGroup = groupsSnap.docs.find(d => (d.data().name === 'Indirect Expenses' || d.data().name === 'Direct Expenses') && d.data().franchiseId === bill.franchiseId);
            let expenseGroupId = expenseGroup?.id;
            if (!expenseGroupId) {
              const newGrp = await addDoc(collection(db, 'accountGroups'), {
                name: 'Direct Expenses',
                type: 'Expense',
                franchiseId: bill.franchiseId || null,
                createdAt: serverTimestamp()
              });
              expenseGroupId = newGrp.id;
            }
            const newAccRef = await addDoc(collection(db, 'accounts'), {
              name: 'Franchise Loyalty Expense',
              groupId: expenseGroupId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: 0,
              franchiseId: bill.franchiseId || null,
              createdAt: serverTimestamp()
            });
            loyaltyExpenseAcc = {
              id: newAccRef.id,
              name: 'Franchise Loyalty Expense',
              groupId: expenseGroupId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: 0,
              franchiseId: bill.franchiseId || null
            } as Account;
          } catch (e) {
            console.error("Failed to auto-create Loyalty Expense account:", e);
          }
        }
      }

      if (!customerAcc || !salesAcc) {
        console.warn('Could not auto-post to ledger: Customer or Sales account not found.');
        return;
      }

      const items: VoucherItem[] = [];
      
      // Debit remaining customer balance payable
      items.push({
        accountId: customerAcc.id!,
        accountName: customerAcc.name,
        type: 'Dr',
        amount: bill.grandTotal
      });

      // Debit redeemed amount from Franchise Loyalty Expense account
      if (redeemed > 0 && loyaltyExpenseAcc) {
        items.push({
          accountId: loyaltyExpenseAcc.id!,
          accountName: loyaltyExpenseAcc.name,
          type: 'Dr',
          amount: redeemed
        });
      }

      // Credit service income with the full original cost (grandTotal before redemption discount)
      const salesTotalAmount = bill.grandTotal + redeemed;
      items.push({
        accountId: salesAcc.id!,
        accountName: salesAcc.name,
        type: 'Cr',
        amount: salesTotalAmount
      });

      const vchSnap = await getDocs(collection(db, 'vouchers'));
      const vchNumber = `SLS-${(vchSnap.size + 1).toString().padStart(4, '0')}`;

      await addDoc(collection(db, 'vouchers'), {
        type: 'Sales',
        voucherNumber: vchNumber,
        date: bill.date,
        items,
        narration: `Auto-generated from Token #${bill.billNumber} | ${bill.tankerSize || 'Water Can'} ${redeemed > 0 ? `| Loyalty Coins Redeemed: ₹${redeemed}` : ''}`,
        totalAmount: salesTotalAmount,
        billId: bill.id,
        franchiseId: bill.franchiseId || null,
        createdAt: serverTimestamp()
      });

      // Update balances in ledger accounts
      await updateDoc(doc(db, 'accounts', customerAcc.id!), {
        currentBalance: (customerAcc.currentBalance || 0) + bill.grandTotal
      });
      await updateDoc(doc(db, 'accounts', salesAcc.id!), {
        currentBalance: (salesAcc.currentBalance || 0) + salesTotalAmount
      });
      if (redeemed > 0 && loyaltyExpenseAcc) {
        await updateDoc(doc(db, 'accounts', loyaltyExpenseAcc.id!), {
          currentBalance: (loyaltyExpenseAcc.currentBalance || 0) + redeemed
        });
      }

      // Adjust commission amount for this bill
      if (redeemed > 0) {
        finalCommissionAmount = Math.max(0, finalCommissionAmount - redeemed);
      }

      // Mark bill as posted
      await updateDoc(doc(db, 'bills', bill.id), { 
        ledgerPosted: true,
        loyaltyPointsEarned: calculatedLoyaltyPointsEarned,
        commissionAmount: finalCommissionAmount
      });

      console.log(`Auto-posted Bill #${bill.billNumber} to Ledger (Earned loyalty tokens: ${calculatedLoyaltyPointsEarned}, redeemed: ${redeemed}).`);
    } catch (error) {
      console.error('Ledger Automation Error:', error instanceof Error ? error.message : String(error));
    }
  },

  /**
   * Posts a Receipt Voucher when payment is received
   */
  postPaymentToLedger: async (bill: any, amount: number, mode: string) => {
    if (bill.paymentLedgerPosted) return;
    try {
      const customerAccId = await ledgerAutomation.ensureCustomerAccount(bill.customerId, bill.customerName, bill.franchiseId);

      const accountsSnap = await getDocs(collection(db, 'accounts'));
      const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account));

      const paymentAccName = mode === 'Cash' ? 'Cash' : 'Bank Account';
      let paymentAcc = accounts.find(a => a.name.toLowerCase() === paymentAccName.toLowerCase());
      
      // Secondary check for specific bank names if 'Bank Account' is not found
      if ((mode === 'UPI' || mode === 'Bank') && !paymentAcc) {
          paymentAcc = accounts.find(a => a.name === 'BARODA129') || 
                       accounts.find(a => a.name.toLowerCase().includes('bank'));
      }
      
      const customerAcc = accounts.find(a => a.id === customerAccId) || 
                          accounts.find(a => a.name.toLowerCase() === bill.customerName.toLowerCase());

      if (!paymentAcc) {
        // Create Cash/Bank Account if missing under Current Assets
        try {
          const groupsSnap = await getDocs(collection(db, 'accountGroups'));
          let assetsGroup = groupsSnap.docs.find(d => d.data().name === 'Current Assets');
          let assetsGroupId = assetsGroup?.id;
          if (!assetsGroupId) {
            const newGrp = await addDoc(collection(db, 'accountGroups'), {
              name: 'Current Assets',
              type: 'Asset',
              franchiseId: bill.franchiseId || null,
              createdAt: serverTimestamp()
            });
            assetsGroupId = newGrp.id;
          }
          const newAccRef = await addDoc(collection(db, 'accounts'), {
            name: paymentAccName,
            groupId: assetsGroupId,
            openingBalance: 0,
            balanceType: 'Dr',
            currentBalance: 0,
            franchiseId: bill.franchiseId || null,
            createdAt: serverTimestamp()
          });
          paymentAcc = {
            id: newAccRef.id,
            name: paymentAccName,
            groupId: assetsGroupId,
            openingBalance: 0,
            balanceType: 'Dr',
            currentBalance: 0
          } as Account;
        } catch (e) {
          console.error("Failed to auto-create Payment account:", e);
        }
      }

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
      const vchNumber = `RCP-${(vchSnap.size + 1).toString().padStart(4, '0')}`;

      await addDoc(collection(db, 'vouchers'), {
        type: 'Receipt',
        voucherNumber: vchNumber,
        date: new Date().toISOString().slice(0, 10),
        items,
        narration: `Payment received for Token #${bill.billNumber} via ${mode}`,
        totalAmount: amount,
        billId: bill.id,
        franchiseId: bill.franchiseId || null,
        createdAt: serverTimestamp()
      });

      // Update balances in ledger accounts
      await updateDoc(doc(db, 'accounts', paymentAcc.id!), {
        currentBalance: (paymentAcc.currentBalance || 0) + amount
      });
      await updateDoc(doc(db, 'accounts', customerAcc.id!), {
        currentBalance: (customerAcc.currentBalance || 0) - amount
      });

      // Mark payment as posted in the bill
      await updateDoc(doc(db, 'bills', bill.id), { paymentLedgerPosted: true });
      
    } catch (error) {
      console.error('Payment Auto-posting error:', error instanceof Error ? error.message : String(error));
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
          const incomeGroup = groupsSnap.docs.find(d => d.data().name === 'Direct Income' || d.data().name === 'Direct Incomes');
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
          console.error("Failed to auto-create Penalty account:", e instanceof Error ? e.message : String(e));
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
      console.error('Driver Payment Automation Error:', error instanceof Error ? error.message : String(error));
    }
  },

  /**
   * Sets up default groups and accounts for a newly created franchise
   */
  setupFranchiseLedgers: async (franchiseId: string, franchiseName: string) => {
    try {
      // 1. Create or Find Current Assets group
      const groupsSnap = await getDocs(collection(db, 'accountGroups'));
      let assetsGroup = groupsSnap.docs.find(d => {
        const data = d.data();
        return data.name === 'Current Assets' && data.franchiseId === franchiseId;
      });
      let assetsGroupId = assetsGroup?.id;
      if (!assetsGroupId) {
        const newAssetsGroupRef = await addDoc(collection(db, 'accountGroups'), {
          name: 'Current Assets',
          type: 'Asset',
          franchiseId: franchiseId,
          createdAt: serverTimestamp()
        });
        assetsGroupId = newAssetsGroupRef.id;
      }

      // 2. Create Cash ledger under Current Assets
      const accountsSnap = await getDocs(collection(db, 'accounts'));
      let cashAcc = accountsSnap.docs.find(d => {
        const data = d.data();
        return data.name === 'Cash' && data.franchiseId === franchiseId;
      });
      if (!cashAcc) {
        await addDoc(collection(db, 'accounts'), {
          name: 'Cash',
          groupId: assetsGroupId,
          openingBalance: 0,
          currentBalance: 0,
          balanceType: 'Dr',
          franchiseId: franchiseId,
          createdAt: serverTimestamp()
        });
      }

      // 3. Create Bank Account ledger under Current Assets
      let bankAcc = accountsSnap.docs.find(d => {
        const data = d.data();
        return data.name === 'Bank Account' && data.franchiseId === franchiseId;
      });
      if (!bankAcc) {
        await addDoc(collection(db, 'accounts'), {
          name: 'Bank Account',
          groupId: assetsGroupId,
          openingBalance: 0,
          currentBalance: 0,
          balanceType: 'Dr',
          franchiseId: franchiseId,
          createdAt: serverTimestamp()
        });
      }

      // 4. Create Direct Incomes group
      let incomeGroup = groupsSnap.docs.find(d => {
        const data = d.data();
        return data.name === 'Direct Incomes' && data.franchiseId === franchiseId;
      });
      let incomeGroupId = incomeGroup?.id;
      if (!incomeGroupId) {
        const newIncomeGroupRef = await addDoc(collection(db, 'accountGroups'), {
          name: 'Direct Incomes',
          type: 'Income',
          franchiseId: franchiseId,
          createdAt: serverTimestamp()
        });
        incomeGroupId = newIncomeGroupRef.id;
      }

      // 5. Create Service Income ledger under Direct Incomes
      let serviceAcc = accountsSnap.docs.find(d => {
        const data = d.data();
        return data.name === 'Service Income' && data.franchiseId === franchiseId;
      });
      if (!serviceAcc) {
        await addDoc(collection(db, 'accounts'), {
          name: 'Service Income',
          groupId: incomeGroupId,
          openingBalance: 0,
          currentBalance: 0,
          balanceType: 'Cr',
          franchiseId: franchiseId,
          createdAt: serverTimestamp()
        });
      }

      console.log(`Successfully initialized default ledgers (Cash, Bank Account, Service Income) for franchise: ${franchiseName}`);
    } catch (e) {
      console.error('Error setupFranchiseLedgers:', e);
    }
  }
};
