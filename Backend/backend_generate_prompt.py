# backend_generate_prompt.py
import os
import torch
import asyncio
import nest_asyncio
from transformers import AutoModel, AutoTokenizer, AutoModelForCausalLM
from lightrag import LightRAG, QueryParam
from lightrag.llm.hf import hf_embed
from lightrag.utils import EmbeddingFunc
from lightrag.kg.shared_storage import initialize_pipeline_status
from pymongo import MongoClient

nest_asyncio.apply()

WORKING_DIR = "/home/dbisai/Desktop/ChristiansWorkspace/RAGulate/Data"
os.makedirs(WORKING_DIR, exist_ok=True)

# Configure Model and tokenizer
hf_model_name = "mistralai/Mistral-7B-Instruct-v0.2"
hf_tokenizer = AutoTokenizer.from_pretrained(hf_model_name)
hf_model = AutoModelForCausalLM.from_pretrained(hf_model_name)

hf_tokenizer.pad_token = hf_tokenizer.eos_token
hf_model.config.pad_token_id = hf_tokenizer.pad_token_id
hf_model.eval()

# -------- HF text generation helpers --------
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

# LightRAG instance 
_rag_instance = None
_rag_lock = asyncio.Lock()

async def initialize_rag() -> LightRAG:
    rag = LightRAG(
        working_dir=WORKING_DIR,
        llm_model_func=hf_model_complete,
        llm_model_name=hf_model_name,
        embedding_func=EmbeddingFunc(
            embedding_dim=384,
            max_token_size=5000,
            func=lambda texts: hf_embed(
                texts,
                tokenizer=AutoTokenizer.from_pretrained(
                    "sentence-transformers/all-MiniLM-L6-v2"
                ),
                embed_model=AutoModel.from_pretrained(
                    "sentence-transformers/all-MiniLM-L6-v2"
                ),
            ),
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

# MongoDB 
client = MongoClient("mongodb://localhost:27017/")
db = client["RAGulate"]
collection = db["chatlogs"]
user_collection = db["usermanagement"]

# Allowed query modes (must match frontend)
_ALLOWED_QUERY_MODES = {"local", "global", "hybrid", "naive", "mix"}

# Options & helpers
DEFAULT_OPTIONS = {
    "chatHistory": True,
    "timeout": 180,        # seconds
    "customPrompt": "",   # free text
    "queryMode": "naive", # default retrieval mode
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
        out["queryMode"] = "naive"  # hard default if missing/invalid

    return out

def _build_queryparam(chat_history_enabled: bool, custom_prompt: str, session_id: str, query_mode: str):
    """
    Build QueryParam, setting the LightRAG mode from validated query_mode.
    """
    # Safety: ensure we only pass allowed modes; fall back to 'naive'
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

#  generate output is called when user sends a message
async def generate_output(input: str, session_id: str) -> str:
    rag = await get_rag()

    username = _find_username_by_session(session_id)
    options = _get_user_options(username)

    chat_history_enabled = options["chatHistory"]
    timeout_s = options["timeout"]
    custom_prompt = options["customPrompt"]
    query_mode = options.get("queryMode", "naive")  # extra guard

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