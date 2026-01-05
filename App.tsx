
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Participant, RaffleState, Purchase } from './types';
import NumberGrid from './components/NumberGrid';
import Dashboard from './components/Dashboard';
import { generateRaffleDescription, announceWinner, generatePrizeImage } from './services/geminiService';

const PAGE_SIZE = 100;
const INITIAL_PRICE = 0.00; 
const INITIAL_LIMIT = 1;
const INITIAL_PHONE_LIMIT = 1;
const TOTAL_NUMBERS = 1000000;
const RESERVATION_TIME = 5 * 60 * 1000;
const ADMIN_PASSWORD = "198830cb";

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
✅ Curta a foto oficial no Instagram!

Escolha seu número da sorte agora. O sorteio será realizado assim que atingirmos a meta de engajamento! 🚀`;

const App: React.FC = () => {
  const loadInitialState = (): RaffleState => {
    const saved = localStorage.getItem('raffle_settings_live_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          soldNumbers: new Set(parsed.soldNumbers || []),
          numberOwners: new Map(parsed.numberOwners || []),
          reservedNumbers: new Map(),
          participants: new Map(parsed.participants || []),
          phoneToNumbers: new Map(parsed.phoneToNumbers || []),
          emailToNumbers: new Map(parsed.emailToNumbers || []),
          participantToNumbers: new Map(parsed.participantToNumbers || []),
          winner: parsed.winner || undefined
        };
      } catch (e) {
        console.error("Error loading raffle settings", e);
      }
    }
    return {
      totalNumbers: TOTAL_NUMBERS,
      pricePerNumber: INITIAL_PRICE,
      maxPurchaseLimit: INITIAL_LIMIT,
      maxEntriesPerPhone: INITIAL_PHONE_LIMIT,
      soldNumbers: new Set<number>(),
      numberOwners: new Map<number, string>(),
      reservedNumbers: new Map<number, { expiresAt: number }>(),
      participants: new Map<string, Participant>(),
      phoneToNumbers: new Map<string, number[]>(),
      emailToNumbers: new Map<string, number[]>(),
      participantToNumbers: new Map<string, number[]>(),
    };
  };

  const [raffle, setRaffle] = useState<RaffleState>(loadInitialState);
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('raffle_is_admin') === 'true');
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState("");
  
  const [description, setDescription] = useState(() => localStorage.getItem('raffle_description') || DEFAULT_DESCRIPTION);
  const [prizeName, setPrizeName] = useState(() => localStorage.getItem('raffle_prize_name') || "RIFA GRÁTIS! R$500 NO PIX ou CAPACETE");
  const [prizeImage, setPrizeImage] = useState(() => localStorage.getItem('raffle_prize_image') || "");
  
  const [tempDescription, setTempDescription] = useState(description);
  const [tempPrizeName, setTempPrizeName] = useState(prizeName);
  const [tempPrizeImage, setTempPrizeImage] = useState(prizeImage);
  const [tempImageUrlInput, setTempImageUrlInput] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPurchasing, setIsPurchasing] = useState<number[] | null>(null);
  
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userEmail, setUserEmail] = useState("");
  
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [myPurchases, setMyPurchases] = useState<Purchase[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('raffle_my_purchases') || '[]');
    } catch { return []; }
  });

  // Salva no localStorage simulando "Cloud Sync"
  useEffect(() => {
    const dataToSave = {
      ...raffle,
      soldNumbers: Array.from(raffle.soldNumbers),
      numberOwners: Array.from(raffle.numberOwners.entries()),
      participants: Array.from(raffle.participants.entries()),
      phoneToNumbers: Array.from(raffle.phoneToNumbers.entries()),
      emailToNumbers: Array.from(raffle.emailToNumbers.entries()),
      participantToNumbers: Array.from(raffle.participantToNumbers.entries()),
    };
    localStorage.setItem('raffle_settings_live_v1', JSON.stringify(dataToSave));
    localStorage.setItem('raffle_description', description);
    localStorage.setItem('raffle_prize_name', prizeName);
    localStorage.setItem('raffle_prize_image', prizeImage);
    localStorage.setItem('raffle_is_admin', isAdmin ? 'true' : 'false');
    localStorage.setItem('raffle_my_purchases', JSON.stringify(myPurchases));
  }, [raffle, description, prizeName, prizeImage, isAdmin, myPurchases]);

  // Simulação de Sincronização e Atividades em tempo real
  useEffect(() => {
    const syncInterval = setInterval(() => {
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 800);
      
      // Simula uma nova atividade aleatória para parecer online
      const names = ["Ana", "Pedro", "Lucas", "Mariana", "Roberto", "Carla", "Bruno", "Juliana"];
      if (Math.random() > 0.7) {
        const newAct: Activity = {
          id: Math.random().toString(),
          user: names[Math.floor(Math.random() * names.length)],
          number: Math.floor(Math.random() * TOTAL_NUMBERS),
          time: Date.now(),
          type: Math.random() > 0.5 ? 'reservation' : 'purchase'
        };
        setActivities(prev => [newAct, ...prev].slice(0, 5));
      }
    }, 5000);

    const reservationCleanup = setInterval(() => {
      const now = Date.now();
      setRaffle(prev => {
        let changed = false;
        // DO explicitly type the new Map to avoid 'unknown' type inference issues on the 'data' parameter in forEach.
        const nextReserved = new Map<number, { expiresAt: number }>(prev.reservedNumbers);
        nextReserved.forEach((data, num) => {
          if (now >= data.expiresAt) {
            nextReserved.delete(num);
            changed = true;
          }
        });
        return changed ? { ...prev, reservedNumbers: nextReserved } : prev;
      });
    }, 2000);

    return () => {
      clearInterval(syncInterval);
      clearInterval(reservationCleanup);
    };
  }, []);

  const currentUserPhoneTickets = useMemo(() => {
    const normalized = userPhone.replace(/\D/g, "");
    if (normalized.length < 8) return 0;
    return (raffle.phoneToNumbers.get(normalized)?.length || 0);
  }, [userPhone, raffle.phoneToNumbers]);

  const currentUserEmailTickets = useMemo(() => {
    const email = userEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return 0;
    return (raffle.emailToNumbers.get(email)?.length || 0);
  }, [userEmail, raffle.emailToNumbers]);

  const isLimitExceeded = useMemo(() => {
    if (!isPurchasing) return false;
    const req = isPurchasing.length;
    return (currentUserPhoneTickets + req) > raffle.maxEntriesPerPhone || (currentUserEmailTickets + req) > raffle.maxEntriesPerPhone || req > 1;
  }, [currentUserPhoneTickets, currentUserEmailTickets, isPurchasing, raffle.maxEntriesPerPhone]);

  const handleAdminLogin = () => {
    if (adminPassInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setIsAdminLoginOpen(false);
      setAdminPassInput("");
    } else {
      alert("Senha administrativa incorreta.");
    }
  };

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

  const buyRandom = (count: number) => {
    const actualCount = Math.min(count, 1);
    const available: number[] = [];
    const start = currentPage * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, TOTAL_NUMBERS);
    for (let i = start; i < end; i++) {
      if (!raffle.soldNumbers.has(i) && !raffle.reservedNumbers.has(i)) {
        available.push(i);
      }
    }
    if (available.length < actualCount) return alert(`Apenas ${available.length} números disponíveis.`);
    const chosen = available.sort(() => 0.5 - Math.random()).slice(0, actualCount);
    const expiresAt = Date.now() + RESERVATION_TIME;
    setRaffle(prev => {
      const nextReserved = new Map(prev.reservedNumbers);
      chosen.forEach(n => nextReserved.set(n, { expiresAt }));
      return { ...prev, reservedNumbers: nextReserved };
    });
    setIsPurchasing(chosen);
  };

  const handlePurchase = useCallback(() => {
    if (!isPurchasing || !userName.trim() || !userPhone.trim() || !userEmail.trim()) {
      alert("Preencha todos os campos.");
      return;
    }
    if (isLimitExceeded) {
      alert("Você já possui um bilhete vinculado a este Telefone ou E-mail.");
      return;
    }

    const normalizedPhone = userPhone.replace(/\D/g, "");
    const normalizedEmail = userEmail.trim().toLowerCase();
    const now = Date.now();
    const participantId = `p-${now}-${Math.random().toString(36).substr(2, 5)}`;

    setRaffle((prev: RaffleState) => {
      const nextSold = new Set(prev.soldNumbers);
      const nextOwners = new Map(prev.numberOwners);
      const nextReserved = new Map(prev.reservedNumbers);
      const nextParticipants = new Map(prev.participants);
      const nextPhoneToNumbers = new Map(prev.phoneToNumbers);
      const nextEmailToNumbers = new Map(prev.emailToNumbers);
      const nextParticipantToNumbers = new Map(prev.participantToNumbers);

      isPurchasing.forEach(n => {
        nextSold.add(n);
        nextOwners.set(n, participantId);
        nextReserved.delete(n);
      });

      nextParticipants.set(participantId, { id: participantId, name: userName, phone: userPhone, email: userEmail });
      
      const phoneList = [...(nextPhoneToNumbers.get(normalizedPhone) || []), ...isPurchasing];
      nextPhoneToNumbers.set(normalizedPhone, phoneList);

      const emailList = [...(nextEmailToNumbers.get(normalizedEmail) || []), ...isPurchasing];
      nextEmailToNumbers.set(normalizedEmail, emailList);

      const participantList = [...(nextParticipantToNumbers.get(participantId) || []), ...isPurchasing];
      nextParticipantToNumbers.set(participantId, participantList);

      return { 
        ...prev, 
        soldNumbers: nextSold, 
        numberOwners: nextOwners, 
        reservedNumbers: nextReserved, 
        participants: nextParticipants, 
        phoneToNumbers: nextPhoneToNumbers, 
        emailToNumbers: nextEmailToNumbers,
        participantToNumbers: nextParticipantToNumbers 
      };
    });

    const newPurchases: Purchase[] = isPurchasing.map(n => ({ number: n, date: now, prizeName }));
    setMyPurchases(prev => [...newPurchases, ...prev]);
    setIsPurchasing(null);
    setUserName(""); setUserPhone(""); setUserEmail("");
    
    // Notifica Atividade Local
    setActivities(prev => [{
      id: Math.random().toString(),
      user: userName.split(' ')[0],
      number: isPurchasing[0],
      time: Date.now(),
      type: 'purchase'
    }, ...prev].slice(0, 5));

  }, [isPurchasing, userName, userPhone, userEmail, prizeName, isLimitExceeded]);

  const saveAdminSettings = () => {
    setPrizeName(tempPrizeName);
    setDescription(tempDescription);
    setPrizeImage(tempPrizeImage);
    if (tempImageUrlInput.trim()) setPrizeImage(tempImageUrlInput);
    setIsAdminSettingsOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setTempPrizeImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAIRegenerateImage = async () => {
    setIsGeneratingImg(true);
    const img = await generatePrizeImage(tempPrizeName);
    if (img) setTempPrizeImage(img);
    setIsGeneratingImg(false);
  };

  const numbersToDisplay = useMemo(() => {
    if (!searchQuery) {
      const start = currentPage * PAGE_SIZE;
      return Array.from({ length: PAGE_SIZE }, (_, i) => start + i).filter(n => n < TOTAL_NUMBERS);
    }
    const query = searchQuery.toLowerCase().trim();
    const num = parseInt(query, 10);
    if (!isNaN(num) && query.match(/^\d+$/)) return [num].filter(n => n < TOTAL_NUMBERS);
    const found: number[] = [];
    raffle.participants.forEach((p, id) => {
      if (p.name.toLowerCase().includes(query) || p.phone.includes(query) || p.email.toLowerCase().includes(query)) {
        (raffle.participantToNumbers.get(id) || []).forEach(n => found.push(n));
      }
    });
    return Array.from(new Set(found)).sort((a,b) => a-b).slice(0, 100);
  }, [currentPage, searchQuery, raffle]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-orange-100">
      {/* Indicador Global "Online" */}
      <div className="fixed top-0 left-0 right-0 z-[150] pointer-events-none">
        <div className="flex justify-center pt-4">
           <div className={`flex items-center gap-2 px-3 py-1 bg-black/80 backdrop-blur rounded-full border border-white/10 transition-all duration-500 ${isSyncing ? 'scale-110 border-orange-500' : 'scale-100'}`}>
              <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]' : 'bg-emerald-500 pulse animate-pulse'}`}></div>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">{isSyncing ? 'Sincronizando...' : 'Online'}</span>
           </div>
        </div>
      </div>

      {isAdmin && (
        <div className="fixed top-4 left-4 z-[100] flex gap-2">
          <button onClick={() => setIsAdmin(false)} className="bg-rose-600 text-white px-5 py-2.5 rounded-full text-xs font-black shadow-xl">SAIR ADM</button>
          <button onClick={() => setIsAdminSettingsOpen(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-full text-xs font-black shadow-xl">CONFIGURAÇÕES</button>
        </div>
      )}

      {/* Hero Section */}
      <header className="bg-gradient-to-br from-orange-600 via-red-600 to-black text-white pt-20 pb-40 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)] pointer-events-none"></div>
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16 items-center relative z-10">
          <div className="flex-1 space-y-8">
            <div className="flex items-center gap-4">
              <div className="inline-block bg-white/20 px-4 py-1.5 rounded-full border border-white/30 backdrop-blur-sm">
                <span className="text-white text-[10px] font-black tracking-widest uppercase">Promoção Ativa 🔥</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400"></span>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Sorteio Confirmado</span>
              </div>
            </div>

            <h1 className="text-5xl lg:text-8xl font-black tracking-tight leading-[0.9] uppercase italic animate-in slide-in-from-left duration-700">{prizeName}</h1>
            
            <div className="space-y-4 pt-4">
              {[
                "Siga os patrocinadores",
                "Compartilhe nos stories e marque nossa página",
                "Curta a foto!"
              ].map((text, idx) => (
                <div key={idx} className="flex items-center gap-4 bg-black/20 p-4 rounded-2xl backdrop-blur-sm border border-white/10 hover:bg-black/30 transition-all cursor-default group">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  </div>
                  <span className="font-bold text-lg">{text}</span>
                </div>
              ))}
            </div>

            {prizeImage && (
              <div className="rounded-[48px] overflow-hidden border-8 border-white/10 shadow-3xl aspect-video bg-black/20 group relative cursor-pointer">
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-10">
                   <p className="text-sm font-black uppercase tracking-widest">Imagem Ilustrativa do Prêmio</p>
                </div>
                <img src={prizeImage} alt="Prêmio" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
              </div>
            )}
          </div>
          
          <div className="shrink-0 w-full max-w-sm bg-white p-10 rounded-[56px] text-center shadow-4xl sticky top-8 border border-orange-100">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">Lote Especial</div>
            <div className="text-7xl font-black my-6 tracking-tighter text-slate-900 animate-pulse">GRÁTIS</div>
            <div className="space-y-4">
              <button onClick={() => buyRandom(1)} className="w-full bg-orange-600 text-white py-5 rounded-3xl font-black text-xl hover:bg-orange-700 transition-colors shadow-xl shadow-orange-100 hover:scale-105 active:scale-95">GARANTIR BILHETE</button>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-8 uppercase tracking-widest">Apenas 1 bilhete por participante</p>
            
            {/* Live Feed Ticker */}
            <div className="mt-8 pt-6 border-t border-slate-50">
               <div className="flex items-center justify-between mb-4">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Atividade Recente</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
               </div>
               <div className="space-y-3">
                  {activities.length === 0 ? (
                    <p className="text-[10px] text-slate-300 italic font-bold">Aguardando novos bilhetes...</p>
                  ) : (
                    activities.map(act => (
                      <div key={act.id} className="flex items-center gap-3 text-left animate-in fade-in slide-in-from-bottom-1">
                         <div className={`w-1 h-8 rounded-full ${act.type === 'purchase' ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                         <div className="flex-1">
                            <p className="text-[10px] font-black text-slate-700">{act.user} <span className="text-slate-400 font-bold">garantiu o #{act.number.toString().padStart(6, '0')}</span></p>
                            <span className="text-[8px] text-slate-300 font-bold uppercase">{act.type === 'purchase' ? 'Validado' : 'Reservado'} agora</span>
                         </div>
                      </div>
                    ))
                  )}
               </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 -mt-20 relative z-20 pb-60">
        <Dashboard total={TOTAL_NUMBERS} sold={raffle.soldNumbers.size} reserved={raffle.reservedNumbers.size} revenue={raffle.soldNumbers.size * raffle.pricePerNumber} isAdmin={isAdmin} />
        
        <div className="bg-white p-5 rounded-[40px] shadow-2xl border border-slate-100 mb-10 flex flex-col md:flex-row gap-6 items-center">
          <div className="relative flex-1 w-full">
            <input type="text" placeholder="Busque por número, nome ou e-mail..." className="w-full pl-14 pr-6 py-5 bg-slate-50 rounded-[28px] outline-none focus:ring-4 focus:ring-orange-500/10 font-bold border border-slate-100" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <svg className="w-6 h-6 text-slate-300 absolute left-5 top-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          {!searchQuery && (
            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-[28px] border border-slate-100">
              <button onClick={() => setCurrentPage(p => Math.max(0, p-1))} className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-sm hover:bg-slate-100 transition-colors" disabled={currentPage === 0}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="flex flex-col items-center px-4">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Página</span>
                <div className="flex items-center gap-2">
                   <input type="number" value={currentPage + 1} onChange={e => setCurrentPage(Math.max(0, Math.min(9999, parseInt(e.target.value) - 1)))} className="w-16 text-center font-black bg-transparent outline-none text-orange-600 text-xl" />
                   <span className="text-slate-300 font-bold">/ 10k</span>
                </div>
              </div>
              <button onClick={() => setCurrentPage(p => Math.min(9999, p + 1))} className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-sm hover:bg-slate-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </div>

        <div className="bg-white p-10 rounded-[56px] shadow-3xl border border-slate-100 relative">
          <NumberGrid numbers={numbersToDisplay} soldNumbers={raffle.soldNumbers} reservedNumbers={raffle.reservedNumbers} numberOwners={raffle.numberOwners} participants={raffle.participants} onSelect={handleSelectNumber} isAdmin={isAdmin} />
        </div>
      </main>

      {/* Modal de Compra */}
      {isPurchasing && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[56px] p-12 shadow-4xl animate-in zoom-in duration-300">
            <h3 className="text-4xl font-black mb-2 text-slate-900 tracking-tight">Validar Bilhete</h3>
            <p className="text-slate-500 mb-10 text-lg">Informe seus dados reais para validarmos sua participação.</p>
            <div className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest px-1">Nome Completo</label>
                <input type="text" placeholder="Seu nome" value={userName} onChange={e => setUserName(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[24px] outline-none font-bold border border-slate-100 focus:ring-4 focus:ring-orange-500/10 transition-all" />
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest px-1">WhatsApp</label>
                <input type="tel" placeholder="(00) 00000-0000" value={userPhone} onChange={e => setUserPhone(e.target.value)} className={`w-full p-5 bg-slate-50 rounded-[24px] outline-none font-bold border border-slate-100 focus:ring-4 focus:ring-orange-500/10 transition-all ${currentUserPhoneTickets >= raffle.maxEntriesPerPhone ? 'border-rose-300 bg-rose-50' : ''}`} />
                {currentUserPhoneTickets > 0 && <span className="text-[10px] font-bold text-rose-500 block px-1 uppercase">Você já possui um bilhete neste número</span>}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest px-1">E-mail</label>
                <input type="email" placeholder="seu@email.com" value={userEmail} onChange={e => setUserEmail(e.target.value)} className={`w-full p-5 bg-slate-50 rounded-[24px] outline-none font-bold border border-slate-100 focus:ring-4 focus:ring-orange-500/10 transition-all ${currentUserEmailTickets >= raffle.maxEntriesPerPhone ? 'border-rose-300 bg-rose-50' : ''}`} />
                {currentUserEmailTickets > 0 && <span className="text-[10px] font-bold text-rose-500 block px-1 uppercase">Você já possui um bilhete neste e-mail</span>}
              </div>

              {isLimitExceeded && (
                <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-xs font-black uppercase text-center border border-rose-100">
                  Apenas 1 bilhete permitido por Telefone/E-mail
                </div>
              )}

              <div className="flex gap-4 pt-8">
                <button onClick={() => { setIsPurchasing(null); setRaffle(prev => ({...prev, reservedNumbers: new Map()})); }} className="flex-1 py-5 text-slate-400 font-black uppercase text-xs">Cancelar</button>
                <button 
                  onClick={handlePurchase} 
                  disabled={isLimitExceeded} 
                  className={`flex-[2] py-5 rounded-[24px] font-black text-lg shadow-xl transition-all ${isLimitExceeded ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700 hover:scale-105 active:scale-95'}`}
                >
                  EU QUERO GANHAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Buttons */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 z-50">
        <button onClick={() => setIsHistoryOpen(true)} className="bg-slate-900 text-white px-10 py-5 rounded-full shadow-4xl flex items-center gap-4 font-black text-sm tracking-tight hover:scale-110 transition-all border border-white/10 group">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse group-hover:scale-125"></div>
          MEU BILHETE ({myPurchases.length})
        </button>
        {!isAdmin && (
          <button onClick={() => setIsAdminLoginOpen(true)} className="w-14 h-14 bg-white rounded-full shadow-4xl flex items-center justify-center text-slate-200 hover:text-orange-600 transition-all border border-slate-100 hover:rotate-12">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </button>
        )}
      </div>

      {/* Admin Panel */}
      {isAdminSettingsOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-5xl rounded-[56px] shadow-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-3xl font-black">Gerenciamento Real-time</h3>
              <button onClick={() => setIsAdminSettingsOpen(false)} className="hover:rotate-90 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-10 overflow-y-auto flex-1 space-y-10">
               <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <label className="text-[10px] uppercase font-black text-slate-400 block px-1">Título da Rifa</label>
                    <input type="text" value={tempPrizeName} onChange={e => setTempPrizeName(e.target.value)} className="w-full p-5 bg-slate-50 rounded-3xl font-black text-xl border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-500" />
                    <label className="text-[10px] uppercase font-black text-slate-400 block px-1">Instruções para a IA</label>
                    <textarea value={tempDescription} onChange={e => setTempDescription(e.target.value)} rows={6} className="w-full p-5 bg-slate-50 rounded-3xl font-medium border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="space-y-6">
                    <label className="text-[10px] uppercase font-black text-slate-400 block px-1">Foto de Destaque</label>
                    <div className="aspect-video rounded-3xl bg-slate-100 border-4 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                      {tempPrizeImage ? <img src={tempPrizeImage} className="w-full h-full object-cover" /> : <span className="font-black text-slate-300">NENHUMA IMAGEM</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <button onClick={() => fileInputRef.current?.click()} className="py-4 border-2 rounded-2xl font-black text-xs uppercase hover:bg-slate-50">Mudar Manual</button>
                      <button onClick={handleAIRegenerateImage} disabled={isGeneratingImg} className="py-4 bg-orange-50 text-orange-600 rounded-2xl font-black text-xs uppercase hover:bg-orange-100 disabled:opacity-50">Gerar com IA</button>
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                    </div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
                       <span className="text-xs font-black uppercase text-slate-400">Total de Participantes</span>
                       <span className="text-2xl font-black text-indigo-600">{raffle.participants.size.toLocaleString()}</span>
                    </div>
                  </div>
               </div>
            </div>
            <div className="p-10 bg-slate-50 border-t flex gap-4">
              <button onClick={() => setIsAdminSettingsOpen(false)} className="flex-1 py-5 font-black text-slate-400 uppercase text-xs">Descartar</button>
              <button onClick={saveAdminSettings} className="flex-[2] py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg hover:bg-indigo-700 shadow-xl">SINCRONIZAR ALTERAÇÕES</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar de Histórico */}
      <div className={`fixed inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-4xl z-[250] transform transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isHistoryOpen ? 'translate-x-0' : 'translate-x-full'}`}>
         <div className="flex flex-col h-full">
            <div className="p-10 bg-black text-white flex items-center justify-between">
               <div>
                  <h2 className="text-3xl font-black tracking-tight">Status Online</h2>
                  <div className="flex items-center gap-2 mt-1">
                     <span className="w-2 h-2 rounded-full bg-emerald-500 pulse"></span>
                     <p className="text-orange-400 text-[10px] font-black uppercase tracking-widest">Sincronizado</p>
                  </div>
               </div>
               <button onClick={() => setIsHistoryOpen(false)} className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50 space-y-4">
               {myPurchases.length === 0 ? (
                 <div className="text-center py-40">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100">
                       <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v4" /></svg>
                    </div>
                    <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Aguardando seu primeiro bilhete</p>
                 </div>
               ) : (
                 myPurchases.map((p, i) => (
                    <div key={i} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl flex items-center justify-between group hover:border-orange-200 transition-all">
                       <div className="space-y-1">
                          <span className="text-[8px] font-black uppercase text-orange-400 tracking-widest">Bilhete Garantido</span>
                          <div className="text-4xl font-black text-slate-900 tracking-tighter group-hover:scale-105 transition-transform origin-left">#{p.number.toString().padStart(6, '0')}</div>
                          <div className="flex items-center gap-2">
                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                             <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Validado em {new Date(p.date).toLocaleDateString()}</span>
                          </div>
                       </div>
                    </div>
                 ))
               )}
            </div>
         </div>
      </div>

      {isAdminLoginOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[300] flex items-center justify-center p-6">
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
