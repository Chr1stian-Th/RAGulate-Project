"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Paperclip, Send, MessageSquare, Shield, X } from "lucide-react"
import { ChatMessage } from "./components/chat-message"
import { FileUpload } from "./components/file-upload"
import { ProfileDropdown } from "./components/profile-dropdown"
import { ProfileModal } from "./components/profile-modal"
import { SettingsModal } from "./components/settings-modal"
import { ThemeProvider } from "./components/theme-provider"
import { AuthModal } from "./components/auth-modal"
import { GraphOverlay } from "../components/GraphOverlay"
import { DocumentsModal } from "./components/documents-modal"

// Backend URL for the chat API
const BACKEND_URL = "http://134.60.71.197:8000";

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  files?: File[]
  userName?: string
}

interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  sessionID: string
}

export default function GDPRChatbot() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [showFileUpload, setShowFileUpload] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editedTitle, setEditedTitle] = useState<string>("")
  const [showAuthModal, setShowAuthModal] = useState(true)

  // Persist username from AuthModal and pass via props to Profile components
  const [username, setUsername] = useState<string>("")

  // Store sessions after login
  const [userSessions, setUserSessions] = useState<any[]>([])

  // State for GraphOverlay
  const [showGraph, setShowGraph] = useState(false)
  const [showDocuments, setShowDocuments] = useState(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Helper to generate a unique sessionID
  const generateSessionID = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  const createNewChat = () => {
    const newSessionId = generateSessionID()
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: "New GDPR Consultation",
      messages: [],
      createdAt: new Date(),
      sessionID: newSessionId // Set sessionID to a unique value
    }
    setChatSessions((prev) => [newSession, ...prev])
    setCurrentSessionId(newSession.id)
    setMessages([])
    setUploadedFiles([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() && uploadedFiles.length === 0) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
      files: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined,
      userName: username
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append("message", input)
      const currentSession = chatSessions.find(s => s.id === currentSessionId)
      formData.append("sessionId", currentSession?.sessionID || "")
      
      // Ensure username is properly set from state
      if (!username) {
        console.warn("Username not found in current session");
      }
      formData.append("userName", username)

      uploadedFiles.forEach((file, index) => {
        formData.append(`file_${index}`, file)
      })

      const response = await fetch(BACKEND_URL + "/api/chat", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to send message")
      }

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
      setUploadedFiles([])
      setShowFileUpload(false)
    } catch (error) {
      console.error("Error sending message:", error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileSelect = (files: File[]) => {
    setUploadedFiles((prev) => [...prev, ...files])
  }

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const deleteChatSession = (sessionId: string) => {
    setChatSessions((prev) => prev.filter((session) => session.id !== sessionId))
    if (currentSessionId === sessionId) {
      // If the deleted session is current, switch to another or create new
      if (chatSessions.length > 1) {
        const nextSession = chatSessions.find((s) => s.id !== sessionId)
        if (nextSession) {
          setCurrentSessionId(nextSession.id)
          setMessages(nextSession.messages)
        }
      } else {
        createNewChat()
      }
    }
  }

  // Check if a chat session has been created on initial load if not create a new one
  const hasCreatedChat = useRef(false);
  useEffect(() => {
    if (!hasCreatedChat.current && chatSessions.length === 0) {
      createNewChat();
      hasCreatedChat.current = true;
    }
  }, [])

  useEffect(() => {
    if (currentSessionId) {
      const session = chatSessions.find(s => s.id === currentSessionId);
      if (session) {
        console.log("Current sessionID:", session.sessionID);
      }
    }
  }, [chatSessions, currentSessionId]);

  // Add useEffect to load sessions on page load if user is logged in
  useEffect(() => {
    const loadInitialSessions = async () => {
      if (username) {
        const userSessions = await fetchSessions(username);
        if (userSessions.sessions.length > 0) {
          const sessionsWithDetails = await Promise.all(
            userSessions.sessions.map(async (sessionId: string) => {
              const details = await fetchSessionDetails(sessionId);
              console.log("Session details for", sessionId, ":", details);
              return {
                id: sessionId,
                title: "GDPR Consultation", // Default title #TODO: not default name handling
                messages: details ? details.map(transformMessage) : [],
                createdAt: new Date(),
                sessionID: sessionId
              };
            })
          );
          
          setChatSessions(sessionsWithDetails);
          
          // Set the most recent session as current
          if (sessionsWithDetails.length > 0) {
            var lastIndex = sessionsWithDetails.length - 1;
            setCurrentSessionId(sessionsWithDetails[lastIndex].id);
            setMessages(sessionsWithDetails[lastIndex].messages || []);
          }
        }
      }
    };

    loadInitialSessions();
  }, [username]);

  const fetchSessions = async (username: string) => {
    try {
      const url = `${BACKEND_URL}/api/sessions?username=${encodeURIComponent(username)}`;
      console.log('Fetching sessions from:', url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const sessions = await response.json();
      return sessions;
    } catch (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }
  };

  const fetchSessionDetails = async (sessionId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session details');
      const sessionDetails = await response.json();
      return sessionDetails;
    } catch (error) {
      console.error('Error fetching session details:', error);
      return null;
    }
  };

  const handleLoginSuccess = async (sessions: any, usernameFromAuth: string) => {
    setUsername(usernameFromAuth);
    setShowAuthModal(false);
    
    const userSessions = await fetchSessions(usernameFromAuth);
    if (userSessions.sessions.length > 0) {
      const sessionsWithDetails = await Promise.all(
        userSessions.sessions.map(async (sessionId: string) => {
          const details = await fetchSessionDetails(sessionId);
          return {
            id: sessionId,
            title: "GDPR Consultation",
            messages: details ? details.map(transformMessage) : [],
            createdAt: new Date(),
            sessionID: sessionId
          };
        })
      );
      
      setChatSessions(sessionsWithDetails);
      
      if (sessionsWithDetails.length > 0) {
        setCurrentSessionId(sessionsWithDetails[0].id);
        setMessages(sessionsWithDetails[0].messages || []);
      }
    }
  }

  const transformMessage = (msg: any): Message => {
    return {
      id: msg._id || Date.now().toString(),
      role: msg.role as "user" | "assistant",
      content: msg.content,
      timestamp: new Date(msg.timestamp),
      files: msg.files || [],
      userName: msg.user_name
    };
  };

  return (
    <ThemeProvider>
      {showAuthModal && <AuthModal onLoginSuccess={handleLoginSuccess} />}
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar */}
        <div className="w-64 bg-gray-900 text-white flex flex-col">
          <div className="p-4">
            <Button
              onClick={createNewChat}
              className="w-full bg-gray-800 hover:bg-gray-700 text-white border border-gray-600"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              New Chat
            </Button>
          </div>

          <ScrollArea className="flex-1 px-2">
            {chatSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  setCurrentSessionId(session.id)
                  setMessages(session.messages)
                }}
                className={`group p-3 mb-2 rounded cursor-pointer transition-colors flex items-center justify-between ${
                  currentSessionId === session.id ? "bg-gray-700" : "hover:bg-gray-800"
                }`}
              >
                <div className="flex-1 min-w-0">
                  {editingSessionId === session.id ? (
                    <form
                      onSubmit={e => {
                        e.preventDefault()
                        setChatSessions(prev => prev.map(s =>
                          s.id === session.id ? { ...s, title: editedTitle } : s
                        ))
                        setEditingSessionId(null)
                      }}
                    >
                      <input
                        className="text-sm font-medium bg-gray-800 text-white rounded px-1 w-full"
                        value={editedTitle}
                        onChange={e => setEditedTitle(e.target.value)}
                        autoFocus
                        onBlur={() => setEditingSessionId(null)}
                      />
                    </form>
                  ) : (
                    <div className="flex items-center">
                      <div
                        className="text-sm font-medium truncate cursor-pointer"
                        onClick={e => {
                          e.stopPropagation()
                          setEditingSessionId(session.id)
                          setEditedTitle(session.title)
                        }}
                        title="Click to edit title"
                      >
                        {session.title}
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-gray-400">{session.createdAt.toLocaleDateString()}</div>
                </div>
                <div className="flex flex-row items-center justify-center">
                  <button
                    className="ml-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700"
                    onClick={e => {
                      e.stopPropagation()
                      setEditingSessionId(session.id)
                      setEditedTitle(session.title)
                    }}
                    tabIndex={0}
                    aria-label="Edit chat title"
                    type="button"
                    style={{marginRight: '0.25rem'}}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.828l-4 1a1 1 0 01-1.263-1.263l1-4a4 4 0 01.828-1.414z" /></svg>
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1 rounded"
                    onClick={e => {
                      e.stopPropagation()
                      deleteChatSession(session.id)
                    }}
                    aria-label="Delete chat"
                    tabIndex={0}
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </ScrollArea>

          <div className="p-4 border-t border-gray-700">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-blue-400" />
              <div>
                <div className="text-sm font-medium">GDPR Assistant</div>
                <div className="text-xs text-gray-400">Privacy Compliance Expert</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Avatar className="bg-blue-600">
                  <AvatarFallback className="text-white">
                    <Shield className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-lg font-semibold">GDPR Compliance Assistant</h1>
                  <p className="text-sm text-gray-600">Ask me anything about GDPR regulations and compliance</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="outline" onClick={() => setShowGraph(true)}>
                  Graph
                </Button>
                <Button variant="outline" onClick={() => setShowDocuments(true)}>
                  Documents
                </Button>
                <ProfileDropdown
                  username={username}
                  onProfileClick={() => setShowProfileModal(true)}
                  onSettingsClick={() => setShowSettingsModal(true)}
                />
              </div>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <Shield className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">Welcome to the RAGulate GDPR Assistant</h2>
                  <p className="text-gray-600 mb-4">
                    I'm here to help you understand and comply with GDPR regulations.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg p-4 max-w-xs">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* File Upload Area */}
          {uploadedFiles.length > 0 && (
            <div className="border-t border-gray-200 p-4">
              <div className="max-w-4xl mx-auto">
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
                    >
                      <Paperclip className="w-3 h-3" />
                      <span>{file.name}</span>
                      <button onClick={() => removeFile(index)} className="hover:bg-blue-200 rounded-full p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="border-t border-gray-200 p-4">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSubmit} className="flex items-end space-x-2">
                <div className="flex-1 relative">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about GDPR compliance, data protection, or upload documents for review..."
                    className="pr-12 min-h-[44px] resize-none"
                    disabled={isLoading}
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          handleFileSelect(Array.from(e.target.files))
                        }
                      }}
                      accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 w-8 p-0"
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Upload documents for GDPR compliance review or ask questions about data protection regulations
              </p>
            </div>
          </div>
        </div>

        {showProfileModal && (
          <ProfileModal
            username={username}
            onSaveUsername={(newName) => setUsername(newName)}
            onClose={() => setShowProfileModal(false)}
          />
        )}

        {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
        {showFileUpload && <FileUpload onFileSelect={handleFileSelect} onClose={() => setShowFileUpload(false)} />}
      </div>
      {/* Graph Overlay */}
      <GraphOverlay open={showGraph} onClose={() => setShowGraph(false)} />
      {/* Documents Modal */}
      <DocumentsModal open={showDocuments} onClose={() => setShowDocuments(false)} />
    </ThemeProvider>
  )
}