# RAGulate - LegalQA Chatbot

## Overview  
RAGulate is a Masters project implementing a Legal Question-Answering chatbot using Retrieval-Augmented Generation (RAG) technology. This system combines the [LightRAG framework](https://github.com/HKUDS/LightRAG) with the Mistral LLMs to provide accurate, context-aware answers to legal questions.

## Tech Stack

<p align="left">
<img src="https://skillicons.dev/icons?i=next,react,tailwind,ts,mongodb,flask"/>
</p>

- [Next.js](https://nextjs.org/) (App Router)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/) (UI Styling)
- [MongoDB](https://www.mongodb.com/) (Database)
- [Flask](https://flask.palletsprojects.com/en/stable/) (Backend API)

## Features
1. Document Ingestion & Indexing

- Upload multiple file types (.pdf, .docx, .txt, .csv, .xlsx).
- Automatic text extraction using textract.
- Indexed into the LightRAG knowledge store for retrieval.
- Metadata tracked in kv_store_doc_status.json.

2. Knowledge Graph

- Visualizes the knowledge graph that LightRAG uses for generation. 
- Nodes can be clicked for further information.

3. Session-based Chat Logging

- Stores user prompts, assistant responses, and timestamps in MongoDB.
- Supports multiple sessions per user.
- Chat history can be enabled or disabled per user settings.

4. Configurable User Options

Users can configure the behaviour of LightRAG by adjusting [queryParam](https://github.com/HKUDS/LightRAG/tree/main?tab=readme-ov-file#query-param) options:
- Language (en, de, fr, es) (Does not have an Impact as of now, english only)
- Query mode
- Timeout per request
- Custom prompt instructions
- LLM provider selection (HF / OpenRouter)

Settings are stored in the usermanagement collection.

5. Token Usage Logging

- Logs prompt and response token counts.
- Optionally stores raw API responses for auditing.
- Useful for cost tracking and model performance evaluation.

### TODOs:
- Sessions all have the same name, different names could be implemented
- The openrouter API allows streaming of information (you see progress while the prompt is processed) -> this could be implemented to improve user experience
- BUG: Graceful shutdown in the Backend is not working as of now (Killing the process works but should be avoided for future use)

## Installation Guide

Clone repository

### Frontend
- Navigate to Frontend
- pnpm install

### Backend

- Navigate to Backend (Make sure you have a virtual environment set up)
- Install requirements with `pip install -r requirements.txt`
- Install [MongoDB](https://www.mongodb.com/docs/manual/administration/install-community/?linux-distribution=ubuntu&linux-package=default&operating-system=linux&search-linux=with-search-linux)

- Install [LightRAG](https://github.com/HKUDS/LightRAG/tree/main)
    - RAGulate is built on the LightRAG framework.
    - First install LightRAG by following the instructions from their GitHub repository:

```bash
git clone https://github.com/HKUDS/LightRAG.git
cd LightRAG
pip install -e .
```
Refer to the LightRAG repository for additional installation details or troubleshooting.

#### Model Configuration
RAGulate uses the following LLMs:
mistralai/Mistral-7B-Instruct-v0.2 (Huggingface Model)
mistralai/mistral-nemo (Openrouter Model)

### How to start the Backend and Frontend
Start the Anaconda Virtual Environment LIGHTRAGENV before starting any python scripts
```
BACKEND!
#activate conda environment
conda activate LIGHTRAGENV
#start backend (/home/dbis-ai/Desktop/ChristiansWorkspace/RAGulate-Project/Backend)
python backend_api.py
```
```
FRONTEND!
#Navigate to Frontend Folder
npm run dev
```
When the project is finished maybe some website will be hosted, to access this project.
