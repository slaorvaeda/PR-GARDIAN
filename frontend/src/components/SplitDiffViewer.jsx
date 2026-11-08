import React, { useState } from 'react';
import { FileCode, ShieldAlert, Cpu, TestTube2, AlertTriangle, Edit3, Trash2, Check, Copy, CheckCheck, MessageSquare, Send, Bot, User, Sparkles } from 'lucide-react';

export default function SplitDiffViewer({ files = [], findings = [], onEditComment, onDismissComment, onReplyComment }) {
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [editingFindingId, setEditingFindingId] = useState(null);
  const [editMessageText, setEditMessageText] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  if (!files || files.length === 0) {
    return (
      <div className="border border-[#30363d] rounded-xl p-12 text-center bg-[#161b22] text-[#8b949e]">
        No modified files found in this Pull Request.
      </div>
    );
  }

  const currentFile = files[selectedFileIdx] || files[0];
  const fileFindings = findings.filter(f => f.file_path === currentFile.filePath && !f.dismissed);

  const findingsByLine = {};
  for (const f of fileFindings) {
    if (!findingsByLine[f.line_number]) {
      findingsByLine[f.line_number] = [];
    }
    findingsByLine[f.line_number].push(f);
  }

  const handleStartEdit = (f) => {
    setEditingFindingId(f.id);
    setEditMessageText(f.message);
  };

  const handleSaveEdit = (f) => {
    onEditComment(f.id, editMessageText);
    setEditingFindingId(null);
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="border border-[#30363d] rounded-xl bg-[#161b22] overflow-hidden shadow-2xl">
      {/* File Navigation Bar */}
      <div className="flex items-center overflow-x-auto border-b border-[#30363d] bg-[#0d1117] px-2 py-2 gap-1.5">
        {files.map((file, idx) => {
          const count = findings.filter(f => f.file_path === file.filePath && !f.dismissed).length;
          const isSelected = idx === selectedFileIdx;

          return (
            <button
              key={file.filePath}
              onClick={() => setSelectedFileIdx(idx)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all whitespace-nowrap ${
                isSelected
                  ? 'bg-[#21262d] text-white font-semibold border border-[#30363d] shadow-sm'
                  : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-[#58a6ff]" />
              <span>{file.filePath}</span>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-emerald-400">+{file.additions}</span>
                <span className="text-rose-400">-{file.deletions}</span>
              </div>
              {count > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Code Diff Table */}
      <div className="overflow-x-auto font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {currentFile.hunks?.map((hunk, hIdx) => (
              <React.Fragment key={hIdx}>
                {/* Hunk Header */}
                <tr className="bg-[#1c2128] text-[#8b949e] select-none border-y border-[#30363d]">
                  <td colSpan={3} className="px-4 py-1.5 text-[11px] font-mono text-[#58a6ff]">
                    {hunk.header}
                  </td>
                </tr>

                {/* Diff Lines */}
                {hunk.lines?.map((line, lIdx) => {
                  const lineFindings = line.newLineNumber ? findingsByLine[line.newLineNumber] : null;
                  
                  let bgClass = 'hover:bg-[#21262d]/50';
                  let symbol = ' ';

                  if (line.type === 'add') {
                    bgClass = 'bg-[#1f3a2c]/40 text-[#7ee787] hover:bg-[#1f3a2c]/60';
                    symbol = '+';
                  } else if (line.type === 'del') {
                    bgClass = 'bg-[#3b1d22]/40 text-[#f85149] hover:bg-[#3b1d22]/60';
                    symbol = '-';
                  }

                  return (
                    <React.Fragment key={lIdx}>
                      <tr className={`border-b border-[#21262d]/40 transition-colors ${bgClass}`}>
                        <td className="w-12 px-2 py-1 text-right text-[11px] text-[#484f58] select-none border-r border-[#30363d]/40">
                          {line.oldLineNumber || ''}
                        </td>
                        <td className="w-12 px-2 py-1 text-right text-[11px] text-[#484f58] select-none border-r border-[#30363d]/40">
                          {line.newLineNumber || ''}
                        </td>
                        <td className="px-3 py-1 font-mono whitespace-pre leading-5">
                          <span className="select-none mr-2 text-[#484f58] font-bold">{symbol}</span>
                          <span>{line.content}</span>
                        </td>
                      </tr>

                      {/* Inline Review Comment Cards */}
                      {lineFindings && lineFindings.map((finding) => (
                        <tr key={finding.id} className="bg-[#0d1117]">
                          <td colSpan={3} className="p-3 pl-16">
                            <InlineFindingCard
                              finding={finding}
                              isEditing={editingFindingId === finding.id}
                              editText={editMessageText}
                              onEditTextChange={setEditMessageText}
                              onStartEdit={() => handleStartEdit(finding)}
                              onSaveEdit={() => handleSaveEdit(finding)}
                              onCancelEdit={() => setEditingFindingId(null)}
                              onDismiss={() => onDismissComment(finding.id)}
                              onCopy={() => handleCopy(finding.id, finding.suggested_fix || finding.message)}
                              isCopied={copiedId === finding.id}
                              onReplyComment={onReplyComment}
                            />
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InlineFindingCard({
  finding,
  isEditing,
  editText,
  onEditTextChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDismiss,
  onCopy,
  isCopied,
  onReplyComment
}) {
  const [replyInput, setReplyInput] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [isThreadOpen, setIsThreadOpen] = useState(true);

  const badgeConfig = {
    security: {
      bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      icon: ShieldAlert,
      label: 'Security Vulnerability'
    },
    architecture: {
      bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      icon: Cpu,
      label: 'Architectural Drift'
    },
    testing: {
      bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      icon: TestTube2,
      label: 'Test Coverage Gap'
    }
  };

  const badge = badgeConfig[finding.category] || badgeConfig.security;
  const BadgeIcon = badge.icon;
  const replies = finding.replies || [];

  const handleSendReply = async (textToSend) => {
    const text = textToSend || replyInput;
    if (!text.trim() || isReplying) return;

    setIsReplying(true);
    try {
      await onReplyComment(finding.id, text.trim());
      setReplyInput('');
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <div className="border border-[#30363d] rounded-2xl bg-[#161b22] p-4 shadow-xl max-w-4xl text-left font-sans">
      {/* Top row */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg}`}>
            <BadgeIcon className="w-3.5 h-3.5" />
            <span>{badge.label}</span>
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#21262d] text-[#8b949e] border border-[#30363d] font-mono">
            {Math.round(finding.confidence_score * 100)}% confidence
          </span>
          {finding.rule_id && (
            <span className="text-[11px] text-[#58a6ff] font-mono">
              [{finding.rule_id}]
            </span>
          )}
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          {!isEditing && (
            <button
              onClick={onStartEdit}
              title="Edit comment before posting"
              className="p-1 rounded-md text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onDismiss}
            title="Dismiss / Drop finding"
            className="p-1 rounded-md text-[#8b949e] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h4 className="font-semibold text-sm text-white mb-1.5 tracking-tight">
        {finding.title}
      </h4>

      {/* Message or Edit Textarea */}
      {isEditing ? (
        <div className="space-y-2 my-2">
          <textarea
            value={editText}
            onChange={(e) => onEditTextChange(e.target.value)}
            className="w-full p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-[#c9d1d9] font-mono focus:outline-none focus:border-[#58a6ff] resize-y"
            rows={3}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={onSaveEdit}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              <Check className="w-3 h-3" /> Save Edit
            </button>
            <button
              onClick={onCancelEdit}
              className="px-2.5 py-1 rounded bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#c9d1d9] leading-relaxed mb-3">
          {finding.message}
        </p>
      )}

      {/* Suggested Fix */}
      {finding.suggested_fix && (
        <div className="mt-3 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] text-[11px] text-[#8b949e]">
            <span className="font-semibold text-[#7ee787]">Suggested Fix</span>
            <button
              onClick={onCopy}
              className="flex items-center gap-1 text-[#8b949e] hover:text-white transition-colors"
            >
              {isCopied ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="p-3 text-xs font-mono text-[#7ee787] overflow-x-auto whitespace-pre-wrap">
            {finding.suggested_fix}
          </pre>
        </div>
      )}

      {/* Two-Way Conversational Thread (v2 Feature) */}
      <div className="mt-4 pt-3 border-t border-[#30363d]/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#8b949e]">
            <MessageSquare className="w-3.5 h-3.5 text-[#58a6ff]" />
            <span>Developer ↔ PR-Guardian Thread ({replies.length} messages)</span>
          </div>
          <button
            onClick={() => setIsThreadOpen(!isThreadOpen)}
            className="text-[11px] text-[#58a6ff] hover:underline"
          >
            {isThreadOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {isThreadOpen && (
          <div className="space-y-2.5 bg-[#0d1117]/70 p-3 rounded-xl border border-[#30363d]/50">
            {/* Conversation bubbles */}
            {replies.length > 0 && (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {replies.map((r) => {
                  const isAi = r.author === 'PR-Guardian' || r.role === 'assistant';
                  return (
                    <div
                      key={r.id}
                      className={`flex items-start gap-2 text-xs p-2.5 rounded-lg border ${
                        isAi
                          ? 'bg-[#161b22] border-emerald-500/20 text-[#c9d1d9]'
                          : 'bg-[#21262d]/60 border-[#30363d] text-white'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white ${
                        isAi ? 'bg-emerald-600' : 'bg-[#58a6ff]'
                      }`}>
                        {isAi ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-[11px] text-white">{r.author}</span>
                          <span className="text-[10px] text-[#8b949e]">{r.timestamp}</span>
                        </div>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{r.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick prompt chips */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <button
                onClick={() => handleSendReply('@PR-Guardian explain why this is risky')}
                disabled={isReplying}
                className="text-[11px] px-2 py-0.5 rounded-full bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] transition-all flex items-center gap-1"
              >
                <Sparkles className="w-2.5 h-2.5 text-amber-400" /> Explain risk
              </button>
              <button
                onClick={() => handleSendReply('@PR-Guardian how do I fix this?')}
                disabled={isReplying}
                className="text-[11px] px-2 py-0.5 rounded-full bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] transition-all flex items-center gap-1"
              >
                🛠️ How to fix
              </button>
            </div>

            {/* Reply Input Bar */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                placeholder="Ask @PR-Guardian (e.g. '@PR-Guardian explain why this is risky')..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
              />
              <button
                onClick={() => handleSendReply()}
                disabled={!replyInput.trim() || isReplying}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#58a6ff] hover:bg-[#1f6feb] text-white text-xs font-semibold transition-all disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                <span>{isReplying ? '...' : 'Reply'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
