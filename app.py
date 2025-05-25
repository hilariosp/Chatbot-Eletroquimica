# PilhIA - VERSÃO ULTRA LEVE PARA RENDER (< 512MB)

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import random
import json
import uuid
import time
from pathlib import Path
from collections import deque

app = Flask(__name__)
CORS(app)

# ===== CONFIGURAÇÃO MÍNIMA =====
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev_key')
api_keys_str = os.environ.get('OPENROUTER_API_KEYS', '')
API_KEYS = [key.strip() for key in api_keys_str.split(',') if key.strip()]

# ===== TENTATIVA DE IMPORT LLAMA-INDEX (CONDICIONAL) =====
LLAMA_INDEX_AVAILABLE = False
try:
    # Import apenas quando necessário, não no início
    pass
except Exception:
    pass

def lazy_import_llama():
    """Import lazy do LlamaIndex apenas quando necessário"""
    global LLAMA_INDEX_AVAILABLE
    if LLAMA_INDEX_AVAILABLE:
        return True
        
    try:
        global VectorStoreIndex, Document, Settings, OpenRouter
        from llama_index.core import VectorStoreIndex, Document, Settings
        from llama_index.llms.openrouter import OpenRouter
        
        # SEM EMBEDDING - Usa apenas o LLM
        LLAMA_INDEX_AVAILABLE = True
        return True
    except Exception as e:
        print(f"⚠️ LlamaIndex não disponível: {e}")
        return False

# ===== SISTEMA DE CHAT MINIMALISTA =====
class MiniChatManager:
    def __init__(self):
        self.chats = {}
        self.max_chats = 20  # Reduzido drasticamente
        
    def create_chat(self, chat_id=None):
        # Limpa chats se necessário
        if len(self.chats) >= self.max_chats:
            # Remove metade dos chats mais antigos
            old_chats = sorted(self.chats.items(), key=lambda x: x[1]['last_activity'])[:10]
            for chat_id, _ in old_chats:
                del self.chats[chat_id]
        
        if chat_id is None:
            chat_id = str(uuid.uuid4())[:6]  # ID bem pequeno
            
        if chat_id not in self.chats:
            self.chats[chat_id] = {
                'history': deque(maxlen=3),  # Apenas 3 mensagens
                'last_activity': time.time(),
                'count': 0
            }
        
        return chat_id
    
    def add_message(self, chat_id, user_msg, ai_msg):
        if chat_id in self.chats:
            # Limita tamanho das mensagens drasticamente
            user_msg = user_msg[:200] if len(user_msg) > 200 else user_msg
            ai_msg = ai_msg[:500] if len(ai_msg) > 500 else ai_msg
            
            self.chats[chat_id]['history'].append((user_msg, ai_msg))
            self.chats[chat_id]['last_activity'] = time.time()
            self.chats[chat_id]['count'] += 1

chat_manager = MiniChatManager()

# ===== SISTEMA DE QUESTÕES SIMPLIFICADO =====
def load_minimal_questions():
    """Carrega apenas algumas questões essenciais"""
    try:
        questoes_path = "documentos/questoes"
        if not Path(questoes_path).exists():
            return []
        
        questions = []
        # Carrega apenas 1 arquivo e máximo 10 questões
        files = [f for f in os.listdir(questoes_path) if f.endswith('.json')]
        if files:
            file_path = os.path.join(questoes_path, files[0])  # Apenas o primeiro arquivo
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                if isinstance(data, list):
                    questions = data[:10]  # Máximo 10 questões
                elif isinstance(data, dict):
                    questions = [data]
                    
            except Exception:
                pass
                
        return questions
    except Exception:
        return []

questions_list = load_minimal_questions()

# ===== FUNÇÕES DE PROCESSAMENTO LEVES =====
def create_simple_llm():
    """Cria LLM sem embeddings"""
    if not API_KEYS:
        return None
        
    if not lazy_import_llama():
        return None
    
    try:
        api_key = random.choice(API_KEYS)
        return OpenRouter(
            api_key=api_key,
            model="meta-llama/llama-3.2-1b-instruct:free",
            api_base="https://openrouter.ai/api/v1",
            temperature=0.5,
            max_tokens=800  # Reduzido
        )
    except Exception:
        return None

def load_simple_documents():
    """Carrega documentos como texto simples (sem embeddings)"""
    try:
        doc_path = "documentos/basededados"
        if not Path(doc_path).exists():
            return ""
        
        content = ""
        count = 0
        for file in os.listdir(doc_path):
            if count >= 3:  # Apenas 3 arquivos
                break
                
            if file.endswith(".txt"):
                try:
                    with open(os.path.join(doc_path, file), 'r', encoding='utf-8') as f:
                        file_content = f.read()[:2000]  # Apenas 2000 chars por arquivo
                        content += f"\n--- {file} ---\n{file_content}\n"
                        count += 1
                except Exception:
                    continue
                    
        return content[:8000]  # Máximo 8000 caracteres total
    except Exception:
        return ""

# Carrega documentos como texto simples
simple_docs = load_simple_documents()

def process_query_simple(user_input, chat_id):
    """Processa query de forma ultra simples"""
    user_lower = user_input.lower()
    
    # Questões
    if "questão" in user_lower or "questões" in user_lower:
        if questions_list:
            q = random.choice(questions_list)
            text = q.get('questao', '')
            alts = q.get('alternativas', {})
            
            result = f"{text}\n\n"
            for letter, option in list(alts.items())[:4]:  # Máximo 4 alternativas
                result += f"({letter.upper()}) {option}\n"
            return result[:800]  # Limita resposta
        return "Questões não disponíveis."
    
    # Consulta com LLM (sem embeddings)
    llm = create_simple_llm()
    if llm and simple_docs:
        try:
            # Prompt simples com contexto limitado
            context = simple_docs[:3000]  # Contexto bem limitado
            prompt = f"""Baseado neste contexto sobre eletroquímica:
{context}

Pergunta: {user_input[:300]}

Responda de forma concisa (máximo 3 parágrafos):"""
            
            # Chama o LLM diretamente (sem query engine para economizar memória)
            response = llm.complete(prompt)
            return str(response)[:800]  # Limita resposta
            
        except Exception as e:
            print(f"⚠️ Erro LLM: {e}")
    
    # Resposta padrão
    if "pilhia" in user_lower:
        return "Olá! Sou a PilhIA, sua assistente de eletroquímica. Como posso ajudar?"
    
    return "Desculpe, não consigo responder isso no momento. Tente perguntas sobre eletroquímica."

# ===== ROTAS MÍNIMAS =====
@app.route('/')
def home():
    return render_template("hub.html")

@app.route('/chatbot')
def chatbot():
    return render_template('index.html')

@app.route('/ping')
def ping():
    return "pong"

@app.route('/create_chat', methods=['POST'])
def create_chat():
    chat_id = chat_manager.create_chat()
    return jsonify({'chat_id': chat_id})

@app.route('/query', methods=['POST'])
def query():
    try:
        data = request.get_json()
        if not data or not data.get('query'):
            return jsonify({'error': 'Query vazia'}), 400
        
        user_input = data.get('query', '').strip()[:500]  # Limita entrada
        chat_id = data.get('chat_id')
        
        if not chat_id:
            chat_id = chat_manager.create_chat()
        elif chat_id not in chat_manager.chats:
            chat_id = chat_manager.create_chat(chat_id)
        
        # Processa query
        response = process_query_simple(user_input, chat_id)
        
        # Adiciona ao histórico
        chat_manager.add_message(chat_id, user_input, response)
        
        return jsonify({
            'answer': response,
            'chat_id': chat_id
        })
        
    except Exception as e:
        print(f"⚠️ Erro: {e}")
        return jsonify({'answer': 'Erro interno'}), 500

@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'chats': len(chat_manager.chats),
        'questions': len(questions_list),
        'llama_available': LLAMA_INDEX_AVAILABLE,
        'memory': 'optimized'
    })

# ===== CONFIGURAÇÃO PARA RENDER =====
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    
    print("🚀 PilhIA Ultra Leve")
    print(f"🌐 Porta: {port}")
    print(f"📊 APIs: {len(API_KEYS)}")
    print(f"📚 Questões: {len(questions_list)}")
    print(f"📖 Docs: {'✓' if simple_docs else '✗'}")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False,
        use_reloader=False,  # Desabilita reloader para economizar memória
        threaded=True
    )