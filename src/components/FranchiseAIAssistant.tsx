import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User, RefreshCw, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export default function FranchiseAIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      content: 'Namaste! Main aapka TankerWala AI Sahayak hoon. 💧\nFranchise ki kisi bhi problem (Driver App Sync, Monthly passes, Siren notifications, ya Billing) ko solve karne ke liye punchhein!'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    "Driver status sync nahi hai, kya karein?",
    "Monthly Water Can details kya hain?",
    "Siren alarm customer ke paas kaise bajega?",
    "Thermal invoice custom titles kaise milenge?"
  ];

  // Auto scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend?.trim() || inputValue.trim();
    if (!text) return;

    if (!textToSend) {
      setInputValue('');
    }

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user',
            content: msg.content
          }))
        })
      });

      if (!response.ok) {
        throw new Error('AI Server Response Error');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'model', content: data.text }]);
    } catch (error) {
      console.error('AI Support error:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          content: 'Sorry! Server se connect karne me problem aa rhi hai. Please verify your GEMINI_API_KEY is configured in Settings > Secrets and try again.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'model',
        content: 'Namaste! Chat cleared. Main aapka TankerWala AI Sahayak hoon. 💧 Kaise madad karu aapki?'
      }
    ]);
  };

  return (
    <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[9999]" id="franchise-ai-assistant">
      {/* Trigger Button with Draftly style 3D Floating & Shadow */}
      <motion.button
        whileHover={{ scale: 1.08, y: -4 }}
        whileTap={{ scale: 0.92, y: 1 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white rounded-full flex items-center justify-center cursor-pointer relative group border-t border-white/50 border-x border-white/30 border-b-[5px] border-indigo-800 shadow-[0_15px_30px_rgba(79,70,229,0.4),inset_0_2px_4px_rgba(255,255,255,0.4)] transition-all duration-150"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              key="close-icon"
            >
              <X size={26} strokeWidth={2.5} />
            </motion.div>
          ) : (
            <motion.div
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              key="sparkles-icon"
              className="relative flex items-center justify-center text-white"
            >
              <Sparkles size={26} strokeWidth={2.5} className="animate-pulse duration-1000" />
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-violet-500 shadow-sm border border-white/20"></span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tooltip */}
        {!isOpen && (
          <div className="absolute right-20 top-1/2 -translate-y-1/2 bg-slate-950/90 text-white text-xs font-black px-4 py-2 rounded-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all shadow-[0_10px_25px_rgba(0,0,0,0.15)] border border-white/10 pointer-events-none tracking-tight">
            AI Sahayak 💬
          </div>
        )}
      </motion.button>

      {/* Chat Drawer/Window - Draftly Style 3D Inset Glass Container */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9, rotateX: 10, rotateY: -10 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0, rotateY: 0 }}
            exit={{ opacity: 0, y: 50, scale: 0.9, rotateX: 10, rotateY: -10 }}
            transition={{ type: 'spring', damping: 18, stiffness: 120 }}
            className="absolute bottom-20 right-0 w-[calc(100vw-2rem)] sm:w-[420px] h-[550px] max-h-[calc(100vh-140px)] bg-white/90 backdrop-blur-2xl rounded-[2.5rem] border-t border-x border-white/60 border-b-[10px] border-slate-300/60 shadow-[0_30px_70px_rgba(8,112,184,0.25),inset_0_2px_4px_rgba(255,255,255,0.8)] flex flex-col overflow-hidden"
          >
            {/* Header with Glossy 3D Gradient & Inside Highlights */}
            <div className="p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white flex items-center justify-between border-b border-indigo-700/30 relative">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-white/35 z-20 pointer-events-none" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/25 shadow-inner">
                  <Bot size={22} className="text-white animate-bounce" style={{ animationDuration: '3s' }} />
                </div>
                <div>
                  <h3 className="font-sans font-black text-sm tracking-tight leading-none flex items-center gap-1.5 text-white">
                    AI Sahayak
                    <span className="flex h-2 w-2 rounded-full bg-green-400 border border-white/50 animate-pulse" />
                  </h3>
                  <span className="text-[10px] text-blue-100/90 font-bold block tracking-wider uppercase mt-1">Smart Franchise Helper</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={clearChat}
                  title="Clear Chat"
                  className="p-2 hover:bg-white/15 active:scale-90 rounded-xl text-white/90 hover:text-white transition-all cursor-pointer border border-transparent hover:border-white/10"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/15 active:scale-90 rounded-xl text-white/90 hover:text-white transition-all cursor-pointer border border-transparent hover:border-white/10"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Message Thread (3D bubble styles) */}
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50 space-y-4 scrollbar-thin">
              {messages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-2 w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role !== 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-violet-100 border border-violet-200/60 shadow-sm flex items-center justify-center text-violet-600 shrink-0 self-end">
                      <Bot size={16} />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] p-4 rounded-3xl text-xs leading-relaxed whitespace-pre-wrap font-medium border transition-all ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-none border-blue-700 shadow-[0_8px_20px_rgba(37,99,235,0.15),inset_0_1px_2px_rgba(255,255,255,0.3)]'
                        : 'bg-white text-slate-800 border-slate-100 border-b-[3px] border-b-slate-200 rounded-bl-none shadow-[0_8px_20px_rgba(0,0,0,0.03)]'
                    }`}
                  >
                    {msg.content}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-blue-100 border border-blue-200/60 shadow-sm flex items-center justify-center text-blue-600 shrink-0 self-end">
                      <User size={16} />
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Bot Loading Indicator */}
              {loading && (
                <div className="flex gap-2 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-violet-100 border border-violet-200/60 shadow-sm flex items-center justify-center text-violet-600 shrink-0 self-end">
                    <Bot size={16} />
                  </div>
                  <div className="bg-white text-slate-500 border border-slate-100 border-b-[3px] border-b-slate-200 p-4 rounded-3xl rounded-bl-none shadow-[0_8px_20px_rgba(0,0,0,0.03)] text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions Box with 3D Action Pill Styling */}
            <div className="p-4 border-t border-slate-100/80 bg-white/75 flex flex-col gap-1.5 shrink-0 select-none">
              <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase mb-0.5">Quick Help Prompts:</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(s)}
                    disabled={loading}
                    className="text-[10px] text-slate-700 font-bold bg-white hover:bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-200 border-b-2 hover:border-b active:border-b-0 translate-y-0 active:translate-y-[2px] shadow-sm hover:shadow transition-all text-left truncate max-w-full duration-100 disabled:opacity-50 cursor-pointer"
                  >
                    💬 {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Box with physical design depth */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="p-4 border-t border-slate-150/80 bg-white/95 flex items-center gap-2.5 shrink-0"
            >
              <input
                type="text"
                placeholder="Type your issue here..."
                className="flex-1 bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 text-xs px-4 py-3 rounded-2xl font-semibold border-b-[3px] border-b-slate-300/40 transition-all"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || loading}
                className="w-11 h-11 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl flex items-center justify-center shrink-0 hover:from-blue-700 hover:to-indigo-700 active:scale-95 border-b-[3px] border-indigo-800 disabled:border-b-0 disabled:translate-y-[3px] disabled:bg-slate-100 disabled:text-slate-400 transition-all cursor-pointer shadow-md"
              >
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
