from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from datetime import datetime
import uuid
from werkzeug.utils import secure_filename
from backend_generate_prompt import generate_output
import asyncio
from pymongo import MongoClient
import signal

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'doc', 'docx', 'csv', 'xlsx'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017/")

# Select database and collection
db = client["RAGulate"]  
collection = db["chatlogs"]

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_gdpr_response(message, files=None):

    # Run async RAG query in sync Flask context
    loop = asyncio.get_event_loop()
    if loop.is_running():
        response = asyncio.ensure_future(generate_output(message))
    else:
        response = loop.run_until_complete(generate_output(message))
    
    return response.result() if hasattr(response, 'result') else response

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        # Get form data
        message = request.form.get('message', '')
        session_id = request.form.get('sessionId', str(uuid.uuid4()))
        timestamp = request.form.get('timestamp', datetime.now().isoformat())
        
        # Handle uploaded files
        uploaded_files = []
        for key in request.files:
            if key.startswith('file_'):
                file = request.files[key]
                if file and file.filename and allowed_file(file.filename):
                    filename = secure_filename(file.filename)
                    # Add timestamp to avoid filename conflicts
                    unique_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
                    file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                    file.save(file_path)
                    
                    uploaded_files.append({
                        'name': filename,
                        'path': file_path,
                        'size': os.path.getsize(file_path),
                        'type': file.content_type
                    })
        
        #session id + role + content + timestamp + Files processed 
        # TODO add identifier behind user once user management is implemented (also for assistant; for chat history with multiple users)
        #user message
        user_data = {
            'role': 'user',
            'content': message,
            'timestamp': timestamp,
            'files': uploaded_files,
            'session_id': session_id
        }
        #Insert Data
        result_user = collection.insert_one(user_data)

        #Show the inserted Document ID
        print("Inserted Doc ID:", result_user.inserted_id)
        
        # Generate LLM response
        #TODO add session id + identifier to this, so only your own queries are used for conversation history; needed in backeng_generate_prompt.py
        ai_response = generate_gdpr_response(message, uploaded_files)
        
        #session id + role + content + timestamp
        # Add LLM response to database
        assistant_message = {
            'role': 'assistant',
            'content': ai_response,
            'timestamp': datetime.now().isoformat(),
            'session_id': session_id
        }
        #Insert Data
        result_assistant = collection.insert_one(assistant_message)

        #Show the inserted Document ID
        print("Inserted Doc ID:", result_assistant.inserted_id)
        
        return jsonify({
            'answer': ai_response,
            'sessionId': session_id,
            'timestamp': datetime.now().isoformat(),
            'filesProcessed': len(uploaded_files)
        })
        
    except Exception as e:
        print(f"Error processing chat request: {str(e)}")
        return jsonify({
            'error': 'Failed to process request',
            'details': str(e)
        }), 500

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
    """List all chat sessions"""
    unique_sessions = db.sessions.distinct("session_id")
    return jsonify({'sessions': unique_sessions})

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    try:
        data = request.get_json()
        object_id = data.get('object_id')
        feedback = data.get('feedback')

        #print(object_id)

        # Update the document
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

if __name__ == '__main__':
    print("Starting GDPR Chatbot Backend Server...")
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print(f"Allowed file extensions: {ALLOWED_EXTENSIONS}")
    app.run(host='134.60.71.197', port=8000)