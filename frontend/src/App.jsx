import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header.jsx';
import AgentExecutionDAG from './components/AgentExecutionDAG.jsx';
import SplitDiffViewer from './components/SplitDiffViewer.jsx';
import SynthesizedTestsModal from './components/SynthesizedTestsModal.jsx';
import GuidelinesModal from './components/GuidelinesModal.jsx';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function App() {
  const [prs, setPrs] = useState([]);
  const [activePr, setActivePr] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showTestsModal, setShowTestsModal] = useState(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [user, setUser] = useState(null);
  const [guidelines, setGuidelines] = useState([]);
  const [telemetry, setTelemetry] = useState({ total_tokens: 2720, total_duration_ms: 1550, nodes: {} });
  
  const eventSourceRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    fetchPRs();
    fetchUser();
    fetchGuidelines();
  }, []);

  // Connect to SSE stream when activePr changes
  useEffect(() => {
    if (!activePr?.auditId) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sseUrl = `${API_BASE}/api/events/${activePr.auditId}`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    setIsRunning(activePr.status === 'running');

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.telemetry) {
          setTelemetry(data.telemetry);
        }

        if (data.step === 'awaiting_approval' && data.data) {
          setIsRunning(false);
          setActivePr((prev) => ({
            ...prev,
            status: 'pending_approval',
            findings: data.data.findings || prev?.findings,
            generatedTests: data.data.generated_tests || prev?.generatedTests
          }));
        } else if (data.step === 'thread_reply' && data.data) {
          setActivePr((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              findings: prev.findings.map((f) => {
                if (f.id === data.data.finding_id) {
                  return {
                    ...f,
                    replies: [
                      ...(f.replies || []),
                      data.data.developer_reply,
                      data.data.ai_reply
                    ]
                  };
                }
                return f;
              })
            };
          });
        } else if (data.step === 'completed' || data.step === 'error') {
          setIsRunning(false);
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    es.onerror = () => {
      es.close();
      setIsRunning(false);
    };

    return () => {
      es.close();
    };
  }, [activePr?.auditId]);

  async function fetchUser() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/user`);
      if (res.ok) setUser(await res.json());
    } catch (e) {}
  }

  async function fetchGuidelines() {
    try {
      const res = await fetch(`${API_BASE}/api/guidelines`);
      if (res.ok) setGuidelines(await res.json());
    } catch (e) {}
  }

  async function fetchPRs() {
    try {
      const res = await fetch(`${API_BASE}/api/prs`);
      if (res.ok) {
        const data = await res.json();
        setPrs(data);
        if (data.length > 0) {
          setActivePr(data[0]);
          if (data[0].telemetry) setTelemetry(data[0].telemetry);
        } else {
          handleSeedDemo();
        }
      }
    } catch (err) {
      console.warn('Backend not responding yet. Seeding placeholder...');
    }
  }

  async function handleSeedDemo() {
    setIsSeeding(true);
    try {
      const res = await fetch(`${API_BASE}/api/seed-demo`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPrs((prev) => [data.pr, ...prev]);
        setActivePr(data.pr);
        setIsRunning(true);
      }
    } catch (err) {
      console.error('Error seeding demo PR:', err);
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleApprove() {
    if (!activePr) return;
    setIsApproving(true);
    try {
      const res = await fetch(`${API_BASE}/api/prs/${encodeURIComponent(activePr.id)}/approve`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setActivePr(data.pr);
        setPrs((prev) => prev.map((p) => (p.id === activePr.id ? data.pr : p)));
      }
    } catch (err) {
      console.error('Error approving PR:', err);
    } finally {
      setIsApproving(false);
    }
  }

  async function handleReject() {
    if (!activePr) return;
    try {
      const res = await fetch(`${API_BASE}/api/prs/${encodeURIComponent(activePr.id)}/reject`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setActivePr(data.pr);
        setPrs((prev) => prev.map((p) => (p.id === activePr.id ? data.pr : p)));
      }
    } catch (err) {
      console.error('Error rejecting PR:', err);
    }
  }

  async function handleEditComment(findingId, editedMessage) {
    if (!activePr) return;
    try {
      setActivePr((prev) => ({
        ...prev,
        findings: prev.findings.map((f) => (f.id === findingId ? { ...f, message: editedMessage } : f))
      }));

      await fetch(`${API_BASE}/api/prs/${encodeURIComponent(activePr.id)}/edit-comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId, editedMessage })
      });
    } catch (err) {
      console.error('Error updating comment:', err);
    }
  }

  async function handleDismissComment(findingId) {
    if (!activePr) return;
    try {
      setActivePr((prev) => ({
        ...prev,
        findings: prev.findings.map((f) => (f.id === findingId ? { ...f, dismissed: true } : f))
      }));

      await fetch(`${API_BASE}/api/prs/${encodeURIComponent(activePr.id)}/dismiss-comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId })
      });
    } catch (err) {
      console.error('Error dismissing comment:', err);
    }
  }

  async function handleReplyComment(findingId, message) {
    if (!activePr) return;
    try {
      const res = await fetch(`${API_BASE}/api/prs/${encodeURIComponent(activePr.id)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId, message, author: user?.login || 'developer' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.telemetry) setTelemetry(data.telemetry);
        setActivePr((prev) => ({
          ...prev,
          findings: prev.findings.map((f) => {
            if (f.id === findingId) {
              return {
                ...f,
                replies: [...(f.replies || []), data.developer_reply, data.ai_reply]
              };
            }
            return f;
          })
        }));
      }
    } catch (err) {
      console.error('Error sending reply:', err);
    }
  }

  async function handleAddGuideline(ruleData) {
    try {
      const res = await fetch(`${API_BASE}/api/guidelines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData)
      });
      if (res.ok) {
        const newRule = await res.json();
        setGuidelines((prev) => [...prev, newRule]);
      }
    } catch (e) {}
  }

  const criticDropped = activePr?.findings ? Math.max(1, Math.floor(activePr.findings.length * 0.4)) : 0;

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] flex flex-col">
      <Header
        pr={activePr}
        user={user}
        onSeedDemo={handleSeedDemo}
        onApprove={handleApprove}
        onReject={handleReject}
        onOpenTests={() => setShowTestsModal(true)}
        onOpenGuidelines={() => setShowGuidelinesModal(true)}
        isSeeding={isSeeding}
        isApproving={isApproving}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        {/* Visual Agent Execution DAG Graph */}
        <AgentExecutionDAG
          isRunning={isRunning}
          telemetry={telemetry}
          criticDroppedCount={criticDropped}
        />

        {/* PR Split Diff with Inline Findings & Two-Way Conversations */}
        <SplitDiffViewer
          files={activePr?.files || []}
          findings={activePr?.findings || []}
          onEditComment={handleEditComment}
          onDismissComment={handleDismissComment}
          onReplyComment={handleReplyComment}
        />
      </main>

      {/* Synthesized Tests Modal */}
      <SynthesizedTestsModal
        isOpen={showTestsModal}
        tests={activePr?.generatedTests || []}
        onClose={() => setShowTestsModal(false)}
      />

      {/* Codified Guidelines Modal */}
      <GuidelinesModal
        isOpen={showGuidelinesModal}
        guidelines={guidelines}
        onClose={() => setShowGuidelinesModal(false)}
        onAddRule={handleAddGuideline}
      />
    </div>
  );
}
