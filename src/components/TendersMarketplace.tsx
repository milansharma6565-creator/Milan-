import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Briefcase, 
  Search, 
  MapPin, 
  Building2, 
  Calendar, 
  DollarSign, 
  Compass, 
  ArrowRight, 
  ExternalLink,
  Loader2,
  Bookmark,
  CheckCircle,
  Share2,
  FileSpreadsheet,
  FileCheck,
  Award,
  UploadCloud,
  FileDown,
  Trash2,
  Edit2,
  Plus,
  X,
  FileText,
  Check,
  AlertCircle,
  Eye,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface CompiledTender {
  id?: string;
  franchiseId: string;
  tenderId: string;
  date: string;
  endDate: string;
  priceOfBid: string;
  numericCost?: number;
  office: string;
  address: string;
  subject: string;
  summary?: string;
  originalFileName?: string;
  pdfUrl?: string;
  state?: string;
  district?: string;
  block?: string;
  sourcePlatform?: string;
  createdAt: any;
}

interface Tender {
  id: string;
  title: string;
  authority: string;
  value: string;
  dueDate: string;
  referenceId?: string;
  location?: string;
  description: string;
  sourceUrl?: string;
}

interface SavedBid {
  id?: string;
  tenderId: string;
  tenderTitle: string;
  authority: string;
  value: string;
  dueDate: string;
  referenceId?: string;
  bidStatus: 'Draft' | 'Submitted' | 'Awarded' | 'Rejected';
  bidAmount: number;
  contactPerson: string;
  notes: string;
  createdAt: any;
}

export function TendersMarketplace({ franchiseId, currentFranchise, isSuperAdmin = false }: { franchiseId: string; currentFranchise?: any; isSuperAdmin?: boolean }) {
  const [city, setCity] = useState(currentFranchise?.city || 'Sikar');
  const [stateName, setStateName] = useState('Rajasthan');
  const [loading, setLoading] = useState(false);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedBids, setSavedBids] = useState<SavedBid[]>([]);
  const [biddingTender, setBiddingTender] = useState<Tender | null>(null);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [bidNotes, setBidNotes] = useState<string>('');
  const [bidContact, setBidContact] = useState<string>('');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [activeTab, setActiveTabTab] = useState<'all' | 'saved' | 'compiler'>('all');
  const [compiledTenders, setCompiledTenders] = useState<CompiledTender[]>([]);
  const [uploadQueue, setUploadQueue] = useState<{ id: string, name: string, status: 'pending' | 'processing' | 'success' | 'failed', error?: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtering and Searching states for Compiled Tenders
  const [filterState, setFilterState] = useState<string>('');
  const [filterDistrict, setFilterDistrict] = useState<string>('');
  const [filterBlock, setFilterBlock] = useState<string>('');
  const [filterPlatform, setFilterPlatform] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // States for Modals
  const [activeTenderModal, setActiveTenderModal] = useState<CompiledTender | 'new' | null>(null);
  
  // Form fields for Modal
  const [modalTenderId, setModalTenderId] = useState('');
  const [modalDate, setModalDate] = useState('');
  const [modalEndDate, setModalEndDate] = useState('');
  const [modalPrice, setModalPrice] = useState('');
  const [modalNumericCost, setModalNumericCost] = useState('1500000');
  const [modalOffice, setModalOffice] = useState('');
  const [modalAddress, setModalAddress] = useState('');
  const [modalSubject, setModalSubject] = useState('');
  const [modalState, setModalState] = useState('Rajasthan');
  const [modalDistrict, setModalDistrict] = useState('Sikar');
  const [modalBlock, setModalBlock] = useState('Sikar');
  const [modalSourcePlatform, setModalSourcePlatform] = useState('eProcurement');
  const [modalPdfUrl, setModalPdfUrl] = useState('');

  // Live premium pdf document preview modal states
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfName, setPreviewPdfName] = useState<string>('');

  // Toast notifications state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [localPdfUrls, setLocalPdfUrls] = useState<Record<string, string>>({});

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    // Dismiss automatically after 4 seconds
    setTimeout(() => {
      setToast(prev => prev && prev.message === message ? null : prev);
    }, 4500);
  };

  // Custom confirmation states to replace blocked browser confirmation dialogs
  const [deleteTenderId, setDeleteTenderId] = useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [cancelBidId, setCancelBidId] = useState<string | null>(null);
  const [awardBidId, setAwardBidId] = useState<string | null>(null);

  // Load compiled tenders
  useEffect(() => {
    const fId = franchiseId || 'global';
    const q = query(
      collection(db, 'compiledTenders'),
      where('franchiseId', '==', fId)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CompiledTender[];
      const sorted = [...list].sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setCompiledTenders(sorted);
    }, (err) => {
      console.error("Error loading compiled tenders:", err);
    });

    return () => unsubscribe();
  }, [franchiseId]);

  const SIKAR_TEHSILS = ["sikar", "fatehpur", "laxmangarh", "dantaramgarh", "neem ka thana", "sri madhopur", "khandela", "dhod", "piprali"];

  const formatIndianCurrency = (num: number) => {
    if (!num) return "₹0.00";
    if (num >= 10000000) {
      return `₹${(num / 10000000).toFixed(2)} Cr`;
    } else if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} Lakh`;
    } else {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
    }
  };

  const filteredCompiledTenders = compiledTenders.filter(tender => {
    // 1. State Filter
    if (filterState && (tender.state || 'Rajasthan').toLowerCase() !== filterState.toLowerCase()) {
      return false;
    }

    // 2. District Filter
    if (filterDistrict) {
      if (filterDistrict.toLowerCase() === 'sikar') {
        const isSikarDistrict = (tender.district || 'Sikar').toLowerCase() === 'sikar';
        const isSikarTehsil = SIKAR_TEHSILS.includes((tender.block || '').toLowerCase());
        if (!isSikarDistrict && !isSikarTehsil) {
          return false;
        }
      } else if ((tender.district || '').toLowerCase() !== filterDistrict.toLowerCase()) {
        return false;
      }
    }

    // 3. Block/Tehsil/City Filter
    if (filterBlock && (tender.block || '').toLowerCase() !== filterBlock.toLowerCase()) {
      return false;
    }

    // 4. Platform Filter
    if (filterPlatform && (tender.sourcePlatform || 'eprocurement').toLowerCase() !== filterPlatform.toLowerCase()) {
      return false;
    }

    // 5. Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = (tender.tenderId || '').toLowerCase().includes(q);
      const matchOffice = (tender.office || '').toLowerCase().includes(q);
      const matchSubject = (tender.subject || '').toLowerCase().includes(q);
      const matchAddress = (tender.address || '').toLowerCase().includes(q);
      const matchBlock = (tender.block || '').toLowerCase().includes(q);
      const matchDistrict = (tender.district || '').toLowerCase().includes(q);
      const matchState = (tender.state || '').toLowerCase().includes(q);
      const matchPlatform = (tender.sourcePlatform || '').toLowerCase().includes(q);
      
      if (!matchId && !matchOffice && !matchSubject && !matchAddress && !matchBlock && !matchDistrict && !matchState && !matchPlatform) {
        return false;
      }
    }

    return true;
  });

  const totalAllValue = compiledTenders.reduce((sum, t) => sum + (t.numericCost || 0), 0);
  const totalFilteredValue = filteredCompiledTenders.reduce((sum, t) => sum + (t.numericCost || 0), 0);

  const handlePdfUpload = async (files: FileList | File[]) => {
    const fId = franchiseId || 'global';
    const newQueueItems = Array.from(files).map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      status: 'pending' as const
    }));
    
    setUploadQueue(prev => [...prev, ...newQueueItems]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const qItem = newQueueItems[i];
      
      if (!file.type.includes('pdf')) {
        setUploadQueue(prev => prev.map(item => item.id === qItem.id ? { ...item, status: 'failed', error: 'Only PDF documents are supported' } : item));
        continue;
      }

      setUploadQueue(prev => prev.map(item => item.id === qItem.id ? { ...item, status: 'processing' } : item));
      
      try {
        // Upload physical PDF document to Firebase storage to obtain a permanent preview link
        let uploadedPdfUrl = '';
        try {
          const pathRef = storageRef(storage, `compiled-tenders-pdfs/${Date.now()}_${file.name}`);
          const uploadResult = await uploadBytes(pathRef, file);
          uploadedPdfUrl = await getDownloadURL(uploadResult.ref);
        } catch (storageErr: any) {
          console.warn("Storage upload failed - fallback to empty string link:", storageErr);
        }

        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const b64 = (reader.result as string).split(',')[1];
            resolve(b64);
          };
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(file);
        });
        
        const fileData = await base64Promise;
        
        const res = await fetch('/api/tenders/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData, fileName: file.name })
        });
        
        if (!res.ok) {
          throw new Error('Server returned parse error');
        }
        
        const responseData = await res.json();
        if (!responseData.tender) {
          throw new Error('AI was unable to extract logical tender parameters.');
        }
        
        const { tender } = responseData;

        // Duplicate Check 
        const isDuplicate = compiledTenders.some(
          t => t.tenderId.trim().toLowerCase() === tender.tenderId.trim().toLowerCase()
        );
        if (isDuplicate) {
          throw new Error(`Duplicate entry error: Tender with ID "${tender.tenderId}" has already been uploaded/compiled in this list.`);
        }
        
        await addDoc(collection(db, 'compiledTenders'), {
          franchiseId: fId,
          tenderId: tender.tenderId,
          date: tender.date || new Date().toISOString().split('T')[0],
          endDate: tender.endDate || new Date().toISOString().split('T')[0],
          priceOfBid: tender.priceOfBid || '₹0',
          numericCost: Number(tender.numericCost) || 0,
          office: tender.office || '',
          address: tender.address || '',
          subject: tender.subject || '',
          summary: tender.summary || '',
          state: tender.state || 'Rajasthan',
          district: tender.district || 'Sikar',
          block: tender.block || 'Sikar',
          sourcePlatform: tender.sourcePlatform || 'eProcurement',
          pdfUrl: uploadedPdfUrl,
          originalFileName: file.name,
          createdAt: serverTimestamp()
        });
        
        // Map local object URL for previewing immediately in current session
        try {
          const localUrl = URL.createObjectURL(file);
          setLocalPdfUrls(prev => ({ ...prev, [tender.tenderId]: localUrl }));
        } catch (e) {
          console.warn("Local preview URL creation skipped:", e);
        }
        
        setUploadQueue(prev => prev.map(item => item.id === qItem.id ? { ...item, status: 'success' } : item));
      } catch (err: any) {
        console.error("PDF Parse/Upload error", err);
        setUploadQueue(prev => prev.map(item => item.id === qItem.id ? { ...item, status: 'failed', error: err.message || String(err) } : item));
      }
    }
  };

  const handleOpenTenderModal = (tender: CompiledTender | 'new') => {
    if (tender === 'new') {
      setActiveTenderModal('new');
      setModalTenderId(`NIT-${Math.floor(10 + Math.random() * 40)}/PHED/${(currentFranchise?.location || 'Sikar').toUpperCase()}/2026-${Math.floor(1000 + Math.random() * 9000)}`);
      setModalDate(new Date().toISOString().split('T')[0]);
      const defaultEnd = new Date();
      defaultEnd.setDate(defaultEnd.getDate() + 21);
      setModalEndDate(defaultEnd.toISOString().split('T')[0]);
      setModalPrice('₹15,00,000 (Est. Cost)');
      setModalNumericCost('1500000');
      setModalOffice(`Public Health Engineering Department (PHED), ${currentFranchise?.location || 'Sikar'}`);
      setModalAddress(`${currentFranchise?.location || 'Sikar'}, Rajasthan, India`);
      setModalSubject('Providing Drinking Water Supply Services through high capacity tractor water tankers.');
      setModalState('Rajasthan');
      setModalDistrict('Sikar');
      setModalBlock('Sikar');
      setModalSourcePlatform('eProcurement');
      setModalPdfUrl('');
    } else {
      setActiveTenderModal(tender);
      setModalTenderId(tender.tenderId || '');
      setModalDate(tender.date || '');
      setModalEndDate(tender.endDate || '');
      setModalPrice(tender.priceOfBid || '');
      setModalNumericCost(String(tender.numericCost || '0'));
      setModalOffice(tender.office || '');
      setModalAddress(tender.address || '');
      setModalSubject(tender.subject || '');
      setModalState(tender.state || 'Rajasthan');
      setModalDistrict(tender.district || 'Sikar');
      setModalBlock(tender.block || 'Sikar');
      setModalSourcePlatform(tender.sourcePlatform || 'eProcurement');
      setModalPdfUrl(tender.pdfUrl || '');
    }
  };

  const handleSaveTenderForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const fId = franchiseId || 'global';

    // Prevent Duplicates in manual inputs
    const isDuplicate = compiledTenders.some(
      t => t.id !== (activeTenderModal === 'new' ? '' : activeTenderModal.id) &&
           t.tenderId.trim().toLowerCase() === modalTenderId.trim().toLowerCase()
    );
    if (isDuplicate) {
      alert(`⚠️ DUPLICATE TENDER ID ERROR:\nA compiled tender with Reference ID "${modalTenderId}" already exists in the spreadsheets!`);
      return;
    }

    try {
      const payload = {
        franchiseId: fId,
        tenderId: modalTenderId,
        date: modalDate,
        endDate: modalEndDate,
        priceOfBid: modalPrice,
        numericCost: Number(modalNumericCost) || 0,
        office: modalOffice,
        address: modalAddress,
        subject: modalSubject,
        state: modalState,
        district: modalDistrict,
        block: modalBlock,
        sourcePlatform: modalSourcePlatform,
        pdfUrl: modalPdfUrl,
        originalFileName: activeTenderModal === 'new' ? 'Manual Entry' : (activeTenderModal.originalFileName || 'Manual Entry')
      };

      if (activeTenderModal === 'new') {
        const docRef = await addDoc(collection(db, 'compiledTenders'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        showToast('🎉 New compiled tender entry registered successfully');
      } else if (activeTenderModal && typeof activeTenderModal !== 'string') {
        await updateDoc(doc(db, 'compiledTenders', activeTenderModal.id!), payload);
        showToast('✏️ Tender parameters updated successfully');
      }
      setActiveTenderModal(null);
    } catch (err: any) {
      showToast('Error saving tender: ' + err.message, 'error');
    }
  };

  const handleDeleteCompiledTender = (id: string) => {
    setDeleteTenderId(id);
  };

  const executeDeleteCompiledTender = async () => {
    if (!deleteTenderId) return;
    try {
      await deleteDoc(doc(db, 'compiledTenders', deleteTenderId));
      showToast('🗑️ Accrued tender entry removed successfully.');
    } catch (err: any) {
      showToast('Failed to delete tender: ' + err.message, 'error');
    } finally {
      setDeleteTenderId(null);
    }
  };

  const handleClearAllCompiled = () => {
    setShowClearAllConfirm(true);
  };

  const executeClearAllCompiled = async () => {
    setShowClearAllConfirm(false);
    try {
      let count = 0;
      for (const t of compiledTenders) {
        if (t.id) {
          await deleteDoc(doc(db, 'compiledTenders', t.id));
          count++;
        }
      }
      showToast(`🧹 Successfully cleared all ${count} accrued compiled tenders.`);
    } catch (err: any) {
      showToast('Error clearing accrued tenders: ' + err.message, 'error');
    }
  };

  const executeCancelBid = async () => {
    if (!cancelBidId) return;
    try {
      await deleteDoc(doc(db, 'tenderBids', cancelBidId));
      showToast('🗑️ Bid proposal successfully canceled & removed.');
    } catch (err: any) {
      showToast('Error removing: ' + err.message, 'error');
    } finally {
      setCancelBidId(null);
    }
  };

  const executeAwardBid = async () => {
    if (!awardBidId) return;
    try {
      await updateDoc(doc(db, 'tenderBids', awardBidId), { bidStatus: 'Awarded' });
      showToast('🎉 PROPOSAL AWARDED! Contract tokens are successfully allocated.');
    } catch (err: any) {
      showToast('Error updating status: ' + err.message, 'error');
    } finally {
      setAwardBidId(null);
    }
  };

  const handleExportToExcel = () => {
    const listToExport = filteredCompiledTenders;
    if (listToExport.length === 0) {
      showToast('No rows match your current filtration settings. Please clear filters or upload PDFs first.', 'info');
      return;
    }

    // Format the rows nicely for high fidelity Excel output
    const dataToExport = listToExport.map((t, idx) => ({
      "S.No.": idx + 1,
      "Portal Source": t.sourcePlatform || 'eProcurement',
      "Tender Reference ID": t.tenderId,
      "Release Date": t.date,
      "Submission Due Date": t.endDate,
      "Estimated Cost (Numeric INR)": t.numericCost || 0,
      "Display Bid Price": t.priceOfBid,
      "State": t.state || 'Rajasthan',
      "District": t.district || 'Sikar',
      "Block/Tehsil/City": t.block || 'Sikar',
      "Issuing Authority Office": t.office,
      "Work Site Location Address": t.address,
      "Subject / Work Scope Description": t.subject,
      "Original PDF Link": t.pdfUrl || 'No PDF Link',
      "Uploaded File Name": t.originalFileName || 'Manual Entry'
    }));

    try {
      // Create SheetJS workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Compiled Tenders");

      // Auto-fit column widths elegantly
      const wscols = [];
      const headerKeys = Object.keys(dataToExport[0]);
      for (let i = 0; i < headerKeys.length; i++) {
        let max_len = headerKeys[i].length;
        for (let r = 0; r < dataToExport.length; r++) {
          const val = (dataToExport as any)[r][headerKeys[i]];
          if (val !== undefined && val !== null) {
            const valStr = String(val).replace(/[\r\n]+/g, ' ');
            if (valStr.length > max_len) {
              max_len = valStr.length;
            }
          }
        }
        // Caps column width at 45 to prevent extreme subject sprawl
        wscols.push({ wch: Math.min(max_len + 3, 45) });
      }
      worksheet['!cols'] = wscols;

      // Write .xlsx binary string and download directly in the browser
      XLSX.writeFile(workbook, `Tenders_Clean_Compilation_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('📊 Beautiful Excel table exported successfully!');
    } catch (exportErr: any) {
      console.error("SheetJS export failed:", exportErr);
      showToast('Native Excel creation failed. Falling back to CSV...', 'error');
      
      // Secondary fallback to CSV download
      const headers = [
        "S.No.", "Portal Source", "Tender Reference ID", "Release Date", 
        "Submission Deadline (End Date)", "Estimated Cost (Numeric INR)", 
        "Display Bid Price", "State", "District", "Block/Tehsil/City", 
        "Issuing Office", "Address/Location", "Subject / Scope of Work", 
        "Original PDF Link", "Uploaded File Name"
      ];
      const rows = listToExport.map((t, idx) => [
        idx + 1,
        t.sourcePlatform || 'eProcurement',
        t.tenderId,
        t.date,
        t.endDate,
        t.numericCost || 0,
        t.priceOfBid,
        t.state || 'Rajasthan',
        t.district || 'Sikar',
        t.block || 'Sikar',
        t.office,
        t.address,
        t.subject,
        t.pdfUrl || 'No PDF Link',
        t.originalFileName || 'Manual Entry'
      ]);

      let csvContent = "\uFEFF";
      csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
      rows.forEach(row => {
        csvContent += row.map(cell => {
          let cleaned = String(cell ?? '').replace(/[\r\n]+/g, ' ').trim();
          return `"${cleaned.replace(/"/g, '""')}"`;
        }).join(",") + "\n";
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Tenders_Filtered_Compilation_Sheet_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleForceDownload = async (url: string, filename: string) => {
    try {
      showToast('Preparing download package...');
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      showToast('⬇️ Document downloaded successfully!');
    } catch (err) {
      window.open(url, '_blank');
      showToast('Opened document in a new tab for direct browser save.', 'info');
    }
  };

  // Suggested search tags based on geography
  const searchPresets = [
    { name: currentFranchise?.city || 'Sikar', state: 'Rajasthan' },
    { name: 'Jaipur', state: 'Rajasthan' },
    { name: 'Jhunjhunu', state: 'Rajasthan' },
    { name: 'Churu', state: 'Rajasthan' },
    { name: 'Bikaner', state: 'Rajasthan' }
  ];

  // Fetch saved bids for this franchise from firestore
  useEffect(() => {
    if (!franchiseId) return;
    const q = query(
      collection(db, 'tenderBids'),
      where('franchiseId', '==', franchiseId)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const bids = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SavedBid[];
      setSavedBids(bids);
    }, (err) => {
      console.error("Error loading bids:", err);
    });

    return () => unsubscribe();
  }, [franchiseId]);

  const searchTenders = async (searchCity: string, searchState: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tenders/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: searchCity, state: searchState })
      });
      if (!res.ok) {
        throw new Error('Could not find active tenders. Please try changing the city preset.');
      }
      const data = await res.json();
      setTenders(data.tenders || []);
    } catch (err: any) {
      setError(err?.message || 'Error communicating with live tender search services.');
    } finally {
      setLoading(false);
    }
  };

  // Perform initial search
  useEffect(() => {
    searchTenders(city, stateName);
  }, []);

  const handleApplyPreset = (presetCity: string, presetState: string) => {
    setCity(presetCity);
    setStateName(presetState);
    searchTenders(presetCity, presetState);
  };

  const handleOpenBidModal = (tender: Tender) => {
    setBiddingTender(tender);
    // Auto populate estimated value
    // Extrapolate numbers from value string
    const numbers = tender.value.replace(/[^0-9.]/g, '');
    const defaultVal = numbers ? parseFloat(numbers) * 100000 : 500000;
    setBidAmount(defaultVal.toString());
    setBidNotes(`Proposed water delivery fleet of ${currentFranchise?.tractorsCount || 3} tractors. Standard rate card contract for drinking water supply.`);
    setBidContact(currentFranchise?.operatorMobile || '9928374829');
  };

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!biddingTender || !franchiseId) return;

    try {
      await addDoc(collection(db, 'tenderBids'), {
        franchiseId,
        tenderId: biddingTender.id,
        tenderTitle: biddingTender.title,
        authority: biddingTender.authority,
        value: biddingTender.value,
        dueDate: biddingTender.dueDate,
        referenceId: biddingTender.referenceId || 'N/A',
        bidStatus: 'Submitted',
        bidAmount: parseFloat(bidAmount) || 0,
        contactPerson: bidContact,
        notes: bidNotes,
        createdAt: serverTimestamp()
      });

      alert('🎉 Contract Bid simulation submitted successfully!\n\nYour application proposal is loaded on the e-Procurement pipeline. You can manage status updates in the Saved Contracts tab.');
      setBiddingTender(null);
    } catch (err: any) {
      alert('Error recording contract bid: ' + err.message);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Banner design */}
      <div className="relative overflow-hidden bg-slate-900 rounded-[2.5rem] p-8 text-white border border-white/10 shadow-xl">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full pointer-events-none blur-[100px]" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/35 text-[10px] font-black uppercase tracking-widest">
              <Award size={12} className="text-blue-400" />
              Live e-Procurement & Tenders Engine
            </div>
            <h1 className="text-3xl font-black tracking-tight mt-1">Water Supply Tenders Hub</h1>
            <p className="text-slate-400 text-xs font-normal max-w-2xl leading-relaxed">
              Find and filter water tanker supply procurement contracts listed near your franchise territory. Powered by <span className="text-blue-400 font-bold underline">tenderdetails.com</span> live index and Gemini Intelligence.
            </p>
          </div>

          <div className="flex bg-slate-800/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/5 shrink-0 flex-wrap gap-1 md:gap-0">
            <button
              onClick={() => {
                setActiveTabTab('all');
                setShowSavedOnly(false);
              }}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase transition-all ${activeTab === 'all' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              All Tenders
            </button>
            <button
              onClick={() => {
                setActiveTabTab('saved');
                setShowSavedOnly(true);
              }}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase transition-all flex items-center gap-1.5 ${activeTab === 'saved' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <FileCheck size={14} />
              My Saved Bids
              {savedBids.length > 0 && (
                <span className="bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                  {savedBids.length}
                </span>
              )}
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => {
                  setActiveTabTab('compiler');
                  setShowSavedOnly(false);
                }}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase transition-all flex items-center gap-1.5 ${activeTab === 'compiler' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                <FileSpreadsheet size={14} />
                AI Tender PDF Compiler
                {compiledTenders.length > 0 && (
                  <span className="bg-green-500 text-slate-900 text-[10px] px-2 py-0.5 rounded-full font-black">
                    {compiledTenders.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'all' ? (
        <>
          {/* Custom Search Form */}
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Territory Query Parameters</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Target District / City</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="E.g. Sikar"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Region / State</label>
                <div className="relative">
                  <Compass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="E.g. Rajasthan"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-300"
                  />
                </div>
              </div>

              <button
                onClick={() => searchTenders(city, stateName)}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-black text-xs uppercase tracking-widest py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                Search Tenders
              </button>
            </div>

            {/* Presets / Nearby shortcuts */}
            <div className="mt-4 pt-4 border-t border-slate-50 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Territory Presets:</span>
              {searchPresets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => handleApplyPreset(preset.name, preset.state)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${city === preset.name ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'}`}
                >
                  {preset.name}, {preset.state}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-6 bg-red-50 border border-red-100 text-red-700 rounded-3xl text-xs font-semibold flex items-center gap-2">
              <span>⚠️</span>
              <p>{error}</p>
            </div>
          )}

          {/* Loader */}
          {loading ? (
            <div className="py-24 text-center space-y-4">
              <Loader2 className="animate-spin text-blue-500 mx-auto" size={48} />
              <p className="text-slate-400 text-xs font-semibold animate-pulse">Running live index query on tenderdetails.com platform...</p>
              <p className="text-slate-500 text-[10px] max-w-md mx-auto">Gemini is searching current active water supply orders, sorting by spatial relevance to {city}, parsing, and structuring datasets.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                  Found {tenders.length} Water Tanker Contracts
                </p>
                <span className="text-[10px] font-medium text-slate-400">
                  Updated just now
                </span>
              </div>

              {tenders.length === 0 ? (
                <div className="bg-white rounded-[2rem] border border-slate-100 p-12 text-center space-y-4 shadow-sm">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                    <Briefcase size={28} />
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">No Live Tenders Decoded</h4>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto leading-relaxed">
                    We couldn't parse active water tanker tenders for "{city}" at this second. Try selecting another city preset like **Jaipur** or **Jhunjhunu**.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {tenders.map((tender) => {
                    const isBidOn = savedBids.some(b => b.tenderId === tender.id);
                    return (
                      <div 
                        key={tender.id} 
                        className={`bg-white rounded-[2rem] border p-6 flex flex-col justify-between transition-all group ${isBidOn ? 'border-green-200 bg-green-50/5 hover:shadow-green-100' : 'border-slate-100 hover:shadow-xl hover:shadow-slate-100/40'}`}
                      >
                        <div>
                          {/* Top row */}
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <span className="text-[9px] bg-slate-100 text-slate-600 font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                              Ref: {tender.referenceId || `T-${tender.id}`}
                            </span>
                            {isBidOn ? (
                              <span className="bg-green-100 text-green-700 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1">
                                <CheckCircle size={10} />
                                Bid Applied
                              </span>
                            ) : (
                              <span className="bg-blue-100 text-blue-700 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                                Active Tender
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <h4 className="font-bold text-slate-800 text-sm leading-snug group-hover:text-blue-600 transition-colors mb-3">
                            {tender.title}
                          </h4>

                          {/* Details line */}
                          <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50/50 rounded-2xl mb-4 border border-slate-50">
                            <div className="flex items-center gap-2">
                              <Building2 className="text-slate-400" size={14} />
                              <div className="truncate">
                                <p className="text-[8px] text-slate-400 font-black uppercase tracking-wider leading-none">Issuing Unit</p>
                                <p className="text-[10px] font-bold text-slate-600 truncate">{tender.authority}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <DollarSign className="text-amber-500" size={14} />
                              <div>
                                <p className="text-[8px] text-slate-400 font-black uppercase tracking-wider leading-none">Est. Budget</p>
                                <p className="text-[10px] font-black text-amber-600 leading-none mt-0.5">{tender.value}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Calendar className="text-slate-400" size={14} />
                              <div>
                                <p className="text-[8px] text-slate-400 font-black uppercase tracking-wider leading-none">Closing Date</p>
                                <p className="text-[10px] font-bold text-slate-600 leading-none mt-0.5">{tender.dueDate}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <MapPin className="text-slate-400" size={14} />
                              <div className="truncate">
                                <p className="text-[8px] text-slate-400 font-black uppercase tracking-wider leading-none">Works Location</p>
                                <p className="text-[10px] font-bold text-slate-600 truncate leading-none mt-0.5">{tender.location || city}</p>
                              </div>
                            </div>
                          </div>

                          {/* Description info */}
                          <p className="text-xs text-slate-500 font-normal leading-relaxed mb-6 border-l-2 border-slate-100 pl-3">
                            {tender.description}
                          </p>
                        </div>

                        {/* Action segment */}
                        <div className="flex items-center gap-2 pt-4 border-t border-slate-100 mt-auto">
                          {tender.sourceUrl && (
                            <a
                              href={tender.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-4 py-2.5 rounded-xl border border-slate-100 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/25 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                            >
                              <ExternalLink size={12} />
                              View on Portal
                            </a>
                          )}
                          
                          <button
                            onClick={() => handleOpenBidModal(tender)}
                            disabled={isBidOn}
                            className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${isBidOn ? 'bg-green-50 text-green-600 border border-green-200 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/10 active:scale-95'}`}
                          >
                            <Bookmark size={12} />
                            {isBidOn ? 'Contract Bidded' : 'Intention to Bid • Dispatch Proposal'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      ) : activeTab === 'saved' ? (
        /* Saved bids tab layout */
        <div className="space-y-6 animate-fade-in">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Active Bid Pipeline ({savedBids.length} entries)</p>
          
          {savedBids.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-slate-100 p-12 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <FileSpreadsheet size={28} />
              </div>
              <h4 className="font-bold text-slate-800 text-sm">No Saved Contract Proposals</h4>
              <p className="text-slate-500 text-xs max-w-sm mx-auto leading-relaxed">
                Start browsing live water supply tenders in your area, input your custom bid proposal and monitor application milestones from this layout.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {savedBids.map((bid) => (
                <div key={bid.id} className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded">Ref: {bid.referenceId}</span>
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                        bid.bidStatus === 'Awarded' ? 'bg-green-100 text-green-700' :
                        bid.bidStatus === 'Submitted' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {bid.bidStatus}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-800 text-sm mb-2">{bid.tenderTitle}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">{bid.authority}</p>

                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl mb-4 text-xs">
                      <div>
                        <p className="text-[8px] text-slate-400 font-bold uppercase">Original Value</p>
                        <p className="font-bold text-slate-700">{bid.value}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-slate-400 font-bold uppercase">Our Bid Offer</p>
                        <p className="font-black text-blue-600">₹{bid.bidAmount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-slate-400 font-bold uppercase">Contact Registered</p>
                        <p className="font-bold text-slate-700">{bid.contactPerson}</p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 font-medium leading-relaxed italic bg-blue-50/30 p-3 rounded-xl border border-blue-50/50 mb-4">
                      <strong>Remarks / Fleet Assignment:</strong> {bid.notes}
                    </p>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-slate-50 mt-auto justify-end">
                    <button
                      onClick={() => setCancelBidId(bid.id!)}
                      className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Remove Bid
                    </button>
                    {bid.bidStatus === 'Submitted' && (
                      <button
                        onClick={() => setAwardBidId(bid.id!)}
                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white transition-colors flex items-center gap-1"
                      >
                        <CheckCircle size={12} />
                        Simulate Award
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'compiler' && isSuperAdmin ? (
        <div className="space-y-8">
          {/* Dynamic aggregate metrics summary panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 shadow-md relative overflow-hidden">
              <div className="absolute right-3 top-3 opacity-10">
                <FileSpreadsheet size={80} />
              </div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Accrued Cumulative Value</p>
              <h3 className="text-2xl font-black mt-2 tracking-tight">{formatIndianCurrency(totalAllValue)}</h3>
              <p className="text-xs text-slate-300 mt-2 font-medium">Sum of all {compiledTenders.length} compiled tender records</p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden">
              <div className="absolute right-3 top-3 text-emerald-500 opacity-5">
                <Filter size={80} />
              </div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Filtered Segment Value</p>
              <h3 className="text-2xl font-black mt-2 text-emerald-600 tracking-tight">{formatIndianCurrency(totalFilteredValue)}</h3>
              <p className="text-xs text-slate-500 mt-2 font-medium">
                {filterDistrict || filterBlock ? `For filtered ${filterDistrict || 'selected'} geography` : 'All filtered views total'}
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Total Tender Count</p>
              <h3 className="text-2xl font-black mt-2 text-slate-800 tracking-tight">
                {filteredCompiledTenders.length} <span className="text-xs text-slate-400 font-semibold">/ {compiledTenders.length} Visible</span>
              </h3>
              <div className="flex gap-1.5 mt-3">
                <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black uppercase">
                  {filterDistrict || 'Sikar'} Filtered
                </span>
                <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black uppercase">
                  Excel Sync Ready
                </span>
              </div>
            </div>
          </div>

          {/* Upload panel card */}
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm space-y-6 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-48 h-48 bg-gradient-to-bl from-green-500/5 to-transparent rounded-full pointer-events-none blur-4xl" />
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">AI Tender PDF Compiler & Excel Spreadsheet Generator</h2>
                <p className="text-xs text-slate-400 mt-1 max-w-xl">
                  Upload multiple tanker-related tender PDFs. Our Gemini model will parse out key details and compile them into a beautiful, filtered Excel sheet.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenTenderModal('new')}
                  className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-xs uppercase transition-all flex items-center gap-1.5 border border-slate-200/60 font-sans"
                >
                  <Plus size={14} className="text-slate-500" />
                  Add Row Manually
                </button>
                <button
                  type="button"
                  onClick={handleClearAllCompiled}
                  disabled={compiledTenders.length === 0}
                  className="px-4 py-2.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 rounded-xl font-bold text-xs uppercase transition-all flex items-center gap-1.5 font-sans"
                >
                  <Trash2 size={14} className="text-red-500" />
                  Clear List
                </button>
              </div>
            </div>

            {/* Drag and drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files) {
                  handlePdfUpload(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-[2rem] p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50/20 shadow-inner' 
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-slate-50/20'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="application/pdf"
                onChange={(e) => {
                  if (e.target.files) {
                    handlePdfUpload(e.target.files);
                  }
                }}
                className="hidden"
              />
              <div className="w-14 h-14 bg-gradient-to-tr from-blue-500/10 to-blue-500/5 rounded-2xl flex items-center justify-center border border-blue-500/10 text-blue-600">
                <UploadCloud size={28} />
              </div>
              <div className="space-y-1">
                <p className="font-extrabold text-sm text-slate-700 font-sans">Click to upload or drag & drop tender PDFs</p>
                <p className="text-[10px] text-slate-400 font-medium font-sans">Select tanker-related tender sheets. Duplicate uploads are automatically detected and blocked.</p>
              </div>
            </div>

            {/* Dynamic Queue Status */}
            {uploadQueue.length > 0 && (
              <div className="bg-slate-50/50 border border-slate-100 rounded-[2rem] p-6 space-y-3.5">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Document Processing Pipeline ({uploadQueue.filter(q => q.status === 'success').length}/{uploadQueue.length} Done)</h3>
                  <button
                    onClick={() => setUploadQueue([])}
                    className="text-[10px] text-slate-400 hover:text-slate-600 font-bold uppercase font-sans"
                  >
                    Clear Queue UI
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {uploadQueue.map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200/50 rounded-xl p-3 flex items-center justify-between text-xs font-bold shadow-sm font-sans">
                      <div className="flex items-center gap-2.5 truncate max-w-md">
                        <FileText className="text-blue-500 shrink-0" size={16} />
                        <span className="text-slate-700 truncate font-semibold">{item.name}</span>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        {item.status === 'pending' && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full uppercase tracking-wider font-sans">Pending</span>
                        )}
                        {item.status === 'processing' && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 font-bold font-sans">
                            <Loader2 size={10} className="animate-spin" />
                            Gemini Extracting...
                          </span>
                        )}
                        {item.status === 'success' && (
                          <span className="text-[10px] bg-green-50 text-green-700 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 font-extrabold font-sans">
                            <Check size={10} />
                            Success
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <div className="flex items-center gap-1.5 font-sans">
                            <span className="text-[10px] bg-red-50 text-red-600 px-2.5 py-1 rounded-full uppercase tracking-wider font-bold">Failed</span>
                            <span className="text-[9px] text-red-400 font-normal max-w-[150px] truncate" title={item.error}>{item.error || 'Server error'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Filtering control deck */}
          <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm space-y-4 font-sans">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-1">
              <Filter size={12} className="text-slate-400" />
              Spreadsheet Filter & Search Deck
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Universal Keyword Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search Ref, Subject, Office..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              {/* State Filter */}
              <div>
                <select
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                >
                  <option value="">All States</option>
                  <option value="Rajasthan">Rajasthan</option>
                  <option value="Haryana">Haryana</option>
                  <option value="Delhi">Delhi</option>
                </select>
              </div>

              {/* District Filter */}
              <div>
                <select
                  value={filterDistrict}
                  onChange={(e) => {
                    setFilterDistrict(e.target.value);
                    setFilterBlock(''); // Reset block when district changes
                  }}
                  className="w-full bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                >
                  <option value="">All Districts</option>
                  <option value="Sikar">Sikar (Includes 7+ Tehsils)</option>
                  <option value="Jaipur">Jaipur</option>
                  <option value="Churu">Churu</option>
                  <option value="Jhunjhunu">Jhunjhunu</option>
                </select>
              </div>

              {/* Block / Tehsil Filter */}
              <div>
                <select
                  value={filterBlock}
                  onChange={(e) => {
                    setFilterBlock(e.target.value);
                  }}
                  className="w-full bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                >
                  <option value="">All Blocks / Tehsils</option>
                  {filterDistrict.toLowerCase() === 'sikar' ? (
                    <>
                      <option value="Fatehpur">Fatehpur (फतेहपुर)</option>
                      <option value="Laxmangarh">Laxmangarh (लक्ष्मणगढ़)</option>
                      <option value="Dantaramgarh">Dantaramgarh (दांतारामगढ़)</option>
                      <option value="Neem Ka Thana">Neem Ka Thana (नीमकाथाना)</option>
                      <option value="Sri Madhopur">Sri Madhopur (श्रीमधोपुर)</option>
                      <option value="Khandela">Khandela (खंडेला)</option>
                      <option value="Dhod">Dhod (धोद)</option>
                      <option value="Piprali">Piprali (पिपराली)</option>
                      <option value="Sikar">Sikar City</option>
                    </>
                  ) : (
                    <>
                      <option value="Fatehpur">Fatehpur</option>
                      <option value="Laxmangarh">Laxmangarh</option>
                      <option value="Sikar">Sikar</option>
                      <option value="Churu">Churu Block</option>
                    </>
                  )}
                </select>
              </div>

              {/* Source Platform Filter */}
              <div>
                <select
                  value={filterPlatform}
                  onChange={(e) => setFilterPlatform(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                >
                  <option value="">All Sourcing Sites</option>
                  <option value="eProcurement">eProcurement System (CPPP)</option>
                  <option value="GeM">Government e-Marketplace (GeM)</option>
                  <option value="Indian Tenders">Indian Tenders Portal</option>
                </select>
              </div>
            </div>

            {/* Geography shortcut selectors */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Fast-Filter:</span>
              <button
                onClick={() => {
                  setFilterDistrict('Sikar');
                  setFilterBlock('');
                  setFilterState('Rajasthan');
                }}
                className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all ${
                  filterDistrict === 'Sikar' && !filterBlock ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sikar District (All {SIKAR_TEHSILS.length - 1} Tehsils)
              </button>
              <button
                onClick={() => {
                  setFilterDistrict('Sikar');
                  setFilterBlock('Fatehpur');
                  setFilterState('Rajasthan');
                }}
                className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all ${
                  filterBlock === 'Fatehpur' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Fatehpur Block 📍
              </button>
              <button
                onClick={() => {
                  setFilterDistrict('Sikar');
                  setFilterBlock('Laxmangarh');
                  setFilterState('Rajasthan');
                }}
                className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all ${
                  filterBlock === 'Laxmangarh' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Laxmangarh Block
              </button>
              { (filterState || filterDistrict || filterBlock || filterPlatform || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterState('');
                    setFilterDistrict('');
                    setFilterBlock('');
                    setFilterPlatform('');
                    setSearchQuery('');
                  }}
                  className="px-3 py-1 text-[10px] font-black rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-all"
                >
                  Clear All Filters ×
                </button>
              )}
            </div>
          </div>

          {/* Compiled sheet / spreadsheet grid */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
            <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-50 bg-slate-50/30">
              <div>
                <span className="text-[10px] bg-green-100 text-green-700 font-black uppercase tracking-widest px-2.5 py-1 rounded-full font-sans">
                  Compiled Grid Output
                </span>
                <h3 className="font-extrabold text-lg text-slate-800 tracking-tight mt-2.5 flex items-center gap-2 font-sans">
                  Accrued Tenders Table
                  <span className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full font-black font-sans">
                    {filteredCompiledTenders.length} Visible
                  </span>
                </h3>
              </div>
              
              <button
                type="button"
                onClick={handleExportToExcel}
                disabled={filteredCompiledTenders.length === 0}
                className="w-full md:w-auto px-6 py-3.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 select-none shadow-md transition-all active:scale-95 font-sans"
              >
                <FileDown size={16} />
                Export Compiled Excel Sheet (.xlsx)
              </button>
            </div>

            {filteredCompiledTenders.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                  <FileSpreadsheet size={32} />
                </div>
                <div className="space-y-1">
                  <p className="font-extrabold text-sm text-slate-700 font-sans">No matching accrued tenders found</p>
                  <p className="text-[11px] text-slate-400 font-medium max-w-sm mx-auto leading-relaxed font-sans">
                    Change your filter options, search parameters, or upload target PDFs to see compiled rows list.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse table-auto text-xs font-sans">
                  <thead>
                    <tr className="bg-slate-100/50 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                      <th className="py-4 px-6 text-center w-12">SNo</th>
                      <th className="py-4 px-6 min-w-[120px]">Portal Source</th>
                      <th className="py-4 px-6 min-w-[160px]">Tender Ref ID</th>
                      <th className="py-4 px-6 min-w-[200px]">Geography Details</th>
                      <th className="py-4 px-6 min-w-[100px]">Doc View</th>
                      <th className="py-4 px-6 min-w-[100px]">Deadline</th>
                      <th className="py-4 px-6 min-w-[140px]">Estimated Price (Bid)</th>
                      <th className="py-4 px-6 min-w-[200px]">Issuing Office</th>
                      <th className="py-4 px-6 min-w-[220px]">Subject & Work Scope</th>
                      <th className="py-4 px-6 text-right pr-8 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                    {filteredCompiledTenders.map((tender, index) => (
                      <tr key={tender.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-6 text-center text-slate-400 font-bold">{index + 1}</td>
                        <td className="py-3.5 px-6">
                          <span className={`inline-flex px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border ${
                            tender.sourcePlatform === 'GeM' 
                              ? 'bg-amber-50 text-amber-700 border-amber-200' 
                              : tender.sourcePlatform === 'Indian Tenders' 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                : 'bg-sky-50 text-sky-700 border-sky-100'
                          }`}>
                            {tender.sourcePlatform || 'eProcurement'}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 font-extrabold text-slate-800 select-all tracking-tight leading-relaxed">
                          {tender.tenderId}
                        </td>
                        <td className="py-3.5 px-6 text-slate-600 font-medium leading-relaxed">
                          <p className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                            {tender.state || 'Rajasthan'} 
                            <span className="text-slate-300 font-normal">›</span> 
                            {tender.district || 'Sikar'}
                          </p>
                          <p className="text-[10px] text-indigo-600 font-extrabold bg-indigo-50/50 inline-block px-1.5 py-0.5 rounded mt-0.5">
                            Block: {tender.block || 'Sikar'}
                          </p>
                        </td>
                        <td className="py-3.5 px-6">
                          {(tender.pdfUrl || localPdfUrls[tender.tenderId]) ? (
                            <button
                              type="button"
                              onClick={() => {
                                const selectedPdfUrl = localPdfUrls[tender.tenderId] || tender.pdfUrl || null;
                                setPreviewPdfUrl(selectedPdfUrl);
                                setPreviewPdfName(tender.tenderId || 'Tender Document');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase text-blue-600 bg-blue-50/60 hover:bg-blue-100/80 transition-all shadow-sm border border-blue-100 transition-colors"
                              title="Open original tender document sheet"
                            >
                              <Eye size={11} />
                              View PDF
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold uppercase text-slate-400 bg-slate-50/50">
                              <FileText size={10} />
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="inline-flex py-1 px-2 rounded bg-blue-50 text-blue-700 font-black text-[10px] tracking-tight">
                            {tender.endDate}
                          </span>
                        </td>
                        <td className="py-3.5 px-6">
                          <p className="font-black text-green-600 text-[11px]">{tender.priceOfBid}</p>
                          {tender.numericCost ? (
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                              Val: {formatIndianCurrency(tender.numericCost)}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3.5 px-6 text-slate-500 font-normal">
                          <p className="font-extrabold text-slate-700 truncate max-w-[160px]" title={tender.office}>{tender.office}</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[160px]" title={tender.address}>{tender.address}</p>
                        </td>
                        <td className="py-3.5 px-6 text-slate-500 font-normal text-[11px] max-w-[220px] truncate" title={tender.subject}>
                          {tender.subject}
                        </td>
                        <td className="py-3.5 px-6 text-right pr-8">
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => handleOpenTenderModal(tender)}
                              className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50/50 rounded-lg transition-all"
                              title="Edit parameters"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCompiledTender(tender.id!)}
                              className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50/50 rounded-lg transition-all"
                              title="Delete row"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-slate-100 p-12 text-center text-slate-500 font-medium font-sans">
          Access restricted. Only Sikar super administrators can access the batch PDF parser.
        </div>
      )}

      {/* Compiled Tender Manual Add/Edit Modal */}
      <AnimatePresence>
        {activeTenderModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full border border-slate-100 shadow-2xl space-y-6 relative overflow-visible max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[9px] bg-green-100 text-green-700 font-black uppercase tracking-widest px-2.5 py-1 rounded-full font-sans">
                    {activeTenderModal === 'new' ? 'Add Tender Manually' : 'Edit Compiled Tender'}
                  </span>
                  <h3 className="font-extrabold text-slate-800 text-lg leading-snug mt-2 font-sans">
                    {activeTenderModal === 'new' ? 'New Tender Record' : 'Refine Tender Parameters'}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveTenderModal(null)}
                  className="p-2 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X size={18} className="text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSaveTenderForm} className="space-y-4 font-sans">
                {/* 1. Tender ID & Portal Source */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Tender ID / Ref No.</label>
                    <input
                      type="text"
                      required
                      value={modalTenderId}
                      onChange={(e) => setModalTenderId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Sourcing Portal</label>
                    <select
                      value={modalSourcePlatform}
                      onChange={(e) => setModalSourcePlatform(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
                    >
                      <option value="eProcurement">eProcurement System (CPPP)</option>
                      <option value="GeM">Government e-Marketplace (GeM)</option>
                      <option value="Indian Tenders">Indian Tenders Portal</option>
                    </select>
                  </div>
                </div>

                {/* 2. State, District, and Block/Tehsil */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">State</label>
                    <select
                      value={modalState}
                      onChange={(e) => setModalState(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
                    >
                      <option value="Rajasthan">Rajasthan</option>
                      <option value="Haryana">Haryana</option>
                      <option value="Delhi">Delhi</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">District</label>
                    <select
                      value={modalDistrict}
                      onChange={(e) => setModalDistrict(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
                    >
                      <option value="Sikar">Sikar</option>
                      <option value="Jaipur">Jaipur</option>
                      <option value="Churu">Churu</option>
                      <option value="Jhunjhunu">Jhunjhunu</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Block / Tehsil</label>
                    <select
                      value={modalBlock}
                      onChange={(e) => setModalBlock(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
                    >
                      <option value="Fatehpur">Fatehpur (फतेहपुर)</option>
                      <option value="Laxmangarh">Laxmangarh (लक्ष्मणगढ़)</option>
                      <option value="Dantaramgarh">Dantaramgarh</option>
                      <option value="Neem Ka Thana">Neem Ka Thana</option>
                      <option value="Sri Madhopur">Sri Madhopur</option>
                      <option value="Khandela">Khandela</option>
                      <option value="Dhod">Dhod</option>
                      <option value="Piprali">Piprali</option>
                      <option value="Sikar">Sikar City</option>
                      <option value="Churu">Churu Block</option>
                    </select>
                  </div>
                </div>

                {/* 3. Bid Price & Numeric value representation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Estimated Cost Text</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ₹15,00,000 (Estimate)"
                      value={modalPrice}
                      onChange={(e) => setModalPrice(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Numeric Cost (INR Rupee)</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 1500000"
                      value={modalNumericCost}
                      onChange={(e) => setModalNumericCost(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all font-sans"
                    />
                  </div>
                </div>

                {/* 4. Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Tender Date</label>
                    <input
                      type="date"
                      required
                      value={modalDate}
                      onChange={(e) => setModalDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Submission Deadline</label>
                    <input
                      type="date"
                      required
                      value={modalEndDate}
                      onChange={(e) => setModalEndDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all font-sans"
                    />
                  </div>
                </div>

                {/* 5. PDF Uploaded Document Url Refiner */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Original PDF Preview/Download URL (Optional)</label>
                  <input
                    type="url"
                    placeholder="e.g. https://firebasestorage.googleapis.com/.../tender.pdf"
                    value={modalPdfUrl}
                    onChange={(e) => setModalPdfUrl(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all font-sans"
                  />
                </div>

                {/* 6. Issuing office and location details */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Issuing Office / Department Name</label>
                  <input
                    type="text"
                    required
                    value={modalOffice}
                    onChange={(e) => setModalOffice(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all font-sans"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Address / Sourcing Location</label>
                  <input
                    type="text"
                    required
                    value={modalAddress}
                    onChange={(e) => setModalAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all font-sans"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Subject Description & Scope of Work</label>
                  <textarea
                    required
                    rows={3}
                    value={modalSubject}
                    onChange={(e) => setModalSubject(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-300 font-sans"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setActiveTenderModal(null)}
                    className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors bg-slate-50 hover:bg-slate-100 font-sans"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black text-[10px] uppercase tracking-widest py-3 px-6 rounded-2xl transition-all shadow-md active:scale-95 font-sans"
                  >
                    {activeTenderModal === 'new' ? 'Approve Entry' : 'Update Row'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Proposal Bid Modal */}
      <AnimatePresence>
        {biddingTender && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full border border-slate-100 shadow-2xl space-y-6 relative overflow-hidden"
            >
              <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/5 rounded-full blur-[30px] pointer-events-none" />
              
              <div>
                <span className="text-[9px] bg-blue-100 text-blue-700 font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                  Contract Bidding Pipeline
                </span>
                <h3 className="font-extrabold text-slate-800 text-lg leading-snug mt-2">
                  {biddingTender.title}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{biddingTender.authority} • Est: {biddingTender.value}</p>
              </div>

              <form onSubmit={handleSubmitBid} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">
                    Your Bid Offer (₹)
                  </label>
                  <input
                    type="number"
                    required
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder="Enter bid amount in Rupees"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all"
                  />
                  <p className="text-[9px] text-slate-400 mt-1 px-1 font-normal">
                    Provide a quote. Typically 5-15% margin ensures ideal selection chances.
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">
                    Contact Mobile Number
                  </label>
                  <input
                    type="text"
                    required
                    value={bidContact}
                    onChange={(e) => setBidContact(e.target.value)}
                    placeholder="E.g. 10 Digit Mobile"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">
                    Proposal Notes / Fleet Details
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={bidNotes}
                    onChange={(e) => setBidNotes(e.target.value)}
                    placeholder="Describe how your fleet/tractor can supply the orders..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-300"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setBiddingTender(null)}
                    className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors bg-slate-50 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest py-3 px-6 rounded-2xl transition-all shadow-md active:scale-95"
                  >
                    Submit Quotation
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PDF View Modal Overlay */}
      <AnimatePresence>
        {previewPdfUrl && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] w-full max-w-5xl h-[85vh] border border-slate-100 shadow-2xl flex flex-col relative overflow-hidden font-sans"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <div>
                    <span className="text-[9px] bg-red-100 text-red-700 font-extrabold uppercase px-2 py-0.5 rounded font-sans">
                      Tender PDF Document View
                    </span>
                    <h4 className="font-extrabold text-sm text-slate-800 tracking-tight block max-w-sm truncate md:max-w-xl">
                      {previewPdfName}
                    </h4>
                  </div>
                </div>
                
                <div className="flex items-center gap-2.5">
                  {/* Download button inside the preview */}
                  <button
                    type="button"
                    onClick={() => handleForceDownload(previewPdfUrl, `${previewPdfName.replace(/[^a-zA-Z0-9]/g, '_')}_Document.pdf`)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 inline-flex items-center gap-1.5 font-sans cursor-pointer"
                  >
                    <FileDown size={14} />
                    Download File
                  </button>
                  
                  {/* Close button */}
                  <button
                    onClick={() => {
                      setPreviewPdfUrl(null);
                      setPreviewPdfName('');
                    }}
                    className="p-2 hover:bg-slate-200/80 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Viewport IFrame Container representing real high fidelity */}
              <div className="flex-1 bg-slate-100 relative">
                {/* Embedded PDF iframe */}
                <iframe
                  src={`${previewPdfUrl}#toolbar=1`}
                  className="w-full h-full border-none"
                  title="PDF Viewer"
                />
                
                {/* Overlay helper block in case iframe sandboxes or blocks embed */}
                <div className="absolute bottom-4 right-4 bg-slate-900/90 text-white px-3 py-2 rounded-xl flex items-center gap-2 text-[10px] font-bold shadow-lg pointer-events-auto">
                  <span>If preview doesn't load:</span>
                  <a
                    href={previewPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    Open directly <Eye size={10} />
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification Container */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] flex items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl overflow-hidden font-sans"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm">
                {toast.type === 'error' ? '❌' : toast.type === 'info' ? 'ℹ️' : '✅'}
              </span>
              <p className="text-xs font-bold leading-relaxed">{toast.message}</p>
            </div>
            <button 
              type="button"
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Delete Compiled Tender Dialog */}
      <AnimatePresence>
        {deleteTenderId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 md:p-8 max-w-sm w-full relative overflow-hidden font-sans text-center"
            >
              <div className="mx-auto w-14 h-14 bg-red-50 text-red-650 rounded-2xl flex items-center justify-center mb-4">
                <Trash2 size={24} />
              </div>
              <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-2">Delete Compiled Tender?</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">
                Are you sure you want to permanently delete this compiled tender log entry? This operation cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTenderId(null)}
                  className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeDeleteCompiledTender}
                  className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-red-600 hover:bg-red-700 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Clear All Dialog */}
      <AnimatePresence>
        {showClearAllConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 md:p-8 max-w-sm w-full relative overflow-hidden font-sans text-center"
            >
              <div className="mx-auto w-14 h-14 bg-red-100 text-red-700 rounded-2xl flex items-center justify-center mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-2">Clear All Accrued Tenders?</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">
                <strong>WARNING:</strong> This action will permanently clear <strong>all</strong> accrued compiled tenders in the database. This is a bulk erase.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearAllConfirm(false)}
                  className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeClearAllCompiled}
                  className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-red-600 hover:bg-red-700 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  Yes, Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Cancel Bid Dialog */}
      <AnimatePresence>
        {cancelBidId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 md:p-8 max-w-sm w-full relative overflow-hidden font-sans text-center"
            >
              <div className="mx-auto w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4">
                <X size={24} />
              </div>
              <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-2">Remove Bid Proposal?</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">
                Are you sure you want to cancel and remove this active proposal bid and clear assigned logistics track?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCancelBidId(null)}
                  className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeCancelBid}
                  className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-red-600 hover:bg-red-700 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  Yes, Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Bid Award Simulation Modal */}
      <AnimatePresence>
        {awardBidId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 md:p-8 max-w-sm w-full relative overflow-hidden font-sans text-center"
            >
              <div className="mx-auto w-14 h-14 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4">
                <Award size={26} />
              </div>
              <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-2">Simulate Award Approval?</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">
                Are you ready to simulate and accept Sikar PHED's contract token allocations on this driver logs? This sets the status to <strong>Awarded</strong>.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAwardBidId(null)}
                  className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeAwardBid}
                  className="flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-green-600 hover:bg-green-700 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  Yes, Award Contract
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
