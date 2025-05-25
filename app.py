# VERSÃO OTIMIZADA PARA RENDER - Memória Reduzida

from flask import Flask, request, jsonify, render_template, Blueprint
from flask_cors import CORS
import os
import random
import json
import uuid
import time
from pathlib import Path
from collections import deque
from datetime import datetime, timedelta

# ===== IMPORTS CONDICIONAIS PARA ECONOMIZAR MEMÓRIA =====
try:
    from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings, Document
    from llama_index.llms.openrouter import OpenRouter
    # EM VEZ DO MODELO PESADO, USE UM MAIS LEVE:
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding
    LLAMA_INDEX_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ LlamaIndex não disponível: {e}")
    LLAMA_INDEX_AVAILABLE = False

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {"origins": "*"},
    r"/query": {"origins": "*"},
    r"/create_chat": {"origins": "*"}
})

# ===== CONFIGURAÇÃO PARA RENDER =====
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev_key_change_in_production')

# Carrega chaves API
api_keys_str = os.environ.get('OPENROUTER_API_KEYS', '')
API_KEYS = [key.strip() for key in api_keys_str.split(',') if key.strip()]

def get_random_api_key():
    if not API_KEYS:
        print("⚠️ Nenhuma chave API configurada")
        return ""
    return random.choice(API_KEYS)

def create_llm_instance():
    api_key = get_random_api_key()
    if not api_key:
        return None
    
    return OpenRouter(
        api_key=api_key,
        model="meta-llama/llama-3.3-8b-instruct:free",
        api_base="https://openrouter.ai/api/v1",
        temperature=0.7,
        max_tokens=1500  # Reduzido para economizar
    )

# ===== CONFIGURAÇÃO DE EMBEDDING MAIS LEVE =====
def setup_lightweight_embeddings():
    """Configura embedding mais leve ou desabilita se necessário"""
    if not LLAMA_INDEX_AVAILABLE:
        return False
    
    try:
        # OPÇÃO 1: Modelo muito menor (recomendado para Render)
        Settings.embed_model = HuggingFaceEmbedding(
            model_name="sentence-transformers/all-MiniLM-L6-v2"  # Apenas ~23MB
        )
        return True
    except Exception as e:
        print(f"⚠️ Erro ao configurar embeddings: {e}")
        # OPÇÃO 2: Usar embedding OpenAI se disponível
        try:
            from llama_index.embeddings.openai import OpenAIEmbedding
            Settings.embed_model = OpenAIEmbedding()
            return True
        except:
            print("⚠️ Embeddings desabilitados - modo degradado")
            return False

# ===== SISTEMA DE CHAT SIMPLIFICADO =====
class ChatManager:
    def __init__(self):
        self.chats = {}
        self.max_chats = 50  # Limite para economizar memória
        self.max_history = 5  # Histórico menor
        
    def create_chat(self, chat_id=None):
        # Limpa chats antigos se necessário
        if len(self.chats) >= self.max_chats:
            self.cleanup_old_chats()
            
        if chat_id is None:
            chat_id = str(uuid.uuid4())[:8]  # ID menor
        
        if chat_id not in self.chats:
            self.chats[chat_id] = ChatSession(chat_id)
        
        return chat_id, self.chats[chat_id]
    
    def cleanup_old_chats(self):
        # Remove os 10 chats mais antigos
        if len(self.chats) > 10:
            sorted_chats = sorted(self.chats.items(), key=lambda x: x[1].last_activity)
            for chat_id, _ in sorted_chats[:10]:
                del self.chats[chat_id]

class ChatSession:
    def __init__(self, chat_id):
        self.chat_id = chat_id
        self.history = deque(maxlen=5)  # Histórico reduzido
        self.created_at = time.time()
        self.last_activity = time.time()
        self.message_count = 0
        
    def add_to_history(self, user_input, ai_response):
        # Limita tamanho das mensagens
        user_input = user_input[:500] if len(user_input) > 500 else user_input
        ai_response = ai_response[:1000] if len(ai_response) > 1000 else ai_response
        
        self.history.append((user_input, ai_response))
        self.last_activity = time.time()
        self.message_count += 1

# ===== INICIALIZAÇÃO =====
chat_manager = ChatManager()
embeddings_enabled = setup_lightweight_embeddings()

# Sistema de prompt simplificado
SIMPLE_SYSTEM_PROMPT = """
Você é PilhIA, assistente de eletroquímica. Seja conciso e claro.
- Para questões fora de eletroquímica, diga que não pode responder
- Se não souber, diga "Não sei responder isso"
- Mantenha respostas objetivas e educativas
"""

# ===== FUNÇÕES SIMPLIFICADAS =====
def load_simple_documents():
    """Carrega documentos de forma mais eficiente"""
    if not LLAMA_INDEX_AVAILABLE or not embeddings_enabled:
        return None
        
    try:
        doc_path = "documentos/basededados"
        if not Path(doc_path).exists():
            return None
            
        documents = []
        # Limita o número de documentos para economizar memória
        count = 0
        for file in os.listdir(doc_path):
            if count >= 10:  # Máximo 10 arquivos
                break
                
            if file.endswith(".txt"):
                file_path = os.path.join(doc_path, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()[:5000]  # Limita tamanho do conteúdo
                    
                    if content:
                        doc = Document(text=content, id_=file_path)
                        documents.append(doc)
                        count += 1
                        
                except Exception as e:
                    continue
        
        if documents:
            return VectorStoreIndex.from_documents(documents)
        return None
        
    except Exception as e:
        print(f"⚠️ Erro ao carregar documentos: {e}")
        return None

# Carrega índice simplificado
document_index = load_simple_documents()

def load_simple_questions():
    """Carrega questões de forma simplificada"""
    try:
        questoes_path = "documentos/questoes"
        if not Path(questoes_path).exists():
            return []
            
        questions = []
        # Limita quantidade de questões
        for filename in os.listdir(questoes_path)[:5]:  # Máximo 5 arquivos
            if filename.endswith(".json"):
                file_path = os.path.join(questoes_path, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    if isinstance(data, list):
                        questions.extend(data[:10])  # Máximo 10 questões por arquivo
                    elif isinstance(data, dict):
                        questions.append(data)
                        
                except Exception:
                    continue
                    
        return questions[:50]  # Máximo 50 questões total
        
    except Exception as e:
        print(f"⚠️ Erro ao carregar questões: {e}")
        return []

questions_list = load_simple_questions()

# ===== ROTAS PRINCIPAIS =====
@app.route('/')
def home():
    return render_template("hub.html")

@app.route('/chatbot')
def chatbot():
    return render_template('index.html')

@app.route('/create_chat', methods=['POST'])
def create_new_chat():
    chat_id, chat_session = chat_manager.create_chat()
    return jsonify({
        'chat_id': chat_id,
        'created_at': chat_session.created_at
    })

@app.route('/query', methods=['POST'])
def handle_query():
    try:
        data = request.get_json()
        if not data or not data.get('query'):
            return jsonify({'error': 'Query vazia'}), 400
            
        user_input = data.get('query', '').strip()[:1000]  # Limita entrada
        chat_id = data.get('chat_id')
        
        # Gerencia chat
        if not chat_id:
            chat_id, chat_session = chat_manager.create_chat()
        else:
            chat_session = chat_manager.chats.get(chat_id)
            if not chat_session:
                chat_id, chat_session = chat_manager.create_chat(chat_id)
        
        # Processamento simplificado
        response = process_simple_query(user_input, chat_session)
        
        # Adiciona ao histórico
        chat_session.add_to_history(user_input, response)
        
        return jsonify({
            'answer': response,
            'chat_id': chat_id,
            'message_count': chat_session.message_count
        })
        
    except Exception as e:
        print(f"⚠️ Erro: {e}")
        return jsonify({'error': 'Erro interno'}), 500

def process_simple_query(user_input, chat_session):
    """Processa query de forma simplificada"""
    user_lower = user_input.lower()
    
    # Questões
    if "questões" in user_lower or "questão" in user_lower:
        if questions_list:
            question = random.choice(questions_list)
            return format_question(question)
        return "Não há questões disponíveis."
    
    # Consulta com IA (se disponível)
    if document_index and LLAMA_INDEX_AVAILABLE:
        try:
            llm = create_llm_instance()
            if llm:
                llm.system_prompt = SIMPLE_SYSTEM_PROMPT
                query_engine = document_index.as_query_engine(
                    streaming=False,
                    similarity_top_k=2,
                    llm=llm
                )
                
                response = query_engine.query(user_input)
                return str(response)[:1500]  # Limita resposta
        except Exception as e:
            print(f"⚠️ Erro na consulta: {e}")
    
    # Resposta padrão
    return "Desculpe, não consigo responder isso no momento. Tente uma pergunta sobre eletroquímica."

def format_question(question_data):
    """Formata questão de forma simples"""
    try:
        text = question_data.get('questao', '')
        alternatives = question_data.get('alternativas', {})
        
        formatted = f"{text}\n\n"
        for letter, option in alternatives.items():
            formatted += f"({letter.upper()}) {option}\n"
            
        return formatted
    except:
        return "Erro ao carregar questão."

# ===== ROTAS ADICIONAIS =====
@app.route('/clear_history', methods=['POST'])
def clear_history():
    data = request.get_json()
    chat_id = data.get('chat_id') if data else None
    
    if chat_id and chat_id in chat_manager.chats:
        chat_manager.chats[chat_id].history.clear()
        return jsonify({'status': 'Histórico limpo'})
    
    return jsonify({'error': 'Chat não encontrado'}), 404

@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint de saúde para monitoramento"""
    return jsonify({
        'status': 'healthy',
        'embeddings': embeddings_enabled,
        'llama_index': LLAMA_INDEX_AVAILABLE,
        'active_chats': len(chat_manager.chats),
        'questions_loaded': len(questions_list)
    })

# ===== INICIALIZAÇÃO DO SERVIDOR =====
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    
    print("🚀 Iniciando PilhIA (Versão Otimizada)")
    print(f"📊 API Keys: {len(API_KEYS)}")
    print(f"📚 Questões: {len(questions_list)}")
    print(f"🤖 LlamaIndex: {'✓' if LLAMA_INDEX_AVAILABLE else '✗'}")
    print(f"🔍 Embeddings: {'✓' if embeddings_enabled else '✗'}")
    print(f"📖 Documentos: {'✓' if document_index else '✗'}")
    
    # IMPORTANTE: debug=False em produção
    app.run(
        debug=False,  # Desabilita debug em produção
        host='0.0.0.0', 
        port=port,
        threaded=True  # Melhora performance
    )