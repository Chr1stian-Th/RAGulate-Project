# backend_generate_prompt.py
import os
import json
import torch
import asyncio
import nest_asyncio
from typing import Optional
from datetime import datetime
import requests

from transformers import AutoModel, AutoTokenizer, AutoModelForCausalLM
from lightrag import LightRAG, QueryParam
from lightrag.llm.hf import hf_embed
from lightrag.utils import EmbeddingFunc
from lightrag.kg.shared_storage import initialize_pipeline_status
from pymongo import MongoClient

nest_asyncio.apply()

WORKING_DIR = "/home/dbis-ai/Desktop/ChristiansWorkspace/RAGulate-Project/Data"
os.makedirs(WORKING_DIR, exist_ok=True)

# -------------------- LLM provider config --------------------
_ALLOWED_LLM_PROVIDERS = {"hf", "openrouter"}

# OpenRouter config via env (with sensible defaults)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")  # must be set if using openrouter
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "mistralai/mistral-nemo") # set model
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_HTTP_REFERER = os.getenv("OPENROUTER_HTTP_REFERER")  # optional
OPENROUTER_X_TITLE = os.getenv("OPENROUTER_X_TITLE")            # optional

# Default local HF model
hf_model_name = "mistralai/Mistral-7B-Instruct-v0.3"
hf_tokenizer = AutoTokenizer.from_pretrained(hf_model_name)
hf_model = AutoModelForCausalLM.from_pretrained(hf_model_name)

hf_tokenizer.pad_token = hf_tokenizer.eos_token
hf_model.config.pad_token_id = hf_tokenizer.pad_token_id
hf_model.eval()

# -------------------- HF text generation helpers --------------------
def _hf_generate(prompt: str) -> str:
    formatted_prompt = f"<s>[INST] {prompt} [/INST]"
    inputs = hf_tokenizer(
        formatted_prompt,
        return_tensors="pt",
        truncation=True,
        max_length=512,
        padding=True,
    )
    with torch.no_grad():
        outputs = hf_model.generate(
            **inputs,
            max_new_tokens=512,
            pad_token_id=hf_tokenizer.pad_token_id,
            eos_token_id=hf_tokenizer.eos_token_id,
            return_dict_in_generate=True,
        )
    input_len = inputs.input_ids.shape[1]
    generated_only = outputs.sequences[0, input_len:]
    return hf_tokenizer.decode(generated_only, skip_special_tokens=True).strip()

async def hf_model_complete(prompt: str, **kwargs) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _hf_generate, prompt)

# -------------------- MongoDB --------------------
client = MongoClient("mongodb://localhost:27017/")
db = client["RAGulate"]
collection = db["chatlogs"]
user_collection = db["usermanagement"]
token_collection = db["tokenmanagement"]

def _log_openrouter_response(doc: dict) -> None:
    """
    Insert a log document into db['tokenmanagement'].
    doc should already be JSON-serializable.
    """
    try:
        token_collection.insert_one(doc)
    except Exception as e:
        # Do not raise; logging must never break the main flow
        print(f"[OpenRouter][Log Insert Error] {e}")

# -------------------- OpenRouter (mistral-nemo) helpers --------------------
def _openrouter_generate(prompt: str) -> str:
    """
    Blocking helper that calls OpenRouter Chat Completions for mistral-nemo.
    Logs the full JSON response into db['tokenmanagement'].
    Returns the assistant message content or raises a descriptive Exception.
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Export it to use llmProvider='openrouter'."
        )

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    # Optional attribution headers
    if OPENROUTER_HTTP_REFERER:
        headers["HTTP-Referer"] = OPENROUTER_HTTP_REFERER
    if OPENROUTER_X_TITLE:
        headers["X-Title"] = OPENROUTER_X_TITLE

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant integrated in a retrieval-augmented application.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 512,
    }

    resp = requests.post(
        OPENROUTER_BASE_URL,
        headers=headers,
        data=json.dumps(payload),
        timeout=60
    )

    # Try to parse JSON either way to log the raw response
    parsed = None
    try:
        parsed = resp.json()
    except Exception:
        parsed = {"raw_text": resp.text}

    # --- Log API usage to MongoDB ---
    _log_openrouter_response({
        "ts_utc": datetime.now(),
        "provider": "openrouter",
        "status_code": resp.status_code,
        "model": OPENROUTER_MODEL,
        "response": parsed,
        "request_meta": {
            "has_referer": bool(OPENROUTER_HTTP_REFERER),
            "has_title": bool(OPENROUTER_X_TITLE),
        }
    })

    if resp.status_code != 200:
        # Surface a helpful error upstream
        raise RuntimeError(f"OpenRouter error ({resp.status_code}): {parsed}")

    try:
        print(parsed)
        return parsed["choices"][0]["message"]["content"].strip()
    except Exception:
        raise RuntimeError(f"Unexpected OpenRouter response structure: {parsed}")

async def openrouter_complete(prompt: str, **kwargs) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _openrouter_generate, prompt)

# -------------------- Dispatching LLM for LightRAG --------------------
_LLM_PROVIDER = "hf"  # default

async def llm_dispatch(prompt: str, **kwargs) -> str:
    """
    LightRAG will call this function. We dispatch to the selected provider.
    """
    provider = _LLM_PROVIDER
    if provider == "openrouter":
        return await openrouter_complete(prompt, **kwargs)
    # fallback to local HF
    return await hf_model_complete(prompt, **kwargs)

# -------------------- LightRAG instance (singleton) --------------------
_rag_instance: Optional[LightRAG] = None
_rag_lock = asyncio.Lock()

async def initialize_rag() -> LightRAG:
    _emb_tok = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
    _emb_model = AutoModel.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")

    rag = LightRAG(
        working_dir=WORKING_DIR,
        llm_model_func=llm_dispatch,
        llm_model_name=f"dispatch:{hf_model_name}|{OPENROUTER_MODEL}",
        embedding_func=EmbeddingFunc(
            embedding_dim=384,
            max_token_size=5000,
            func=lambda texts: hf_embed(texts, tokenizer=_emb_tok, embed_model=_emb_model),
        ),
    )
    await rag.initialize_storages()
    await initialize_pipeline_status()
    print("Finished Initializing!")
    return rag

async def get_rag() -> LightRAG:
    global _rag_instance
    if _rag_instance is None:
        async with _rag_lock:
            if _rag_instance is None:
                _rag_instance = await initialize_rag()
    return _rag_instance

# -------------------- Options & helpers --------------------
_ALLOWED_QUERY_MODES = {"local", "global", "hybrid", "naive", "mix"}

DEFAULT_OPTIONS = {
    "chatHistory": True,
    "timeout": 180,         # seconds
    "customPrompt": "",     # free text
    "queryMode": "naive",   # default retrieval mode
    "llmProvider": "hf",    # 'hf' or 'openrouter'
}

_HISTORY_LIMIT = 3 * 2  # number of history messages to keep at maximum

def get_last_conversations(collection, session_id: str):
    return list(collection.find({"session_id": session_id}).sort("timestamp", 1))

def format_conversation(entries):
    conv_history = []
    for entry in entries[:-1]:
        conv_history.append({
            "role": entry.get("role", "user"),
            "content": entry.get("content", ""),
        })
    return conv_history[-_HISTORY_LIMIT:]

def _find_username_by_session(session_id: str) -> str | None:
    doc = user_collection.find_one(
        {"session_list": session_id},
        {"_id": 0, "username": 1}
    )
    return doc.get("username") if doc else None

def _get_user_options(username: str | None) -> dict:
    """
    Load user options from DB, applying validation/sanitization and
    falling back to DEFAULT_OPTIONS where necessary.
    Ensures queryMode defaults to 'naive' if missing/invalid.
    """
    out = dict(DEFAULT_OPTIONS)
    if not username:
        return out

    doc = user_collection.find_one(
        {"username": username},
        {"_id": 0, "options": 1}
    )
    opts = (doc or {}).get("options") or {}

    # chatHistory
    if isinstance(opts.get("chatHistory"), bool):
        out["chatHistory"] = opts["chatHistory"]

    # timeout (bounded int)
    try:
        if isinstance(opts.get("timeout"), (int, float)):
            t = int(opts["timeout"])
            out["timeout"] = max(5, min(300, t))
    except Exception:
        pass

    # customPrompt
    if isinstance(opts.get("customPrompt"), str):
        out["customPrompt"] = opts["customPrompt"]

    # queryMode with validation
    qmode = opts.get("queryMode")
    if isinstance(qmode, str) and qmode in _ALLOWED_QUERY_MODES:
        out["queryMode"] = qmode
    else:
        out["queryMode"] = "naive"

    # llmProvider with validation
    prov = opts.get("llmProvider")
    if isinstance(prov, str) and prov in _ALLOWED_LLM_PROVIDERS:
        out["llmProvider"] = prov
    else:
        out["llmProvider"] = "hf"

    return out

def _build_queryparam(chat_history_enabled: bool, custom_prompt: str, session_id: str, query_mode: str):
    """
    Build QueryParam, setting the LightRAG mode from validated query_mode.
    """
    mode = query_mode if query_mode in _ALLOWED_QUERY_MODES else "naive"
    qp = QueryParam(mode=mode)

    if custom_prompt:
        try:
            qp.user_prompt = custom_prompt.strip()
        except Exception:
            pass

    return qp

async def _rag_query_with_timeout(rag: LightRAG, query: str, param: QueryParam, timeout_s: int) -> str:
    loop = asyncio.get_event_loop()
    def _run():
        return rag.query(query, param=param)
    return await asyncio.wait_for(loop.run_in_executor(None, _run), timeout=timeout_s)

async def generate_output(input: str, session_id: str) -> str:
    global _LLM_PROVIDER

    rag = await get_rag()

    username = _find_username_by_session(session_id)
    options = _get_user_options(username)

    chat_history_enabled = options["chatHistory"]
    timeout_s = options["timeout"]
    custom_prompt = options["customPrompt"]
    query_mode = options.get("queryMode", "naive")
    llm_provider = options.get("llmProvider", "hf")

    # Set provider for this request
    _LLM_PROVIDER = llm_provider if llm_provider in _ALLOWED_LLM_PROVIDERS else "hf"

    param = _build_queryparam(chat_history_enabled, custom_prompt, session_id, query_mode)

    if chat_history_enabled:
        raw_entries = get_last_conversations(collection, session_id)
        conv_history = format_conversation(raw_entries)
        history_length = len(conv_history)
        if history_length > 0:
            history_turns = min((history_length // 2), 3)
            try:
                param.conversation_history = conv_history
                param.history_turns = history_turns
            except Exception:
                pass

    try:
        result = await _rag_query_with_timeout(rag, input, param, timeout_s)
    except asyncio.TimeoutError:
        return f"[Timeout] The request exceeded the configured timeout of {timeout_s} seconds."
    except Exception as e:
        return f"[Error] Query failed: {e}"

    print(result)
    return result