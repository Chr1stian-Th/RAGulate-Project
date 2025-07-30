import React, { createContext, useContext, useState, ReactNode } from "react"

interface UsernameContextType {
  username: string
  setUsername: (name: string) => void
}

const UsernameContext = createContext<UsernameContextType | undefined>(undefined)

export function UsernameProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string>("John Doe")
  return (
    <UsernameContext.Provider value={{ username, setUsername }}>
      {children}
    </UsernameContext.Provider>
  )
}

export function useUsername() {
  const context = useContext(UsernameContext)
  if (!context) throw new Error("useUsername must be used within UsernameProvider")
  return context
}
