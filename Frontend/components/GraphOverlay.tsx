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
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth * 0.95,
    height: window.innerHeight * 0.85
  });

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth * 0.95,
        height: window.innerHeight * 0.85
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      <div className="absolute left-[2.5vw] top-[2.5vh] h-[95vh] w-[95vw] bg-white dark:bg-gray-900 shadow-xl rounded-lg">
        <div className="flex items-center justify-between px-6 h-14 border-b">
          <div className="text-xl font-medium">Graph Viewer</div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="h-[calc(100%-56px)]">
          <ForceGraph2D
            graphData={data}
            nodeLabel="name"
            linkDirectionalParticles={1}
            linkDirectionalParticleSpeed={0.005}
            width={dimensions.width}
            height={dimensions.height}
          />
        </div>
      </div>
    </div>
  )
}
