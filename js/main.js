/**
 * @file js/main.js
 * @description Este arquivo contém a lógica principal do chatbot PilhIA,
 * incluindo o gerenciamento do estado do chat, carregamento de dados,
 * interação com a API do OpenRouter e processamento de consultas do usuário.
 * As chaves da API do OpenRouter são carregadas de variáveis de ambiente
 * para maior segurança.
 */

// Objeto global para manter o estado do chat.
const chatState = {
    chatId: null, // ID da sessão de chat, se aplicável
    currentQuestionData: null, // Armazena os dados da questão atual em jogo
    questionsList: [], // Lista de questões carregadas
    potentialsTable: {}, // Tabela de potenciais padrão carregada
    knowledgeBase: "" // Base de conhecimento carregada para a IA
};

/**
 * @type {string[]} OPENROUTER_API_KEYS
 * @description Array para armazenar as chaves da API do OpenRouter.
 * Estas chaves são carregadas de variáveis de ambiente (VITE_OPENROUTER_API_KEYS)
 * durante o processo de build para segurança.
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

/**
 * @function displayMessage
 * @description Adiciona uma mensagem ao contêiner de chat na interface do usuário.
 * @param {string} sender O remetente da mensagem ('user' ou 'PilhIA').
 * @param {string} message O texto da mensagem.
 */
function displayMessage(sender, message) {
    const chatOutput = document.getElementById('chat-output');
    if (chatOutput) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        messageElement.innerHTML = `<p><strong>${sender === 'user' ? 'Você' : 'PilhIA'}:</strong> ${message}</p>`;
        chatOutput.appendChild(messageElement);
        chatOutput.scrollTop = chatOutput.scrollHeight; // Rola para o final do chat
    } else {
        console.error("Elemento 'chat-output' não encontrado.");
    }
}

/**
 * @async
 * @function handleUserInput
 * @description Lida com a entrada do usuário do formulário de chat.
 * @param {Event} event O evento de submissão do formulário.
 */
async function handleUserInput(event) {
    event.preventDefault(); // Impede o recarregamento da página

    const userInputField = document.getElementById('user-input');
    if (!userInputField) {
        console.error("Elemento 'user-input' não encontrado.");
        return;
    }

    const userMessage = userInputField.value.trim();
    if (userMessage === '') {
        return; // Não processa mensagens vazias
    }

    displayMessage('user', userMessage);
    userInputField.value = ''; // Limpa o campo de entrada

    // Exibe um indicador de carregamento
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }

    try {
        const aiResponse = await processUserQuery(userMessage);
        displayMessage('PilhIA', aiResponse);
    } catch (error) {
        console.error("Erro ao processar a consulta do usuário:", error);
        displayMessage('PilhIA', "Desculpe, ocorreu um erro ao processar sua solicitação.");
    } finally {
        // Esconde o indicador de carregamento
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
}

/**
 * @function initializeChat
 * @description Função de inicialização principal da aplicação.
 * Carrega todos os dados necessários e configura os event listeners.
 */
async function initializeChat() {
    console.log("Iniciando PilhIA...");
    // Carrega os dados em sequência
    await loadPotentialsTable();
    await loadKnowledgeBase();
    await loadQuestions();
    console.log("PilhIA pronta para interagir!");

    // Configura o event listener para o formulário de chat
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', handleUserInput);
    } else {
        console.error("Elemento 'chat-form' não encontrado.");
    }
}

// Adiciona um event listener para garantir que o DOM esteja completamente carregado
// antes de inicializar o chat. Isso resolve o ReferenceError.
document.addEventListener('DOMContentLoaded', initializeChat);
