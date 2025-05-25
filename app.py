from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import random
import json
import uuid
import time
from pathlib import Path
from collections import deque
import sys
import requests # Importa a biblioteca requests

app = Flask(__orb)
CORS(app)

# ===== CONFIGURAÇÃO MÍNIMA =====
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev_key')
api_keys_str = os.environ.get('OPENROUTER_API_KEYS', '')
API_KEYS = [key.strip() for key in api_keys_str.split(',') if key.strip()]

# Variável para indicar se a API_KEY está disponível
OPENROUTER_API_AVAILABLE = len(API_KEYS) > 0
if not OPENROUTER_API_AVAILABLE:
    print("⚠️ Nenhuma chave API OpenRouter disponível. A IA não funcionará.", flush=True)

# ===== SISTEMA DE CHAT MINIMALISTA =====
class MiniChatManager:
    def __init__(self):
        self.chats = {}
        self.max_chats = 20  # Reduzido drasticamente para economizar memória
        
    def create_chat(self, chat_id=None):
        if len(self.chats) >= self.max_chats:
            old_chats = sorted(self.chats.items(), key=lambda x: x[1]['last_activity'])[:self.max_chats // 2]
            for chat_id_to_remove, _ in old_chats:
                del self.chats[chat_id_to_remove]
                print(f"Chat antigo removido: {chat_id_to_remove}", flush=True)
        
        if chat_id is None:
            chat_id = str(uuid.uuid4())[:8]
            
        if chat_id not in self.chats:
            self.chats[chat_id] = {
                'history': deque(maxlen=3),
                'last_activity': time.time(),
                'count': 0
            }
        
        return chat_id
    
    def add_message(self, chat_id, user_msg, ai_msg):
        if chat_id in self.chats:
            user_msg = user_msg[:200]
            ai_msg = ai_msg[:500] # Limita a mensagem para o histórico
            
            self.chats[chat_id]['history'].append((user_msg, ai_msg))
            self.chats[chat_id]['last_activity'] = time.time()
            self.chats[chat_id]['count'] += 1

chat_manager = MiniChatManager()

# ===== SISTEMA DE QUESTÕES SIMPLIFICADO =====
def load_minimal_questions():
    formatted_questions = []
    try:
        questoes_path = "documentos/questoes"
        if not Path(questoes_path).exists():
            print(f"⚠️ Pasta de questões não encontrada: {questoes_path}", flush=True)
            return []
            
        files = [f for f in os.listdir(questoes_path) if f.endswith('.json')]
        if not files:
            print(f"⚠️ Nenhuma questão JSON encontrada em: {questoes_path}", flush=True)
            return []

        # Carrega apenas o primeiro arquivo e um máximo de 10 questões para economizar memória
        file_path = os.path.join(questoes_path, files[0]) 
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if isinstance(data, list):
                for item in data[:10]: # Limita a 10 questões por arquivo
                    question_text = item.get('questao')
                    alternatives = item.get('alternativas')
                    resposta_correta = item.get('resposta_correta')
                    if question_text and alternatives and resposta_correta:
                        formatted_answer = f"{question_text}\n"
                        for letter, option in list(alternatives.items())[:4]:
                            formatted_answer += f"({letter.upper()}) {option}\n"
                        formatted_questions.append({
                            'pergunta': formatted_answer,
                            'resposta_correta': resposta_correta.lower()
                        })
            elif isinstance(data, dict): # Caso o JSON seja um único objeto de questão
                question_text = data.get('questao')
                alternatives = data.get('alternativas')
                resposta_correta = data.get('resposta_correta')
                if question_text and alternatives and resposta_correta:
                    formatted_answer = f"{question_text}\n"
                    for letter, option in list(alternatives.items())[:4]:
                        formatted_answer += f"({letter.upper()}) {option}\n"
                    formatted_questions.append({
                        'pergunta': formatted_answer,
                        'resposta_correta': resposta_correta.lower()
                    })
                    
        except json.JSONDecodeError as jde:
            print(f"⚠️ Erro ao ler JSON da questão '{file_path}': {jde}", flush=True)
        except Exception as e:
            print(f"⚠️ Erro inesperado ao carregar questões de '{file_path}': {e}", flush=True)
                
    except Exception as e:
        print(f"⚠️ Erro geral ao carregar questões: {e}", flush=True)
    return formatted_questions

questions_list = load_minimal_questions()

# ===== CARREGAMENTO DA TABELA DE POTENCIAIS (REINTRODUZIDO) =====
def carregar_tabela_potenciais_json(file_path):
    """Carrega a tabela de potenciais de um arquivo JSON."""
    try:
        if not Path(file_path).exists():
            print(f"⚠️ Arquivo de tabela de potenciais não encontrado: {file_path}", flush=True)
            return {}
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            potenciais = {}
            for item in data:
                metal = item.get('metal')
                potencial = item.get('potencial')
                if metal and potencial is not None:
                    potenciais[metal.lower()] = potencial
            print(f"✅ Tabela de potenciais carregada de: {file_path}", flush=True)
            return potenciais
    except json.JSONDecodeError as jde:
        print(f"⚠️ Erro ao ler JSON da tabela de potenciais '{file_path}': {jde}", flush=True)
        return {}
    except Exception as e:
        print(f"⚠️ Erro ao carregar tabela de potenciais: {e}", flush=True)
        return {}

# Carrega dados auxiliares na inicialização
tabelas_path = "documentos/tabelas"
tabela_path_json = os.path.join(tabelas_path, "tabela_potenciais.json")
tabela_potenciais_json = carregar_tabela_potenciais_json(tabela_path_json)


# ===== FUNÇÕES DE PROCESSAMENTO LEVES =====
SYSTEM_PROMPT = """
Você é um assistente inteligente e prestativo com as seguintes diretrizes:

1. COMPORTAMENTO:
- Mantenha respostas claras e concisas.
- **Resuma suas respostas para serem diretas e não excederem 800 caracteres.**
- Se fornecida documentação de referência, baseie-se nela para responder.
- Se alguém perguntar o teu nome, diga que é PilhIA.
- Se não souber a resposta ou a pergunta estiver incompleta como por exemplo 'o que é a', diga apenas "Não sei responder isso".
- Se for perguntado algo fora de eletroquimica, baterias, eletrolise e pilha de daniell, diga que não pode responder a pergunta por estar fora do assunto, mas se sugerir uma explicação usando analogias mas que ainda seja sobre eletroquimica aceite.
- Se pedir questões sobre eletroquimica, você deve pegar elas diretamente da pasta 'questoes', e soltar apenas uma por vez.

2. FORMATO:
- Use parágrafos curtos e marcadores quando apropriado.
- Não faça uso de formatações e latex no texto, inclusive nas respostas em que envolvam formulas.
- Para listas longas, sugira uma abordagem passo a passo.
- Para as questões pedidas, você deve copiar ela totalmente, menos a resposta correta (a não ser que o usuário peça questões com resposta correta).

3. RESTRIÇÕES:
- Nunca invente informações que não estejam na documentação.
- Não responda perguntas sobre temas sensíveis ou ilegais.
- Não gere conteúdo ofensivo ou discriminatório.
- Mantenha o foco no assunto da consulta.

4. INTERAÇÃO:
- Peça esclarecimentos se a pergunta for ambígua.
- Para perguntas complexas, sugira dividi-las em partes menores.
- Confirme se respondeu adequadamente à dúvida.
"""

def call_openrouter_api(messages, api_key, model="meta-llama/llama-3.2-1b-instruct:free"):
    """
    Chama a API do OpenRouter diretamente usando requests.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": model,
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": 800 # Mantém o limite de tokens para alinhar com o slicing
    }
    
    try:
        response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data, timeout=30)
        response.raise_for_status() # Lança um erro para status de resposta HTTP ruins (4xx ou 5xx)
        return response.json()["choices"][0]["message"]["content"]
    except requests.exceptions.RequestException as e:
        print(f"⚠️ Erro ao chamar a API do OpenRouter: {e}", flush=True)
        return None
    except KeyError:
        print(f"⚠️ Resposta inesperada da API do OpenRouter: {response.json()}", flush=True)
        return None
    except Exception as e:
        print(f"⚠️ Erro inesperado na chamada da API do OpenRouter: {e}", flush=True)
        return None

def load_simple_documents():
    """Carrega documentos como texto simples de múltiplas pastas."""
    content = ""
    # Define as pastas de onde os documentos devem ser carregados
    # A tabela de potenciais será carregada separadamente por carregar_tabela_potenciais_json
    paths_to_load = ["documentos/basededados"] 

    for doc_folder in paths_to_load:
        if not Path(doc_folder).exists():
            print(f"⚠️ Pasta de documentos não encontrada: {doc_folder}", flush=True)
            continue

        print(f"🔎 Carregando documentos de: {doc_folder}", flush=True)
        count = 0
        for file in os.listdir(doc_folder):
            if count >= 3: 
                break
            
            if file.endswith(".txt") or file.endswith(".json"):
                try:
                    file_path = os.path.join(doc_folder, file)
                    file_text = ""
                    
                    if file.endswith(".json"):
                        with open(file_path, 'r', encoding='utf-8') as f:
                            json_data = json.load(f)
                            file_text = json.dumps(json_data, indent=2, ensure_ascii=False)
                    else:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            file_text = f.read()

                    content += f"\n--- Conteúdo de {doc_folder}/{file} ---\n{file_text[:2000]}\n"
                    count += 1
                    print(f"  ✅ Lido: {file_path}", flush=True)

                except Exception as e:
                    print(f"⚠️ Erro ao ler documento '{file_path}': {e}", flush=True)
                    continue
            else:
                print(f"  ⚠️ Ignorado: {file_path} (não é .txt ou .json)", flush=True)
                    
    return content[:8000]

# Carrega documentos como texto simples (executado na inicialização)
simple_docs = load_simple_documents()

# ===== FUNÇÃO DE CÁLCULO DE VOLTAGEM (REINTRODUZIDO) =====
def calcular_voltagem_pilha_json(eletrodos_str):
    """Calcula voltagem da pilha usando tabela JSON, retornando apenas o resultado."""
    try:
        # Tenta parsear a string de eletrodos, aceitando "e" ou "e ", etc.
        eletrodos = [e.strip().lower() for e in eletrodos_str.split(' e ') if e.strip()]
        
        if len(eletrodos) != 2:
            return "Por favor, especifique exatamente dois eletrodos separados por 'e' (ex: 'cobre e zinco')."

        potenciais = {}
        for eletrodo in eletrodos:
            # Verifica se o eletrodo existe na tabela de potenciais carregada
            if eletrodo in tabela_potenciais_json:
                potenciais[eletrodo] = tabela_potenciais_json[eletrodo]
            else:
                # Tenta encontrar correspondências parciais, como "cobre" para "cobre (ii)"
                found_match = False
                for key_metal in tabela_potenciais_json:
                    if eletrodo in key_metal: # Verifica se o eletrodo de entrada é parte da chave da tabela
                        potenciais[eletrodo] = tabela_potenciais_json[key_metal]
                        found_match = True
                        break
                if not found_match:
                    return f"Não encontrei o potencial padrão para '{eletrodo}'. Verifique a grafia ou se está na tabela."

        # Garante que ambos os potenciais foram encontrados
        if len(potenciais) < 2:
            return "Não foi possível encontrar potenciais para ambos os eletrodos. Verifique a grafia."

        catodo_name = max(potenciais, key=potenciais.get)
        anodo_name = min(potenciais, key=potenciais.get)
        voltagem = potenciais[catodo_name] - potenciais[anodo_name]
        
        # Retorna APENAS o resultado do cálculo, formatado
        return f"A voltagem da pilha com {catodo_name.capitalize()} e {anodo_name.capitalize()} é de {voltagem:.2f} V."

    except Exception as e:
        print(f"⚠️ Erro no cálculo da voltagem: {str(e)}", flush=True)
        return f"Erro ao calcular a voltagem. Detalhes: {str(e)}"


def process_query_simple(user_input, chat_id):
    """Processa query de forma ultra simples, usando requests para o OpenRouter."""
    user_lower = user_input.lower()
    
    # 1. Lógica para cálculo de voltagem (PRIORITÁRIA)
    if "calcular a voltagem de uma pilha de" in user_lower:
        eletrodos_str = user_lower.split("de uma pilha de")[1].strip()
        return calcular_voltagem_pilha_json(eletrodos_str)
    
    # 2. Lógica para questões
    if "gerar questões" in user_lower or "questões enem" in user_lower or "questão" in user_lower:
        if questions_list:
            q = random.choice(questions_list)
            
            # Agora, 'pergunta' já contém o texto da questão formatado com as alternativas
            question_text_with_alts = q.get('pergunta', '')
            
            if not question_text_with_alts: # Verifica se o texto formatado da questão está vazio
                print(f"⚠️ Questão selecionada vazia ou mal formatada após formatação inicial: {q}", flush=True)
                return "Não foi possível gerar uma questão válida no momento. Tente novamente."

            # A variável 'result' já é o texto completo da questão
            result = question_text_with_alts
            return result[:800] # Limita o tamanho para o frontend
        return "Questões não disponíveis."
    
    # 3. Lógica para consulta com LLM (se nada acima for acionado)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    if simple_docs:
        messages.append({"role": "user", "content": f"Contexto: {simple_docs[:3000]}\n\nPergunta: {user_input[:300]}"})
    else:
        messages.append({"role": "user", "content": user_input[:300]})

    if OPENROUTER_API_AVAILABLE:
        api_key = random.choice(API_KEYS)
        ai_response = call_openrouter_api(messages, api_key)
        
        if ai_response:
            return ai_response[:800] 
        else:
            return "⚠️ Erro na comunicação com a IA. Por favor, verifique as chaves API e os logs do servidor."
    else:
        return "⚠️ O sistema de IA não está disponível. Verifique as chaves API ou os logs do servidor."
    
    # Resposta padrão (só deve ser alcançada se nenhuma das condições acima for atendida, o que é improvável agora)
    if "pilhia" in user_lower:
        return "Olá! Sou a PilhIA, sua assistente de eletroquímica. Como posso ajudar?"
    
    return "Desculpe, não consigo responder isso no momento. Tente perguntas sobre eletroquímica ou verifique os logs."

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
        
        user_input = data.get('query', '').strip()[:500]
        chat_id = data.get('chat_id')
        
        if not chat_id:
            chat_id = chat_manager.create_chat()
        elif chat_id not in chat_manager.chats:
            chat_id = chat_manager.create_chat(chat_id)
        
        response = process_query_simple(user_input, chat_id)
        
        if not response.startswith("⚠️ Erro:"):
            chat_manager.add_message(chat_id, user_input, response)
        
        return jsonify({
            'answer': response,
            'chat_id': chat_id
        })
        
    except Exception as e:
        error_type = type(e).__name__
        print(f"⚠️ Erro geral na rota /query: {error_type} - {e}", flush=True)
        return jsonify({
            'answer': f'⚠️ Erro interno do servidor ({error_type}). Por favor, verifique os logs do Render.', 
            'chat_id': chat_id
        }), 500

@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'chats': len(chat_manager.chats),
        'questions': len(questions_list),
        'openrouter_available': OPENROUTER_API_AVAILABLE,
        'memory': 'optimized',
        'llm_mode': 'requests_direct',
        'tabela_potenciais_carregada': bool(tabela_potenciais_json) # Adiciona status da tabela
    })

# ===== CONFIGURAÇÃO PARA RENDER =====
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    
    print("🚀 PilhIA Ultra Leve (Direct API)", flush=True)
    print(f"🌐 Porta: {port}", flush=True)
    print(f"📊 APIs: {len(API_KEYS)} chaves carregadas (de variáveis de ambiente)", flush=True)
    print(f"📚 Questões: {len(questions_list)} questões carregadas", flush=True)
    print(f"📖 Docs: {'✓' if simple_docs else '✗'} documentos de contexto carregados", flush=True)
    print(f"🧪 Tabela de Potenciais: {'✓' if tabela_potenciais_json else '✗'} carregada", flush=True)
    print(f"🧠 OpenRouter API disponível: {'✓' if OPENROUTER_API_AVAILABLE else '✗'}", flush=True)
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False,
        use_reloader=False,
        threaded=True
    )
