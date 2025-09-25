"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { X, Camera, Save, User } from "lucide-react"

interface ProfileModalProps {
  username: string
  onClose: () => void
  onSaveUsername?: (newUsername: string) => void
}

type ToastState = {
  open: boolean
  type: "success" | "error"
  message: string
}

export function ProfileModal({ username, onClose, onSaveUsername }: ProfileModalProps) {
  const [name, setName] = useState<string>(username)
  const [avatar, setAvatar] = useState<string>("")
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<ToastState>({ open: false, type: "success", message: "" })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(username)
  }, [username])

  useEffect(() => {
    if (!toast.open) return
    const t = setTimeout(() => setToast((p) => ({ ...p, open: false })), 4000)
    return () => clearTimeout(t)
  }, [toast.open])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      onSaveUsername?.(name)
      setIsEditing(false)
      setToast({ open: true, type: "success", message: "Profile changes saved." })
    } catch (e: any) {
      setToast({
        open: true,
        type: "error",
        message: `Failed to save changes: ${e?.message || "Unknown error"}`,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => setAvatar(e.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  /*const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }*/

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>Profile Settings</span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={avatar || "/placeholder.svg"} alt={name} />
                  <AvatarFallback>{(name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                {isEditing && (
                  <Button
                    size="sm"
                    className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>

            {/* Profile Form: Only Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Username</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isEditing} />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2 pt-4 border-t">
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom toast */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
        {toast.open && (
          <div
            role="status"
            className={[
              "pointer-events-auto max-w-xl w-full sm:w-auto rounded-xl shadow-lg border text-white",
              "flex items-start gap-3 px-4 py-3",
              toast.type === "success" ? "bg-green-600 border-green-700" : "bg-red-600 border-red-700",
            ].join(" ")}
            onClick={() => setToast((p) => ({ ...p, open: false }))}
          >
            <div className="sr-only">{toast.type === "success" ? "Success" : "Error"}</div>
            <div className="flex-1 text-sm">{toast.message}</div>
            <button
              type="button"
              className="opacity-90 hover:opacity-100 transition"
              aria-label="Dismiss notification"
              onClick={(e) => {
                e.stopPropagation()
                setToast((p) => ({ ...p, open: false }))
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
