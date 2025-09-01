"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useEffect, useRef, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, Check, Loader2, X as XIcon } from "lucide-react"

interface DocumentsModalProps {
  open: boolean
  onClose: () => void
}

interface Document {
  _id: string
  content_summary: string
  status: string
  content_length: number
  chunks_count: number
  created_at: string
}

type PendingStatus = "ready" | "sending" | "sent" | "error"

interface PendingFile {
  id: string
  file: File
  status: PendingStatus
  error?: string
}

const API_BASE = "http://134.60.71.197:8000"

export function DocumentsModal({ open, onClose }: DocumentsModalProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pending, setPending] = useState<PendingFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = async () => {
    if (!open) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/documents/list`)
      if (!res.ok) throw new Error("Failed to fetch documents")
      const data = (await res.json()) as { documents?: any[] }
      const docs = Array.isArray(data.documents) ? data.documents : []
      const arr: Document[] = docs.map((doc) => ({
        _id: String(doc?.doc_id ?? ""),
        content_summary: doc?.content_summary ?? "",
        status: String(doc?.status ?? "unknown"),
        content_length: Number(doc?.content_length ?? 0),
        chunks_count: Number(doc?.chunks_count ?? 0),
        created_at: String(doc?.created_at ?? new Date().toISOString()),
      }))
      setDocuments(arr)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const onFilesChosen: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = e.currentTarget.files
    if (!files || files.length === 0) return
    const newPending: PendingFile[] = Array.from(files).map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}-${crypto.randomUUID()}`,
      file: f,
      status: "ready",
    }))
    setPending((prev) => [...newPending, ...prev])
    e.currentTarget.value = ""
  }

  const removePending = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  const sendSingleFile = async (pf: PendingFile) => {
    setPending((prev) =>
      prev.map((x) => (x.id === pf.id ? { ...x, status: "sending", error: undefined } : x)),
    )
    try {
      const form = new FormData()
      form.append("file", pf.file, pf.file.name)

      const res = await fetch(`${API_BASE}/api/documents/insert`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || "Upload failed")
      }

      setPending((prev) =>
        prev.map((x) => (x.id === pf.id ? { ...x, status: "sent" } : x)),
      )
      fetchDocuments()
    } catch (e) {
      setPending((prev) =>
        prev.map((x) =>
          x.id === pf.id
            ? { ...x, status: "error", error: e instanceof Error ? e.message : "Upload error" }
            : x,
        ),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold">Document Information</DialogTitle>
            <div className="flex items-center gap-2 mr-10">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.pdf,.doc,.docx,.csv,.xlsx"
                className="hidden"
                onChange={onFilesChosen}
              />
              <Button variant="default" onClick={openFilePicker} className="gap-2">
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable content area */}
        <ScrollArea className="h-[calc(95vh-140px)] w-full p-4">
          {/* Pending uploads */}
          {pending.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Pending uploads</h3>
              <div className="grid gap-3">
                {pending.map((pf) => (
                  <Card key={pf.id} className="p-4">
                    <CardContent className="grid gap-2 p-0">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{pf.file.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {(pf.file.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <div className="flex items-center gap-3">
                          {/* Send button (with check icon) */}
                          <Button
                            title="Send this document to be inserted into the LightRAG graph"
                            onClick={() => sendSingleFile(pf)}
                            disabled={pf.status === "sending" || pf.status === "sent"}
                            className="gap-2"
                          >
                            {pf.status === "sending" ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Sending…
                              </>
                            ) : pf.status === "sent" ? (
                              <>
                                <Check className="h-4 w-4" />
                                Sent
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4" />
                                Send
                              </>
                            )}
                          </Button>

                          {/* Status text */}
                          <span className="text-sm">
                            {pf.status === "ready" && "Ready to send"}
                            {pf.status === "sending" && "Uploading & inserting…"}
                            {pf.status === "sent" && "Inserted"}
                            {pf.status === "error" && (
                              <span className="text-red-600">Error: {pf.error}</span>
                            )}
                          </span>

                          {/* Cancel/remove (X) on the far right */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-auto"
                            title="Remove this pending item"
                            onClick={() => removePending(pf.id)}
                            aria-label="Remove"
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Existing documents list */}
          {loading && <p className="text-center text-lg">Loading documents...</p>}
          {error && <p className="text-center text-red-500 text-lg">Error: {error}</p>}
          {!loading && !error && (
            <div className="grid gap-4">
              {documents.map((doc) => (
                <Card key={doc._id} className="p-4">
                  <CardContent className="grid gap-2">
                    <div className="grid grid-cols-[120px,1fr] gap-2">
                      <span className="font-semibold">ID:</span>
                      <span className="truncate">{doc._id}</span>

                      <span className="font-semibold">Summary:</span>
                      {/* Reverted summary rendering */}
                      <span>{doc.content_summary}</span>

                      <span className="font-semibold">Status:</span>
                      <span
                        className={`capitalize ${
                          doc.status === "processed"
                            ? "text-green-600"
                            : doc.status === "processing"
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {doc.status}
                      </span>

                      <span className="font-semibold">Length:</span>
                      <span>{Number(doc.content_length).toLocaleString()} characters</span>

                      <span className="font-semibold">Chunks:</span>
                      <span>{doc.chunks_count}</span>

                      <span className="font-semibold">Created at:</span>
                      <span>{new Date(doc.created_at).toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
