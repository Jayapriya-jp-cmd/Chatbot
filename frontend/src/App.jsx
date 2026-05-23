import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  MessageSquare, 
  BarChart3, 
  Send, 
  Plus, 
  Trash2, 
  History,
  Activity,
  Cpu,
  Zap,
  AlertCircle
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const [view, setView] = useState('chat'); // 'chat' | 'dashboard'
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analytics, setAnalytics] = useState({ logs: [], stats: {} });
  const [provider, setProvider] = useState('Gemini');
  const [model, setModel] = useState('gemini-pro');
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
    fetchAnalytics();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/conversations`);
      setConversations(res.data);
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/analytics`);
      setAnalytics(res.data);
    } catch (err) {
      console.error('Failed to fetch analytics', err);
    }
  };

  const loadConversation = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/api/conversations/${id}`);
      setActiveConversation(res.data);
      setMessages(res.data.messages || []);
      setView('chat');
    } catch (err) {
      console.error('Failed to load conversation', id);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMsg = { role: 'user', content: inputText };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await axios.post(`${API_URL}/api/chat`, {
        conversationId: activeConversation?.id,
        provider,
        model,
        message: userMsg.content
      });

      if (!activeConversation) {
        // Find the new conversation in the list or refetch
        await fetchConversations();
        setActiveConversation({ id: res.data.conversationId });
      }

      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
      fetchAnalytics(); // Update stats
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: " + err.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewChat = () => {
    setActiveConversation(null);
    setMessages([]);
    setView('chat');
  };

  const cancelConversation = async (id) => {
    try {
      await axios.post(`${API_URL}/api/conversations/${id}/cancel`);
      fetchConversations();
    } catch (err) {
      console.error('Cancel failed', err);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="logo">InferenceLog</div>
        
        <div 
          className={`nav-item ${view === 'chat' ? 'active' : ''}`}
          onClick={() => setView('chat')}
        >
          <MessageSquare size={20} />
          <span>Chat</span>
        </div>
        
        <div 
          className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView('dashboard')}
        >
          <BarChart3 size={20} />
          <span>Dashboard</span>
        </div>

        <div style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
          Recent Conversations
        </div>

        <div className="conversations-list" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="nav-item" onClick={startNewChat} style={{ border: '1px dashed var(--glass-border)', justifyContent: 'center' }}>
            <Plus size={18} />
            <span>New Chat</span>
          </div>
          {conversations.map(c => (
            <div 
              key={c.id} 
              className={`nav-item ${activeConversation?.id === c.id ? 'active' : ''}`}
              style={{ display: 'flex', justifyContent: 'space-between' }}
              onClick={() => loadConversation(c.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                <History size={16} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title || 'Chat'}</span>
              </div>
              {!c.cancelledAt && (
                <Trash2 
                  size={14} 
                  className="cancel-icon" 
                  onClick={(e) => { e.stopPropagation(); cancelConversation(c.id); }} 
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {view === 'chat' ? (
          <div className="chat-window">
            <div className="messages-container">
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: '5rem' }}>
                  <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>How can I help you?</h1>
                  <p style={{ color: 'var(--text-muted)' }}>Start a conversation to see inference logging in action.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`message ${m.role}`}>
                  {m.content}
                </div>
              ))}
              {isLoading && <div className="message assistant">...</div>}
              <div ref={messagesEndRef} />
            </div>

            <div className="provider-selector" style={{ padding: '0.5rem 1.5rem', display: 'flex', gap: '1rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
              <select 
                value={provider} 
                onChange={(e) => {
                  setProvider(e.target.value);
                  if (e.target.value === 'Gemini') setModel('gemini-pro');
                  else setModel('gpt-4');
                }}
                style={{ background: 'transparent', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', padding: '0.25rem 0.5rem' }}
              >
                <option value="Gemini">Gemini</option>
                <option value="OpenAI">OpenAI</option>
              </select>
              <select 
                value={model} 
                onChange={(e) => setModel(e.target.value)}
                style={{ background: 'transparent', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', padding: '0.25rem 0.5rem' }}
              >
                {provider === 'Gemini' ? (
                  <>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    <option value="gemini-pro">Gemini Pro (Legacy)</option>
                    <option value="gemini-1.0-pro">Gemini 1.0 Pro</option>
                  </>
                ) : (
                  <>
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </>
                )}
              </select>
            </div>

            <div className="input-area">
              <form className="input-wrapper" onSubmit={handleSendMessage}>
                <input 
                  placeholder="Type a message..." 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
                <button type="submit" className="send-btn" disabled={isLoading}>
                  <Send size={20} color="white" />
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="dashboard-container" style={{ padding: '2rem', overflowY: 'auto' }}>
            <h1 style={{ marginBottom: '2rem' }}>Inference Dashboard</h1>
            
            <div className="dashboard">
              <div className="stat-card">
                <div className="stat-label">Average Latency</div>
                <div className="stat-value">{Math.round(analytics.stats?._avg?.latencyMs || 0)} ms</div>
                <Zap size={24} color="var(--accent-primary)" style={{ opacity: 0.5 }} />
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Tokens</div>
                <div className="stat-value">{(analytics.stats?._sum?.totalTokens || 0).toLocaleString()}</div>
                <Cpu size={24} color="#a855f7" style={{ opacity: 0.5 }} />
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Requests</div>
                <div className="stat-value">{analytics.stats?._count?.id || 0}</div>
                <Activity size={24} color="#10b981" style={{ opacity: 0.5 }} />
              </div>
            </div>

            <div style={{ marginTop: '3rem', background: 'var(--bg-card)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--glass-border)' }}>
              <h3 style={{ marginBottom: '1.5rem' }}>Latency Trend (Last 100 requests)</h3>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.logs ? [...analytics.logs].reverse() : []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="createdAt" hide />
                    <YAxis stroke="var(--text-muted)" />
                    <Tooltip 
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}
                      labelStyle={{ display: 'none' }}
                    />
                    <Line type="monotone" dataKey="latencyMs" stroke="var(--accent-primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ marginTop: '3rem' }}>
              <h3 style={{ marginBottom: '1.5rem' }}>Recent Inference Logs</h3>
              <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--glass-border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)' }}>
                      <th style={{ padding: '1rem', textAlign: 'left' }}>Time</th>
                      <th style={{ padding: '1rem', textAlign: 'left' }}>Model</th>
                      <th style={{ padding: '1rem', textAlign: 'left' }}>Latency</th>
                      <th style={{ padding: '1rem', textAlign: 'left' }}>Tokens</th>
                      <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.logs?.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '1rem' }}>{new Date(log.createdAt).toLocaleTimeString()}</td>
                        <td style={{ padding: '1rem' }}>{log.model}</td>
                        <td style={{ padding: '1rem' }}>{log.latencyMs} ms</td>
                        <td style={{ padding: '1rem' }}>{log.totalTokens}</td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{ color: log.status === 'success' ? '#10b981' : '#ef4444' }}>
                            {log.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
