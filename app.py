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

app = Flask(__name__)
CORS(app)  # Habilita CORS para todas as rotas

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

# Registro do Blueprint na aplicação principal
app.register_blueprint(public_bp)

# Configuração do OpenRouter
Settings.llm = OpenRouter(
    api_key="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",
    model="meta-llama/llama-3.3-8b-instruct:free",
    api_base="https://openrouter.ai/api/v1",
    temperature=0.7,
    max_tokens=2000
)

# Configuração de Embeddings
Settings.embed_model = HuggingFaceEmbedding(
    model_name="BAAI/bge-small-en-v1.5"
)

# INSTRUÇÕES PARA A IA
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
"""

# Histórico de conversa (armazena os últimos N diálogos)
CONVERSATION_HISTORY = deque(maxlen=5)  # Mantém as últimas 5 interações

# Verificação e criação do diretório de documentos
doc_path = "documentos/basededados"
try:
    if not Path(doc_path).exists():
        Path(doc_path).mkdir(exist_ok=True)
        print(f"⚠️ Diretório '{doc_path}' criado (vazio)")

    documents = []
    # Carrega outros documentos de texto
    for file in os.listdir(doc_path):
        file_path = os.path.join(doc_path, file)
        if file.endswith(".txt") and "tabela_potenciais" not in file:
            print(f"Tentando ler o arquivo diretamente: {file_path}")
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                if content:
                    doc = Document(text=content, id_=file_path)
                    documents.append(doc)
                    print(f"Arquivo '{file}' lido diretamente. Conteúdo carregado.")
                else:
                    print(f"⚠️ Arquivo '{file}' está vazio.")
            except Exception as e:
                print(f"⚠️ Falha ao ler arquivo '{file}' diretamente com erro: {e}. Skipping...")


    # Carrega a tabela de potenciais do arquivo JSON
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
        except FileNotFoundError:
            print(f"⚠️ Arquivo '{file_path}' não encontrado.")
            return {}
        except json.JSONDecodeError as e:
            print(f"⚠️ Erro ao decodificar JSON: {e}")
            return {}
        return {}

    tabelas_path = "documentos/tabelas"  # Nova linha: define o caminho da pasta tabelas
    tabela_path_json = os.path.join(tabelas_path, "tabela_potenciais.json") # Linha modificada

    tabela_potenciais_json = carregar_tabela_potenciais_json(tabela_path_json)

    # Cria o índice com todos os documentos carregados
    if documents:
        index = VectorStoreIndex.from_documents(documents)

        # Configuração correta do query engine com system_prompt
        query_engine = index.as_query_engine(
            streaming=False,  # Desabilita o streaming para obter a resposta completa para a explicação
            similarity_top_k=3,
            node_postprocessors=[],
            llm=Settings.llm
        )

        # Definir o system_prompt no LLM
        Settings.llm.system_prompt = SYSTEM_PROMPT
    else:
        print("⚠️ Nenhum documento de texto carregado. O query engine não será inicializado.")
        query_engine = None

except Exception as e:
    print(f"⚠️ Erro ao carregar documentos: {str(e)}")
    query_engine = None

# Verificação e criação do diretório de questões
questoes_path = "documentos/questoes"
if not Path(questoes_path).exists():
    Path(questoes_path).mkdir(exist_ok=True)
    print(f"⚠️ Diretório '{questoes_path}' criado (vazio)")

current_question_data = None # Variável para armazenar a questão atual e a resposta correta

def load_formatted_questions_from_folder(folder_path):
    """Carrega questões formatadas de arquivos JSON em uma pasta."""
    formatted_questions = []
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

            except json.JSONDecodeError as e:
                print(f"⚠️ Erro ao decodificar JSON no arquivo '{filename}': {str(e)}")
            except Exception as e:
                print(f"⚠️ Erro ao ler o arquivo '{filename}': {str(e)}")
    return formatted_questions

formatted_questions_list = load_formatted_questions_from_folder(questoes_path)

def build_prompt_with_history(user_input):
    """Constrói o prompt incluindo o histórico de conversa"""
    history_str = ""
    if CONVERSATION_HISTORY:
        history_str = "\n".join([f"Usuário: {q}\nIA: {a}" for q, a in CONVERSATION_HISTORY])
        history_str += f"\nUsuário: {user_input}"
    else:
        history_str = user_input

    return history_str

def extrair_tema_analogia(texto):
    """Tenta extrair o tema para a analogia da frase."""
    partes = texto.lower().split("analogias com")
    if len(partes) > 1:
        return partes[1].strip().replace('[', '').replace(']', '')
    return None

def explicar_com_analogia(tema):
    """Gera uma explicação de eletroquímica usando uma analogia (requer LLM)."""
    prompt_analogia = f"Explique os conceitos básicos de eletroquímica usando uma analogia com '{tema}'. Seja conciso e claro."
    if query_engine:
        response = query_engine.query(prompt_analogia)
        return str(response)
    else:
        return "Não foi possível gerar analogias no momento."

def calcular_voltagem_pilha_json(eletrodos_str):
    try:
        eletrodos = [eletrodo.strip().lower() for eletrodo in eletrodos_str.split(' e ')]
        print(f"Eletrodos: {eletrodos}")
        if len(eletrodos) != 2:
            return "Por favor, especifique dois eletrodos separados por 'e'."

        potenciais = {}
        for eletrodo in eletrodos:
            if eletrodo in tabela_potenciais_json:
                potenciais[eletrodo] = tabela_potenciais_json[eletrodo]
                print(f"Potencial encontrado para {eletrodo}: {potenciais[eletrodo]}")
            else:
                return f"Não encontrei o potencial padrão para '{eletrodo}'. Verifique a grafia."

        catodo = max(potenciais, key=potenciais.get)
        anodo = min(potenciais, key=potenciais.get)
        voltagem = potenciais[catodo] - potenciais[anodo]
        resultado = f"A voltagem da pilha com {catodo.capitalize()} (cátodo) e {anodo.capitalize()} (ânodo) é de {voltagem:.2f} V."
        print(f"Resultado: {resultado}")
        return resultado

    except Exception as e:
        return f"Erro ao calcular a voltagem: {str(e)}"

@app.route('/query', methods=['POST'])
def handle_query():
    print("Rota /query acessada!") # Verificamos que esta linha está sendo executada
    global current_question_data
    try:
        if not request.is_json:
            return jsonify({'error': 'Request must be JSON'}), 400

        data = request.get_json()
        user_input = data.get('query', '').strip().lower()

        if not user_input:
            return jsonify({'error': 'Query cannot be empty'}), 400

        if "calcular a voltagem de uma pilha de" in user_input:
            print("Condição 'calcular a voltagem' atendida!")
            eletrodos = user_input.split("de uma pilha de")[1].strip()
            voltagem_info = calcular_voltagem_pilha_json(eletrodos)
            print(f"Valor de voltagem_info antes do jsonify: '{voltagem_info}'")
            CONVERSATION_HISTORY.append((user_input, voltagem_info))
            return jsonify({'answer': voltagem_info})
        elif "gerar questões" in user_input or "questões enem" in user_input.lower():
            if formatted_questions_list:
                current_question_data = random.choice(formatted_questions_list)
                response = current_question_data['pergunta']
                CONVERSATION_HISTORY.append((user_input, response))
                return jsonify({'answer': response})
            else:
                response = "Não há questões formatadas salvas na pasta."
                CONVERSATION_HISTORY.append((user_input, response))
                return jsonify({'answer': response})
        elif user_input.lower().startswith("quero ajuda para entender"):
            full_prompt = build_prompt_with_history(user_input)
            resposta = query_engine.query(full_prompt)
            resposta_str = str(resposta)
            if not resposta_str or "não sei responder isso" in resposta_str.lower() or "não tenho informações suficientes" in resposta_str.lower():
                return jsonify({'answer': ''})
            else:
                CONVERSATION_HISTORY.append((user_input, resposta_str))
                return jsonify({'answer': resposta_str})
        elif "explicar eletroquímica fazendo analogias com" in user_input.lower():
            tema_analogia = extrair_tema_analogia(user_input)
            if tema_analogia:
                explicacao = explicar_com_analogia(tema_analogia)
                CONVERSATION_HISTORY.append((user_input, explicacao))
                return jsonify({'answer': explicacao})
            else:
                return jsonify({'answer': "Por favor, especifique o tema para a analogia."})
        elif current_question_data:
            user_answer = user_input
            correct_answer = current_question_data['resposta_correta']
            question_text = current_question_data['pergunta']

            if query_engine:
                if user_answer == correct_answer:
                    explanation_prompt = f"Explique em detalhes por que a resposta '({correct_answer.upper()})' está correta para a seguinte questão: '{question_text}'"
                else:
                    explanation_prompt = f"Explique em detalhes qual é a resposta correta para a seguinte questão: '{question_text}'. A resposta correta é '({correct_answer.upper()})'."

                print(f"Prompt de explicação: {explanation_prompt}") # Log da prompt
                explanation_response = query_engine.query(explanation_prompt)
                explanation = str(explanation_response).strip() # Remove espaços em branco extras
                print(f"Resposta de explicação bruta: '{explanation}'") # Log da resposta bruta

                if not explanation or "não sei responder isso" in explanation.lower() or "não tenho informações suficientes" in explanation.lower():
                    explanation = "" # Define a explicação como vazia explicitamente
            else:
                explanation = "Não foi possível gerar uma explicação no momento."

            if user_answer == correct_answer:
                response = f"Você acertou! A resposta correta é ({correct_answer.upper()}).\n{explanation}\nDeseja fazer outra questão?"
            else:
                response = f"Você errou. A resposta correta é ({correct_answer.upper()}).\n{explanation}\nDeseja fazer outra questão?"

            CONVERSATION_HISTORY.append((user_input, response))
            current_question_data = None # Limpa a questão atual após a resposta
            return jsonify({'answer': response})
        elif user_input == "sim" and CONVERSATION_HISTORY and "deseja fazer outra questão?" in CONVERSATION_HISTORY[-1][1].lower():
            # Se o usuário responde "sim" após uma pergunta e feedback, gera outra questão
            if formatted_questions_list:
                current_question_data = random.choice(formatted_questions_list)
                response = current_question_data['pergunta']
                CONVERSATION_HISTORY.append((user_input, response))
                return jsonify({'answer': response})
            else:
                response = "Não há mais questões formatadas salvas na pasta."
                CONVERSATION_HISTORY.append((user_input, response))
                return jsonify({'answer': response})
        elif not query_engine:
            return jsonify({'answer': '⚠️ Sistema não está pronto. Verifique os documentos.'})
        else:
            # Para outras perguntas que não são sobre gerar questões, use o query engine
            full_prompt = build_prompt_with_history(user_input)
            resposta = query_engine.query(full_prompt)
            resposta_str = str(resposta)

            # Verificando se a resposta indica não saber
            if not resposta_str or "não sei responder isso" in resposta_str.lower() or "não tenho informações suficientes" in resposta_str.lower():
                # Se não souber, não adiciona ao histórico e retorna uma resposta vazia
                return jsonify({'answer': ''})
            else:
                CONVERSATION_HISTORY.append((user_input, resposta_str))
                return jsonify({'answer': resposta_str})

    except Exception as e:
        print(f"⚠️ Erro na consulta: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/clear_history', methods=['POST'])
def clear_history():
    """Endpoint para limpar o histórico de conversa"""
    CONVERSATION_HISTORY.clear()
    return jsonify({'status': 'Histórico limpo'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)