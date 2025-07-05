# RAGulate - LegalQA Chatbot

## Overview  
RAGulate is a Masters project implementing a Legal Question-Answering chatbot using Retrieval-Augmented Generation (RAG) technology. This system combines the [LightRAG framework](https://github.com/HKUDS/LightRAG) with the Mistral-7B LLM to provide accurate, context-aware answers to legal questions.


## Tech Stack

<p align="left">
<img src="https://skillicons.dev/icons?i=next,react,mongodb,ts,tailwind"/>
</p>

- [Next.js](https://nextjs.org/) (App Router)
- [React](https://react.dev/)
- [MongoDB](https://www.mongodb.com/) (Database)
- [Tailwind CSS](https://tailwindcss.com/) (UI Styling)

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
BACKEND!
#activate conda environment
conda activate LIGHTRAGENV
#start backend
python backend_api.py
```
```
FRONTEND!
#Navigate to Frontend Folder
npm run dev
```
When the project is finished maybe some website will be hosted, to access this project.
