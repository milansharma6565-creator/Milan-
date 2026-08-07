import { db } from '../firebase';
import { collection, addDoc, getDocs, serverTimestamp, doc, updateDoc, getDoc, query, where, setDoc, runTransaction } from 'firebase/firestore';
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

      // 2. If not found, try querying by customer name case-insensitively
      if (!customerAccDoc) {
        const qAll = query(collection(db, 'accounts'), where('franchiseId', '==', franchiseId || null));
        const allSnap = await getDocs(qAll);
        const match = allSnap.docs.find(d => d.data().name?.trim().toLowerCase() === customerName.trim().toLowerCase());
        if (match) {
          customerAccDoc = match;
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

      const isDirectPayment = bill.paymentMode === 'Cash' || bill.paymentMode === 'UPI' || bill.paymentMode === 'Bank' || bill.paymentMode === 'Bank Transfer' || bill.paymentMethod === 'Cash' || bill.paymentMethod === 'Bank';

      const accountsSnap = await getDocs(collection(db, 'accounts'));
      const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account));

      let debitAcc: Account | undefined;
      let customerAccId: string | null = null;
      let customerAcc: Account | undefined;

      if (isDirectPayment) {
        const isCash = bill.paymentMode === 'Cash' || bill.paymentMethod === 'Cash';
        const debitAccName = isCash ? 'Cash' : 'Bank of Baroda Operating A/c';
        
        // Find existing account robustly
        debitAcc = accounts.find(a => a.name.toLowerCase() === debitAccName.toLowerCase());
        if (!debitAcc && !isCash) {
          debitAcc = accounts.find(a => a.name === 'Bank Account') ||
                     accounts.find(a => a.group === 'Bank Accounts' || a.name.toLowerCase().includes('bank'));
        }

        if (!debitAcc) {
          try {
            const groupsSnap = await getDocs(collection(db, 'accountGroups'));
            const targetGroupName = isCash ? 'Cash-in-hand' : 'Bank Accounts';
            
            // Find specific subgroup or fallback to Current Assets parent
            let targetGroup = groupsSnap.docs.find(d => d.data().name === targetGroupName);
            let targetGroupId = targetGroup?.id;
            
            if (!targetGroupId) {
              // Try finding 'Current Assets'
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
              
              // Create the specific subgroup
              const newSubGrp = await addDoc(collection(db, 'accountGroups'), {
                name: targetGroupName,
                parentGroupId: assetsGroupId,
                type: 'Asset',
                franchiseId: bill.franchiseId || null,
                createdAt: serverTimestamp()
              });
              targetGroupId = newSubGrp.id;
            }
            
            const newAccRef = await addDoc(collection(db, 'accounts'), {
              name: debitAccName,
              groupId: targetGroupId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: 0,
              franchiseId: bill.franchiseId || null,
              createdAt: serverTimestamp()
            });
            debitAcc = {
              id: newAccRef.id,
              name: debitAccName,
              groupId: targetGroupId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: 0,
              franchiseId: bill.franchiseId || null
            } as Account;
          } catch (e) {
            console.error("Failed to auto-create Direct Payment account in ledgerAutomation:", e);
          }
        }
      } else {
        // 1. Ensure customer ledger account exists and is linked
        customerAccId = await ledgerAutomation.ensureCustomerAccount(bill.customerId, bill.customerName, bill.franchiseId);
        customerAcc = accounts.find(a => a.id === customerAccId) || 
                      accounts.find(a => a.name.toLowerCase() === bill.customerName.toLowerCase());
      }

      let salesAcc = accounts.find(a => a.name.toLowerCase() === 'sales') ||
                     accounts.find(a => a.name.toLowerCase() === 'service income') ||
                     accounts.find(a => a.name.toLowerCase() === 'water sales') || 
                     accounts.find(a => a.name.toLowerCase().includes('sales')) ||
                     accounts.find(a => a.name.toLowerCase().includes('income'));

      if (!salesAcc) {
        // Create Sales account under Direct Incomes group
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
            name: 'Sales',
            groupId: incomeGroupId,
            openingBalance: 0,
            balanceType: 'Cr',
            currentBalance: 0,
            franchiseId: bill.franchiseId || null,
            createdAt: serverTimestamp()
          });
          salesAcc = {
            id: newSalesAccRef.id,
            name: 'Sales',
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

      if (isDirectPayment) {
        if (!debitAcc || !salesAcc) {
          console.warn('Could not auto-post direct bill to ledger: Debit or Sales account not found.');
          return;
        }
      } else {
        if (!customerAcc || !salesAcc) {
          console.warn('Could not auto-post credit bill to ledger: Customer or Sales account not found.');
          return;
        }
      }

      const items: VoucherItem[] = [];
      
      if (isDirectPayment) {
        items.push({
          accountId: debitAcc.id!,
          accountName: debitAcc.name,
          type: 'Dr',
          amount: bill.grandTotal
        });
      } else {
        items.push({
          accountId: customerAcc!.id!,
          accountName: customerAcc!.name,
          type: 'Dr',
          amount: bill.grandTotal
        });
      }

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

      await setDoc(doc(db, 'vouchers', `VCH-${bill.id}-SALE`), {
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
      if (isDirectPayment) {
        await updateDoc(doc(db, 'accounts', debitAcc.id!), {
          currentBalance: (debitAcc.currentBalance || 0) + bill.grandTotal
        });
      } else {
        await updateDoc(doc(db, 'accounts', customerAcc!.id!), {
          currentBalance: (customerAcc!.currentBalance || 0) + bill.grandTotal
        });
      }

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
        paymentLedgerPosted: isDirectPayment, // Mark payment ledger as posted too for direct paid sales
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

      const paymentAccName = mode === 'Cash' ? 'Cash' : 'Bank of Baroda Operating A/c';
      let paymentAcc = accounts.find(a => a.name.toLowerCase() === paymentAccName.toLowerCase());
      
      // Secondary check for other bank names
      if ((mode === 'UPI' || mode === 'Bank' || mode === 'Bank Transfer') && !paymentAcc) {
          paymentAcc = accounts.find(a => a.name === 'Bank Account') ||
                       accounts.find(a => a.group === 'Bank Accounts' || a.name.toLowerCase().includes('bank'));
      }
      
      const customerAcc = accounts.find(a => a.id === customerAccId) || 
                          accounts.find(a => a.name.toLowerCase() === bill.customerName.toLowerCase());

      if (!paymentAcc) {
        // Create Cash/Bank Account if missing under proper subgroups
        try {
          const groupsSnap = await getDocs(collection(db, 'accountGroups'));
          const targetGroupName = mode === 'Cash' ? 'Cash-in-hand' : 'Bank Accounts';
          
          let targetGroup = groupsSnap.docs.find(d => d.data().name === targetGroupName);
          let targetGroupId = targetGroup?.id;
          
          if (!targetGroupId) {
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
            
            const newSubGrp = await addDoc(collection(db, 'accountGroups'), {
              name: targetGroupName,
              parentGroupId: assetsGroupId,
              type: 'Asset',
              franchiseId: bill.franchiseId || null,
              createdAt: serverTimestamp()
            });
            targetGroupId = newSubGrp.id;
          }

          const newAccRef = await addDoc(collection(db, 'accounts'), {
            name: paymentAccName,
            groupId: targetGroupId,
            openingBalance: 0,
            balanceType: 'Dr',
            currentBalance: 0,
            franchiseId: bill.franchiseId || null,
            createdAt: serverTimestamp()
          });
          paymentAcc = {
            id: newAccRef.id,
            name: paymentAccName,
            groupId: targetGroupId,
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

      await setDoc(doc(db, 'vouchers', `VCH-${bill.id}-RECPT`), {
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
  postDriverPaymentToLedger: async (
    driver: any, 
    amount: number, 
    mode: string, 
    description: string = '', 
    franchiseId?: string | null,
    paymentDate?: string
  ) => {
    try {
      const targetFranchiseId = franchiseId || driver.franchiseId || null;
      const accountsSnap = await getDocs(collection(db, 'accounts'));
      const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account));

      // 1. Locate or Auto-create Driver Ledger Account
      let driverAcc = accounts.find(a => 
        (a.driverId === driver.id) || 
        (a.name.trim().toLowerCase() === driver.name.trim().toLowerCase() && (a.franchiseId === targetFranchiseId || !a.franchiseId))
      );

      if (!driverAcc) {
        try {
          const groupsSnap = await getDocs(collection(db, 'accountGroups'));
          let liabGroup = groupsSnap.docs.find(d => {
            const data = d.data();
            return data.name === 'Current Liabilities' && (data.franchiseId === targetFranchiseId || !data.franchiseId);
          });
          let liabGroupId = liabGroup?.id;

          if (!liabGroupId) {
            let parentLiab = groupsSnap.docs.find(d => d.data().name === 'Liabilities');
            let parentLiabId = parentLiab?.id;
            if (!parentLiabId) {
              const newParent = await addDoc(collection(db, 'accountGroups'), {
                name: 'Liabilities',
                type: 'Liability',
                franchiseId: targetFranchiseId,
                createdAt: serverTimestamp()
              });
              parentLiabId = newParent.id;
            }
            const newSubGrp = await addDoc(collection(db, 'accountGroups'), {
              name: 'Current Liabilities',
              parentGroupId: parentLiabId,
              type: 'Liability',
              franchiseId: targetFranchiseId,
              createdAt: serverTimestamp()
            });
            liabGroupId = newSubGrp.id;
          }

          const newAccRef = await addDoc(collection(db, 'accounts'), {
            name: driver.name,
            groupId: liabGroupId,
            group: 'Current Liabilities',
            openingBalance: 0,
            currentBalance: 0,
            balanceType: 'Cr',
            driverId: driver.id,
            franchiseId: targetFranchiseId,
            createdAt: serverTimestamp()
          });

          driverAcc = {
            id: newAccRef.id,
            name: driver.name,
            groupId: liabGroupId,
            group: 'Current Liabilities',
            openingBalance: 0,
            currentBalance: 0,
            balanceType: 'Cr',
            driverId: driver.id,
            franchiseId: targetFranchiseId
          } as Account;
        } catch (e) {
          console.error("Failed to auto-create Driver ledger account:", e);
        }
      }

      // 2. Locate or Auto-create Credit Account (Cash / Bank / Penalty)
      let creditAccName = '';
      if (mode === 'Cash') creditAccName = 'Cash';
      else if (mode === 'Bank') creditAccName = 'Bank of Baroda Operating A/c'; 
      else if (mode === 'Penalty') creditAccName = 'Penalty Recovery';

      let creditAcc = accounts.find(a => 
        a.name.trim().toLowerCase() === creditAccName.toLowerCase() && 
        (a.franchiseId === targetFranchiseId || !a.franchiseId)
      );

      // Fallback searches
      if (!creditAcc && mode === 'Cash') {
        creditAcc = accounts.find(a => 
          a.name.toLowerCase() === 'cash' || 
          a.group === 'Cash-in-hand'
        );
      }
      if (!creditAcc && mode === 'Bank') {
        creditAcc = accounts.find(a => 
          a.name === 'Bank Account' || 
          a.group === 'Bank Accounts' || 
          a.name.toLowerCase().includes('bank')
        );
      }
      if (!creditAcc && mode === 'Penalty') {
        creditAcc = accounts.find(a => a.name.toLowerCase().includes('penalty'));
      }

      // Proactive Fix: Create Credit account if missing
      if (!creditAcc) {
        try {
          const groupsSnap = await getDocs(collection(db, 'accountGroups'));
          if (mode === 'Penalty') {
            let incomeGroup = groupsSnap.docs.find(d => d.data().name === 'Direct Income' || d.data().name === 'Direct Incomes');
            let incomeGroupId = incomeGroup?.id;
            if (!incomeGroupId) {
              const newGrp = await addDoc(collection(db, 'accountGroups'), {
                name: 'Direct Incomes',
                type: 'Income',
                franchiseId: targetFranchiseId,
                createdAt: serverTimestamp()
              });
              incomeGroupId = newGrp.id;
            }
            const newAccRef = await addDoc(collection(db, 'accounts'), {
              name: 'Penalty Recovery',
              groupId: incomeGroupId,
              openingBalance: 0,
              balanceType: 'Cr',
              currentBalance: 0,
              franchiseId: targetFranchiseId,
              createdAt: serverTimestamp()
            });
            creditAcc = { id: newAccRef.id, name: 'Penalty Recovery', balanceType: 'Cr', currentBalance: 0 } as Account;
          } else if (mode === 'Cash') {
            let cashGrp = groupsSnap.docs.find(d => d.data().name === 'Cash-in-hand');
            let cashGrpId = cashGrp?.id;
            if (!cashGrpId) {
              const newGrp = await addDoc(collection(db, 'accountGroups'), {
                name: 'Cash-in-hand',
                type: 'Asset',
                franchiseId: targetFranchiseId,
                createdAt: serverTimestamp()
              });
              cashGrpId = newGrp.id;
            }
            const newAccRef = await addDoc(collection(db, 'accounts'), {
              name: 'Cash',
              groupId: cashGrpId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: 0,
              franchiseId: targetFranchiseId,
              createdAt: serverTimestamp()
            });
            creditAcc = { id: newAccRef.id, name: 'Cash', balanceType: 'Dr', currentBalance: 0 } as Account;
          } else if (mode === 'Bank') {
            let bankGrp = groupsSnap.docs.find(d => d.data().name === 'Bank Accounts');
            let bankGrpId = bankGrp?.id;
            if (!bankGrpId) {
              const newGrp = await addDoc(collection(db, 'accountGroups'), {
                name: 'Bank Accounts',
                type: 'Asset',
                franchiseId: targetFranchiseId,
                createdAt: serverTimestamp()
              });
              bankGrpId = newGrp.id;
            }
            const newAccRef = await addDoc(collection(db, 'accounts'), {
              name: 'Bank of Baroda Operating A/c',
              groupId: bankGrpId,
              openingBalance: 0,
              balanceType: 'Dr',
              currentBalance: 0,
              franchiseId: targetFranchiseId,
              createdAt: serverTimestamp()
            });
            creditAcc = { id: newAccRef.id, name: 'Bank of Baroda Operating A/c', balanceType: 'Dr', currentBalance: 0 } as Account;
          }
        } catch (e) {
          console.error("Failed to auto-create Credit account:", e instanceof Error ? e.message : String(e));
        }
      }

      if (!driverAcc || !creditAcc) {
        console.error(`Missing accounts for driver payment: Driver: ${!!driverAcc}, Credit: ${!!creditAcc} (${creditAccName})`);
        throw new Error(`Ledger account missing for driver or payment mode (${mode}).`);
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
      const dateToUse = paymentDate || new Date().toISOString().slice(0, 10);

      // Create Voucher in Firestore with franchiseId
      await addDoc(collection(db, 'vouchers'), {
        type: 'Payment',
        voucherNumber: vchNumber,
        date: dateToUse,
        items,
        narration: description || `Quick payment to ${driver.name} via ${mode}`,
        totalAmount: amount,
        driverId: driver.id,
        franchiseId: targetFranchiseId,
        createdAt: serverTimestamp()
      });

      // Update balances in driver account & payment/credit account
      await updateDoc(doc(db, 'accounts', driverAcc.id!), {
        currentBalance: (driverAcc.currentBalance || 0) - amount
      });

      const creditDelta = creditAcc.balanceType === 'Cr' ? amount : -amount;
      await updateDoc(doc(db, 'accounts', creditAcc.id!), {
        currentBalance: (creditAcc.currentBalance || 0) + creditDelta
      });
      
      console.log(`Auto-posted Driver Payment (${mode}, ₹${amount}) for ${driver.name} to Ledger.`);
    } catch (error) {
      console.error('Driver Payment Automation Error:', error instanceof Error ? error.message : String(error));
      throw error;
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

      // Create or Find 'Cash-in-hand' and 'Bank Accounts' subgroups under Current Assets
      let cashInHandGroup = groupsSnap.docs.find(d => {
        const data = d.data();
        return data.name === 'Cash-in-hand' && data.franchiseId === franchiseId;
      });
      let cashInHandGroupId = cashInHandGroup?.id;
      if (!cashInHandGroupId) {
        const ref = await addDoc(collection(db, 'accountGroups'), {
          name: 'Cash-in-hand',
          parentGroupId: assetsGroupId,
          type: 'Asset',
          franchiseId: franchiseId,
          createdAt: serverTimestamp()
        });
        cashInHandGroupId = ref.id;
      }

      let bankAccountsGroup = groupsSnap.docs.find(d => {
        const data = d.data();
        return data.name === 'Bank Accounts' && data.franchiseId === franchiseId;
      });
      let bankAccountsGroupId = bankAccountsGroup?.id;
      if (!bankAccountsGroupId) {
        const ref = await addDoc(collection(db, 'accountGroups'), {
          name: 'Bank Accounts',
          parentGroupId: assetsGroupId,
          type: 'Asset',
          franchiseId: franchiseId,
          createdAt: serverTimestamp()
        });
        bankAccountsGroupId = ref.id;
      }

      // 2. Create Cash ledger under Cash-in-hand
      const accountsSnap = await getDocs(collection(db, 'accounts'));
      let cashAcc = accountsSnap.docs.find(d => {
        const data = d.data();
        return data.name === 'Cash' && data.franchiseId === franchiseId;
      });
      if (!cashAcc) {
        await addDoc(collection(db, 'accounts'), {
          name: 'Cash',
          groupId: cashInHandGroupId,
          openingBalance: 0,
          currentBalance: 0,
          balanceType: 'Dr',
          franchiseId: franchiseId,
          createdAt: serverTimestamp()
        });
      }

      // 3. Create Bank of Baroda Operating A/c ledger under Bank Accounts
      let bankAcc = accountsSnap.docs.find(d => {
        const data = d.data();
        return (data.name === 'Bank of Baroda Operating A/c' || data.name === 'Bank Account') && data.franchiseId === franchiseId;
      });
      if (!bankAcc) {
        await addDoc(collection(db, 'accounts'), {
          name: 'Bank of Baroda Operating A/c',
          groupId: bankAccountsGroupId,
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

      // 5. Create Sales ledger under Direct Incomes
      let serviceAcc = accountsSnap.docs.find(d => {
        const data = d.data();
        return (data.name === 'Sales' || data.name === 'Service Income') && data.franchiseId === franchiseId;
      });
      if (!serviceAcc) {
        await addDoc(collection(db, 'accounts'), {
          name: 'Sales',
          groupId: incomeGroupId,
          openingBalance: 0,
          currentBalance: 0,
          balanceType: 'Cr',
          franchiseId: franchiseId,
          createdAt: serverTimestamp()
        });
      }

      console.log(`Successfully initialized default ledgers (Cash, Bank of Baroda Operating A/c, Sales) for franchise: ${franchiseName}`);
    } catch (e) {
      console.error('Error setupFranchiseLedgers:', e);
    }
  },

  /**
   * Posts accumulated attendance salary for a driver to Ledger upon deactivation or manual trigger
   */
  postDriverAttendanceSalaryToLedger: async (driver: any, franchiseId?: string | null) => {
    try {
      if (!driver?.id) return { posted: false, amount: 0, totalDays: 0 };
      const targetFranchiseId = franchiseId || driver.franchiseId || null;

      // 1. Fetch attendance records for this driver
      let attQuery = query(collection(db, 'attendance'), where('driverId', '==', driver.id));
      const attSnap = await getDocs(attQuery);

      if (attSnap.empty) {
        return { posted: false, amount: 0, totalDays: 0 };
      }

      let totalDays = 0;
      attSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status === 'Full Day') totalDays += 1;
        else if (data.status === 'Half Day') totalDays += 0.5;
      });

      if (totalDays <= 0) {
        return { posted: false, amount: 0, totalDays: 0 };
      }

      const monthlySalary = Number(driver.monthlySalary) || 0;
      const dailyRate = monthlySalary > 0 ? monthlySalary / 30 : 0;
      const grossSalary = Math.round(totalDays * dailyRate);

      if (grossSalary <= 0) {
        return { posted: false, amount: 0, totalDays };
      }

      // 2. Fetch existing salary vouchers posted for this driver to avoid duplicate postings
      const vchSnap = await getDocs(query(collection(db, 'vouchers')));
      let totalAlreadyPosted = 0;

      vchSnap.docs.forEach(d => {
        const v = d.data();
        const isForDriver = v.driverId === driver.id || 
          (v.voucherNumber && (v.voucherNumber.startsWith('INACT-SAL-') || v.voucherNumber.startsWith('ATT-'))) ||
          (v.narration && v.narration.toLowerCase().includes(driver.name.toLowerCase()) && v.narration.toLowerCase().includes('salary'));

        if (isForDriver && v.items && Array.isArray(v.items)) {
          const drvItem = v.items.find((item: any) => 
            (item.accountName && item.accountName.toLowerCase().trim() === driver.name.toLowerCase().trim()) && item.type === 'Cr'
          );
          if (drvItem && drvItem.amount) {
            totalAlreadyPosted += Number(drvItem.amount) || 0;
          } else if (v.totalAmount && v.type === 'Journal') {
            totalAlreadyPosted += Number(v.totalAmount) || 0;
          }
        }
      });

      const unpostedAmount = Math.max(0, grossSalary - totalAlreadyPosted);
      if (unpostedAmount <= 0) {
        return { posted: false, amount: 0, totalDays };
      }

      // 3. Find or Create Driver Ledger Account (Liability)
      const accountsSnap = await getDocs(collection(db, 'accounts'));
      const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account));

      let driverAcc = accounts.find(a => 
        (a.driverId === driver.id) || 
        (a.name.trim().toLowerCase() === driver.name.trim().toLowerCase() && (a.franchiseId === targetFranchiseId || !a.franchiseId))
      );

      let driverAccId = driverAcc?.id;

      if (!driverAccId) {
        const groupsSnap = await getDocs(collection(db, 'accountGroups'));
        let liabGrp = groupsSnap.docs.find(d => d.data().name === 'Current Liabilities');
        let liabGrpId = liabGrp?.id;

        if (!liabGrpId) {
          const newGrp = await addDoc(collection(db, 'accountGroups'), {
            name: 'Current Liabilities',
            type: 'Liability',
            franchiseId: targetFranchiseId,
            createdAt: serverTimestamp()
          });
          liabGrpId = newGrp.id;
        }

        const newAccRef = await addDoc(collection(db, 'accounts'), {
          name: driver.name,
          groupId: liabGrpId,
          group: 'Current Liabilities',
          openingBalance: 0,
          currentBalance: 0,
          balanceType: 'Cr',
          driverId: driver.id,
          franchiseId: targetFranchiseId,
          createdAt: serverTimestamp()
        });
        driverAccId = newAccRef.id;
      }

      // 4. Find or Create Salary Expense Account (Expense)
      let expAcc = accounts.find(a => 
        a.name.trim().toLowerCase() === 'salary expense' && 
        (a.franchiseId === targetFranchiseId || !a.franchiseId)
      );
      let expAccId = expAcc?.id;

      if (!expAccId) {
        const groupsSnap = await getDocs(collection(db, 'accountGroups'));
        let expGrp = groupsSnap.docs.find(d => d.data().name === 'Indirect Expenses');
        let expGrpId = expGrp?.id;

        if (!expGrpId) {
          const newGrp = await addDoc(collection(db, 'accountGroups'), {
            name: 'Indirect Expenses',
            type: 'Expense',
            franchiseId: targetFranchiseId,
            createdAt: serverTimestamp()
          });
          expGrpId = newGrp.id;
        }

        const newExpRef = await addDoc(collection(db, 'accounts'), {
          name: 'Salary Expense',
          groupId: expGrpId,
          group: 'Indirect Expenses',
          openingBalance: 0,
          currentBalance: 0,
          balanceType: 'Dr',
          franchiseId: targetFranchiseId,
          createdAt: serverTimestamp()
        });
        expAccId = newExpRef.id;
      }

      // 5. Post Journal Voucher & Update Ledger Balances
      const vchNo = `INACT-SAL-${driver.id.slice(0, 4)}-${Date.now()}`;
      const todayDateStr = new Date().toISOString().split('T')[0];

      await runTransaction(db, async (transaction) => {
        const drvRef = doc(db, 'accounts', driverAccId!);
        const expRef = doc(db, 'accounts', expAccId!);
        const vchRef = doc(collection(db, 'vouchers'));

        const [drvDoc, expDoc] = await Promise.all([
          transaction.get(drvRef),
          transaction.get(expRef)
        ]);

        transaction.set(vchRef, {
          date: todayDateStr,
          franchiseId: targetFranchiseId,
          type: 'Journal',
          voucherNumber: vchNo,
          items: [
            { accountId: expAccId!, accountName: 'Salary Expense', amount: unpostedAmount, type: 'Dr' },
            { accountId: driverAccId!, accountName: driver.name, amount: unpostedAmount, type: 'Cr' }
          ],
          narration: `Attendance Salary posted on Driver Deactivation: ${driver.name} (${totalDays} days worked, ₹${unpostedAmount})`,
          totalAmount: unpostedAmount,
          driverId: driver.id,
          createdAt: serverTimestamp()
        });

        const currentDrvBal = drvDoc.exists() ? (drvDoc.data()?.currentBalance || 0) : 0;
        const currentExpBal = expDoc.exists() ? (expDoc.data()?.currentBalance || 0) : 0;

        transaction.update(drvRef, { currentBalance: currentDrvBal + unpostedAmount });
        transaction.update(expRef, { currentBalance: currentExpBal + unpostedAmount });
      });

      return { posted: true, amount: unpostedAmount, totalDays };
    } catch (err) {
      console.error('Error posting driver attendance salary on deactivation:', err);
      return { posted: false, amount: 0, totalDays: 0 };
    }
  }
};
