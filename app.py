from flask import Flask, request, jsonify, render_template, Blueprint
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings, Document
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openrouter import OpenRouter
from flask_cors import CORS
from pathlib import Path
from collections import deque
import os
import random
import json
import uuid
import time
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# --- INÍCIO DAS ALTERAÇÕES PARA DEPLOY NO RENDER ---

# Configura a chave secreta do Flask a partir de uma variável de ambiente.
# É CRÍTICO que esta chave seja definida no ambiente de produção (Render).
# O valor 'uma_chave_secreta_fallback_para_dev' é apenas para desenvolvimento local,
# NUNCA use um valor fixo e simples em produção!
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'uma_chave_secreta_fallback_para_dev')

# Carrega as chaves de API a partir de uma variável de ambiente.
# No Render, você deve definir uma variável de ambiente chamada 'OPENROUTER_API_KEYS'
# com suas chaves separadas por vírgula (ex: "chave1,chave2,chave3").
# Se a variável não estiver definida, a lista ficará vazia.
api_keys_str = os.environ.get('OPENROUTER_API_KEYS', '')
API_KEYS = [key.strip() for key in api_keys_str.split(',') if key.strip()]

def get_random_api_key():
    """Retorna uma chave API aleatória da lista carregada das variáveis de ambiente."""
    if not API_KEYS:
        # Em produção, isso deve ser tratado como um erro grave.
        # Para desenvolvimento, você pode adicionar um print ou log.
        print("⚠️ Nenhuma chave API OpenRouter configurada. Verifique a variável de ambiente 'OPENROUTER_API_KEYS'.")
        # Retorna uma string vazia ou levanta um erro, dependendo de como você quer lidar com isso.
        return "" 
    return random.choice(API_KEYS)

def create_llm_instance():
    """Cria uma nova instância do LLM com chave aleatória."""
    # Garante que a chave API seja obtida a cada nova instância, caso haja rotação.
    api_key_for_llm = get_random_api_key()
    if not api_key_for_llm:
        # Se não houver chave, pode ser necessário levantar um erro ou retornar None.
        # Depende de como você quer que o sistema se comporte sem uma chave válida.
        print("Erro: Não foi possível criar instância do LLM, chave API ausente.")
        return None 

    return OpenRouter(
        api_key=api_key_for_llm,
        model="meta-llama/llama-3.3-8b-instruct:free",
        api_base="https://openrouter.ai/api/v1",
        temperature=0.7,
        max_tokens=2000
    )

# --- FIM DAS ALTERAÇÕES PARA DEPLOY NO RENDER ---


# Criação do Blueprint para rotas públicas
public_bp = Blueprint('public', __name__)

@public_bp.route('/')
def home():
    return render_template("hub.html")

@public_bp.route('/chatbot')
def chatbot():
    return render_template('index.html')

@public_bp.route('/contato')
def contato():
    return render_template('contato.html')

@public_bp.route('/recursos')
def recursos():
    return render_template('recursos.html')

@public_bp.route('/sobre')
def sobre():
    return render_template('sobre.html')

app.register_blueprint(public_bp)

# ===== SISTEMA DE GERENCIAMENTO DE CHATS =====
class ChatManager:
    def __init__(self):
        self.chats = {}  # {chat_id: ChatSession}
        self.cleanup_interval = 3600  # 1 hora em segundos
        self.max_inactive_time = 7200  # 2 horas em segundos
        
    def create_chat(self, chat_id=None):
        """Cria um novo chat ou retorna um existente"""
        if chat_id is None:
            chat_id = str(uuid.uuid4())
        
        if chat_id not in self.chats:
            self.chats[chat_id] = ChatSession(chat_id)
        
        return chat_id, self.chats[chat_id]
    
    def get_chat(self, chat_id):
        """Retorna um chat existente ou None"""
        return self.chats.get(chat_id)
    
    def cleanup_inactive_chats(self):
        """Remove chats inativos"""
        current_time = time.time()
        inactive_chats = []
        
        for chat_id, chat_session in self.chats.items():
            if current_time - chat_session.last_activity > self.max_inactive_time:
                inactive_chats.append(chat_id)
        
        for chat_id in inactive_chats:
            del self.chats[chat_id]
            print(f"Chat removido por inatividade: {chat_id}")
    
    def get_chat_stats(self):
        """Retorna estatísticas dos chats"""
        return {
            'total_chats': len(self.chats),
            'active_chats': sum(1 for chat in self.chats.values() if time.time() - chat.last_activity < 1800)  # 30 min
        }

class ChatSession:
    def __init__(self, chat_id):
        self.chat_id = chat_id
        self.history = deque(maxlen=10)  # Histórico de até 10 mensagens
        self.current_question_data = None
        self.created_at = time.time()
        self.last_activity = time.time()
        self.message_count = 0
        
    def add_to_history(self, user_input, ai_response):
        """Adiciona uma interação ao histórico"""
        self.history.append((user_input, ai_response))
        self.last_activity = time.time()
        self.message_count += 1
    
    def get_history_string(self):
        """Retorna o histórico como string formatada"""
        if not self.history:
            return ""
        return "\n".join([f"Usuário: {q}\nIA: {a}" for q, a in self.history])
    
    def clear_history(self):
        """Limpa o histórico do chat"""
        self.history.clear()
        self.current_question_data = None
        self.last_activity = time.time()

# Instância global do gerenciador de chats
chat_manager = ChatManager()

# ===== CONFIGURAÇÃO INICIAL =====
# Configuração de Embeddings (mantém a mesma instância)
Settings.embed_model = HuggingFaceEmbedding(
    model_name="BAAI/bge-small-en-v1.5"
)

# INSTRUÇÕES PARA A IA (mantém as mesmas)
SYSTEM_PROMPT = """
Você é um assistente inteligente e prestativo com as seguintes diretrizes:

1. COMPORTAMENTO:
- Mantenha respostas claras e concisas
- Se fornecida documentação de referência, baseie-se nela para responder
- Se alguém perguntar o teu nome, diga que é PilhIA
- Se não souber a resposta ou a pergunta estiver incompleta como por exemplo 'o que é a', diga apenas "Não sei responder isso"
- Se for perguntado algo fora de eletroquimica, baterias, eletrolise e pilha de daniell, diga que não pode responder a pergunta por estar fora do assunto, mas se sugerir uma explicação usando analogias mas que ainda seja sobre eletroquimica aceite.
- Se pedir questões sobre eletroquimica, você deve pegar elas diretamente da pasta 'questoes', e soltar apenas uma por vez.

2. FORMATO:
- Use parágrafos curtos e marcadores quando apropriado
- Não faça uso de formatações e latex no texto, inclusive nas respostas em que envolvam formulas
- Para listas longas, sugira uma abordagem passo a passo
- Para as questões pedidas, você deve copiar ela totalmente, menos a resposta correta (a não ser que o usuário peça questões com resposta correta)

3. RESTRIÇÕES:
- Nunca invente informações que não estejam na documentação
- Não responda perguntas sobre temas sensíveis ou ilegais
- Não gere conteúdo ofensivo ou discriminatório
- Mantenha o foco no assunto da consulta

4. INTERAÇÃO:
- Peça esclarecimentos se a pergunta for ambígua
- Para perguntas complexas, sugira dividi-las em partes menores
- Confirme se respondeu adequadamente à dúvida
- **Ao explicar a resposta de uma questão, concentre-se apenas no raciocínio e na explicação detalhada, sem repetir qual é a alternativa correta no início da sua resposta, pois esta informação já será fornecida.**
"""

# ===== CARREGAMENTO DE DOCUMENTOS =====
def load_documents_and_create_index():
    """Carrega documentos e cria o índice"""
    doc_path = "documentos/basededados"
    try:
        if not Path(doc_path).exists():
            Path(doc_path).mkdir(exist_ok=True)
            print(f"⚠️ Diretório '{doc_path}' criado (vazio)")

        documents = []
        for file in os.listdir(doc_path):
            file_path = os.path.join(doc_path, file)
            if file.endswith(".txt") and "tabela_potenciais" not in file:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    if content:
                        doc = Document(text=content, id_=file_path)
                        documents.append(doc)
                        print(f"Arquivo '{file}' carregado.")
                except Exception as e:
                    print(f"⚠️ Falha ao ler arquivo '{file}': {e}")

        if documents:
            index = VectorStoreIndex.from_documents(documents)
            return index
        else:
            print("⚠️ Nenhum documento carregado.")
            return None
            
    except Exception as e:
        print(f"⚠️ Erro ao carregar documentos: {str(e)}")
        return None

# Carrega documentos e cria índice
document_index = load_documents_and_create_index()

# ===== FUNÇÕES DE APOIO =====
def carregar_tabela_potenciais_json(file_path):
    """Carrega a tabela de potenciais de um arquivo JSON."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            potenciais = {}
            for item in data:
                metal = item.get('metal')
                potencial = item.get('potencial')
                if metal and potencial is not None:
                    potenciais[metal.lower()] = potencial
            return potenciais
    except Exception as e:
        print(f"⚠️ Erro ao carregar tabela de potenciais: {e}")
        return {}

def load_formatted_questions_from_folder(folder_path):
    """Carrega questões formatadas de arquivos JSON em uma pasta."""
    formatted_questions = []
    if not Path(folder_path).exists():
        Path(folder_path).mkdir(exist_ok=True)
        return formatted_questions
        
    for filename in os.listdir(folder_path):
        if filename.endswith(".json"):
            file_path = os.path.join(folder_path, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for item in data:
                            question_text = item.get('questao')
                            alternatives = item.get('alternativas')
                            resposta_correta = item.get('resposta_correta')

                            if question_text and alternatives and resposta_correta:
                                formatted_answer = f"{question_text}\n"
                                for letter, option in alternatives.items():
                                    formatted_answer += f"({letter.upper()}) {option}\n"
                                formatted_questions.append({
                                    'pergunta': formatted_answer,
                                    'resposta_correta': resposta_correta.lower()
                                })
                    elif isinstance(data, dict):
                        question_text = data.get('questao')
                        alternatives = data.get('alternativas')
                        resposta_correta = data.get('resposta_correta')

                        if question_text and alternatives and resposta_correta:
                            formatted_answer = f"{question_text}\n"
                            for letter, option in alternatives.items():
                                formatted_answer += f"({letter.upper()}) {option}\n"
                            formatted_questions.append({
                                'pergunta': formatted_answer,
                                'resposta_correta': resposta_correta.lower()
                            })
            except Exception as e:
                print(f"⚠️ Erro ao ler arquivo de questões '{filename}': {e}")
    return formatted_questions

# Carrega dados auxiliares
tabelas_path = "documentos/tabelas"
if not Path(tabelas_path).exists():
    Path(tabelas_path).mkdir(exist_ok=True)

tabela_path_json = os.path.join(tabelas_path, "tabela_potenciais.json")
tabela_potenciais_json = carregar_tabela_potenciais_json(tabela_path_json)

questoes_path = "documentos/questoes"
formatted_questions_list = load_formatted_questions_from_folder(questoes_path)

def build_prompt_with_history(user_input, chat_session):
    """Constrói o prompt incluindo o histórico de conversa do chat específico"""
    history_str = chat_session.get_history_string()
    if history_str:
        return f"{history_str}\nUsuário: {user_input}"
    return user_input

def create_query_engine_for_chat():
    """Cria um query engine com uma nova instância do LLM"""
    if document_index is None:
        return None
        
    llm_instance = create_llm_instance()
    # Verifica se a instância do LLM foi criada com sucesso (se houver chaves API)
    if llm_instance is None:
        return None

    llm_instance.system_prompt = SYSTEM_PROMPT
    
    query_engine = document_index.as_query_engine(
        streaming=False,
        similarity_top_k=3,
        node_postprocessors=[],
        llm=llm_instance
    )
    return query_engine

def calcular_voltagem_pilha_json(eletrodos_str):
    """Calcula voltagem da pilha usando tabela JSON"""
    try:
        eletrodos = [eletrodo.strip().lower() for eletrodo in eletrodos_str.split(' e ')]
        if len(eletrodos) != 2:
            return "Por favor, especifique dois eletrodos separados por 'e'."

        potenciais = {}
        for eletrodo in eletrodos:
            if eletrodo in tabela_potenciais_json:
                potenciais[eletrodo] = tabela_potenciais_json[eletrodo]
            else:
                return f"Não encontrei o potencial padrão para '{eletrodo}'. Verifique a grafia."

        catodo = max(potenciais, key=potenciais.get)
        anodo = min(potenciais, key=potenciais.get)
        voltagem = potenciais[catodo] - potenciais[anodo]
        return f"A voltagem da pilha com {catodo.capitalize()} (cátodo) e {anodo.capitalize()} (ânodo) é de {voltagem:.2f} V."

    except Exception as e:
        return f"Erro ao calcular a voltagem: {str(e)}"

def extrair_tema_analogia(texto):
    """Tenta extrair o tema para a analogia da frase."""
    partes = texto.lower().split("analogias com")
    if len(partes) > 1:
        return partes[1].strip().replace('[', '').replace(']', '')
    return None

def explicar_com_analogia(tema):
    """Gera uma explicação de eletroquímica usando uma analogia"""
    query_engine = create_query_engine_for_chat()
    if query_engine:
        prompt_analogia = f"Explique os conceitos básicos de eletroquímica usando uma analogia com '{tema}'. Seja conciso e claro, mas ao mesmo tempo deixe muito resumido."
        response = query_engine.query(prompt_analogia)
        return str(response)
    return "Não foi possível gerar analogias no momento."

# ===== ROTAS DA API =====
@app.route('/create_chat', methods=['POST'])
def create_new_chat():
    """Cria um novo chat e retorna o ID"""
    chat_id, chat_session = chat_manager.create_chat()
    return jsonify({
        'chat_id': chat_id,
        'created_at': chat_session.created_at,
        'message': 'Novo chat criado com sucesso!'
    })

@app.route('/query', methods=['POST'])
def handle_query():
    """Processa consultas com suporte a múltiplos chats"""
    try:
        if not request.is_json:
            return jsonify({'error': 'Request must be JSON'}), 400

        data = request.get_json()
        user_input = data.get('query', '').strip()
        chat_id = data.get('chat_id')

        if not user_input:
            return jsonify({'error': 'Query cannot be empty'}), 400

        # Se não foi fornecido chat_id, cria um novo chat
        if not chat_id:
            chat_id, chat_session = chat_manager.create_chat()
        else:
            chat_session = chat_manager.get_chat(chat_id)
            if not chat_session:
                # Chat não existe, cria um novo
                chat_id, chat_session = chat_manager.create_chat(chat_id)

        user_input_lower = user_input.lower()
        response = "" # Initialize response

        # --- Lógica de Processamento de Consulta ---

        # Prioridade 1: Resposta a uma questão pendente (a, b, c, d, e)
        if chat_session.current_question_data and user_input_lower in ['a', 'b', 'c', 'd', 'e']:
            user_answer = user_input_lower
            correct_answer = chat_session.current_question_data['resposta_correta']
            question_text = chat_session.current_question_data['pergunta']

            query_engine = create_query_engine_for_chat()
            
            explanation = ""
            if query_engine:
                explanation_prompt_base = f"A questão era: '{question_text}'"
                if user_answer == correct_answer:
                    explanation_prompt = f"{explanation_prompt_base}\nO usuário acertou. Explique em detalhes o raciocínio e por que a resposta '({correct_answer.upper()})' é a correta, **sem re-afirmar qual é a resposta correta no início da sua explicação.**"
                else:
                    explanation_prompt = f"{explanation_prompt_base}\nO usuário errou. A resposta correta era '({correct_answer.upper()})'. Explique em detalhes o raciocínio correto e por que '({correct_answer.upper()})' é a resposta certa, **sem re-afirmar qual é a resposta correta no início da sua explicação.**"
                
                explanation_response = query_engine.query(explanation_prompt)
                explanation_raw = str(explanation_response).strip()
                
                # Filtering to remove potential LLM re-statements of the correct answer at the beginning
                # This makes the explanation more robust against LLM's own mistakes/redundancies
                if explanation_raw.lower().startswith(("a resposta correta é", "a resposta certa é")):
                    first_sentence_end = explanation_raw.find('.')
                    if first_sentence_end != -1:
                        # Check if the first sentence explicitly re-states the answer
                        potential_first_sentence = explanation_raw[:first_sentence_end+1].lower()
                        if "resposta correta" in potential_first_sentence or "resposta certa" in potential_first_sentence:
                            explanation = explanation_raw[first_sentence_end+1:].strip()
                        else:
                            explanation = explanation_raw # Keep if it's not a direct re-statement
                    else: 
                        explanation = explanation_raw # No period, can't trim first sentence easily
                else:
                    explanation = explanation_raw

                if not explanation or "não sei responder isso" in explanation.lower():
                    explanation = "Não foi possível gerar uma explicação no momento."
            else:
                explanation = "Sistema de IA para explicações não disponível."

            if user_answer == correct_answer:
                response = f"Você acertou! A resposta correta é ({correct_answer.upper()}).\n{explanation}\nDeseja fazer outra questão? (sim/não)"
            else:
                response = f"Você errou. A resposta correta é ({correct_answer.upper()}).\n{explanation}\nDeseja fazer outra questão? (sim/não)"
            
            # current_question_data is NOT cleared here. It is cleared only when user says 'não' or a new non-quiz query.

        # Prioridade 2: Resposta a "Deseja fazer outra questão?" (sim/não)
        elif chat_session.history and "deseja fazer outra questão?" in chat_session.history[-1][1].lower():
            if user_input_lower == "sim":
                if formatted_questions_list:
                    chat_session.current_question_data = random.choice(formatted_questions_list)
                    response = chat_session.current_question_data['pergunta']
                else:
                    response = "Não há mais questões formatadas salvas na pasta."
            elif user_input_lower == "não":
                chat_session.current_question_data = None # Limpa a questão atual
                response = "Ótimo. Deseja mais alguma coisa?"
            else:
                # O usuário respondeu algo diferente de 'sim'/'não' após a pergunta.
                # Trata como uma nova consulta geral e limpa o estado do quiz.
                chat_session.current_question_data = None
                # Permite que a lógica de consulta geral seja executada abaixo.
                response = "" # Reseta a resposta para que a lógica geral possa preenchê-la

        # Prioridade 3: Geração inicial de questão ou cálculo ou analogia
        elif "gerar questões" in user_input_lower or "questões enem" in user_input_lower or "questão" in user_input_lower:
            if formatted_questions_list:
                chat_session.current_question_data = random.choice(formatted_questions_list)
                response = chat_session.current_question_data['pergunta']
            else:
                response = "Não há questões formatadas salvas na pasta."
        
        elif "calcular a voltagem de uma pilha de" in user_input_lower:
            eletrodos = user_input_lower.split("de uma pilha de")[1].strip()
            response = calcular_voltagem_pilha_json(eletrodos)
            chat_session.current_question_data = None # Limpa o estado do quiz se o usuário iniciar um cálculo
            
        elif "explicar eletroquímica fazendo analogias com" in user_input_lower:
            tema_analogia = extrair_tema_analogia(user_input)
            if tema_analogia:
                response = explicar_com_analogia(tema_analogia)
            else:
                response = "Por favor, especifique o tema para a analogia."
            chat_session.current_question_data = None # Limpa o estado do quiz se o usuário iniciar uma analogia

        # Prioridade 4: Consulta geral (fallback)
        else:
            chat_session.current_question_data = None # Limpa o estado do quiz para consultas gerais
            query_engine = create_query_engine_for_chat()
            if not query_engine:
                response = "⚠️ Sistema não está pronto. Verifique os documentos."
            else:
                full_prompt = build_prompt_with_history(user_input, chat_session)
                resposta = query_engine.query(full_prompt)
                response = str(resposta)
                
                if not response or "não sei responder isso" in response.lower():
                    # Se o LLM não souber, fornece uma resposta padrão
                    response = "Não sei responder isso no momento. Tente reformular sua pergunta ou pergunte sobre eletroquímica."

        # Adiciona a interação ao histórico do chat
        chat_session.add_to_history(user_input, response)
        
        return jsonify({
            'answer': response,
            'chat_id': chat_id,
            'message_count': chat_session.message_count
        })

    except Exception as e:
        print(f"⚠️ Erro na consulta: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/clear_history', methods=['POST'])
def clear_history():
    """Limpa o histórico de um chat específico"""
    data = request.get_json()
    chat_id = data.get('chat_id') if data else None
    
    if not chat_id:
        return jsonify({'error': 'chat_id é obrigatório'}), 400
    
    chat_session = chat_manager.get_chat(chat_id)
    if not chat_session:
        return jsonify({'error': 'Chat não encontrado'}), 404
    
    chat_session.clear_history()
    return jsonify({'status': 'Histórico limpo', 'chat_id': chat_id})

@app.route('/chat_stats', methods=['GET'])
def get_chat_stats():
    """Retorna estatísticas dos chats"""
    stats = chat_manager.get_chat_stats()
    return jsonify(stats)

@app.route('/list_chats', methods=['GET'])
def list_chats():
    """Lista todos os chats ativos"""
    chats_info = []
    for chat_id, chat_session in chat_manager.chats.items():
        chats_info.append({
            'chat_id': chat_id,
            'created_at': chat_session.created_at,
            'last_activity': chat_session.last_activity,
            'message_count': chat_session.message_count,
            'history_size': len(chat_session.history)
        })
    
    return jsonify({'chats': chats_info})

@app.route('/cleanup_chats', methods=['POST'])
def cleanup_chats():
    """Força a limpeza de chats inativos"""
    initial_count = len(chat_manager.chats)
    chat_manager.cleanup_inactive_chats()
    final_count = len(chat_manager.chats)
    removed_count = initial_count - final_count
    
    return jsonify({
        'message': f'{removed_count} chats inativos removidos',
        'remaining_chats': final_count
    })

if __name__ == '__main__':
    # Obtém a porta do ambiente (Render) ou usa 5000 como padrão para desenvolvimento local.
    port = int(os.environ.get("PORT", 5000))
    # Define o host para 0.0.0.0 para que o servidor seja acessível externamente no Render.
    host = '0.0.0.0'

    print("🚀 Iniciando servidor Flask...")
    print(f"📊 {len(API_KEYS)} chaves API carregadas (de variáveis de ambiente)")
    print(f"📚 {len(formatted_questions_list)} questões carregadas")
    print(f"🔍 Índice de documentos: {'✓' if document_index else '✗'}")
    
    # Em produção (no Render), 'debug=False' é o ideal.
    # Para testar localmente, você pode manter 'debug=True'.
    app.run(debug=True, host=host, port=port)
