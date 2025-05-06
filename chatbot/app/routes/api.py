from flask import Blueprint, request, jsonify, current_app
from collections import deque
from ..models.llm_setup import SYSTEM_PROMPT

# Histórico de conversas
CONVERSATION_HISTORY = deque(maxlen=10)

# Blueprint para a API
api_bp = Blueprint('api', __name__)

@api_bp.route('/query', methods=['POST'])
def handle_query():
    try:
        if not request.is_json:
            return jsonify({'error': 'Request must be JSON'}), 400
        
        data = request.get_json()
        user_input = data.get('query', '').strip()
        
        if not user_input:
            return jsonify({'error': 'Query cannot be empty'}), 400
        
        query_engine = current_app.query_engine
        if not query_engine:
            return jsonify({'answer': '⚠️ Sistema não está pronto. Verifique os documentos.'})

        resposta = query_engine.query(user_input)
        resposta_str = str(resposta)
        
        # Adiciona a consulta e a resposta no histórico
        CONVERSATION_HISTORY.append((user_input, resposta_str))
        
        return jsonify({'answer': resposta_str})

    except Exception as e:
        print(f"Erro na consulta: {str(e)}")
        return jsonify({'error': 'Ocorreu um erro ao processar a sua consulta. Tente novamente mais tarde.'}), 500

@api_bp.route('/clear_history', methods=['POST'])
def clear_history():
    CONVERSATION_HISTORY.clear()
    return jsonify({'status': 'Histórico limpo'})

@api_bp.route('/history', methods=['GET'])
def get_history():
    # Retorna o histórico de conversas como resposta
    history = [{"query": q, "response": r} for q, r in CONVERSATION_HISTORY]
    return jsonify({'history': history})
