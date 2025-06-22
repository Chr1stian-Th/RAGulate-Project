# RAGulate - LegalQA Chatbot

## Overview  
RAGulate is a Masters project implementing a Legal Question-Answering chatbot using Retrieval-Augmented Generation (RAG) technology. This system combines the LightRAG framework with the Mistral-7B LLM to provide accurate, context-aware answers to legal questions.

### LightRAG must be installed for this project to run  
RAGulate is built on the LightRAG framework. First install LightRAG by following the instructions from their GitHub repository:

```bash
git clone https://github.com/HKUDS/LightRAG.git
cd LightRAG
pip install -r requirements.txt
```
Refer to the LightRAG GitHub for additional installation details or troubleshooting.

### Model Configuration
RAGulate uses the following LLM:
mistralai/Mistral-7B-Instruct-v0.2

### Notes for usage on DBISAI-machine
Start the Anaconda Virtual Environment LIGHTRAGENV before starting any python scripts
```
conda activate LIGHTRAGENV
run your script
```
