import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const message = formData.get("message") as string
    const sessionId = formData.get("sessionId") as string

    // Extract uploaded files
    const files: File[] = []
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("file_") && value instanceof File) {
        files.push(value)
      }
    }

    // Prepare the payload for your backend
    const backendPayload = {
      message,
      sessionId,
      files: files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      })),
      timestamp: new Date().toISOString(),
    }

    // Send request to backend
    const backendResponse = await sendToBackend(backendPayload, files)

    return NextResponse.json({
      response: backendResponse.answer,
      sessionId: backendResponse.sessionId,
    })
  } catch (error) {
    console.error("Error processing chat request:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}

// Backend communication function
async function sendToBackend(payload: any, files: File[]) {
  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000" // Default to local backend for development

  try {
    const formData = new FormData()
    formData.append("message", payload.message)
    formData.append("sessionId", payload.sessionId)
    formData.append("timestamp", payload.timestamp)

    // Append files to form data
    files.forEach((file, index) => {
      formData.append(`file_${index}`, file)
    })

    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      body: formData,
      headers: {
        // Don't set Content-Type header when using FormData
        // The browser will set it automatically with the boundary
      },
    })

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("Backend communication error:", error)
    // Fallback response for demo purposes
    return {
      answer:
        "I'm a GDPR compliance assistant. I can help you understand data protection regulations, privacy policies, consent management, data subject rights, and compliance requirements. How can I assist you today?",
      sessionId: payload.sessionId,
    }
  }
}
