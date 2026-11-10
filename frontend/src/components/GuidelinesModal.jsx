import React, { useState } from 'react';
import { X, BookOpen, Plus, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function GuidelinesModal({ isOpen, onClose, guidelines = [], onAddRule }) {
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [category, setCategory] = useState('architecture');
  const [severity, setSeverity] = useState('critical');
  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDesc.trim()) return;
    onAddRule({
      rule_title: newTitle.trim(),
      rule_description: newDesc.trim(),
      category,
      severity
    });
    setNewTitle('');
    setNewDesc('');
    setIsAdding(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="border border-[#30363d] rounded-2xl bg-[#161b22] w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#21262d]/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Codified Engineering Guidelines</h3>
              <p className="text-xs text-[#8b949e]">PostgreSQL Relational Policies evaluated by Architecture & Security Agents</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Guidelines List */}
        <div className="flex-1 p-6 overflow-y-auto space-y-3 bg-[#0d1117]">
          {guidelines.map((rule) => (
            <div
              key={rule.id}
              className="p-4 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/40 transition-all text-left"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{rule.rule_title}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262d] text-[#58a6ff] border border-[#30363d] font-mono uppercase">
                    {rule.category}
                  </span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  rule.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {rule.severity}
                </span>
              </div>
              <p className="text-xs text-[#8b949e] leading-relaxed">{rule.rule_description}</p>
            </div>
          ))}

          {/* Add Rule Form */}
          {isAdding ? (
            <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-[#58a6ff]/40 bg-[#161b22] space-y-3 text-left">
              <h4 className="text-xs font-bold text-white">Add New Team Guideline</h4>
              <input
                type="text"
                placeholder="Rule Title (e.g. 'All public routes must use rate limiting')"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
              />
              <textarea
                placeholder="Detailed policy description for LLM evaluation..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff] resize-none h-16"
              />
              <div className="flex items-center gap-3">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="px-2.5 py-1 rounded bg-[#0d1117] border border-[#30363d] text-xs text-[#c9d1d9]"
                >
                  <option value="architecture">Architecture</option>
                  <option value="security">Security</option>
                  <option value="testing">Testing</option>
                </select>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="px-2.5 py-1 rounded bg-[#0d1117] border border-[#30363d] text-xs text-[#c9d1d9]"
                >
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                </select>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-3 py-1 rounded text-xs text-[#8b949e] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                  >
                    Save Rule
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-2.5 rounded-xl border border-dashed border-[#30363d] hover:border-[#58a6ff] text-xs text-[#8b949e] hover:text-[#58a6ff] flex items-center justify-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Engineering Guideline</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#30363d] bg-[#21262d]/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#30363d] hover:bg-[#484f58] text-white text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
