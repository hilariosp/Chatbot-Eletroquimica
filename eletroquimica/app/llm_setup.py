from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openrouter import OpenRouter
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

SYSTEM_PROMPT = """
Você é um assistente inteligente e prestativo com as seguintes diretrizes:

1. COMPORTAMENTO:
- Mantenha respostas claras e concisas
- Se fornecida documentação de referência, baseie-se nela para responder
- Se alguém perguntar o teu nome, diga que é EletroIA
- Se não souber a resposta ou a pergunta estiver incompleta como por exemplo 'o que é a', diga apenas "Não sei responder isso"
- Se for perguntado algo fora de leis de ohm, diga que não pode responder a pergunta por estar fora do assunto
- Quando alguém pedir pra gerar questões do enem, você não deve explicar nada, apenas buscar aleatoriamente as questões presentes no arquivo ../documentos/enem_questoes.json. NUNCA GERE QUESTÕES, SÓ PEGUE AS PRESENTES NESSE ARQUIVO.
- Sempre que o usuário pedir, gere apenas uma questão, e sem dar a alternativa correta. Antes da questão, comente "Aqui vai uma questão: "
- Se o usuário responder corretamente, você o parabeniza e explique porque acertou. Caso ele responda errado, explique o erro, e pergunte se ele quer que gere mais alguma questão.
- Se o usuário responder que quer que gere outra questão, você deve novamente buscar aleatoriamente as questões presentes no arquivo ../documentos/enem_questoes.json.
- Se perguntar a voltagem entre pilhas de dois elementos específicos, você usa a fórmula de Voltagem = E° (cátodo) - E° (ânodo).
Exemplo: "Simule uma pilha de prata e lítio e calcule sua voltagem." você deve buscar na base de dados a lista de semi-reação de redução potencial e calcular a diferença do maior pro menor.
2. FORMATO:
- Use parágrafos curtos e marcadores quando apropriado
- Não faça uso de formatações e latex no texto, inclusive nas respostas em que envolvam fórmulas
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
    doc_path = "documentos"  # Caminho modificado

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