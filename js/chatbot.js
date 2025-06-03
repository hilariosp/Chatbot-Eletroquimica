let openRouterApiKey = "%%OPENROUTER_API_KEY_PLACEHOLDER%%"; // Declarada APENAS UMA VEZ aqui.

function ensureApiKey() { // Esta é a ÚNICA DECLARAÇÃO de ensureApiKey no arquivo
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

const chatState = {
    chatId: null,
    currentQuestionData: null,
    questionsList: [],
    potentialsTable: {},
    knowledgeBase: ""
};

// REMOVIDO: A SEGUNDA DECLARAÇÃO DA FUNÇÃO 'ensureApiKey' FOI RETIRADA AQUI.
// A função 'ensureApiKey' já está definida no início do arquivo.

async function loadQuestions() {
    try {
        const response = await fetch('./data/questoes/eletroquimica.json');
        if (!response.ok) {
            throw new Error(`Erro ao carregar questões: ${response.statusText}`);
        }
        const data = await response.json();

        let formattedQuestions = [];
        if (Array.isArray(data)) {
            data.slice(0, 10).forEach(item => {
                const questionText = item.questao;
                const alternatives = item.alternativas;
                const correctAnswer = item.resposta_correta;
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
            });
        } else if (typeof data === 'object' && data !== null) {
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
        chatState.questionsList = [];
    }
}

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
        chatState.potentialsTable = {};
    }
}

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
            fileText = JSON.stringify(jsonData, null, 2);
        }

        content += `\n--- Conteúdo de ${knowledgeBaseFile} ---\n${fileText.substring(0, 7500)}\n`;
        chatState.knowledgeBase = content.substring(0, 8000);
        console.log(`📖 Base de dados carregada (${chatState.knowledgeBase.length} caracteres).`);
    } catch (error) {
        console.error(`⚠️ Erro ao ler ou processar a base de dados JSON '${knowledgeBaseFile}':`, error);
        chatState.knowledgeBase = "";
    }
}

function calcularVoltagemPilha(eletrodosStr) {
    const eletrodos = eletrodosStr.split(' e ').map(e => e.trim().toLowerCase()).filter(e => e);

    if (eletrodos.length !== 2) {
        return "Por favor, especifique exatamente dois eletrodos separados por 'e' (ex: 'cobre e zinco').";
    }

    const potentials = {};
    for (const eletrodo of eletrodos) {
        let foundMatch = false;
        for (const keyMetal in chatState.potentialsTable) {
            if (keyMetal.includes(eletrodo)) {
                potentials[eletrodo] = chatState.potentialsTable[keyMetal];
                foundMatch = true;
                break;
            }
        }
        if (!foundMatch) {
            return `Não foi possível encontrar o potencial para o eletrodo: ${eletrodo}. Por favor, verifique se ele está na lista de potenciais conhecidos.`;
        }
    }

    const [eletrodo1, eletrodo2] = eletrodos;
    const potencial1 = potentials[eletrodo1];
    const potencial2 = potentials[eletro2];

    if (potencial1 === undefined || potencial2 === undefined) {
        return "Não foi possível encontrar os potenciais para um ou ambos os eletrodos especificados.";
    }

    const E_celula = Math.abs(potencial1 - potencial2);
    return `A voltagem da pilha entre ${eletrodo1} e ${eletro2} é de aproximadamente ${E_celula.toFixed(3)} V.`;
}

const SYSTEM_PROMPT_CHATBOT = `
Você é a PilhIA, uma inteligência artificial educativa especializada em eletroquímica.
Seu objetivo é ajudar, ensinar e auxiliar usuários com suas dúvidas e perguntas sobre eletroquímica.
Seja direto, objetivo e informativo. Responda em português do Brasil.
Você pode calcular voltagens de pilhas usando dados fornecidos.
Se a pergunta não for sobre eletroquímica ou cálculo de pilhas, você deve responder que não tem conhecimento sobre o assunto.
`;

async function processUserQuery(user_input) {
    if (!user_input.trim()) return;

    const cleanedInput = user_input.trim();
    displayMessage(cleanedInput, 'user');
    document.getElementById('user-input').value = '';

    try {
        const apiKey = ensureApiKey();
        if (!apiKey) {
            displayMessage("Por favor, insira sua chave API para usar a IA.", 'bot');
            return;
        }

        const typingIndicator = displayMessage(' digitando...', 'bot typing');

        let ai_response;

        if (cleanedInput.toLowerCase().startsWith('calcular pilha ')) {
            const eletrodosStr = cleanedInput.toLowerCase().replace('calcular pilha ', '');
            ai_response = calcularVoltagemPilha(eletrodosStr);
        } else {
            ai_response = "Desculpe, no momento só consigo calcular voltagens de pilhas. Por favor, tente um comando como 'calcular pilha cobre e zinco'.";
        }

        typingIndicator.remove();

        if (ai_response) {
            displayMessage(ai_response, 'bot');
        }

    } catch (error) {
        console.error("Erro ao processar a consulta do usuário:", error);
        const typingIndicator = document.querySelector('.message.bot.typing');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        displayMessage("Ocorreu um erro ao tentar obter a resposta. Por favor, tente novamente.", 'bot');
    }
}

function displayMessage(message, sender) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    messageElement.innerHTML = sender === 'bot typing' ? message : formatMessage(message);
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
    return messageElement;
}

function formatMessage(text) {
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
    text = text.replace(/\n/g, '<br>');
    return text;
}

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
            removeSuggestionsFromChat();
        };
        suggestionsContainer.appendChild(button);
    });
    chatBox.appendChild(suggestionsContainer);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function removeSuggestionsFromChat() {
    const chatBox = document.getElementById('chat-box');
    const suggestionContainers = chatBox.querySelectorAll('.suggestions-container');
    suggestionContainers.forEach(container => container.remove());
}

function loadChatHistory() {
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
    chatHistory.forEach(msg => {
        displayMessage(msg.text, msg.sender);
    });
}

function saveChatHistory() {
    const chatBox = document.getElementById('chat-box');
    const messages = Array.from(chatBox.children).map(msgElement => {
        if (!msgElement.classList.contains('typing') && !msgElement.classList.contains('suggestions-container')) {
            return {
                text: msgElement.innerText,
                sender: msgElement.classList.contains('user') ? 'user' : 'bot'
            };
        }
        return null;
    }).filter(msg => msg !== null);

    localStorage.setItem('chatHistory', JSON.stringify(messages));
}

function clearChatHistory() {
    localStorage.removeItem('chatHistory');
    document.getElementById('chat-box').innerHTML = '';
    displayMessage("Histórico do chat limpo. Bem-vindo!", 'bot');
}

document.addEventListener('DOMContentLoaded', async () => {
    ensureApiKey(); 
    
    await loadPotentialsTable();
    await loadKnowledgeBase();
    await loadQuestions();

    loadChatHistory();

    document.getElementById('send-button').addEventListener('click', () => {
        const userInput = document.getElementById('user-input').value;
        processUserQuery(userInput);
        saveChatHistory();
    });

    document.getElementById('user-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('send-button').click();
        }
    });

    document.getElementById('clear-chat-button').addEventListener('click', clearChatHistory);

    displayMessage("Olá! Sou a PilhIA, sua assistente educativa em eletroquímica. Posso te ajudar a **calcular voltagens de pilhas** (ex: 'calcular pilha cobre e zinco').", 'bot');
    addSuggestionsToChat(['calcular pilha cobre e zinco']);
});