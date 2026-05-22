import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { FileText, Wand2, Download, Printer, Loader2, Paperclip, Search } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Franchise, Bill } from '../types';
import { format } from 'date-fns';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface LetterheadGeneratorProps {
  currentFranchise: Franchise | null;
}

export function LetterheadGenerator({ currentFranchise }: LetterheadGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [referenceFile, setReferenceFile] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  const [tokenNo, setTokenNo] = useState('');
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  
  const letterRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File size should be less than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = (event.target?.result as string).split(',')[1];
      setReferenceFile({
        data: base64String,
        mimeType: file.type || 'application/octet-stream',
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const generateLetter = async () => {
    if (!prompt.trim() && !referenceFile) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          prompt: prompt,
          fileData: referenceFile?.data,
          mimeType: referenceFile?.mimeType
        })
      });
      if (!res.ok) {
        throw new Error('Failed to generate');
      }
      const data = await res.json();
      setContent(data.text);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchToken = async () => {
    if (!tokenNo.trim() || !currentFranchise) return;
    setIsFetchingToken(true);
    try {
      const q = query(
        collection(db, 'bills'),
        where('franchiseId', '==', currentFranchise.id),
        where('billNumber', '==', tokenNo.trim())
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        alert("Token not found");
        return;
      }
      const billData = snap.docs[0].data() as Bill;
      
      const thermalContent = `[ TOKEN RECEIPT ]
Token No: ${billData.billNumber}
Date: ${billData.date?.toDate ? format(billData.date.toDate(), 'dd/MM/yyyy hh:mm a') : 'N/A'}
Customer: ${billData.customerName || 'Walk-in'}
Contact: ${billData.customerMobile || 'N/A'}
Quantity: ${billData.quantity} ${billData.category === 'BOTTLE' ? billData.bottleSize : (billData.tankerSize || 'Tankers')}
Category: ${billData.category}

Subtotal: ₹${billData.totalAmount}
Extra Charges: ₹${billData.extraCharges || 0}
Discount: ₹${billData.discount}
Grand Total: ₹${billData.grandTotal}
Payment Mode: ${billData.paymentMode}
${billData.splitPayments?.pending ? `Pending Amount: ₹${billData.splitPayments.pending}` : ''}
`;
      setContent(thermalContent);
    } catch (err) {
      console.error(err);
      alert("Error fetching token");
    } finally {
      setIsFetchingToken(false);
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: letterRef,
    documentTitle: `Letterpad_${format(new Date(), 'dd_MMM_yyyy')}`,
  });

  const downloadPdf = async () => {
    if (!letterRef.current) return;
    const canvas = await html2canvas(letterRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Letterhead_${format(new Date(), 'dd_MM_yyyy')}.pdf`);
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-6">
      {/* Settings / Prompt Panel */}
      <div className="w-full md:w-1/3 flex flex-col gap-4 overflow-y-auto pb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Wand2 size={24} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">AI Letterpad</h2>
              <p className="text-xs text-slate-500">Generate professional letters instantly</p>
            </div>
          </div>

          <label className="block text-sm font-bold text-slate-700 mb-2">Instructions for AI (Hindi/English)</label>
          <textarea
            className="w-full h-24 rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none resize-none transition-all mb-3"
            placeholder="e.g. Write a letter to regular customers wishing them Happy Diwali..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          ></textarea>

          <label className="block text-sm font-bold text-slate-700 mb-2">Reference Document (Optional)</label>
          <div className="flex items-center gap-3 mb-4">
             <label className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-3 cursor-pointer hover:bg-slate-50 transition-colors">
               <Paperclip size={18} className="text-slate-400" />
               <span className="text-sm text-slate-600 font-medium truncate">
                 {referenceFile ? referenceFile.name : 'Attach PDF/Doc'}
               </span>
               <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleFileUpload} />
             </label>
             {referenceFile && (
               <button onClick={() => setReferenceFile(null)} className="text-red-500 text-xs font-bold px-2">Clear</button>
             )}
          </div>

          <button
            onClick={generateLetter}
            disabled={isGenerating || (!prompt.trim() && !referenceFile)}
            className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
            {isGenerating ? 'Drafting...' : 'Generate Letter'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
           <h3 className="font-bold text-slate-800 text-sm mb-3">Load Bill (Invoice)</h3>
           <div className="flex gap-2">
             <input
               type="text"
               placeholder="Enter Bill No."
               value={tokenNo}
               onChange={(e) => setTokenNo(e.target.value)}
               className="flex-1 h-12 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500"
             />
             <button
               onClick={fetchToken}
               disabled={isFetchingToken || !tokenNo}
               className="h-12 px-4 bg-indigo-50 text-indigo-600 font-bold rounded-xl flex items-center gap-2 hover:bg-indigo-100 disabled:opacity-50"
             >
               {isFetchingToken ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
             </button>
           </div>
        </div>

        {content && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
             <h3 className="font-bold text-slate-800 text-sm">Actions</h3>
             <button
                onClick={() => handlePrint()}
                className="w-full flex items-center justify-center gap-2 bg-blue-50 text-blue-600 py-3 rounded-xl font-bold hover:bg-blue-100 transition-colors"
              >
                <Printer size={18} /> Print Letterpad
              </button>
              <button
                onClick={downloadPdf}
                className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                <Download size={18} /> Download PDF
              </button>
          </div>
        )}
      </div>

      {/* Preview Panel */}
      <div className="w-full md:w-2/3 flex flex-col bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden items-center justify-start p-4 md:p-8 overflow-y-auto">
        <div 
           ref={letterRef}
           style={{
            width: '210mm',
            minHeight: '297mm',
            padding: '20mm',
            backgroundColor: 'white',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
           }}
           className="relative flex flex-col shrink-0"
        >
          {/* Header */}
          <div className="border-b-4 border-blue-900 pb-4 mb-8 flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-black text-blue-900 uppercase tracking-tighter">
                  {currentFranchise ? currentFranchise.name : 'TANKERWALA'}
                </h1>
                <p className="text-slate-500 font-bold text-xs mt-1 flex items-center gap-1 uppercase tracking-widest">
                  Water Supply Services Only
                </p>
             </div>
             <div className="text-right text-[11px] text-slate-600 space-y-0.5">
               {currentFranchise?.proprietorName && <p className="font-bold text-slate-800 text-xs">Prop: {currentFranchise.proprietorName}</p>}
               {currentFranchise?.email && <p>{currentFranchise.email}</p>}
               {currentFranchise?.location && <p>{currentFranchise.location}</p>}
               <div className="flex flex-col items-end gap-0.5 mt-1 pt-1 border-t border-slate-100">
                 {currentFranchise?.gstNumber && <p>GSTIN: <span className="font-bold text-slate-900">{currentFranchise.gstNumber}</span></p>}
                 {currentFranchise?.aadharNumber && <p>Aadhar: <span className="font-bold text-slate-900">{currentFranchise.aadharNumber}</span></p>}
               </div>
               <p className="font-bold text-slate-900 pt-1">Date: {format(new Date(), 'dd/MM/yyyy')}</p>
             </div>
          </div>

          {/* Editable Body */}
          <textarea
             className="flex-1 text-slate-800 leading-relaxed text-[15px] whitespace-pre-wrap w-full resize-none outline-none font-sans bg-transparent"
             value={content}
             onChange={(e) => setContent(e.target.value)}
             placeholder="Your generated letter content will appear here... (You can also type manually)"
             style={{ minHeight: '150mm' }}
          />

          {/* Footer */}
          <div className="mt-12 pt-8 flex justify-end">
             <div className="text-center">
                 <div className="w-40 border-b border-slate-400 mb-2"></div>
                 <p className="font-bold text-slate-800 text-sm">Authorized Signatory</p>
                 <p className="text-xs text-slate-500">{currentFranchise?.name}</p>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
