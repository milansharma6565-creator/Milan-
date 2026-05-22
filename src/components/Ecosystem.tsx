import React, { useState } from 'react';
import { Download, Smartphone, Globe, Copy, CheckCircle2 } from 'lucide-react';
import { copyToClipboard, getPublicAppUrl } from '../constants';

export function Ecosystem() {
  const [copiedLink, setCopiedLink] = useState('');

  const handleCopy = (link: string) => {
    copyToClipboard(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(''), 2000);
  };

  const apps = [
    {
      name: 'Driver App (PWA)',
      description: 'Progressive Web App for drivers to view trips, navigate, and add fuel. Works like a real app.',
      apkLink: '#',
      webLink: getPublicAppUrl().toString() + '?mode=driver',
      version: '1.5.0',
      size: 'Instant',
      color: 'blue'
    },
    {
      name: 'Customer App (PWA)',
      description: 'Progressive Web App for customers to book orders and track deliveries. Install on home screen.',
      apkLink: '#',
      webLink: getPublicAppUrl().toString() + '?mode=customer',
      version: '1.2.0',
      size: 'Instant',
      color: 'orange'
    }
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen">
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-4xl font-black flex items-center justify-center md:justify-start gap-3 text-slate-900 tracking-tight">
          <Globe className="text-indigo-600" size={40} />
          Official App Distribution
        </h1>
        <p className="text-slate-500 mt-3 font-medium text-lg">Distribute the official management apps to your fleet and customers.</p>
      </div>

      {/* Installation Guide */}
      <div className="mb-12 bg-indigo-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h2 className="text-2xl font-black mb-4 flex items-center gap-3">
            <Smartphone size={28} />
            How to Install "Real" Apps
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/10 p-5 rounded-2xl border border-white/10">
              <div className="font-black text-xl mb-2">01</div>
              <p className="text-sm font-medium opacity-90">Open the Web Link below in your phone's browser (Chrome/Safari).</p>
            </div>
            <div className="bg-white/10 p-5 rounded-2xl border border-white/10">
              <div className="font-black text-xl mb-2">02</div>
              <p className="text-sm font-medium opacity-90">Tap the "Share" or "Menu" icon and select <b>"Add to Home Screen"</b>.</p>
            </div>
            <div className="bg-white/10 p-5 rounded-2xl border border-white/10">
              <div className="font-black text-xl mb-2">03</div>
              <p className="text-sm font-medium opacity-90">The app will appear on your phone drawer just like a <b>Real APK</b>.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {apps.map((app) => {
          return (
            <div key={app.name} className="bg-white rounded-[3rem] p-8 border-2 border-slate-100 shadow-xl relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-40 h-40 rounded-bl-full -z-10 ${app.color === 'blue' ? 'bg-blue-50' : 'bg-orange-50'}`} />
              
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-5">
                  <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg ${app.color === 'blue' ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-orange-600 text-white shadow-orange-200'}`}>
                    <Smartphone size={40} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-800">{app.name}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${app.color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>Recommended</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">v{app.version}</span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-base text-slate-600 font-medium mb-10 leading-relaxed">
                {app.description}
              </p>

              <div className="space-y-4">
                <button 
                  onClick={() => handleCopy(app.webLink)}
                  className={`w-full flex items-center justify-center gap-3 text-white h-16 rounded-2xl font-black text-lg transition-all shadow-xl active:scale-95 ${app.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-200'}`}
                >
                  {copiedLink === app.webLink ? (
                    <>
                      <CheckCircle2 size={24} />
                      Link Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={24} />
                      Copy Download / Install Link
                    </>
                  )}
                </button>
                
                <a 
                  href={app.webLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white h-14 rounded-2xl font-bold transition-all"
                >
                  <Globe size={18} />
                  Open App Now
                </a>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-12 p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200 text-center">
        <h4 className="text-slate-900 font-black mb-2">Android APK Notice</h4>
        <p className="text-slate-500 text-sm font-medium">PWAs (Progressive Web Apps) are the modern standard. They use 0mb storage, update automatically, and bypass Play Store restrictions while providing the same "Real App" experience.</p>
      </div>
    </div>
  );
}
