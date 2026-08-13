import { Cpu, Sparkles } from 'lucide-react';
import type { ToastMessage } from './types';

interface LabsTabProps {
  aiPersona: string;
  onPersonaChange: (personaId: string) => void;
  setToast: (toast: ToastMessage) => void;
}

const PERSONAS = [
  { id: 'professional', label: 'Analista Senior', desc: 'Preciso, educado y directo al punto.', icon: '👔' },
  { id: 'roast', label: 'Modo Roast', desc: 'Sin piedad. Te humillará por cada café que compres fuera.', icon: '🔥' },
  { id: 'gamified', label: 'RPG Master', desc: 'Convierte tus finanzas en una misión de nivel legendario.', icon: '⚔️' },
  { id: 'coach', label: 'Motivador Personal', desc: '¡Vamos! Un pequeño ahorro hoy es una victoria mañana.', icon: '📣' },
  { id: 'sabio', label: 'Maestro Zen', desc: 'Encuentra el equilibrio entre el gasto y la paz interior.', icon: '🧘' },
  { id: 'detective', label: 'Forense Financiero', desc: 'Seguirá el rastro de cada centavo perdido.', icon: '🔍' },
];

const DIAGNOSTIC_COMPONENTS = [
  { id: 'sentinel', name: 'Sentinel Agent', desc: 'Orquestador de salud financiera y alertas.' },
  { id: 'anomaly', name: 'Anomaly Scanner', desc: 'Detección de gastos atípicos y fugas.' },
  { id: 'fiscal', name: 'Fiscal Intelligence', desc: 'Cálculo de impuestos y proyecciones SRI.' },
  { id: 'whatif', name: 'What-If Simulator', desc: 'Simulación de escenarios y proyecciones de ahorro.' },
  { id: 'audio', name: 'Multimodal Engine', desc: 'Procesamiento de notas de voz y documentos (OCR).' },
  { id: 'categorization', name: 'Semantic Brain', desc: 'Categorización inteligente de transacciones.' },
];

const LabsTab = ({ aiPersona, onPersonaChange, setToast }: LabsTabProps) => {
  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
            <Cpu className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Personalidad del Asistente</h2>
            <p className="text-slate-400 text-sm">Define cómo interactúa la IA contigo</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => onPersonaChange(p.id)}
              className={`flex items-start gap-4 p-5 rounded-3xl border transition-all text-left group ${
                aiPersona === p.id
                  ? 'bg-purple-500/10 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.1)]'
                  : 'bg-black/20 border-white/5 hover:border-white/10'
              }`}
            >
              <span className="text-3xl transition-transform group-hover:scale-110 duration-300">{p.icon}</span>
              <div>
                <h3 className={`font-bold text-sm mb-1 ${aiPersona === p.id ? 'text-purple-400' : 'text-white'}`}>
                  {p.label}
                </h3>
                <p className="text-xs text-slate-500 leading-normal">{p.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Diagnóstico de Componentes</h2>
            <p className="text-slate-400 text-sm">Prueba el razonamiento de los motores de IA</p>
          </div>
        </div>

        <div className="space-y-4">
          {DIAGNOSTIC_COMPONENTS.map((comp) => (
            <div key={comp.id} className="group bg-black/20 rounded-3xl p-6 border border-white/5 flex items-center justify-between hover:border-white/10 transition-all">
              <div className="flex-1">
                <h3 className="font-bold text-white text-sm group-hover:text-amber-400 transition-all">{comp.name}</h3>
                <p className="text-xs text-slate-500">{comp.desc}</p>
              </div>
              <button
                onClick={async (e) => {
                  const btn = e.currentTarget;
                  btn.disabled = true;
                  try {
                    const { aiAPI } = await import('../../services/api');
                    const res = await aiAPI.testComponent(comp.id);
                    if (res.data.status === 'success') {
                      setToast({ message: `${comp.name}: OK`, type: 'success' });
                    } else {
                      setToast({ message: `${comp.name}: Error`, type: 'error' });
                    }
                  } catch {
                    setToast({ message: 'Error de servidor', type: 'error' });
                  } finally {
                    btn.disabled = false;
                  }
                }}
                className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase rounded-xl border border-indigo-500/20 transition-all"
              >
                Test
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default LabsTab;
