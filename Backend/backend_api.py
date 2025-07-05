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

nest_asyncio.apply()

WORKING_DIR = "/home/dbisai/Desktop/ChristiansWorkspace/RAGulate/Data"

if not os.path.exists(WORKING_DIR):
    os.mkdir(WORKING_DIR)

# Configure Model and tokenizer etc
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
        padding=True
    )

    attention_mask = inputs["attention_mask"]

    with torch.no_grad():
        outputs = hf_model.generate(
            inputs.input_ids,
            attention_mask=attention_mask,
            max_new_tokens=512,
            pad_token_id=hf_tokenizer.pad_token_id,
            eos_token_id=hf_tokenizer.eos_token_id
        )
    return hf_tokenizer.decode(outputs[0], skip_special_tokens=True)

async def hf_model_complete(prompt: str, **kwargs) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _hf_generate, prompt)

# Initialize LightRAG once
async def initialize_rag():
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

# Cache RAG instance across calls // TODO IF Performance is shit, resulted in issues earlier
#_rag_instance = None

#async def get_rag():
#    global _rag_instance
#    if _rag_instance is None:
#        _rag_instance = await initialize_rag()
#    return _rag_instance

# Process Query - used in backend_api.py
#async def query_rag(prompt: str) -> str:
    #rag = await get_rag()
    #rag = asyncio.run(initialize_rag())
    #return rag.query(prompt, param=QueryParam(mode="naive"))

#Test call of function
#async def main():
    #await query_rag("Was ist Artikel 5 der DSGVO?")

#asyncio.run(main())

# Perform naive search, return the output
async def generate_output(input: str):
    rag = asyncio.run(initialize_rag())

    result = rag.query(input, param=QueryParam(mode="naive"))

    #Split the String to remove the prompt
    # Split at the INST markers
    parts = result.split("[/INST]", 1)
    string1 = parts[0].replace("[INST]", "").strip()
    string2 = parts[1].strip()
    print(string1)
    print(string2)
    return string2
    

#if __name__ == "__main__":
    #generate_output("Was ist Artikel 5 der DSGVO?")