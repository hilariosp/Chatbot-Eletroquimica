let openRouterApiKey = "%%OPENROUTER_API_KEY_PLACEHOLDER%%"; // Declarada APENAS UMA VEZ aqui.

// Função para verificar e solicitar chave API se necessário
function ensureApiKey() {
    if (!openRouterApiKey || openRouterApiKey.trim() === "") {
        const userKey = prompt("Por favor, insira sua chave API do OpenRouter:");
        if (userKey && userKey.trim() !== "") {
            openRouterApiKey = userKey.trim();
            return openRouterApiKey;
        } else {
            alert("Chave API é necessária para usar a IA.");
            return null;
        }
    }
    return openRouterApiKey;
}

async function callOpenRouterAPI(promptText, apiKey, model = "google/gemma-3-27b-it:free", maxTokens = 2500, temperature = 1.0) {
    console.log("Chamando OpenRouter API com:", { model, maxTokens, temperature });
    console.log("Prompt:", promptText.substring(0, 100) + "...");
    
    if (!apiKey) {
        console.error("Chave API da OpenRouter não fornecida ou está vazia.");
        return "Erro: Chave API não configurada.";
    }

    const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "RenovaIA Chat/Quiz"
    };

    const body = JSON.stringify({
        model: model,
        messages: [{ role: "user", content: promptText }],
        temperature: temperature,
        max_tokens: maxTokens,
    });

    console.log("Request body:", body);

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: headers,
            body: body
        });

        console.log("Response status:", response.status);
        console.log("Response headers:", Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenRouter API Error Response:", errorText);
            
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: { message: `Erro HTTP ${response.status}: ${response.statusText}` } };
            }
            
            const errorMessage = errorData?.error?.message || `Erro na API: ${response.statusText}`;
            return `Erro na API: ${errorMessage}`;
        }

        const responseText = await response.text();
        console.log("Response text:", responseText);
        
        const data = JSON.parse(responseText);
        console.log("Parsed response:", data);
        
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            console.error("Resposta da API não contém conteúdo:", data);
            return "Não obtive uma resposta válida da IA.";
        }
        
        return content;
    } catch (error) {
        console.error("Fetch error:", error);
        return `Erro ao conectar com a API OpenRouter: ${error.message}`;
    }
}

/**
 * @file chatbot.js
 * @description Este arquivo contém toda a lógica do frontend para o chatbot PilhIA,
 * incluindo gerenciamento de estado, carregamento de dados (tabela de potenciais,
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
    currentQuestionData: null, // Adicionado de volta para compatibilidade, mesmo sem quiz ativo
    questionsList: [], // Adicionado de volta para armazenar as questões
    potentialsTable: {}, // Tabela de potenciais padrão de eletrodos carregada
    knowledgeBase: "" // Conteúdo da base de conhecimento para a IA
};

/**
 * Função para verificar e solicitar chave API se necessário (agora utiliza a variável global)
 */
function ensureApiKey() {
    // Esta função foi mantida e utiliza a 'openRouterApiKey' globalmente declarada no topo do arquivo.
    if (!openRouterApiKey || openRouterApiKey.trim() === "") {
        const userKey = prompt("Por favor, insira sua chave API do OpenRouter:");
        if (userKey && userKey.trim() !== "") {
            openRouterApiKey = userKey.trim();
            return openRouterApiKey;
        } else {
            alert("Chave API é necessária para usar a IA.");
            return null;
        }
    }
    return openRouterApiKey;
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
                break; // Encontrou, pode sair do loop interno
            }
        }
        if (!foundMatch) {
            return `Não foi possível encontrar o potencial para o eletrodo: ${eletrodo}. Por favor, verifique se ele está na lista de potenciais conhecidos.`;
        }
    }

    const [eletrodo1, eletrodo2] = eletrodos;
    const potencial1 = potentials[eletrodo1];
    const potencial2 = potentials[eletrodo2];

    if (potencial1 === undefined || potencial2 === undefined) {
        return "Não foi possível encontrar os potenciais para um ou ambos os eletrodos especificados.";
    }

    const E_celula = Math.abs(potencial1 - potencial2);
    return `A voltagem da pilha entre ${eletrodo1} e ${eletrodo2} é de aproximadamente ${E_celula.toFixed(3)} V.`;
}

// ============== Funções relacionadas à UI do Chat e Lógica de Processamento ==============

/**
 * @const {string} SYSTEM_PROMPT_CHATBOT
 * @description Define o prompt base para a IA, estabelecendo seu papel e regras.
 * IMPORTANTE: Mantenha este prompt conciso para economizar tokens.
 * Contextos maiores devem vir de `chatState.knowledgeBase` quando relevante.
 */
const SYSTEM_PROMPT_CHATBOT = `
Você é a PilhIA, uma inteligência artificial educativa especializada em eletroquímica.
Seu objetivo é ajudar, ensinar e auxiliar usuários com suas dúvidas e perguntas sobre eletroquímica.
Seja direto, objetivo e informativo. Responda em português do Brasil.
Você pode calcular voltagens de pilhas usando dados fornecidos.
Se a pergunta não for sobre eletroquímica ou cálculo de pilhas, você deve responder que não tem conhecimento sobre o assunto.
`;


/**
 * @async
 * @function processUserQuery
 * @description Processa a entrada do usuário, envia para a IA e exibe a resposta.
 * @param {string} user_input A mensagem digitada pelo usuário.
 */
async function processUserQuery(user_input) {
    if (!user_input.trim()) return;

    // Garante que o input do usuário está limpo antes de adicionar ao chat
    const cleanedInput = user_input.trim();
    displayMessage(cleanedInput, 'user');
    document.getElementById('user-input').value = ''; // Limpa o campo de entrada

    try {
        const apiKey = ensureApiKey();
        if (!apiKey) {
            displayMessage("Por favor, insira sua chave API para usar a IA.", 'bot');
            return;
        }

        // Exibe um indicador de "digitando"
        const typingIndicator = displayMessage(' digitando...', 'bot typing');

        let ai_response;

        // Tentar identificar e processar comandos internos primeiro
        if (cleanedInput.toLowerCase().startsWith('calcular pilha ')) {
            const eletrodosStr = cleanedInput.toLowerCase().replace('calcular pilha ', '');
            ai_response = calcularVoltagemPilha(eletrodosStr);
        } else {
            // Se não for um comando interno de cálculo de pilha, o chatbot informa o que pode fazer.
            ai_response = "Desculpe, no momento só consigo calcular voltagens de pilhas. Por favor, tente um comando como 'calcular pilha cobre e zinco'.";
        }

        // Remove o indicador de "digitando"
        typingIndicator.remove();

        // Exibe a resposta da IA ou a mensagem de erro/informação
        if (ai_response) {
            displayMessage(ai_response, 'bot');
        }

    } catch (error) {
        console.error("Erro ao processar a consulta do usuário:", error);
        // Remove o indicador de "digitando" em caso de erro
        const typingIndicator = document.querySelector('.message.bot.typing');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        displayMessage("Ocorreu um erro ao tentar obter a resposta. Por favor, tente novamente.", 'bot');
    }
}

/**
 * @function displayMessage
 * @description Adiciona uma nova mensagem ao chat.
 * @param {string} message O texto da mensagem.
 * @param {string} sender O remetente da mensagem ('user', 'bot', 'bot typing').
 * @returns {HTMLElement} O elemento da mensagem criado.
 */
function displayMessage(message, sender) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    messageElement.innerHTML = sender === 'bot typing' ? message : formatMessage(message); // Usa innerHTML para permitir formatação Markdown
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight; // Rolagem automática
    return messageElement;
}

/**
 * @function formatMessage
 * @description Formata o texto da mensagem para exibir Markdown como HTML.
 * @param {string} text O texto bruto da mensagem.
 * @returns {string} O texto formatado em HTML.
 */
function formatMessage(text) {
    // Negrito
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Itálico
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Links (formato simples: [texto](url))
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Quebras de linha
    text = text.replace(/\n/g, '<br>');
    return text;
}

/**
 * @function addSuggestionsToChat
 * @description Adiciona botões de sugestão ao chat para guiar o usuário.
 * @param {Array<string>} suggestions Um array de strings com as sugestões.
 */
function addSuggestionsToChat(suggestions) {
    const chatBox = document.getElementById('chat-box');
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.classList.add('suggestions-container');

    suggestions.forEach(suggestionText => {
        const button = document.createElement('button');
        button.classList.add('suggestion-button');
        button.textContent = suggestionText;
        button.onclick = () => {
            document.getElementById('user-input').value = suggestionText;
            processUserQuery(suggestionText);
            removeSuggestionsFromChat(); // Remove as sugestões após uma ser clicada
        };
        suggestionsContainer.appendChild(button);
    });
    chatBox.appendChild(suggestionsContainer);
    chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * @function removeSuggestionsFromChat
 * @description Remove todos os botões de sugestão do chat.
 */
function removeSuggestionsFromChat() {
    const chatBox = document.getElementById('chat-box');
    const suggestionContainers = chatBox.querySelectorAll('.suggestions-container');
    suggestionContainers.forEach(container => container.remove());
}

/**
 * @function loadChatHistory
 * @description Carrega o histórico de mensagens do localStorage e as exibe.
 */
function loadChatHistory() {
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
    chatHistory.forEach(msg => {
        displayMessage(msg.text, msg.sender);
    });
}

/**
 * @function saveChatHistory
 * @description Salva o histórico atual de mensagens no localStorage.
 */
function saveChatHistory() {
    const chatBox = document.getElementById('chat-box');
    const messages = Array.from(chatBox.children).map(msgElement => {
        // Ignora mensagens de "digitando" e sugestões ao salvar
        if (!msgElement.classList.contains('typing') && !msgElement.classList.contains('suggestions-container')) {
            return {
                text: msgElement.innerText, // Use innerText para obter o texto visível
                sender: msgElement.classList.contains('user') ? 'user' : 'bot'
            };
        }
        return null;
    }).filter(msg => msg !== null); // Filtra os nulos

    localStorage.setItem('chatHistory', JSON.stringify(messages));
}

/**
 * @function clearChatHistory
 * @description Limpa o histórico de mensagens do localStorage e da interface.
 */
function clearChatHistory() {
    localStorage.removeItem('chatHistory');
    document.getElementById('chat-box').innerHTML = '';
    displayMessage("Histórico do chat limpo. Bem-vindo!", 'bot');
}

// ============== Event Listeners e Inicialização ==============

// Inicialização do chat quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', async () => {
    // Carrega a chave API no início. Se não existir, pedirá ao usuário.
    ensureApiKey(); 
    
    // Carrega dados para a tabela de potenciais e base de conhecimento
    await loadPotentialsTable();
    await loadKnowledgeBase();
    await loadQuestions(); // Adicionado de volta

    // Carrega o histórico de chat anterior
    loadChatHistory();

    // Adiciona o evento para o botão de enviar mensagem
    document.getElementById('send-button').addEventListener('click', () => {
        const userInput = document.getElementById('user-input').value;
        processUserQuery(userInput);
        saveChatHistory(); // Salva o chat após cada interação
    });

    // Adiciona o evento para a tecla Enter no campo de input
    document.getElementById('user-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('send-button').click();
        }
    });

    // Adiciona o evento para o botão de limpar histórico
    document.getElementById('clear-chat-button').addEventListener('click', clearChatHistory);

    // Mensagem de boas-vindas inicial e sugestões
    displayMessage("Olá! Sou a PilhIA, sua assistente educativa em eletroquímica. Posso te ajudar a **calcular voltagens de pilhas** (ex: 'calcular pilha cobre e zinco').", 'bot');
    addSuggestionsToChat(['calcular pilha cobre e zinco']);
});