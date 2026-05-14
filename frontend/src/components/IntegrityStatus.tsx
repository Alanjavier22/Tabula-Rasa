import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import type { Account, CreditCardStatement } from '../types';
import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface IntegrityStatusProps {
  accounts: Account[];
  statements: CreditCardStatement[];
  isLoading?: boolean;
}

export const IntegrityStatus = ({ accounts, statements, isLoading }: IntegrityStatusProps) => {
  const healthStatus = useMemo(() => {
    if (isLoading) return { status: 'loading', message: 'Verificando...' };
    
    const ccAccounts = accounts.filter(a => a.account_type === 'credit_card');
    let discrepancies = 0;
    
    ccAccounts.forEach(acc => {
      const latestStmt = statements
        .filter(s => s.account_id === acc.id)
        .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))[0];
      
      if (latestStmt) {
        const diff = Math.abs(acc.balance + latestStmt.statement_balance);
        if (diff > 10) discrepancies++;
      }
    });

    if (discrepancies > 0) {
      return { 
        status: 'warning', 
        message: 'DISCREPANCIA BANCARIA',
        severity: 'amber'
      };
    }

    return { 
      status: 'healthy', 
      message: 'INTEGRIDAD MATEMÁTICA: 100%',
      severity: 'emerald'
    };
  }, [accounts, statements, isLoading]);

  if (healthStatus.status === 'loading') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/30 border border-slate-700/30 text-[9px] font-black text-slate-400 uppercase tracking-tighter">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        {healthStatus.message}
      </div>
    );
  }

  const isHealthy = healthStatus.status === 'healthy';

  return (
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.02 }}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-lg backdrop-blur-md transition-colors duration-500 w-fit ${
        isHealthy 
          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400 shadow-emerald-500/5' 
          : 'bg-amber-500/5 border-amber-500/20 text-amber-400 shadow-amber-500/5'
      } text-[10px] font-bold uppercase tracking-wider cursor-help relative overflow-hidden`}
      title={isHealthy ? 'Balances sincronizados con la fuente de verdad bancaria' : 'Se detectaron diferencias significativas entre el balance y el estado de cuenta'}
    >
      {/* Animated Glow Overlay */}
      <motion.div 
        animate={{ 
          opacity: [0.1, 0.3, 0.1],
          scale: [1, 1.2, 1]
        }}
        transition={{ 
          duration: isHealthy ? 3 : 1.5, 
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className={`absolute inset-0 blur-xl ${isHealthy ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}
      />

      {isHealthy ? (
        <ShieldCheck className="w-2.5 h-2.5 relative z-10" />
      ) : (
        <ShieldAlert className="w-2.5 h-2.5 relative z-10 animate-pulse" />
      )}
      <span className="relative z-10">{healthStatus.message}</span>
    </motion.div>
  );
};
