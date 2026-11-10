import React from 'react';
import { Layers, Shield, Cpu, TestTube2, Filter, UserCheck, Send, CheckCircle2, Loader2, Sparkles, Zap, Clock } from 'lucide-react';

export default function AgentExecutionDAG({ isRunning = false, telemetry = {}, criticDroppedCount = 0 }) {
  const nodesState = telemetry?.nodes || {};

  const nodes = [
    {
      id: 'prepare_context',
      label: 'AST Indexer & pgvector',
      subtext: 'Semantic chunking & vector search',
      icon: Layers,
      color: 'emerald',
      status: nodesState.prepare_context ? 'completed' : isRunning ? 'running' : 'completed',
      duration: nodesState.prepare_context?.duration_ms || 420,
      tokens: nodesState.prepare_context?.tokens || 1100
    },
    {
      id: 'security_specialist',
      label: 'Security Specialist',
      subtext: 'OWASP Top 10 & secret scans',
      icon: Shield,
      color: 'rose',
      status: nodesState.security_specialist ? 'completed' : isRunning ? 'running' : 'completed',
      duration: nodesState.security_specialist?.duration_ms || 310,
      tokens: nodesState.security_specialist?.tokens || 480
    },
    {
      id: 'architecture_specialist',
      label: 'Architecture Drift',
      subtext: 'Domain boundaries & layering',
      icon: Cpu,
      color: 'purple',
      status: nodesState.architecture_specialist ? 'completed' : isRunning ? 'running' : 'completed',
      duration: nodesState.architecture_specialist?.duration_ms || 290,
      tokens: nodesState.architecture_specialist?.tokens || 390
    },
    {
      id: 'test_specialist',
      label: 'Test-Case Synthesizer',
      subtext: 'Coverage & unit test synthesis',
      icon: TestTube2,
      color: 'cyan',
      status: nodesState.test_specialist ? 'completed' : isRunning ? 'running' : 'completed',
      duration: nodesState.test_specialist?.duration_ms || 350,
      tokens: nodesState.test_specialist?.tokens || 540
    },
    {
      id: 'critic_filter',
      label: 'Critic Filter Node',
      subtext: `Drop false positives (${criticDroppedCount} dropped)`,
      icon: Filter,
      color: 'amber',
      status: nodesState.critic_filter ? 'completed' : isRunning ? 'running' : 'completed',
      duration: nodesState.critic_filter?.duration_ms || 180,
      tokens: nodesState.critic_filter?.tokens || 210
    },
    {
      id: 'human_interrupt',
      label: 'Human Approval Gate',
      subtext: 'LangGraph checkpointer pause',
      icon: UserCheck,
      color: 'blue',
      status: 'pending',
      duration: 0,
      tokens: 0
    }
  ];

  const totalTokens = telemetry?.total_tokens || 2720;
  const totalDuration = telemetry?.total_duration_ms || 1550;

  return (
    <div className="border border-[#30363d] rounded-2xl bg-[#161b22] p-5 mb-6 shadow-2xl relative overflow-hidden">
      {/* Background glow decoration */}
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* DAG Header & Telemetry Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-[#30363d]/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>LangGraph Multi-Agent Execution Graph (DAG)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                v2.0 Checkpointed
              </span>
            </h3>
            <p className="text-xs text-[#8b949e]">Parallel specialist fan-out with critic deduplication and state interrupts</p>
          </div>
        </div>

        {/* Telemetry stats */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#c9d1d9]">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{totalTokens.toLocaleString()} tokens</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#c9d1d9]">
            <Clock className="w-3.5 h-3.5 text-[#58a6ff]" />
            <span>~{totalDuration}ms latency</span>
          </div>
        </div>
      </div>

      {/* Visual DAG Nodes Flow */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 relative">
        {nodes.map((node, idx) => {
          const Icon = node.icon;
          const isCompleted = node.status === 'completed';
          const isCurrent = node.status === 'running';

          return (
            <div
              key={node.id}
              className={`relative flex flex-col p-3 rounded-xl border transition-all duration-300 ${
                isCurrent
                  ? 'border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-500/10 animate-pulse'
                  : isCompleted
                  ? 'border-[#30363d] bg-[#0d1117] hover:border-[#58a6ff]/40'
                  : 'border-[#21262d] bg-[#161b22]/50 opacity-75'
              }`}
            >
              {/* Node index & status icon */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-[#8b949e]">0{idx + 1}</span>
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#484f58]" />
                )}
              </div>

              {/* Node Icon & Title */}
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-md bg-[#21262d] flex items-center justify-center text-[#c9d1d9]">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-white truncate">{node.label}</span>
              </div>

              {/* Subtext description */}
              <p className="text-[11px] text-[#8b949e] line-clamp-2 leading-snug flex-1">
                {node.subtext}
              </p>

              {/* Node Telemetry footer */}
              <div className="mt-2.5 pt-2 border-t border-[#21262d] flex items-center justify-between text-[10px] font-mono text-[#8b949e]">
                <span>{node.duration > 0 ? `${node.duration}ms` : 'paused'}</span>
                <span>{node.tokens > 0 ? `${node.tokens} tok` : 'gate'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
