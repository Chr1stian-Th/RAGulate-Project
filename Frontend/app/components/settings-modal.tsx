"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { X, Settings } from "lucide-react"

const API_BACKEND = process.env.NEXT_PUBLIC_API_BACKEND || "http://134.60.71.197:8000"

const QUERY_MODES = ["local", "global", "hybrid", "naive", "mix"] as const
type QueryMode = typeof QUERY_MODES[number]

interface SettingsModalProps {
  onClose: () => void
  username: string
}

interface AppSettings {
  chatHistory: boolean
  language: "en" | "es" | "fr" | "de"
  timeout: number
  customPrompt: string
  queryMode: QueryMode
}

type ToastState = {
  open: boolean
  type: "success" | "error"
  message: string
}

export function SettingsModal({ onClose, username }: SettingsModalProps) {
  const placeholder: AppSettings = {
    chatHistory: false,
    language: "en",
    timeout: 180,
    customPrompt: "",
    queryMode: "naive",
  }

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("appSettings")
    return saved ? { ...placeholder, ...JSON.parse(saved) } : placeholder
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [toast, setToast] = useState<ToastState>({
    open: false,
    type: "success",
    message: "",
  })

  useEffect(() => {
    if (!toast.open) return
    const t = setTimeout(() => setToast((prev) => ({ ...prev, open: false })), 4000)
    return () => clearTimeout(t)
  }, [toast.open])

  useEffect(() => {
    let ignore = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(
          `${API_BACKEND}/getOptions?username=${encodeURIComponent(username)}`,
          { method: "GET" }
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()

        const merged: AppSettings = {
          chatHistory: typeof data.chatHistory === "boolean" ? data.chatHistory : placeholder.chatHistory,
          language: (["en", "es", "fr", "de"] as const).includes(data.language) ? data.language : placeholder.language,
          timeout: typeof data.timeout === "number" && Number.isFinite(data.timeout) ? data.timeout : placeholder.timeout,
          customPrompt: typeof data.customPrompt === "string" ? data.customPrompt : placeholder.customPrompt,
          queryMode: (QUERY_MODES as readonly string[]).includes(data.queryMode) ? data.queryMode as QueryMode : placeholder.queryMode,
        }

        if (!ignore) {
          setSettings(merged)
          localStorage.setItem("appSettings", JSON.stringify(merged))
        }
      } catch (e: any) {
        if (!ignore) setLoadError(e?.message || "Failed to load options.")
      } finally {
        if (!ignore) setIsLoading(false)
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [username])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch(`${API_BACKEND}/setOptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, options: settings }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || `HTTP ${res.status}`)
      }

      localStorage.setItem("appSettings", JSON.stringify(settings))
      setToast({ open: true, type: "success", message: "Settings saved successfully." })
    } catch (e: any) {
      setToast({
        open: true,
        type: "error",
        message: `Failed to save settings: ${e?.message || "Unknown error"}`,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>

          <CardContent className="space-y-8">
            {isLoading && <div className="text-sm text-muted-foreground">Loading options from server…</div>}
            {loadError && (
              <div className="text-sm text-red-600">
                Couldn’t load from backend: {loadError}. Using placeholder settings.
              </div>
            )}

            {/* Chat History */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Chat History</h3>
              <div className="flex items-center justify-between">
                <Label htmlFor="chat-history">Use chat history for answers (may be slower)</Label>
                <Switch
                  id="chat-history"
                  checked={settings.chatHistory}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, chatHistory: checked }))}
                />
              </div>
            </div>

            <Separator />

            {/* Language */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Language</h3>
              <div className="space-y-2">
                <Label htmlFor="language">Interface Language</Label>
                <Select
                  value={settings.language}
                  onValueChange={(value) =>
                    setSettings((prev) => ({ ...prev, language: value as AppSettings["language"] }))
                  }
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Query Mode */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Query Mode</h3>
              <div className="space-y-2">
                <Label htmlFor="query-mode">How retrieval should behave</Label>
                <Select
                  value={settings.queryMode}
                  onValueChange={(value) =>
                    setSettings((prev) => ({ ...prev, queryMode: value as QueryMode }))
                  }
                >
                  <SelectTrigger id="query-mode">
                    <SelectValue placeholder="Choose mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">local: Focuses on context-dependent information.</SelectItem>
                    <SelectItem value="global">global: Utilizes global knowledge.</SelectItem>
                    <SelectItem value="hybrid">hybrid: Combines local and global retrieval.</SelectItem>
                    <SelectItem value="naive">naive: Basic search without advanced techniques.</SelectItem>
                    <SelectItem value="mix">mix: KG + vector retrieval integration.</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Timeout */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Request Timeout</h3>
              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout (seconds)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min={5}
                  max={300}
                  value={settings.timeout}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      timeout: Number.parseInt(e.target.value || "0", 10) || 30,
                    }))
                  }
                />
              </div>
            </div>

            <Separator />

            {/* Custom Prompt */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Custom Prompt</h3>
              <div className="space-y-2">
                <Label htmlFor="custom-prompt">Default Prompt for Backend</Label>
                <textarea
                  id="custom-prompt"
                  className="w-full min-h-[120px] rounded-md border border-input bg-background p-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="e.g., 'Answer concisely and cite GDPR articles when relevant.'"
                  value={settings.customPrompt}
                  onChange={(e) => setSettings((prev) => ({ ...prev, customPrompt: e.target.value }))}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !username}>
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Saving…
                  </>
                ) : (
                  "Save Settings"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom toast */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
      >
        {toast.open && (
          <div
            role="status"
            className={[
              "pointer-events-auto max-w-xl w-full sm:w-auto rounded-xl shadow-lg border text-white",
              "flex items-start gap-3 px-4 py-3",
              toast.type === "success" ? "bg-green-600 border-green-700" : "bg-red-600 border-red-700",
            ].join(" ")}
            onClick={() => setToast((prev) => ({ ...prev, open: false }))}
          >
            <div className="sr-only">{toast.type === "success" ? "Success" : "Error"}</div>
            <div className="flex-1 text-sm">{toast.message}</div>
            <button
              type="button"
              className="opacity-90 hover:opacity-100 transition"
              aria-label="Dismiss notification"
              onClick={(e) => {
                e.stopPropagation()
                setToast((prev) => ({ ...prev, open: false }))
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
