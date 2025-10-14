import os
import json
import asyncio
import threading
from datetime import datetime
from typing import Optional, List, Dict, Any, Iterable

import nest_asyncio
import torch
from torch.cuda import is_available as cuda_available
from transformers import AutoModel, AutoTokenizer, AutoModelForCausalLM
from openai import OpenAI
from pymongo import MongoClient

from lightrag import LightRAG, QueryParam
from lightrag.llm.hf import hf_embed
from lightrag.utils import EmbeddingFunc
from lightrag.kg.shared_storage import initialize_pipeline_status

nest_asyncio.apply()

WORKING_DIR = "/home/dbis-ai/Desktop/ChristiansWorkspace/RAGulate-Project/Data"
os.makedirs(WORKING_DIR, exist_ok=True)

# MongoDB collections
client = MongoClient("mongodb://localhost:27017/")
db = client["RAGulate"]
collection = db["chatlogs"]
user_collection = db["usermanagement"]
token_collection = db["tokenmanagement"]

# Allowed and default options
_ALLOWED_LLM_PROVIDERS = {"hf", "openrouter"}
_ALLOWED_QUERY_MODES = {"local", "global", "hybrid", "naive", "mix"}

DEFAULT_OPTIONS = {
    "chatHistory": True,
    "timeout": 180,         # seconds
    "customPrompt": "",     # extra instructions
    "queryMode": "naive",   # retrieval mode
    "llmProvider": "hf",    # 'hf' or 'openrouter'
}

_HISTORY_LIMIT = 6  # cap history messages passed to the LLM

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "mistralai/mistral-nemo")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

HF_MODEL_NAME = "mistralai/Mistral-7B-Instruct-v0.2"

_hf_tokenizer = AutoTokenizer.from_pretrained(HF_MODEL_NAME)
_hf_model = AutoModelForCausalLM.from_pretrained(
    HF_MODEL_NAME,
    device_map="auto" if cuda_available() else None,
    dtype=torch.float16 if cuda_available() else None,
)
_hf_tokenizer.pad_token = _hf_tokenizer.eos_token
_hf_model.config.pad_token_id = _hf_tokenizer.pad_token_id
_hf_model.eval()

# generation lock to avoid overlapping .generate() on same weights
_HF_GENERATE_LOCK = threading.Lock()

def _hf_build_chat_text(
    prompt: str,
    system_prompt: Optional[str],
    history_messages: Optional[List[Dict[str, str]]],
) -> str:
    """
    Builds a formatted chat text for HuggingFace model input.

    Args:
        prompt (str): The current user message
        system_prompt (Optional[str]): System instructions for the model
        history_messages (Optional[List[Dict[str, str]]]): Previous conversation messages

    Returns:
        str: Formatted chat text using the model's chat template

    Note:
        Uses the HuggingFace tokenizer's chat template for consistent formatting
    """
    msgs: List[Dict[str, str]] = []
    if system_prompt:
        msgs.append({"role": "system", "content": system_prompt})
    if history_messages:
        msgs.extend(
            {"role": m.get("role", "user"), "content": m.get("content", "")}
            for m in history_messages
            if isinstance(m, dict)
        )
    msgs.append({"role": "user", "content": prompt})
    return _hf_tokenizer.apply_chat_template(
        msgs, tokenize=False, add_generation_prompt=True
    )

def _hf_generate_once(text_input: str, max_new_tokens: int = 512) -> str:
    """
    Generates a single response using the HuggingFace model.

    Args:
        text_input (str): Formatted input text
        max_new_tokens (int): Maximum number of tokens to generate

    Returns:
        str: Generated text response

    Note:
        Uses a thread lock to prevent concurrent generation on same model weights
    """
    inputs = _hf_tokenizer(
        text_input,
        return_tensors="pt",
        truncation=True,
        padding=True,
    )
    model_device = next(_hf_model.parameters()).device
    inputs = {k: v.to(model_device) for k, v in inputs.items()}
    with _HF_GENERATE_LOCK:
        with torch.no_grad():
            out = _hf_model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                pad_token_id=_hf_tokenizer.pad_token_id,
                eos_token_id=_hf_tokenizer.eos_token_id,
                return_dict_in_generate=True,
            )
    n = inputs["input_ids"].shape[1]
    text = _hf_tokenizer.decode(out.sequences[0, n:], skip_special_tokens=True).strip()
    return text

async def llm_model_func_hf(
    prompt: str,
    system_prompt: Optional[str] = None,
    history_messages: Optional[List[Dict[str, str]]] = None,
    **kwargs: Any,
) -> str:
    """
    Asynchronous HuggingFace model generation function.

    Args:
        prompt (str): User input text
        system_prompt (Optional[str]): System instructions
        history_messages (Optional[List[Dict[str, str]]]): Chat history
        **kwargs: Additional parameters

    Returns:
        str: Generated response

    Note:
        Logs API usage metrics to MongoDB
    """
    chat_text = _hf_build_chat_text(prompt, system_prompt, history_messages or [])
    result = await asyncio.to_thread(_hf_generate_once, chat_text)
    print("[HF][Answer]:", result)
    _log_simple_api_usage("hf", HF_MODEL_NAME, len(prompt), len(result))
    return result

_emb_tok = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
_emb_model = AutoModel.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
_EMBEDDINGS = EmbeddingFunc(
    embedding_dim=384,
    max_token_size=5000,
    func=lambda texts: hf_embed(texts, tokenizer=_emb_tok, embed_model=_emb_model),
)

def _log_simple_api_usage(provider: str, model: str, prompt_len: int, answer_len: int) -> None:
    try:
        token_collection.insert_one({
            "provider": provider,
            "model": model,
            "prompt_len": prompt_len,
            "answer_len": answer_len,
            "timestamp": datetime.utcnow().isoformat(),
        })
    except Exception as e:
        print(f"[UsageLog][Insert Error] {e}")

def _log_raw_api_response(provider: str, model: str, raw: Any) -> None:
    try:
        if hasattr(raw, "model_dump"):
            payload = raw.model_dump()
        elif hasattr(raw, "to_dict"):
            payload = raw.to_dict()
        else:
            payload = json.loads(getattr(raw, "model_dump_json", lambda: "{}")())
        token_collection.insert_one({
            "provider": provider,
            "model": model,
            "raw_response": payload,
            "timestamp": datetime.utcnow().isoformat(),
        })
    except Exception as e:
        print(f"[UsageLog][Raw Insert Error] {e}")

async def llm_model_func_openrouter(
    prompt: str,
    system_prompt: Optional[str] = None,
    history_messages: Optional[List[Dict[str, str]]] = None,
    **kwargs: Any,
) -> str:
    """
    Asynchronous OpenRouter API generation function.

    Args:
        prompt (str): User input text
        system_prompt (Optional[str]): System instructions
        history_messages (Optional[List[Dict[str, str]]]): Chat history
        **kwargs: Additional parameters

    Returns:
        str: Generated response

    Raises:
        RuntimeError: If OPENROUTER_API_KEY is not set
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not set but 'openrouter' provider was selected.")
    client = OpenAI(api_key=OPENROUTER_API_KEY, base_url=OPENROUTER_BASE_URL)

    def _do_create():
        return client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[
                *([{"role": "system", "content": system_prompt}] if system_prompt else []),
                *(history_messages or []),
                {"role": "user", "content": prompt},
            ],
        )

    completion = await asyncio.to_thread(_do_create)
    try:
        content = completion.choices[0].message.content or ""
    except Exception:
        content = ""
    print("[OpenRouter][Answer]:", content)
    _log_simple_api_usage("openrouter", OPENROUTER_MODEL, len(prompt), len(content))
    _log_raw_api_response("openrouter", OPENROUTER_MODEL, completion)
    return content

_rag_hf: Optional[LightRAG] = None
_rag_or: Optional[LightRAG] = None
_rag_init_lock = asyncio.Lock()     # protects init
_rag_query_lock = asyncio.Lock()    # serializes .query calls (prevents stalls)

async def _initialize_rag_base(llm_model_func, llm_model_name: str) -> LightRAG:
    rag = LightRAG(
        working_dir=WORKING_DIR,
        llm_model_func=llm_model_func,
        llm_model_name=llm_model_name,
        embedding_func=_EMBEDDINGS,
    )
    await rag.initialize_storages()
    await initialize_pipeline_status()
    return rag

async def initialize_rag_hf() -> LightRAG:
    rag = await _initialize_rag_base(llm_model_func_hf, f"hf:{HF_MODEL_NAME}")
    print("LightRAG initialized with local HF generation.")
    return rag

async def initialize_rag_openrouter() -> LightRAG:
    rag = await _initialize_rag_base(llm_model_func_openrouter, f"openrouter:{OPENROUTER_MODEL}")
    print(f"LightRAG initialized with OpenRouter ({OPENROUTER_MODEL}).")
    return rag

async def get_rag(provider: str = "hf") -> LightRAG:
    """
    Gets or initializes a LightRAG instance for specified provider.

    Args:
        provider (str): LLM provider ("hf" or "openrouter")

    Returns:
        LightRAG: Initialized RAG instance

    Note:
        Uses locks to prevent concurrent initialization
    """
    global _rag_hf, _rag_or
    prov = (provider or "hf").lower()
    async with _rag_init_lock:
        if prov == "openrouter":
            if _rag_or is None:
                _rag_or = await initialize_rag_openrouter()
            return _rag_or
        if _rag_hf is None:
            _rag_hf = await initialize_rag_hf()
        return _rag_hf

def _find_username_by_session(session_id: str) -> Optional[str]:
    """
    Finds username associated with a session ID.

    Args:
        session_id (str): Session identifier

    Returns:
        Optional[str]: Username if found, None otherwise
    """
    doc = user_collection.find_one({"session_list": session_id}, {"_id": 0, "username": 1})
    return (doc or {}).get("username")

def _get_user_options(username: Optional[str]) -> Dict[str, Any]:
    """
    Retrieves and validates user-specific options.

    Args:
        username (Optional[str]): Username to get options for

    Returns:
        Dict[str, Any]: Normalized options with defaults
    """
    out = dict(DEFAULT_OPTIONS)
    if not username:
        return out
    doc = user_collection.find_one({"username": username}, {"_id": 0, "options": 1})
    opts = (doc or {}).get("options", {}) if doc else {}

    ch = opts.get("chatHistory")
    out["chatHistory"] = ch if isinstance(ch, bool) else DEFAULT_OPTIONS["chatHistory"]

    try:
        t = int(opts.get("timeout", DEFAULT_OPTIONS["timeout"]))
        out["timeout"] = max(5, min(t, 600))
    except Exception:
        out["timeout"] = DEFAULT_OPTIONS["timeout"]

    cp = opts.get("customPrompt")
    out["customPrompt"] = cp if isinstance(cp, str) else DEFAULT_OPTIONS["customPrompt"]

    qm = opts.get("queryMode")
    out["queryMode"] = qm if isinstance(qm, str) and qm in _ALLOWED_QUERY_MODES else DEFAULT_OPTIONS["queryMode"]

    prov = opts.get("llmProvider")
    out["llmProvider"] = prov if isinstance(prov, str) and prov in _ALLOWED_LLM_PROVIDERS else DEFAULT_OPTIONS["llmProvider"]
    return out

def get_last_conversations(collection_ref, session_id: str) -> List[Dict[str, Any]]:
    """
    Retrieves conversation history for a session.

    Args:
        collection_ref: MongoDB collection reference
        session_id (str): Session identifier

    Returns:
        List[Dict[str, Any]]: Conversation messages in chronological order
    """
    return list(collection_ref.find({"session_id": session_id}).sort("timestamp", 1))

def format_conversation(entries: Iterable[Dict[str, Any]]) -> List[Dict[str, str]]:
    conv_history: List[Dict[str, str]] = []
    for entry in entries[:-1]:
        conv_history.append({
            "role": entry.get("role", "user"),
            "content": entry.get("content", ""),
        })
    return conv_history[-_HISTORY_LIMIT:]

def _build_queryparam(custom_prompt: str, query_mode: str) -> QueryParam:
    mode = query_mode if query_mode in _ALLOWED_QUERY_MODES else "naive"
    qp = QueryParam(mode=mode)
    if isinstance(custom_prompt, str) and custom_prompt.strip():
        try:
            qp.user_prompt = custom_prompt.strip()
        except Exception:
            pass
    return qp

async def _rag_query(rag: LightRAG, query: str, param: QueryParam, timeout_s: int) -> str:
    """
    Executes a RAG query with timeout and error handling.

    Args:
        rag (LightRAG): RAG instance
        query (str): User query
        param (QueryParam): Query parameters
        timeout_s (int): Timeout in seconds

    Returns:
        str: Generated response or error message

    Note:
        Serializes queries to prevent deadlocks
    """
    print("[RAG][Query]:", query, "| [Param]:", getattr(param, "mode", "naive"))
    try:
        # Serialize LightRAG .query calls to avoid deadlocks in shared state
        async with _rag_query_lock:
            result = await asyncio.wait_for(asyncio.to_thread(rag.query, query, param), timeout=timeout_s)
        print("[RAG][Result]:", result)
        return result
    except asyncio.TimeoutError:
        return f"[Timeout] The request exceeded the configured timeout of {timeout_s} seconds."
    except Exception as e:
        msg = str(e)
        if "shapes" in msg and "!=" in msg and "dim" in msg:
            return (
                "[Error] Query failed due to an embedding dimension mismatch. "
                "Your existing indexes may have been built with a different embedding size. "
                "Ensure you're consistently using 'sentence-transformers/all-MiniLM-L6-v2' (384-dim) "
                "or rebuild your LightRAG storages to match."
            )
        return f"[Error] Query failed: {msg}"

async def generate_output(user_input: str, session_id: str) -> str:
    """
    Main generation function that processes user input.

    Args:
        user_input (str): User's message
        session_id (str): Session identifier

    Returns:
        str: Generated response

    Note:
        - Loads user preferences
        - Handles chat history
        - Manages RAG query execution
    """
    username = _find_username_by_session(session_id)
    options = _get_user_options(username)

    chat_history_enabled: bool = options.get("chatHistory", True)
    timeout_s: int = options.get("timeout", 180)
    custom_prompt: str = options.get("customPrompt", "")
    query_mode: str = options.get("queryMode", "naive")
    llm_provider: str = options.get("llmProvider", "hf")

    rag = await get_rag(llm_provider)
    param = _build_queryparam(custom_prompt, query_mode)

    if chat_history_enabled:
        raw_entries = get_last_conversations(collection, session_id)
        conv_history = format_conversation(raw_entries)
        if conv_history:
            try:
                param.conversation_history = conv_history
            except Exception:
                pass

    return await _rag_query(rag, user_input, param, timeout_s)
