// js/chatbot.js

let openRouterApiKey = "%%OPENROUTER_API_KEY_PLACEHOLDER%%";

const chatState = {
    currentQuestionData: null,
    questionsList: [],
    potentialsTable: {},
    knowledgeBase: ""
};

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
                    alternativas: alternativas,
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
        // Obter o elemento loading-indicator
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block'; // Mostrar o indicador
        }

        const apiKey = ensureApiKey();
        if (!apiKey) {
            displayMessage("Por favor, insira sua chave API para usar a IA.", 'bot');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none'; // Esconder o indicador se houver erro
            }
            return;
        }

        // Removida a linha 'const typingIndicator = displayMessage(' digitando...', 'bot typing');'
        // pois o loading-indicator fará essa função.

        let ai_response;

        if (cleanedInput.toLowerCase().startsWith('calcular pilha ')) {
            const eletrodosStr = cleanedInput.toLowerCase().replace('calcular pilha ', '');
            ai_response = calcularVoltagemPilha(eletrodosStr);
        } else {
            // A IA responderá apenas a comandos de cálculo de pilha por enquanto
            ai_response = "Desculpe, no momento só consigo calcular voltagens de pilhas. Por favor, tente um comando como 'calcular pilha cobre e zinco'.";
            // Se você quiser que a IA responda a outras perguntas,
            // você precisaria chamar callOpenRouterAPI(cleanedInput, apiKey) aqui
            // ai_response = await callOpenRouterAPI(cleanedInput, apiKey);
        }

        // Esconder o indicador de carregamento
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }

        if (ai_response) {
            displayMessage(ai_response, 'bot');
        }

    } catch (error) {
        console.error("Erro ao processar a consulta do usuário:", error);
        // Esconder o indicador de carregamento em caso de erro
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        displayMessage("Ocorreu um erro ao tentar obter a resposta. Por favor, tente novamente.", 'bot');
    }
}

function displayMessage(message, sender) {
    // Agora usando 'chat-container' como ID da área de mensagens
    const chatContainer = document.getElementById('chat-container'); 
    if (!chatContainer) {
        console.error("Erro: Elemento com ID 'chat-container' não encontrado no HTML.");
        return; 
    }
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    messageElement.innerHTML = sender === 'bot typing' ? message : formatMessage(message);
    chatContainer.appendChild(messageElement); // Adiciona a mensagem ao chat-container
    chatContainer.scrollTop = chatContainer.scrollHeight;
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
    // Usando 'chat-container' para adicionar sugestões
    const chatContainer = document.getElementById('chat-container'); 
    if (!chatContainer) {
        console.error("Erro: Elemento com ID 'chat-container' não encontrado no HTML para adicionar sugestões.");
        return;
    }
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
    chatContainer.appendChild(suggestionsContainer); // Adiciona sugestões ao chat-container
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeSuggestionsFromChat() {
    // Usando 'chat-container' para remover sugestões
    const chatContainer = document.getElementById('chat-container'); 
    if (!chatContainer) {
        console.error("Erro: Elemento com ID 'chat-container' não encontrado no HTML para remover sugestões.");
        return;
    }
    const suggestionContainers = chatContainer.querySelectorAll('.suggestions-container');
    suggestionContainers.forEach(container => container.remove());
}

function loadChatHistory() {
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
    chatHistory.forEach(msg => {
        displayMessage(msg.text, msg.sender);
    });
}

function saveChatHistory() {
    // Usando 'chat-container' para salvar histórico
    const chatContainer = document.getElementById('chat-container'); 
    if (!chatContainer) {
        console.error("Erro: Elemento com ID 'chat-container' não encontrado no HTML para salvar histórico.");
        return;
    }
    // O chat-container tem o h2 e o loading-indicator. Não queremos salvar eles como mensagens.
    // Vamos filtrar apenas os elementos que são mensagens (com a classe 'message').
    const messages = Array.from(chatContainer.children)
                               .filter(msgElement => msgElement.classList.contains('message') && !msgElement.classList.contains('typing') && !msgElement.classList.contains('suggestions-container'))
                               .map(msgElement => ({
                                   text: msgElement.innerText,
                                   sender: msgElement.classList.contains('user') ? 'user' : 'bot'
                               }));

    localStorage.setItem('chatHistory', JSON.stringify(messages));
}

// A função clearChatHistory não será usada diretamente via um botão no HTML
// Se você quiser reintroduzi-la, adicione um botão com o ID apropriado no HTML.
function clearChatHistory() {
    localStorage.removeItem('chatHistory');
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        // Limpar o conteúdo da área de chat, mas manter o h2 e o loading-indicator
        chatContainer.innerHTML = `
            <div class="text-center mt-5 pt-5">
                <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
            </div>
            <div id="loading-indicator" style="display: none; text-align: center; margin-top: 10px; color: #888;">
                Carregando resposta da IA...
            </div>
        `;
    }
    displayMessage("Histórico do chat limpo. Bem-vindo!", 'bot');
    addSuggestionsToChat(['calcular pilha cobre e zinco']); // Reapresentar sugestões
}

document.addEventListener('DOMContentLoaded', async () => {
    ensureApiKey(); 
    
    await loadPotentialsTable();
    await loadKnowledgeBase();
    await loadQuestions();

    // Adicionado uma verificação se a página é para o chat principal antes de carregar o histórico
    // Isso evita que o histórico seja carregado em outras páginas que porventura usem este script
    if (document.getElementById('chat-container')) {
        loadChatHistory();
    }

    const sendButton = document.getElementById('send-button');
    const userInput = document.getElementById('user-input');
    // REMOVIDO: const clearChatButton = document.getElementById('clear-chat-button');
    // Pois esse ID não existe no seu HTML atual.

    if (sendButton) {
        sendButton.addEventListener('click', () => {
            processUserQuery(userInput.value);
            saveChatHistory();
        });
    } else {
        console.error("Erro: Botão com ID 'send-button' não encontrado no HTML.");
    }

    if (userInput) {
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendButton.click();
            }
        });
    } else {
        console.error("Erro: Campo de texto com ID 'user-input' não encontrado no HTML.");
    }

    // REMOVIDO: Listener para clearChatButton
    // if (clearChatButton) {
    //     clearChatButton.addEventListener('click', clearChatHistory);
    // } else {
    //     console.warn("Aviso: Botão com ID 'clear-chat-button' não encontrado no HTML. A função de limpar chat não estará disponível.");
    // }

    // Mensagem de boas-vindas inicial e sugestões
    displayMessage("Olá! Sou a PilhIA, sua assistente educativa em eletroquímica. Posso te ajudar a **calcular voltagens de pilhas** (ex: 'calcular pilha cobre e zinco').", 'bot');
    addSuggestionsToChat(['calcular pilha cobre e zinco']);
});