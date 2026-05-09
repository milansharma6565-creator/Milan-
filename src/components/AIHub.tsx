import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, where, limit, getDocs } from 'firebase/firestore';
import { Tractor, DieselLog, Bill, Account, HydrantFilling, Voucher } from '../types';
import { 
  Sparkles, 
  Search, 
  Fuel, 
  TrendingUp, 
  AlertTriangle, 
  Briefcase, 
  ChevronRight, 
  RefreshCcw,
  Zap,
  IndianRupee,
  FileText,
  SearchCode,
  LineChart as LineChartIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../constants';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function AIHub() {
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [dieselLogs, setDieselLogs] = useState<DieselLog[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [fillings, setFillings] = useState<HydrantFilling[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  // AI State
  const [analyzing, setAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [searchingTenders, setSearchingTenders] = useState(false);
  const [tenderResults, setTenderResults] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubTractors = onSnapshot(collection(db, 'tractors'), snap => setTractors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tractor))));
    const unsubDiesel = onSnapshot(query(collection(db, 'dieselLogs'), orderBy('date', 'desc')), snap => setDieselLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as DieselLog))));
    const unsubBills = onSnapshot(query(collection(db, 'bills'), orderBy('date', 'desc'), limit(500)), snap => setBills(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bill))));
    const unsubFillings = onSnapshot(query(collection(db, 'hydrantFillings'), orderBy('date', 'desc'), limit(500)), snap => setFillings(snap.docs.map(d => ({ id: d.id, ...d.data() } as HydrantFilling))));
    const unsubAccounts = onSnapshot(collection(db, 'accounts'), snap => setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account))));
    const unsubVouchers = onSnapshot(query(collection(db, 'vouchers'), orderBy('date', 'desc'), limit(500)), snap => setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Voucher))));

    setLoading(false);
    return () => {
      unsubTractors();
      unsubDiesel();
      unsubBills();
      unsubFillings();
      unsubAccounts();
      unsubVouchers();
    };
  }, []);

  // Calculate Efficiency Metrics
  const efficiencyData = useMemo(() => {
    return tractors.map(tractor => {
      const tractorLogs = dieselLogs.filter(l => l.tractorId === tractor.id);
      if (tractorLogs.length < 2) return { 
        id: tractor.id, 
        name: tractor.name, 
        efficiency: 0, 
        status: 'Insufficient Data',
        fuelPercentage: 0,
        remainingFuel: '0',
        trips: 0,
        liters: 0
      };

      // Calculate total liters and total trips between first and last log
      const firstLogDate = new Date(tractorLogs[tractorLogs.length - 1].date);
      const lastLogDate = new Date(tractorLogs[0].date);
      
      const tripsCount = bills.filter(b => 
        b.tractorId === tractor.id && 
        new Date(b.date) >= firstLogDate && 
        new Date(b.date) <= lastLogDate
      ).length;

      const totalLiters = tractorLogs.reduce((sum, l) => sum + l.liters, 0);
      const avgTripsPerLiter = totalLiters > 0 ? (tripsCount / totalLiters).toFixed(2) : '0';
      
      // Predict current fuel
      const lastRefill = tractorLogs[0];
      const tripsSinceRefill = bills.filter(b => 
        b.tractorId === tractor.id && 
        new Date(b.date) > new Date(lastRefill.date)
      ).length;

      const estimatedConsumption = tripsSinceRefill / (Number(avgTripsPerLiter) || 1);
      const remainingFuel = Math.max(0, lastRefill.liters - estimatedConsumption);
      const fuelPercentage = Math.min(100, (remainingFuel / 60) * 100); // Assuming 60L tank avg

      return {
        id: tractor.id,
        name: tractor.name,
        efficiency: Number(avgTripsPerLiter),
        trips: tripsCount,
        liters: totalLiters,
        fuelPercentage,
        remainingFuel: remainingFuel.toFixed(1),
        status: fuelPercentage < 20 ? 'Critical' : fuelPercentage < 40 ? 'Low' : 'Good'
      };
    });
  }, [tractors, dieselLogs, bills]);

  const generateAIInsights = async () => {
    setAnalyzing(true);
    try {
      const dataSummary = {
        tractors: efficiencyData,
        financials: accounts.map(a => ({ name: a.name, balance: a.currentBalance, type: a.balanceType })),
        recentVouchers: vouchers.slice(0, 10).map(v => ({ type: v.type, amount: v.totalAmount, date: v.date.toDate?.() || v.date })),
      };

      const prompt = `
        You are a high-level Business Consultant for a Water Tanker Company in Sikar, Rajasthan.
        Analyze this business data and provide a strategic report in Hinglish (Hindi + English mix).
        
        Business Data:
        ${JSON.stringify(dataSummary)}

        Specifically address:
        1. Fuel Efficiency: Which tractor is costing more?
        2. Financial Health: Identify any bad debt risks or cash flow issues.
        3. Strategic Advice: How to grow the business in Sikar?
        4. Warnings: Any low fuel or critical maintenance alerts.

        Keep the tone professional yet energetic and practical. Use bullet points.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiReport(response.text);
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const searchTenders = async () => {
    setSearchingTenders(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Recent tanker and water supply tenders in Sikar, Rajasthan, and surrounding areas. Give a summary with dates if available.",
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
      setTenderResults(response.text);
    } catch (error) {
      console.error("Tender search failed:", error);
    } finally {
      setSearchingTenders(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200">
              <Sparkles size={28} />
            </div>
            <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">AI Business Hub</h1>
          </div>
          <p className="text-slate-500 font-medium">Predictive analytics and strategic growth consultant</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={generateAIInsights}
            disabled={analyzing}
            className="flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-slate-200 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {analyzing ? <RefreshCcw className="animate-spin" size={20} /> : <Zap size={20} />}
            {analyzing ? 'Analyzing Data...' : 'Generate AI Strategy'}
          </button>
        </div>
      </div>

      {/* Fuel Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-display font-black text-slate-900">Fuel IQ Tracking</h3>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Efficiency Per Trip Prediction</p>
              </div>
              <Fuel className="text-blue-500" size={32} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {efficiencyData.map(tractor => (
                <div key={tractor.id} className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-display font-black text-slate-800 text-lg">{tractor.name}</h4>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                        tractor.status === 'Critical' ? 'bg-red-100 text-red-600' : 
                        tractor.status === 'Low' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {tractor.status} Fuel
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-display font-black text-slate-900">{tractor.efficiency}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Trips / Liter</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-500">
                      <span>Fuel Remaining</span>
                      <span>{tractor.remainingFuel}L / 60L</span>
                    </div>
                    <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${tractor.fuelPercentage}%` }}
                        className={`h-full transition-all ${
                          tractor.fuelPercentage < 20 ? 'bg-red-500' : 
                          tractor.fuelPercentage < 40 ? 'bg-orange-500' : 'bg-green-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {efficiencyData.length === 0 && (
              <div className="py-20 text-center">
                <AlertTriangle className="mx-auto text-slate-300 mb-4" size={48} />
                <p className="text-slate-400 font-bold">No tractor data available for fuel intelligence.</p>
              </div>
            )}
          </div>

          {/* Efficiency Chart */}
          <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm h-[400px]">
             <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-display font-black text-slate-900">Efficiency Overview</h3>
              <LineChartIcon className="text-slate-400" size={24} />
            </div>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={efficiencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 700}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 700}} />
                <Tooltip 
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  cursor={{fill: '#f8fafc'}}
                />
                <Bar dataKey="efficiency" radius={[8, 8, 0, 0]} barSize={40}>
                  {efficiencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.efficiency > 0.5 ? '#10b981' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-8">
          <div className="bg-slate-900 rounded-[3rem] p-8 text-white shadow-2xl shadow-slate-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
              <SearchCode size={120} />
            </div>
            <h3 className="text-2xl font-display font-black mb-2">Tender Radar</h3>
            <p className="text-slate-400 text-sm mb-6">Live AI lookup for tanker tenders in Sikar</p>
            
            <button 
              onClick={searchTenders}
              disabled={searchingTenders}
              className="w-full bg-white text-slate-900 h-14 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-blue-50 transition-all disabled:opacity-50"
            >
              {searchingTenders ? <RefreshCcw className="animate-spin" size={20} /> : <Search size={20} />}
              {searchingTenders ? 'Scanning...' : 'Search Local Tenders'}
            </button>

            <AnimatePresence>
              {tenderResults && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-6 bg-slate-800/50 rounded-2xl p-4 text-xs font-medium text-slate-300 leading-relaxed border border-slate-700 max-h-60 overflow-y-auto whitespace-pre-wrap"
                >
                  {tenderResults}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm">
            <h3 className="text-xl font-display font-black text-slate-900 mb-6">Financial Guardian</h3>
            <div className="space-y-4">
              <AccountRiskCard icon={<AlertTriangle className="text-red-500" />} label="Bad Debt Risk" value={accounts.filter(a => a.currentBalance < -50000).length + " Accounts"} />
              <AccountRiskCard icon={<TrendingUp className="text-green-500" />} label="Ready Cash" value={formatCurrency(accounts.find(a => a.name === 'Cash')?.currentBalance || 0)} />
              <AccountRiskCard icon={<Briefcase className="text-blue-500" />} label="Pending Udhaar" value={formatCurrency(accounts.filter(a => a.balanceType === 'Dr' && a.currentBalance > 0).reduce((sum, a) => sum + a.currentBalance, 0))} />
            </div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-6 text-center">AI scans accounts hourly</p>
          </div>
        </div>
      </div>

      {/* AI Strategy Report */}
      <AnimatePresence>
        {aiReport && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[3.5rem] p-10 border-4 border-blue-100 shadow-2xl relative"
          >
            <div className="absolute top-6 right-10">
              <Sparkles className="text-blue-200" size={60} />
            </div>
            <div className="flex items-center gap-3 mb-8">
              <div className="px-5 py-2 bg-blue-600 text-white rounded-full text-xs font-black uppercase tracking-widest">
                AI Strategic Report
              </div>
              <span className="text-slate-400 font-bold text-sm">Real-time Analysis</span>
            </div>

            <div className="prose prose-slate max-w-none">
              <div className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                {aiReport}
              </div>
            </div>

            <div className="mt-10 pt-10 border-t border-slate-100 flex flex-col md:flex-row justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                  <FileText size={24} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Recommendation System</p>
                  <p className="text-sm font-bold text-slate-700">Actionable business steps generated</p>
                </div>
              </div>
              <button 
                onClick={() => setAiReport(null)}
                className="text-slate-400 font-black text-xs uppercase tracking-widest hover:text-red-500 transition-colors"
              >
                Clear Report
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountRiskCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:scale-[1.02] transition-transform">
      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
        <p className="text-sm font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
