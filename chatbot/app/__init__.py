from flask import Flask
from flask_cors import CORS
from .models.llm_setup import configure_llm, load_documents
from .routes.main import main_bp
from .routes.api import api_bp

def create_app():
    app = Flask(__name__)
    CORS(app)
    
    # Configurações
    app.config['SECRET_KEY'] = 'sua_chave_secreta'
    
    # Configura IA
    if not configure_llm():  # Se falhar na configuração do LLM, deve parar aqui
        raise RuntimeError("Erro na configuração do LLM")
    
    app.query_engine = load_documents()  # Disponibiliza o query_engine no app
    
    # Se o query_engine não for carregado corretamente, lançar erro
    if not app.query_engine:
        raise RuntimeError("Erro ao carregar documentos e criar o query engine.")
    
    # Registra Blueprints
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix='/api')
    
    return app
