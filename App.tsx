
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Participant, RaffleState, Purchase } from './types';
import NumberGrid from './components/NumberGrid';
import Dashboard from './components/Dashboard';
import { generateRaffleDescription, announceWinner, generatePrizeImage } from './services/geminiService';
import { dbService } from './services/databaseService';

const PAGE_SIZE = 100;
const INITIAL_PRICE = 0.00; 
const INITIAL_LIMIT = 1;
const INITIAL_PHONE_LIMIT = 1;
const TOTAL_NUMBERS = 1000000;
const RESERVATION_TIME = 5 * 60 * 1000;
const ADMIN_PASSWORD = "198830cb";

const raffleChannel = new BroadcastChannel('raffle_sync_channel');

interface Activity {
  id: string;
  user: string;
  number: number;
  time: number;
  type: 'reservation' | 'purchase';
}

const DEFAULT_DESCRIPTION = `🔥 RIFA 100% GRÁTIS! 🔥
Para participar e validar seu bilhete, você precisa:
✅ Siga todos os nossos patrocinadores.
✅ Compartilhe esta rifa nos seus Stories e marque nossa página.
✅ Curta a foto oficial no Instagram!`;

const App: React.FC = () => {
  const [raffle, setRaffle] = useState<RaffleState>({
    totalNumbers: TOTAL_NUMBERS, pricePerNumber: INITIAL_PRICE, maxPurchaseLimit: INITIAL_LIMIT,
    maxEntriesPerPhone: INITIAL_PHONE_LIMIT, soldNumbers: new Set<number>(),
    numberOwners: new Map<number, string>(), reservedNumbers: new Map<number, { expiresAt: number }>(),
    participants: new Map<string, Participant>(), phoneToNumbers: new Map<string, number[]>(),
    emailToNumbers: new Map<string, number[]>(), participantToNumbers: new Map<string, number[]>(),
  });

  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('raffle_is_admin') === 'true');
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState("");
  const [prizeName, setPrizeName] = useState(() => localStorage.getItem('raffle_prize_name') || "RIFA GRÁTIS! R$500 NO PIX ou CAPACETE");
  const [prizeImage, setPrizeImage] = useState(() => localStorage.getItem('raffle_prize_image') || "");
  const [tempDescription, setTempDescription] = useState(() => localStorage.getItem('raffle_description') || DEFAULT_DESCRIPTION);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [onlineUsers, setOnlineUsers] = useState(124);

  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPurchasing, setIsPurchasing] = useState<number[] | null>(null);
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [myPurchases, setMyPurchases] = useState<Purchase[]>([]);

  // Inicialização da Base de Dados
  useEffect(() => {
    const initDb = async () => {
      await dbService.init();
      const saved = await dbService.loadState();
      if (saved) {
        setRaffle({
          ...saved,
          soldNumbers: new Set(saved.soldNumbers),
          numberOwners: new Map(saved.numberOwners),
          reservedNumbers: new Map(),
          participants: new Map(saved.participants),
          phoneToNumbers: new Map(saved.phoneToNumbers),
          emailToNumbers: new Map(saved.emailToNumbers),
          participantToNumbers: new Map(saved.participantToNumbers),
        });
      }
      const purchases = await dbService.getMyPurchases();
      setMyPurchases(purchases);
      setIsDbReady(true);
    };
    initDb();
  }, []);

  // Sync Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;
      if (type === 'UPDATE_RAFFLE') {
        setIsSyncing(true);
        setRaffle(prev => ({
          ...prev,
          soldNumbers: new Set(payload.soldNumbers),
          numberOwners: new Map(payload.numberOwners),
          participants: new Map(payload.participants),
          phoneToNumbers: new Map(payload.phoneToNumbers),
          emailToNumbers: new Map(payload.emailToNumbers),
          participantToNumbers: new Map(payload.participantToNumbers),
        }));
        setTimeout(() => setIsSyncing(false), 1000);
      } else if (type === 'NEW_ACTIVITY') {
        setActivities(prev => [payload, ...prev].slice(0, 5));
      }
    };
    raffleChannel.addEventListener('message', handleMessage);
    return () => raffleChannel.removeEventListener('message', handleMessage);
  }, []);

  // Gravação na Base de Dados ao mudar o estado
  useEffect(() => {
    if (isDbReady) {
      dbService.saveState(raffle);
      localStorage.setItem('raffle_description', tempDescription);
      localStorage.setItem('raffle_prize_name', prizeName);
      localStorage.setItem('raffle_prize_image', prizeImage);
      localStorage.setItem('raffle_is_admin', isAdmin ? 'true' : 'false');
      
      raffleChannel.postMessage({ 
        type: 'UPDATE_RAFFLE', 
        payload: {
          ...raffle,
          soldNumbers: Array.from(raffle.soldNumbers),
          numberOwners: Array.from(raffle.numberOwners.entries()),
          participants: Array.from(raffle.participants.entries()),
          phoneToNumbers: Array.from(raffle.phoneToNumbers.entries()),
          emailToNumbers: Array.from(raffle.emailToNumbers.entries()),
          participantToNumbers: Array.from(raffle.participantToNumbers.entries()),
        } 
      });
    }
  }, [raffle, isDbReady, isAdmin, prizeName, prizeImage, tempDescription]);

  useEffect(() => {
    const interval = setInterval(() => {
      setOnlineUsers(prev => Math.max(80, prev + (Math.floor(Math.random() * 5) - 2)));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectNumber = (num: number) => {
    if (raffle.soldNumbers.has(num) || raffle.reservedNumbers.has(num)) return;
    const expiresAt = Date.now() + RESERVATION_TIME;
    setRaffle(prev => {
      const nextReserved = new Map(prev.reservedNumbers);
      nextReserved.set(num, { expiresAt });
      return { ...prev, reservedNumbers: nextReserved };
    });
    setIsPurchasing([num]);
  };

  const handlePurchase = useCallback(async () => {
    if (!isPurchasing || !userName.trim() || !userPhone.trim() || !userEmail.trim()) {
      alert("Preencha todos os campos."); return;
    }
    
    const normalizedPhone = userPhone.replace(/\D/g, "");
    const normalizedEmail = userEmail.trim().toLowerCase();
    const now = Date.now();
    const participantId = `p-${now}-${Math.random().toString(36).substr(2, 5)}`;

    const newPurchase: Purchase = { number: isPurchasing[0], date: now, prizeName };
    await dbService.saveMyPurchase(newPurchase);

    setRaffle((prev: RaffleState) => {
      const nextSold = new Set(prev.soldNumbers);
      const nextOwners = new Map(prev.numberOwners);
      const nextParticipants = new Map(prev.participants);
      const nextPhoneToNumbers = new Map(prev.phoneToNumbers);
      const nextEmailToNumbers = new Map(prev.emailToNumbers);
      const nextParticipantToNumbers = new Map(prev.participantToNumbers);

      isPurchasing.forEach(n => {
        nextSold.add(n);
        nextOwners.set(n, participantId);
      });

      nextParticipants.set(participantId, { id: participantId, name: userName, phone: userPhone, email: userEmail });
      nextPhoneToNumbers.set(normalizedPhone, [...(nextPhoneToNumbers.get(normalizedPhone) || []), ...isPurchasing]);
      nextEmailToNumbers.set(normalizedEmail, [...(nextEmailToNumbers.get(normalizedEmail) || []), ...isPurchasing]);
      nextParticipantToNumbers.set(participantId, [...(nextParticipantToNumbers.get(participantId) || []), ...isPurchasing]);

      return { 
        ...prev, soldNumbers: nextSold, numberOwners: nextOwners, 
        reservedNumbers: new Map(), participants: nextParticipants, 
        phoneToNumbers: nextPhoneToNumbers, emailToNumbers: nextEmailToNumbers,
        participantToNumbers: nextParticipantToNumbers 
      };
    });

    const newActivity: Activity = {
      id: Math.random().toString(), user: userName.split(' ')[0],
      number: isPurchasing[0], time: now, type: 'purchase'
    };
    
    raffleChannel.postMessage({ type: 'NEW_ACTIVITY', payload: newActivity });
    setActivities(prev => [newActivity, ...prev].slice(0, 5));
    setMyPurchases(prev => [newPurchase, ...prev]);
    setIsPurchasing(null);
    setUserName(""); setUserPhone(""); setUserEmail("");
  }, [isPurchasing, userName, userPhone, userEmail, prizeName]);

  // FIX: Implemented handleAdminLogin to process the admin password check.
  const handleAdminLogin = () => {
    if (adminPassInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setIsAdminLoginOpen(false);
      setAdminPassInput("");
      localStorage.setItem('raffle_is_admin', 'true');
    } else {
      alert("Senha incorreta.");
    }
  };

  const handleResetDatabase = async () => {
    if (confirm("ATENÇÃO: Isso apagará todos os bilhetes vendidos e participantes da base de dados. Deseja continuar?")) {
      await dbService.clearAll();
      window.location.reload();
    }
  };

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(raffle));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "backup_rifa.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const numbersToDisplay = useMemo(() => {
    if (!searchQuery) {
      const start = currentPage * PAGE_SIZE;
      return Array.from({ length: PAGE_SIZE }, (_, i) => start + i).filter(n => n < TOTAL_NUMBERS);
    }
    const query = searchQuery.toLowerCase().trim();
    const num = parseInt(query, 10);
    if (!isNaN(num) && query.match(/^\d+$/)) return [num];
    const found: number[] = [];
    raffle.participants.forEach((p, id) => {
      if (p.name.toLowerCase().includes(query) || p.phone.includes(query) || p.email.toLowerCase().includes(query)) {
        (raffle.participantToNumbers.get(id) || []).forEach(n => found.push(n));
      }
    });
    return Array.from(new Set(found)).sort((a,b) => a-b).slice(0, 100);
  }, [currentPage, searchQuery, raffle]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-orange-500 selection:text-white">
      {/* Real-time Status Bar */}
      <div className="fixed top-0 left-0 right-0 z-[150] pointer-events-none">
        <div className="flex justify-center pt-4 gap-3">
           <div className={`flex items-center gap-2 px-4 py-2 bg-black/80 backdrop-blur rounded-full border border-white/10 shadow-2xl transition-all duration-500 ${isSyncing ? 'scale-110 border-orange-500' : 'scale-100'}`}>
              <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,1)]' : 'bg-emerald-500 pulse animate-pulse'}`}></div>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">{isSyncing ? 'Syncing...' : (isDbReady ? 'Database Connected' : 'Connecting DB...')}</span>
           </div>
           <div className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur rounded-full border border-slate-100 shadow-xl">
              <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                {onlineUsers} Online
              </span>
           </div>
        </div>
      </div>

      {isAdmin && (
        <div className="fixed top-4 left-4 z-[160] flex gap-2">
          <button onClick={() => setIsAdmin(false)} className="bg-rose-600 text-white px-5 py-2.5 rounded-full text-xs font-black shadow-xl hover:bg-rose-700 transition-colors">SAIR ADM</button>
          <button onClick={() => setIsAdminSettingsOpen(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-full text-xs font-black shadow-xl hover:bg-indigo-700 transition-colors">BASE DE DADOS</button>
        </div>
      )}

      {/* Hero Section */}
      <header className="bg-gradient-to-br from-orange-600 via-red-600 to-black text-white pt-24 pb-48 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)] pointer-events-none"></div>
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16 items-center relative z-10">
          <div className="flex-1 space-y-8">
            {/* Added onClick to open admin login by clicking the prize name title */}
            <h1 
              onClick={() => setIsAdminLoginOpen(true)}
              className="text-6xl lg:text-9xl font-black tracking-tight leading-[0.8] uppercase italic drop-shadow-2xl animate-in slide-in-from-left duration-1000 cursor-pointer"
            >
              {prizeName}
            </h1>
            <div className="flex flex-wrap gap-4">
               {["Siga os Patrocinadores", "Compartilhe nos Stories", "Curta a Foto"].map((step, i) => (
                  <div key={i} className="flex items-center gap-3 bg-black/30 px-5 py-3 rounded-2xl backdrop-blur-md border border-white/10 hover:border-orange-400 transition-all cursor-default">
                     <span className="w-6 h-6 bg-white text-orange-600 rounded-full flex items-center justify-center font-black text-xs">{i+1}</span>
                     <span className="font-bold text-sm">{step}</span>
                  </div>
               ))}
            </div>
            {prizeImage && (
              <div className="rounded-[40px] overflow-hidden border-8 border-white/10 shadow-3xl aspect-video bg-black/20 group relative">
                <img src={prizeImage} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" alt="Prêmio" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-10 opacity-0 group-hover:opacity-100 transition-opacity">
                   <p className="font-black uppercase tracking-tighter text-2xl italic">Este prêmio pode ser seu!</p>
                </div>
              </div>
            )}
          </div>
          
          <div className="shrink-0 w-full max-w-sm bg-white p-10 rounded-[56px] text-center shadow-4xl sticky top-8 border border-orange-100 transform hover:-translate-y-2 transition-transform duration-500">
            <div className="text-7xl font-black my-4 tracking-tighter text-slate-900 drop-shadow-sm">GRÁTIS</div>
            <button onClick={() => handleSelectNumber(Math.floor(Math.random() * TOTAL_NUMBERS))} className="w-full bg-orange-600 text-white py-6 rounded-3xl font-black text-2xl hover:bg-orange-700 transition-all shadow-xl shadow-orange-100 active:scale-95 mb-4">SORTEAR MEU NÚMERO</button>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Apenas 1 bilhete por CPF/E-mail</p>
            
            <div className="mt-8 pt-8 border-t border-slate-50 text-left">
               <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Live Activity</span>
                  <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-ping"></span>
               </div>
               <div className="space-y-4">
                  {activities.length > 0 ? activities.map(act => (
                    <div key={act.id} className="flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300">
                       <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center font-black text-[10px] text-slate-400">{act.user[0]}</div>
                       <div>
                          <p className="text-[11px] font-black text-slate-700">{act.user} <span className="text-slate-400 font-bold">garantiu o #{act.number.toString().padStart(6, '0')}</span></p>
                          <p className="text-[9px] text-emerald-500 font-black uppercase">Validado com Sucesso</p>
                       </div>
                    </div>
                  )) : <p className="text-[10px] text-slate-300 italic font-medium">Aguardando novos participantes...</p>}
               </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 -mt-24 relative z-20 pb-60">
        <Dashboard total={TOTAL_NUMBERS} sold={raffle.soldNumbers.size} reserved={raffle.reservedNumbers.size} revenue={raffle.soldNumbers.size * raffle.pricePerNumber} isAdmin={isAdmin} />
        
        <div className="bg-white p-6 rounded-[32px] shadow-2xl border border-slate-100 mb-12 flex flex-col md:flex-row gap-6 items-center">
          <div className="relative flex-1 w-full">
            <input type="text" placeholder="Busque por bilhete, nome ou e-mail..." className="w-full pl-14 pr-6 py-5 bg-slate-50 rounded-[24px] outline-none font-bold border border-slate-100 focus:ring-4 focus:ring-orange-500/10 transition-all" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <svg className="w-6 h-6 text-slate-300 absolute left-6 top-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-[24px] border border-slate-100">
             <button onClick={() => setCurrentPage(p => Math.max(0, p-1))} className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-sm hover:bg-orange-50 hover:text-orange-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
             </button>
             <div className="px-4 text-center">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block">Pag.</span>
                <span className="text-xl font-black text-slate-900">{currentPage + 1}</span>
             </div>
             <button onClick={() => setCurrentPage(p => p + 1)} className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-sm hover:bg-orange-50 hover:text-orange-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
             </button>
          </div>
        </div>

        <div className="bg-white p-10 rounded-[56px] shadow-3xl border border-slate-100 relative overflow-hidden">
          <NumberGrid numbers={numbersToDisplay} soldNumbers={raffle.soldNumbers} reservedNumbers={raffle.reservedNumbers} numberOwners={raffle.numberOwners} participants={raffle.participants} onSelect={handleSelectNumber} isAdmin={isAdmin} />
        </div>
      </main>

      {/* Purchase Modal */}
      {isPurchasing && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-12 shadow-4xl animate-in zoom-in duration-300">
            <h3 className="text-4xl font-black mb-2 text-slate-900 tracking-tighter">Validar Participação</h3>
            <p className="text-slate-400 mb-10 font-medium">O bilhete #{isPurchasing[0].toString().padStart(6, '0')} está reservado para você.</p>
            <div className="space-y-6">
              <input type="text" placeholder="Nome Completo" value={userName} onChange={e => setUserName(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[20px] outline-none font-bold border border-slate-100 focus:ring-4 focus:ring-orange-500/10" />
              <input type="tel" placeholder="WhatsApp" value={userPhone} onChange={e => setUserPhone(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[20px] outline-none font-bold border border-slate-100 focus:ring-4 focus:ring-orange-500/10" />
              <input type="email" placeholder="E-mail" value={userEmail} onChange={e => setUserEmail(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[20px] outline-none font-bold border border-slate-100 focus:ring-4 focus:ring-orange-500/10" />
              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsPurchasing(null)} className="flex-1 py-5 text-slate-400 font-black uppercase text-xs hover:text-slate-600 transition-colors">Voltar</button>
                <button onClick={handlePurchase} className="flex-[2] py-5 bg-orange-600 text-white rounded-[24px] font-black text-lg shadow-xl shadow-orange-100 hover:scale-105 active:scale-95 transition-all">EU QUERO GANHAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Database/Admin Panel */}
      {isAdminSettingsOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[400] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xl rounded-[48px] p-12 shadow-4xl">
            <h3 className="text-3xl font-black mb-6 flex items-center gap-3 text-slate-900">
               <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
               Gestão da Base de Dados
            </h3>
            <div className="space-y-4">
               <button onClick={handleExportData} className="w-full p-6 bg-slate-50 rounded-3xl flex items-center justify-between group hover:bg-white hover:shadow-lg transition-all border border-slate-100">
                  <div className="text-left">
                     <p className="font-black text-slate-800">Backup Completo</p>
                     <p className="text-[11px] text-slate-400 font-medium">Exportar todos os dados em formato JSON</p>
                  </div>
                  <svg className="w-6 h-6 text-slate-300 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
               </button>
               <button onClick={handleResetDatabase} className="w-full p-6 bg-rose-50 rounded-3xl flex items-center justify-between group hover:bg-white hover:shadow-lg transition-all border border-rose-100">
                  <div className="text-left">
                     <p className="font-black text-rose-600">Resetar Rifa</p>
                     <p className="text-[11px] text-rose-400 font-medium">Apagar permanentemente todos os bilhetes vendidos</p>
                  </div>
                  <svg className="w-6 h-6 text-rose-200 group-hover:text-rose-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
               </button>
            </div>
            <button onClick={() => setIsAdminSettingsOpen(false)} className="w-full mt-8 py-5 bg-slate-900 text-white rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl">Fechar Painel</button>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 z-[200]">
        <button onClick={() => setIsHistoryOpen(true)} className="bg-slate-900 text-white px-10 py-5 rounded-full shadow-4xl flex items-center gap-4 font-black text-sm tracking-tight hover:scale-110 transition-all border border-white/10 group">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 pulse group-hover:bg-emerald-400"></div>
          MEUS BILHETES ({myPurchases.length})
        </button>
      </div>

      {/* Sidebar de Histórico */}
      <div className={`fixed inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-4xl z-[250] transform transition-transform duration-700 cubic-bezier(0.19, 1, 0.22, 1) ${isHistoryOpen ? 'translate-x-0' : 'translate-x-full'}`}>
         <div className="flex flex-col h-full">
            <div className="p-12 bg-black text-white flex items-center justify-between">
               <div>
                  <h2 className="text-4xl font-black tracking-tight italic">Minha Sorte</h2>
                  <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Sincronizado via Cloud</p>
               </div>
               <button onClick={() => setIsHistoryOpen(false)} className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all hover:rotate-90">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50 space-y-6">
               {myPurchases.length === 0 ? (
                 <div className="text-center py-40">
                    <p className="text-slate-300 font-black uppercase tracking-widest text-[10px] mb-4">Plataforma em Tempo Real</p>
                    <p className="text-slate-400 font-medium">Garanta seu primeiro bilhete para aparecer aqui!</p>
                 </div>
               ) : (
                 myPurchases.map((p, i) => (
                    <div key={i} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl flex items-center justify-between group hover:border-orange-200 transition-all">
                       <div className="space-y-1">
                          <span className="text-[9px] font-black uppercase text-orange-500 tracking-widest">Bilhete Ativo</span>
                          <div className="text-5xl font-black text-slate-900 tracking-tighter group-hover:scale-105 transition-transform origin-left">#{p.number.toString().padStart(6, '0')}</div>
                          <div className="flex items-center gap-2 mt-2">
                             <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                             <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Gravado em LocalDB</span>
                          </div>
                       </div>
                    </div>
                 ))
               )}
            </div>
         </div>
      </div>

      {isAdminLoginOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[500] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-4xl animate-in fade-in duration-300">
            <h3 className="text-2xl font-black text-center mb-10 text-slate-900">Acesso Restrito</h3>
            <input type="password" value={adminPassInput} onChange={e => setAdminPassInput(e.target.value)} placeholder="Senha Admin" className="w-full p-5 bg-slate-50 rounded-2xl mb-8 outline-none font-black text-center border border-slate-100 focus:ring-2 focus:ring-indigo-500 transition-all" />
            <div className="flex gap-4">
              <button onClick={() => setIsAdminLoginOpen(false)} className="flex-1 py-4 font-black text-slate-400 uppercase text-xs">Sair</button>
              <button onClick={handleAdminLogin} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-black transition-colors">ENTRAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
