
import React, { useState, useEffect } from 'react';
import { Participant } from '../types';

interface NumberGridProps {
  numbers: number[];
  soldNumbers: Set<number>;
  reservedNumbers: Map<number, { expiresAt: number }>;
  numberOwners: Map<number, string>;
  participants: Map<string, Participant>;
  onSelect: (num: number) => void;
  isAdmin: boolean;
}

const NumberGrid: React.FC<NumberGridProps> = ({ 
  numbers, 
  soldNumbers, 
  reservedNumbers, 
  numberOwners, 
  participants, 
  onSelect, 
  isAdmin 
}) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatNumber = (num: number) => num.toString().padStart(6, '0');

  const getParticipant = (num: number) => {
    const pId = numberOwners.get(num);
    if (!pId) return null;
    return participants.get(pId);
  };

  const getOwnerDisplayName = (num: number) => {
    const p = getParticipant(num);
    if (!p) return "Participante";
    return p.name.split(' ')[0]; // Público: apenas o primeiro nome
  };

  const formatTime = (expiresAt: number) => {
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-4">
      {numbers.map((num) => {
        const isSold = soldNumbers.has(num);
        const reservationData = reservedNumbers.get(num);
        const isReserved = !!reservationData;
        const participant = isSold ? getParticipant(num) : null;
        const ownerName = isSold ? getOwnerDisplayName(num) : null;
        
        return (
          <button
            key={num}
            disabled={isSold || isReserved}
            onClick={() => onSelect(num)}
            className={`
              p-4 rounded-[24px] text-center font-mono transition-all border-2 relative overflow-hidden flex flex-col items-center justify-center min-h-[100px] group
              ${isSold 
                ? 'bg-rose-50 border-rose-100 text-rose-600 cursor-default' 
                : isReserved
                ? 'bg-amber-50 border-amber-100 text-amber-600 cursor-not-allowed'
                : 'bg-white border-slate-100 text-slate-700 hover:border-indigo-500 hover:bg-indigo-50 hover:scale-105 active:scale-95 shadow-sm'}
            `}
          >
            <span className="font-black text-base">{formatNumber(num)}</span>
            
            {isSold ? (
              <div className="flex flex-col items-center mt-2 w-full">
                <span className="text-[7px] uppercase font-black opacity-40 tracking-widest mb-1">Identificado</span>
                <span className="text-[11px] font-sans font-black leading-tight truncate w-full px-1 text-center">
                  {isAdmin && participant ? participant.name : ownerName}
                </span>
                {isAdmin && participant && (
                  <span className="text-[8px] font-sans font-bold opacity-60 mt-1">{participant.phone}</span>
                )}
              </div>
            ) : isReserved ? (
              <div className="flex flex-col items-center mt-2">
                <span className="text-[7px] uppercase tracking-widest font-black opacity-40 mb-1">Pendente</span>
                <span className="text-[11px] tabular-nums font-black">{formatTime(reservationData.expiresAt)}</span>
              </div>
            ) : (
              <div className="mt-2 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity">
                 <span className="text-[7px] uppercase font-black text-indigo-400">Selecionar</span>
              </div>
            )}
            
            {isReserved && (
              <div className="absolute inset-0 bg-amber-400/5 animate-pulse pointer-events-none"></div>
            )}
            {isSold && (
              <div className="absolute top-1 right-1">
                 <svg className="w-3 h-3 opacity-20" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              </div>
            )}
          </button>
        );
      })}
      {numbers.length === 0 && (
        <div className="col-span-full py-32 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <p className="text-slate-400 font-black uppercase tracking-widest text-sm">Nenhum bilhete ou identificação encontrada</p>
          <p className="text-slate-300 text-xs mt-2">Refine sua busca ou verifique o número do telefone.</p>
        </div>
      )}
    </div>
  );
};

export default NumberGrid;
