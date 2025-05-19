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