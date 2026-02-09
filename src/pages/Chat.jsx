import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { messagesAPI, employeesAPI } from '../utils/api';
import Card from '../components/ui/Card';
import './Chat.css';

function Chat() {
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState([]);
    const [showNewChat, setShowNewChat] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [teamName, setTeamName] = useState('');
    const [isTeam, setIsTeam] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        loadConversations();
        loadEmployees();
    }, []);

    useEffect(() => {
        if (activeConversation) {
            loadMessages(activeConversation.id);
        }
    }, [activeConversation]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Poll for new messages every 5 seconds
    useEffect(() => {
        let interval;
        if (activeConversation) {
            interval = setInterval(() => {
                loadMessages(activeConversation.id);
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [activeConversation]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadConversations = async () => {
        try {
            const response = await messagesAPI.getConversations();
            if (response.success) {
                setConversations(response.conversations);
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMessages = async (conversationId) => {
        try {
            const response = await messagesAPI.getMessages(conversationId);
            if (response.success) {
                setMessages(response.messages);
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    };

    const loadEmployees = async () => {
        try {
            const response = await employeesAPI.getChatContacts();
            if (response.success) {
                setEmployees(response.employees.filter(e => e.id !== user.id));
            }
        } catch (error) {
            console.error('Failed to load employees:', error);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeConversation) return;

        try {
            const response = await messagesAPI.sendMessage(activeConversation.id, newMessage);
            if (response.success) {
                setMessages(prev => [...prev, response.message]);
                setNewMessage('');
            }
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    const handleCreateConversation = async () => {
        if (selectedMembers.length === 0) return;

        try {
            const response = await messagesAPI.createConversation({
                name: isTeam ? teamName : null,
                isTeam,
                memberIds: selectedMembers
            });

            if (response.success) {
                setConversations(prev => [response.conversation, ...prev]);
                setActiveConversation(response.conversation);
                setShowNewChat(false);
                setSelectedMembers([]);
                setTeamName('');
                setIsTeam(false);
            }
        } catch (error) {
            console.error('Failed to create conversation:', error);
        }
    };

    const toggleMember = (empId) => {
        setSelectedMembers(prev =>
            prev.includes(empId)
                ? prev.filter(id => id !== empId)
                : [...prev, empId]
        );
    };

    const getConversationName = (conv) => {
        if (conv.name) return conv.name;
        const otherMembers = conv.members?.filter(m => m.id !== user.id) || [];
        return otherMembers.map(m => m.name).join(', ') || 'Chat';
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading chat...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">💬 Chat</h1>
                <button className="btn btn-primary" onClick={() => setShowNewChat(true)}>
                    ➕ New Chat
                </button>
            </div>

            <div className="chat-container">
                {/* Conversations List */}
                <Card className="conversations-panel">
                    <h3>Conversations</h3>
                    {conversations.length === 0 ? (
                        <p className="empty-text">No conversations yet</p>
                    ) : (
                        <ul className="conversations-list">
                            {conversations.map(conv => (
                                <li
                                    key={conv.id}
                                    className={`conversation-item ${activeConversation?.id === conv.id ? 'active' : ''}`}
                                    onClick={() => setActiveConversation(conv)}
                                >
                                    <div className="conversation-avatar">
                                        {conv.isTeam ? '👥' : '💬'}
                                    </div>
                                    <div className="conversation-info">
                                        <span className="conversation-name">{getConversationName(conv)}</span>
                                        <span className="conversation-count">{conv.messageCount} messages</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                {/* Messages Panel */}
                <Card className="messages-panel">
                    {activeConversation ? (
                        <>
                            <div className="messages-header">
                                <h3>{getConversationName(activeConversation)}</h3>
                                {activeConversation.isTeam && (
                                    <span className="team-badge">Team</span>
                                )}
                            </div>
                            <div className="messages-list">
                                {messages.map(msg => (
                                    <div
                                        key={msg.id}
                                        className={`message ${msg.senderId === user.id ? 'own' : 'other'}`}
                                    >
                                        <div className="message-sender">
                                            <span className="avatar avatar-sm">{msg.senderAvatar || '??'}</span>
                                            <span className="sender-name">{msg.senderName}</span>
                                        </div>
                                        <div className="message-content">{msg.content}</div>
                                        <div className="message-time">
                                            {(() => {
                                                const msgDate = new Date(msg.createdAt);
                                                const today = new Date();
                                                const isToday = msgDate.toDateString() === today.toDateString();

                                                if (isToday) {
                                                    return msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                                                } else {
                                                    return msgDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
                                                        msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                                                }
                                            })()}
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                            <form className="message-input" onSubmit={handleSendMessage}>
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Type a message..."
                                    className="input"
                                />
                                <button type="submit" className="btn btn-primary" disabled={!newMessage.trim()}>
                                    Send
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="no-conversation">
                            <p>Select a conversation or start a new chat</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* New Chat Modal */}
            {showNewChat && (
                <div className="modal-overlay" onClick={() => setShowNewChat(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>New Chat</h2>
                            <button className="modal-close" onClick={() => setShowNewChat(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={isTeam}
                                        onChange={(e) => setIsTeam(e.target.checked)}
                                    />
                                    Create Team Chat
                                </label>
                            </div>
                            {isTeam && (
                                <div className="form-group">
                                    <label>Team Name</label>
                                    <input
                                        type="text"
                                        value={teamName}
                                        onChange={(e) => setTeamName(e.target.value)}
                                        placeholder="Enter team name"
                                        className="input"
                                    />
                                </div>
                            )}
                            <div className="form-group">
                                <label>Select Members</label>
                                <div className="members-list">
                                    {employees.map(emp => (
                                        <label key={emp.id} className="member-option">
                                            <input
                                                type="checkbox"
                                                checked={selectedMembers.includes(emp.id)}
                                                onChange={() => toggleMember(emp.id)}
                                            />
                                            <span className="avatar avatar-sm">{emp.avatar}</span>
                                            <span>{emp.name}</span>
                                            <span className="role-tag">{emp.role}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowNewChat(false)}>
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCreateConversation}
                                disabled={selectedMembers.length === 0 || (isTeam && !teamName)}
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Chat;
