import React from 'react';
import { Shield, GitPullRequest, CheckCircle2, XCircle, Clock, Sparkles, TestTube2, RefreshCw, BookOpen, Github } from 'lucide-react';

export default function Header({ pr, user, onSeedDemo, onApprove, onReject, onOpenTests, onOpenGuidelines, isSeeding, isApproving }) {
  const statusConfig = {
    queued: {
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      icon: Clock,
      label: 'Job Queued'
    },
    running: {
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      icon: RefreshCw,
      label: 'LangGraph Running'
    },
    pending_approval: {
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: Clock,
      label: 'Awaiting Human Approval'
    },
    approved: {
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Approved & Dispatched to GitHub'
    },
    rejected: {
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      icon: XCircle,
      label: 'Review Rejected'
    }
  };

  const currentStatus = pr ? (statusConfig[pr.status] || statusConfig.pending_approval) : statusConfig.pending_approval;
  const StatusIcon = currentStatus.icon;

  return (
    <header className="border-b border-[#30363d] bg-[#161b22] px-6 py-3.5 sticky top-0 z-40 backdrop-blur-md bg-opacity-95 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & PR info */}
        <div className="flex items-center gap-3.5">
          <img
            src="/logo.jpg"
            alt="PR-Guardian Logo"
            className="h-9 w-9 rounded-xl object-cover shadow-lg shadow-cyan-500/20 border border-cyan-500/30"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white tracking-tight">PR-Guardian</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-semibold">
                MERN + pgvector + LangGraph
              </span>
            </div>
            {pr ? (
              <div className="flex items-center gap-2 text-xs text-[#8b949e] mt-0.5">
                <GitPullRequest className="w-3.5 h-3.5 text-[#58a6ff]" />
                <span className="font-semibold text-[#c9d1d9]">{pr.repoId}</span>
                <span>#{pr.prNumber}</span>
                <span>•</span>
                <span className="truncate max-w-[240px]">{pr.title}</span>
                <span>•</span>
                <span>by @{pr.author}</span>
              </div>
            ) : (
              <p className="text-xs text-[#8b949e]">Autonomous Codebase & Pull Request Reviewer</p>
            )}
          </div>
        </div>

        {/* Actions, Guidelines & User Profile */}
        <div className="flex items-center flex-wrap gap-2">
          {pr && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${currentStatus.color}`}>
              <StatusIcon className={`w-3.5 h-3.5 ${pr.status === 'running' ? 'animate-spin' : ''}`} />
              <span>{currentStatus.label}</span>
            </div>
          )}

          <button
            onClick={onOpenGuidelines}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] transition-all shadow-sm"
          >
            <BookOpen className="w-3.5 h-3.5 text-purple-400" />
            <span>Guidelines</span>
          </button>

          {pr?.generatedTests?.length > 0 && (
            <button
              onClick={onOpenTests}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] transition-all shadow-sm"
            >
              <TestTube2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tests ({pr.generatedTests.length})</span>
            </button>
          )}

          <button
            onClick={onSeedDemo}
            disabled={isSeeding}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] transition-all disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#58a6ff] ${isSeeding ? 'animate-spin' : ''}`} />
            <span>Seed Demo PR</span>
          </button>

          {pr && pr.status === 'pending_approval' && (
            <>
              <button
                onClick={onReject}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all shadow-sm"
              >
                Reject
              </button>
              <button
                onClick={onApprove}
                disabled={isApproving}
                className="flex items-center gap-1.5 px-3.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isApproving ? 'Dispatching...' : 'Approve & Post'}</span>
              </button>
            </>
          )}

          {/* GitHub OAuth User Profile Pill */}
          <div className="flex items-center gap-2 pl-2 border-l border-[#30363d]">
            <img
              src={user?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
              alt={user?.login || 'User'}
              className="w-7 h-7 rounded-full border border-emerald-500/40 object-cover"
            />
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-[11px] font-bold text-white leading-tight">@{user?.login || 'priyanshunayak'}</span>
              <span className="text-[9px] text-[#8b949e] font-mono leading-tight">{user?.role || 'Staff Reviewer'}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
