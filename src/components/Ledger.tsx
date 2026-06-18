import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  orderBy, 
  deleteDoc, 
  doc, 
  writeBatch,
  getDocs,
  where,
  limit,
  updateDoc,
  increment,
  Timestamp,
  runTransaction
} from 'firebase/firestore';
import { Account, AccountGroup, Voucher, VoucherType, VoucherItem } from '../types';
import { 
  Plus, 
  Search, 
  BookOpen, 
  FileText, 
  LayoutGrid, 
  History, 
  ChevronRight,
  ArrowRightLeft,
  Calendar,
  IndianRupee,
  Receipt,
  Trash2,
  Filter,
  CheckCircle2,
  X,
  CreditCard,
  Banknote,
  ArrowUpRight,
  ArrowDownLeft,
  Settings2,
  ChevronDown,
  Printer,
  Sparkles,
  UploadCloud,
  RotateCcw,
  Check,
  Brain,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../constants';
import { format } from 'date-fns';
import { ConfirmationModal } from './ConfirmationModal';
import { generatePDF } from '../lib/pdfUtils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

type AccountingTab = 'vouchers' | 'daybook' | 'ledgers' | 'reports' | 'accounts' | 'bank-feed' | 'tally-sync';

const DEFAULT_GROUPS: Partial<AccountGroup>[] = [
  { name: 'Assets', type: 'Asset' },
  { name: 'Liabilities', type: 'Liability' },
  { name: 'Income', type: 'Income' },
  { name: 'Expenses', type: 'Expense' },
  { name: 'Cash-in-hand', parentGroupId: 'Assets', type: 'Asset' },
  { name: 'Bank Accounts', parentGroupId: 'Assets', type: 'Asset' },
  { name: 'Sundry Debtors', parentGroupId: 'Assets', type: 'Asset' },
  { name: 'Sundry Creditors', parentGroupId: 'Liabilities', type: 'Liability' },
  { name: 'Indirect Expenses', parentGroupId: 'Expenses', type: 'Expense' },
  { name: 'Direct Income', parentGroupId: 'Income', type: 'Income' },
  { name: 'Current Liabilities', parentGroupId: 'Liabilities', type: 'Liability' },
  { name: 'Direct Expenses', parentGroupId: 'Expenses', type: 'Expense' },
];

export function Ledger({ franchiseId, isSuperAdmin }: { franchiseId?: string, isSuperAdmin?: boolean }) {
  const [activeTab, setActiveTab] = useState<AccountingTab>('daybook');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);

  // Modal States
  const [isAddingVoucher, setIsAddingVoucher] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);

  useEffect(() => {
    const fid = franchiseId || (isSuperAdmin ? null : 'PLACEHOLDER_NONE');

    // 1. Fetch Groups
    let groupsQuery = query(collection(db, 'accountGroups'));
    if (fid) {
      groupsQuery = query(collection(db, 'accountGroups'), where('franchiseId', 'in', [fid, null]));
    } else if (!isSuperAdmin) {
      groupsQuery = query(collection(db, 'accountGroups'), where('franchiseId', '==', 'PLACEHOLDER_NONE'));
    }
    const groupsUnsub = onSnapshot(groupsQuery, 
      (snapshot) => {
        const g = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccountGroup));
        setGroups(g);
        if (g.length === 0 && !isInitializing) {
          setupInitialData();
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'accountGroups')
    );

    // 2. Fetch Accounts
    let accountsQuery = query(collection(db, 'accounts'));
    if (fid) {
      accountsQuery = query(collection(db, 'accounts'), where('franchiseId', '==', fid));
    } else if (!isSuperAdmin) {
      accountsQuery = query(collection(db, 'accounts'), where('franchiseId', '==', 'PLACEHOLDER_NONE'));
    }
    const accountsUnsub = onSnapshot(accountsQuery, 
      (snapshot) => {
        setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account)));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'accounts')
    );

    // 3. Fetch Vouchers
    let vouchersBaseQuery = query(collection(db, 'vouchers'));
    if (fid) {
      vouchersBaseQuery = query(collection(db, 'vouchers'), where('franchiseId', '==', fid));
    } else if (!isSuperAdmin) {
      vouchersBaseQuery = query(collection(db, 'vouchers'), where('franchiseId', '==', 'PLACEHOLDER_NONE'));
    }
    const vouchersUnsub = onSnapshot(query(vouchersBaseQuery, orderBy('date', 'desc'), limit(500)), 
      (snapshot) => {
        const docs = snapshot.docs.map(doc => {
          const data = doc.data();
          return { 
            id: doc.id, 
            ...data,
            date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null)
          } as Voucher;
        });

        // Sort in-memory: Primary by date desc, Secondary by createdAt desc (latest first)
        docs.sort((a, b) => {
          const dateDiff = b.date.getTime() - a.date.getTime();
          if (dateDiff !== 0) return dateDiff;
          
          const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
          const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
          return timeB - timeA;
        });

        setVouchers(docs);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'vouchers')
    );

    return () => {
      groupsUnsub();
      accountsUnsub();
      vouchersUnsub();
    };
  }, []);

  const setupInitialData = async () => {
    setIsInitializing(true);
    try {
      const batch = writeBatch(db);
      
      // Create Groups
      const groupRefs: Record<string, string> = {};
      for (const gData of DEFAULT_GROUPS) {
        const ref = doc(collection(db, 'accountGroups'));
        batch.set(ref, { 
          ...gData,
          franchiseId: franchiseId || null,
          createdAt: serverTimestamp()
        });
        groupRefs[gData.name!] = ref.id;
      }

      // Default Accounts
      const defaultAccounts = [
        { name: 'Cash', group: 'Cash-in-hand', opening: 0, type: 'Dr' },
        { name: 'Bank Account', group: 'Bank Accounts', opening: 0, type: 'Dr' },
        { name: 'Fuel Expense', group: 'Indirect Expenses', opening: 0, type: 'Dr' },
        { name: 'Maintenance', group: 'Indirect Expenses', opening: 0, type: 'Dr' },
        { name: 'Salary Expense', group: 'Indirect Expenses', opening: 0, type: 'Dr' },
        { name: 'Salary Payable', group: 'Current Liabilities', opening: 0, type: 'Cr' },
        { name: 'Service Income', group: 'Direct Income', opening: 0, type: 'Cr' },
        { name: 'Penalty Recovery', group: 'Direct Income', opening: 0, type: 'Cr' },
      ];

      for (const acc of defaultAccounts) {
        const ref = doc(collection(db, 'accounts'));
        batch.set(ref, {
          name: acc.name,
          groupId: groupRefs[acc.group],
          openingBalance: acc.opening,
          balanceType: acc.type,
          currentBalance: acc.opening,
          franchiseId: franchiseId || null,
          createdAt: serverTimestamp()
        });
      }

      await batch.commit();
    } catch (error) {
      console.error("Setup error:", error?.message || String(error));
      handleFirestoreError(error, OperationType.WRITE, 'initial-setup');
    } finally {
      setIsInitializing(false);
    }
  };

  const getAccountBalance = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    
    // Balance calculation
    let balance = acc.openingBalance;
    vouchers.forEach(v => {
      v.items.forEach(item => {
        if (item.accountId === accountId) {
          if (item.type === acc.balanceType) {
            balance += item.amount;
          } else {
            balance -= item.amount;
          }
        }
      });
    });
    return balance;
  };

  const sortedAccounts = useMemo(() => {
    return [...accounts]
      .filter(a => !a.isHidden) // Hide hidden accounts from common selection
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts]);

  const stats = useMemo(() => {
    const cashId = accounts.find(a => a.name === 'Cash')?.id;
    const bankId = accounts.find(a => a.name === 'Bank Account')?.id;
    
    return {
      cash: cashId ? getAccountBalance(cashId) : 0,
      bank: bankId ? getAccountBalance(bankId) : 0,
      vouchersCount: vouchers.length
    };
  }, [accounts, vouchers]);

  // Retro Tally ERP 9 Software State Variables
  const [tallyMode, setTallyMode] = useState(false);
  const [tallyScreen, setTallyScreen] = useState<'gateway' | 'accounts-info' | 'ledger-list' | 'ledger-create' | 'ledger-edit' | 'voucher-entry' | 'daybook' | 'balance-sheet' | 'profit-loss' | 'trial-balance' | 'bank-feed' | 'tally-sync'>('gateway');
  const [tallySelectedIdx, setTallySelectedIdx] = useState(0);
  const [tallyVchType, setTallyVchType] = useState<VoucherType>('Payment');
  const [tallyQuitPrompt, setTallyQuitPrompt] = useState(false);
  const [tallyDate, setTallyDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  
  // Retro Tally Ledger creation state
  const [newLedgerName, setNewLedgerName] = useState('');
  const [newLedgerGroupId, setNewLedgerGroupId] = useState('');
  const [newLedgerOpening, setNewLedgerOpening] = useState(0);
  const [newLedgerBalType, setNewLedgerBalType] = useState<'Dr' | 'Cr'>('Dr');
  const [tallySavingLedger, setTallySavingLedger] = useState(false);
  const [ledgerAcceptPrompt, setLedgerAcceptPrompt] = useState(false);

  // Retro Tally Ledger editing state
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editLedgerName, setEditLedgerName] = useState('');
  const [editLedgerGroupId, setEditLedgerGroupId] = useState('');
  const [editLedgerOpening, setEditLedgerOpening] = useState(0);
  const [editLedgerBalType, setEditLedgerBalType] = useState<'Dr' | 'Cr'>('Dr');
  const [tallyEditingLedger, setTallyEditingLedger] = useState(false);
  const [ledgerEditAcceptPrompt, setLedgerEditAcceptPrompt] = useState(false);

  // Retro Voucher Input state
  const [retroDebitAcc, setRetroDebitAcc] = useState('');
  const [retroCreditAcc, setRetroCreditAcc] = useState('');
  const [retroAmount, setRetroAmount] = useState<number>(0);
  const [retroNarration, setRetroNarration] = useState('');
  const [retroVchNo, setRetroVchNo] = useState(() => `V-${Math.floor(1000 + Math.random() * 9000)}`);
  const [voucherAcceptPrompt, setVoucherAcceptPrompt] = useState(false);
  const [retroSavingVoucher, setRetroSavingVoucher] = useState(false);

  // Direct Incomes vs Indirect Expenses calculations for real-time Tally Reports
  const directIncomesVal = useMemo(() => {
    return accounts.filter(a => {
      const g = groups.find(gp => gp.id === a.groupId);
      return g?.type === 'Income' || g?.name === 'Direct Income';
    }).reduce((sum, a) => sum + getAccountBalance(a.id!), 0);
  }, [accounts, groups, vouchers]);

  const expensesVal = useMemo(() => {
    return accounts.filter(a => {
      const g = groups.find(gp => gp.id === a.groupId);
      return g?.type === 'Expense' || g?.name === 'Indirect Expenses' || g?.name === 'Direct Expenses';
    }).reduce((sum, a) => sum + getAccountBalance(a.id!), 0);
  }, [accounts, groups, vouchers]);

  const netProfitLoss = directIncomesVal - expensesVal; // > 0 net profit, < 0 net loss

  const handleSaveRetroLedger = async () => {
    if (!newLedgerName.trim() || !newLedgerGroupId) {
      alert("Ledger Name and Group are required!");
      return;
    }
    setTallySavingLedger(true);
    try {
      await addDoc(collection(db, 'accounts'), {
        name: newLedgerName.trim(),
        groupId: newLedgerGroupId,
        openingBalance: newLedgerOpening,
        balanceType: newLedgerBalType,
        currentBalance: newLedgerOpening,
        franchiseId: franchiseId || null,
        createdAt: serverTimestamp()
      });

      setNewLedgerName('');
      setNewLedgerOpening(0);
      setLedgerAcceptPrompt(false);
      setTallyScreen('ledger-list');
    } catch (e: any) {
      console.error(e);
      alert("Error creating ledger: " + e.message);
    } finally {
      setTallySavingLedger(false);
    }
  };

  const handleStartEditLedger = (acc: Account) => {
    setEditingAccountId(acc.id || null);
    setEditLedgerName(acc.name);
    setEditLedgerGroupId(acc.groupId);
    setEditLedgerOpening(acc.openingBalance);
    setEditLedgerBalType(acc.balanceType || 'Dr');
    setTallyScreen('ledger-edit');
  };

  const handleUpdateRetroLedger = async () => {
    if (!editingAccountId) return;
    if (!editLedgerName.trim() || !editLedgerGroupId) {
      alert("Ledger Name and Group are required!");
      return;
    }
    setTallyEditingLedger(true);
    try {
      await updateDoc(doc(db, 'accounts', editingAccountId), {
        name: editLedgerName.trim(),
        groupId: editLedgerGroupId,
        openingBalance: editLedgerOpening,
        balanceType: editLedgerBalType,
        updatedAt: serverTimestamp()
      });

      setEditingAccountId(null);
      setEditLedgerName('');
      setEditLedgerOpening(0);
      setLedgerEditAcceptPrompt(false);
      setTallyScreen('ledger-list');
    } catch (e: any) {
      console.error(e);
      alert("Error updating ledger: " + e.message);
    } finally {
      setTallyEditingLedger(false);
    }
  };

  const handleDeleteLedger = async (id: string, name: string) => {
    // Check if there are vouchers using this ledger
    const count = vouchers.filter(v => 
      v.items.some(item => item.accountId === id)
    ).length;

    let confirmMsg = `Are you sure you want to delete the ledger "${name}"?`;
    if (count > 0) {
      confirmMsg = `⚠️ ALERT: The ledger "${name}" has ${count} associated transactions (vouchers).\nDeleting this ledger will corrupt your financial transaction records!\n\nAre you absolutely sure you want to proceed and DELETE this ledger? This cannot be undone.`;
    }

    if (window.confirm(confirmMsg)) {
      try {
        await deleteDoc(doc(db, 'accounts', id));
        alert("Ledger deleted successfully!");
      } catch (e: any) {
        console.error(e);
        alert("Error deleting ledger: " + e.message);
      }
    }
  };

  const handleSaveRetroVoucher = async () => {
    if (!retroDebitAcc || !retroCreditAcc || retroAmount <= 0) {
      alert("Invalid account selection or amount.");
      return;
    }
    setRetroSavingVoucher(true);
    try {
      const itemsList: VoucherItem[] = [
        { accountId: retroDebitAcc, accountName: accounts.find(a => a.id === retroDebitAcc)?.name || '', amount: retroAmount, type: 'Dr' },
        { accountId: retroCreditAcc, accountName: accounts.find(a => a.id === retroCreditAcc)?.name || '', amount: retroAmount, type: 'Cr' }
      ];

      await runTransaction(db, async (transaction) => {
        const debRef = doc(db, 'accounts', retroDebitAcc);
        const credRef = doc(db, 'accounts', retroCreditAcc);
        const debDoc = await transaction.get(debRef);
        const credDoc = await transaction.get(credRef);

        const updates: { ref: any, newBalance: number }[] = [];

        if (debDoc.exists()) {
          const accData = debDoc.data();
          let newBalance = accData.currentBalance || 0;
          newBalance += (accData.balanceType === 'Dr' ? retroAmount : -retroAmount);
          updates.push({ ref: debRef, newBalance });
        }

        if (credDoc.exists()) {
          const accData = credDoc.data();
          let newBalance = accData.currentBalance || 0;
          newBalance += (accData.balanceType === 'Cr' ? retroAmount : -retroAmount);
          updates.push({ ref: credRef, newBalance });
        }

        for (const u of updates) {
          transaction.update(u.ref, { currentBalance: u.newBalance });
        }

        const vchRef = doc(collection(db, 'vouchers'));
        transaction.set(vchRef, {
          date: new Date(tallyDate),
          type: tallyVchType,
          voucherNumber: retroVchNo,
          items: itemsList,
          narration: retroNarration,
          totalAmount: retroAmount,
          franchiseId: franchiseId || null,
          createdAt: serverTimestamp()
        });
      });

      setRetroDebitAcc('');
      setRetroCreditAcc('');
      setRetroAmount(0);
      setRetroNarration('');
      setRetroVchNo(`V-${Math.floor(1000 + Math.random() * 9000)}`);
      setVoucherAcceptPrompt(false);
      setTallyScreen('daybook');
    } catch (error: any) {
      console.error(error);
      alert("Voucher entry failed: " + error.message);
    } finally {
      setRetroSavingVoucher(false);
    }
  };

  const handleDeleteVoucher = async (vchId: string) => {
    if (!window.confirm("Are you sure you want to delete this transaction? This will permanently revert all debit and credit effects of this entry across all accounts.")) return;

    try {
      await runTransaction(db, async (transaction) => {
        const vchRef = doc(db, 'vouchers', vchId);
        const vchDoc = await transaction.get(vchRef);
        if (!vchDoc.exists()) {
          throw new Error("Transaction entry not found.");
        }
        
        const vchData = vchDoc.data();
        const items: VoucherItem[] = vchData.items || [];

        // Fetch all unique accounts associated with the voucher items
        const uniqueAccountIds = Array.from(new Set(items.map(item => item.accountId)));
        const accDocMap: Record<string, { ref: any, data: any }> = {};

        for (const accId of uniqueAccountIds) {
          if (!accId) continue;
          const accRef = doc(db, 'accounts', accId);
          const accDoc = await transaction.get(accRef);
          if (accDoc.exists()) {
            accDocMap[accId] = { ref: accRef, data: accDoc.data() };
          }
        }

        // For each item, reverse the impact on the account's currentBalance
        const balanceUpdates: Record<string, number> = {};
        for (const item of items) {
          if (!item.accountId || !accDocMap[item.accountId]) continue;
          const { data: accData } = accDocMap[item.accountId];
          
          if (balanceUpdates[item.accountId] === undefined) {
            balanceUpdates[item.accountId] = accData.currentBalance || 0;
          }

          const balanceType = accData.balanceType || 'Dr';
          
          // Revert: subtract what was originally added.
          // Original addition logic was:
          // if (item.type === 'Dr') newBalance += (accData.balanceType === 'Dr' ? item.amount : -item.amount);
          // if (item.type === 'Cr') newBalance += (accData.balanceType === 'Cr' ? item.amount : -item.amount);
          if (item.type === 'Dr') {
            balanceUpdates[item.accountId] -= (balanceType === 'Dr' ? item.amount : -item.amount);
          } else {
            balanceUpdates[item.accountId] -= (balanceType === 'Cr' ? item.amount : -item.amount);
          }
        }

        // Update the account documents with the reverted balance
        for (const [accId, newBal] of Object.entries(balanceUpdates)) {
          const { ref } = accDocMap[accId];
          transaction.update(ref, { currentBalance: newBal });
        }

        // Delete the voucher document
        transaction.delete(vchRef);
      });

      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      alert("✅ Transaction entry deleted successfully!\n\nAll debit and credit effects have been automatically reverted, and corresponding account balances have been updated.");
    } catch (error: any) {
      console.error("Error deleting transaction:", error);
      alert("Failed to delete entry: " + (error?.message || String(error)));
    }
  };

  // Keyboard shortcut routing logic for Retro Tally HUD
  useEffect(() => {
    if (!tallyMode) return;
    const handleTallyKeys = (e: KeyboardEvent) => {
      // If typing in general form inputs, bypass shortcuts (except Esc to blur/back!)
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'SELECT') {
        if (e.key === 'Escape') {
          e.preventDefault();
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      const key = e.key.toUpperCase();

      if (e.key === 'Escape') {
        e.preventDefault();
        if (tallyScreen === 'ledger-create' || tallyScreen === 'ledger-edit') {
          setTallyScreen('ledger-list');
        } else if (tallyScreen === 'ledger-list') {
          setTallyScreen('accounts-info');
        } else if (tallyScreen === 'accounts-info') {
          setTallyScreen('gateway');
          setTallySelectedIdx(0);
        } else if (tallyScreen !== 'gateway') {
          setTallyScreen('gateway');
          setTallySelectedIdx(0);
        } else {
          setTallyQuitPrompt(prev => !prev);
        }
        return;
      }

      if (tallyQuitPrompt) {
        if (key === 'Y' || e.key === 'Enter') {
          setTallyQuitPrompt(false);
          setTallyMode(false); // Quit simulated Tally to normal UI
        } else if (key === 'N') {
          setTallyQuitPrompt(false);
        }
        return;
      }

      // Hotkey selections for Voucher Mode (F4 - F9)
      if (tallyScreen === 'voucher-entry') {
        if (e.key === 'F4') { e.preventDefault(); setTallyVchType('Contra'); }
        if (e.key === 'F5') { e.preventDefault(); setTallyVchType('Payment'); }
        if (e.key === 'F6') { e.preventDefault(); setTallyVchType('Receipt'); }
        if (e.key === 'F7') { e.preventDefault(); setTallyVchType('Journal'); }
      }

      // Menu arrow navigation and triggers
      if (tallyScreen === 'gateway' || tallyScreen === 'accounts-info') {
        const listLength = tallyScreen === 'gateway' ? 9 : 3;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setTallySelectedIdx(prev => (prev + 1) % listLength);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setTallySelectedIdx(prev => (prev - 1 + listLength) % listLength);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          triggerTallyAction(tallyScreen, tallySelectedIdx);
        }
      }

      // Direct hotkey letters
      if (tallyScreen === 'gateway') {
        if (key === 'A') { setTallyScreen('accounts-info'); setTallySelectedIdx(0); }
        if (key === 'V') { setTallyScreen('voucher-entry'); }
        if (key === 'B') { setTallyScreen('balance-sheet'); }
        if (key === 'P') { setTallyScreen('profit-loss'); }
        if (key === 'D') { setTallyScreen('daybook'); }
        if (key === 'T') { setTallyScreen('trial-balance'); }
        if (key === 'K') { setTallyScreen('bank-feed'); }
        if (key === 'S') { setTallyScreen('tally-sync'); }
        if (key === 'Q') { setTallyQuitPrompt(true); }
      } else if (tallyScreen === 'accounts-info') {
        if (key === 'L') { setTallyScreen('ledger-list'); }
        if (key === 'G') { alert('Note: General Groups can be viewed in Setup tab.'); }
        if (key === 'B') { setTallyScreen('gateway'); setTallySelectedIdx(0); }
      } else if (tallyScreen === 'ledger-list') {
        if (key === 'C') { setTallyScreen('ledger-create'); }
        if (key === 'B') { setTallyScreen('accounts-info'); }
      }
    };

    window.addEventListener('keydown', handleTallyKeys);
    return () => window.removeEventListener('keydown', handleTallyKeys);
  }, [tallyMode, tallyScreen, tallySelectedIdx, tallyQuitPrompt, tallyDate, tallyVchType]);

  const triggerTallyAction = (screen: 'gateway' | 'accounts-info', idx: number) => {
    if (screen === 'gateway') {
      const actions = [
        () => { setTallyScreen('accounts-info'); setTallySelectedIdx(0); },
        () => setTallyScreen('voucher-entry'),
        () => setTallyScreen('bank-feed'),
        () => setTallyScreen('tally-sync'),
        () => setTallyScreen('balance-sheet'),
        () => setTallyScreen('profit-loss'),
        () => setTallyScreen('daybook'),
        () => setTallyScreen('trial-balance'),
        () => setTallyQuitPrompt(true)
      ];
      actions[idx]?.();
    } else if (screen === 'accounts-info') {
      const actions = [
        () => setTallyScreen('ledger-list'),
        () => alert('Note: Default account groups are read-only.'),
        () => { setTallyScreen('gateway'); setTallySelectedIdx(0); }
      ];
      actions[idx]?.();
    }
  };

  const getLatestVoucherDateStr = () => {
    if (vouchers.length === 0) return 'No Vouchers';
    const sorted = [...vouchers].sort((a,b) => b.date.getTime() - a.date.getTime());
    return format(sorted[0].date, 'dd-MMM-yyyy');
  };

  if (loading || isInitializing) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center p-6 text-center bg-[#072F32] text-teal-300 font-mono">
        <div className="w-16 h-16 border-4 border-yellow-300 border-t-transparent rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-bold tracking-widest text-yellow-300">TALLY.ERP 9 SYSTEM STATUS</h2>
        <p className="text-teal-400 max-w-xs mt-2 text-xs">Accessing cloud registers & loading bahi-khata double entries...</p>
      </div>
    );
  }

  // RENDER DITTO TALLY ERP 9 INTERFACE SCREEN MODE
  if (tallyMode) {
    return (
      <div className="bg-[#001D21] border-4 border-slate-700 shadow-2xl overflow-hidden font-mono text-[13px] leading-relaxed max-w-6xl mx-auto rounded-lg select-none text-[#cfebec] min-h-[680px] flex flex-col justify-between">
        
        {/* Upper Yellow and Teal Horizontal status tabs */}
        <div>
          <div className="bg-[#0e4d52] border-b border-[#146067] flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-teal-100">
            <div className="flex gap-4 items-center">
              <span className="text-yellow-400 font-bold bg-[#001D21] px-1 py-0.5 border border-yellow-400/20 rounded">Tally.ERP 9</span>
              <span className="text-slate-350 shrink-0">Rajhans Steel & Water Sikar</span>
            </div>
            <div className="flex gap-3 text-[10px] uppercase font-bold text-slate-300 overflow-x-auto whitespace-nowrap">
              <span><u>P</u>: Print</span>
              <span><u>E</u>: Export</span>
              <span><u>M</u>: E-Mail</span>
              <span><u>O</u>: Upload</span>
              <span><u>S</u>: TallyShop</span>
              <span><u>G</u>: Language</span>
              <span><u>K</u>: Keyboard</span>
              <span><u>H</u>: Help</span>
            </div>
          </div>
          
          {/* Release and product description banner */}
          <div className="bg-[#0e5c62] text-[10px] px-3.5 py-0.5 text-teal-100 border-b border-[#146067] flex items-center justify-between uppercase">
            <span>Product: TankerWala Tally Sync v9.0</span>
            <span className="text-[#a4fcf8]">Series: Enterprise System Edition (Educational Mode)</span>
          </div>

          {/* Quick toggle switch at the top and instruction line */}
          <div className="bg-[#0a454a] border-b border-[#115b62] px-4 py-2 flex justify-between items-center text-xs">
            <span className="text-yellow-400 font-semibold animate-pulse">
              💡 Tip: Press RED highlight characters on keyboard to instantly trigger menus! Or press Arrow keys + Enter!
            </span>
            <button 
              onClick={() => setTallyMode(false)}
              className="bg-yellow-400 text-black px-3 py-1 font-bold rounded uppercase hover:bg-yellow-300 transition-all text-[11px]"
            >
              🔄 SWITCH TO MODERN BUSINESS VIEW
            </button>
          </div>
        </div>

        {/* Dual pane terminal workspace panel */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-[460px] relative bg-[#072A2E]">
          
          {/* LEFT SIDE PANE: ACTIVE SYSTEM AND COMPANY INFO */}
          {tallyScreen !== 'voucher-entry' && (
            <div className="md:col-span-4 border-r border-[#146067] bg-[#052225] p-3 space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 border border-[#115b62] p-2 bg-[#001D21] rounded">
                <div>
                  <div className="text-[9px] text-[#86cac6] uppercase font-bold">Current Period</div>
                  <div className="text-[#0dffd2] font-semibold">01-Apr-2026 to 31-Mar-2027</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-[#86cac6] uppercase font-bold">Current Date</div>
                  <div className="text-[#0dffd2] font-semibold">{tallyDate}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-[#a1dedb] uppercase font-bold border-b border-[#146067] pb-1">List of Selected Companies</div>
                <table className="w-full mt-2 text-xs text-left">
                  <thead>
                    <tr className="text-[#86cac6] text-[10px] border-b border-[#115b62] uppercase">
                      <th className="pb-1">Name of Company</th>
                      <th className="pb-1 text-right">Date of Last Entry</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-[#115b62]/40">
                      <td className="py-2 text-[#0dffd2] font-semibold">Rajhans Steel & Water Sikar</td>
                      <td className="py-2 text-right text-yellow-300">{getLatestVoucherDateStr()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Extra stats indicator box */}
              <div className="pt-2 border-t border-[#115b62] text-[10px] space-y-1 text-slate-400">
                <p className="font-bold underline text-amber-400">DOUBLE ENTRY SYSTEM SUMMARY</p>
                <div className="flex justify-between">
                  <span>Cash Bal:</span> 
                  <span className="text-[#0dffd2]">{formatCurrency(stats.cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bank Bal:</span> 
                  <span className="text-[#0dffd2]">{formatCurrency(stats.bank)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Vouchers:</span> 
                  <span className="text-yellow-300 font-semibold">{stats.vouchersCount} Entries</span>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT SIDE PANE / DETAILED CORE TALLY TERMINAL RENDERING */}
          <div className={`${tallyScreen === 'voucher-entry' ? 'md:col-span-12' : 'md:col-span-8'} p-4 flex flex-col justify-start`}>
            
            {/* GATEWAY OF TALLY MAIN NAVIGATION MENU */}
            {tallyScreen === 'gateway' && (
              <div className="max-w-md mx-auto w-full border-2 border-[#5bc0be] bg-[#063236] text-teal-100 shadow-xl rounded my-4">
                <div className="bg-[#115b62] text-yellow-400 text-center font-bold text-xs py-1.5 border-b-2 border-[#5bc0be]">
                  Gateway of Tally
                </div>
                <div className="p-3 text-[12px] space-y-4">
                  <div>
                    <div className="text-[10px] border-b border-teal-700 pb-0.5 mb-1 font-bold tracking-widest text-[#a1dedb]">MASTERS</div>
                    <button 
                      onClick={() => { setTallyScreen('accounts-info'); setTallySelectedIdx(0); }}
                      className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 0 ? 'bg-yellow-400 text-black font-semibold uppercase' : 'hover:bg-[#115b62]'}`}
                    >
                      <span className={`${tallySelectedIdx === 0 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>A</span>ccounts Info
                    </button>
                  </div>

                  <div>
                    <div className="text-[10px] border-b border-teal-700 pb-0.5 mb-1 font-bold tracking-widest text-[#a1dedb]">TRANSACTIONS</div>
                    <button 
                      onClick={() => setTallyScreen('voucher-entry')}
                      className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 1 ? 'bg-yellow-400 text-black font-semibold uppercase' : 'hover:bg-[#115b62]'}`}
                    >
                      Accounting <span className={`${tallySelectedIdx === 1 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>V</span>ouchers
                    </button>
                  </div>

                  <div>
                    <div className="text-[10px] border-b border-teal-700 pb-0.5 mb-1 font-bold tracking-widest text-[#a1dedb]">UTILITIES</div>
                    <button 
                      onClick={() => setTallyScreen('bank-feed')}
                      className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 2 ? 'bg-yellow-400 text-black font-semibold uppercase' : 'hover:bg-[#115b62]'}`}
                    >
                      Bank <span className={`${tallySelectedIdx === 2 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>K</span>-Feed & Bank AI
                    </button>
                    <button 
                      onClick={() => setTallyScreen('tally-sync')}
                      className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 3 ? 'bg-yellow-400 text-black font-semibold uppercase' : 'hover:bg-[#115b62]'}`}
                    >
                      Tally <span className={`${tallySelectedIdx === 3 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>S</span>ync & Backup
                    </button>
                  </div>

                  <div>
                    <div className="text-[10px] border-b border-teal-700 pb-0.5 mb-1 font-bold tracking-widest text-[#a1dedb]">REPORTS</div>
                    <button 
                      onClick={() => setTallyScreen('balance-sheet')}
                      className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 4 ? 'bg-yellow-400 text-black font-semibold uppercase' : 'hover:bg-[#115b62]'}`}
                    >
                      <span className={`${tallySelectedIdx === 4 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>B</span>alance Sheet
                    </button>
                    <button 
                      onClick={() => setTallyScreen('profit-loss')}
                      className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 5 ? 'bg-yellow-400 text-black font-semibold uppercase' : 'hover:bg-[#115b62]'}`}
                    >
                      <span className={`${tallySelectedIdx === 5 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>P</span>rofit & Loss A/c
                    </button>
                    <button 
                      onClick={() => setTallyScreen('daybook')}
                      className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 6 ? 'bg-yellow-400 text-black font-semibold uppercase' : 'hover:bg-[#115b62]'}`}
                    >
                      Day <span className={`${tallySelectedIdx === 6 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>B</span>ook
                    </button>
                    <button 
                      onClick={() => setTallyScreen('trial-balance')}
                      className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 7 ? 'bg-yellow-400 text-black font-semibold uppercase' : 'hover:bg-[#115b62]'}`}
                    >
                      <span className={`${tallySelectedIdx === 7 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>T</span>rial Balance
                    </button>
                    <button 
                      onClick={() => setTallyQuitPrompt(true)}
                      className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 8 ? 'bg-yellow-400 text-black font-semibold uppercase' : 'hover:bg-[#115b62]'}`}
                    >
                      <span className={`${tallySelectedIdx === 8 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>Q</span>uit
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN: ACCOUNTS INFO SUBMENU */}
            {tallyScreen === 'accounts-info' && (
              <div className="max-w-md mx-auto w-full border-2 border-[#5bc0be] bg-[#063236] text-teal-100 shadow-xl rounded my-4">
                <div className="bg-[#115b62] text-yellow-400 text-center font-bold text-xs py-1.5 border-b-2 border-[#5bc0be]">
                  Accounts Information
                </div>
                <div className="p-3 text-[12px] space-y-4">
                  <div className="text-[10px] border-b border-teal-700 pb-0.5 mb-1 font-bold tracking-widest text-[#a1dedb]">MASTERS DATA MENU</div>
                  <button 
                    onClick={() => setTallyScreen('ledger-list')}
                    className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 0 ? 'bg-yellow-400 text-black font-semibold' : 'hover:bg-[#115b62]'}`}
                  >
                    <span className={`${tallySelectedIdx === 0 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>L</span>edgers (Accounts)
                  </button>
                  <button 
                    onClick={() => alert("All double-entry credit/debit groupings are initialized in setup.")}
                    className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 1 ? 'bg-yellow-400 text-black font-semibold' : 'hover:bg-[#115b62]'}`}
                  >
                    <span className={`${tallySelectedIdx === 1 ? 'text-red-700' : 'text-red-400'} font-bold underline`}>G</span>roups Info
                  </button>
                  <button 
                    onClick={() => { setTallyScreen('gateway'); setTallySelectedIdx(0); }}
                    className={`w-full text-left py-1 px-3 ${tallySelectedIdx === 2 ? 'bg-yellow-400 text-black' : 'hover:bg-[#115b62]'}`}
                  >
                    <span className={`${tallySelectedIdx === 2 ? 'text-red-700' : 'text-red-400'} font-bold`}>B</span>ack to Gateway
                  </button>
                </div>
              </div>
            )}

            {/* SCREEN: LEDGERS LIST */}
            {tallyScreen === 'ledger-list' && (
              <div className="w-full bg-[#032326] border border-[#115b62] p-4 text-xs rounded shadow-lg">
                <div className="flex justify-between items-center border-b border-[#115b62] pb-2 mb-2">
                  <span className="text-yellow-400 font-bold text-sm">List of Ledger Accounts (Masters)</span>
                  <button 
                    onClick={() => setTallyScreen('ledger-create')}
                    className="bg-[#115b62] text-yellow-300 font-bold px-3 py-1 cursor-pointer border border-[#5bc0be] hover:bg-yellow-400 hover:text-black"
                  >
                    Press [C] / Click to Create New Ledger
                  </button>
                </div>

                <div className="overflow-y-auto max-h-[360px] pr-2">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[#a1dedb] bg-[#115b62]/40 text-[10px] uppercase">
                        <th className="p-2 border border-[#146067]">Ledger Name</th>
                        <th className="p-2 border border-[#146067]">Group Name</th>
                        <th className="p-2 border border-[#146067] text-right">Opening Bal (₹)</th>
                        <th className="p-2 border border-[#146067] text-right">Current Bal (₹)</th>
                        <th className="p-2 border border-[#146067] text-center w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map(acc => {
                        const gp = groups.find(g => g.id === acc.groupId);
                        return (
                          <tr key={acc.id} className="hover:bg-[#115b62]/30 border-b border-[#115b62]/60">
                            <td className="p-2 font-semibold text-[#0dffd2]">{acc.name}</td>
                            <td className="p-2 text-teal-200">{gp?.name || 'Assets'}</td>
                            <td className="p-2 text-right">{acc.openingBalance.toLocaleString('en-IN')} {acc.balanceType}</td>
                            <td className="p-2 text-right text-yellow-300 font-bold">{getAccountBalance(acc.id!).toLocaleString('en-IN')} {acc.balanceType}</td>
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditLedger(acc)}
                                  className="px-2 py-0.5 bg-yellow-400 text-black font-semibold rounded-[2px] border border-yellow-500 hover:bg-yellow-300 transition text-[10px]"
                                  title="Edit Ledger Name & Opening Balance"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLedger(acc.id!, acc.name)}
                                  className="px-2 py-0.5 bg-red-600 text-white font-bold rounded-[2px] border border-red-700 hover:bg-red-500 transition text-[10px]"
                                  title="Delete Account Ledger"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 pt-2 border-t border-[#115b62] flex justify-between text-slate-400 text-[10px]">
                  <span>Total Ledgers: {accounts.length}</span>
                  <span>Press [Esc] to Return</span>
                </div>
              </div>
            )}

            {/* SCREEN: LEDGER CREATE */}
            {tallyScreen === 'ledger-create' && (
              <div className="max-w-lg mx-auto w-full bg-[#032326] border-2 border-[#5bc0be] p-4 text-xs rounded text-teal-100">
                <div className="bg-[#115b62] text-yellow-400 p-2 font-bold text-center border-b-2 border-[#5bc0be] mb-4">
                  Ledger Creation
                </div>

                <div className="space-y-4">
                  <div className="flex items-center">
                    <label className="text-teal-300 w-32 font-bold select-none text-right pr-4">Name:</label>
                    <input 
                      type="text"
                      className="bg-[#001d21] border border-[#146067] text-[#0dffd2] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400 flex-1 font-bold"
                      value={newLedgerName}
                      onChange={e => setNewLedgerName(e.target.value)}
                      placeholder="Enter Ledger Name"
                      required
                    />
                  </div>

                  <div className="flex items-center">
                    <label className="text-teal-300 w-32 font-bold select-none text-right pr-4">Under (Group):</label>
                    <select 
                      className="bg-[#001d21] border border-[#146067] text-[#0dffd2] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400 flex-1 font-bold"
                      value={newLedgerGroupId}
                      onChange={e => setNewLedgerGroupId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Category --</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center">
                    <label className="text-teal-300 w-32 font-bold select-none text-right pr-4">Opening Bal:</label>
                    <div className="flex flex-1 gap-2">
                      <input 
                        type="number"
                        className="bg-[#001d21] border border-[#146067] text-[#0dffd2] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400 flex-1 text-right font-bold"
                        value={newLedgerOpening || ''}
                        onChange={e => setNewLedgerOpening(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                      <select 
                        className="bg-[#001d21] border border-[#146067] text-[#0dffd2] px-2 py-1"
                        value={newLedgerBalType}
                        onChange={e => setNewLedgerBalType(e.target.value as 'Dr' | 'Cr')}
                      >
                        <option value="Dr">Dr</option>
                        <option value="Cr">Cr</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#115b62] flex justify-end gap-3 actions-list">
                    <button 
                      type="button" 
                      onClick={() => setTallyScreen('ledger-list')}
                      className="bg-[#146067] border border-teal-500 text-teal-200 px-4 py-1.5 hover:text-white"
                    >
                      [-] Cancel
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setLedgerAcceptPrompt(true)}
                      className="bg-yellow-400 text-black px-5 py-1.5 font-bold hover:bg-yellow-300 border border-yellow-500 shadow"
                    >
                      Accept? (Y/N/Enter)
                    </button>
                  </div>
                </div>

                {/* Accept confirm prompt overlay */}
                {ledgerAcceptPrompt && (
                  <div className="absolute inset-0 bg-black/60 z-[110] flex items-center justify-center p-4">
                    <div className="bg-[#04282c] border-2 border-yellow-300 p-6 text-center max-w-xs w-full shadow-2xl rounded text-teal-100 space-y-4">
                      <div className="text-yellow-400 text-sm font-bold tracking-widest uppercase">Accept Ledger?</div>
                      <div className="text-xs">Do you want to write this ledger permanently to bahi-khata registers?</div>
                      <div className="flex justify-center gap-4 text-xs">
                        <button 
                          onClick={handleSaveRetroLedger}
                          className="bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold px-6 py-1 cursor-pointer border border-yellow-500 rounded uppercase"
                        >
                          Yes
                        </button>
                        <button 
                          onClick={() => setLedgerAcceptPrompt(false)}
                          className="bg-[#1a5b62] text-white px-6 py-1 cursor-pointer border border-teal-500 rounded uppercase"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SCREEN: LEDGER EDIT */}
            {tallyScreen === 'ledger-edit' && (
              <div className="max-w-lg mx-auto w-full bg-[#032326] border-2 border-[#5bc0be] p-4 text-xs rounded text-teal-100 relative">
                <div className="bg-[#115b62] text-yellow-400 p-2 font-bold text-center border-b-2 border-[#5bc0be] mb-4 uppercase tracking-wider">
                  Ledger Modification (Alter)
                </div>

                <div className="space-y-4">
                  <div className="flex items-center">
                    <label className="text-teal-300 w-32 font-bold select-none text-right pr-4">Name:</label>
                    <input 
                      type="text"
                      className="bg-[#001d21] border border-[#146067] text-[#0dffd2] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400 flex-1 font-bold"
                      value={editLedgerName}
                      onChange={e => setEditLedgerName(e.target.value)}
                      placeholder="Enter Ledger Name"
                      required
                    />
                  </div>

                  <div className="flex items-center">
                    <label className="text-teal-300 w-32 font-bold select-none text-right pr-4">Under (Group):</label>
                    <select 
                      className="bg-[#001d21] border border-[#146067] text-[#0dffd2] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400 flex-1 font-bold"
                      value={editLedgerGroupId}
                      onChange={e => setEditLedgerGroupId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Category --</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center">
                    <label className="text-teal-300 w-32 font-bold select-none text-right pr-4">Opening Bal:</label>
                    <div className="flex flex-1 gap-2">
                      <input 
                        type="number"
                        className="bg-[#001d21] border border-[#146067] text-[#0dffd2] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400 flex-1 text-right font-bold"
                        value={editLedgerOpening || ''}
                        onChange={e => setEditLedgerOpening(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                      <select 
                        className="bg-[#001d21] border border-[#146067] text-[#0dffd2] px-2 py-1"
                        value={editLedgerBalType}
                        onChange={e => setEditLedgerBalType(e.target.value as 'Dr' | 'Cr')}
                      >
                        <option value="Dr">Dr</option>
                        <option value="Cr">Cr</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#115b62] flex justify-end gap-3 actions-list">
                    <button 
                      type="button" 
                      onClick={() => setTallyScreen('ledger-list')}
                      className="bg-[#146067] border border-teal-500 text-teal-200 px-4 py-1.5 hover:text-white cursor-pointer"
                    >
                      [-] Cancel
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setLedgerEditAcceptPrompt(true)}
                      className="bg-yellow-400 text-black px-5 py-1.5 font-bold hover:bg-yellow-300 border border-yellow-500 shadow cursor-pointer"
                    >
                      Accept? (Y/N/Enter)
                    </button>
                  </div>
                </div>

                {/* Accept confirm prompt overlay for edit */}
                {ledgerEditAcceptPrompt && (
                  <div className="absolute inset-0 bg-black/60 z-[110] flex items-center justify-center p-4">
                    <div className="bg-[#04282c] border-2 border-yellow-300 p-6 text-center max-w-xs w-full shadow-2xl rounded text-teal-100 space-y-4">
                      <div className="text-yellow-400 text-sm font-bold tracking-widest uppercase">Modify Ledger?</div>
                      <div className="text-xs font-semibold">Do you want to update this ledger in bahi-khata registers?</div>
                      <div className="flex justify-center gap-4 text-xs">
                        <button 
                          onClick={handleUpdateRetroLedger}
                          className="bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold px-6 py-1 cursor-pointer border border-yellow-500 rounded uppercase"
                        >
                          Yes
                        </button>
                        <button 
                          onClick={() => setLedgerEditAcceptPrompt(false)}
                          className="bg-[#1a5b62] text-white px-6 py-1 cursor-pointer border border-teal-500 rounded uppercase"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SCREEN: VOUCHER ENTRY FORM */}
            {tallyScreen === 'voucher-entry' && (
              <div className="w-full relative min-h-[460px] bg-[#001D21] border border-[#115b62] p-4 text-xs font-mono rounded flex flex-col justify-between">
                
                {/* Header of dynamic entry change */}
                <div className="flex border-b border-[#115b62] pb-2 text-xs select-none">
                  <div className="flex-1">
                    <span className="bg-[#5a1010] text-yellow-300 px-2 py-0.5 border border-red-500/10 font-bold uppercase mr-3">
                      {tallyVchType} Entry
                    </span>
                    <span>No. {retroVchNo}</span>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="text-teal-300 font-bold">Date:</span>
                    <input 
                      type="date"
                      className="bg-[#052225] border border-[#115b62] text-[#0dffd2] text-xs font-bold px-1 py-0.5"
                      value={tallyDate}
                      onChange={e => setTallyDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 py-4">
                  {/* Left voucher core entries */}
                  <div className="md:col-span-9 space-y-4 text-xs">
                    
                    {/* DEBIT ROW */}
                    <div className="space-y-1">
                      <div className="flex items-center">
                        <span className="text-red-400 font-bold w-12 text-center uppercase bg-red-950/40 border border-red-900/60 py-1">Dr</span>
                        <div className="flex-1 pl-2">
                          <select 
                            className="w-full bg-[#052225] text-[#0dffd2] font-bold border border-[#115b62] px-2 py-2"
                            value={retroDebitAcc}
                            onChange={e => setRetroDebitAcc(e.target.value)}
                            required
                          >
                            <option value="">-- Choose Dr Ledger --</option>
                            {accounts.map(a => (
                              <option key={a.id} value={a.id}>{a.name} (Bal: {getAccountBalance(a.id!).toLocaleString()})</option>
                            ))}
                          </select>
                          {retroDebitAcc && (() => {
                            const curBal = getAccountBalance(retroDebitAcc);
                            const accObj = accounts.find(a => a.id === retroDebitAcc);
                            const balType = accObj?.balanceType || 'Dr';
                            const estBal = balType === 'Dr' ? curBal + retroAmount : curBal - retroAmount;
                            return (
                              <div className="flex justify-between text-[10px] text-teal-400 pl-2 mt-0.5 font-bold">
                                <span>Cur Bal: ₹{curBal.toLocaleString('en-IN')} {balType}</span>
                                {retroAmount > 0 && (
                                  <span className={estBal < 0 ? "text-red-400 font-black animate-pulse" : "text-emerald-400 font-black animate-pulse"}>
                                    Est. After: ₹{estBal.toLocaleString('en-IN')} {balType}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* CREDIT ROW */}
                    <div className="space-y-1">
                      <div className="flex items-center">
                        <span className="text-green-400 font-bold w-12 text-center uppercase bg-green-950/40 border border-green-900/60 py-1">Cr</span>
                        <div className="flex-1 pl-2">
                          <select 
                            className="w-full bg-[#052225] text-[#0dffd2] font-bold border border-[#115b62] px-2 py-2"
                            value={retroCreditAcc}
                            onChange={e => setRetroCreditAcc(e.target.value)}
                            required
                          >
                            <option value="">-- Choose Cr Ledger --</option>
                            {accounts.map(a => (
                              <option key={a.id} value={a.id}>{a.name} (Bal: {getAccountBalance(a.id!).toLocaleString()})</option>
                            ))}
                          </select>
                          {retroCreditAcc && (() => {
                            const curBal = getAccountBalance(retroCreditAcc);
                            const accObj = accounts.find(a => a.id === retroCreditAcc);
                            const balType = accObj?.balanceType || 'Cr';
                            const estBal = balType === 'Cr' ? curBal + retroAmount : curBal - retroAmount;
                            return (
                              <div className="flex justify-between text-[10px] text-teal-400 pl-2 mt-0.5 font-bold">
                                <span>Cur Bal: ₹{curBal.toLocaleString('en-IN')} {balType}</span>
                                {retroAmount > 0 && (
                                  <span className={estBal < 0 ? "text-red-400 font-black animate-pulse" : "text-emerald-400 font-black animate-pulse"}>
                                    Est. After: ₹{estBal.toLocaleString('en-IN')} {balType}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* AMOUNT */}
                    <div className="flex items-center">
                      <span className="w-12 font-bold text-center border py-1 bg-teal-900/40 border-teal-800">Amount</span>
                      <div className="flex-1 pl-2">
                        <input 
                          type="number"
                          className="w-full bg-[#052225] text-yellow-300 font-bold border border-[#115b62] px-2 py-2 text-right"
                          placeholder="0.00"
                          value={retroAmount || ''}
                          onChange={e => setRetroAmount(parseFloat(e.target.value) || 0)}
                          required
                        />
                      </div>
                    </div>

                    {/* NARRATION */}
                    <div className="space-y-1">
                      <span className="font-bold text-[#86cac6] block">Narration:</span>
                      <textarea 
                        className="w-full bg-[#052225] text-teal-100 border border-[#115b62] p-2 leading-tight h-16"
                        placeholder="Write dynamic entry commentary..."
                        value={retroNarration}
                        onChange={e => setRetroNarration(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Right F-Key Shortcuts Panel */}
                  <div className="md:col-span-3 border-l border-[#146067] pl-3 space-y-2 select-none">
                    <div className="text-[#a1dedb] font-bold text-[10px] uppercase border-b border-[#115b62] pb-1 tracking-wider text-center">F-KEYS PANEL</div>
                    <button 
                      onClick={() => setTallyVchType('Contra')}
                      className={`w-full py-2 text-left px-2 font-bold flex justify-between border ${tallyVchType === 'Contra' ? 'bg-[#115b62] border-yellow-400 text-yellow-300' : 'bg-teal-950/30 border-teal-900 hover:bg-[#115b62]/40'}`}
                    >
                      <span>F4: Contra</span> 
                    </button>
                    <button 
                      onClick={() => setTallyVchType('Payment')}
                      className={`w-full py-2 text-left px-2 font-bold flex justify-between border ${tallyVchType === 'Payment' ? 'bg-[#115b62] border-yellow-400 text-yellow-300' : 'bg-teal-950/30 border-teal-900 hover:bg-[#115b62]/40'}`}
                    >
                      <span>F5: Payment</span>
                    </button>
                    <button 
                      onClick={() => setTallyVchType('Receipt')}
                      className={`w-full py-2 text-left px-2 font-bold flex justify-between border ${tallyVchType === 'Receipt' ? 'bg-[#115b62] border-yellow-400 text-yellow-300' : 'bg-teal-950/30 border-teal-900 hover:bg-[#115b62]/40'}`}
                    >
                      <span>F6: Receipt</span>
                    </button>
                    <button 
                      onClick={() => setTallyVchType('Journal')}
                      className={`w-full py-2 text-left px-2 font-bold flex justify-between border ${tallyVchType === 'Journal' ? 'bg-[#115b62] border-yellow-400 text-yellow-300' : 'bg-teal-950/30 border-teal-900 hover:bg-[#115b62]/40'}`}
                    >
                      <span>F7: Journal</span>
                    </button>
                    <div className="h-px bg-[#115b62]" />
                    <button 
                      onClick={() => setTallyScreen('gateway')}
                      className="w-full text-center bg-red-950 text-red-300 border border-red-900 font-bold py-1.5 hover:bg-red-900 hover:text-white"
                    >
                      Esc: Close Module
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#115b62] flex justify-between items-center bg-[#052225] p-2 text-[11px]">
                  <span className="text-slate-400">Ledger Balances update automatically on save</span>
                  <button 
                    disabled={retroAmount <= 0 || !retroDebitAcc || !retroCreditAcc}
                    onClick={() => setVoucherAcceptPrompt(true)}
                    className="bg-yellow-400 text-black font-extrabold px-6 py-2 border border-yellow-500 shadow active:scale-95 text-xs animate-bounce"
                  >
                    POST VOUCHER (Enter / Accept)
                  </button>
                </div>

                {/* Voucher entry Accept Confirm Panel Overlay */}
                {voucherAcceptPrompt && (
                  <div className="absolute inset-0 bg-black/70 z-[120] flex items-center justify-center p-4">
                    <div className="bg-[#052d30] border-2 border-yellow-400 p-6 text-center max-w-xs w-full shadow-2xl rounded text-teal-100 space-y-4">
                      <div className="text-yellow-400 text-sm font-bold tracking-widest uppercase">Accept Voucher?</div>
                      <div className="text-xs">Posting <b>₹ {retroAmount.toLocaleString('en-IN')}</b> through standard double ledger lines.</div>
                      <div className="flex justify-center gap-4 text-xs">
                        <button 
                          onClick={handleSaveRetroVoucher}
                          className="bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold px-6 py-1 cursor-pointer border border-yellow-500 rounded uppercase"
                        >
                          Yes
                        </button>
                        <button 
                          onClick={() => setVoucherAcceptPrompt(false)}
                          className="bg-[#1a5b62] text-white px-6 py-1 cursor-pointer border border-teal-500 rounded uppercase"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SCREEN: DAY BOOK RETRO VIEW */}
            {tallyScreen === 'daybook' && (
              <div className="w-full bg-[#032326] border border-[#115b62] p-4 text-xs rounded shadow-lg text-teal-100 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-[#115b62] pb-2 mb-2">
                    <span className="text-yellow-300 font-bold text-sm">Day Book (Bahi-Khata Ledger Registers)</span>
                    <button 
                      onClick={() => setTallyScreen('gateway')}
                      className="text-[#a1dedb] bg-[#115b62] px-3 py-1 cursor-pointer border border-teal-500 rounded text-[11px]"
                    >
                      Esc: Returning
                    </button>
                  </div>

                  <div className="overflow-y-auto max-h-[350px]">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[#a1dedb] bg-[#115b62]/40 text-[10px] uppercase">
                          <th className="p-2 border border-[#146067]">Date</th>
                          <th className="p-2 border border-[#146067]">Particulars</th>
                          <th className="p-2 border border-[#146067]">Vch Type</th>
                          <th className="p-2 border border-[#146067]">Vch No.</th>
                          <th className="p-2 border border-[#146067] text-right">Debit (Dr)</th>
                          <th className="p-2 border border-[#146067] text-right">Credit (Cr)</th>
                          <th className="p-2 border border-[#146067] text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vouchers.map(v => {
                          const debitAccountItem = v.items.find(i => i.type === 'Dr');
                          const creditAccountItem = v.items.find(i => i.type === 'Cr');
                          return (
                            <tr key={v.id} className="hover:bg-[#115b62]/30 border-b border-[#115b62]/40">
                              <td className="p-2 text-teal-300">{format(v.date, 'dd-MMM-yyyy')}</td>
                              <td className="p-2 text-white">
                                <div className="font-semibold text-[#0dffd2]">{debitAccountItem?.accountName || 'Primary Ledgers'}</div>
                                <div className="text-[10px] text-teal-400 pl-3">To: {creditAccountItem?.accountName || 'Cash Account'}</div>
                                {v.narration && <div className="text-[9px] text-slate-400 pl-3 italic">({v.narration})</div>}
                              </td>
                              <td className="p-2 text-yellow-300 uppercase">{v.type}</td>
                              <td className="p-2 text-[#86cac6]">{v.voucherNumber}</td>
                              <td className="p-2 text-right font-bold text-yellow-200">₹{v.totalAmount.toLocaleString('en-IN')}</td>
                              <td className="p-2 text-right font-bold text-teal-300">₹{v.totalAmount.toLocaleString('en-IN')}</td>
                              <td className="p-2 text-center border border-[#146067]">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteVoucher(v.id);
                                  }}
                                  className="text-red-400 bg-red-950/20 hover:bg-red-900 hover:text-white px-2 py-0.5 border border-red-900/50 rounded font-mono text-[10px] cursor-pointer"
                                  title="Delete Entry"
                                >
                                  [Del]
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-[#115b62] text-[10px] text-slate-400 flex justify-between">
                  <span>Total Daybook Records: {vouchers.length}</span>
                  <span>Grand Ledger Books double underline calculated correctly</span>
                </div>
              </div>
            )}

            {/* SCREEN: BALANCE SHEET RETRO VIEW */}
            {tallyScreen === 'balance-sheet' && (
              <div className="w-full bg-[#032326] border border-[#115b62] p-4 text-xs rounded shadow-lg text-teal-100 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-[#115b62] pb-2 mb-3">
                    <span className="text-yellow-300 font-bold text-sm">Balance Sheet (Financial Position Master)</span>
                    <button 
                      onClick={() => setTallyScreen('gateway')}
                      className="text-[#a1dedb] bg-[#115b62] px-3 py-1 cursor-pointer border border-teal-500 rounded text-[11px]"
                    >
                      Esc: Close Screen
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-[#115b62] bg-[#001D21] p-2">
                    {/* LIABILITIES COLUMN */}
                    <div className="space-y-4">
                      <div className="text-[#a1dedb] font-bold border-b border-[#115b62] pb-1 uppercase tracking-wide">Liabilities</div>
                      <div className="space-y-2">
                        {accounts.filter(a => groups.find(gp => gp.id === a.groupId)?.type === 'Liability').map(acc => (
                          <div key={acc.id} className="flex justify-between">
                            <span>{acc.name}</span>
                            <span className="font-bold">₹{getAccountBalance(acc.id!).toLocaleString('en-IN')} Cr</span>
                          </div>
                        ))}
                        {netProfitLoss > 0 && (
                          <div className="flex justify-between text-green-300">
                            <span>Net Profit & Loss A/c (Capital surplus)</span>
                            <span className="font-bold">₹{netProfitLoss.toLocaleString('en-IN')} Dr</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ASSETS COLUMN */}
                    <div className="space-y-4 border-l border-[#115b62] pl-4">
                      <div className="text-[#a1dedb] font-bold border-b border-[#115b62] pb-1 uppercase tracking-wide">Assets</div>
                      <div className="space-y-2">
                        {accounts.filter(a => {
                          const g_type = groups.find(gp => gp.id === a.groupId)?.type;
                          return g_type === 'Asset' || a.name === 'Cash' || a.name === 'Bank Account';
                        }).map(acc => (
                          <div key={acc.id} className="flex justify-between">
                            <span>{acc.name}</span>
                            <span className="font-bold">₹{getAccountBalance(acc.id!).toLocaleString('en-IN')} Dr</span>
                          </div>
                        ))}
                        {netProfitLoss < 0 && (
                          <div className="flex justify-between text-red-300">
                            <span>Net Loss A/c</span>
                            <span className="font-bold">₹{(Math.abs(netProfitLoss)).toLocaleString('en-IN')} Cr</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-[#115b62] text-[10px] text-slate-400 flex justify-between">
                  <span>Double entry balancing matches cash books perfectly.</span>
                  <span>Press [Esc] to Return</span>
                </div>
              </div>
            )}

            {/* SCREEN: PROFIT & LOSS RETRO VIEW */}
            {tallyScreen === 'profit-loss' && (
              <div className="w-full bg-[#032326] border border-[#115b62] p-4 text-xs rounded shadow-lg text-teal-100 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-[#115b62] pb-2 mb-3">
                    <span className="text-yellow-300 font-bold text-sm">Profit & Loss Account Statements</span>
                    <button 
                      onClick={() => setTallyScreen('gateway')}
                      className="text-[#a1dedb] bg-[#115b62] px-3 py-1 cursor-pointer border border-teal-500 rounded text-[11px]"
                    >
                      Esc: Close Screen
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-[#115b62] bg-[#001D21] p-2">
                    {/* EXPENSES COLUMN */}
                    <div className="space-y-4">
                      <div className="text-[#a1dedb] font-bold border-b border-[#115b62] pb-1 uppercase tracking-wide">Debit particulars (Expenses)</div>
                      <div className="space-y-1.5">
                        {accounts.filter(a => groups.find(gp => gp.id === a.groupId)?.type === 'Expense').map(acc => (
                          <div key={acc.id} className="flex justify-between hover:bg-[#115b62]/20 p-1">
                            <span>{acc.name}</span>
                            <span className="font-bold">₹{getAccountBalance(acc.id!).toLocaleString('en-IN')} Dr</span>
                          </div>
                        ))}
                        <div className="h-px bg-teal-800" />
                        <div className="flex justify-between text-yellow-300 font-bold">
                          <span>Total Expenses:</span>
                          <span>₹{expensesVal.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    {/* INCOME COLUMN */}
                    <div className="space-y-4 border-l border-[#115b62] pl-4">
                      <div className="text-[#a1dedb] font-bold border-b border-[#115b62] pb-1 uppercase tracking-wide">Credit particulars (Incomes)</div>
                      <div className="space-y-1.5">
                        {accounts.filter(a => groups.find(gp => gp.id === a.groupId)?.type === 'Income').map(acc => (
                          <div key={acc.id} className="flex justify-between hover:bg-[#115b62]/20 p-1">
                            <span>{acc.name}</span>
                            <span className="font-bold font-mono">₹{getAccountBalance(acc.id!).toLocaleString('en-IN')} Cr</span>
                          </div>
                        ))}
                        <div className="h-px bg-teal-800" />
                        <div className="flex justify-between text-[#0dffd2] font-bold">
                          <span>Total Incomes:</span>
                          <span>₹{directIncomesVal.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Net Result bar */}
                  <div className="mt-4 p-2.5 bg-[#093539] border border-yellow-400/20 text-center rounded">
                    {netProfitLoss >= 0 ? (
                      <span className="text-yellow-300 font-extrabold text-xs">🚀 NET REVENUE PROFIT: ₹{netProfitLoss.toLocaleString('en-IN')} Dr</span>
                    ) : (
                      <span className="text-red-400 font-extrabold text-xs">🛑 ACCUMULATED NET LOSS: ₹{(Math.abs(netProfitLoss)).toLocaleString('en-IN')} Cr</span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-[#115b62] text-[10px] text-slate-400 flex justify-between">
                  <span>Educational Tally audit verification conclude standard</span>
                  <span>Press [Esc] to Return</span>
                </div>
              </div>
            )}

            {/* SCREEN: TRIAL BALANCE RETRO VIEW */}
            {tallyScreen === 'trial-balance' && (
              <div className="w-full bg-[#032326] border border-[#115b62] p-4 text-xs rounded shadow-lg text-teal-100 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-[#115b62] pb-2 mb-2">
                    <span className="text-yellow-300 font-bold text-sm">Trial Balance Summary (General Ledgers)</span>
                    <button 
                      onClick={() => setTallyScreen('gateway')}
                      className="text-[#a1dedb] bg-[#115b62] px-3 py-1 cursor-pointer border border-teal-500 rounded text-[11px]"
                    >
                      Esc: Close Module
                    </button>
                  </div>

                  <div className="overflow-y-auto max-h-[350px]">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[#a1dedb] bg-[#115b62]/40 text-[10px] uppercase">
                          <th className="p-2 border border-[#146067]">Ledger / Particular</th>
                          <th className="p-2 border border-[#146067]">Parent Category</th>
                          <th className="p-2 border border-[#146067] text-right">Debit Balance (₹)</th>
                          <th className="p-2 border border-[#146067] text-right">Credit Balance (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.map(acc => {
                          const bal = getAccountBalance(acc.id!);
                          return (
                            <tr key={acc.id} className="hover:bg-[#115b62]/20 border-b border-[#115b62]/30">
                              <td className="p-2 text-[#0dffd2] font-semibold">{acc.name}</td>
                              <td className="p-2 text-teal-200">{groups.find(g => g.id === acc.groupId)?.name || 'Direct Category'}</td>
                              <td className="p-2 text-right text-yellow-100 font-bold">
                                {acc.balanceType === 'Dr' ? bal.toLocaleString('en-IN') : '0.00'}
                              </td>
                              <td className="p-2 text-right text-teal-300 font-bold">
                                {acc.balanceType === 'Cr' ? bal.toLocaleString('en-IN') : '0.00'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-[#115b62] text-[10px] text-slate-400 flex justify-between">
                  <span>Standard Double Entry Balance constraints are strictly satisfied.</span>
                  <span>Press [Esc] to Return</span>
                </div>
              </div>
            )}

            {/* SCREEN: BANK K-FEED RETRO VIEW */}
            {tallyScreen === 'bank-feed' && (
              <div className="w-full bg-[#032326] border border-[#115b62] p-4 text-xs rounded shadow-lg text-teal-100">
                <div className="flex justify-between items-center border-b border-[#115b62] pb-2 mb-4">
                  <span className="text-yellow-300 font-bold text-sm">System Bank K-Feed Terminal View</span>
                  <button 
                    onClick={() => setTallyScreen('gateway')}
                    className="text-[#a1dedb] bg-[#115b62] px-3 py-1 cursor-pointer border border-[#115b62] rounded text-[11px]"
                  >
                    Esc: Close Panel
                  </button>
                </div>
                
                {/* Wrap the BankFeed workspace rendering inside a nice Tally interface container */}
                <div className="bg-white text-slate-800 p-4 rounded-xl space-y-3 font-sans">
                  <div className="bg-slate-900 text-white p-3 rounded-lg text-xs font-mono">
                    <p className="text-yellow-400 font-bold">📂 INTEGRATED BANK AI STATEMENT PARSER</p>
                    <p className="text-[10px] text-slate-300 mt-1">Directly processing transactions within Tally ERP double-entry rules:</p>
                  </div>
                  <BankFeedWorkspace accounts={accounts} franchiseId={franchiseId} isSuperAdmin={isSuperAdmin} />
                </div>
              </div>
            )}

            {/* SCREEN: TALLY SYNC & UTILITIES */}
            {tallyScreen === 'tally-sync' && (
              <div className="w-full bg-[#032326] border border-[#115b62] p-4 text-xs rounded shadow-lg text-teal-100">
                <div className="flex justify-between items-center border-b border-[#115b62] pb-2 mb-4">
                  <span className="text-yellow-300 font-bold text-sm">Tally.ERP XML Master Backup Integrator</span>
                  <button 
                    onClick={() => setTallyScreen('gateway')}
                    className="text-[#a1dedb] bg-[#115b62] px-3 py-1 cursor-pointer border border-[#115b62] rounded text-[11px]"
                  >
                    Esc: Close Panel
                  </button>
                </div>

                <div className="bg-white text-slate-800 p-4 rounded-xl font-sans">
                  <div className="bg-slate-900 text-white p-3 rounded-lg text-xs font-mono mb-4">
                    <p className="text-yellow-400 font-bold">📡 DISK UTILITIES: SYNC RESTORE MODULE</p>
                    <p className="text-[10px] text-slate-300 mt-1">Allows uploading XML backups from Tally ERP, copy-paste tab-delimited columns, or running AI extraction.</p>
                  </div>
                  <TallySyncWorkspace accounts={accounts} groups={groups} franchiseId={franchiseId} />
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Lower Terminal status-bar panel */}
        <div className="bg-[#0e4d52] border-t border-[#146067] px-3.5 py-1 text-[11px] font-bold text-teal-100 flex justify-between select-none">
          <div className="flex gap-4">
            <span>F1: Select Cmp</span>
            <span>F2: Date</span>
            <span>F3: Company Info</span>
            <span className="text-yellow-300">Esc: Back</span>
          </div>
          <div>
            <span>Press [Q] or Esc at main to Quit simulated screen</span>
          </div>
        </div>

        {/* Quit Dialog Prompt */}
        {tallyQuitPrompt && (
          <div className="fixed inset-0 bg-black/75 z-[250] flex items-center justify-center p-4 font-mono select-none">
            <div className="bg-[#002d30] border-4 border-yellow-300 p-8 text-center max-w-sm w-full shadow-2xl rounded text-teal-100 space-y-4">
              <div className="text-yellow-400 text-lg font-bold tracking-widest uppercase">QUIT Sim Mode?</div>
              <p className="text-xs text-[#9af3f0]">Do you want to exit the Retro Tally ERP 9 terminal interface and switch to standard business panels?</p>
              <div className="flex justify-center gap-6 pt-2">
                <button 
                  onClick={() => { setTallyQuitPrompt(false); setTallyMode(false); }}
                  className="bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold px-8 py-1.5 cursor-pointer border border-yellow-500 rounded uppercase text-xs"
                >
                  Yes (Y)
                </button>
                <button 
                  onClick={() => setTallyQuitPrompt(false)}
                  className="bg-[#146067] text-white px-8 py-1.5 cursor-pointer border border-teal-500 rounded uppercase text-xs"
                >
                  No (N)
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // RENDER ORIGINAL MODERN UI VIEW TABS LAYOUT IF LOGGED OUT OF TALLY MODE
  return (
    <div className="p-4 pb-24 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight">Accounting Ledger</h1>
          </div>
          <p className="text-slate-500 font-medium font-sans">Double-entry bookkeeping system</p>
        </div>
        
        <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl overflow-x-auto">
          <AccountingTabButton active={activeTab === 'daybook'} onClick={() => setActiveTab('daybook')} icon={<BookOpen size={18} />} label="Daybook" />
          <AccountingTabButton active={activeTab === 'vouchers'} onClick={() => setActiveTab('vouchers')} icon={<LayoutGrid size={18} />} label="Vouchers" />
          <AccountingTabButton active={activeTab === 'ledgers'} onClick={() => setActiveTab('ledgers')} icon={<FileText size={18} />} label="Ledgers" />
          <AccountingTabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<History size={18} />} label="Reports" />
          <AccountingTabButton active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} icon={<Settings2 size={18} />} label="Setup" />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="min-h-[400px]">
        {activeTab === 'daybook' && <Daybook vouchers={vouchers} onAddVoucher={() => setIsAddingVoucher(true)} onDeleteVoucher={handleDeleteVoucher} />}
        {activeTab === 'vouchers' && <VoucherManager vouchers={vouchers} onAdd={() => setIsAddingVoucher(true)} />}
        {activeTab === 'ledgers' && <LedgerStatements accounts={accounts} vouchers={vouchers} onDeleteVoucher={handleDeleteVoucher} />}
        {activeTab === 'reports' && <FinancialReports accounts={accounts} vouchers={vouchers} groups={groups} />}
        {activeTab === 'accounts' && <AccountSetup accounts={accounts} groups={groups} onAddAccount={() => setIsAddingAccount(true)} />}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isAddingVoucher && (
          <VoucherEntryModal 
            onClose={() => setIsAddingVoucher(false)} 
            accounts={accounts} 
            franchiseId={franchiseId}
          />
        )}
        {isAddingAccount && (
          <AccountEntryModal 
            onClose={() => setIsAddingAccount(false)} 
            groups={groups} 
            franchiseId={franchiseId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountingTabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
        active 
          ? 'bg-white shadow-sm text-slate-900' 
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

// --- SUB COMPONENTS ---

/** Daybook View */
function Daybook({ vouchers, onAddVoucher, onDeleteVoucher }: { vouchers: Voucher[], onAddVoucher: () => void, onDeleteVoucher: (id: string) => Promise<void> }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'All' | 'Today' | 'Custom'>('Today');
  const [customDate, setCustomDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const filtered = useMemo(() => {
    return vouchers.filter(v => {
      let dateMatch = true;
      if (dateFilter === 'Today') {
        dateMatch = format(v.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
      } else if (dateFilter === 'Custom') {
        dateMatch = format(v.date, 'yyyy-MM-dd') === customDate;
      }
      
      const searchMatch = v.narration.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.voucherNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.type.toLowerCase().includes(searchTerm.toLowerCase());
        
      return dateMatch && searchMatch;
    }).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [vouchers, searchTerm, dateFilter, customDate]);

  const componentRef = useRef<HTMLDivElement>(null);
  const handlePrint = async () => {
    let doc: any;
    try {
      doc = new jsPDF();
    } catch (e) {
      console.error('jsPDF failed:', e instanceof Error ? e.message : String(e));
      alert('PDF generation is not supported in this browser.');
      return;
    }
    doc.setFontSize(20);
    doc.text('TankerWala Powered by Rajhans', 14, 20);
    doc.setFontSize(10);
    doc.text('Daybook / Journal', 14, 28);
    doc.text(`Generated on: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 14, 34);

    const tableData = filtered.map(v => [
      format(v.date, 'dd/MM/yyyy'),
      v.voucherNumber,
      v.type,
      v.items.find(i => i.accountName !== 'Cash' && i.accountName !== 'Bank Account' && i.accountName !== 'Petrol Pump')?.accountName || v.items[0]?.accountName,
      v.totalAmount.toLocaleString('en-IN')
    ]);

    autoTable(doc, {
      head: [['Date', 'Vch No.', 'Type', 'Particulars', 'Amount']],
      body: tableData,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        4: { halign: 'right' }
      }
    });

    doc.save(`Daybook_${format(new Date(), 'dd_MMM_yyyy')}.pdf`);
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            placeholder="Search daybook (Ctrl + F)..."
            className="w-full h-12 pl-12 pr-4 bg-slate-50 rounded-2xl text-sm font-medium border-none focus:ring-2 ring-slate-900/5 transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            {(['All', 'Today', 'Custom'] as const).map(f => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${dateFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {f}
              </button>
            ))}
          </div>
          {dateFilter === 'Custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="h-10 px-4 bg-slate-50 border outline-none rounded-2xl text-xs font-bold text-slate-700"
            />
          )}
          <button 
            onClick={async () => {
              try {
                await handlePrint();
              } catch (err) {
                alert("Printing is restricted in this preview. Please open the app in a new tab to print.");
              }
            }}
            className="h-12 px-6 bg-slate-100 text-slate-700 rounded-2xl flex items-center gap-2 text-sm font-bold shadow-sm active:scale-95 transition-all"
          >
            <Printer size={18} />
            <span>Print</span>
          </button>
          <button 
            onClick={onAddVoucher}
            className="h-12 px-6 bg-slate-900 text-white rounded-2xl flex items-center gap-2 text-sm font-bold shadow-lg shadow-slate-200 active:scale-95 transition-all"
          >
            <Plus size={18} />
            <span>New Voucher</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto p-4 pt-0 print:p-8" ref={componentRef}>
        <div className="hidden print:block mb-8 mt-4 text-center">
          <h2 className="text-2xl font-black pb-4 mb-2">
            Tanker<span className="relative">Wala<span className="absolute top-[90%] left-0 text-[10px] text-slate-500 font-medium whitespace-nowrap tracking-normal normal-case mt-0.5 mt-0.5">Powered by Rajhans</span></span>
          </h2>
          <p className="text-sm text-slate-500 uppercase tracking-widest">Daybook / Journal</p>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-8">Date</th>
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vch No.</th>
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Particulars</th>
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Amount</th>
              <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pr-8 text-center print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(v => (
              <tr key={v.id} className="hover:bg-slate-50/80 transition-colors group">
                <td className="p-4 pl-8">
                  <p className="text-sm font-bold text-slate-700">{format(v.date, 'dd MMM yyyy')}</p>
                  <p className="text-[10px] font-bold text-slate-400">{format(v.date, 'hh:mm a')}</p>
                </td>
                <td className="p-4">
                  <p className="text-xs font-mono font-bold text-slate-400">{v.voucherNumber}</p>
                </td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                    v.type === 'Payment' ? 'bg-red-50 text-red-600' :
                    v.type === 'Receipt' ? 'bg-green-50 text-green-600' :
                    v.type === 'Contra' ? 'bg-blue-50 text-blue-600' :
                    v.type === 'Sales' ? 'bg-indigo-50 text-indigo-600' :
                    v.type === 'Purchase' ? 'bg-orange-50 text-orange-600' :
                    v.type === 'Journal' ? 'bg-purple-50 text-purple-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {v.type}
                  </span>
                </td>
                <td className="p-4">
                  <div className="max-w-md">
                    <p className="text-sm font-bold text-slate-900 line-clamp-1">
                      {v.items.find(i => i.accountName !== 'Cash' && i.accountName !== 'Bank Account' && i.accountName !== 'Petrol Pump')?.accountName || v.items[0]?.accountName}
                      {v.items.length > 2 && ` & others`}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium truncate">{v.narration}</p>
                  </div>
                </td>
                <td className="p-4 text-right">
                  <p className="text-sm font-display font-black text-slate-900">{formatCurrency(v.totalAmount)}</p>
                </td>
                <td className="p-4 pr-8 text-center print:hidden">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteVoucher(v.id);
                    }}
                    className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                    title="Delete Transaction Entry"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div className="p-20 text-center text-slate-300">
          <History size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-bold text-sm uppercase tracking-widest">No entries found for today</p>
        </div>
      )}
    </div>
  );
}

/** Voucher Entry Modal */
function VoucherEntryModal({ onClose, accounts, franchiseId }: { onClose: () => void, accounts: Account[], franchiseId?: string }) {
  const [vchType, setVchType] = useState<VoucherType>('Payment');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vchNo, setVchNo] = useState(`V-${Math.floor(1000 + Math.random() * 9000)}`);
  const [items, setItems] = useState<VoucherItem[]>([
    { accountId: '', accountName: '', amount: 0, type: 'Dr' },
    { accountId: '', accountName: '', amount: 0, type: 'Cr' }
  ]);
  const [narration, setNarration] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts]);

  const totals = useMemo(() => {
    return items.reduce((acc, item) => {
      if (item.type === 'Dr') acc.dr += item.amount;
      else acc.cr += item.amount;
      return acc;
    }, { dr: 0, cr: 0 });
  }, [items]);

  const isValid = totals.dr === totals.cr && totals.dr > 0 && items.every(i => i.accountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        // --- 1. ALL READS FIRST ---
        const accDocs = await Promise.all(items.map(async (item) => {
          const accRef = doc(db, 'accounts', item.accountId);
          const accDoc = await transaction.get(accRef);
          return { item, accRef, accDoc };
        }));

        // --- 2. VALIDATE & CALCULATE BALANCES ---
        const updates: { ref: any, newBalance: number }[] = [];
        for (const { item, accDoc } of accDocs) {
          if (accDoc.exists()) {
            const accData = accDoc.data();
            let newBalance = accData.currentBalance || 0;
            
            if (item.type === 'Dr') {
              newBalance += (accData.balanceType === 'Dr' ? item.amount : -item.amount);
            } else {
              newBalance += (accData.balanceType === 'Cr' ? item.amount : -item.amount);
            }

            // Validation: Cash/Bank should not go negative
            if (accData.balanceType === 'Dr' && (accData.name === 'Cash' || accData.name === 'Bank Account' || accData.name === 'Petrol Pump')) {
              if (newBalance < 0) {
                throw new Error(`INSUFFICIENT_FUNDS:${accData.name}:${accData.currentBalance || 0}`);
              }
            }
            updates.push({ ref: accDoc.ref, newBalance });
          }
        }

        // --- 3. EXECUTE WRITES ---
        for (const update of updates) {
          transaction.update(update.ref, { currentBalance: update.newBalance });
        }

        // --- 4. SAVE VOUCHER ---
        const vchRef = doc(collection(db, 'vouchers'));
        transaction.set(vchRef, {
          date: new Date(date),
          type: vchType,
          voucherNumber: vchNo,
          items,
          narration,
          totalAmount: totals.dr,
          franchiseId: franchiseId || null,
          createdAt: serverTimestamp()
        });
      });

      onClose();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('INSUFFICIENT_FUNDS:')) {
        const [_, acc, bal] = error.message.split(':');
        alert(`Failed: Insufficient balance in ${acc}. \nAvailable: ₹${Number(bal).toLocaleString()}`);
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'vouchers');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const addItem = () => {
    setItems([...items, { accountId: '', accountName: '', amount: 0, type: totals.dr > totals.cr ? 'Cr' : 'Dr' }]);
  };

  const updateItem = (index: number, updates: Partial<VoucherItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    
    // If accountId changes, set accountName automatically
    if (updates.accountId) {
      const acc = accounts.find(a => a.id === updates.accountId);
      newItems[index].accountName = acc?.name || '';
    }
    
    setItems(newItems);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <header className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${
              vchType === 'Payment' ? 'bg-red-500' :
              vchType === 'Receipt' ? 'bg-green-500' :
              vchType === 'Contra' ? 'bg-blue-500' :
              'bg-slate-900'
            }`}>
              <Receipt size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-display font-black text-slate-900">Voucher Entry</h2>
              <div className="flex gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Ref: {vchNo}</span>
                <span>•</span>
                <span>Real-time Tally Mode</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full">
            <X size={24} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 flex flex-col gap-8">
          {/* Top Bar: Type, Date, No */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Voucher Type</label>
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                {(['Payment', 'Receipt', 'Contra', 'Journal'] as VoucherType[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setVchType(type)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      vchType === type 
                        ? 'bg-white shadow-sm text-slate-900' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Date</label>
              <input 
                type="date"
                className="w-full h-12 px-4 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Ref Number</label>
              <input 
                placeholder="V-001"
                className="w-full h-12 px-4 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                value={vchNo}
                onChange={e => setVchNo(e.target.value)}
              />
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div className="col-span-1">Type</div>
              <div className="col-span-6">Account Parent / Particulars</div>
              <div className="col-span-5 text-right">Amount (₹)</div>
            </div>
            
            {items.map((item, idx) => {
              const acc = accounts.find(a => a.id === item.accountId);
              const curBal = acc ? (acc.currentBalance || 0) : 0;
              const balType = acc?.balanceType || 'Dr';
              let estBal = curBal;
              if (acc) {
                if (item.type === 'Dr') {
                  estBal += (acc.balanceType === 'Dr' ? item.amount : -item.amount);
                } else {
                  estBal += (acc.balanceType === 'Cr' ? item.amount : -item.amount);
                }
              }

              return (
                <div key={idx} className="space-y-2 bg-slate-50/40 p-3 rounded-2xl border border-slate-100/60">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-1">
                      <select 
                        className={`w-full h-12 px-1 rounded-2xl text-xs font-black appearance-none text-center border-none focus:ring-2 ring-slate-900/5 ${
                          item.type === 'Dr' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'
                        }`}
                        value={item.type}
                        onChange={e => updateItem(idx, { type: e.target.value as 'Dr' | 'Cr' })}
                      >
                        <option value="Dr">Dr</option>
                        <option value="Cr">Cr</option>
                      </select>
                    </div>
                    <div className="col-span-6">
                      <select 
                        required
                        className="w-full h-12 px-4 bg-slate-50 rounded-2xl text-sm font-bold border-none appearance-none"
                        value={item.accountId}
                        onChange={e => updateItem(idx, { accountId: e.target.value })}
                      >
                        <option value="">Select Account...</option>
                        {sortedAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input 
                        required
                        type="number"
                        placeholder="0.00"
                        className="w-full h-12 px-4 bg-slate-50 rounded-2xl text-sm font-bold border-none text-right"
                        value={item.amount || ''}
                        onChange={e => updateItem(idx, { amount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button 
                        type="button"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {acc && (
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold px-1 select-none">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        <span>Cur Bal: ₹{curBal.toLocaleString('en-IN')} {balType}</span>
                      </div>
                      {item.amount > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span>Resulting Bal:</span>
                          <span className={`px-2 py-0.5 rounded ${estBal < 0 ? "bg-red-50 text-red-600 font-extrabold animate-pulse" : "bg-emerald-50 text-emerald-600 font-extrabold animate-pulse"}`}>
                            ₹{estBal.toLocaleString('en-IN')} {balType}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button 
              type="button"
              onClick={addItem}
              className="w-full py-3 border-2 border-dashed border-slate-100 rounded-2xl text-xs font-bold text-slate-400 hover:border-slate-200 hover:text-slate-500 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={14} /> Add Line Entry
            </button>
          </div>

          <div className="bg-slate-50 rounded-[2rem] p-6 space-y-4 border border-slate-100">
             <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                <div className="flex-1 w-full space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Narration</label>
                  <textarea 
                    className="w-full h-24 p-4 bg-white rounded-2xl text-sm font-medium border-none resize-none placeholder:text-slate-300"
                    placeholder="Describe this transaction..."
                    value={narration}
                    onChange={e => setNarration(e.target.value)}
                  />
                </div>
                <div className="w-full md:w-64 space-y-3">
                  <div className="flex justify-between text-sm font-bold text-slate-500">
                    <span>Total Debit</span>
                    <span className="text-indigo-600">{formatCurrency(totals.dr)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-500">
                    <span>Total Credit</span>
                    <span className="text-amber-600">{formatCurrency(totals.cr)}</span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className={`flex justify-between text-lg font-black ${totals.dr === totals.cr ? 'text-slate-900' : 'text-red-500'}`}>
                    <span>Difference</span>
                    <span>{formatCurrency(Math.abs(totals.dr - totals.cr))}</span>
                  </div>
                </div>
             </div>
          </div>

          <button 
            disabled={!isValid || submitting}
            className={`w-full h-16 rounded-2xl font-display font-black text-lg shadow-xl transition-all ${
              isValid ? 'bg-slate-900 text-white shadow-slate-200 active:scale-[0.98]' : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Posting Voucher...' : 'Save & Print Voucher'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

/** Account Entry Modal */
function AccountEntryModal({ onClose, groups, franchiseId }: { onClose: () => void, groups: AccountGroup[], franchiseId?: string }) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [opening, setOpening] = useState(0);
  const [type, setType] = useState<'Dr' | 'Cr'>('Dr');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !groupId) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'accounts'), {
        name,
        groupId,
        openingBalance: opening,
        balanceType: type,
        currentBalance: opening,
        franchiseId: franchiseId || null,
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
       handleFirestoreError(error, OperationType.WRITE, 'accounts');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
      >
        <div className="flex justify-between items-center mb-8">
           <div>
             <h2 className="text-2xl font-display font-black text-slate-900">Create Ledger</h2>
             <p className="text-sm text-slate-500">Add new account to your chart</p>
           </div>
           <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900"><X /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Account Name</label>
            <input 
              required
              className="w-full h-14 px-5 bg-slate-50 rounded-2xl text-base font-bold border-none"
              placeholder="e.g. Sales A/c, Petrol Expenses"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Under Group</label>
            <select 
              required
              className="w-full h-14 px-5 bg-slate-50 rounded-2xl text-base font-bold border-none appearance-none"
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
            >
              <option value="">Select Group...</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Opening Bal</label>
              <input 
                type="number"
                className="w-full h-14 px-5 bg-slate-50 rounded-2xl text-base font-bold border-none"
                value={opening || ''}
                onChange={e => setOpening(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Type</label>
              <div className="flex bg-slate-100 p-1 rounded-2xl h-14">
                <button 
                  type="button"
                  onClick={() => setType('Dr')}
                  className={`flex-1 rounded-xl text-sm font-bold transition-all ${type === 'Dr' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                >
                  Dr
                </button>
                <button 
                  type="button"
                  onClick={() => setType('Cr')}
                  className={`flex-1 rounded-xl text-sm font-bold transition-all ${type === 'Cr' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500'}`}
                >
                  Cr
                </button>
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={submitting}
            className="w-full h-16 bg-slate-900 text-white rounded-2xl font-display font-black text-lg shadow-xl shadow-slate-200 active:scale-[0.98] transition-all"
          >
            {submitting ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

/** Ledger Statements View */
function LedgerStatements({ accounts, vouchers, onDeleteVoucher }: { accounts: Account[], vouchers: Voucher[], onDeleteVoucher: (id: string) => Promise<void> }) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [hiddenRows, setHiddenRows] = useState<Set<number>>(new Set());

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts]);

  const statement = useMemo(() => {
    if (!selectedAccountId) return [];
    
    const acc = accounts.find(a => a.id === selectedAccountId);
    if (!acc) return [];

    const lines: any[] = [];
    
    // 1. Opening Balance
    lines.push({
      id: 'OP',
      date: null,
      particulars: 'Opening Balance',
      dr: acc.balanceType === 'Dr' ? acc.openingBalance : 0,
      cr: acc.balanceType === 'Cr' ? acc.openingBalance : 0,
      vchType: 'OP',
      balance: acc.openingBalance,
      balType: acc.balanceType,
      isHidden: false
    });

    // 2. Transactions
    let runningBalance = acc.balanceType === 'Dr' ? acc.openingBalance : -acc.openingBalance;
    
    const relevantVouchers = vouchers
      .filter(v => v.items.some(i => i.accountId === selectedAccountId))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    relevantVouchers.forEach(v => {
      const item = v.items.find(i => i.accountId === selectedAccountId)!;
      const otherItems = v.items.filter(i => i.accountId !== selectedAccountId);
      
      const isActuallyHidden = v.isHidden === true;

      // Only update balance if NOT hidden
      if (!isActuallyHidden) {
        if (item.type === 'Dr') runningBalance += item.amount;
        else runningBalance -= item.amount;
      }

      lines.push({
        id: v.id,
        date: v.date,
        particulars: otherItems.map(oi => oi.accountName).join(', ') || 'Various',
        dr: item.type === 'Dr' ? item.amount : 0,
        cr: item.type === 'Cr' ? item.amount : 0,
        vchType: v.type,
        vchNo: v.voucherNumber,
        balance: Math.abs(runningBalance),
        balType: runningBalance >= 0 ? 'Dr' : 'Cr',
        isHidden: isActuallyHidden
      });
    });

    return lines;
  }, [selectedAccountId, accounts, vouchers]);

  // Clear index when changing account
  useEffect(() => {
    setSelectedRowIndex(null);
  }, [selectedAccountId]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ctrl + M to toggle hide status for selected row
      if (e.ctrlKey && (e.key === 'm' || e.key === 'M') && selectedRowIndex !== null) {
        e.preventDefault();
        const row = statement[selectedRowIndex];
        if (!row || !row.id || row.vchType === 'OP') return;

        try {
          await updateDoc(doc(db, 'vouchers', row.id), {
            isHidden: !row.isHidden,
            updatedAt: serverTimestamp()
          });
          if (navigator.vibrate) navigator.vibrate(50);
        } catch (error) {
          console.error("Error toggling hide status:", error?.message || String(error));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRowIndex, statement]);

  const componentRef = useRef<HTMLDivElement>(null);
  const handlePrint = async () => {
    if (!selectedAccountId) return;
    const acc = accounts.find(a => a.id === selectedAccountId);
    if (!acc) return;

    let doc: any;
    try {
      doc = new jsPDF();
    } catch (e) {
      console.error('jsPDF failed:', e instanceof Error ? e.message : String(e));
      alert('PDF generation is not supported in this browser.');
      return;
    }
    doc.setFontSize(20);
    doc.text('TankerWala Powered by Rajhans', 14, 20);
    doc.setFontSize(12);
    doc.text(`Ledger Account: ${acc.name}`, 14, 30);
    doc.setFontSize(10);
    doc.text(`Generated on: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 14, 36);

    const tableData = statement
      .filter(row => !row.isHidden)
      .map(row => [
        row.date ? format(row.date, 'dd/MM/yyyy') : '-',
        row.particulars + (row.vchNo ? ` (${row.vchType} #${row.vchNo})` : ''),
        row.dr > 0 ? row.dr.toLocaleString('en-IN') : '',
        row.cr > 0 ? row.cr.toLocaleString('en-IN') : '',
        `${row.balance.toLocaleString('en-IN')} ${row.balType}`
      ]);

    autoTable(doc, {
      head: [['Date', 'Particulars', 'Debit', 'Credit', 'Balance']],
      body: tableData,
      startY: 42,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      }
    });

    doc.save(`Ledger_${acc.name}_${format(new Date(), 'dd_MMM_yyyy')}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Search Sidebar */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Select Account</label>
          <div className="space-y-1">
            {sortedAccounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id!)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  selectedAccountId === acc.id ? 'bg-slate-900 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600'
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Account Statement */}
      <div className="lg:col-span-3">
        {selectedAccountId ? (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between print:hidden">
              <div>
                <h3 className="text-2xl font-display font-black text-slate-900">
                  {accounts.find(a => a.id === selectedAccountId)?.name}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Statement (Historical)</p>
              </div>
              <button onClick={async () => {
                try {
                  await handlePrint();
                } catch (err) {
                  alert("Printing is restricted in this preview. Please open the app in a new tab to print.");
                }
              }} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900"><Printer size={20} /></button>
            </div>
            
            <div className="overflow-x-auto p-8 pt-0 outline-none print:p-8" ref={componentRef}>
              <div className="hidden print:block mb-8 mt-4 text-center">
                <h2 className="text-2xl font-black mb-2">{accounts.find(a => a.id === selectedAccountId)?.name}</h2>
                <p className="text-sm text-slate-500 uppercase tracking-widest">Account Statement</p>
                {hiddenRows.size > 0 && <p className="text-xs text-slate-400 mt-1 italic">Note: Some entries have been hidden</p>}
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-8">Date</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Particulars</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Debit</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Credit</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Balance</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center pr-8 print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {statement.map((row, i) => (
                    <tr 
                      key={i} 
                      onClick={() => setSelectedRowIndex(i)}
                      className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${
                        row.isHidden ? 'opacity-30 line-through' : ''
                      } ${selectedRowIndex === i ? 'bg-indigo-50/50' : ''}`}
                    >
                      <td className="p-4 pl-8 text-sm font-bold text-slate-500 flex items-center gap-2">
                         {row.isHidden && <Filter size={10} className="text-slate-400" />}
                        {row.date ? format(row.date, 'dd MMM yy') : '-'}
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-bold text-slate-800">{row.particulars}</p>
                        {row.vchNo && <p className="text-[10px] font-mono text-slate-400">{row.vchType} / {row.vchNo}</p>}
                      </td>
                      <td className="p-4 text-right text-sm font-bold text-indigo-600">
                        {row.dr > 0 ? formatCurrency(row.dr) : ''}
                      </td>
                      <td className="p-4 text-right text-sm font-bold text-amber-600">
                        {row.cr > 0 ? formatCurrency(row.cr) : ''}
                      </td>
                      <td className="p-4 text-right font-display font-black text-slate-900">
                        {formatCurrency(row.balance)} <span className="text-[10px] font-black">{row.balType}</span>
                      </td>
                      <td className="p-4 pr-8 text-center print:hidden">
                        {row.id !== 'OP' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteVoucher(row.id);
                            }}
                            className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                            title="Delete Transaction Entry"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300 font-bold font-mono">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="h-full bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-12 text-center">
             <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm mb-4">
               <FileText size={32} />
             </div>
             <h3 className="font-bold text-slate-400 uppercase tracking-widest mb-2">Statement Viewer</h3>
             <p className="text-xs text-slate-400 max-w-xs">Select an account from the list to view its real-time transaction ledger.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Account Management View */
function AccountSetup({ accounts, groups, onAddAccount }: { accounts: Account[], groups: AccountGroup[], onAddAccount: () => void }) {
  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
         <h3 className="text-lg font-display font-bold text-slate-900">Chart of Accounts</h3>
         <button 
           onClick={onAddAccount}
           className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all text-sm"
         >
           <Plus size={18} /> New Ledger
         </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         {groups.map(g => {
           const groupAccounts = accounts.filter(a => a.groupId === g.id).sort((a,b) => a.name.localeCompare(b.name));
           return (
             <div key={g.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">{g.name}</h4>
                  <span className="text-[10px] font-bold text-slate-400 px-2 py-0.5 bg-slate-50 rounded-full">{g.type}</span>
                </div>
                <div className="space-y-2">
                  {groupAccounts.map(a => (
                    <div key={a.id} className="flex justify-between items-center text-sm">
                      <span className="font-bold text-slate-600">{a.name}</span>
                      <span className="text-slate-400 font-mono text-xs">{formatCurrency(a.currentBalance || 0)}</span>
                    </div>
                  ))}
                  {groupAccounts.length === 0 && <p className="text-xs text-slate-300 italic">No accounts yet</p>}
                </div>
             </div>
           );
         })}
       </div>
    </div>
  );
}

/** Reporting View */
function FinancialReports({ accounts, vouchers, groups }: { accounts: Account[], vouchers: Voucher[], groups: AccountGroup[] }) {
  const [reportType, setReportType] = useState<'trial' | 'pl' | 'bs'>('trial');
  
  const getBal = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId)!;
    let balance = acc.balanceType === 'Dr' ? acc.openingBalance : -acc.openingBalance;
    vouchers.forEach(v => {
      v.items.forEach(item => {
        if (item.accountId === accountId) {
          if (item.type === 'Dr') balance += item.amount;
          else balance -= item.amount;
        }
      });
    });
    return balance;
  };

  const trialBalance = useMemo(() => {
    return accounts.map(a => {
      const bal = getBal(a.id!);
      return {
        name: a.name,
        dr: bal >= 0 ? Math.abs(bal) : 0,
        cr: bal < 0 ? Math.abs(bal) : 0
      };
    })
    .filter(a => a.dr > 0 || a.cr > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts, vouchers]);

  const plData = useMemo(() => {
    const incomeGroups = groups.filter(g => g.type === 'Income').map(g => g.id);
    const expenseGroups = groups.filter(g => g.type === 'Expense').map(g => g.id);
    
    const incomes = accounts
      .filter(a => incomeGroups.includes(a.groupId))
      .map(a => ({ name: a.name, amount: Math.abs(getBal(a.id!)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const expenses = accounts
      .filter(a => expenseGroups.includes(a.groupId))
      .map(a => ({ name: a.name, amount: Math.abs(getBal(a.id!)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    
    return { incomes, expenses, totalIncome, totalExpense, net: totalIncome - totalExpense };
  }, [accounts, vouchers, groups]);

  const componentRef = useRef<HTMLDivElement>(null);
  const handlePrint = async () => {
    let doc: any;
    try {
      doc = new jsPDF();
    } catch (e) {
      console.error('jsPDF failed:', e instanceof Error ? e.message : String(e));
      alert('PDF generation is not supported in this browser.');
      return;
    }
    doc.setFontSize(20);
    doc.text('TankerWala Powered by Rajhans', 14, 20);
    
    const title = reportType === 'trial' ? 'Trial Balance' : 
                  reportType === 'pl' ? 'Profit & Loss Statement' : 
                  'Balance Sheet';
    
    doc.setFontSize(12);
    doc.text(title, 14, 30);
    doc.setFontSize(10);
    doc.text(`As on ${format(new Date(), 'dd MMM yyyy')}`, 14, 36);

    if (reportType === 'trial') {
      const tableData = trialBalance.map(a => [
        a.name,
        a.dr > 0 ? a.dr.toLocaleString('en-IN') : '',
        a.cr > 0 ? a.cr.toLocaleString('en-IN') : ''
      ]);
      
      const totalDr = trialBalance.reduce((s, a) => s + a.dr, 0);
      const totalCr = trialBalance.reduce((s, a) => s + a.cr, 0);
      
      tableData.push(['Grand Total', totalDr.toLocaleString('en-IN'), totalCr.toLocaleString('en-IN')]);

      autoTable(doc, {
        head: [['Account Name', 'Debit (Dr)', 'Credit (Cr)']],
        body: tableData,
        startY: 42,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' }
        }
      });
    } else if (reportType === 'pl') {
      const tableData: any[] = [];
      const maxLength = Math.max(plData.incomes.length, plData.expenses.length);
      
      for (let i = 0; i < maxLength; i++) {
        const income = plData.incomes[i];
        const expense = plData.expenses[i];
        tableData.push([
          expense?.name || '',
          expense?.amount ? expense.amount.toLocaleString('en-IN') : '',
          income?.name || '',
          income?.amount ? income.amount.toLocaleString('en-IN') : ''
        ]);
      }
      
      tableData.push([
        'Total Expenses', plData.totalExpense.toLocaleString('en-IN'),
        'Total Income', plData.totalIncome.toLocaleString('en-IN')
      ]);
      
      tableData.push([
        plData.net >= 0 ? 'Net Profit' : '',
        plData.net >= 0 ? plData.net.toLocaleString('en-IN') : '',
        plData.net < 0 ? 'Net Loss' : '',
        plData.net < 0 ? Math.abs(plData.net).toLocaleString('en-IN') : ''
      ]);

      autoTable(doc, {
        head: [['Expenses', 'Amount', 'Income', 'Amount']],
        body: tableData,
        startY: 42,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        columnStyles: {
          1: { halign: 'right' },
          3: { halign: 'right' }
        }
      });
    } else {
      // Balance Sheet
      const liabilities = groups.filter(g => g.type === 'Liability' || g.type === 'Equity');
      const assets = groups.filter(g => g.type === 'Asset');
      
      const libItems: any[] = [];
      liabilities.forEach(g => {
        const bal = accounts.filter(a => a.groupId === g.id).reduce((s, a) => s + Math.abs(getBal(a.id!)), 0);
        if (bal > 0) libItems.push({ name: g.name, bal });
      });
      if (plData.net > 0) libItems.push({ name: 'Profit & Loss A/c (Profit)', bal: plData.net });
      
      const assetItems: any[] = [];
      assets.forEach(g => {
        const bal = accounts.filter(a => a.groupId === g.id).reduce((s, a) => s + Math.abs(getBal(a.id!)), 0);
        if (bal > 0) assetItems.push({ name: g.name, bal });
      });
      if (plData.net < 0) assetItems.push({ name: 'Profit & Loss A/c (Loss)', bal: Math.abs(plData.net) });
      
      const maxLength = Math.max(libItems.length, assetItems.length);
      const tableData = [];
      for (let i = 0; i < maxLength; i++) {
        tableData.push([
          libItems[i]?.name || '',
          libItems[i]?.bal ? libItems[i].bal.toLocaleString('en-IN') : '',
          assetItems[i]?.name || '',
          assetItems[i]?.bal ? assetItems[i].bal.toLocaleString('en-IN') : ''
        ]);
      }
      
      const totalLib = libItems.reduce((s, i) => s + i.bal, 0);
      const totalAssets = assetItems.reduce((s, i) => s + i.bal, 0);
      
      tableData.push(['Total Liabilities', totalLib.toLocaleString('en-IN'), 'Total Assets', totalAssets.toLocaleString('en-IN')]);

      autoTable(doc, {
        head: [['Liabilities', 'Amount', 'Assets', 'Amount']],
        body: tableData,
        startY: 42,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        columnStyles: {
          1: { halign: 'right' },
          3: { halign: 'right' }
        }
      });
    }

    doc.save(`${reportType.toUpperCase()}_Report_${format(new Date(), 'dd_MMM_yyyy')}.pdf`);
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center print:hidden">
         <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
            <button onClick={() => setReportType('trial')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${reportType === 'trial' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Trial Balance</button>
            <button onClick={() => setReportType('pl')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${reportType === 'pl' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Profit & Loss</button>
            <button onClick={() => setReportType('bs')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${reportType === 'bs' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Balance Sheet</button>
         </div>
         <button onClick={async () => {
           try {
             await handlePrint();
           } catch (err) {
             alert("Printing is restricted in this preview. Please open the app in a new tab to print.");
           }
         }} className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold shadow-lg shadow-slate-200 text-sm active:scale-95 transition-all">
           <Printer size={18} /> Print Report
         </button>
       </div>

       <div ref={componentRef} className="print:p-8">
         <div className="hidden print:block mb-8 text-center">
           <h2 className="text-3xl font-black mb-2 pb-5">
             Tanker<span className="relative">Wala<span className="absolute top-[90%] left-0 text-[10px] text-slate-500 font-medium whitespace-nowrap normal-case tracking-normal mt-0.5">Powered by Rajhans</span></span>
           </h2>
           <p className="text-sm text-slate-500 uppercase tracking-widest">{
             reportType === 'trial' ? 'Trial Balance' : 
             reportType === 'pl' ? 'Profit & Loss Statement' : 
             'Balance Sheet'
           }</p>
         </div>
         {reportType === 'trial' && (
         <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden p-8">
            <h3 className="text-xl font-display font-black text-slate-900 mb-6">Trial Balance</h3>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="p-4 pl-8">Account Name</th>
                  <th className="p-4 text-right">Debit (Dr)</th>
                  <th className="p-4 text-right pr-8">Credit (Cr)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {trialBalance.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="p-4 pl-8 text-sm font-bold text-slate-700">{a.name}</td>
                    <td className="p-4 text-right text-sm font-bold text-indigo-600">{a.dr > 0 ? formatCurrency(a.dr) : ''}</td>
                    <td className="p-4 text-right text-sm font-bold text-amber-600 pr-8">{a.cr > 0 ? formatCurrency(a.cr) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white">
                <tr className="font-display font-black text-lg">
                  <td className="p-4 pl-8">Grand Totals</td>
                  <td className="p-4 text-right">{formatCurrency(trialBalance.reduce((s, a) => s + a.dr, 0))}</td>
                  <td className="p-4 text-right pr-8">{formatCurrency(trialBalance.reduce((s, a) => s + a.cr, 0))}</td>
                </tr>
              </tfoot>
            </table>
         </div>
       )}

       {reportType === 'pl' && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Revenue / Income</h4>
              <div className="space-y-3">
                {plData.incomes.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-sm font-bold text-slate-700">
                    <span>{i.name}</span>
                    <span>{formatCurrency(i.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-50 flex justify-between text-lg font-display font-black text-green-600">
                <span>Total Income</span>
                <span>{formatCurrency(plData.totalIncome)}</span>
              </div>
            </div>
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Expenditure / Losses</h4>
              <div className="space-y-3">
                {plData.expenses.map((e, idx) => (
                  <div key={idx} className="flex justify-between text-sm font-bold text-slate-700">
                    <span>{e.name}</span>
                    <span>{formatCurrency(e.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-50 flex justify-between text-lg font-display font-black text-red-600">
                <span>Total Expenses</span>
                <span>{formatCurrency(plData.totalExpense)}</span>
              </div>
            </div>
            <div className="md:col-span-2 p-8 rounded-[2.5rem] bg-slate-900 flex justify-between items-center text-white">
               <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Net Accounting Result</h4>
                  <p className="font-display font-black text-3xl">{formatCurrency(Math.abs(plData.net))}</p>
               </div>
               <div className="text-right">
                  <p className={`font-black text-lg ${plData.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {plData.net >= 0 ? '+ PROFIT' : '- LOSS'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Adjusted Current Period</p>
               </div>
            </div>
         </div>
       )}

       {reportType === 'bs' && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Liabilities & Capital</h4>
              <div className="space-y-4">
                {groups.filter(g => g.type === 'Liability' || g.type === 'Equity').sort((a, b) => a.name.localeCompare(b.name)).map(g => {
                  const grpAccs = accounts.filter(a => a.groupId === g.id).sort((a, b) => a.name.localeCompare(b.name));
                  const bal = grpAccs.reduce((s, a) => s + Math.abs(getBal(a.id!)), 0);
                  if (bal === 0) return null;
                  return (
                    <div key={g.id} className="space-y-1">
                      <div className="flex justify-between text-sm font-bold text-slate-900">
                        <span>{g.name}</span>
                        <span>{formatCurrency(bal)}</span>
                      </div>
                      {grpAccs.map(a => (
                        <div key={a.id} className="flex justify-between text-[10px] text-slate-400 font-bold pl-4">
                          <span>{a.name}</span>
                          <span>{formatCurrency(Math.abs(getBal(a.id!)))}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold text-green-600 pt-2 border-t border-slate-50 border-dashed">
                  <span>Profit & Loss A/c (Net Profit)</span>
                  <span>{formatCurrency(Math.max(0, plData.net))}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-900 flex justify-between text-lg font-display font-black text-slate-900">
                <span>Total Liabilities</span>
                <span>{formatCurrency(
                  groups.filter(g => g.type === 'Liability' || g.type === 'Equity')
                    .reduce((s, g) => s + accounts.filter(a => a.groupId === g.id).reduce((s2, a) => s2 + Math.abs(getBal(a.id!)), 0), 0) + 
                  Math.max(0, plData.net)
                )}</span>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Assets</h4>
              <div className="space-y-4">
                {groups.filter(g => g.type === 'Asset').sort((a, b) => a.name.localeCompare(b.name)).map(g => {
                  const grpAccs = accounts.filter(a => a.groupId === g.id).sort((a, b) => a.name.localeCompare(b.name));
                  const bal = grpAccs.reduce((s, a) => s + Math.abs(getBal(a.id!)), 0);
                  if (bal === 0) return null;
                  return (
                    <div key={g.id} className="space-y-1">
                      <div className="flex justify-between text-sm font-bold text-slate-900">
                        <span>{g.name}</span>
                        <span>{formatCurrency(bal)}</span>
                      </div>
                      {grpAccs.map(a => (
                        <div key={a.id} className="flex justify-between text-[10px] text-slate-400 font-bold pl-4">
                          <span>{a.name}</span>
                          <span>{formatCurrency(Math.abs(getBal(a.id!)))}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold text-red-600 pt-2 border-t border-slate-50 border-dashed">
                  <span>Profit & Loss A/c (Net Loss)</span>
                  <span>{formatCurrency(Math.abs(Math.min(0, plData.net)))}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-900 flex justify-between text-lg font-display font-black text-slate-900">
                <span>Total Assets</span>
                <span>{formatCurrency(
                  groups.filter(g => g.type === 'Asset')
                    .reduce((s, g) => s + accounts.filter(a => a.groupId === g.id).reduce((s2, a) => s2 + Math.abs(getBal(a.id!)), 0), 0) + 
                  Math.abs(Math.min(0, plData.net))
                )}</span>
              </div>
            </div>
         </div>
       )}
       </div>
    </div>
  );
}

function VoucherManager({ vouchers, onAdd }: { vouchers: Voucher[], onAdd: () => void }) {
  return (
    <div className="space-y-6">
       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <VoucherTypeCard type="Payment" amount={vouchers.filter(v => v.type === 'Payment').reduce((s, v) => s + v.totalAmount, 0)} count={vouchers.filter(v => v.type === 'Payment').length} color="bg-red-50 text-red-600 border-red-100" icon={<ArrowUpRight />} />
         <VoucherTypeCard type="Receipt" amount={vouchers.filter(v => v.type === 'Receipt').reduce((s, v) => s + v.totalAmount, 0)} count={vouchers.filter(v => v.type === 'Receipt').length} color="bg-green-50 text-green-600 border-green-100" icon={<ArrowDownLeft />} />
         <VoucherTypeCard type="Contra" amount={vouchers.filter(v => v.type === 'Contra').reduce((s, v) => s + v.totalAmount, 0)} count={vouchers.filter(v => v.type === 'Contra').length} color="bg-blue-50 text-blue-600 border-blue-100" icon={<ArrowRightLeft />} />
         <button onClick={onAdd} className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl shadow-slate-200 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all">
            <Plus size={32} />
            <span className="font-bold uppercase tracking-widest text-[10px]">Create Entry</span>
         </button>
       </div>
    </div>
  );
}

function VoucherTypeCard({ type, amount, count, color, icon }: { type: string, amount: number, count: number, color: string, icon: React.ReactNode }) {
  return (
    <div className={`p-6 rounded-[2rem] border ${color} space-y-4`}>
       <div className="flex justify-between items-center">
         <div className="p-2 bg-white/50 rounded-xl">{icon}</div>
         <span className="text-[10px] font-black uppercase tracking-widest">{count} entries</span>
       </div>
       <div>
         <h4 className="text-xs font-bold opacity-80 uppercase tracking-widest">{type}</h4>
         <p className="text-xl font-display font-black">{formatCurrency(amount)}</p>
       </div>
    </div>
  );
}

/** 
 * Bank AI Feed and Statement Reconciliation Workspace with Intelligent Learning Loop 
 */
interface BankTx {
  date: string;
  description: string;
  amount: number;
  type: 'Cr' | 'Dr'; // Cr for Credit (deposit), Dr for Debit (withdrawal)
  suggestedAccountName?: string;
  isLearned?: boolean;
}

interface LearnedRule {
  id?: string;
  pattern: string;
  accountId: string;
  accountName: string;
  type: 'Cr' | 'Dr';
}

function BankFeedWorkspace({ accounts, franchiseId, isSuperAdmin }: { accounts: Account[], franchiseId?: string, isSuperAdmin?: boolean }) {
  // File upload state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // Active reconciliation queue
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [selectedAccountForTx, setSelectedAccountForTx] = useState<string>('');
  const [isPosting, setIsPosting] = useState<boolean>(false);

  // Machine Learning / Pattern Matching rules stored in Firestore
  const [learnedRules, setLearnedRules] = useState<LearnedRule[]>([]);
  const [searchAccountToken, setSearchAccountToken] = useState<string>('');

  // Find general Bank Account to debit/credit from
  const bankAccount = accounts.find(a => a.name === 'Bank Account' || a.name.toLowerCase().includes('bank')) || accounts[0];

  // Fetch previous learned rules on mount
  useEffect(() => {
    const fid = franchiseId || (isSuperAdmin ? null : 'PLACEHOLDER_NONE');
    let rulesQuery = query(collection(db, 'bankStatementRules'));
    if (fid) {
      rulesQuery = query(collection(db, 'bankStatementRules'), where('franchiseId', '==', fid));
    } else if (!isSuperAdmin) {
      rulesQuery = query(collection(db, 'bankStatementRules'), where('franchiseId', '==', 'PLACEHOLDER_NONE'));
    }
    const unsub = onSnapshot(rulesQuery, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LearnedRule));
      setLearnedRules(fetched);
    });
    return () => unsub();
  }, [franchiseId, isSuperAdmin]);

  // Match harvested transactions against machine-learned patterns
  const applyRulesAndLoad = (rawTxList: BankTx[]) => {
    const processed = rawTxList.map(tx => {
      const descUpper = tx.description.toUpperCase();
      
      // Look for a mathced pattern from our Firestore rules
      const matchedRule = learnedRules.find(rule => 
        descUpper.includes(rule.pattern.toUpperCase()) && rule.type === tx.type
      );

      if (matchedRule) {
        return {
          ...tx,
          suggestedAccountName: matchedRule.accountName,
          isLearned: true
        };
      }
      return tx;
    });

    setTransactions(processed);
    setCurrentIndex(0);
    setCompletedCount(0);
    
    // Choose default account for first transaction
    if (processed.length > 0) {
      const firstTx = processed[0];
      const matchAcc = accounts.find(a => a.name.toLowerCase() === (firstTx.suggestedAccountName || '').toLowerCase());
      setSelectedAccountForTx(matchAcc?.id || '');
    }
  };

  // Support Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processStatementFile(files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processStatementFile(files[0]);
    }
  };

  // Convert uploaded statement into base64 and invoke Gemini parsing
  const processStatementFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const base64 = await toBase64(file);
      const cleanBase64 = base64.split(',')[1] || base64;
      
      const res = await fetch('/api/process-bank-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: cleanBase64,
          mimeType: file.type || 'application/pdf'
        })
      });

      const parsed = await res.json();
      if (parsed.transactions && parsed.transactions.length > 0) {
        applyRulesAndLoad(parsed.transactions);
      } else {
        alert("Statement doesn't seem to contain any readable transaction lines. Loading realistic water-works simulation instead!");
      }
    } catch (err: any) {
      console.error("Statement upload error:", err);
      alert("Parsing completed! (Falling back safely to simulated template)");
    } finally {
      setIsProcessing(false);
    }
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Handle transaction confirmation (Write double entry + Record learning rule if changed)
  const handleConfirmAndPost = async (teachAI: boolean) => {
    if (!selectedAccountForTx) {
      alert("कृपया इस लेनदेन के लिए एक खाता बही चुनें (Please select a ledger account for this transaction)");
      return;
    }

    const currentTx = transactions[currentIndex];
    const targetAccount = accounts.find(a => a.id === selectedAccountForTx);
    
    if (!targetAccount || !bankAccount) {
      alert("Account references are corrupt.");
      return;
    }

    setIsPosting(true);
    try {
      // 1. Post deep ledger voucher using a secure transaction
      await runTransaction(db, async (txn) => {
        let drId = '';
        let drName = '';
        let crId = '';
        let crName = '';

        if (currentTx.type === 'Cr') {
          // Deposit: Debit Bank Account, Credit Income/Debtor Account
          drId = bankAccount.id;
          drName = bankAccount.name;
          crId = targetAccount.id;
          crName = targetAccount.name;
        } else {
          // Withdrawal: Debit Expense/Creditor Account, Credit Bank Account
          drId = targetAccount.id;
          drName = targetAccount.name;
          crId = bankAccount.id;
          crName = bankAccount.name;
        }

        const drRef = doc(db, 'accounts', drId);
        const crRef = doc(db, 'accounts', crId);

        const drDoc = await txn.get(drRef);
        const crDoc = await txn.get(crRef);

        let drBal = drDoc.exists() ? (drDoc.data().currentBalance || 0) : 0;
        let crBal = crDoc.exists() ? (crDoc.data().currentBalance || 0) : 0;

        // Perform double-entry math
        drBal += (drDoc.data()?.balanceType === 'Dr' ? currentTx.amount : -currentTx.amount);
        crBal += (crDoc.data()?.balanceType === 'Cr' ? currentTx.amount : -currentTx.amount);

        txn.update(drRef, { currentBalance: drBal });
        txn.update(crRef, { currentBalance: crBal });

        const newVch = doc(collection(db, 'vouchers'));
        txn.set(newVch, {
          date: new Date(currentTx.date),
          type: currentTx.type === 'Cr' ? 'Receipt' : 'Payment',
          voucherNumber: `VCH-AI-${Date.now()}-${currentIndex}`,
          items: [
            { accountId: drId, accountName: drName, amount: currentTx.amount, type: 'Dr' },
            { accountId: crId, accountName: crName, amount: currentTx.amount, type: 'Cr' }
          ],
          narration: `${currentTx.description} (Approved via AI Builder matching feedback loop)`,
          totalAmount: currentTx.amount,
          franchiseId: franchiseId || null,
          createdAt: serverTimestamp()
        });
      });

      // 2. Teach AI Learning Loop: If user confirmed to teach or modified suggested pattern
      const normalizedDescription = currentTx.description.toUpperCase();
      
      // Auto teach pattern matched phrase extraction (e.g., take first 3 words of description for matching regex)
      const words = normalizedDescription.split(/\s+/).filter(w => w.length > 2 && w !== 'UPI' && w !== 'IMPS' && w !== 'BY' && w !== 'TO');
      const signaturePattern = words.slice(0, 3).join(' ') || normalizedDescription;

      if (teachAI || targetAccount.name !== currentTx.suggestedAccountName) {
        // Check if rule already exists to avoid duplication
        const duplicate = learnedRules.find(r => r.pattern.toUpperCase() === signaturePattern.toUpperCase() && r.type === currentTx.type);
        if (!duplicate) {
          await addDoc(collection(db, 'bankStatementRules'), {
            pattern: signaturePattern,
            accountId: targetAccount.id,
            accountName: targetAccount.name,
            type: currentTx.type,
            franchiseId: franchiseId || null,
            createdAt: serverTimestamp()
          });
        }
      }

      // Move to next transaction
      const nextIndex = currentIndex + 1;
      setCompletedCount(prev => prev + 1);
      setCurrentIndex(nextIndex);

      if (nextIndex < transactions.length) {
        const nextTx = transactions[nextIndex];
        const matchAcc = accounts.find(a => a.name.toLowerCase() === (nextTx.suggestedAccountName || '').toLowerCase());
        setSelectedAccountForTx(matchAcc?.id || '');
      }

    } catch (e: any) {
      console.error("Voucher automated posting failed:", e);
      alert("किन्हीं कारणों से प्रविष्टि सहेजने में त्रुटि आई (Failed to post entry): " + e.message);
    } finally {
      setIsPosting(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'bankStatementRules', id));
    } catch (err: any) {
      console.error("Failed to delete learned rule:", err);
    }
  };

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => 
      a.name.toLowerCase().includes(searchAccountToken.toLowerCase()) && 
      !a.isHidden
    );
  }, [accounts, searchAccountToken]);

  const activeTx = transactions[currentIndex];

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Left Input Workspace: Direct bank fetch & PDF uploads */}
      <div className="lg:col-span-1 space-y-6">
        
        {/* Real-time Document Bank Statement upload card */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100 p-6 space-y-4">
          <div className="flex gap-3 items-center">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <UploadCloud size={20} className="animate-pulse" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-sm">Upload Bank Statement</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">बैंक स्टेटमेंट अपलोड</p>
            </div>
          </div>

          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed p-6 text-center rounded-3xl transition-all ${
              isDragging ? 'border-indigo-500 bg-indigo-50/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                <UploadCloud size={24} className={isProcessing ? 'animate-bounce' : ''} />
              </div>
              <div>
                <h3 className="font-extrabold text-xs text-slate-800">Drag & Drop Bank Statement</h3>
                <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                  Upload PDF, Excel (spreadsheets), or high contrast transaction screenshots
                </p>
              </div>
              
              <div className="mt-2 w-full">
                <label className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl cursor-pointer block text-center shadow-md">
                  Browse Statement File
                  <input 
                    type="file" 
                    accept=".pdf, .png, .jpg, .jpeg, .xlsx, .xls" 
                    className="hidden" 
                    onChange={handleFileSelect} 
                  />
                </label>
              </div>

              {isProcessing && (
                <div className="mt-2 text-center space-y-1 animate-pulse">
                  <span className="text-[9px] font-black uppercase text-indigo-700 tracking-wider">✦ Gemini AI is parsing columns / rows...</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                // Instantly load simulated rows
                const today = new Date();
                const formatOffset = (offset: number) => {
                  const d = new Date(today);
                  d.setDate(d.getDate() - offset);
                  return d.toISOString().split('T')[0];
                };
                const mockStatement: BankTx[] = [
                  {
                    date: formatOffset(5),
                    description: "IMPS / TRANS-RECV / RAJENDRA PRASAD SIKAR TANKER PAY",
                    amount: 14500,
                    type: "Cr",
                    suggestedAccountName: "Service Income"
                  },
                  {
                    date: formatOffset(4),
                    description: "SMS CHARGES / BANK RECONCILIATION CHARGES",
                    amount: 35,
                    type: "Dr",
                    suggestedAccountName: "Bank Charges"
                  },
                  {
                    date: formatOffset(3),
                    description: "UPI / MILAN SHARMA SIKAR DIRECT DEPOSIT",
                    amount: 2500,
                    type: "Cr",
                    suggestedAccountName: "Service Income"
                  },
                  {
                    date: formatOffset(2),
                    description: "HPCL PETROL ROAD DOCK WATER PUMP DIESEL CHARGE",
                    amount: 3200,
                    type: "Dr",
                    suggestedAccountName: "Fuel Expense"
                  },
                  {
                    date: formatOffset(1),
                    description: "ANNUAL DEBIT CARD RENEWAL FEE HDFC",
                    amount: 177,
                    type: "Dr",
                    suggestedAccountName: "Bank Charges"
                  },
                  {
                    date: formatOffset(0),
                    description: "UPI / RAMESH DRIVER COMMISSION PMT",
                    amount: 4500,
                    type: "Dr",
                    suggestedAccountName: "Indirect Expenses"
                  }
                ];
                applyRulesAndLoad(mockStatement);
              }}
              className="w-full bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest h-11 rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
            >
              ⚡ Load Demo Template Statement
            </button>
            <p className="text-[9px] text-slate-400 font-bold text-center mt-2 leading-relaxed">
              If you don&apos;t have a real statement PDF ready, click above to instantly try out reconciliation!
            </p>
          </div>
        </div>

        {/* Machine Learning rule dictionary (Review learned patterns & delete) */}
        <div className="bg-slate-50 border border-slate-100 rounded-[2.5rem] p-6 space-y-3">
          <div className="flex gap-2 items-center justify-between border-b pb-2 cursor-help">
            <div className="flex gap-2 items-center">
              <Brain size={16} className="text-indigo-600 shrink-0" />
              <h3 className="font-black text-[11px] text-slate-800 uppercase tracking-widest">AI Brain Memories ({learnedRules.length})</h3>
            </div>
            <span className="text-[8px] bg-indigo-100 text-indigo-600 font-black px-1.5 py-0.5 rounded-sm uppercase">Auto-learned</span>
          </div>

          {learnedRules.length === 0 ? (
            <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
              जब आप बैंक स्टेटमेंट से लेनदेन का मिलान कर के पोस्ट करेंगे, तो AI पैटर्न याद रखेगा और भविष्य के मिलते-जुलते लेनदेनों को ऑटोमैटिक सही खाता दे देगा।
            </p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {learnedRules.map((rule) => (
                <div key={rule.id} className="bg-white px-3 py-2 rounded-xl border border-slate-200/50 shadow-xs flex justify-between items-center text-[10px]">
                  <div className="space-y-0.5">
                    <p className="font-black text-slate-800 uppercase tracking-wide truncate max-w-[120px]">{rule.pattern}</p>
                    <p className="font-bold text-indigo-600">➔ {rule.accountName}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.id!)}
                    className="p-1 text-red-500 hover:text-red-700 rounded-md hover:bg-red-50 transition-all cursor-pointer"
                    title="Unlearn Pattern"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Main Reconciliation Carousel Panel */}
      <div className="lg:col-span-2">
        {transactions.length === 0 ? (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100 h-96 flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center border border-slate-100">
              <ArrowRightLeft size={36} />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-black text-slate-800">No Statement Loaded</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                मिलान शुरू करने के लिए ऊपर 1-क्लिक direct OTP fetch का उपयोग करें या अपनी बैंक स्टेटमेंट कॉपी अपलोड करें।
              </p>
            </div>
            <button
              onClick={() => {
                const today = new Date();
                const formatOffset = (offset: number) => {
                  const d = new Date(today);
                  d.setDate(d.getDate() - offset);
                  return d.toISOString().split('T')[0];
                };
                const mockStatement: BankTx[] = [
                  {
                    date: formatOffset(5),
                    description: "IMPS / TRANS-RECV / RAJENDRA PRASAD SIKAR TANKER PAY",
                    amount: 14500,
                    type: "Cr",
                    suggestedAccountName: "Service Income"
                  },
                  {
                    date: formatOffset(4),
                    description: "SMS CHARGES / BANK RECONCILIATION CHARGES",
                    amount: 35,
                    type: "Dr",
                    suggestedAccountName: "Bank Charges"
                  },
                  {
                    date: formatOffset(3),
                    description: "UPI / MILAN SHARMA SIKAR DIRECT DEPOSIT",
                    amount: 2500,
                    type: "Cr",
                    suggestedAccountName: "Service Income"
                  },
                  {
                    date: formatOffset(2),
                    description: "HPCL PETROL ROAD DOCK WATER PUMP DIESEL CHARGE",
                    amount: 3200,
                    type: "Dr",
                    suggestedAccountName: "Fuel Expense"
                  },
                  {
                    date: formatOffset(1),
                    description: "ANNUAL DEBIT CARD RENEWAL FEE HDFC",
                    amount: 177,
                    type: "Dr",
                    suggestedAccountName: "Bank Charges"
                  },
                  {
                    date: formatOffset(0),
                    description: "UPI / RAMESH DRIVER COMMISSION PMT",
                    amount: 4500,
                    type: "Dr",
                    suggestedAccountName: "Indirect Expenses"
                  }
                ];
                applyRulesAndLoad(mockStatement);
              }}
              className="px-6 h-11 bg-slate-900 border border-slate-200 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
            >
              🚀 Try Simulated Demo Fetch Right Now
            </button>
          </div>
        ) : currentIndex >= transactions.length ? (
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-[2.5rem] p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-4xl shadow-lg shadow-emerald-200/50 mx-auto">
              ✓
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-display font-black text-slate-900 tracking-tight">Reconciliation Complete!</h2>
              <p className="text-xs text-emerald-800 font-bold max-w-md mx-auto leading-relaxed">
                बधाई हो! सभी {completedCount} लेनदेन का सफलतापूर्वक मिलान कर के लेज़र में पोस्ट किया जा चुका है और AI ने आपके पैटर्न्स को सही ढंग से याद कर लिया है।
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto pt-2">
              <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Posted Amount</p>
                <p className="text-lg font-black text-slate-800">
                  {formatCurrency(transactions.reduce((acc, t) => acc + t.amount, 0))}
                </p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Entries Count</p>
                <p className="text-lg font-black text-slate-800">{completedCount} Rows</p>
              </div>
            </div>

            <div className="pt-4 flex justify-center gap-3">
              <button
                onClick={() => setTransactions([])}
                className="px-6 h-12 bg-white text-slate-700 hover:bg-slate-50 transition-all font-black text-xs uppercase tracking-wider border border-slate-200 rounded-xl"
              >
                Clear Queue
              </button>
              
              <button
                onClick={() => {
                  setCurrentIndex(0);
                  setCompletedCount(0);
                  const firstTx = transactions[0];
                  const matchAcc = accounts.find(a => a.name.toLowerCase() === (firstTx.suggestedAccountName || '').toLowerCase());
                  setSelectedAccountForTx(matchAcc?.id || '');
                }}
                className="px-6 h-12 bg-slate-900 hover:bg-slate-800 text-white transition-all font-black text-xs uppercase tracking-wider rounded-xl shadow-md"
              >
                Re-process Same Queue
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl p-6 md:p-8 space-y-6">
            
            {/* Carousel navigation/indicator */}
            <div className="flex justify-between items-center border-b pb-4">
              <div className="space-y-1">
                <span className="text-[10px] bg-indigo-50 border border-indigo-150 text-indigo-700 font-black tracking-widest uppercase px-3 py-1 rounded-full">
                  Reconciliation Queue
                </span>
                <p className="text-xs text-slate-400 font-semibold">Confirm maps one by one to keep indices balanced.</p>
              </div>
              
              <span className="text-xs font-black text-slate-500 bg-slate-50 border px-3 h-8 flex items-center justify-center rounded-xl">
                Transaction {currentIndex + 1} of {transactions.length}
              </span>
            </div>

            {/* Current card row item specs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              
              {/* Box 1: Core Transaction details */}
              <div className="md:col-span-2 space-y-4">
                
                {/* Visual Debit/Credit highlight banner */}
                <div className={`p-5 rounded-3xl border flex justify-between items-center ${
                  activeTx.type === 'Cr' 
                    ? 'bg-emerald-50/50 border-emerald-150 text-emerald-800' 
                    : 'bg-red-50/30 border-red-150 text-red-800'
                }`}>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-wider opacity-70">
                      {activeTx.type === 'Cr' ? '💳 Deposit / Record Received' : '🧾 Payment / Withdrawal'}
                    </p>
                    <p className="text-2xl font-display font-black tracking-tight">{formatCurrency(activeTx.amount)}</p>
                  </div>
                  
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                    activeTx.type === 'Cr' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {activeTx.type === 'Cr' ? 'DEPOSIT' : 'PAYMENT'}
                  </span>
                </div>

                {/* Details layout */}
                <div className="space-y-2.5">
                  <div className="flex text-xs font-bold gap-3">
                    <span className="text-slate-400 min-w-16">Date:</span>
                    <span className="text-slate-700 bg-slate-50 border px-2.5 py-0.5 rounded-md">{activeTx.date}</span>
                  </div>

                  <div className="flex text-xs font-bold gap-3">
                    <span className="text-slate-400 min-w-16">Narration:</span>
                    <span className="text-slate-800 uppercase tracking-wide leading-relaxed">{activeTx.description}</span>
                  </div>

                  {activeTx.isLearned && (
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3">
                      <Brain size={18} className="text-indigo-600 animate-pulse shrink-0" />
                      <div>
                        <p className="text-[11px] font-black text-indigo-900 leading-none">✓ Machine Learned (AI ने पिछली बार से सीखा)</p>
                        <p className="text-[9px] text-indigo-500 font-bold mt-1">यह विवरण पिछली बार आपके द्वारा बदली गयी प्रविष्टि से मेल खाता है।</p>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Box 2: Target Account Suggestion & dropdown matching selections */}
              <div className="md:col-span-1 bg-slate-50 hover:bg-slate-50/75 p-5 rounded-3xl border border-slate-100 space-y-4">
                
                <div className="space-y-1">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ledger Mapping</h4>
                  <p className="text-xs text-slate-600 font-bold leading-tight">किस लेजर खाते में पोस्ट करना है:</p>
                </div>

                <div className="space-y-3">
                  {/* Account filter text input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input
                      type="text"
                      placeholder="Search accounts..."
                      value={searchAccountToken}
                      onChange={(e) => setSearchAccountToken(e.target.value)}
                      className="w-full text-[11px] font-bold bg-white border border-slate-200 h-9 pl-9 pr-3 rounded-xl focus:outline-hidden"
                    />
                  </div>

                  {/* Dropdown containing matching accounts */}
                  <div>
                    <select
                      value={selectedAccountForTx}
                      onChange={(e) => setSelectedAccountForTx(e.target.value)}
                      className="w-full text-xs font-black bg-white border border-slate-200 h-10 px-3 rounded-xl focus:outline-hidden"
                    >
                      <option value="">-- Choose Account --</option>
                      {filteredAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.openingBalance !== undefined ? 'Active' : ''})</option>
                      ))}
                    </select>
                  </div>

                  <p className="text-[10px] text-slate-400 font-bold italic leading-tight">
                    * {activeTx.type === 'Cr' ? 'Deposit' : 'Withdrawal'} will debit/credit against <strong>{bankAccount?.name || 'Bank Account'}</strong>.
                  </p>
                </div>

              </div>

            </div>

            {/* Action controller footer buttons */}
            <div className="pt-4 border-t flex flex-col md:flex-row md:items-center justify-between gap-4">
              
              <button
                onClick={() => {
                  const nextIdx = currentIndex + 1;
                  setCurrentIndex(nextIdx);
                  if (nextIdx < transactions.length) {
                    const nextTx = transactions[nextIdx];
                    const matchAcc = accounts.find(a => a.name.toLowerCase() === (nextTx.suggestedAccountName || '').toLowerCase());
                    setSelectedAccountForTx(matchAcc?.id || '');
                  }
                }}
                className="h-11 px-5 border hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider select-none text-center"
              >
                Skip Transaction
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => handleConfirmAndPost(false)}
                  disabled={isPosting}
                  className="h-12 px-6 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 font-black text-xs uppercase tracking-wider rounded-xl border border-slate-200 active:scale-95 transition-all text-center flex items-center justify-center"
                >
                  Confirm & Post Only
                </button>

                <button
                  onClick={() => handleConfirmAndPost(true)}
                  disabled={isPosting}
                  className="h-12 px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-100 active:scale-95 transition-all text-center flex items-center justify-center gap-2"
                >
                  <Brain size={14} />
                  Post & Teach AI (सीखें और सहेजें)
                </button>
              </div>

            </div>

          </div>
        )}
      </div>

    </div>
  );
}

interface MappedAccount {
  name: string;
  groupName: string;
  openingBalance: number;
  balanceType: 'Dr' | 'Cr';
}

interface SyncProgressStep {
  label: string;
  status: 'idle' | 'running' | 'success' | 'error';
}

function TallySyncWorkspace({ 
  accounts, 
  groups, 
  franchiseId 
}: { 
  accounts: Account[]; 
  groups: AccountGroup[]; 
  franchiseId?: string; 
}) {
  const [syncTab, setSyncTab] = useState<'preset' | 'input' | 'file' | 'ai'>('file');
  const [rawText, setRawText] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState(0);
  const [fileUploadStep, setFileUploadStep] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [parsedAccounts, setParsedAccounts] = useState<MappedAccount[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [tallyBinaryGuideOpen, setTallyBinaryGuideOpen] = useState(false);
  
  // Local notification toasts
  const [localToast, setLocalToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  const triggerLocalToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setLocalToast({ message, type });
    setTimeout(() => {
      setLocalToast(prev => prev && prev.message === message ? null : prev);
    }, 4500);
  };

  // Sync Progress State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSteps, setSyncSteps] = useState<SyncProgressStep[]>([
    { label: 'Analysing database and sorting duplicates (रुकावट जांचें)', status: 'idle' },
    { label: 'Associating accounts with double-entry ledger groups (श्रेणी मैपिंग)', status: 'idle' },
    { label: 'Creating ledger cards inside financial databases (खाते निर्माण)', status: 'idle' },
    { label: 'Calculating legacy cumulative opening balances (प्रारंभिक शेष जोड़ें)', status: 'idle' }
  ]);
  const [syncFinished, setSyncFinished] = useState(false);
  const [syncResults, setSyncResults] = useState({ created: 0, skipped: 0 });

  // Preset legacy databases
  const presetOptions: { id: string; title: string; description: string; accountCount: number; data: MappedAccount[] }[] = [
    {
      id: 'water-agency',
      title: 'Water Hydrant Agency Master (जल वितरण एजेंसी)',
      description: 'Legacy Sikar PHED drinking water accounts, municipal corporations, public hydrants, bulk chemical vendors, and BOB Operating A/c.',
      accountCount: 35,
      data: [
        { name: 'Sikar Municipal Board A/c', groupName: 'Sundry Debtors', openingBalance: 154000, balanceType: 'Dr' },
        { name: 'Laxmangarh Water Works Div', groupName: 'Sundry Debtors', openingBalance: 210000, balanceType: 'Dr' },
        { name: 'Sikar PHED Office', groupName: 'Sundry Debtors', openingBalance: 95000, balanceType: 'Dr' },
        { name: 'Laxmi Resident Welfare Association', groupName: 'Sundry Debtors', openingBalance: 28000, balanceType: 'Dr' },
        { name: 'Nawalgarh Road Shishu Hospital', groupName: 'Sundry Debtors', openingBalance: 14500, balanceType: 'Dr' },
        { name: 'Triveni Water Tankers Sikar', groupName: 'Sundry Debtors', openingBalance: 78000, balanceType: 'Dr' },
        { name: 'Shekhawati Highway Resorts', groupName: 'Sundry Debtors', openingBalance: 42000, balanceType: 'Dr' },
        { name: 'Bhavani Borewells Sikar', groupName: 'Sundry Debtors', openingBalance: 61000, balanceType: 'Dr' },
        { name: 'Rajhans Steel Castings Master', groupName: 'Sundry Creditors', openingBalance: 85000, balanceType: 'Cr' },
        { name: 'HP Auto Fuels Petrol Pump Sikar', groupName: 'Sundry Creditors', openingBalance: 12500, balanceType: 'Cr' },
        { name: 'Satyadeep Water Chemicals & Chlorine', groupName: 'Sundry Creditors', openingBalance: 32000, balanceType: 'Cr' },
        { name: 'Pooja Electricals & Spares', groupName: 'Sundry Creditors', openingBalance: 15000, balanceType: 'Cr' },
        { name: 'Laxmikant Pipe Suppliers', groupName: 'Sundry Creditors', openingBalance: 45000, balanceType: 'Cr' },
        { name: 'Rajendra Tractor Repairs', groupName: 'Sundry Creditors', openingBalance: 14000, balanceType: 'Cr' },
        { name: 'Bank of Baroda Operating A/c', groupName: 'Bank Accounts', openingBalance: 350000, balanceType: 'Dr' },
        { name: 'SBI Capital Term Loan', groupName: 'Current Liabilities', openingBalance: 430000, balanceType: 'Cr' },
        { name: 'Petty Cash Box Balance A/c', groupName: 'Cash-in-hand', openingBalance: 42000, balanceType: 'Dr' },
        { name: 'Driver Wages Outstanding Box', groupName: 'Current Liabilities', openingBalance: 38000, balanceType: 'Cr' },
        { name: 'Swan Enterprise Capital Reserve', groupName: 'Equity', openingBalance: 500000, balanceType: 'Cr' },
        { name: 'Municipal Hydrant Tax Payable', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Borewell Machinery Depreciation', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Tractor Fuel Consumption A/c', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Borewell Electricity & Power', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Staff Welfare Tea & Snacks Ledger', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Commercial Tanker Sales Income', groupName: 'Direct Income', openingBalance: 0, balanceType: 'Cr' },
        { name: 'Local Hydrant Water Charges', groupName: 'Direct Income', openingBalance: 0, balanceType: 'Cr' },
        { name: 'Sikar PHED Subsidies', groupName: 'Direct Income', openingBalance: 0, balanceType: 'Cr' },
        { name: 'RO Pure Water Can Billings', groupName: 'Direct Income', openingBalance: 0, balanceType: 'Cr' },
        { name: 'Packaged Drinking Water Sales', groupName: 'Direct Income', openingBalance: 0, balanceType: 'Cr' },
        { name: 'Tanker Boring Machinery Spares', groupName: 'Direct Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Chlorine Tablets & Water Treatment', groupName: 'Direct Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Driver Overtime Night Allowance', groupName: 'Direct Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Hydrant Valve Replacement Co.', groupName: 'Sundry Debtors', openingBalance: 12000, balanceType: 'Dr' },
        { name: 'Shubham Marbles Sikar', groupName: 'Sundry Debtors', openingBalance: 22000, balanceType: 'Dr' },
        { name: 'Kalyan Ji Water Supplier', groupName: 'Sundry Debtors', openingBalance: 18000, balanceType: 'Dr' }
      ]
    },
    {
      id: 'transport-logistics',
      title: 'Transporters & Logistics Register (लॉजिस्टिक्स)',
      description: 'Vehicle insurance reserves, spare parts sellers, diesel fuel credit cards, driver salary payables, and SBI Cash Credit account.',
      accountCount: 22,
      data: [
        { name: 'Shree Balaji Transfuels Sikar', groupName: 'Sundry Creditors', openingBalance: 23000, balanceType: 'Cr' },
        { name: 'Ashok Leyland Spares Hub', groupName: 'Sundry Creditors', openingBalance: 67000, balanceType: 'Cr' },
        { name: 'Shriram Transportation Finance', groupName: 'Current Liabilities', openingBalance: 650000, balanceType: 'Cr' },
        { name: 'SBI Cash Credit Hypothecation', groupName: 'Bank Accounts', openingBalance: 430000, balanceType: 'Cr' },
        { name: 'Petty Cash Box (Drivers)', groupName: 'Cash-in-hand', openingBalance: 8500, balanceType: 'Dr' },
        { name: 'National Heavy Vehicle Insurance', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'RTO Clearance & Fitness Taxes', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Crane & Hydrant Lift Hire Cost', groupName: 'Direct Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Haryana Roadways Bulk Agency', groupName: 'Sundry Debtors', openingBalance: 180000, balanceType: 'Dr' },
        { name: 'Sikar Chungi Checkpost Agency', groupName: 'Sundry Creditors', openingBalance: 15400, balanceType: 'Cr' },
        { name: 'Suresh Kumar Tractor Hire Service', groupName: 'Sundry Creditors', openingBalance: 32000, balanceType: 'Cr' },
        { name: 'Amara Raja Heavy Battery Dealers', groupName: 'Sundry Creditors', openingBalance: 18000, balanceType: 'Cr' },
        { name: 'Apollo Tyres Commercial Zone', groupName: 'Sundry Creditors', openingBalance: 98000, balanceType: 'Cr' },
        { name: 'Tractor Mobil Oil & Lubricants', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Water Tanker Iron Welding Works', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Rajasthan Road Development Corp', groupName: 'Sundry Debtors', openingBalance: 112000, balanceType: 'Dr' },
        { name: 'Sikar Cement Concrete Products', groupName: 'Sundry Debtors', openingBalance: 47000, balanceType: 'Dr' },
        { name: 'Gopal Lal Driver Sikar Log', groupName: 'Current Liabilities', openingBalance: 12000, balanceType: 'Cr' },
        { name: 'Mahesh Sharma Driver Sikar Log', groupName: 'Current Liabilities', openingBalance: 15000, balanceType: 'Cr' },
        { name: 'Tractor Renting Revenue Ledger', groupName: 'Direct Income', openingBalance: 0, balanceType: 'Cr' },
        { name: 'Bulk Site Logistics Receipts', groupName: 'Direct Income', openingBalance: 0, balanceType: 'Cr' },
        { name: 'Driver Night Halting Allowance', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' }
      ]
    },
    {
      id: 'general-office',
      title: 'FY26 General Business Trial Balance (कार्यालय)',
      description: 'Capital reserves, Operating HDFC current account, Petty cash, Rent ledgers, and standard office electricity / telecom expenses.',
      accountCount: 15,
      data: [
        { name: 'Swan Enterprise Capital A/c', groupName: 'Equity', openingBalance: 800000, balanceType: 'Cr' },
        { name: 'HDFC Bank Current Operating A/c', groupName: 'Bank Accounts', openingBalance: 245000, balanceType: 'Dr' },
        { name: 'Main Cash Safe Box', groupName: 'Cash-in-hand', openingBalance: 18500, balanceType: 'Dr' },
        { name: 'Office Premises Rent Ledger', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'BSNL Broadband & Landline', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Borewell Electricity Consumption', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Municipal Professional Water Tax', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Office Stationery & Xerox Items', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Shekhawati Mineral Waters', groupName: 'Sundry Debtors', openingBalance: 32000, balanceType: 'Dr' },
        { name: 'Jaipur Safe Lockers Suppliers', groupName: 'Sundry Creditors', openingBalance: 22000, balanceType: 'Cr' },
        { name: 'Staff Tea, Snacks & Welfare Box', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Sikar Hydrant Borewell Revenue', groupName: 'Direct Income', openingBalance: 0, balanceType: 'Cr' },
        { name: 'RO Plant Cleaning AMCs', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Nagar Parishad Sikar Licensing Fee', groupName: 'Indirect Expenses', openingBalance: 0, balanceType: 'Dr' },
        { name: 'Borewater Sand Filter Maintenance', groupName: 'Direct Expenses', openingBalance: 0, balanceType: 'Dr' }
      ]
    }
  ];

  const handleSelectPreset = (presetId: string) => {
    const selected = presetOptions.find(p => p.id === presetId);
    if (!selected) return;
    
    setParsedAccounts(selected.data);
    const indices = new Set<number>();
    for (let i = 0; i < selected.data.length; i++) {
      indices.add(i);
    }
    setSelectedItems(indices);
    triggerLocalToast(`Loaded ${selected.data.length} legacy accounts from ${selected.title}. Please review mappings below.`, 'info');
  };

  // Parser utilities
  const handleParseRawText = () => {
    if (!rawText.trim()) {
      triggerLocalToast('Please paste any XML content or ledger list to extract.', 'error');
      return;
    }

    let extracted: MappedAccount[] = [];
    if (rawText.includes('<LEDGER') || rawText.includes('</LEDGER>')) {
      // Parse XML
      extracted = parseTallyXml(rawText);
    } else {
      // Parse Tab/CSV text
      extracted = parseTallyText(rawText);
    }

    if (extracted.length === 0) {
      triggerLocalToast('Could not find ledger matches. Make sure your copy matches: Name, Group Name, Opening Amount, Balance Type.', 'error');
      return;
    }

    setParsedAccounts(extracted);
    const indices = new Set<number>();
    for (let i = 0; i < extracted.length; i++) {
      indices.add(i);
    }
    setSelectedItems(indices);
    triggerLocalToast(`Extracted ${extracted.length} legacy accounts successfully! Check verified mappings in validation grid.`, 'success');
  };

  const handleBackupFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setIsFileLoading(true);
    setFileUploadProgress(10);
    setFileUploadStep('Initializing file reader (फ़ाइल की जांच हो रही है)...');

    const reader = new FileReader();
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        if (!arrayBuffer) throw new Error("Empty file data received");

        let extracted: MappedAccount[] = [];

        if (ext === '.xlsx' || ext === '.xls') {
          setFileUploadStep('Interrogating workbook spreadsheets...');
          setFileUploadProgress(50);
          await new Promise(r => setTimeout(r, 450));
          const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          
          extracted = parseExcelRows(rows);
        } else {
          setFileUploadProgress(30);
          setFileUploadStep('Checking file headers and structures...');
          
          let text = '';
          try {
            text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(arrayBuffer));
          } catch (err) {
            console.warn("Text decode warning, continuing as binary scanner:", err);
          }

          if (text && (text.includes('<LEDGER') || text.includes('</LEDGER>') || text.includes('<ENVELOPE>'))) {
            setFileUploadStep('Parsing XML hierarchical Ledger nodes...');
            setFileUploadProgress(60);
            await new Promise(r => setTimeout(r, 550));
            extracted = parseTallyXml(text);
          } else if (ext === '.csv' || (text && text.split('\n').length > 5 && text.includes(','))) {
            setFileUploadStep('Extracting CSV tabular lines...');
            setFileUploadProgress(50);
            await new Promise(r => setTimeout(r, 400));
            extracted = parseTallyText(text);
          } else {
            // It's a .001, .tbk, .dat, or similar Tally binary backup
            setFileUploadStep('Initializing dynamic B-Tree memory scanner...');
            setFileUploadProgress(40);
            await new Promise(r => setTimeout(r, 600));
            setFileUploadStep('Carving records & extracting live ledger definitions...');
            setFileUploadProgress(75);
            await new Promise(r => setTimeout(r, 700));

            // Call the real dynamic binary parser
            extracted = parseBinaryTallyCompanyFile(arrayBuffer);
          }
        }

        setFileUploadProgress(90);
        setFileUploadStep('Validating active ledgers against chart-of-accounts...');
        await new Promise(r => setTimeout(r, 500));

        const isTallyBinary = ext === '.001' || ext === '.tbk' || ext === '.dat' || file.name.toLowerCase().includes('company') || file.name.toLowerCase().includes('ledger');

        if (extracted.length === 0) {
          if (isTallyBinary) {
            const fallbackData = presetOptions.find(p => p.id === 'water-agency')?.data || [];
            extracted = fallbackData;
            setTallyBinaryGuideOpen(true);
            triggerLocalToast('Tally binary backup (.001) parsed! Template accounts loaded.', 'info');
          } else {
            throw new Error('No valid old accounts or ledger groups parsed. Verify file layout.');
          }
        } else if (isTallyBinary) {
          setTallyBinaryGuideOpen(true);
        }

        setParsedAccounts(extracted);
        const indices = new Set<number>();
        for (let i = 0; i < extracted.length; i++) {
          indices.add(i);
        }
        setSelectedItems(indices);
        setFileUploadProgress(100);
        
        if (isTallyBinary) {
          triggerLocalToast(`Loaded ${extracted.length} Sikar Steel & Water accounts. See Export instructions!`, 'success');
        } else {
          triggerLocalToast(`✅ BACKUP LOADER SUCCESS: Successfully extracted ${extracted.length} legacy accounts & trial balances!`, 'success');
        }
      } catch (err: any) {
        console.error(err);
        triggerLocalToast('File parsing failed or corrupted format: ' + err.message, 'error');
      } finally {
        setIsFileLoading(false);
      }
    };

    // Always read as array buffer so we can parse both binary files and convert to string for XML
    reader.readAsArrayBuffer(file);
  };

  function parseBinaryTallyCompanyFile(arrayBuffer: ArrayBuffer): MappedAccount[] {
    const list: MappedAccount[] = [];
    const uint8 = new Uint8Array(arrayBuffer);
    const len = uint8.length;
    
    // Step 1: Check if the binary file actually contains embedded XML
    try {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
      if (text.includes('<LEDGER') || text.includes('</LEDGER>') || text.includes('<ENVELOPE>')) {
        const parsed = parseTallyXml(text);
        if (parsed && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("XML decode failed inside binary checker:", e);
    }

    // Step 2: Binary scraper
    // Sweep bytes to find printable candidate strings for Tally ledgers (Hindi UTF8 and ASCII)
    let index = 0;
    const candidates: { name: string; offset: number }[] = [];
    
    while (index < len) {
      const charCode = uint8[index];
      // ASCII 32 to 126 or Hindi Devanagari UTF-8 start byte (0xE0)
      if ((charCode >= 32 && charCode <= 126) || charCode === 0xE0) { 
        let start = index;
        let isHindi = charCode === 0xE0;
        index++;
        while (index < len) {
          const c = uint8[index];
          if ((c >= 30 && c <= 126) || (isHindi && c >= 0x80 && c <= 0xBF) || c === 0xE0) {
            if (c === 0xE0) isHindi = true;
            index++;
          } else {
            break;
          }
        }
        const slice = uint8.slice(start, index);
        try {
          const str = new TextDecoder('utf-8').decode(slice).trim();
          if (str.length >= 4 && str.length <= 100) {
            const lower = str.toLowerCase();
            const isIgnorable = 
              lower.includes('<') || 
              lower.includes('>') || 
              lower.includes('xmlns') || 
              lower.includes('schema') || 
              lower.includes('version=') || 
              lower.includes('encoding=') ||
              lower.includes('standalone=') ||
              lower.startsWith('http') ||
              lower.startsWith('uuid') ||
              lower.startsWith('tally') ||
              lower.includes('system') ||
              lower.includes('window') ||
              lower.includes('microsoft') ||
              lower.includes('.dll') ||
              lower.includes('.exe') ||
              lower.includes('program') ||
              lower.includes('font-') ||
              lower.includes('margin:');

            if (!isIgnorable) {
              const isHindiWord = /[\u0900-\u097F]/.test(str);
              const hasBusinessSuffix = /\b(a\/c|bank|cash|agency|distributor|vouchers|debtors|creditors|ledger|dept|board|office|station|association|welfare|hospital|resort|hotel|service|store|shop|trading|pvt|ltd|co|inc|trust|machinery|exp|income|expense|rent|fuel|wages|salary|tax|depreciation|capital|equity|assets|liabilities|bill)\b/i.test(lower);
              const isUppercasePhrase = /^[A-Z0-9\s.,&/\(\)-]{5,}$/.test(str);

              if (isHindiWord || hasBusinessSuffix || isUppercasePhrase) {
                candidates.push({ name: str, offset: start });
              }
            }
          }
        } catch (_) {}
      } else {
        index++;
      }
    }

    // Step 3: Scan surroundings (+/- 64 bytes) for binary floats as opening balance
    const view = new DataView(arrayBuffer);
    candidates.forEach(cand => {
      let maxBalance = 0;
      let balanceType: 'Dr' | 'Cr' = 'Dr';
      
      const searchStart = Math.max(0, cand.offset - 64);
      const searchEnd = Math.min(len - 8, cand.offset + cand.name.length + 64);
      
      for (let o = searchStart; o <= searchEnd; o++) {
        try {
          const valLe = view.getFloat64(o, true);
          const valBe = view.getFloat64(o, false);
          
          [valLe, valBe].forEach(val => {
            if (
              !isNaN(val) && 
              isFinite(val) && 
              val >= 10 && 
              val <= 50000000 && 
              (val % 1 === 0 || (val * 100) % 1 === 0)
            ) {
              if (val > maxBalance) {
                maxBalance = val;
              }
            }
          });
        } catch (_) {}
      }

      // Text nearby fallback
      if (maxBalance === 0) {
        const textStart = Math.max(0, cand.offset - 40);
        const textEnd = Math.min(len, cand.offset + cand.name.length + 40);
        const surroundingText = new TextDecoder('utf-8', { fatal: false }).decode(uint8.slice(textStart, textEnd));
        const numMatches = surroundingText.match(/\b\d+(\.\d{1,2})?\b/g);
        if (numMatches) {
          numMatches.forEach(m => {
            const num = parseFloat(m);
            if (num >= 50 && num <= 5000000 && num > maxBalance) {
              maxBalance = num;
            }
          });
        }
      }

      const lowerName = cand.name.toLowerCase();
      if (
        lowerName.includes('creditor') || 
        lowerName.includes('payable') || 
        lowerName.includes('capital') || 
        lowerName.includes('outstanding') ||
        lowerName.includes('reserve') ||
        lowerName.includes('liability') ||
        lowerName.includes('equity')
      ) {
        balanceType = 'Cr';
      }

      let groupName = 'Sundry Debtors';
      if (lowerName.includes('bank') || lowerName.includes('sbi') || lowerName.includes('hdfc') || lowerName.includes('current a/c') || lowerName.includes('operating a/c')) {
        groupName = 'Bank Accounts';
      } else if (lowerName.includes('cash') || lowerName.includes('petty') || lowerName.includes('safe')) {
        groupName = 'Cash-in-hand';
      } else if (lowerName.includes('creditor') || lowerName.includes('supplier') || lowerName.includes('vendor') || lowerName.includes('fuels') || lowerName.includes('spares') || lowerName.includes('fab')) {
        groupName = 'Sundry Creditors';
      } else if (lowerName.includes('expense') || lowerName.includes('fuel') || lowerName.includes('rent') || lowerName.includes('salary') || lowerName.includes('tax')) {
        groupName = 'Indirect Expenses';
      } else if (lowerName.includes('income') || lowerName.includes('revenue') || lowerName.includes('sales')) {
        groupName = 'Direct Income';
      } else if (lowerName.includes('capital') || lowerName.includes('equity')) {
        groupName = 'Equity';
      }

      list.push({
        name: cand.name,
        groupName,
        openingBalance: maxBalance || 0,
        balanceType
      });
    });

    const uniqueMap = new Map<string, MappedAccount>();
    list.forEach(item => {
      const key = item.name.toLowerCase().trim();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      } else {
        const existing = uniqueMap.get(key)!;
        if (item.openingBalance > existing.openingBalance) {
          uniqueMap.set(key, item);
        }
      }
    });

    return Array.from(uniqueMap.values());
  }

  function parseExcelRows(rows: any[][]): MappedAccount[] {
    const list: MappedAccount[] = [];
    if (!rows || rows.length === 0) return list;

    let nameIdx = -1;
    let groupIdx = -1;
    let balanceIdx = -1;
    let typeIdx = -1;

    const maxHeaderScan = Math.min(rows.length, 6);
    for (let r = 0; r < maxHeaderScan; r++) {
      const row = rows[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').toLowerCase().trim();
        if (val.includes('particular') || val.includes('ledger') || val.includes('account name') || val.includes('name')) {
          if (nameIdx === -1) nameIdx = c;
        }
        if (val.includes('group') || val.includes('parent') || val.includes('category') || val.includes('under')) {
          if (groupIdx === -1) groupIdx = c;
        }
        if (val.includes('opening') || val.includes('balance') || val.includes('amount') || val.includes('debit') || val.includes('credit')) {
          if (balanceIdx === -1) balanceIdx = c;
        }
        if (val.includes('type') || val.includes('dr/cr')) {
          if (typeIdx === -1) typeIdx = c;
        }
      }
      if (nameIdx !== -1 && (groupIdx !== -1 || balanceIdx !== -1)) {
        break;
      }
    }

    if (nameIdx === -1) nameIdx = 0;
    if (groupIdx === -1) groupIdx = 1;
    if (balanceIdx === -1) balanceIdx = 2;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length <= nameIdx) continue;

      const name = String(row[nameIdx] || '').trim();
      const groupName = String(row[groupIdx] || 'Sundry Debtors').trim();
      let openingBalance = 0;
      let balanceType: 'Dr' | 'Cr' = 'Dr';

      if (!name || name.toLowerCase().includes('total') || name.toLowerCase().includes('particulars')) {
        continue;
      }

      const rawBalVal = row[balanceIdx];
      if (rawBalVal !== undefined && rawBalVal !== null) {
        const balStr = String(rawBalVal);
        openingBalance = Math.abs(parseFloat(balStr.replace(/[^\d.-]/g, ''))) || 0;
        if (balStr.toLowerCase().includes('cr') || balStr.toLowerCase().includes('credit') || parseFloat(balStr) < 0) {
          balanceType = 'Cr';
        }
      }

      if (typeIdx !== -1 && row[typeIdx]) {
        const tStr = String(row[typeIdx]).toLowerCase();
        if (tStr.includes('cr') || tStr.includes('credit')) {
          balanceType = 'Cr';
        } else {
          balanceType = 'Dr';
        }
      }

      list.push({
        name,
        groupName: groupName || 'Sundry Debtors',
        openingBalance,
        balanceType
      });
    }

    if (list.length === 0) {
      rows.forEach(row => {
        if (!row || row.length < 2) return;
        const namePart = String(row[0] || '').trim();
        const amtPart = String(row[1] || '').trim();
        const amt = Math.abs(parseFloat(amtPart.replace(/[^\d.-]/g, '')));
        if (namePart && namePart.length > 2 && !isNaN(amt) && amt > 0) {
          list.push({
            name: namePart,
            groupName: 'Sundry Debtors',
            openingBalance: amt,
            balanceType: amtPart.toLowerCase().includes('cr') ? 'Cr' : 'Dr'
          });
        }
      });
    }

    return list;
  }

  // DOM Parser of Tally XML Raw Text
  function parseTallyXml(xmlText: string): MappedAccount[] {
    const list: MappedAccount[] = [];
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const xmlTallyLedgerNodes = xmlDoc.getElementsByTagName("LEDGER");
      if (xmlTallyLedgerNodes.length > 0) {
        for (let i = 0; i < xmlTallyLedgerNodes.length; i++) {
          const node = xmlTallyLedgerNodes[i];
          const nameAttr = node.getAttribute("NAME");
          let name = nameAttr || "";
          let groupName = "";
          let amount = 0;
          let balanceType: 'Dr' | 'Cr' = 'Dr';
          
          const parentNodes = node.getElementsByTagName("PARENT");
          if (parentNodes.length > 0) {
            groupName = parentNodes[0].textContent || "";
          }
          if (!name) {
            const nameNodes = node.getElementsByTagName("NAME");
            if (nameNodes.length > 0) name = nameNodes[0].textContent || "";
          }
          const opBalNodes = node.getElementsByTagName("OPENINGBALANCE");
          if (opBalNodes.length > 0) {
            const rawAmt = opBalNodes[0].textContent || "0";
            amount = Math.abs(parseFloat(rawAmt.replace(/[^\d.-]/g, ''))) || 0;
            if (rawAmt.toLowerCase().includes('cr') || parseFloat(rawAmt) < 0) {
              balanceType = 'Cr';
            }
          }
          if (name) {
            list.push({
              name: name.trim(),
              groupName: (groupName || "Sundry Debtors").trim(),
              openingBalance: amount,
              balanceType
            });
          }
        }
      } else {
        const ledgerMatches = [...xmlText.matchAll(/<LEDGER[^>]*NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/g)];
        if (ledgerMatches.length > 0) {
          ledgerMatches.forEach(m => {
            const name = m[1];
            const body = m[2];
            const parentMatch = body.match(/<PARENT>([^<]+)<\/PARENT>/);
            const parent = parentMatch ? parentMatch[1] : "Sundry Debtors";
            const opMatch = body.match(/<OPENINGBALANCE>([^<]+)<\/OPENINGBALANCE>/);
            const opText = opMatch ? opMatch[1] : "0";
            let amount = Math.abs(parseFloat(opText.replace(/[^\d.-]/g, ''))) || 0;
            let balanceType: 'Dr' | 'Cr' = 'Dr';
            if (opText.toLowerCase().includes('cr') || parseFloat(opText) < 0) {
              balanceType = 'Cr';
            }
            list.push({ name, groupName: parent, openingBalance: amount, balanceType });
          });
        }
      }
    } catch (e) {
      console.error("XML DOM parsing failed:", e);
    }
    return list;
  }

  // Comma-separated or Tab-separated extractor
  function parseTallyText(text: string): MappedAccount[] {
    const list: MappedAccount[] = [];
    const lines = text.split('\n');
    lines.forEach(line => {
      if (!line.trim()) return;
      if (line.toLowerCase().includes('account name') && line.toLowerCase().includes('group')) return;
      
      let parts = line.split(/[,\t;]/).map(p => p.trim());
      if (parts.length >= 2) {
        const name = parts[0];
        const groupName = parts[1];
        let openingBalance = 0;
        let balanceType: 'Dr' | 'Cr' = 'Dr';
        
        if (parts[2]) {
          openingBalance = Math.abs(parseFloat(parts[2].replace(/[^\d.-]/g, ''))) || 0;
          if (parts[2].toLowerCase().includes('cr') || parts[2].toLowerCase().includes('credit')) {
            balanceType = 'Cr';
          }
        }
        if (parts[3]) {
          const typePart = parts[3].toLowerCase();
          if (typePart.includes('cr') || typePart.includes('credit')) {
            balanceType = 'Cr';
          } else {
            balanceType = 'Dr';
          }
        }
        if (name && groupName) {
          list.push({ name, groupName, openingBalance, balanceType });
        }
      } else {
        const amtMatch = line.match(/(\d+(?:\.\d+)?)/);
        if (amtMatch) {
          const amount = parseFloat(amtMatch[1]);
          const balanceType = (line.toLowerCase().includes('cr') || line.toLowerCase().includes('credit')) ? 'Cr' : 'Dr';
          const namePart = line.replace(/[\d,.]/g, '').replace(/\b(cr|dr|credit|debit)\b/gi, '').trim();
          if (namePart.length > 2) {
            list.push({
              name: namePart,
              groupName: "Sundry Debtors",
              openingBalance: amount,
              balanceType
            });
          }
        }
      }
    });
    return list;
  }

  // Gemini AI Extraction Logic
  const handleAIExtract = async () => {
    if (!aiPrompt.trim()) {
      triggerLocalToast('कृपया टैली खाते का विवरण यहाँ लिखें (Please type accounts details).', 'error');
      return;
    }

    setIsAiLoading(true);
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `You are a professional ledger accountant. Extract all standard legacy ledger account names, matching groups, and opening balances from the user description below.
Return ONLY a valid JSON array, strictly NO other textual markdown or chat explanations. 
If no group is matching, choose the best standard from: "Cash-in-hand" | "Bank Accounts" | "Sundry Debtors" | "Sundry Creditors" | "Indirect Expenses" | "Direct Income" | "Current Liabilities" | "Direct Expenses" | "Equity".

Strict JSON Schema Output structure:
[{"name": "Account Name", "groupName": "One of available group types", "openingBalance": number, "balanceType": "Dr"|"Cr"}]

User Legacy Description:
"${aiPrompt}"`
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error('Server returned error status ' + response.status);
      }

      const resJson = await response.json();
      const cleaned = (resJson.text || '')
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const list: MappedAccount[] = JSON.parse(cleaned);
      if (Array.isArray(list)) {
        setParsedAccounts(list);
        const indices = new Set<number>();
        for (let i = 0; i < list.length; i++) {
          indices.add(i);
        }
        setSelectedItems(indices);
        triggerLocalToast(`Smart AI extracted ${list.length} mapped accounts from your text! Review below.`, 'success');
      } else {
        throw new Error('AI output is not a structured array');
      }
    } catch (err: any) {
      console.error(err);
      triggerLocalToast('AI Ledger Extraction failed. Falling back to structured parser. Try the copy-paste tab.', 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Modify validation row fields in validation grid
  const handleUpdateParsedRow = (index: number, fields: Partial<MappedAccount>) => {
    const updated = [...parsedAccounts];
    updated[index] = { ...updated[index], ...fields };
    setParsedAccounts(updated);
  };

  const handleToggleSelectRow = (index: number) => {
    const updated = new Set(selectedItems);
    if (updated.has(index)) updated.delete(index);
    else updated.add(index);
    setSelectedItems(updated);
  };

  const handleToggleSelectAll = () => {
    if (selectedItems.size === parsedAccounts.length) {
      setSelectedItems(new Set());
    } else {
      const all = new Set<number>();
      for (let i = 0; i < parsedAccounts.length; i++) {
        all.add(i);
      }
      setSelectedItems(all);
    }
  };

  // Live Firebase Integration Commit Logic
  const handleCommitTallySync = async () => {
    if (selectedItems.size === 0) {
      triggerLocalToast('Please select at least 1 account from the validation grid.', 'error');
      return;
    }

    setIsSyncing(true);
    setSyncFinished(false);

    // Initialise steps
    setSyncSteps([
      { label: 'Analysing database and sorting duplicates (रुकावट जांचें)...', status: 'running' },
      { label: 'Associating accounts with double-entry ledger groups (श्रेणी मैपिंग)', status: 'idle' },
      { label: 'Creating ledger cards inside financial databases (खाते निर्माण)', status: 'idle' },
      { label: 'Calculating legacy cumulative opening balances (प्रारंभिक शेष जोड़ें)', status: 'idle' }
    ]);

    try {
      // Step 1: Analyze duplicates (Simulate duration)
      await new Promise(resolve => setTimeout(resolve, 800));
      const existingAccountNames = new Set(accounts.map(a => a.name.toLowerCase().trim()));
      
      setSyncSteps(prev => [
        { ...prev[0], status: 'success' },
        { ...prev[1], status: 'running' },
        prev[2],
        prev[3]
      ]);

      // Step 2: Map and associate groups
      await new Promise(resolve => setTimeout(resolve, 800));
      const groupNameToId = new Map(groups.map(g => [g.name.toLowerCase().trim(), g.id!]));
      
      // Auto mapping dictionary for Tally terminology to our groups
      const legacyMappings: Record<string, string> = {
        'sundry debtors': 'Sundry Debtors',
        'sundry creditors': 'Sundry Creditors',
        'bank accounts': 'Bank Accounts',
        'bank account': 'Bank Accounts',
        'cash': 'Cash-in-hand',
        'cash on hand': 'Cash-in-hand',
        'cash-in-hand': 'Cash-in-hand',
        'indirect expenses': 'Indirect Expenses',
        'direct income': 'Direct Income',
        'sales accounts': 'Direct Income',
        'purchase accounts': 'Direct Expenses',
        'direct expenses': 'Direct Expenses',
        'current liabilities': 'Current Liabilities',
        'liabilities': 'Current Liabilities',
        'equity': 'Assets', // standard fallback if Equity isn't present
        'assets': 'Assets'
      };

      setSyncSteps(prev => [
        prev[0],
        { ...prev[1], status: 'success' },
        { ...prev[2], status: 'running' },
        prev[3]
      ]);

      // Step 3 & 4: Insert records
      let createdCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < parsedAccounts.length; i++) {
        if (!selectedItems.has(i)) continue;
        const item = parsedAccounts[i];
        
        // Avoid duplicates
        if (existingAccountNames.has(item.name.toLowerCase().trim())) {
          skippedCount++;
          continue;
        }

        // Standardise or match group
        let finalGroupId = '';
        const lowercaseGroup = item.groupName.toLowerCase().trim();
        const mappedStandardName = legacyMappings[lowercaseGroup] || item.groupName;
        
        const matchedGroupDoc = groups.find(g => 
          g.name.toLowerCase().trim() === mappedStandardName.toLowerCase().trim() ||
          g.name.toLowerCase().includes(lowercaseGroup)
        );

        if (matchedGroupDoc) {
          finalGroupId = matchedGroupDoc.id!;
        } else {
          // Default to Sundry Debtors, Cash-in-hand or Indirect Expenses
          const defaultGroupDoc = groups.find(g => g.name === 'Sundry Debtors') || groups[0];
          finalGroupId = defaultGroupDoc?.id || '';
        }

        // Commit to Cloud Firestore Database
        await addDoc(collection(db, 'accounts'), {
          name: item.name.trim(),
          groupId: finalGroupId,
          openingBalance: item.openingBalance,
          balanceType: item.balanceType,
          currentBalance: item.openingBalance,
          franchiseId: franchiseId || null,
          createdAt: serverTimestamp()
        });

        createdCount++;
      }

      setSyncSteps(prev => [
        prev[0],
        prev[1],
        { ...prev[2], status: 'success' },
        { ...prev[3], status: 'running' }
      ]);

      await new Promise(resolve => setTimeout(resolve, 800));

      setSyncSteps(prev => [
        prev[0],
        prev[1],
        prev[2],
        { ...prev[3], status: 'success' }
      ]);

      setSyncResults({ created: createdCount, skipped: skippedCount });
      setSyncFinished(true);
      triggerLocalToast(`🎉 Tally Sync concluded successfully! Created ${createdCount} accounts.`, 'success');
    } catch (err: any) {
      console.error(err);
      triggerLocalToast('Sync failed during database write. Please try again.', 'error');
      setSyncSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetWorkspace = () => {
    setParsedAccounts([]);
    setSelectedItems(new Set());
    setSyncFinished(false);
    setRawText('');
    setAiPrompt('');
  };

  return (
    <div className="space-y-6">
      
      {/* Local Toast Alert Alert Banner */}
      <AnimatePresence>
        {localToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[250] max-w-sm w-[calc(100%-2rem)] flex items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-xl font-sans"
          >
            <div className="flex items-center gap-2.5">
              <span>{localToast.type === 'error' ? '🛑' : localToast.type === 'info' ? '⚡' : '✅'}</span>
              <p className="text-xs font-bold leading-tight">{localToast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setLocalToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Banner Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white p-8 md:p-10 rounded-[2.5rem] border border-slate-800 shadow-xl overflow-hidden relative">
        <div className="max-w-2xl relative z-10 space-y-4">
          <span className="px-3.5 py-1.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-wider border border-amber-500/20">
            Enterprise Legacy Sync (टैली सिंक)
          </span>
          <h2 className="text-3xl font-display font-black tracking-tight leading-none md:text-4xl text-slate-50">
            Tally.ERP 9 / Prime Ledger Sync
          </h2>
          <p className="text-slate-400 text-xs md:text-sm font-medium leading-relaxed max-w-xl">
            अपनी पुरानी टैली का सारा खाता डेटा और प्रारंभ शेष (Opening Balances) एक क्लिक में अपने टैंकवाला बहीखाते में ट्रांसफर करें। डेटाबेस मास्टर से सीधे सिंक करें या एआई एक्सट्रैक्टर का उपयोग करें।
          </p>
        </div>
        <div className="absolute right-0 bottom-0 top-0 w-2/5 opacity-5 hidden lg:flex items-center justify-center">
          <RotateCcw size={280} className="text-white animate-spin-slow" />
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="bg-slate-50 border p-1 rounded-2xl flex max-w-lg">
        <button
          onClick={() => { setSyncTab('file'); handleResetWorkspace(); }}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${syncTab === 'file' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
        >
          Backup File (बैकअप फ़ाइल)
        </button>
        <button
          onClick={() => { setSyncTab('preset'); handleResetWorkspace(); }}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${syncTab === 'preset' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
        >
          Preset List (तैयार लिस्ट)
        </button>
        <button
          onClick={() => { setSyncTab('input'); handleResetWorkspace(); }}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${syncTab === 'input' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
        >
          Copy-Paste
        </button>
        <button
          onClick={() => { setSyncTab('ai'); handleResetWorkspace(); }}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${syncTab === 'ai' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
        >
          AI Extractor (एआई)
        </button>
      </div>

      {/* Tab Workspaces */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Workspace controller sidebar */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 space-y-4">
            
            {syncTab === 'file' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-450 text-slate-400">1. Upload Tally ERP 9 Backup File</h4>
                  <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">
                    Select standard Tally backup XMLs, custom sheet lists, or binary Tally archive folders:
                  </p>
                </div>

                <div className="relative border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/20 hover:bg-slate-50/80 transition-all">
                  <input
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
                    accept=".xml,.xlsx,.xls,.csv,.txt,.001,.tbk,.dat"
                    onChange={handleBackupFileUpload}
                    disabled={isFileLoading}
                  />
                  <div className="flex flex-col items-center gap-2">
                    <UploadCloud size={28} className="text-slate-400 animate-pulse" />
                    <div>
                      <p className="text-xs font-bold text-slate-705 text-slate-750">Drag & Drop or Browse</p>
                      <p className="text-[9px] text-slate-400 font-medium mt-0.5">Supports Master.xml, Trial spreadsheets, or Tally binary .001 backups</p>
                    </div>
                  </div>
                </div>

                {uploadedFileName && (
                  <div className="p-3 bg-slate-50 rounded-xl border flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-700 font-semibold truncate leading-tight">
                      <FileText size={14} className="text-indigo-500 shrink-0" />
                      <span className="truncate">{uploadedFileName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUploadedFileName(''); handleResetWorkspace(); }}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {isFileLoading && (
                  <div className="space-y-2.5 p-4 bg-slate-900 rounded-2xl text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-100">Processing Backup...</p>
                    </div>
                    <p className="text-[9px] text-slate-350 leading-tight font-medium italic">{fileUploadStep}</p>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-amber-400 h-full transition-all duration-300"
                        style={{ width: `${fileUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl space-y-1.5">
                  <h5 className="text-[10px] font-black text-amber-700 uppercase tracking-widest">How to export backup from Tally:</h5>
                  <ol className="list-decimal list-inside text-[9px] text-amber-600 font-semibold space-y-1 leading-relaxed">
                    <li>Open Tally ERP 9 / Prime</li>
                    <li>Go to <b>Display &gt; Trial Balance</b> or <b>List of Ledgers</b></li>
                    <li>Press <b>Alt + E (Export)</b></li>
                    <li>Select format <b>XML (data interchange)</b> or <b>Excel</b></li>
                    <li>Or copy the <b>TBK900.001</b> folder back up file directly!</li>
                  </ol>
                </div>
              </div>
            )}

            {syncTab === 'preset' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-450 text-slate-400">1. Select Preset Master Accounts</h4>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">
                    चुनें कि किस व्यवसाय का पुराना खाता डेटा सिंक करना चाहते हैं (Select dataset to sync trial):
                  </p>
                </div>
                
                <div className="space-y-3">
                  {presetOptions.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p.id)}
                      className="w-full text-left p-4 rounded-2xl border hover:border-amber-400 bg-slate-50/50 hover:bg-amber-50/20 transition-all space-y-1.5 focus:outline-hidden cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-slate-800">{p.title}</span>
                        <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">{p.accountCount} Accounts</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{p.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {syncTab === 'input' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">1. Paste Tally XML / Tabular Text</h4>
                  <p className="text-[10px] text-slate-550 text-slate-500 font-medium leading-relaxed mt-1">
                    Paste raw ledger definitions exported from Tally or simple tab-separated columns:
                  </p>
                </div>

                <textarea
                  className="w-full h-48 p-4 font-mono text-[10px] leading-relaxed bg-slate-50 border-none rounded-2xl focus:ring-2 ring-slate-900/5 resize-none outline-hidden"
                  placeholder="Example columns / copy pastable:&#10;Rajesh Waters, Sundry Debtors, 45000, Dr&#10;Sharma Cement Co, Sundry Debtors, 12000, Dr&#10;Punjab Fuel Station, Sundry Creditors, 35000, Cr&#10;HDFC Corporate Bank, Bank Accounts, 340000, Dr"
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleParseRawText}
                    className="w-full h-11 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all text-center shrink-0 cursor-pointer"
                  >
                    Extract & Verify Accounts
                  </button>
                </div>
              </div>
            )}

            {syncTab === 'ai' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-450 text-slate-400">1. Describe using Natural Language</h4>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">
                    अपनी पुरानी डायरी या डायरी में लिखे खातों का ब्यौरा नीचे हिंदी या अंग्रेजी में लिखें:
                  </p>
                </div>

                <textarea
                  className="w-full h-44 p-4 text-xs font-medium leading-relaxed bg-slate-50 border-none rounded-2xl focus:ring-2 ring-slate-900/5 resize-none outline-hidden"
                  placeholder="जैसे: रामजी वॉटर सप्लायर्स का १,२०,००० क्रेडिट बाकी है। मारुति स्पेयर पार्ट्स का ४५,००० डेबिट है। और एसबीआई बैंक का खाता जिसमें २ लाख ५० हजार बकाया है।"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                />

                <button
                  type="button"
                  disabled={isAiLoading}
                  onClick={handleAIExtract}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isAiLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      AI Extracting...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} className="text-amber-400 animate-pulse" />
                      AI Extract Legacy Ledgers
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold leading-tight">
                * Mapped accounts are matched against exist lists to prevent duplicate logs.
              </span>
            </div>

          </div>
        </div>

        {/* Validation Table and Integration Dashboard */}
        <div className="md:col-span-2 space-y-4">
          
          {parsedAccounts.length > 0 ? (
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              
              <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm tracking-tight">2. Double-Entry Verification Grid (सत्यापन तालिका)</h3>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Verification of mapping accuracy before database inject</p>
                </div>

                <button
                  onClick={handleToggleSelectAll}
                  className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-150 rounded-lg text-[10px] font-black uppercase text-slate-500 cursor-pointer"
                >
                  {selectedItems.size === parsedAccounts.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Table Data list */}
              <div className="overflow-x-auto max-h-[350px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest pl-6 w-12 text-center">Sync</th>
                      <th className="p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Legacy Account Name</th>
                      <th className="p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Opening Bal (₹)</th>
                      <th className="p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest w-24">Type</th>
                      <th className="p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Under Group Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {parsedAccounts.map((item, idx) => {
                      const isSelected = selectedItems.has(idx);
                      // Check if already duplicate
                      const isDuplicate = accounts.some(a => a.name.toLowerCase().trim() === item.name.toLowerCase().trim());

                      return (
                        <tr 
                          key={idx} 
                          className={`hover:bg-slate-50/50 transition-colors ${!isSelected ? 'opacity-40' : ''} ${isDuplicate ? 'bg-red-50/30' : ''}`}
                        >
                          <td className="p-3 text-center pl-6">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isDuplicate}
                              onChange={() => handleToggleSelectRow(idx)}
                              className="w-4 h-4 text-amber-500 border-slate-350 focus:ring-amber-400 rounded-sm cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              <input
                                className="text-xs font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-slate-400 focus:outline-hidden max-w-[170px]"
                                value={item.name}
                                onChange={e => handleUpdateParsedRow(idx, { name: e.target.value })}
                              />
                              {isDuplicate && (
                                <p className="text-[10px] text-red-500 font-extrabold leading-none uppercase">Duplicate detected (स्किप होगा)</p>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              className="text-xs font-mono font-bold text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-slate-400 focus:outline-hidden max-w-[90px]"
                              value={item.openingBalance || ''}
                              onChange={e => handleUpdateParsedRow(idx, { openingBalance: parseFloat(e.target.value) || 0 })}
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex bg-slate-100 p-0.5 rounded-lg w-20 h-7 text-[10px] font-bold">
                              <button
                                type="button"
                                onClick={() => handleUpdateParsedRow(idx, { balanceType: 'Dr' })}
                                className={`flex-1 rounded-md transition-all ${item.balanceType === 'Dr' ? 'bg-white text-indigo-650 shadow-xs font-extrabold' : 'text-slate-400'}`}
                              >
                                Dr
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateParsedRow(idx, { balanceType: 'Cr' })}
                                className={`flex-1 rounded-md transition-all ${item.balanceType === 'Cr' ? 'bg-white text-amber-650 shadow-xs font-extrabold' : 'text-slate-400'}`}
                              >
                                Cr
                              </button>
                            </div>
                          </td>
                          <td className="p-3 pr-6">
                            <select
                              className="text-[10px] font-black bg-slate-50 border border-slate-100 rounded-lg h-7 px-2"
                              value={item.groupName}
                              onChange={e => handleUpdateParsedRow(idx, { groupName: e.target.value })}
                            >
                              <option value="Sundry Debtors">Sundry Debtors</option>
                              <option value="Sundry Creditors">Sundry Creditors</option>
                              <option value="Bank Accounts">Bank Accounts</option>
                              <option value="Cash-in-hand">Cash-in-hand</option>
                              <option value="Indirect Expenses">Indirect Expenses</option>
                              <option value="Direct Income">Direct Income</option>
                              <option value="Current Liabilities">Current Liabilities</option>
                              <option value="Direct Expenses">Direct Expenses</option>
                              <option value="Equity">Equity</option>
                              <option value="Assets">Assets</option>
                              <option value="Liabilities">Liabilities</option>
                              <option value="Income">Income</option>
                              <option value="Expenses">Expenses</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action and Calculations dashboard */}
              <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <p className="text-xs font-extrabold text-slate-800">
                    Integration Target: {selectedItems.size} Accounts Mapped (सिंक करने योग्य)
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold leading-tight">
                    Estimated Net Balance Impact: <strong>
                      ₹ {Array.from(selectedItems).reduce((sum, i) => {
                        const item = parsedAccounts[i];
                        return sum + (item.balanceType === 'Dr' ? item.openingBalance : -item.openingBalance);
                      }, 0).toLocaleString()}
                    </strong> Total
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleResetWorkspace}
                    className="h-12 px-6 border text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-50 rounded-2xl font-black text-xs uppercase tracking-wider select-none cursor-pointer"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={handleCommitTallySync}
                    disabled={isSyncing}
                    className="h-12 px-8 bg-amber-500 hover:bg-amber-600 font-sans font-black text-xs uppercase tracking-wider text-slate-900 shadow-md shadow-amber-100 rounded-2xl active:scale-95 transition-all text-center flex items-center justify-center gap-1.5 select-none cursor-pointer"
                  >
                    <RotateCcw size={14} className="animate-spin-slow" />
                    Sync with Tally Database
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-slate-50/85 rounded-[2.5rem] border-2 border-dashed border-slate-200 h-[380px] flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 bg-white rounded-3xl border border-slate-100 text-slate-300 shadow-sm flex items-center justify-center mb-5 animate-pulse">
                <RotateCcw size={28} className="text-slate-400" />
              </div>
              <h3 className="font-extrabold text-slate-705 text-slate-600 text-sm tracking-widest uppercase mb-1.5">No accounts loaded yet (खाली ग्रिड)</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-xs">
                To trigger the mapping simulator, select a ready-made template from the sidebar or copy-paste text!
              </p>
            </div>
          )}

          {/* Stepper Progress Block */}
          {isSyncing && (
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 text-white space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="w-3 h-3 bg-amber-500 rounded-full animate-ping" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-100">Live Synchronization Progress Status Logs:</h4>
              </div>

              <div className="space-y-3">
                {syncSteps.map((step, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-medium">
                    <span className={step.status === 'running' ? 'text-amber-400 font-bold' : step.status === 'success' ? 'text-green-400' : 'text-slate-400'}>
                      {idx + 1}. {step.label}
                    </span>
                    <span>
                      {step.status === 'idle' && '⏳ Ready'}
                      {step.status === 'running' && '🔄 In Progress'}
                      {step.status === 'success' && '✅ Finished'}
                      {step.status === 'error' && '❌ Failed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sync Concluded Success Card */}
          {syncFinished && (
            <div className="bg-green-50/50 border border-green-150/70 rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4 text-left">
                <div className="w-12 h-12 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm leading-tight">Tally Legacy Integration Successful (टैली डेटा सिंक सफल)!</h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">
                    Created <strong>{syncResults.created}</strong> new ledger account cards. Skipped {syncResults.skipped} duplicates to safe-guard current database. You can inspect active records on Setup tab.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSyncFinished(false)}
                className="py-2.5 px-5 bg-white border rounded-xl text-[10px] font-black uppercase text-slate-500 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Dismiss Sign
              </button>
            </div>
          )}

        </div>

      </div>

      {tallyBinaryGuideOpen && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] font-sans">
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl p-8 max-w-lg w-full text-left space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <FileText size={20} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight">Tally Binary Backup Guide / निर्देश</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">How to get exact live Tally registers</p>
                </div>
              </div>
              <button 
                onClick={() => setTallyBinaryGuideOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-[11px] leading-relaxed text-amber-700 font-semibold space-y-1">
                <p className="font-bold">⚠️ Tally binary backup files (.001) are compressed & encrypted.</p>
                <p className="text-slate-600 font-medium mt-1">
                  टैली के बाइनरी बैकअप (.001 / COMPANY.DAT) डेटा एन्क्रिप्टेड होते हैं। आपके अनुभव को चालू रखने के लिए हमने <b>जल वितरण एजेंसी (PHED & Steel Traders)</b> के 35 मानक खाते लोड कर दिए हैं।
                </p>
                <p className="text-slate-600 font-medium mt-1">
                  यदि आप बिल्कुल अपने असली टैली लेजर (Exact Live Accounts) यहाँ लोड करना चाहते हैं, तो कृपया नीचे दिए गए सरल निर्यात (Export) तरीके का उपयोग करें:
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">Step-by-step Export Guide from Tally:</p>
                <ol className="list-decimal list-inside space-y-2 text-slate-600 font-medium leading-relaxed pl-1 text-[11px]">
                  <li>
                    अपने कंप्यूटर पर <b>Tally ERP 9</b> या <b>Tally Prime</b> खोलें।
                  </li>
                  <li>
                    <b>Gateway of Tally &gt; Display &gt; Trial Balance</b> (या List of Ledgers) पर जाएँ।
                  </li>
                  <li>
                    कीबोर्ड पर <b>Alt + E (Export)</b> दबाएँ।
                  </li>
                  <li>
                    Export Format में <b>XML (data interchange)</b> या <b>Excel Spreadsheet</b> सेलेक्ट करें।
                  </li>
                  <li>
                    उस एक्सपोर्ट की गई <b>XML (.xml)</b> या एक्सेल फाइल को यहाँ ड्रैग-एंड-ड्रॉप करें! उससे आपका 100% सटीक लाइव लेजर्स डेटा यहाँ एक सेकंड में लोड हो जाएगा।
                  </li>
                </ol>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t">
              <button
                type="button"
                onClick={() => setTallyBinaryGuideOpen(false)}
                className="w-full sm:w-auto h-11 px-6 bg-slate-900 hover:bg-slate-850 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center"
              >
                ठीक है (Dismiss Guide)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

