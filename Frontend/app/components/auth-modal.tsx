import React, { useState } from "react"

const BACKEND_URL = "http://134.60.71.197:8000"

interface AuthModalProps {
  onLoginSuccess: (sessions: any, username: string) => void
}

export function AuthModal({ onLoginSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === "login") {
        const res = await fetch(BACKEND_URL + "/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        })
        const data = await res.json()
        if (res.ok) {
          onLoginSuccess(data.sessions, username)
        } else {
          setError(data.error || "Login failed")
        }
      } else {
        const res = await fetch(BACKEND_URL + "/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        })
        const data = await res.json()
        if (res.ok) {
          // Automatically log in after registration
          const loginRes = await fetch(BACKEND_URL + "/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          })
          const loginData = await loginRes.json()
          if (loginRes.ok) {
            onLoginSuccess(loginData.sessions, username)
          } else {
            setMode("login")
            setError("Registration successful, but login failed. Please try logging in.")
          }
        } else {
          setError(data.error || "Registration failed")
        }
      }
    } catch (err) {
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm relative">
        <h2 className="text-xl font-bold mb-4 text-center">{mode === "login" ? "Login" : "Register"}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full px-3 py-2 border rounded text-black"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded text-black"
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Processing..." : mode === "login" ? "Login" : "Register"}
          </button>
        </form>
        {error && <div className="text-red-600 text-sm mt-2 text-center">{error}</div>}
        <div className="mt-4 text-center">
          {mode === "login" ? (
            <span>
              Don't have an account?{' '}
              <button
                className="text-blue-600 underline"
                onClick={() => { setMode("register"); setError(null); }}
                type="button"
              >
                Register
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                className="text-blue-600 underline"
                onClick={() => { setMode("login"); setError(null); }}
                type="button"
              >
                Login
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
