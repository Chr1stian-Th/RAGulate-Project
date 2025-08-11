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

# Format String and setup LightRAG
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

_rag_instance = None
_rag_lock = asyncio.Lock()

# Initialize LightRAG
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

limit = 3 * 2  # number of history messages to keep at maximum

def get_last_conversations(collection, session_id: str):
    # Ascending by timestamp; last element is most recent
    return list(collection.find({"session_id": session_id}).sort("timestamp", 1))

def format_conversation(entries):
    conv_history = []
    # exclude the very last entry
    for entry in entries[:-1]:
        conv_history.append({
            "role": entry.get("role", "user"),
            "content": entry.get("content", ""),
        })
    # keep only the last `limit` messages
    return conv_history[-limit:]

# Returns output and requires: input-chatmessage, session_id
async def generate_output(input: str, session_id: str) -> str:
    rag = await get_rag()

    # disabled chat history because of performance
    '''# Pull conversation history
    raw_entries = get_last_conversations(collection, session_id)
    conv_history = format_conversation(raw_entries)

    history_length = len(conv_history)
    print("Length of history:", history_length)

    if history_length == 0:
        param = QueryParam(mode="naive")
    else:
        history_turns = min((history_length // 2), 3)  # Increment by 1 for every 2 messages, max 3
        param = QueryParam(
            mode="naive",
            conversation_history=conv_history,
            history_turns=history_turns,
        )'''
    param = QueryParam(mode="naive")

    result = rag.query(input, param=param)
    print(result)
    return result