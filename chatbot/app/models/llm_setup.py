from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openrouter import OpenRouter
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

SYSTEM_PROMPT = """
Você é um assistente inteligente e prestativo com as seguintes diretrizes:
1. Mantenha respostas claras e concisas
2. Baseie-se na documentação fornecida
3. Se não souber a resposta, diga "Não sei responder isso"
4. Não responda nada que não seja sobre eletroquímica. Mesmo se for conteúdos de química, você só deve se basear no que disponibilizei.
"""

def configure_llm():
    """
    Configura o LLM (Modelo de Linguagem) e o Embedding.
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("⚠️ OPENROUTER_API_KEY não encontrado no arquivo .env")
        return None  # Não prossegue se a chave da API não for encontrada
    
    try:
        Settings.llm = OpenRouter(
            api_key=api_key,
            model="deepseek/deepseek-chat:free",
            api_base="https://openrouter.ai/api/v1",
            temperature=0.7,
            max_tokens=2400,
        )
        Settings.llm.system_prompt = SYSTEM_PROMPT
        Settings.embed_model = HuggingFaceEmbedding(
            model_name="BAAI/bge-small-en-v1.5"
        )
        print("✅ LLM configurado com sucesso!")
        return True
    except Exception as e:
        print(f"⚠️ Erro ao configurar o LLM: {str(e)}")
        return None

def load_documents():
    """
    Carrega os documentos e cria o motor de consulta (query engine).
    """
    doc_path = "documentos"
    
    try:
        if not Path(doc_path).exists():
            Path(doc_path).mkdir(exist_ok=True)
            print(f"⚠️ Diretório '{doc_path}' criado (vazio)")

        documents = SimpleDirectoryReader(doc_path).load_data()
        
        if not documents:
            print(f"⚠️ Nenhum documento encontrado no diretório '{doc_path}'")
            return None
        
        index = VectorStoreIndex.from_documents(documents)
        
        query_engine = index.as_query_engine(
            streaming=True,
            similarity_top_k=3,
            node_postprocessors=[],
            llm=Settings.llm
        )
        
        if not query_engine:
            print("⚠️ Falha ao criar o query engine")
            return None
        
        print("✅ Documentos carregados e query engine criado com sucesso!")
        return query_engine
    
    except Exception as e:
        print(f"⚠️ Erro ao carregar documentos: {str(e)}")
        return None
