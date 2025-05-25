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

app = Flask(__name__)
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
            print(f"DEBUG: Novo chat_id criado: {chat_id}", flush=True) # DEBUG
            
        if chat_id not in self.chats:
            self.chats[chat_id] = {
                'history': deque(maxlen=3),
                'last_activity': time.time(),
                'count': 0,
                'current_question_data': None # Adicionado para armazenar a questão atual
            }
        
        return chat_id, self.chats[chat_id] # Retorna o ID e a sessão completa
    
    def get_chat(self, chat_id):
        return self.chats.get(chat_id)
    
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
                            'alternativas': alternatives, # Mantém alternativas para verificação
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
                        'alternativas': alternatives, # Mantém alternativas para verificação
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

# ===== CARREGAMENTO DA TABELA DE POTENCIAIS =====
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
- **Ao explicar a resposta de uma questão, forneça APENAS a justificativa conceitual e quimicamente ACURADA para a alternativa CORRETA. NÃO re-afirme a letra da alternativa correta, NÃO mencione outras alternativas e NÃO tente re-calcular ou re-raciocinar a questão. Sua explicação deve ser uma justificativa direta, concisa e precisa, focando nos princípios da eletroquímica.**

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

# ===== FUNÇÃO DE CÁLCULO DE VOLTAGEM =====
def calcular_voltagem_pilha_json(eletrodos_str):
    """Calcula voltagem da pilha usando tabela JSON, retornando apenas o resultado."""
    try:
        eletrodos = [e.strip().lower() for e in eletrodos_str.split(' e ') if e.strip()]
        
        if len(eletrodos) != 2:
            return "Por favor, especifique exatamente dois eletrodos separados por 'e' (ex: 'cobre e zinco')."

        potenciais = {}
        for eletrodo in eletrodos:
            found_match = False
            for key_metal in tabela_potenciais_json:
                if eletrodo in key_metal: 
                    potenciais[eletrodo] = tabela_potenciais_json[key_metal]
                    found_match = True
                    break
            if not found_match:
                return f"Não encontrei o potencial padrão para '{eletrodo}'. Verifique a grafia ou se está na tabela."

        if len(potenciais) < 2:
            return "Não foi possível encontrar potenciais para ambos os eletrodos. Verifique a grafia."

        catodo_name = max(potenciais, key=potenciais.get)
        anodo_name = min(potenciais, key=potenciais.get)
        voltagem = potenciais[catodo_name] - potenciais[anodo_name]
        
        return f"A voltagem da pilha com {catodo_name.capitalize()} e {anodo_name.capitalize()} é de {voltagem:.2f} V."

    except Exception as e:
        print(f"⚠️ Erro no cálculo da voltagem: {str(e)}", flush=True)
        return f"Erro ao calcular a voltagem. Detalhes: {str(e)}"


def process_query_simple(user_input, chat_id):
    """Processa query de forma ultra simples, usando requests para o OpenRouter."""
    user_lower = user_input.lower()
    chat_session = chat_manager.chats.get(chat_id)

    print(f"DEBUG: Input recebido: '{user_input}', Chat ID: '{chat_id}'", flush=True)
    print(f"DEBUG: chat_session existe: {bool(chat_session)}", flush=True)
    print(f"DEBUG: current_question_data ANTES DA LÓGICA: {chat_session['current_question_data'] if chat_session else 'N/A'}", flush=True)

    # 1. Lógica para cálculo de voltagem (PRIORITÁRIA)
    if "calcular a voltagem de uma pilha de" in user_lower:
        print("DEBUG: Entrou na lógica de cálculo de voltagem.", flush=True)
        eletrodos_str = user_lower.split("de uma pilha de")[1].strip()
        chat_session['current_question_data'] = None # Limpa o estado do quiz se o usuário iniciar um cálculo
        return calcular_voltagem_pilha_json(eletrodos_str)
    
    # 2. Lógica para responder a questões (se uma questão foi gerada anteriormente)
    # E também para lidar com "sim/não" após a resposta
    if chat_session and chat_session['current_question_data']:
        print("DEBUG: current_question_data existe. Verificando resposta ou sim/não.", flush=True)
        question_data = chat_session['current_question_data']
        correct_answer_letter = question_data['resposta_correta'].lower()
        
        # Verifica se a entrada do usuário é uma alternativa (a, b, c, d, e)
        if user_lower in ['a', 'b', 'c', 'd', 'e']:
            print(f"DEBUG: Usuário respondeu alternativa: '{user_lower}'", flush=True)
            is_correct = (user_lower == correct_answer_letter)
            
            explanation_prompt = ""
            # Ajuste no explanation_prompt para ser mais direto e evitar raciocínio do LLM
            explanation_prompt = (
                f"A questão era: '{question_data['pergunta']}'\n"
                f"A alternativa correta é '({correct_answer_letter.upper()})'. "
                f"Forneça uma justificativa concisa e quimicamente ACURADA para esta alternativa, "
                f"focando nos princípios da eletroquímica. "
                f"**NÃO re-afirme a letra da alternativa correta, NÃO mencione outras alternativas e NÃO tente re-calcular ou re-raciocinar a questão.**"
            )
            
            # Chama a IA para a explicação
            explanation_messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": explanation_prompt}]
            explanation_response = ""
            if OPENROUTER_API_AVAILABLE:
                api_key = random.choice(API_KEYS)
                explanation_response = call_openrouter_api(explanation_messages, api_key)
                if not explanation_response:
                    explanation_response = "Não foi possível gerar uma explicação no momento. Verifique as chaves API."
            else:
                explanation_response = "Sistema de IA para explicações não disponível."

            # A limpeza de current_question_data NÃO ACONTECE AQUI.
            # Ela só ocorrerá se o usuário disser 'não' ou uma nova questão for gerada.
            
            if is_correct:
                response = f"Você acertou! A resposta correta é ({correct_answer_letter.upper()}).\n{explanation_response}\nDeseja fazer outra questão? (sim/não)"
            else:
                response = f"Você errou. A resposta correta é ({correct_answer_letter.upper()}).\n{explanation_response}\nDeseja fazer outra questão? (sim/não)"
            
            return response
        
        # Lógica para "sim" ou "não" após uma questão respondida
        last_ai_message = chat_session['history'][-1][1].lower() if chat_session['history'] else ""
        print(f"DEBUG: last_ai_message para sim/não check: '{last_ai_message}'", flush=True) # DEBUG
        if "deseja fazer outra questão?" in last_ai_message:
            print(f"DEBUG: Usuário respondeu sim/não: '{user_lower}'", flush=True)
            if user_lower == "sim":
                print("DEBUG: Usuário disse 'sim'. Tentando gerar nova questão.", flush=True) # DEBUG
                if questions_list:
                    q = random.choice(questions_list)
                    chat_session['current_question_data'] = q # Armazena a nova questão
                    print(f"DEBUG: Nova questão gerada: {q.get('pergunta', 'N/A')}", flush=True) # DEBUG
                    return q.get('pergunta', "Não foi possível gerar uma questão válida no momento. Tente novamente.")
                else:
                    print("DEBUG: questions_list está vazia. Não há mais questões disponíveis.", flush=True) # DEBUG
                    return "Não há mais questões disponíveis."
            elif user_lower == "não":
                print("DEBUG: Usuário disse 'não'. Limpando current_question_data.", flush=True) # DEBUG
                chat_session['current_question_data'] = None # AGORA SIM: Garante que a questão seja limpa
                return "Ótimo. Deseja mais alguma coisa?"
            else:
                print("DEBUG: Resposta inesperada após 'outra questão?'. Caindo para LLM geral.", flush=True)
                # O usuário respondeu algo diferente de 'sim'/'não' após a pergunta.
                # Trata como uma nova consulta geral e limpa o estado do quiz.
                chat_session['current_question_data'] = None
                # Permite que a lógica de consulta geral seja executada abaixo.
                # Não retorna aqui, para que caia na lógica do LLM geral.
                response = "" # Reseta a resposta para que a lógica geral possa preenchê-la
        else:
            print("DEBUG: Não é uma alternativa e não é resposta a 'outra questão?'. Caindo para LLM geral.", flush=True)
            # Se não for uma alternativa e nem uma resposta a "deseja fazer outra questão?",
            # então não é uma interação do quiz. Limpa o estado do quiz e continua para a lógica geral.
            chat_session['current_question_data'] = None 
            pass # Cai para a lógica do LLM geral
    else: 
        print("DEBUG: current_question_data é None. Não está no modo de resposta/sim/não.", flush=True)
        pass # Cai para a lógica do LLM geral
    
    # 3. Lógica para gerar questões (se não estiver respondendo uma questão ou cálculo)
    if "gerar questões" in user_lower or "questões enem" in user_lower or "questão" in user_lower:
        print("DEBUG: Entrou na lógica de gerar questões.", flush=True)
        if questions_list:
            q = random.choice(questions_list)
            
            question_text_with_alts = q.get('pergunta', '')
            
            if not question_text_with_alts: 
                print(f"⚠️ Questão selecionada vazia ou mal formatada após formatação inicial: {q}", flush=True)
                return "Não foi possível gerar uma questão válida no momento. Tente novamente."

            chat_session['current_question_data'] = q # Armazena a questão gerada
            return question_text_with_alts[:800] 
        return "Questões não disponíveis."
    
    # 4. Lógica para consulta com LLM (se nada acima for acionado)
    print("DEBUG: Caindo na lógica de consulta geral com LLM.", flush=True)
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

# Novas rotas para as páginas estáticas
@app.route('/contato')
def contato():
    return render_template('contato.html')

@app.route('/recursos')
def recursos():
    return render_template('recursos.html')

@app.route('/sobre')
def sobre():
    return render_template('sobre.html')


@app.route('/ping')
def ping():
    return "pong"

@app.route('/create_chat', methods=['POST'])
def create_chat():
    chat_id, _ = chat_manager.create_chat() # Pega o ID e ignora a sessão completa
    return jsonify({
        'chat_id': chat_id,
        'message': 'Novo chat criado com sucesso!'
    })

@app.route('/query', methods=['POST'])
def query():
    try:
        data = request.get_json()
        if not data or not data.get('query'):
            return jsonify({'error': 'Query vazia'}), 400
        
        user_input = data.get('query', '').strip()[:500]
        chat_id = data.get('chat_id')
        
        if not chat_id:
            chat_id, _ = chat_manager.create_chat() # Cria um novo e pega o ID
        elif chat_id not in chat_manager.chats:
            chat_id, _ = chat_manager.create_chat(chat_id) # Cria com o ID fornecido se não existir
        
        print(f"DEBUG na rota /query: Recebido chat_id: {chat_id}, user_input: '{user_input}'", flush=True) # DEBUG
        response = process_query_simple(user_input, chat_id)
        print(f"DEBUG na rota /query: Resposta de process_query_simple: '{response}'", flush=True) # DEBUG
        
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
