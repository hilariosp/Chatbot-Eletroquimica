from flask import Flask, request, jsonify
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openrouter import OpenRouter
from flask_cors import CORS
from pathlib import Path
import os
from collections import deque

app = Flask(__name__)
CORS(app)  # Habilita CORS para todas as rotas

# Configuração do OpenRouter
Settings.llm = OpenRouter(
    api_key="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",
    model="deepseek/deepseek-chat:free",
    api_base="https://openrouter.ai/api/v1",
    temperature=0.7
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
- Se alguém perguntar o teu nome, diga que é DanielIA
- Se não souber a resposta ou a pergunta estiver incompleta como por exemplo 'o que é a', diga apenas "Não sei responder isso"
- Se for perguntado algo fora de eletroquimica, baterias, eletrolise e pilha de daniell, diga que não pode responder a pergunta por estar fora do assunto
2. FORMATO:
- Use parágrafos curtos e marcadores quando apropriado
- Não faça uso de formatações e latex no texto, inclusive nas respostas em que envolvam formulas
- Para listas longas, sugira uma abordagem passo a passo

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
CONVERSATION_HISTORY = deque(maxlen=10)  # Mantém as últimas 10 interações

# Verificação do diretório de documentos
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
    try:
        if not request.is_json:
            return jsonify({'error': 'Request must be JSON'}), 400
        
        data = request.get_json()
        user_input = data.get('query', '').strip()
        
        if not user_input:
            return jsonify({'error': 'Query cannot be empty'}), 400
        
        if not query_engine:
            return jsonify({'answer': '⚠️ Sistema não está pronto. Verifique os documentos.'})
        
        # Construir prompt com histórico
        full_prompt = build_prompt_with_history(user_input)
        
        # Obter resposta
        resposta = query_engine.query(full_prompt)
        resposta_str = str(resposta)
        
        # Armazenar no histórico
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