import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { FileText, Wand2, Download, Printer, Loader2, Paperclip, Search } from 'lucide-react';
import { Logo } from './Logo';
import { useReactToPrint } from 'react-to-print';
import { generatePDF } from '../lib/pdfUtils';
import { Franchise, Bill } from '../types';
import { format } from 'date-fns';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface LetterheadGeneratorProps {
  currentFranchise: Franchise | null;
}

export function LetterheadGenerator({ currentFranchise }: LetterheadGeneratorProps) {
  const templateId = currentFranchise?.letterheadTemplateId || 'classic-royal';
  
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [referenceFile, setReferenceFile] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  const [tokenNo, setTokenNo] = useState('');
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  
  const [usedReferences, setUsedReferences] = useState<any[]>([]);
  const [selectedReference, setSelectedReference] = useState<any | null>(null);
  
  const letterRef = useRef<HTMLDivElement>(null);

  const [letterDate, setLetterDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const parsedDate = letterDate ? new Date(letterDate + 'T00:00:00') : new Date();

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
    setUsedReferences([]);
    try {
      // Fetch latest vault files to groundedly parse in Gemini context
      let vaultDocs: any[] = [];
      try {
        const querySnap = await getDocs(collection(db, 'documents'));
        vaultDocs = querySnap.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name,
            url: d.url,
            type: d.type || ''
          };
        });
      } catch (dbErr) {
        console.warn("Failed to query documents vault:", dbErr);
      }

      const res = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          prompt: prompt,
          fileData: referenceFile?.data,
          mimeType: referenceFile?.mimeType,
          vaultDocuments: vaultDocs
        })
      });
      if (!res.ok) {
        let errMsg = 'Failed to generate';
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      setContent(data.text);
      if (data.usedReferences) {
        setUsedReferences(data.usedReferences);
      }
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
    documentTitle: `Letterpad_${format(parsedDate, 'dd_MMM_yyyy')}`,
  });

  const downloadPdf = async () => {
    if (!letterRef.current) return;
    try {
      await generatePDF(letterRef.current, `Letterhead_${format(parsedDate, "dd_MM_yyyy")}`);
    } catch (err: any) {
      console.error("Error exporting PDF:", err);
      alert("Error generating PDF: " + err.message);
    }
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

          <label className="block text-sm font-bold text-slate-700 mb-2">Letter Date</label>
          <input
            type="date"
            value={letterDate}
            onChange={(e) => setLetterDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all mb-4 font-bold text-slate-800"
          />

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

        {usedReferences.length > 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-indigo-200 p-5 shadow-sm flex flex-col gap-3">
             <div className="flex items-center gap-2">
               <span className="text-sm font-black text-indigo-950 uppercase tracking-wider">📎 AI Referenced Vault Files</span>
             </div>
             <p className="text-[11px] text-slate-500 leading-normal">The AI analyzed these active documents to draft the letterhead text:</p>
             <div className="flex flex-col gap-2">
               {usedReferences.map((refObj) => (
                 <button
                   key={refObj.id}
                   onClick={() => setSelectedReference(refObj)}
                   className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-indigo-50/20 hover:border-indigo-100 transition-all group"
                 >
                   <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                     <FileText size={16} />
                   </div>
                   <div className="flex-1 min-w-0">
                     <p className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{refObj.name}</p>
                     <p className="text-[9px] text-slate-400 font-medium uppercase font-sans">{refObj.type ? refObj.type.split('/')[1] || 'DOC' : 'DOC'}</p>
                   </div>
                 </button>
               ))}
             </div>
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
           className="relative flex flex-col shrink-0 text-slate-800"
        >
          {/* Subtle Decorative Background Watermark */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none z-0">
            {templateId === 'classic-royal' && (
              <div className="flex flex-col items-center gap-2">
                <Logo size={280} className="text-blue-950" />
                <span className="text-3xl font-black uppercase tracking-[0.2em] text-blue-900 font-sans">TANKERWALA</span>
              </div>
            )}
            {templateId === 'emerald-clean' && (
              <div className="flex flex-col items-center gap-2">
                <Logo size={280} className="text-emerald-950" />
                <span className="text-3xl font-black uppercase tracking-[0.2em] text-emerald-950 font-sans">ECOLOGICAL</span>
              </div>
            )}
            {templateId === 'tech-slate' && (
              <div className="flex flex-col items-center gap-3">
                <Logo size={250} className="text-slate-900" />
                <span className="text-2xl font-mono uppercase tracking-[0.3em] text-slate-900">BULK SERVICE</span>
              </div>
            )}
            {templateId === 'warm-saffron' && (
              <div className="flex flex-col items-center gap-2 font-serif">
                <Logo size={280} className="text-amber-900" />
                <span className="text-3xl font-black uppercase tracking-[0.2em] text-amber-900 font-serif">PURE AND SAFE WATER</span>
              </div>
            )}
          </div>

          {/* Dynamic Template Headers */}
          {templateId === 'classic-royal' && (
            <div className="border-b-[5px] border-blue-900 pb-5 mb-8 flex justify-between items-start z-10 w-full text-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Logo size={42} className="text-blue-900" />
                  <h1 className="text-3xl font-black text-blue-900 uppercase tracking-tighter">
                    {currentFranchise ? currentFranchise.name : 'TANKERWALA'}
                  </h1>
                </div>
                <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1">
                  🚰 PREMIUM WATER SUPPLY SERVICES
                </p>
                <p className="text-slate-400 font-medium text-[9px] uppercase tracking-wider">
                  Fast • Pure • Reliable Delivery
                </p>
              </div>
              <div className="text-right text-[10px] text-slate-600 space-y-0.5">
                {currentFranchise?.proprietorName && <p className="font-bold text-slate-800 text-[11px]">Prop: {currentFranchise.proprietorName}</p>}
                <p className="font-medium text-slate-700">✉ Email: {currentFranchise?.email || 'N/A'}</p>
                <p className="font-medium text-slate-700">📍 Address: {currentFranchise?.location || 'Rajasthan, India'}</p>
                <div className="flex flex-col items-end gap-0.5 mt-1 pt-1 border-t border-slate-200">
                  {currentFranchise?.gstNumber && <p className="font-medium text-slate-700">GSTIN: <span className="font-bold text-slate-900">{currentFranchise.gstNumber}</span></p>}
                  {currentFranchise?.aadharNumber && <p className="font-medium text-slate-700">Aadhar: <span className="font-bold text-slate-900">{currentFranchise.aadharNumber}</span></p>}
                </div>
                <p className="font-black text-blue-900 pt-1.5 text-xs">Date: {format(parsedDate, 'dd/MM/yyyy')}</p>
              </div>
            </div>
          )}

          {templateId === 'emerald-clean' && (
            <div className="border-l-[6px] border-emerald-700 pl-6 pb-4 mb-8 flex justify-between items-start z-10 w-full text-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-200">
                    <Logo size={28} className="text-emerald-700" />
                  </div>
                  <h1 className="text-3xl font-black text-emerald-800 uppercase tracking-tight">
                    {currentFranchise ? currentFranchise.name : 'TANKERWALA'}
                  </h1>
                </div>
                <p className="text-emerald-600 font-extrabold text-[10px] uppercase tracking-widest">
                  🌱 PURE MINERAL & DRINKING WATER CO.
                </p>
                <p className="text-slate-400 font-semibold text-[9px] tracking-normal mt-0.5">
                  Government Certified Supplier & Logistics
                </p>
              </div>
              <div className="text-right text-[10px] text-slate-600 space-y-0.5">
                {currentFranchise?.proprietorName && <p className="font-bold text-emerald-950 text-[11px] uppercase tracking-wider">Proprietor: {currentFranchise.proprietorName}</p>}
                <p className="font-semibold text-slate-500">Contact: {currentFranchise?.email || 'N/A'}</p>
                <p className="font-semibold text-slate-500">{currentFranchise?.location || 'Rajasthan, India'}</p>
                <div className="flex flex-col items-end gap-0.5 mt-1 pt-1 border-t border-emerald-100">
                  {currentFranchise?.gstNumber && <p>GSTIN: <span className="font-mono text-emerald-800 font-bold">{currentFranchise.gstNumber}</span></p>}
                  {currentFranchise?.aadharNumber && <p>UIDAI: <span className="font-mono text-emerald-800 font-bold">{currentFranchise.aadharNumber}</span></p>}
                </div>
                <p className="font-extrabold text-emerald-800 pt-1.5 text-xs">Dated: {format(parsedDate, 'dd/MM/yyyy')}</p>
              </div>
            </div>
          )}

          {templateId === 'tech-slate' && (
            <div className="border-b border-slate-200 pb-6 mb-8 flex justify-between items-end bg-slate-50 p-6 rounded-2xl border border-slate-100 z-10 w-full text-slate-805 font-mono">
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <Logo size={32} className="text-slate-800" />
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase font-sans">
                    {currentFranchise ? currentFranchise.name : 'TANKERWALA'}
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[9px] text-slate-500 font-bold tracking-wider font-sans">
                  <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">INDUSTRIAL LOGISTICS</span>
                  <span>•</span>
                  <span className="bg-blue-105 text-blue-700 px-2 py-0.5 rounded-md">BULK RESERVES</span>
                </div>
              </div>
              <div className="text-right text-[10px] text-slate-600 font-mono space-y-0.5 bg-transparent">
                {currentFranchise?.proprietorName && <p className="font-bold text-slate-950 font-sans">[Prop: {currentFranchise.proprietorName}]</p>}
                <p className="text-slate-500">Ref: {currentFranchise?.email || 'N/A'}</p>
                <p className="text-slate-500">Loc: {currentFranchise?.location || 'Rajasthan, India'}</p>
                {currentFranchise?.gstNumber && <p className="text-slate-500">GST: {currentFranchise.gstNumber}</p>}
                <div className="pt-2 text-[11px] font-sans text-slate-950 font-black flex items-center justify-end gap-1">
                  <span>DATE:</span>
                  <span className="underline decoration-slate-800 decoration-2">{format(parsedDate, 'dd/MM/yyyy')}</span>
                </div>
              </div>
            </div>
          )}

          {templateId === 'warm-saffron' && (
            <div className="border-b-2 border-double border-amber-500 pb-5 mb-8 flex justify-between items-start relative overflow-hidden z-10 w-full text-slate-800 font-serif">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <Logo size={24} className="text-amber-600" />
                  </div>
                  <h1 className="text-3xl font-extrabold text-amber-700 tracking-tight uppercase">
                    {currentFranchise ? currentFranchise.name : 'TANKERWALA'}
                  </h1>
                </div>
                <p className="text-amber-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-1">
                  🕉️ PURE WATER FOREMOST • PURE TANK SERVICE
                </p>
                <p className="text-slate-400 font-bold text-[9px] uppercase tracking-wider font-sans">
                  Rajasthan Largest Bulk Water Carrier
                </p>
              </div>
              <div className="text-right text-[10px] text-slate-600 space-y-0.5">
                {currentFranchise?.proprietorName && <p className="font-black text-amber-800 text-[11.5px]">Operator: {currentFranchise.proprietorName}</p>}
                <p>Email: {currentFranchise?.email || 'N/A'}</p>
                <p>Location: {currentFranchise?.location || 'Rajasthan, India'}</p>
                <div className="flex flex-col items-end gap-0.5 mt-1 pt-1 border-t border-amber-200">
                  {currentFranchise?.gstNumber && <p>GST: <span className="font-black text-amber-900">{currentFranchise.gstNumber}</span></p>}
                  {currentFranchise?.aadharNumber && <p>Aadhar: <span className="font-black text-amber-900">{currentFranchise.aadharNumber}</span></p>}
                </div>
                <p className="font-black text-amber-700 pt-1.5 text-xs">Date: {format(parsedDate, 'dd/MM/yyyy')}</p>
              </div>
            </div>
          )}

          {/* Editable Body */}
          <textarea
             className="flex-1 text-slate-800 leading-relaxed text-[15px] whitespace-pre-wrap w-full resize-none outline-none font-sans bg-transparent z-10"
             value={content}
             onChange={(e) => setContent(e.target.value)}
             placeholder="Your generated letter content will appear here... (You can also type manually)"
             style={{ minHeight: '150mm' }}
          />

          {/* Dynamic Template Footers */}
          <div className="mt-auto pt-8 flex justify-between items-end z-10 border-t border-slate-100/60 font-sans w-full">
            <div className="text-[9px] text-slate-400 font-bold max-w-[280px]">
              <p>This is an official computer-generated AI letterhead document.</p>
              <p>Certified & managed by TankerWala Cloud Platform securely.</p>
            </div>
            
            {templateId === 'classic-royal' && (
              <div className="text-center bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <div className="w-44 border-b border-blue-900 mb-2"></div>
                <p className="font-extrabold text-blue-900 text-xs uppercase tracking-wider">Authorized Signatory</p>
                <p className="text-[10px] text-slate-500 font-medium">{currentFranchise?.name || 'TankerWala Sikar'}</p>
                <div className="mt-2 w-14 h-14 border border-dashed border-blue-200 rounded-full mx-auto flex items-center justify-center text-[7px] text-blue-300 font-extrabold uppercase select-none">
                  Seal / Stamp
                </div>
              </div>
            )}

            {templateId === 'emerald-clean' && (
              <div className="text-center bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                <p className="font-extrabold text-emerald-800 text-xs uppercase tracking-widest">AUTHORIZED SIGNATURE</p>
                <p className="text-[10px] text-emerald-700 font-semibold mb-2">{currentFranchise?.name || 'TankerWala Sikar'}</p>
                <div className="w-36 h-0.5 bg-emerald-200 mx-auto"></div>
                <div className="mt-1 text-[7.5px] uppercase font-bold tracking-widest text-emerald-400">Official Stamp</div>
              </div>
            )}

            {templateId === 'tech-slate' && (
              <div className="text-right font-mono p-4 rounded-xl border border-slate-100 bg-slate-50/30">
                <p className="font-black text-slate-900 text-xs">[SIGNED DIGITALLY]</p>
                <p className="text-[9.5px] text-slate-500">{currentFranchise?.name || 'TankerWala Sikar'}</p>
                <p className="text-[8px] text-indigo-500">HASH_ID: #{currentFranchise?.id?.substring(0, 8).toUpperCase()}</p>
              </div>
            )}

            {templateId === 'warm-saffron' && (
              <div className="text-center font-serif p-4 rounded-xl border border-amber-100 bg-amber-50/30">
                <div className="w-44 border-b-2 border-amber-500 mb-2"></div>
                <p className="font-black text-amber-900 text-xs font-sans">Authorized Signatory (Signed)</p>
                <p className="text-[10.5px] text-amber-700 font-bold">{currentFranchise?.name || 'TankerWala Sikar'}</p>
                <div className="mt-2 w-12 h-12 border border-dotted border-amber-400 rounded-md mx-auto flex items-center justify-center text-[8px] text-amber-450 font-sans font-bold select-none leading-none">
                  Seal / Stamp
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reference Document Preview Modal Overlay */}
      {selectedReference && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-250">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 truncate max-w-[280px] md:max-w-md">{selectedReference.name}</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">{selectedReference.type || "Document"}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedReference(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Preview Area */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50 flex flex-col items-center justify-center min-h-[300px]">
              {selectedReference.url?.startsWith('data:image/') ? (
                <img 
                  src={selectedReference.url} 
                  alt={selectedReference.name}
                  referrerPolicy="no-referrer"
                  className="max-h-[50vh] object-contain rounded-lg border border-slate-200 shadow-sm"
                />
              ) : selectedReference.url?.startsWith('data:') ? (
                <pre className="w-full text-left font-mono text-xs text-slate-800 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-xl p-4 shadow-inner max-h-[50vh] overflow-y-auto">
                  {(() => {
                    try {
                      return atob(selectedReference.url.split(',')[1]);
                    } catch (e) {
                      return "Unsupported raw content binary formatting.";
                    }
                  })()}
                </pre>
              ) : selectedReference.url ? (
                <div className="text-center p-8 bg-white border border-slate-200 rounded-xl shadow-sm max-w-sm">
                  <FileText size={48} className="text-indigo-400 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-800 mb-1">Secure Cloud Document</p>
                  <p className="text-xs text-slate-500 mb-4 font-medium leading-normal">This file is stored in secure cloud Storage. Open in tab to see the content.</p>
                  <a 
                    href={selectedReference.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition"
                  >
                    Open Resource in New Tab
                  </a>
                </div>
              ) : (
                <p className="text-sm text-slate-500 font-medium">No preview representation available for this format.</p>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
              <button
                onClick={() => {
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) {
                    alert("Pop-up blocked. Please unlock pop-ups in your browser to print resources.");
                    return;
                  }
                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>Print - ${selectedReference.name}</title>
                        <style>
                          body { margin: 0; padding: 20px; font-family: sans-serif; text-align: center; }
                          img { max-width: 100%; height: auto; margin-top: 20px; }
                          pre { text-align: left; white-space: pre-wrap; word-break: break-all; background: #f8fafc; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; line-height: 1.5; }
                        </style>
                      </head>
                      <body>
                        <h2>${selectedReference.name}</h2>
                        <hr/>
                        ${selectedReference.url?.startsWith('data:image/') ? `<img src="${selectedReference.url}" />` : ''}
                        ${(!selectedReference.url?.startsWith('data:image/') && selectedReference.url?.startsWith('data:')) ? `<pre>${atob(selectedReference.url.split(',')[1])}</pre>` : ''}
                        ${!selectedReference.url?.startsWith('data:') ? `<p>Reference Link: <a href="${selectedReference.url}" target="_blank">${selectedReference.name}</a></p>` : ''}
                        <script>
                          window.onload = function() {
                            window.print();
                            setTimeout(function() { window.close(); }, 500);
                          };
                        </script>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-colors"
              >
                <Printer size={14} /> Print Resource
              </button>
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = selectedReference.url;
                  link.download = selectedReference.name;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-colors"
              >
                <Download size={14} /> Download Resource
              </button>
              <button
                onClick={() => setSelectedReference(null)}
                className="px-4 py-2 border border-slate-200 text-slate-555 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
