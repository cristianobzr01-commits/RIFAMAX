
import React from 'react';

interface DashboardProps {
  total: number;
  sold: number;
  reserved: number;
  revenue: number;
  isAdmin: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ total, sold, reserved, revenue, isAdmin }) => {
  const soldPercentage = ((sold / total) * 100).toFixed(4); // Mais precisão para grandes números
  const reservedPercentage = ((reserved / total) * 100).toFixed(4);
  
  return (
    <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6 mb-8`}>
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-500">
        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Números Identificados</h3>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-black text-slate-900 tracking-tight">{sold.toLocaleString()}</span>
          <span className="text-slate-300 font-bold mb-1">/ 1M</span>
        </div>
        <div className="w-full bg-slate-50 h-3 rounded-full mt-6 overflow-hidden border border-slate-100">
          <div 
            className="bg-orange-600 h-full transition-all duration-1000 cubic-bezier(0.4, 0, 0.2, 1)" 
            style={{ width: `${Math.max(parseFloat(soldPercentage), 1)}%` }}
          />
        </div>
      </div>

      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-500">
        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Reservas Ativas</h3>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-black text-amber-500 tracking-tight">{reserved.toLocaleString()}</span>
        </div>
        <div className="w-full bg-slate-50 h-3 rounded-full mt-6 overflow-hidden border border-slate-100">
          <div 
            className="bg-amber-400 h-full transition-all duration-1000" 
            style={{ width: `${Math.max(parseFloat(reservedPercentage), 1)}%` }}
          />
        </div>
        <p className="text-slate-300 text-[9px] font-bold uppercase mt-3 flex items-center gap-1">
           <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
           Aguardando confirmação
        </p>
      </div>

      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-500 flex flex-col justify-center">
        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Arrecadação Global</h3>
        <div className="text-4xl font-black text-slate-900 tracking-tight">{soldPercentage}%</div>
        <div className="flex items-center gap-2 mt-2">
           <span className="text-[10px] text-emerald-500 font-black uppercase">Meta em Progresso</span>
           <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7h8m0 0v8m0-8l-9 9-4-4-6 6" /></svg>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-black p-8 rounded-[40px] shadow-2xl border border-white/10 ring-8 ring-slate-50 animate-in fade-in slide-in-from-top-4">
          <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Caixa Adm
          </h3>
          <div className="text-3xl font-black text-white">R$ {revenue.toLocaleString()}</div>
          <p className="text-slate-500 text-[9px] font-bold uppercase mt-2 tracking-widest">Saldo Disponível</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
