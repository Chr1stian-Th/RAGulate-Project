import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { User, Shield, Paperclip } from "lucide-react"

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

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user"

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

            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>

          <div className={`text-xs text-gray-500 mt-1 ${isUser ? "text-right" : "text-left"}`}>
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    </div>
  )
}
