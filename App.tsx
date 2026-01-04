
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Participant, RaffleState, Purchase } from './types';
import NumberGrid from './components/NumberGrid';
import Dashboard from './components/Dashboard';
import { generateRaffleDescription, announceWinner, generatePrizeImage } from './services/geminiService';

const PAGE_SIZE = 100;
const INITIAL_PRICE = 10.00;
const INITIAL_LIMIT = 50;
const INITIAL_PHONE_LIMIT = 100;
const TOTAL_NUMBERS = 1000000;
const RESERVATION_TIME = 5 * 60 * 1000;
const ADMIN_PASSWORD = "198830cb";

const DEFAULT_DESCRIPTION = ` 🏁 PIX DE R$ 500 OU CAPACETE ZERO: QUAL VAI SER? 🏁

Participe da nossa grande rifa e concorra a prêmios incríveis!
Milhares de chances de ganhar com sorteios realizados pela Federal. Novinho, direto para você!`;

const App: React.FC = () => {
  // Logic to safely load state from localStorage with Set and Map reconstruction
  const loadInitialState = (): RaffleState => {
    const saved = localStorage.getItem('raffle_settings_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          soldNumbers: new Set(parsed.soldNumbers || []),
          numberOwners: new Map(parsed.numberOwners || []),
          reservedNumbers: new Map(), // Clean reservations on load
          participants: new Map(parsed.participants || []),
          phoneToNumbers: new Map(parsed.phoneToNumbers || []),
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
      participantToNumbers: new Map<string, number[]>(),
    };
  };

  const [raffle, setRaffle] = useState<RaffleState>(loadInitialState);
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('raffle_is_admin') === 'true');
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState("");
  
  const [description, setDescription] = useState(() => localStorage.getItem('raffle_description') || DEFAULT_DESCRIPTION);
  const [prizeName, setPrizeName] = useState(() => localStorage.getItem('raffle_prize_name') || "PIX DA SORTE $500 OU CAPACETE ZERO");
  const [prizeImage, setPrizeImage] = useState(() => localStorage.getItem('raffle_prize_image') || "");
  
  // Temporary states for admin modal to allow "Discard"
  const [tempDescription, setTempDescription] = useState(description);
  const [tempPrizeName, setTempPrizeName] = useState(prizeName);
  const [tempPrizeImage, setTempPrizeImage] = useState(prizeImage);
  const [tempImageUrlInput, setTempImageUrlInput] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPurchasing, setIsPurchasing] = useState<number[] | null>(null);
  
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [myPurchases, setMyPurchases] = useState<Purchase[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('raffle_my_purchases') || '[]');
    } catch { return []; }
  });

  // Sync state to localStorage
  useEffect(() => {
    const dataToSave = {
      ...raffle,
      soldNumbers: Array.from(raffle.soldNumbers),
      numberOwners: Array.from(raffle.numberOwners.entries()),
      participants: Array.from(raffle.participants.entries()),
      phoneToNumbers: Array.from(raffle.phoneToNumbers.entries()),
      participantToNumbers: Array.from(raffle.participantToNumbers.entries()),
    };
    localStorage.setItem('raffle_settings_v2', JSON.stringify(dataToSave));
    localStorage.setItem('raffle_description', description);
    localStorage.setItem('raffle_prize_name', prizeName);
    localStorage.setItem('raffle_prize_image', prizeImage);
    localStorage.setItem('raffle_is_admin', isAdmin ? 'true' : 'false');
    localStorage.setItem('raffle_my_purchases', JSON.stringify(myPurchases));
  }, [raffle, description, prizeName, prizeImage, isAdmin, myPurchases]);

  // Clean expired reservations
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRaffle(prev => {
        let changed = false;
        const nextReserved = new Map(prev.reservedNumbers);
        nextReserved.forEach((data, num) => {
          if (now >= data.expiresAt) {
            nextReserved.delete(num);
            changed = true;
          }
        });
        return changed ? { ...prev, reservedNumbers: nextReserved } : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const currentUserTotalTickets = useMemo(() => {
    const normalized = userPhone.replace(/\D/g, "");
    if (normalized.length < 8) return 0;
    return (raffle.phoneToNumbers.get(normalized)?.length || 0);
  }, [userPhone, raffle.phoneToNumbers]);

  const isLimitExceeded = useMemo(() => {
    if (!isPurchasing) return false;
    return (currentUserTotalTickets + isPurchasing.length) > raffle.maxEntriesPerPhone;
  }, [currentUserTotalTickets, isPurchasing, raffle.maxEntriesPerPhone]);

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
    const available: number[] = [];
    const start = currentPage * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, TOTAL_NUMBERS);
    
    for (let i = start; i < end; i++) {
      if (!raffle.soldNumbers.has(i) && !raffle.reservedNumbers.has(i)) {
        available.push(i);
      }
    }
    
    if (available.length < count) {
      alert(`Apenas ${available.length} números disponíveis nesta página.`);
      return;
    }

    const chosen = available.sort(() => 0.5 - Math.random()).slice(0, count);
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
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    if (isLimitExceeded) {
      alert(`Limite de ${raffle.maxEntriesPerPhone} bilhetes por telefone excedido.`);
      return;
    }

    const normalizedPhone = userPhone.replace(/\D/g, "");
    const now = Date.now();
    const participantId = `p-${now}-${Math.random().toString(36).substr(2, 5)}`;

    setRaffle((prev: RaffleState) => {
      const nextSold = new Set(prev.soldNumbers);
      const nextOwners = new Map(prev.numberOwners);
      const nextReserved = new Map(prev.reservedNumbers);
      const nextParticipants = new Map(prev.participants);
      const nextPhoneToNumbers = new Map(prev.phoneToNumbers);
      const nextParticipantToNumbers = new Map(prev.participantToNumbers);

      isPurchasing.forEach(n => {
        nextSold.add(n);
        nextOwners.set(n, participantId);
        nextReserved.delete(n);
      });

      const participant = { id: participantId, name: userName, phone: userPhone, email: userEmail };
      nextParticipants.set(participantId, participant);
      
      const phoneList = [...(nextPhoneToNumbers.get(normalizedPhone) || []), ...isPurchasing];
      nextPhoneToNumbers.set(normalizedPhone, phoneList);
      
      const participantList = [...(nextParticipantToNumbers.get(participantId) || []), ...isPurchasing];
      nextParticipantToNumbers.set(participantId, participantList);

      return { 
        ...prev, 
        soldNumbers: nextSold, 
        numberOwners: nextOwners, 
        reservedNumbers: nextReserved, 
        participants: nextParticipants, 
        phoneToNumbers: nextPhoneToNumbers, 
        participantToNumbers: nextParticipantToNumbers 
      };
    });

    const newPurchases: Purchase[] = isPurchasing.map(n => ({ number: n, date: now, prizeName }));
    setMyPurchases(prev => [...newPurchases, ...prev]);
    setIsPurchasing(null);
    setUserName(""); setUserPhone(""); setUserEmail("");
  }, [isPurchasing, userName, userPhone, userEmail, prizeName, isLimitExceeded, raffle.maxEntriesPerPhone]);

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
      reader.onloadend = () => setTempPrizeImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAIRegenerateImage = async () => {
    setIsGeneratingImg(true);
    const img = await generatePrizeImage(tempPrizeName);
    if (img) setTempPrizeImage(img);
    setIsGeneratingImg(false);
  };

  const handleAIRegenerateDesc = async () => {
    setIsGeneratingAi(true);
    const desc = await generateRaffleDescription(tempPrizeName, aiInstruction);
    setTempDescription(desc);
    setIsGeneratingAi(false);
  };

  const runDraw = async () => {
    if (raffle.soldNumbers.size === 0) return alert("Nenhum número vendido ainda.");
    const soldArray = Array.from(raffle.soldNumbers);
    const winnerNum = soldArray[Math.floor(Math.random() * soldArray.length)];
    const ownerId = raffle.numberOwners.get(winnerNum);
    const participant = ownerId ? raffle.participants.get(ownerId) : null;

    if (participant) {
      const message = await announceWinner(participant.name, prizeName, winnerNum);
      setRaffle(prev => ({ 
        ...prev, 
        winner: { number: winnerNum, participant, message } 
      }));
    }
  };

  const numbersToDisplay = useMemo(() => {
    if (!searchQuery) {
      const start = currentPage * PAGE_SIZE;
      return Array.from({ length: PAGE_SIZE }, (_, i) => start + i).filter(n => n < TOTAL_NUMBERS);
    }
    
    const query = searchQuery.toLowerCase().trim();
    const num = parseInt(query, 10);
    if (!isNaN(num) && query.match(/^\d+$/)) {
      return [num].filter(n => n < TOTAL_NUMBERS);
    }

    // Search by participant name or phone
    const found: number[] = [];
    raffle.participants.forEach((p, id) => {
      if (p.name.toLowerCase().includes(query) || p.phone.includes(query)) {
        const pNums = raffle.participantToNumbers.get(id) || [];
        pNums.forEach(n => found.push(n));
      }
    });
    
    return Array.from(new Set(found)).sort((a,b) => a-b).slice(0, 100);
  }, [currentPage, searchQuery, raffle]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100">
      {isAdmin && (
        <div className="fixed top-4 left-4 z-[100] flex gap-2">
          <button onClick={() => setIsAdmin(false)} className="bg-rose-600 text-white px-5 py-2.5 rounded-full text-xs font-black shadow-xl hover:bg-rose-700 transition-all flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            SAIR ADM
          </button>
          <button onClick={() => { setTempDescription(description); setTempPrizeName(prizeName); setTempPrizeImage(prizeImage); setIsAdminSettingsOpen(true); }} className="bg-indigo-600 text-white px-5 py-2.5 rounded-full text-xs font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            CONFIGURAÇÕES
          </button>
        </div>
      )}

      {/* Hero Section */}
      <header className="bg-indigo-950 text-white pt-20 pb-40 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.15),transparent)] pointer-events-none"></div>
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16 items-center relative z-10">
          <div className="flex-1 space-y-8">
            <div className="inline-block bg-indigo-500/20 px-4 py-1.5 rounded-full border border-indigo-400/30">
              <span className="text-indigo-300 text-xs font-black tracking-widest uppercase">Grande Oportunidade</span>
            </div>
            <h1 className="text-5xl lg:text-8xl font-black tracking-tight leading-[0.9]">{prizeName}</h1>
            <p className="text-indigo-200 text-xl leading-relaxed max-w-2xl font-medium opacity-80 whitespace-pre-wrap">{description}</p>
            {prizeImage && (
              <div className="rounded-[48px] overflow-hidden border-8 border-white/5 shadow-3xl aspect-video bg-indigo-900/50 group cursor-zoom-in">
                <img src={prizeImage} alt="Prêmio" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              </div>
            )}
          </div>
          
          <div className="shrink-0 w-full max-w-sm bg-white/5 backdrop-blur-2xl p-10 rounded-[56px] border border-white/10 text-center shadow-4xl sticky top-8">
            <span className="text-indigo-300 font-black uppercase tracking-[0.2em] text-[10px]">Bilhete Promocional</span>
            <div className="text-7xl font-black my-6 tracking-tighter">R$ {raffle.pricePerNumber.toFixed(2)}</div>
            <div className="space-y-4">
              <button onClick={() => buyRandom(10)} className="w-full bg-white text-indigo-950 py-5 rounded-3xl font-black text-xl hover:bg-indigo-50 transition-colors shadow-xl">Comprar Bilhete</button>
              <button onClick={() => buyRandom(50)} className="w-full bg-indigo-600 text-white py-4 rounded-3xl font-black text-lg hover:bg-indigo-500 transition-colors">Comprar 50 Cotas</button>
            </div>
            <p className="text-[10px] text-indigo-300/50 font-bold mt-8 uppercase tracking-widest">Limite por telefone: {raffle.maxEntriesPerPhone} unidades</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 -mt-20 relative z-20 pb-60">
        <Dashboard total={TOTAL_NUMBERS} sold={raffle.soldNumbers.size} reserved={raffle.reservedNumbers.size} revenue={raffle.soldNumbers.size * raffle.pricePerNumber} isAdmin={isAdmin} />
        
        {/* Controls */}
        <div className="bg-white p-5 rounded-[40px] shadow-2xl border border-slate-100 mb-10 flex flex-col md:flex-row gap-6 items-center">
          <div className="relative flex-1 w-full">
            <input type="text" placeholder="Busque por número, nome do participante ou telefone..." className="w-full pl-14 pr-6 py-5 bg-slate-50 rounded-[28px] outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold text-slate-700 transition-all border border-slate-100" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <svg className="w-6 h-6 text-slate-300 absolute left-5 top-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          {!searchQuery && (
            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-[28px] border border-slate-100">
              <button onClick={() => setCurrentPage(p => Math.max(0, p-1))} className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-20" disabled={currentPage === 0}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="flex flex-col items-center px-4">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Página</span>
                <div className="flex items-center gap-2">
                   <input type="number" value={currentPage + 1} onChange={e => { let p = parseInt(e.target.value); if(!isNaN(p)) setCurrentPage(Math.max(0, Math.min(9999, p - 1))); }} className="w-16 text-center font-black bg-transparent outline-none text-indigo-600 text-xl" />
                   <span className="text-slate-300 font-bold">/ 10.000</span>
                </div>
              </div>
              <button onClick={() => setCurrentPage(p => Math.min(9999, p + 1))} className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-20" disabled={currentPage === 9999}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </div>

        <div className="bg-white p-10 rounded-[56px] shadow-3xl border border-slate-100">
          <NumberGrid numbers={numbersToDisplay} soldNumbers={raffle.soldNumbers} reservedNumbers={raffle.reservedNumbers} numberOwners={raffle.numberOwners} participants={raffle.participants} onSelect={handleSelectNumber} isAdmin={isAdmin} />
        </div>
      </main>

      {/* Modals */}
      {isAdminSettingsOpen && (
        <div className="fixed inset-0 bg-indigo-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-5xl rounded-[56px] shadow-4xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in duration-300">
            <div className="p-10 bg-indigo-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-3xl font-black tracking-tight">Gerenciamento</h3>
                <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mt-1">Configurações globais e IA</p>
              </div>
              <button onClick={() => setIsAdminSettingsOpen(false)} className="w-12 h-12 bg-white/10 rounded-full hover:bg-white/20 transition-colors flex items-center justify-center"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-10 overflow-y-auto space-y-10 flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-2 px-1">Nome do Prêmio</label>
                    <input type="text" value={tempPrizeName} onChange={e => setTempPrizeName(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[24px] outline-none focus:ring-4 focus:ring-indigo-500/10 font-black text-xl border border-slate-100" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-2 px-1">Descrição Comercial</label>
                    <textarea value={tempDescription} onChange={e => setTempDescription(e.target.value)} rows={6} className="w-full p-5 bg-slate-50 rounded-[24px] outline-none focus:ring-4 focus:ring-indigo-500/10 font-medium text-slate-600 border border-slate-100" />
                  </div>
                  <div className="p-6 bg-indigo-50 rounded-[32px] border border-indigo-100 space-y-4">
                     <label className="text-[10px] uppercase font-black text-indigo-400 tracking-widest block px-1">Assistente de IA</label>
                     <input type="text" placeholder="Instrução adicional (ex: 'mais formal', 'emoji de carro')" value={aiInstruction} onChange={e => setAiInstruction(e.target.value)} className="w-full p-4 bg-white rounded-2xl outline-none text-sm border border-indigo-100" />
                     <button onClick={handleAIRegenerateDesc} disabled={isGeneratingAi} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-200">
                        {isGeneratingAi ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                        Reescrever com IA
                     </button>
                  </div>
                </div>
                
                <div className="space-y-6">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block px-1">Visual do Prêmio</label>
                  <div className="aspect-video rounded-[32px] overflow-hidden bg-slate-100 border-4 border-dashed border-slate-200 relative group flex items-center justify-center">
                    {tempPrizeImage ? <img src={tempPrizeImage} className="w-full h-full object-cover" /> : <div className="text-slate-300 flex flex-col items-center"><svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><span className="font-black text-[10px] uppercase tracking-widest">Sem Foto</span></div>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => fileInputRef.current?.click()} className="py-4 border-2 border-slate-100 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-600 hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                       Upload
                    </button>
                    <button onClick={handleAIRegenerateImage} disabled={isGeneratingImg} className="py-4 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                       {isGeneratingImg ? <div className="w-4 h-4 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                       Gerar com IA
                    </button>
                  </div>
                  <input type="text" value={tempImageUrlInput} onChange={e => setTempImageUrlInput(e.target.value)} placeholder="Link direto da imagem (URL)" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 text-sm italic" />
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-10 border-t border-slate-100">
                <button onClick={runDraw} className="bg-amber-500 text-white py-6 rounded-[28px] font-black text-xl hover:bg-amber-600 transition-all shadow-xl shadow-amber-100 flex items-center justify-center gap-3">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
                   REALIZAR SORTEIO
                </button>
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 bg-slate-50 rounded-[24px]">
                      <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Preço unitário</span>
                      <input type="number" step="0.5" value={raffle.pricePerNumber} onChange={e => setRaffle({...raffle, pricePerNumber: parseFloat(e.target.value) || 0})} className="bg-transparent font-black text-indigo-600 text-xl w-full outline-none" />
                   </div>
                   <div className="p-4 bg-slate-50 rounded-[24px]">
                      <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Máx p/ Telefone</span>
                      <input type="number" value={raffle.maxEntriesPerPhone} onChange={e => setRaffle({...raffle, maxEntriesPerPhone: parseInt(e.target.value) || 1})} className="bg-transparent font-black text-indigo-600 text-xl w-full outline-none" />
                   </div>
                </div>
              </div>
            </div>
            <div className="p-10 bg-slate-50 border-t border-slate-200 flex gap-4">
              <button onClick={() => setIsAdminSettingsOpen(false)} className="flex-1 py-5 font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest text-xs">Descartar</button>
              <button onClick={saveAdminSettings} className="flex-[2] py-5 bg-indigo-600 text-white rounded-[24px] font-black text-lg shadow-2xl hover:bg-indigo-700 transition-all">SALVAR ALTERAÇÕES</button>
            </div>
          </div>
        </div>
      )}

      {/* Identificação / Compra Modal */}
      {isPurchasing && (
        <div className="fixed inset-0 bg-indigo-950/95 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[56px] p-12 shadow-4xl animate-in fade-in zoom-in duration-300">
            <h3 className="text-4xl font-black mb-2 text-slate-900 tracking-tight">Identificação</h3>
            <p className="text-slate-500 mb-10 text-lg leading-snug">Identifique-se para validar seus {isPurchasing.length} bilhetes exclusivos.</p>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest px-1">Nome Completo</label>
                <input type="text" placeholder="Como no documento" value={userName} onChange={e => setUserName(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[24px] outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold border border-slate-100" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest px-1">Telefone (WhatsApp)</label>
                <input type="tel" placeholder="(00) 00000-0000" value={userPhone} onChange={e => setUserPhone(e.target.value)} className={`w-full p-5 bg-slate-50 rounded-[24px] outline-none focus:ring-4 ${isLimitExceeded ? 'ring-rose-500/20 border-rose-200' : 'focus:ring-indigo-500/10'} font-bold border border-slate-100`} />
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] text-slate-400 font-bold">Cotas atuais: {currentUserTotalTickets}</span>
                  {isLimitExceeded && <span className="text-[10px] text-rose-500 font-black uppercase">Limite excedido!</span>}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest px-1">E-mail para Recibo</label>
                <input type="email" placeholder="seu@email.com" value={userEmail} onChange={e => setUserEmail(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[24px] outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold border border-slate-100" />
              </div>
              <div className="flex gap-4 pt-8">
                <button onClick={() => { setIsPurchasing(null); setRaffle(prev => ({...prev, reservedNumbers: new Map()})); }} className="flex-1 py-5 text-slate-400 font-black uppercase text-xs tracking-widest">Voltar</button>
                <button onClick={handlePurchase} disabled={isLimitExceeded} className={`flex-[2] py-5 rounded-[24px] font-black text-lg shadow-2xl transition-all ${isLimitExceeded ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>VALIDAR COMPRA</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vencedor Modal */}
      {raffle.winner && (
        <div className="fixed inset-0 bg-indigo-950/98 backdrop-blur-2xl z-[300] flex items-center justify-center p-6">
          <div className="bg-white max-w-2xl w-full rounded-[72px] p-16 text-center shadow-4xl animate-in zoom-in duration-500 border-[16px] border-amber-400/10">
            <div className="inline-block bg-amber-100 text-amber-600 px-6 py-2 rounded-full font-black text-sm uppercase tracking-[0.3em] mb-10">Parabéns!</div>
            <h2 className="text-5xl lg:text-7xl font-black mb-12 text-slate-900 tracking-tighter">GANHADOR(A)!</h2>
            <div className="bg-slate-50 p-12 rounded-[56px] mb-10 border border-slate-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5"><svg className="w-40 h-40" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>
              <div className="text-8xl font-black text-indigo-600 mb-6 tracking-tighter">#{raffle.winner.number.toString().padStart(6, '0')}</div>
              <div className="text-4xl font-black text-slate-800">{raffle.winner.participant.name}</div>
            </div>
            {raffle.winner.message && <p className="text-lg italic text-slate-500 font-medium px-8 leading-relaxed mb-12">"{raffle.winner.message}"</p>}
            <button onClick={() => setRaffle(prev => ({...prev, winner: undefined}))} className="bg-slate-900 text-white px-16 py-6 rounded-[32px] font-black text-xl hover:bg-black transition-all shadow-2xl">FECHAR ANÚNCIO</button>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {isAdminLoginOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[250] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-4xl">
            <div className="flex justify-center mb-8">
               <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
               </div>
            </div>
            <h3 className="text-2xl font-black text-center mb-2">Acesso Privado</h3>
            <p className="text-center text-slate-400 text-sm mb-10 font-medium">Digite sua credencial de administrador.</p>
            <input type="password" value={adminPassInput} onChange={e => setAdminPassInput(e.target.value)} placeholder="••••••••" className="w-full p-5 bg-slate-50 rounded-2xl mb-8 outline-none focus:ring-4 focus:ring-indigo-500/10 font-black text-center tracking-widest text-2xl border border-slate-100" />
            <div className="flex gap-4">
              <button onClick={() => setIsAdminLoginOpen(false)} className="flex-1 py-4 font-black text-slate-400 uppercase text-[10px] tracking-widest">Cancelar</button>
              <button onClick={handleAdminLogin} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">ENTRAR</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Buttons */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 z-50">
        <button onClick={() => setIsHistoryOpen(true)} className="bg-indigo-950 text-white px-10 py-5 rounded-full shadow-4xl flex items-center gap-4 font-black text-sm tracking-tight hover:scale-105 active:scale-95 transition-all">
          <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
          HISTÓRICO ({myPurchases.length})
        </button>
        {!isAdmin && (
          <button onClick={() => setIsAdminLoginOpen(true)} className="w-14 h-14 bg-white rounded-full shadow-4xl flex items-center justify-center text-slate-200 hover:text-indigo-600 transition-all border border-slate-100">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </button>
        )}
      </div>

      {/* My Purchases Sidebar */}
      <div className={`fixed inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-4xl z-[150] transform transition-transform duration-500 ease-out ${isHistoryOpen ? 'translate-x-0' : 'translate-x-full'}`}>
         <div className="flex flex-col h-full">
            <div className="p-10 bg-indigo-950 text-white flex items-center justify-between">
               <div>
                  <h2 className="text-3xl font-black tracking-tight">Cotas Adquiridas</h2>
                  <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mt-1">Sincronizado via dispositivo</p>
               </div>
               <button onClick={() => setIsHistoryOpen(false)} className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50 space-y-4">
               {myPurchases.length === 0 ? (
                 <div className="text-center py-40">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl"><svg className="w-10 h-10 text-slate-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg></div>
                    <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Sem registros locais</p>
                 </div>
               ) : (
                 myPurchases.sort((a,b) => b.date - a.date).map((p, i) => (
                    <div key={i} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-lg transition-all">
                       <div className="space-y-1">
                          <span className="text-[8px] font-black uppercase text-indigo-400 tracking-widest">{p.prizeName}</span>
                          <div className="text-3xl font-black text-slate-900 tracking-tighter">#{p.number.toString().padStart(6, '0')}</div>
                          <div className="text-[10px] text-slate-400 font-bold">{new Date(p.date).toLocaleString()}</div>
                       </div>
                       <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-200 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       </div>
                    </div>
                 ))
               )}
            </div>
         </div>
      </div>
    </div>
  );
};

export default App;
