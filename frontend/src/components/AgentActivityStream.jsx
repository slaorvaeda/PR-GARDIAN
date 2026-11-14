import React, { useState } from 'react';
import { Terminal, Shield, Layers, TestTube2, Filter, UserCheck, ChevronDown, ChevronUp, Check, AlertCircle } from 'lucide-react';

export default function AgentActivityStream({ events = [], isRunning = false, criticDroppedCount = 0 }) {
  const [isOpen, setIsOpen] = useState(true);

  const stages = [
    { id: 'ast', label: 'AST & pgvector', icon: Layers, desc: 'Deconstruct AST & Query Codebase' },
    { id: 'security', label: 'Security Agent', icon: Shield, desc: 'OWASP & Credential Scans' },
    { id: 'arch', label: 'Architecture Agent', icon: Layers, desc: 'Layering & Drift Check' },
    { id: 'test', label: 'Test Agent', icon: TestTube2, desc: 'Coverage & Test Synthesis' },
    { id: 'critic', label: 'Critic Node', icon: Filter, desc: `Filter False Positives (${criticDroppedCount} dropped)` },
    { id: 'hitl', label: 'Human Approval', icon: UserCheck, desc: 'LangGraph Pause Barrier' }
  ];

  return (
    <div className="border border-[#30363d] rounded-xl bg-[#161b22] overflow-hidden mb-6 shadow-xl">
      {/* Header bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-5 py-3 bg-[#21262d]/50 flex items-center justify-between cursor-pointer hover:bg-[#21262d] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {isRunning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isRunning ? 'bg-emerald-500' : 'bg-[#8b949e]'}`}></span>
            </span>
            <span className="font-semibold text-xs text-[#c9d1d9] uppercase tracking-wider">
              {isRunning ? 'LangGraph Agent Execution in Progress' : 'LangGraph Execution Trace (Complete)'}
            </span>
          </div>
          {criticDroppedCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
              Critic filtered {criticDroppedCount} false positives
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-[#8b949e]">
          <span>{events.length} events logged</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Visual Pipeline Stages */}
      <div className="p-4 border-b border-[#30363d] bg-[#0d1117]/60">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {stages.map((st, i) => {
            const Icon = st.icon;
            return (
              <div 
                key={st.id}
                className="flex flex-col p-2.5 rounded-lg border border-[#30363d] bg-[#161b22] relative group hover:border-[#58a6ff]/40 transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-[#8b949e] font-mono">0{i + 1}</span>
                  <div className="w-5 h-5 rounded-md bg-[#21262d] flex items-center justify-center text-emerald-400">
                    <Icon className="w-3 h-3" />
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#c9d1d9] leading-tight">{st.label}</span>
                <span className="text-[10px] text-[#8b949e] mt-1 truncate">{st.desc}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsible Log Terminal */}
      {isOpen && (
        <div className="p-4 bg-[#0d1117] font-mono text-xs max-h-48 overflow-y-auto space-y-1.5">
          {events.length === 0 ? (
            <div className="text-[#8b949e] italic py-2">Waiting for audit events to stream...</div>
          ) : (
            events.map((ev, index) => (
              <div key={index} className="flex items-start gap-2.5 text-[#8b949e] hover:text-[#c9d1d9] transition-colors leading-relaxed">
                <span className="text-[#58a6ff] select-none text-[11px]">❯</span>
                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider min-w-[110px]">
                  [{ev.step || 'info'}]
                </span>
                <span className="text-[#c9d1d9]">{ev.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
