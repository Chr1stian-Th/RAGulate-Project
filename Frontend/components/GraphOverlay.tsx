"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { graphMLtoForceData } from "@/utils/graphml"
import 'aframe';

// Backend URL for the chat API
const BACKEND_URL = "http://134.60.71.197:8000";

// ForceGraph2D with SSR disabled
const ForceGraph2D = dynamic(
  () => import('react-force-graph').then((mod) => mod.ForceGraph2D),
  { ssr: false }
)

export function GraphOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<{nodes:any[];links:any[]}>({ nodes: [], links: [] })


  useEffect(() => {
    if (!open) return
    (async () => {
      const res = await fetch(BACKEND_URL + "/api/graph")
      const xml = await res.text()
      setData(graphMLtoForceData(xml))
    })()
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="absolute right-0 top-0 h-full w-[min(900px,100%)] bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between px-3 h-12 border-b">
          <div className="font-medium">Graph Viewer</div>
          <Button variant="ghost" onClick={onClose}>Minimize</Button>
        </div>
        <div className="h-[calc(100%-48px)]">
          <ForceGraph2D
            graphData={data}
            nodeLabel="name"
            linkDirectionalParticles={1}
            linkDirectionalParticleSpeed={0.005}
          />
        </div>
      </div>
    </div>
  )
}
