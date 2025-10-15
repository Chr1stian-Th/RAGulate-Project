from flask import Flask, request, jsonify, send_file, Response
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
import os
import json
from datetime import datetime
import uuid
from werkzeug.utils import secure_filename
from backend_generate_prompt import generate_output  # async inside; we will run on a shared loop
from backend_documents import insert_uploaded_files_to_rag, read_kv_store_status
import asyncio
from concurrent.futures import TimeoutError as FuturesTimeout
from pymongo import MongoClient
import signal
import threading
import atexit

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

_loop = None
_loop_thread = None
_LOOP_STOP = threading.Event()

def _loop_worker():
    """
    Creates and runs a new asyncio event loop in a separate thread.
    This loop is used for handling asynchronous operations throughout the application.
    """
    global _loop
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    _loop.run_forever()

def ensure_loop_started():
    """
    Ensures that the asyncio event loop is running in a background thread.
    Creates a new loop thread if one doesn't exist or if the existing thread is not alive.
    """
    global _loop_thread
    if _loop_thread and _loop_thread.is_alive():
        return
    _loop_thread = threading.Thread(target=_loop_worker, name="asyncio-loop", daemon=True)
    _loop_thread.start()

def run_async(coro, *, timeout=None):
    """
    Runs an asynchronous coroutine on the persistent event loop with an optional timeout.

    Args:
        coro: The coroutine to run
        timeout (float, optional): Maximum execution time in seconds

    Returns:
        The result of the coroutine execution

    Raises:
        TimeoutError: If the execution exceeds the specified timeout
        Exception: Any exception raised within the coroutine
    """
    ensure_loop_started()
    fut = asyncio.run_coroutine_threadsafe(coro, _loop)
    try:
        return fut.result(timeout=timeout)
    except FuturesTimeout:
        fut.cancel()
        raise TimeoutError(f"Async task exceeded timeout of {timeout} seconds")
    except Exception as e:
        # Unwrap exceptions raised inside the coroutine
        raise e

def _graceful_shutdown(*_args):
    """
    Handles graceful shutdown of the asyncio event loop.
    Called when receiving SIGINT or SIGTERM signals, or during normal program exit.
    """
    try:
        if _loop and _loop.is_running():
            _loop.call_soon_threadsafe(_loop.stop)
    finally:
        _LOOP_STOP.set()

# Register clean exit
signal.signal(signal.SIGINT, _graceful_shutdown)
signal.signal(signal.SIGTERM, _graceful_shutdown)
atexit.register(_graceful_shutdown)


UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'doc', 'docx', 'csv', 'xlsx'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
# Separate limit for the /api/documents/insert endpoint
MAX_DOCS_PER_INSERT = int(os.getenv('RAG_MAX_DOCS_PER_INSERT', '1'))

# Path for LightRAG's kv store status
KV_STATUS_PATH = "/home/dbis-ai/Desktop/ChristiansWorkspace/RAGulate-Project/Data/kv_store_doc_status.json"

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


def allowed_file(filename):
    """
    Checks if a given filename has an allowed extension.

    Args:
        filename (str): Name of the file to check

    Returns:
        bool: True if file extension is allowed, False otherwise
    """
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_gdpr_response(message, session_id, timeout_s: int):
    """
    Generates a GDPR-related response using the RAG system.

    Args:
        message (str): User's input message
        session_id (str): Unique session identifier
        timeout_s (int): Timeout in seconds for the response generation

    Returns:
        str: Generated response from the RAG system

    Raises:
        TimeoutError: If response generation exceeds timeout
    """
    return run_async(generate_output(message, session_id), timeout=timeout_s)


@app.route('/api/register', methods=['POST'])
def register():
    """
    Handles user registration with username and password.

    Request Body:
        JSON with username and password fields

    Returns:
        JSON response with success message or error details
        201: Registration successful
        400: Missing credentials
        409: Username already exists
        500: Server error
    """
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
    """
    Handles user authentication.

    Request Body:
        JSON with username and password fields

    Returns:
        JSON response with success message or error details
        200: Login successful
        400: Missing credentials
        401: Invalid password
        404: User not found
        500: Server error
    """
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

@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Handles chat messages and generates AI responses using RAG system.

    Request Body:
        JSON with:
        - message: User's input text
        - sessionId: Session identifier (optional)
        - userName: User's name
        - timestamp: Message timestamp (optional)

    Returns:
        JSON with:
        - answer: AI generated response
        - sessionId: Session identifier
        - timestamp: Response timestamp
        
    Notes:
        - Creates new sessions for users if needed
        - Logs both user messages and AI responses
        - Supports configurable timeout per user
    """
    try:
        data = request.get_json(force=True)  # parses JSON body
        message = data.get('message', '')
        session_id = data.get('sessionId', str(uuid.uuid4()))
        timestamp = data.get('timestamp', datetime.now().isoformat())
        user_name = data.get('userName', '')

        # Determine timeout per request: from stored options if available
        user_doc = user_collection.find_one({"username": user_name}, {"_id": 0, "options": 1})
        timeout_s = int(((user_doc or {}).get("options") or {}).get("timeout", 180))
        if timeout_s < 5 or timeout_s > 600:
            timeout_s = 180

        # If this session is new for the user, attach it
        if not user_collection.find_one({"username": user_name, "session_list": session_id}):
            exists = collection.find_one({"session_id": session_id}, {"_id": 1}) is not None
            if not exists:
                user_collection.update_one(
                    {"username": user_name},
                    {"$addToSet": {"session_list": session_id}},
                    upsert=True
                )

        # Log user message
        user_data = {
            'role': 'user',
            'content': message,
            'timestamp': timestamp,
            'session_id': session_id,
            'user_name': user_name
        }
        result_user = collection.insert_one(user_data)
        print("Inserted Doc ID:", result_user.inserted_id)

        # Generate LLM response (on persistent loop)
        ai_response = generate_gdpr_response(message, session_id, timeout_s)

        # Store assistant response
        assistant_message = {
            'role': 'assistant',
            'content': ai_response,
            'timestamp': datetime.now().isoformat(),
            'session_id': session_id,
            'user_name': user_name
        }
        result_assistant = collection.insert_one(assistant_message)
        print("Inserted Doc ID:", result_assistant.inserted_id)

        return jsonify({
            'answer': ai_response,
            'sessionId': session_id,
            'timestamp': datetime.now().isoformat(),
        })

    except TimeoutError as te:
        return jsonify({'error': 'timeout', 'details': str(te)}), 504
    except Exception as e:
        print(f"Error processing chat request: {str(e)}")
        return jsonify({
            'error': 'Failed to process request',
            'details': str(e)
        }), 500

@app.route('/api/documents/insert', methods=['POST'])
def api_documents_insert():
    """
    Handles document uploads and insertion into the RAG system.

    Request:
        multipart/form-data with files (keys starting with 'file')

    Returns:
        JSON with insertion summary or error details
        200: Upload and insertion successful
        400: No valid files uploaded
        500: Server error
        504: Operation timeout

    Notes:
        - Supports multiple file uploads
        - Enforces file type restrictions
        - Limits number of documents per insert
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

        summary = run_async(insert_uploaded_files_to_rag(incoming_files, MAX_DOCS_PER_INSERT), timeout=900)

        return jsonify({'message': 'Insertion completed.', 'summary': summary}), 200

    except TimeoutError as te:
        return jsonify({'error': 'timeout', 'details': str(te)}), 504
    except Exception as e:
        print(f"Error in /api/documents/insert: {str(e)}")
        return jsonify({'error': 'Failed to insert documents', 'details': str(e)}), 500

@app.route('/api/documents/list', methods=['GET'])
def api_documents_list():
    """
    Retrieves list of documents currently in the RAG system.

    Returns:
        JSON with:
        - List of documents and their metadata
        - Sorted by update timestamp (newest first)
        
    Status Codes:
        200: Success
        404: Status file not found
        500: Server error
    """
    content = read_kv_store_status(KV_STATUS_PATH)
    if isinstance(content, dict) and 'error' in content:
        status_code = 404 if content.get('error') == 'status_file_not_found' else 500
        return jsonify(content), status_code

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
                    return datetime.fromisoformat(ts.replace('Z', '+00:00'))
                except Exception:
                    pass
            return datetime.min

        items.sort(key=parse_updated_at, reverse=True)
        return jsonify({'documents': items}), 200
    except Exception as e:
        print(f"Error transforming kv store status: {e}")
        return jsonify({'error': 'status_transform_error', 'details': str(e)}), 500

@app.route('/api/sessions/<session_id>', methods=['GET'])
def get_session(session_id):
    """
    Retrieves all messages for a specific chat session.

    Args:
        session_id (str): Unique identifier for the chat session

    Returns:
        JSON with:
        - List of messages in chronological order
        - Each message contains role, content, timestamp

    Status Codes:
        200: Session found and returned
        404: Session not found
    """
    results = list(collection.find({"session_id": session_id}).sort("timestamp", 1))
    for result in results:
        result["_id"] = str(result["_id"])
    if results:
        return jsonify(results)
    else:
        return jsonify({'error': 'Session not found'}), 404

@app.route('/api/sessions', methods=['GET'])
def list_sessions():
    """
    Retrieves all chat sessions for a specific user.

    Query Parameters:
        username (str): Username to fetch sessions for

    Returns:
        JSON with:
        - List of session IDs belonging to the user

    Status Codes:
        200: Sessions retrieved successfully
        400: Missing username parameter
    """
    username = request.args.get('username')
    if not username:
        return jsonify({'error': 'username query parameter is required'}), 400

    doc = user_collection.find_one({'username': username}, {'_id': 0, 'session_list': 1})
    sessions = doc.get('session_list', []) if doc else []
    return jsonify({'sessions': sessions})

@app.route('/health', methods=['GET'])
def health_check():
    """
    Basic health check endpoint for monitoring system status.

    Returns:
        JSON with:
        - Current status
        - Timestamp
        - Configuration values
        
    Used for:
        - Load balancer health checks
        - System monitoring
        - Configuration verification
    """
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'max_docs_per_insert': MAX_DOCS_PER_INSERT
    })

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    """
    Stores user feedback for specific chat responses.

    Request Body:
        JSON with:
        - object_id: ID of the message being rated
        - feedback: Rating value ("good" or "bad")

    Returns:
        JSON confirmation or error message

    Status Codes:
        200: Feedback saved successfully
        404: Message not found
        500: Server error
    """
    try:
        data = request.get_json()
        object_id = data.get('object_id')
        feedback = data.get('feedback')

        result = collection.update_one({'content': object_id}, {'$set': {'feedback': feedback}})

        if result.matched_count == 0:
            return jsonify({'error': 'Document not found.'}), 404

        return jsonify({'message': 'Feedback saved successfully.'}), 200

    except Exception as e:
        print(f"Error in /api/feedback: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500

GRAPHML_PATH = "/home/dbis-ai/Desktop/ChristiansWorkspace/RAGulate-Project/Data/graph_chunk_entity_relation.graphml"
@app.route('/api/graph', methods=['GET'])
def get_graphml():
    """
    Serves the knowledge graph visualization data.

    Returns:
        GraphML format data for visualization
        
    Notes:
        - Returns plain text GraphML file
        - Used for knowledge graph visualization in frontend
        - Graph shows entity relationships in the knowledge base

    Status Codes:
        200: Graph data returned successfully
        404: Graph file not found
        500: Server error
    """
    try:
        with open(GRAPHML_PATH, 'r', encoding='utf-8') as f:
            graphml_content = f.read()
        return Response(graphml_content, mimetype='text/plain')
    except FileNotFoundError:
        return jsonify({'error': 'GraphML file not found.'}), 404
    except Exception as e:
        print(f"Error in /api/graph: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500

DEFAULT_OPTIONS = {
    "chatHistory": False,
    "language": "en",
    "timeout": 30,
    "customPrompt": ""
}

_ALLOWED_LANGS = {"en", "es", "fr", "de"}
_TIMEOUT_MIN = 5
_TIMEOUT_MAX = 300
_ALLOWED_MODES = {"local", "global", "hybrid", "naive", "mix"}

def _normalize_options(opts: dict) -> dict:
    """
    Normalizes and validates user options for the chat system.

    Args:
        opts (dict): Raw options dictionary from user input

    Returns:
        dict: Normalized options with validated values and defaults where necessary

    Notes:
        Validates and normalizes:
        - Chat history preference
        - Language selection
        - Query mode
        - Timeout duration
        - Custom prompt
        - Response Type
        - LLM provider
    """
    if not isinstance(opts, dict):
        opts = {}

    chat_history = bool(opts.get("chatHistory", DEFAULT_OPTIONS["chatHistory"]))
    language = opts.get("language", DEFAULT_OPTIONS["language"])
    language = language if language in _ALLOWED_LANGS else DEFAULT_OPTIONS["language"]

    queryMode = opts.get("queryMode", DEFAULT_OPTIONS.get("queryMode", "naive"))
    queryMode = queryMode if queryMode in _ALLOWED_MODES else DEFAULT_OPTIONS.get("queryMode", "naive")

    timeout = opts.get("timeout", DEFAULT_OPTIONS["timeout"])
    try:
        timeout = int(timeout)
    except Exception:
        timeout = DEFAULT_OPTIONS["timeout"]
    timeout = max(_TIMEOUT_MIN, min(_TIMEOUT_MAX, timeout))

    custom_prompt = opts.get("customPrompt", DEFAULT_OPTIONS["customPrompt"])
    if not isinstance(custom_prompt, str):
        custom_prompt = DEFAULT_OPTIONS["customPrompt"]

    responseType = opts.get("responseType", "Multiple Paragraphs")

    llm_provider = opts.get("llmProvider", "hf")
    llm_provider = llm_provider if llm_provider in {"hf", "openrouter"} else "hf"

    return {
        "chatHistory": chat_history,
        "language": language,
        "queryMode": queryMode,
        "timeout": timeout,
        "customPrompt": custom_prompt,
        "responseType": responseType,
        "llmProvider": llm_provider,
    }

@app.route('/getOptions', methods=['GET'])
def get_options():
    """
    Retrieves user-specific chat configuration options.

    Query Parameters:
        username (str): User to get options for

    Returns:
        JSON with user preferences:
        - Chat history enabled/disabled
        - Language selection
        - Query mode
        - Response timeout
        - Custom prompt
        - LLM provider

    Notes:
        Returns default options if user has no saved preferences
    """
    username = request.args.get('username', '').strip()
    if not username:
        return jsonify({"error": "username query parameter is required"}), 400

    user = user_collection.find_one({"username": username}, {"_id": 0, "options": 1})
    if not user or "options" not in user:
        return jsonify(DEFAULT_OPTIONS), 200
    return jsonify(_normalize_options(user["options"])), 200

@app.route('/setOptions', methods=['POST'])
def set_options():
    """
    Updates user-specific chat configuration options.

    Request Body:
        JSON with:
        - username: User to update options for
        - options: Dictionary of option values to set

    Returns:
        JSON with:
        - Confirmation message
        - Normalized options that were saved

    Notes:
        - Validates and normalizes all incoming options
        - Creates user profile if it doesn't exist
        - Preserves existing options not included in update
    """
    try:
        data = request.get_json(force=True) or {}
        username = (data.get("username") or "").strip()
        options_in = data.get("options", {})

        if not username:
            return jsonify({"error": "username is required"}), 400

        options_clean = _normalize_options(options_in)

        user_collection.update_one(
            {"username": username},
            {"$set": {"options": options_clean}},
            upsert=True
        )

        return jsonify({"message": "Options saved.", "options": options_clean}), 200
    except Exception as e:
        print(f"Error in /setOptions: {e}")
        return jsonify({"error": "failed_to_set_options", "details": str(e)}), 500

if __name__ == '__main__':
    print("Starting GDPR Chatbot Backend Server...")
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print(f"Allowed file extensions: {ALLOWED_EXTENSIONS}")
    print(f"Max docs per insert to LightRAG: {MAX_DOCS_PER_INSERT}")
    ensure_loop_started()
    app.run(host='134.60.71.197', port=8000, debug=False, use_reloader=False)