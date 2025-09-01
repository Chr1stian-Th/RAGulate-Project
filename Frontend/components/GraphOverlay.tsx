"use client"

import { useEffect, useState, useMemo } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { graphMLtoForceData } from "@/utils/graphml"
import { useTheme } from "next-themes"
import 'aframe';

const BACKEND_URL = "http://134.60.71.197:8000";

const ForceGraph2D = dynamic(
  () => import('react-force-graph').then((mod) => mod.ForceGraph2D),
  { ssr: false }
)

export function GraphOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { resolvedTheme } = useTheme()
  const [data, setData] = useState<{nodes:any[];links:any[]}>({ nodes: [], links: [] })
  const [linkColor, setLinkColor] = useState('#000000')
  const [selectedNode, setSelectedNode] = useState<any | null>(null)
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth * 0.95,
    height: window.innerHeight * 0.85
  });

  useEffect(() => {
    setLinkColor(resolvedTheme === 'dark' ? '#ffffff' : '#000000')
  }, [resolvedTheme]);

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

        {/* Node details panel */}
        {selectedNode && (
          <div className="absolute right-4 top-16 bottom-4 w-96 overflow-auto rounded-lg border bg-white/90 dark:bg-gray-800/90 p-4 text-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold truncate">
                {selectedNode.name ?? selectedNode.id ?? "Node details"}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedNode(null)}>×</Button>
            </div>
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(selectedNode, null, 2)}
            </pre>
          </div>
        )}

        <div className="h-[calc(100%-56px)]">
          <ForceGraph2D
            graphData={data}
            nodeLabel="name"
            linkDirectionalParticles={1}
            linkDirectionalParticleSpeed={0.005}
            width={dimensions.width}
            height={dimensions.height}
            linkColor={linkColor}
            linkDirectionalParticleColor={linkColor}
            onNodeClick={(node: any) => setSelectedNode(node)}
            onBackgroundClick={() => setSelectedNode(null)}
          />
        </div>
      </div>
    </div>
  )
}
