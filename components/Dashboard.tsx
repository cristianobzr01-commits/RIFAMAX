
import React from 'react';

interface DashboardProps {
  total: number;
  sold: number;
  reserved: number;
  revenue: number;
  isAdmin: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ total, sold, reserved, revenue, isAdmin }) => {
  const soldPercentage = ((sold / total) * 100).toFixed(2);
  const reservedPercentage = ((reserved / total) * 100).toFixed(2);
  
  return (
    <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6 mb-8`}>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-slate-500 text-sm font-medium mb-1">Números Vendidos</h3>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-slate-900">{sold.toLocaleString()}</span>
          <span className="text-slate-400 text-sm mb-1">/ {total.toLocaleString()}</span>
        </div>
        <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden">
          <div 
            className="bg-indigo-600 h-full transition-all duration-500" 
            style={{ width: `${soldPercentage}%` }}
          />
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-slate-500 text-sm font-medium mb-1">Reservados</h3>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-amber-500">{reserved.toLocaleString()}</span>
        </div>
        <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden">
          <div 
            className="bg-amber-400 h-full transition-all duration-500" 
            style={{ width: `${reservedPercentage}%` }}
          />
        </div>
        <p className="text-slate-400 text-xs mt-2">Aguardando pagamento</p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-slate-500 text-sm font-medium mb-1">Progresso Total</h3>
        <div className="text-3xl font-bold text-slate-900">{soldPercentage}%</div>
        <p className="text-slate-400 text-sm mt-1">Conclusão da meta</p>
      </div>

      {isAdmin && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100 ring-2 ring-indigo-50 animate-in fade-in slide-in-from-top-2">
          <h3 className="text-indigo-600 text-sm font-black uppercase tracking-widest mb-1 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Arrecadação Bruta
          </h3>
          <div className="text-3xl font-black text-emerald-600">R$ {revenue.toLocaleString()}</div>
          <p className="text-slate-400 text-xs mt-1">Visível apenas para administradores</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
