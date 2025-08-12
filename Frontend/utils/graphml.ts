export function graphMLtoForceData(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");

  const getAll = (local: string) => Array.from(doc.getElementsByTagNameNS("*", local));

  // Build key -> attr.name maps
  const keyEls = getAll("key");
  const nodeKeyToName = new Map<string, string>();
  const edgeKeyToName = new Map<string, string>();
  const keyType = new Map<string, string>();

  keyEls.forEach(k => {
    const id = k.getAttribute("id") || "";
    const forType = k.getAttribute("for");
    const attrName = k.getAttribute("attr.name") || id;
    const attrType = k.getAttribute("attr.type") || "";
    keyType.set(id, attrType);
    if (forType === "node") nodeKeyToName.set(id, attrName);
    if (forType === "edge") edgeKeyToName.set(id, attrName);
  });

  const coerce = (val: string, type?: string) => {
    if (!type) return val;
    if (type === "double" || type === "float") {
      const n = Number(val);
      return Number.isFinite(n) ? n : val;
    }
    if (type === "long" || type === "int") {
      const n = Number(val);
      return Number.isFinite(n) ? n : val;
    }
    return val;
  };

  const shouldInclude = (val: string) => !val.includes("chunk");

  // Parse nodes
  const nodeEls = getAll("node");
  const nodes = nodeEls.map(n => {
    const dataProps: Record<string, any> = {};
    Array.from(n.getElementsByTagNameNS("*", "data")).forEach(d => {
      const key = d.getAttribute("key") || "";
      const name = nodeKeyToName.get(key) || key;
      const val = d.textContent ?? "";
      if (shouldInclude(val)) {
        dataProps[name] = coerce(val, keyType.get(key));
      }
    });

    const id = n.getAttribute("id") || dataProps.entity_id || "";
    const name = (dataProps.entity_id || dataProps.name || id) as string;

    return {
      id,
      name,
      ...dataProps,
    };
  });

  // Parse edges
  const edgeEls = getAll("edge");
  const links = edgeEls.map(e => {
    const source = e.getAttribute("source") || "";
    const target = e.getAttribute("target") || "";

    const dataProps: Record<string, any> = {};
    Array.from(e.getElementsByTagNameNS("*", "data")).forEach(d => {
      const key = d.getAttribute("key") || "";
      const name = edgeKeyToName.get(key) || key;
      const val = d.textContent ?? "";
      if (shouldInclude(val)) {
        dataProps[name] = coerce(val, keyType.get(key));
      }
    });

    const name = (dataProps.description as string) || (dataProps.keywords as string) || undefined;

    return {
      source,
      target,
      name,
      ...dataProps,
    };
  });

  return { nodes, links };
}