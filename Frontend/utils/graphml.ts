export function graphMLtoForceData(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const nodeEls = Array.from(doc.getElementsByTagName("node"));
  const edgeEls = Array.from(doc.getElementsByTagName("edge"));

  const nodes = nodeEls.map(n => ({
    id: n.getAttribute("id") || "",
    // grab a label from <data> if present, else fallback to id
    name: n.querySelector("data")?.textContent || n.getAttribute("id") || ""
  }));

  const links = edgeEls.map(e => ({
    source: e.getAttribute("source") || "",
    target: e.getAttribute("target") || "",
    // optional edge data:
    name: e.querySelector("data")?.textContent || undefined
  }));

  return { nodes, links };
}
