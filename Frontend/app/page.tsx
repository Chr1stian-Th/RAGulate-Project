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

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  files?: File[]
}

interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: "New GDPR Consultation",
      messages: [],
      createdAt: new Date(),
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
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append("message", input)
      formData.append("sessionId", currentSessionId || "")

      uploadedFiles.forEach((file, index) => {
        formData.append(`file_${index}`, file)
      })

      const response = await fetch("/api/chat", {
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
        content: data.response,
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

  useEffect(() => {
    if (chatSessions.length === 0) {
      createNewChat()
    }
  }, [])

  return (
    <ThemeProvider>
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
                  <div className="text-sm font-medium truncate">{session.title}</div>
                  <div className="text-xs text-gray-400">{session.createdAt.toLocaleDateString()}</div>
                </div>
                <button
                  className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                  onClick={e => {
                    e.stopPropagation()
                    deleteChatSession(session.id)
                  }}
                  aria-label="Delete chat"
                  tabIndex={0}
                >
                  <X className="w-4 h-4" />
                </button>
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
              <ProfileDropdown
                onProfileClick={() => setShowProfileModal(true)}
                onSettingsClick={() => setShowSettingsModal(true)}
              />
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <Shield className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">Welcome to GDPR Assistant</h2>
                  <p className="text-gray-600 mb-4">
                    I'm here to help you understand and comply with GDPR regulations.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                    <Card className="p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                      <h3 className="font-medium mb-2">Data Processing Questions</h3>
                      <p className="text-sm text-gray-600">
                        Ask about lawful basis, consent, and data processing requirements
                      </p>
                    </Card>
                    <Card className="p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                      <h3 className="font-medium mb-2">Rights & Compliance</h3>
                      <p className="text-sm text-gray-600">
                        Learn about data subject rights and compliance obligations
                      </p>
                    </Card>
                  </div>
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

        {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}

        {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
        {showFileUpload && <FileUpload onFileSelect={handleFileSelect} onClose={() => setShowFileUpload(false)} />}
      </div>
    </ThemeProvider>
  )
}
