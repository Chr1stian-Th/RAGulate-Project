import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { User, Shield, Paperclip, Copy, ThumbsUp, ThumbsDown } from "lucide-react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  files?: File[]
}

interface ChatMessageProps {
  message: Message
}

const BACKEND_URL = "http://134.60.71.197:8000"

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user"
  const [feedback, setFeedback] = useState<null | "good" | "bad">(null)
  const [copied, setCopied] = useState(false)

  // Use message content as object_id for feedback
  const object_id = message.content

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleFeedback = async (type: "good" | "bad") => {
    setFeedback(type)
    // Send feedback to backend with timestamp as object_id
    try {
      await fetch(BACKEND_URL + "/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object_id, feedback: type }),
      })
    } catch (err) {
      console.error("Error sending feedback:", err)
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`flex ${isUser ? "flex-row-reverse" : "flex-row"} items-start space-x-3 max-w-3xl`}>
        <Avatar className={`${isUser ? "ml-3" : "mr-3"} ${isUser ? "bg-blue-600" : "bg-green-600"}`}>
          <AvatarFallback className="text-white">
            {isUser ? <User className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>

        <div className={`${isUser ? "text-right" : "text-left"} flex-1`}>
          <div
            className={`inline-block p-4 rounded-lg ${
              isUser ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-900"
            }`}
          >
            {message.files && message.files.length > 0 && (
              <div className="mb-3">
                <div className="text-sm opacity-75 mb-2">Attached files:</div>
                <div className="space-y-1">
                  {message.files.map((file, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      <Paperclip className="w-3 h-3" />
                      <span>{file.name}</span>
                      <span className="opacity-60">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="whitespace-pre-wrap relative">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
              {/* Copy and feedback buttons for assistant messages only */}
              {!isUser && (
                <div className="flex gap-2 mt-2 items-center">
                  <button
                    onClick={handleCopy}
                    className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                    title="Copy answer"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleFeedback("good")}
                    className={`p-1 rounded hover:bg-green-100 text-gray-500 hover:text-green-600 transition-colors ${feedback === "good" ? "bg-green-200 text-green-700" : ""}`}
                    title="Mark as good reaction"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleFeedback("bad")}
                    className={`p-1 rounded hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors ${feedback === "bad" ? "bg-red-200 text-red-700" : ""}`}
                    title="Mark as bad reaction"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </button>
                  {copied && <span className="text-xs text-green-600 ml-2">Copied!</span>}
                </div>
              )}
            </div>
          </div>

          <div className={`text-xs text-gray-500 mt-1 ${isUser ? "text-right" : "text-left"}`}>
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    </div>
  )
}
