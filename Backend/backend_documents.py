import os
import json
import asyncio
from typing import List, Dict, Any

from backend_generate_prompt import get_rag  # reuse the single LightRAG instance
import textract

# How many uploaded docs to index per request (can be adjusted via env)
MAX_DOCS_PER_INSERT = int(os.getenv("RAG_MAX_DOCS_PER_INSERT", "1"))

def extract_text_from_file(path: str) -> str:
    """
    Extract text from a file using textract only.
    """
    content = textract.process(path)
    if isinstance(content, bytes):
        return content.decode("utf-8", errors="ignore")
    return str(content)

async def insert_uploaded_files_to_rag(file_infos: List[Dict[str, Any]], max_docs: int = MAX_DOCS_PER_INSERT) -> Dict[str, Any]:
    """
    Insert up to `max_docs` uploaded files into LightRAG using textract for text extraction.
    Expects file_infos as list of dicts with at least "path" and "name".
    Returns a summary dict.
    """
    rag = await get_rag()

    if not file_infos:
        return {"inserted": 0, "skipped": 0, "errors": [], "processed": 0, "files": []}

    to_process = file_infos[: max_docs] if max_docs and max_docs > 0 else file_infos
    inserted = 0
    skipped = 0
    errors = []
    processed_files = []

    for f in to_process:
        path = f.get("path")
        name = f.get("name") or os.path.basename(path or "")
        if not path or not os.path.exists(path):
            msg = f"[insert] skip missing file: {path}"
            print(msg)
            errors.append({"file": name, "error": "missing"})
            skipped += 1
            continue

        try:
            text = extract_text_from_file(path)
        except Exception as ex:
            print(f"[insert] textract failed for {path}: {ex}")
            errors.append({"file": name, "error": "textract_failed", "details": str(ex)})
            skipped += 1
            continue

        if not text or not text.strip():
            msg = f"[insert] empty text extracted from: {path}"
            print(msg)
            errors.append({"file": name, "error": "empty_text"})
            skipped += 1
            continue

        try:
            await rag.ainsert(text)
            inserted += 1
            processed_files.append(name)
            print(f"[insert] inserted into LightRAG: {path}")
        except Exception as e:
            print(f"[insert] failed for {path}: {e}")
            errors.append({"file": name, "error": str(e)})

    return {
        "inserted": inserted,
        "skipped": skipped,
        "errors": errors,
        "processed": len(to_process),
        "files": processed_files,
    }

def read_kv_store_status(status_path: str) -> Any:
    """
    Read kv_store_doc_status.json content and return as Python object.
    """
    try:
        with open(status_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"error": "status_file_not_found", "path": status_path}
    except Exception as e:
        return {"error": "status_read_error", "details": str(e), "path": status_path}
