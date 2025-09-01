from flask import Flask, request, jsonify, send_file, Response
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
import os
import json
from datetime import datetime
import uuid
from werkzeug.utils import secure_filename
from backend_generate_prompt import generate_output
from backend_documents import insert_uploaded_files_to_rag, read_kv_store_status
import asyncio
from pymongo import MongoClient
import signal

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'doc', 'docx', 'csv', 'xlsx'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
# Separate limit for the /api/documents/insert endpoint
MAX_DOCS_PER_INSERT = int(os.getenv('RAG_MAX_DOCS_PER_INSERT', '1'))

# Path for LightRAG's kv store status
KV_STATUS_PATH = "/home/dbisai/Desktop/ChristiansWorkspace/RAGulate/Data/kv_store_doc_status.json"

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017/")

db = client["RAGulate"]
# Collection for chat logs
collection = db["chatlogs"]
# Collection for user management
user_collection = db["usermanagement"]

@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'error': 'Username and password required.'}), 400

        # Check if username already exists
        if user_collection.find_one({'username': username}):
            return jsonify({'error': 'Username is already taken.'}), 409

        # Hash the password
        hashed_password = generate_password_hash(password)

        # Insert new user
        user_collection.insert_one({
            'username': username,
            'password': hashed_password
        })

        return jsonify({'message': 'User registered successfully.'}), 201

    except Exception as e:
        print(f"Error in /api/register: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500
    
@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'error': 'Username and password required.'}), 400

        user = user_collection.find_one({'username': username})

        if not user:
            return jsonify({'error': 'User not found.'}), 404

        # Verify password
        if not check_password_hash(user['password'], password):
            return jsonify({'error': 'Invalid password.'}), 401

        return jsonify({'message': 'Login successful.'}), 200

    except Exception as e:
        print(f"Error in /api/login: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_gdpr_response(message, session_id):
    # Run async RAG query in sync Flask context
    loop = asyncio.get_event_loop()
    if loop.is_running():
        response_task = asyncio.ensure_future(generate_output(message, session_id))
        return response_task.result()
    else:
        return loop.run_until_complete(generate_output(message, session_id))

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        # Get form data
        message = request.form.get('message', '')
        session_id = request.form.get('sessionId', str(uuid.uuid4()))
        timestamp = request.form.get('timestamp', datetime.now().isoformat())
        user_name = request.form.get('userName', '')

        # Check if a new session was created
        # If session_id is new, create a new session entry for this user
        if not db.sessions.find_one({"session_id": session_id}):
            # Check if session_id already exists
            exists = collection.find_one({"session_id": session_id}, {"_id": 1}) is not None
            if not exists:
                user_collection.update_one(
                    {"username": user_name},
                    {"$addToSet": {"session_list": session_id}},
                    upsert=True
                )
        
        #user message
        user_data = {
            'role': 'user',
            'content': message,
            'timestamp': timestamp,
            'session_id': session_id,
            'user_name': user_name
        }
        #Insert Data
        result_user = collection.insert_one(user_data)

        #Show the inserted Document ID
        print("Inserted Doc ID:", result_user.inserted_id)
        
        # Generate LLM response
        ai_response = generate_gdpr_response(message, session_id)
        
        # Add LLM response to database
        assistant_message = {
            'role': 'assistant',
            'content': ai_response,
            'timestamp': datetime.now().isoformat(),
            'session_id': session_id,
            'user_name': user_name
        }
        #Insert Data
        result_assistant = collection.insert_one(assistant_message)

        #Show the inserted Document ID
        print("Inserted Doc ID:", result_assistant.inserted_id)
        
        return jsonify({
            'answer': ai_response,
            'sessionId': session_id,
            'timestamp': datetime.now().isoformat(),
        })
        
    except Exception as e:
        print(f"Error processing chat request: {str(e)}")
        return jsonify({
            'error': 'Failed to process request',
            'details': str(e)
        }), 500

@app.route('/api/documents/insert', methods=['POST'])
def api_documents_insert():
    """
    Upload file(s) and insert up to MAX_DOCS_PER_INSERT into LightRAG.
    Accepts multipart/form-data with one or more files; we look for keys starting with 'file'.
    """
    try:
        incoming_files = []
        for key in request.files:
            if key.startswith('file'):
                f = request.files[key]
                if f and f.filename and allowed_file(f.filename):
                    filename = secure_filename(f.filename)
                    unique_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
                    file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                    f.save(file_path)
                    incoming_files.append({
                        'name': filename,
                        'path': file_path,
                        'size': os.path.getsize(file_path),
                        'type': f.content_type
                    })

        if not incoming_files:
            return jsonify({'error': 'No valid files uploaded.'}), 400

        # Run the async insertion
        loop = asyncio.get_event_loop()
        if loop.is_running():
            task = asyncio.ensure_future(insert_uploaded_files_to_rag(incoming_files, MAX_DOCS_PER_INSERT))
            summary = task.result()
        else:
            summary = loop.run_until_complete(insert_uploaded_files_to_rag(incoming_files, MAX_DOCS_PER_INSERT))

        return jsonify({'message': 'Insertion completed.', 'summary': summary}), 200

    except Exception as e:
        print(f"Error in /api/documents/insert: {str(e)}")
        return jsonify({'error': 'Failed to insert documents', 'details': str(e)}), 500

@app.route('/api/documents/list', methods=['GET'])
def api_documents_list():
    """
    Return the contents of LightRAG's kv_store_doc_status.json.
    """
    content = read_kv_store_status(KV_STATUS_PATH)
    # Handle read errors directly
    if isinstance(content, dict) and 'error' in content:
        status_code = 404 if content.get('error') == 'status_file_not_found' else 500
        return jsonify(content), status_code

    # Transform: omit large 'content' field and sort by 'updated_at'
    try:
        items = []
        if isinstance(content, dict):
            for doc_id, meta in content.items():
                if isinstance(meta, dict):
                    filtered = {k: v for k, v in meta.items() if k != 'content'}
                    filtered['doc_id'] = doc_id
                    items.append(filtered)

        def parse_updated_at(entry):
            ts = entry.get('updated_at')
            if isinstance(ts, str):
                try:
                    # Support both Z and offset ISO strings
                    return datetime.fromisoformat(ts.replace('Z', '+00:00'))
                except Exception:
                    pass
            # Put entries with missing/invalid timestamp at the beginning of the list when sorting descending by returning minimal time
            return datetime.min

        # Sort by updated_at descending (newest first)
        items.sort(key=parse_updated_at, reverse=True)
        return jsonify({'documents': items}), 200
    except Exception as e:
        print(f"Error transforming kv store status: {e}")
        return jsonify({'error': 'status_transform_error', 'details': str(e)}), 500

@app.route('/api/sessions/<session_id>', methods=['GET'])
def get_session(session_id):
    """Get chat session history"""
    results = list(collection.find(
        {"session_id": session_id}).sort("timestamp", 1) # 1 = ascending, -1 = descending
    )
    # Convert ObjectId to string
    for result in results:
        result["_id"] = str(result["_id"])

    if results: 
        return jsonify(results)
    else:
        return jsonify({'error': 'Session not found'}), 404

@app.route('/api/sessions', methods=['GET'])
def list_sessions():
    """List all chat session_ids of a user from user_collection"""
    username = request.args.get('username')
    if not username:
        return jsonify({'error': 'username query parameter is required'}), 400

    # Get session list and send it back
    doc = user_collection.find_one(
        {'username': username},
        {'_id': 0, 'session_list': 1}
    )
    sessions = doc.get('session_list', []) if doc else []
    return jsonify({'sessions': sessions})

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'max_docs_per_insert': MAX_DOCS_PER_INSERT
    })

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    try:
        data = request.get_json()
        object_id = data.get('object_id')
        feedback = data.get('feedback')

        result = collection.update_one(
            {'content': object_id},
            {'$set': {'feedback': feedback}}
        )

        if result.matched_count == 0:
            return jsonify({'error': 'Document not found.'}), 404

        return jsonify({'message': 'Feedback saved successfully.'}), 200

    except Exception as e:
        print(f"Error in /api/feedback: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500

#GRAPHML_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Data', 'graph_chunk_entity_relation.graphml')
GRAPHML_PATH = "/home/dbisai/Desktop/ChristiansWorkspace/RAGulate/Data/graph_chunk_entity_relation.graphml"
@app.route('/api/graph', methods=['GET'])
def get_graphml():
    #Send GraphML file as plain text for frontend parsing.
    try:
        with open(GRAPHML_PATH, 'r', encoding='utf-8') as f:
            graphml_content = f.read()
        return Response(graphml_content, mimetype='text/plain')
    except FileNotFoundError:
        return jsonify({'error': 'GraphML file not found.'}), 404
    except Exception as e:
        print(f"Error in /api/graph: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500

if __name__ == '__main__':
    print("Starting GDPR Chatbot Backend Server...")
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print(f"Allowed file extensions: {ALLOWED_EXTENSIONS}")
    print(f"Max docs per insert to LightRAG: {MAX_DOCS_PER_INSERT}")
    app.run(host='134.60.71.197', port=8000)
