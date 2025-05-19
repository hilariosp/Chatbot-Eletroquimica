from flask import Flask, request, jsonify, render_template, Blueprint
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
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
- Se for perguntado algo fora de eletroquimica, baterias, eletrolise e pilha de daniell, diga que não pode responder a pergunta por estar fora do assunto
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
doc_path = "documentos"
try:
    if not Path(doc_path).exists():
        Path(doc_path).mkdir(exist_ok=True)
        print(f"⚠️ Diretório '{doc_path}' criado (vazio)")

    documents = SimpleDirectoryReader(doc_path).load_data()
    index = VectorStoreIndex.from_documents(documents)

    # Configuração correta do query engine com system_prompt
    query_engine = index.as_query_engine(
        streaming=True,
        similarity_top_k=3,
        node_postprocessors=[],
        llm=Settings.llm
    )

    # Definir o system_prompt no LLM
    Settings.llm.system_prompt = SYSTEM_PROMPT

except Exception as e:
    print(f"⚠️ Erro ao carregar documentos: {str(e)}")
    query_engine = None

# Verificação e criação do diretório de questões
questoes_path = "questoes"
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

@app.route('/query', methods=['POST'])
def handle_query():
    global current_question_data
    try:
        if not request.is_json:
            return jsonify({'error': 'Request must be JSON'}), 400

        data = request.get_json()
        user_input = data.get('query', '').strip().lower()

        if not user_input:
            return jsonify({'error': 'Query cannot be empty'}), 400

        if "gerar questões" in user_input:
            if formatted_questions_list:
                current_question_data = random.choice(formatted_questions_list)
                response = current_question_data['pergunta']
                CONVERSATION_HISTORY.append((user_input, response))
                return jsonify({'answer': response})
            else:
                response = "Não há questões formatadas salvas na pasta."
                CONVERSATION_HISTORY.append((user_input, response))
                return jsonify({'answer': response})
        elif current_question_data:
            user_answer = user_input
            correct_answer = current_question_data['resposta_correta']
            question_text = current_question_data['pergunta']

            if query_engine:
                if user_answer == correct_answer:
                    explanation_prompt = f"Explique por que a resposta '{correct_answer.upper()}' está correta para a seguinte questão: '{question_text}'"
                else:
                    explanation_prompt = f"Explique qual é a resposta correta para a seguinte questão: '{question_text}'. A resposta correta é '{correct_answer.upper()}'."

                explanation_response = query_engine.query(explanation_prompt)
                explanation = str(explanation_response)
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
from flask import Flask
from flask_cors import CORS
from eletroquimica.app.llm_setup import configure_llm, load_documents
from eletroquimica.app.main import main_bp
from eletroquimica.app.api import api_bp

def create_app():
    app = Flask(__name__)
    CORS(app)

    # Configurações
    app.config['SECRET_KEY'] = 'sua_chave_secreta'

    # Configura IA
    if not configure_llm():
        raise RuntimeError("Erro na configuração do LLM")

    app.query_engine = load_documents()  # Disponibiliza o query_engine no app

    # Se o query_engine não for carregado corretamente, lançar erro
    if not app.query_engine:
        raise RuntimeError("Erro ao carregar documentos e criar o query engine.")

    # Registra Blueprints
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix='/api')

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)
