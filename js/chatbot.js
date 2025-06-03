/**
 * @file chatbot.js
 * @description Este arquivo contém toda a lógica do frontend para o chatbot PilhIA,
 * incluindo gerenciamento de estado, carregamento de dados (questões, tabela de potenciais,
 * base de conhecimento), interação com a API do OpenRouter, processamento de consultas
 * do usuário, e toda a manipulação da interface do usuário e persistência de dados
 * do chat via localStorage.
 *
 * As chaves da API do OpenRouter são carregadas de variáveis de ambiente (VITE_OPENROUTER_API_KEYS)
 * injetadas pelo Vite durante o processo de build para maior segurança.
 */

// Objeto global para manter o estado do chat da IA.
const chatState = {
    chatId: null, // ID da sessão de chat atual
    currentQuestionData: null, // Armazena os dados da questão atual em jogo
    questionsList: [], // Lista de questões de eletroquímica carregadas
    potentialsTable: {}, // Tabela de potenciais padrão de eletrodos carregada
    knowledgeBase: "" // Conteúdo da base de conhecimento para a IA
};

/**
 * @type {string[]} OPENROUTER_API_KEYS
 * @description Array para armazenar as chaves da API do OpenRouter.
 * Estas chaves são carregadas de variáveis de ambiente (VITE_OPENROUTER_API_KEYS)
 * injetadas pelo Vite durante o processo de build para segurança.
 */
let OPENROUTER_API_KEYS = [];
try {
    // Acessa a variável de ambiente VITE_OPENROUTER_API_KEYS, que é injetada pelo Vite.
    // O '|| "[]"' garante que, se a variável não estiver definida, ele use uma string vazia
    // de array JSON para evitar erros de parse.
    const apiKeysString = import.meta.env.VITE_OPENROUTER_API_KEYS || "[]";
    OPENROUTER_API_KEYS = JSON.parse(apiKeysString);

    // Verifica se o resultado do parse é realmente um array.
    if (!Array.isArray(OPENROUTER_API_KEYS)) {
        OPENROUTER_API_KEYS = [];
        console.error("VITE_OPENROUTER_API_KEYS não é um array JSON válido. Usando array vazio para as chaves da API.");
    }
} catch (e) {
    // Captura erros durante o parse do JSON da variável de ambiente.
    console.error("Erro ao parsear VITE_OPENROUTER_API_KEYS:", e);
    OPENROUTER_API_KEYS = []; // Em caso de erro, define como um array vazio.
}

/**
 * @function getRandomOpenRouterApiKey
 * @description Seleciona uma chave de API aleatória da lista de chaves disponíveis.
 * @returns {string|null} Uma chave de API aleatória ou null se nenhuma chave estiver configurada.
 */
function getRandomOpenRouterApiKey() {
    if (OPENROUTER_API_KEYS.length === 0) {
        console.error("Erro: Nenhuma chave da API do OpenRouter configurada ou carregada. A IA não estará disponível.");
        return null;
    }
    const randomIndex = Math.floor(Math.random() * OPENROUTER_API_KEYS.length);
    return OPENROUTER_API_KEYS[randomIndex];
}

/**
 * @async
 * @function loadQuestions
 * @description Carrega as questões de eletroquímica de um arquivo JSON local.
 * Formata as questões para uso no chat.
 */
async function loadQuestions() {
    try {
        const response = await fetch('./data/questoes/eletroquimica.json');
        if (!response.ok) {
            throw new Error(`Erro ao carregar questões: ${response.statusText}`);
        }
        const data = await response.json();

        let formattedQuestions = [];
        if (Array.isArray(data)) {
            // Limita a 10 questões para evitar sobrecarga, se houver muitas.
            data.slice(0, 10).forEach(item => {
                const questionText = item.questao;
                const alternatives = item.alternativas;
                const correctAnswer = item.resposta_correta;
                if (questionText && alternatives && correctAnswer) {
                    let formattedAnswer = `${questionText}\n`;
                    // Limita a 4 alternativas para o formato de exibição.
                    Object.entries(alternatives).slice(0, 4).forEach(([letter, option]) => {
                        formattedAnswer += `(${letter.toUpperCase()}) ${option}\n`;
                    });
                    formattedQuestions.push({
                        pergunta: formattedAnswer,
                        alternativas: alternatives,
                        resposta_correta: correctAnswer.toLowerCase()
                    });
                }
            });
        } else if (typeof data === 'object' && data !== null) {
            // Caso o JSON contenha apenas uma questão (objeto único)
            const questionText = data.questao;
            const alternatives = data.alternativas;
            const correctAnswer = data.resposta_correta;
            if (questionText && alternatives && correctAnswer) {
                let formattedAnswer = `${questionText}\n`;
                Object.entries(alternatives).slice(0, 4).forEach(([letter, option]) => {
                    formattedAnswer += `(${letter.toUpperCase()}) ${option}\n`;
                });
                formattedQuestions.push({
                    pergunta: formattedAnswer,
                    alternativas: alternatives,
                    resposta_correta: correctAnswer.toLowerCase()
                });
            }
        }

        chatState.questionsList = formattedQuestions;
        console.log(`✅ ${chatState.questionsList.length} questões carregadas.`);
    } catch (error) {
        console.error("⚠️ Erro ao carregar questões:", error);
        chatState.questionsList = []; // Garante que a lista esteja vazia em caso de erro.
    }
}

/**
 * @async
 * @function loadPotentialsTable
 * @description Carrega a tabela de potenciais padrão de um arquivo JSON local.
 */
async function loadPotentialsTable() {
    try {
        const response = await fetch('./data/tabelas/tabela_potenciais.json');
        if (!response.ok) {
            throw new Error(`Erro ao carregar tabela de potenciais: ${response.statusText}`);
        }
        const data = await response.json();

        let potentials = {};
        data.forEach(item => {
            const metal = item.metal;
            const potential = item.potencial;
            if (metal && potential !== undefined) {
                potentials[metal.toLowerCase()] = potential;
            }
        });
        chatState.potentialsTable = potentials;
        console.log("✅ Tabela de potenciais carregada.");
    } catch (error) {
        console.error("⚠️ Erro ao carregar tabela de potenciais:", error);
        chatState.potentialsTable = {}; // Garante que a tabela esteja vazia em caso de erro.
    }
}

/**
 * @async
 * @function loadKnowledgeBase
 * @description Carrega o conteúdo da base de conhecimento de eletroquímica de um arquivo JSON local.
 * Limita o tamanho do conteúdo para evitar exceder o limite de tokens da API.
 */
async function loadKnowledgeBase() {
    let content = "";
    const knowledgeBaseFile = './data/basededados/eletroquimica.json';

    try {
        const response = await fetch(knowledgeBaseFile);
        if (!response.ok) {
            console.warn(`Ficheiro da base de dados não encontrado ou erro ao carregar ${knowledgeBaseFile}: ${response.statusText}`);
            chatState.knowledgeBase = "";
            return;
        }
        const jsonData = await response.json();

        let fileText = "";
        if (Array.isArray(jsonData)) {
            // Se for um array de objetos, formata cada item.
            fileText = jsonData.map(item => {
                let formattedItem = "";
                if (item.topico) formattedItem += `Tópico: ${item.topico}\n`;
                if (item.conteudo) formattedItem += `Conteúdo: ${item.conteudo}\n`;
                if (item.palavras_chave && item.palavras_chave.length > 0) {
                    formattedItem += `Palavras-chave: ${item.palavras_chave.join(", ")}\n`;
                }
                return formattedItem;
            }).join("\n---\n");
        } else {
            // Se for um objeto único, stringify.
            fileText = JSON.stringify(jsonData, null, 2);
        }

        // Adiciona o conteúdo da base de dados, limitando o tamanho.
        content += `\n--- Conteúdo de ${knowledgeBaseFile} ---\n${fileText.substring(0, 7500)}\n`;
        chatState.knowledgeBase = content.substring(0, 8000); // Limite final para a base de conhecimento.
        console.log(`📖 Base de dados carregada (${chatState.knowledgeBase.length} caracteres).`);
    } catch (error) {
        console.error(`⚠️ Erro ao ler ou processar a base de dados JSON '${knowledgeBaseFile}':`, error);
        chatState.knowledgeBase = ""; // Garante que a base de conhecimento esteja vazia em caso de erro.
    }
}

/**
 * @function calcularVoltagemPilha
 * @description Calcula a voltagem de uma pilha dados dois eletrodos,
 * usando a tabela de potenciais carregada.
 * @param {string} eletrodosStr Uma string contendo os dois eletrodos separados por 'e' (ex: 'cobre e zinco').
 * @returns {string} A voltagem calculada ou uma mensagem de erro.
 */
function calcularVoltagemPilha(eletrodosStr) {
    const eletrodos = eletrodosStr.split(' e ').map(e => e.trim().toLowerCase()).filter(e => e);

    if (eletrodos.length !== 2) {
        return "Por favor, especifique exatamente dois eletrodos separados por 'e' (ex: 'cobre e zinco').";
    }

    const potentials = {};
    for (const eletrodo of eletrodos) {
        let foundMatch = false;
        for (const keyMetal in chatState.potentialsTable) {
            // Procura por correspondência parcial no nome do metal na tabela
            if (keyMetal.includes(eletrodo)) {
                potentials[eletrodo] = chatState.potentialsTable[keyMetal];
                foundMatch = true;
                break;
            }
        }
        if (!foundMatch) {
            return `Não encontrei o potencial padrão para '${eletrodo}'. Verifique a grafia ou se está na tabela.`;
        }
    }

    if (Object.keys(potentials).length < 2) {
        return "Não foi possível encontrar potenciais para ambos os eletrodos. Verifique a grafia.";
    }

    // Identifica cátodo (maior potencial) e ânodo (menor potencial)
    const catodoName = Object.keys(potentials).reduce((a, b) => potentials[a] > potentials[b] ? a : b);
    const anodoName = Object.keys(potentials).reduce((a, b) => potentials[a] < potentials[b] ? a : b);
    const voltagem = potentials[catodoName] - potentials[anodoName];

    return `A voltagem da pilha com ${catodoName.charAt(0).toUpperCase() + catodoName.slice(1)} e ${anodoName.charAt(0).toUpperCase() + anodoName.slice(1)} é de ${voltagem.toFixed(2)} V.`;
}

/**
 * @function generateQuestion
 * @description Seleciona uma questão aleatória da lista de questões carregadas.
 * @returns {string} A pergunta formatada da questão ou uma mensagem de que não há questões.
 */
function generateQuestion() {
    if (chatState.questionsList.length === 0) {
        return "Não há mais questões disponíveis.";
    }
    const q = chatState.questionsList[Math.floor(Math.random() * chatState.questionsList.length)];
    chatState.currentQuestionData = q; // Armazena a questão atual para futuras interações.
    return q.pergunta;
}

/**
 * @async
 * @function callOpenRouterAPI
 * @description Faz uma chamada à API do OpenRouter para gerar uma resposta da IA.
 * @param {string} prompt O prompt do usuário para a IA.
 * @param {string} systemPrompt O prompt do sistema que define o comportamento da IA.
 * @param {string} [model="meta-llama/llama-3.2-3b-instruct:free"] O modelo da IA a ser usado.
 * @param {number} [temperature=0.5] A temperatura para a geração da IA (controla a criatividade).
 * @param {number} [max_tokens=1500] O número máximo de tokens na resposta da IA.
 * @returns {Promise<string>} A resposta da IA ou uma mensagem de erro.
 */
async function callOpenRouterAPI(prompt, systemPrompt, model = "meta-llama/llama-3.2-3b-instruct:free", temperature = 0.5, max_tokens = 1500) {
    const currentApiKey = getRandomOpenRouterApiKey();
    if (!currentApiKey) {
        return "⚠️ Erro: Nenhuma chave da API configurada. A IA não está disponível.";
    }

    try {
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
        ];

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + currentApiKey,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.origin, // Necessário para OpenRouter
                "X-Title": "PilhIA Frontend" // Necessário para OpenRouter
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: temperature,
                max_tokens: max_tokens
            })
        });

        if (!response.ok) {
            let errorDetails = "Erro desconhecido da API.";
            try {
                const errorText = await response.text();
                try {
                    const errorData = JSON.parse(errorText);
                    console.error("Detalhes do erro da API OpenRouter (raw JSON):", errorData);

                    if (errorData.message) {
                        errorDetails = errorData.message;
                    } else if (errorData.error && typeof errorData.error === 'string') {
                        errorDetails = errorData.error;
                    } else if (errorData.error && errorData.error.message) {
                        errorDetails = errorData.error.message;
                    } else if (errorData.detail) {
                        errorDetails = errorData.detail;
                    } else {
                        errorDetails = JSON.stringify(errorData, null, 2);
                    }
                } catch (jsonParseError) {
                    errorDetails = `Resposta da API não é JSON válido. Texto: ${errorText.substring(0, 500)}... (Erro de parse: ${jsonParseError.message})`;
                }
            } catch (readError) {
                errorDetails = `Erro ao ler resposta da API: ${readError.message}. Status HTTP: ${response.status} ${response.statusText}`;
            }
            throw new Error(`Erro na API OpenRouter (Status: ${response.status}): ${errorDetails}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "Sem resposta da IA.";

    } catch (error) {
        console.error("Erro ao chamar a API do OpenRouter:", error);
        const displayError = error instanceof Error ? error.message : String(error);
        return `⚠️ Erro na comunicação com a IA: ${displayError}.`;
    }
}

// Prompt do sistema para o chatbot PilhIA, definindo seu comportamento e restrições.
const SYSTEM_PROMPT_CHATBOT = `
Você é PilhIA, um assistente especializado e focado EXCLUSIVAMENTE em eletroquímica, baterias, eletrólise e pilha de Daniell.

1. COMPORTAMENTO:
- Mantenha respostas claras, concisas e diretamente relacionadas à eletroquímica.
- **FORNEÇA RESPOSTAS APENAS COM BASE NA DOCUMENTAÇÃO DE REFERÊNCIA EXPLÍCITAMENTE FORNECIDA NO CONTEXTO. NÃO BUSQUE INFORMAÇÕES EXTERNAS.**
- **Se a pergunta for para 'entender' ou 'explicar' um conceito presente no contexto (ex: 'Quero entender eletroquímica', 'Explique a eletrólise'), você DEVE usar o conteúdo da base de dados para fornecer uma explicação clara e concisa.**
- **Se o usuário solicitar uma explicação usando analogias (ex: 'Explique eletroquímica fazendo analogias com um jogo'), você PODE usar analogias, desde que elas sirvam para CLARIFICAR os conceitos de eletroquímica presentes na sua base de dados. A analogia deve ser uma FERRAMENTA de ensino, não uma forma de introduzir informações externas ou fora do escopo.**
- Se o conceito não estiver explicitamente no contexto, ou a pergunta for muito vaga ou fora do tópico de eletroquímica (baterias, eletrólise, pilha de Daniell), responda APENAS E EXCLUSIVAMENTE: "Não sei responder isso".
- Se a pergunta for incompleta (ex: 'o que é a'), responda: "Não sei responder isso".
- Se for perguntado algo fora de eletroquímica (baterias, eletrólise, pilha de Daniell), responda que não pode responder por estar fora do assunto.
- Se pedir questões sobre eletroquímica, você deve pegar elas diretamente da sua lista de questões (que está no seu contexto), e soltar apenas uma por vez.
- Ao explicar a resposta de uma questão, forneça APENAS a justificativa conceitual e quimicamente ACURADA para a alternativa CORRETA. NÃO re-afirme a letra da alternativa correta, NÃO mencione outras alternativas e NÃO tente re-calcular ou re-raciocinar a questão. Sua explicação deve ser uma justificativa direta, concisa e precisa, focando nos princípios da eletroquímica.

2. FORMATO:
- Use parágrafos curtos e marcadores quando apropriado.
- Não faça uso de formatações complexas como LaTeX ou fórmulas matemáticas embutidas no texto; use texto simples.
- Para listas longas, sugira uma abordagem passo a passo.
- Para as questões pedidas, você deve copiar ela totalmente, menos a resposta correta (a não ser que o usuário peça questões com resposta correta).

3. RESTRIÇÕES ABSOLUTAS:
- NUNCA INVENTE INFORMAÇÕES.
- NUNCA BUSQUE INFORMAÇÕES NA INTERNET.
- NUNCA RESPONDA A PERGUNTAS FORA DO ESCOPO DE ELETROQUÍMICA (baterias, eletrólise, pilha de Daniell).
- Não responda perguntas sobre temas sensíveis ou ilegais.
- Não gere conteúdo ofensivo ou discriminatório.

4. INTERAÇÃO:
- Peça esclarecimentos se a pergunta for ambígua.
- Para perguntas complexas, sugira dividi-las em partes menores.
- Confirme se respondeu adequadamente à dúvida.
`;

/**
 * @async
 * @function processUserQuery
 * @description Processa a entrada do usuário, determinando a intenção e gerando uma resposta.
 * @param {string} user_input A consulta do usuário.
 * @returns {Promise<string>} A resposta do chatbot.
 */
async function processUserQuery(user_input) {
    const user_lower = user_input.toLowerCase();
    let response = "";

    // Verifica se a consulta é para calcular voltagem de pilha
    if (user_lower.includes("calcular a voltagem de uma pilha de")) {
        const eletrodosStr = user_lower.split("de uma pilha de")[1].trim();
        response = calcularVoltagemPilha(eletrodosStr);
        chatState.currentQuestionData = null; // Reseta a questão atual se for uma nova consulta.
    } else if (chatState.currentQuestionData) {
        // Se houver uma questão em andamento
        const questionData = chatState.currentQuestionData;
        const correct_answer_letter = questionData.resposta_correta.toLowerCase();

        if (user_lower === "sim") {
            // Se o usuário quer outra questão
            response = generateQuestion();
            if (response.includes("Não há mais questões disponíveis.")) {
                chatState.currentQuestionData = null;
            }
        } else if (user_lower === "não") {
            // Se o usuário não quer mais questões
            response = "Ótimo. Deseja mais alguma coisa?";
            chatState.currentQuestionData = null;
        } else if (['a', 'b', 'c', 'd', 'e'].includes(user_lower)) {
            // Se o usuário respondeu à questão
            const explanationPrompt = (
                `Para a questão: '${questionData.pergunta}'\n`
                + `A alternativa correta é '(${correct_answer_letter.toUpperCase()})'. `
                + `Forneça a justificativa conceitual e quimicamente ACURADA para esta alternativa, `
                + `focando nos princípios da eletroquímica. `
                + `Seja conciso e preciso. **NÃO re-afirme a letra da alternativa correta, `
                + `NÃO mencione outras alternativas e NÃO tente re-calcular ou re-raciocinar a questão.**`
            );
            const explanation = await callOpenRouterAPI(explanationPrompt, SYSTEM_PROMPT_CHATBOT);

            const isCorrect = (user_lower === correct_answer_letter);
            if (isCorrect) {
                response = `Você acertou! A resposta correta é (${correct_answer_letter.toUpperCase()}).\n${explanation}\nDeseja fazer outra questão? (sim/não)`;
            } else {
                response = `Você errou. A resposta correta é (${correct_answer_letter.toUpperCase()}).\n${explanation}\nDeseja fazer outra questão? (sim/não)`;
            }
        } else {
            // Se a resposta não for 'sim', 'não' ou uma alternativa, trata como uma consulta geral.
            chatState.currentQuestionData = null; // Reseta a questão atual.
            const generalPrompt = `Contexto: ${chatState.knowledgeBase.substring(0, 7000)}\n\nPergunta: ${user_input.substring(0, 300)}`;
            response = await callOpenRouterAPI(generalPrompt, SYSTEM_PROMPT_CHATBOT);
        }
    } else if (user_lower.includes("gerar questões") || user_lower.includes("questões enem") || user_lower.includes("questão")) {
        // Se o usuário pede por questões
        response = generateQuestion();
    } else {
        // Para todas as outras consultas, usa a base de conhecimento e a IA.
        const generalPrompt = `Contexto: ${chatState.knowledgeBase.substring(0, 7000)}\n\nPergunta: ${user_input.substring(0, 300)}`;
        response = await callOpenRouterAPI(generalPrompt, SYSTEM_PROMPT_CHATBOT);
    }

    return response;
}

// --- Funções de UI e Gerenciamento de Chat (do seu código original) ---

/**
 * @function toggleSidebar
 * @description Alterna a visibilidade da barra lateral.
 * Esta função é chamada diretamente via `onclick` no HTML.
 */
function toggleSidebar() {
    const sidebarContent = document.getElementById('sidebarContent');
    if (sidebarContent) {
        sidebarContent.classList.toggle('show');
    }
}

/**
 * @function addSuggestionsToChat
 * @description Adiciona cartões de sugestão de perguntas ao contêiner do chat.
 */
function addSuggestionsToChat() {
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input'); // Obtém o input para preencher
    if (!chatContainer || !userInput) {
        console.warn("Elementos 'chat-container' ou 'user-input' não encontrados para adicionar sugestões.");
        return;
    }

    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'suggestions mt-5';
    suggestionsDiv.innerHTML = `
        <div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 g-4 justify-content-center">
            <div class="col-md-4">
                <div class="card suggestion-card" data-suggestion="Gerar questões sobre eletroquímica">
                    <div class="card-body text-center">
                        <h6 class="card-title">Questões ENEM</h6>
                        <p class="card-text small">Gera questões no estilo ENEM e vestibular sobre eletroquímica</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card suggestion-card" data-suggestion="Quero ajuda para entender [problema]">
                    <div class="card-body text-center">
                        <h6 class="card-title">Resolver Dúvidas</h6>
                        <p class="card-text small">Tire dúvidas sobre determinado assunto do campo de eletroquímica.</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card suggestion-card" data-suggestion="Calcular a voltagem de uma pilha de [eletrodo 1] e [eletrodo 2]">
                    <div class="card-body text-center">
                        <h6 class="card-title">Pilha Virtual</h6>
                        <p class="card-text small">Monte uma pilha virtual e calcule a voltagem.</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card suggestion-card" data-suggestion="Explicar eletroquímica fazendo analogias com [insira]">
                    <div class="card-body text-center">
                        <h6 class="card-title">Analogias</h6>
                        <p class="card-text small">Explique eletroquímica fazendo analogias com determinado tema ou assunto</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const existingSuggestions = chatContainer.querySelector('.suggestions');
    if (existingSuggestions) {
        chatContainer.removeChild(existingSuggestions); // Remove sugestões existentes antes de adicionar novas
    }
    chatContainer.appendChild(suggestionsDiv);

    const suggestionCards = chatContainer.querySelectorAll('.suggestion-card');
    suggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            const suggestionText = card.getAttribute('data-suggestion');
            userInput.value = suggestionText;
            userInput.focus(); // Coloca o foco no input após preencher
        });
    });
}

/**
 * @function removeSuggestionsFromChat
 * @description Remove os cartões de sugestão do contêiner do chat.
 */
function removeSuggestionsFromChat() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;
    const suggestionsDiv = chatContainer.querySelector('.suggestions');
    if (suggestionsDiv) {
        chatContainer.removeChild(suggestionsDiv);
    }
}

let chats = {}; // Objeto para armazenar todas as conversas
let currentChatId = null; // ID da conversa atual
let chatToDelete = null; // Usado para confirmar exclusão de chat

/**
 * @function saveChats
 * @description Salva o objeto 'chats' no localStorage.
 */
function saveChats() {
    localStorage.setItem('pilhia-chats', JSON.stringify(chats));
}

/**
 * @function loadChatHistory
 * @description Carrega e exibe o histórico de chats na barra lateral.
 */
function loadChatHistory() {
    const chatHistoryContainer = document.getElementById('chat-history-container');
    if (!chatHistoryContainer) {
        console.warn("Elemento 'chat-history-container' não encontrado.");
        return;
    }
    chatHistoryContainer.innerHTML = ''; // Limpa o histórico antes de recarregar

    // Ordena os chats pela data de criação (mais recente primeiro)
    const sortedChats = Object.values(chats).sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    );

    sortedChats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = 'chat-history';
        chatElement.dataset.chatId = chat.id;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'chat-history-title';
        titleSpan.textContent = chat.title;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-chat-btn';
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>'; // Ícone de lixeira (requer Bootstrap Icons ou similar)
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Impede que o clique no botão de exclusão carregue o chat
            showDeleteConfirmation(chat.id);
        });

        chatElement.appendChild(titleSpan);
        chatElement.appendChild(deleteBtn);

        chatElement.addEventListener('click', () => {
            loadChat(chat.id); // Carrega o chat ao clicar no item do histórico
        });

        chatHistoryContainer.appendChild(chatElement);
    });
}

/**
 * @function loadChat
 * @description Carrega uma conversa específica no contêiner principal do chat.
 * @param {string} chatId O ID da conversa a ser carregada.
 */
function loadChat(chatId) {
    currentChatId = chatId;
    localStorage.setItem('currentChatId', currentChatId);
    chatState.chatId = currentChatId; // Atualiza o chatState global

    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) {
        console.error("Elemento 'chat-container' não encontrado.");
        return;
    }
    chatContainer.innerHTML = ''; // Limpa o chat atual

    removeSuggestionsFromChat(); // Sempre remove sugestões ao carregar um chat

    const chat = chats[chatId];
    if (!chat || chat.messages.length === 0) {
        // Se o chat não existe ou está vazio, exibe a mensagem de boas-vindas e sugestões
        chatContainer.innerHTML = `
            <div class="text-center mt-5 pt-5">
                <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
            </div>`;
        addSuggestionsToChat(); // Adiciona sugestões apenas se o chat estiver vazio
    } else {
        // Exibe as mensagens existentes
        chat.messages.forEach(msg => {
            addMessage(msg.content, msg.isUser, false); // Não salva novamente ao carregar
        });
    }
    chatContainer.scrollTop = chatContainer.scrollHeight; // Rola para o final do chat
}

/**
 * @function createNewChat
 * @description Cria uma nova conversa, reseta o contêiner do chat e exibe sugestões.
 */
function createNewChat() {
    currentChatId = 'temp-' + Date.now().toString(); // ID temporário para novos chats
    localStorage.setItem('currentChatId', currentChatId);
    chatState.chatId = currentChatId; // Atualiza o chatState global

    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    if (!chatContainer || !userInput) {
        console.error("Elementos 'chat-container' ou 'user-input' não encontrados.");
        return;
    }

    chatContainer.innerHTML = `
        <div class="text-center mt-5 pt-5">
            <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
        </div>`;
    addSuggestionsToChat(); // Adiciona sugestões para o novo chat
    userInput.focus(); // Coloca o foco no campo de entrada
}

/**
 * @function addMessage
 * @description Adiciona uma mensagem ao contêiner principal do chat e, opcionalmente, ao histórico.
 * @param {string} content O conteúdo da mensagem.
 * @param {boolean} isUser True se a mensagem for do usuário, false se for do bot.
 * @param {boolean} [saveToHistory=true] Se a mensagem deve ser salva no localStorage.
 */
function addMessage(content, isUser = false, saveToHistory = true) {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) {
        console.error("Elemento 'chat-container' não encontrado para adicionar mensagem.");
        return;
    }

    const timestamp = new Date();
    const hours = timestamp.getHours().toString().padStart(2, '0');
    const minutes = timestamp.getMinutes().toString().padStart(2, '0');
    const timeString = `${hours}:${minutes}`;

    // Lógica para criar um novo chat permanente quando a primeira mensagem do usuário é enviada
    if (isUser && currentChatId.startsWith('temp-')) {
        const newChatId = Date.now().toString(); // Cria um ID permanente
        chats[newChatId] = {
            id: newChatId,
            title: content.length > 30 ? content.substring(0, 30) + '...' : content, // Título baseado na primeira mensagem
            messages: [{
                content,
                isUser: true,
                timestamp: timestamp.toISOString()
            }],
            createdAt: timestamp.toISOString()
        };
        currentChatId = newChatId; // Atualiza o ID da conversa atual para o novo ID permanente
        localStorage.setItem('currentChatId', currentChatId);
        chatState.chatId = currentChatId; // Atualiza o chatState global
        saveChats();
        loadChatHistory(); // Recarrega o histórico para mostrar o novo chat
    } else if (saveToHistory && chats[currentChatId]) {
        // Adiciona a mensagem ao chat existente
        const chat = chats[currentChatId];
        chat.messages.push({
            content,
            isUser,
            timestamp: timestamp.toISOString()
        });

        // Atualiza o título do chat se for a primeira mensagem do usuário (e não era um chat temporário)
        if (isUser && chat.messages.length === 1 && !chat.title) {
            chat.title = content.length > 30 ? content.substring(0, 30) + '...' : content;
        }
        saveChats();
        loadChatHistory();
    }

    // Remove o placeholder de boas-vindas e as sugestões quando uma mensagem é adicionada
    const placeholder = chatContainer.querySelector('.text-center');
    if (placeholder) {
        chatContainer.removeChild(placeholder);
    }
    removeSuggestionsFromChat();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message p-3 ${isUser ? 'user-message' : 'bot-message'}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = timeString;
    messageDiv.appendChild(timeSpan);

    // Divide o conteúdo por quebras de linha e cria parágrafos para cada linha
    const lines = content.split('\n');
    lines.forEach(line => {
        const paragraph = document.createElement('p');
        paragraph.innerHTML = line; // Usa innerHTML para permitir formatação básica se houver
        messageDiv.appendChild(paragraph);
    });

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight; // Rola para o final do chat
}

/**
 * @function showTyping
 * @description Exibe um indicador de "digitando" no chat.
 */
function showTyping() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'message p-3 bot-message typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>'; // Pontos de digitação
    typingDiv.id = 'typing-indicator';
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * @async
 * @function sendMessage
 * @description Lida com o envio de mensagens do usuário para o chatbot.
 */
async function sendMessage() {
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    if (!userInput || !sendButton) {
        console.error("Elementos 'user-input' ou 'send-button' não encontrados.");
        return;
    }

    const message = userInput.value.trim();
    if (!message) return; // Não envia mensagens vazias

    // Desabilita o input e o botão para evitar envios múltiplos
    userInput.disabled = true;
    userInput.value = 'Enviando...'; // Feedback visual
    sendButton.disabled = true;

    addMessage(message, true); // Adiciona a mensagem do usuário ao chat
    userInput.style.height = 'auto'; // Reseta a altura do input

    showTyping(); // Mostra o indicador de digitação

    try {
        const aiResponse = await processUserQuery(message); // Processa a consulta com a IA

        document.getElementById('typing-indicator')?.remove(); // Remove o indicador de digitação

        // Reabilita o input e o botão
        userInput.disabled = false;
        userInput.value = ''; // Limpa o input
        userInput.focus(); // Coloca o foco de volta no input

        sendButton.disabled = false;
        sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>'; // Restaura o ícone do botão

        addMessage(aiResponse, false); // Adiciona a resposta da IA ao chat

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        const typing = document.getElementById('typing-indicator');
        if (typing) typing.remove(); // Remove o indicador mesmo em caso de erro

        // Reabilita e restaura o input e o botão em caso de erro
        userInput.disabled = false;
        userInput.value = message; // Mantém a mensagem do usuário no input para reenvio
        userInput.focus();

        sendButton.disabled = false;
        sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

        addMessage('⚠️ Não foi possível conectar ao servidor ou processar a resposta.', false);
    }
}

/**
 * @function showDeleteConfirmation
 * @description Exibe um modal de confirmação para exclusão de chat.
 * @param {string} chatId O ID do chat a ser excluído.
 */
function showDeleteConfirmation(chatId) {
    const confirmDeleteModal = document.getElementById('confirm-delete');
    if (confirmDeleteModal) {
        chatToDelete = chatId; // Armazena o ID do chat a ser excluído
        confirmDeleteModal.style.display = 'flex'; // Exibe o modal
    }
}

/**
 * @function deleteChat
 * @description Exclui um chat do histórico e do localStorage.
 * @param {string} chatIdToDelete O ID do chat a ser excluído.
 */
function deleteChat(chatIdToDelete) {
    if (currentChatId === chatIdToDelete) {
        createNewChat(); // Se o chat atual for excluído, cria um novo
    }
    delete chats[chatIdToDelete]; // Remove o chat do objeto
    saveChats(); // Salva as alterações no localStorage
    loadChatHistory(); // Recarrega o histórico
    const confirmDeleteModal = document.getElementById('confirm-delete');
    if (confirmDeleteModal) confirmDeleteModal.style.display = 'none'; // Esconde o modal
    chatToDelete = null; // Reseta a variável
}

// --- Inicialização da Aplicação e Event Listeners ---

/**
 * @async
 * @function initializeChatApp
 * @description Função de inicialização principal da aplicação.
 * Carrega todos os dados necessários e configura os event listeners.
 */
async function initializeChatApp() {
    console.log("Iniciando PilhIA...");

    // Carrega os dados em paralelo para maior eficiência
    await Promise.all([
        loadPotentialsTable(),
        loadKnowledgeBase(),
        loadQuestions()
    ]);
    console.log("PilhIA pronta para interagir!");

    // Carrega o histórico de chats do localStorage
    chats = JSON.parse(localStorage.getItem('pilhia-chats')) || {};
    currentChatId = localStorage.getItem('currentChatId');

    // Inicializa o chat: se não há chat atual ou ele está vazio, cria um novo.
    // Caso contrário, carrega o chat existente.
    const initialChat = chats[currentChatId];
    if (!initialChat || initialChat.messages.length === 0) {
        createNewChat(); // Se não há chat ou está vazio, cria um novo com sugestões
    } else {
        loadChat(currentChatId); // Caso contrário, carrega o chat existente
    }
    loadChatHistory(); // Sempre carrega a lista de chats na sidebar

    // Configura os event listeners para os elementos da UI
    const sendButton = document.getElementById('send-button');
    const userInput = document.getElementById('user-input');
    const newChatBtn = document.getElementById('new-chat-btn');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn'); // Corrigido aqui
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    // A função toggleSidebar é chamada diretamente via onclick no HTML,
    // então não precisamos de um event listener aqui para sidebarToggleButton.
    // const sidebarToggleButton = document.getElementById('sidebarToggleButton');

    if (sendButton) sendButton.addEventListener('click', sendMessage);
    if (userInput) {
        userInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Impede quebra de linha no input ao pressionar Enter
                sendMessage();
            }
        });
        userInput.focus(); // Coloca o foco no input ao iniciar
    }
    if (newChatBtn) newChatBtn.addEventListener('click', createNewChat);
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', () => deleteChat(chatToDelete));
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            const confirmDeleteModal = document.getElementById('confirm-delete');
            if (confirmDeleteModal) confirmDeleteModal.style.display = 'none';
            chatToDelete = null;
        });
    }
    // Removido o listener para sidebarToggleButton, pois já é tratado via onclick no HTML
    // if (sidebarToggleButton) {
    //     sidebarToggleButton.addEventListener('click', toggleSidebar);
    // }
}

// Adiciona um event listener para garantir que o DOM esteja completamente carregado
// antes de inicializar toda a aplicação. Isso resolve problemas de "elemento não encontrado".
document.addEventListener('DOMContentLoaded', initializeChatApp);
