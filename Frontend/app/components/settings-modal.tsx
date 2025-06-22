"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { X, Settings, Bell, Shield, Database, Download, Trash2 } from "lucide-react"
import { useTheme } from "./theme-provider"

interface SettingsModalProps {
  onClose: () => void
}

interface AppSettings {
  notifications: {
    email: boolean
    push: boolean
    gdprUpdates: boolean
    chatHistory: boolean
  }
  privacy: {
    saveChats: boolean
    shareAnalytics: boolean
    autoDelete: boolean
    autoDeleteDays: number
  }
  appearance: {
    language: string
    fontSize: string
    compactMode: boolean
  }
  advanced: {
    apiEndpoint: string
    timeout: number
    maxFileSize: number
  }
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { theme, setTheme } = useTheme()
  const [settings, setSettings] = useState<AppSettings>({
    notifications: {
      email: true,
      push: false,
      gdprUpdates: true,
      chatHistory: true,
    },
    privacy: {
      saveChats: true,
      shareAnalytics: false,
      autoDelete: false,
      autoDeleteDays: 30,
    },
    appearance: {
      language: "en",
      fontSize: "medium",
      compactMode: false,
    },
    advanced: {
      apiEndpoint: "http://localhost:8000",
      timeout: 30,
      maxFileSize: 16,
    },
  })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem("appSettings")
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings))
    }
  }, [])

  const handleSave = async () => {
    setIsSaving(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Save to localStorage
    localStorage.setItem("appSettings", JSON.stringify(settings))

    setIsSaving(false)
  }

  const handleExportData = () => {
    const data = {
      settings,
      profile: JSON.parse(localStorage.getItem("userProfile") || "{}"),
      chatSessions: JSON.parse(localStorage.getItem("chatSessions") || "[]"),
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `gdpr-assistant-data-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleClearData = () => {
    if (confirm("Are you sure you want to clear all data? This action cannot be undone.")) {
      localStorage.removeItem("chatSessions")
      localStorage.removeItem("userProfile")
      localStorage.removeItem("appSettings")
      alert("All data has been cleared.")
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
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
          {/* Notifications */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Notifications</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-notifications">Email Notifications</Label>
                <Switch
                  id="email-notifications"
                  checked={settings.notifications.email}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      notifications: { ...prev.notifications, email: checked },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="push-notifications">Push Notifications</Label>
                <Switch
                  id="push-notifications"
                  checked={settings.notifications.push}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      notifications: { ...prev.notifications, push: checked },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="gdpr-updates">GDPR Updates</Label>
                <Switch
                  id="gdpr-updates"
                  checked={settings.notifications.gdprUpdates}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      notifications: { ...prev.notifications, gdprUpdates: checked },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="chat-history">Chat History Reminders</Label>
                <Switch
                  id="chat-history"
                  checked={settings.notifications.chatHistory}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      notifications: { ...prev.notifications, chatHistory: checked },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Privacy */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Privacy & Data</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="save-chats">Save Chat History</Label>
                <Switch
                  id="save-chats"
                  checked={settings.privacy.saveChats}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      privacy: { ...prev.privacy, saveChats: checked },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="share-analytics">Share Analytics</Label>
                <Switch
                  id="share-analytics"
                  checked={settings.privacy.shareAnalytics}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      privacy: { ...prev.privacy, shareAnalytics: checked },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-delete">Auto-delete Old Chats</Label>
                <Switch
                  id="auto-delete"
                  checked={settings.privacy.autoDelete}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      privacy: { ...prev.privacy, autoDelete: checked },
                    }))
                  }
                />
              </div>
              {settings.privacy.autoDelete && (
                <div className="space-y-2">
                  <Label htmlFor="auto-delete-days">Delete after (days)</Label>
                  <Input
                    id="auto-delete-days"
                    type="number"
                    value={settings.privacy.autoDeleteDays}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        privacy: { ...prev.privacy, autoDeleteDays: Number.parseInt(e.target.value) || 30 },
                      }))
                    }
                    min="1"
                    max="365"
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Appearance */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Appearance</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  value={settings.appearance.language}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      appearance: { ...prev.appearance, language: value },
                    }))
                  }
                >
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label htmlFor="font-size">Font Size</Label>
                <Select
                  value={settings.appearance.fontSize}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      appearance: { ...prev.appearance, fontSize: value },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="compact-mode">Compact Mode</Label>
                <Switch
                  id="compact-mode"
                  checked={settings.appearance.compactMode}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      appearance: { ...prev.appearance, compactMode: checked },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Advanced */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Advanced</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="api-endpoint">API Endpoint</Label>
                <Input
                  id="api-endpoint"
                  value={settings.advanced.apiEndpoint}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      advanced: { ...prev.advanced, apiEndpoint: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout">Request Timeout (seconds)</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={settings.advanced.timeout}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      advanced: { ...prev.advanced, timeout: Number.parseInt(e.target.value) || 30 },
                    }))
                  }
                  min="5"
                  max="300"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="max-file-size">Max File Size (MB)</Label>
                <Input
                  id="max-file-size"
                  type="number"
                  value={settings.advanced.maxFileSize}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      advanced: { ...prev.advanced, maxFileSize: Number.parseInt(e.target.value) || 16 },
                    }))
                  }
                  min="1"
                  max="100"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Data Management */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Data Management</h3>
            <div className="flex flex-wrap gap-4">
              <Button variant="outline" onClick={handleExportData}>
                <Download className="w-4 h-4 mr-2" />
                Export Data
              </Button>
              <Button variant="destructive" onClick={handleClearData}>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All Data
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
