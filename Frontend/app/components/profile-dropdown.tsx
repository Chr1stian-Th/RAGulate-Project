"use client"

import { useState, useRef, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { User, Settings, Moon, Sun, Monitor, ChevronDown } from "lucide-react"
import { useTheme } from "./theme-provider"

interface ProfileDropdownProps {
  username: string
  onProfileClick: () => void
  onSettingsClick: () => void
}

export function ProfileDropdown({ username, onProfileClick, onSettingsClick }: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className="w-4 h-4" />
      case "dark":
        return <Moon className="w-4 h-4" />
      default:
        return <Monitor className="w-4 h-4" />
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        className="flex items-center space-x-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Avatar className="w-8 h-8">
          <AvatarImage src={"/placeholder.svg"} alt={username} />
          <AvatarFallback className="bg-blue-600 text-white text-sm">{getInitials(username || "U")}</AvatarFallback>
        </Avatar>
        <span className="text-sm">{username}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </Button>

      {isOpen && (
        <Card className="absolute right-0 top-full mt-2 w-64 shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <CardContent className="p-0">
            {/* User Info */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={"/placeholder.svg"} alt={username} />
                  <AvatarFallback className="bg-blue-600 text-white">{getInitials(username || "U")}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{username}</p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              <Button
                variant="ghost"
                className="w-full justify-start px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => {
                  onProfileClick()
                  setIsOpen(false)
                }}
              >
                <User className="w-4 h-4 mr-3" />
                Profile
              </Button>

              <Button
                variant="ghost"
                className="w-full justify-start px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => {
                  onSettingsClick()
                  setIsOpen(false)
                }}
              >
                <Settings className="w-4 h-4 mr-3" />
                Settings
              </Button>

              {/* Theme Selector */}
              <div className="px-4 py-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Theme</p>
                <div className="flex space-x-1">
                  <Button
                    variant={theme === "light" ? "default" : "ghost"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setTheme("light")}
                  >
                    <Sun className="w-3 h-3 mr-1" />
                    Light
                  </Button>
                  <Button
                    variant={theme === "dark" ? "default" : "ghost"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setTheme("dark")}
                  >
                    <Moon className="w-3 h-3 mr-1" />
                    Dark
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}