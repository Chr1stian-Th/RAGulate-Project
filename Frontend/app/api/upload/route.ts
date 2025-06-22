import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll("files") as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    // Process files and send to backend
    const uploadResults = []

    for (const file of files) {

      const fileData = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      }

      uploadResults.push({
        ...fileData,
        status: "uploaded",
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      })
    }

    return NextResponse.json({
      success: true,
      files: uploadResults,
    })
  } catch (error) {
    console.error("File upload error:", error)
    return NextResponse.json({ error: "Failed to upload files" }, { status: 500 })
  }
}
