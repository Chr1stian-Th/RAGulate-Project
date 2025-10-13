import os
import torch
import asyncio
import nest_asyncio
import concurrent.futures
import textract
from lightrag import LightRAG, QueryParam
from lightrag.llm.hf import hf_embed
from lightrag.utils import EmbeddingFunc
from transformers import AutoModel, AutoTokenizer, AutoModelForCausalLM
from lightrag.kg.shared_storage import initialize_pipeline_status

nest_asyncio.apply()

WORKING_DIR = "/home/dbisai/Desktop/ChristiansWorkspace/RAGulate/Data"

if not os.path.exists(WORKING_DIR):
    os.mkdir(WORKING_DIR)

hf_model_name = "mistralai/Mistral-7B-Instruct-v0.3"
hf_tokenizer = AutoTokenizer.from_pretrained(hf_model_name)
hf_model = AutoModelForCausalLM.from_pretrained(hf_model_name)

hf_tokenizer.pad_token = hf_tokenizer.eos_token
hf_model.config.pad_token_id = hf_tokenizer.pad_token_id
hf_model.eval()

# Define LLM completion function
def _hf_generate(prompt: str) -> str:
    inputs = hf_tokenizer(
        prompt,
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
            max_new_tokens=150,
            pad_token_id=hf_tokenizer.pad_token_id,
            eos_token_id=hf_tokenizer.eos_token_id
        )
    return hf_tokenizer.decode(outputs[0], skip_special_tokens=True)

async def hf_model_complete(prompt: str, **kwargs) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _hf_generate, prompt)

# Initialize LightRAG
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

def main():
    rag = asyncio.run(initialize_rag())
    file_path = "/home/dbisai/Desktop/ChristiansWorkspace/RAGulate/Data/GDPR_DE.txt"
    text_content = textract.process(file_path)
    rag.insert(text_content.decode('utf-8'))

    # Perform hybrid search
    print(
        rag.query(
            "Welche sind die Artikel der DSGVO die LLMs betreffen?",
            param=QueryParam(mode="naive")
        )
    )

if __name__ == "__main__":
    main()