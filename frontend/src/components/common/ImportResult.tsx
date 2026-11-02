import { AlertCircle, CheckCircle } from 'lucide-react';
import type { ImportOutcome } from '../../utils/importOutcome';

export default function ImportResult({ result }: Readonly<{ result: ImportOutcome | null }>) {
  if (!result) return null;
  const Icon = result.success ? CheckCircle : AlertCircle;
  const tone = result.success ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger';
  return (
    <div className={`rounded-xl p-4 flex items-center gap-3 border border-line animate-in fade-in slide-in-from-bottom-2 ${tone}`}>
      <Icon className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
      <output className="font-semibold">{result.message}</output>
    </div>
  );
}
