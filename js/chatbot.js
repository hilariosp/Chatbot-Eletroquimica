// js/chatbot.js

// Chave da API será substituída pelo GitHub Actions no deploy
let openRouterApiKey = "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";

// Estado global do chat e dados auxiliares
const chatState = {
    chatId: null,
    currentQuestionData: null,
    questionsList: [],
    potentialsTable: {},
    knowledgeBase: ""
};

// OPENROUTER_API_KEYS: array vazio, as chaves nunca ficam no frontend público!
const OPENROUTER_API_KEYS = [];
function getRandomOpenRouterApiKey() {
    if (OPENROUTER_API_KEYS.length === 0) {
        if (!openRouterApiKey || openRouterApiKey === "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") {
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
    const randomIndex = Math.floor(Math.random() * OPENROUTER_API_KEYS.length);
    return OPENROUTER_API_KEYS[randomIndex];
}

// ==================== FUNÇÕES DE CARREGAMENTO ====================

async function loadQuestions() {
    try {
        const response = await fetch('./data/questoes/eletroquimica.json');
        if (!response.ok) throw new Error(`Erro ao carregar questões: ${response.statusText}`);
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
        if (!response.ok) throw new Error(`Erro ao carregar tabela de potenciais: ${response.statusText}`);
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

// ==================== LÓGICA DO QUIZ E VOLTAGEM ====================

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
            return `Não encontrei o potencial padrão para '${eletrodo}'. Verifique a grafia ou se está na tabela.`;
        }
    }
    if (Object.keys(potentials).length < 2) {
        return "Não foi possível encontrar potenciais para ambos os eletrodos. Verifique a grafia.";
    }
    const catodoName = Object.keys(potentials).reduce((a, b) => potentials[a] > potentials[b] ? a : b);
    const anodoName = Object.keys(potentials).reduce((a, b) => potentials[a] < potentials[b] ? a : b);
    const voltagem = potentials[catodoName] - potentials[anodoName];
    return `A voltagem da pilha com ${catodoName.charAt(0).toUpperCase() + catodoName.slice(1)} e ${anodoName.charAt(0).toUpperCase() + anodoName.slice(1)} é de ${voltagem.toFixed(2)} V.`;
}

function generateQuestion() {
    if (chatState.questionsList.length === 0) {
        return "Não há mais questões disponíveis.";
    }
    const q = chatState.questionsList[Math.floor(Math.random() * chatState.questionsList.length)];
    chatState.currentQuestionData = q;
    return q.pergunta;
}

// ==================== SYSTEM PROMPT ====================

const SYSTEM_PROMPT_CHATBOT = `
Você é PilhIA, um assistente especializado e focado EXCLUSIVAMENTE em eletroquímica, baterias, eletrólise e pilha de Daniell.

1. COMPORTAMENTO:
- Mantenha respostas claras, concisas e diretamente relacionadas à eletroquímica.
- **FORNEÇA RESPOSTAS APENAS COM BASE NA DOCUMENTAÇÃO DE REFERÊNCIA EXPLÍCITA NO CONTEXTO. NÃO BUSQUE INFORMAÇÕES EXTERNAS.**
- **Se a pergunta for para 'entender' ou 'explicar' um conceito presente no contexto (ex: 'Quero entender eletroquímica', 'Explique a eletrólise'), você DEVE usar o conteúdo da base de dados para fornecer uma explicação clara e concisa.**
- **Se o usuário solicitar uma explicação usando analogias (ex: 'Explique eletroquímica fazendo analogias com um jogo'), você PODE usar analogias, desde que elas sirvam para CLARIFICAR os conceitos de eletroquímica presentes na sua base de dados.**
- Se o conceito não estiver explicitamente no contexto, ou a pergunta for muito vaga ou fora do tópico de eletroquímica (baterias, eletrólise, pilha de Daniell), responda APENAS E EXCLUSIVAMENTE: "Não sei responder isso".
- Se a pergunta for incompleta (ex: 'o que é a'), responda: "Não sei responder isso".
- Se for perguntado algo fora de eletroquímica (baterias, eletrólise, pilha de Daniell), responda que não pode responder por estar fora do assunto.
- Se pedir questões sobre eletroquímica, você deve pegar elas diretamente da sua lista de questões (que está no seu contexto), e soltar apenas uma por vez.
- Ao explicar a resposta de uma questão, forneça APENAS a justificativa conceitual e quimicamente ACURADA para a alternativa CORRETA. NÃO re-afirme a letra da alternativa correta, NÃO mencione outras alternativas e NÃO tente re-calcular ou re-raciocinar a questão. Sua explicação deve ser uma justificativa direta, concisa e precisa, focando nos princípios da eletroquímica.

2. FORMATO:
- Use parágrafos curtos e marcadores quando apropriado.
- Não faça uso de LaTeX ou fórmulas matemáticas complexas; use texto simples.
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

// ==================== CHAMADA À OPENROUTER ====================

async function callOpenRouterAPI(prompt, systemPrompt = SYSTEM_PROMPT_CHATBOT, model = "meta-llama/llama-3.2-3b-instruct:free", temperature = 0.5, max_tokens = 1500) {
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
                "HTTP-Referer": window.location.origin,
                "X-Title": "PilhIA Frontend"
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
                } catch {
                    errorDetails = `Resposta da API não é JSON válido.`;
                }
            } catch {}
            throw new Error(`Erro na API OpenRouter (Status: ${response.status}): ${errorDetails}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "Sem resposta da IA.";
    } catch (error) {
        console.error("Erro ao chamar a API do OpenRouter:", error);
        return `⚠️ Erro na comunicação com a IA: ${error.message}.`;
    }
}

// ==================== LÓGICA PRINCIPAL DO CHATBOT ====================

async function processUserQuery(user_input) {
    const user_lower = user_input.toLowerCase();
    let response = "";

    if (user_lower.includes("calcular a voltagem de uma pilha de")) {
        const eletrodosStr = user_lower.split("de uma pilha de")[1].trim();
        response = calcularVoltagemPilha(eletrodosStr);
        chatState.currentQuestionData = null;
    } else if (chatState.currentQuestionData) {
        const questionData = chatState.currentQuestionData;
        const correct_answer_letter = questionData.resposta_correta.toLowerCase();

        if (user_lower === "sim") {
            response = generateQuestion();
            if (response.includes("Não há mais questões disponíveis.")) {
                chatState.currentQuestionData = null;
            }
        } else if (user_lower === "não") {
            response = "Ótimo. Deseja mais alguma coisa?";
            chatState.currentQuestionData = null;
        } else if (['a', 'b', 'c', 'd', 'e'].includes(user_lower)) {
            const explanationPrompt = (
                `Para a questão: '${questionData.pergunta}'\n` +
                `A alternativa correta é '(${correct_answer_letter.toUpperCase()})'. ` +
                `Forneça a justificativa conceitual e quimicamente ACURADA para esta alternativa, ` +
                `focando nos princípios da eletroquímica. ` +
                `Seja conciso e preciso. **NÃO re-afirme a letra da alternativa correta, ` +
                `NÃO mencione outras alternativas e NÃO tente re-calcular ou re-raciocinar a questão.**`
            );
            const explanation = await callOpenRouterAPI(explanationPrompt, SYSTEM_PROMPT_CHATBOT);
            const isCorrect = (user_lower === correct_answer_letter);
            if (isCorrect) {
                response = `Você acertou! A resposta correta é (${correct_answer_letter.toUpperCase()}).\n${explanation}\nDeseja fazer outra questão? (sim/não)`;
            } else {
                response = `Você errou. A resposta correta é (${correct_answer_letter.toUpperCase()}).\n${explanation}\nDeseja fazer outra questão? (sim/não)`;
            }
        } else {
            chatState.currentQuestionData = null;
            const generalPrompt = `Contexto: ${chatState.knowledgeBase.substring(0, 7000)}\n\nPergunta: ${user_input.substring(0, 300)}`;
            response = await callOpenRouterAPI(generalPrompt, SYSTEM_PROMPT_CHATBOT);
        }
    } else if (user_lower.includes("gerar questões") || user_lower.includes("questões enem") || user_lower.includes("questão")) {
        response = generateQuestion();
    } else {
        const generalPrompt = `Contexto: ${chatState.knowledgeBase.substring(0, 7000)}\n\nPergunta: ${user_input.substring(0, 300)}`;
        response = await callOpenRouterAPI(generalPrompt, SYSTEM_PROMPT_CHATBOT);
    }
    return response;
}

// ==================== SIDEBAR E UI CHAT MULTI-HISTÓRICO ====================

function toggleSidebar() {
    const sidebarContent = document.getElementById('sidebarContent');
    if (sidebarContent) {
        sidebarContent.classList.toggle('show');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadQuestions(),
        loadPotentialsTable(),
        loadKnowledgeBase()
    ]);

    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    let currentChatId = localStorage.getItem('currentChatId') || ('temp-' + Date.now().toString());
    let chats = JSON.parse(localStorage.getItem('pilhia-chats')) || {};
    let chatToDelete = null;

    if (typeof chatState !== 'undefined') {
        chatState.chatId = currentChatId;
    } else {
        console.error("Erro: chatState não está definido. Verifique a ordem dos scripts.");
    }

    function addSuggestionsToChat() {
        if (!chatContainer) {
            console.warn("Elemento 'chat-container' não encontrado para adicionar sugestões.");
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
            chatContainer.removeChild(existingSuggestions);
        }
        chatContainer.appendChild(suggestionsDiv);
        const suggestionCards = chatContainer.querySelectorAll('.suggestion-card');
        suggestionCards.forEach(card => {
            card.addEventListener('click', () => {
                const suggestionText = card.getAttribute('data-suggestion');
                userInput.value = suggestionText;
                userInput.focus();
            });
        });
    }

    function removeSuggestionsFromChat() {
        if (!chatContainer) return;
        const suggestionsDiv = chatContainer.querySelector('.suggestions');
        if (suggestionsDiv) {
            chatContainer.removeChild(suggestionsDiv);
        }
    }

    function saveChats() {
        localStorage.setItem('pilhia-chats', JSON.stringify(chats));
    }

    function loadChatHistory() {
        const chatHistoryContainer = document.getElementById('chat-history-container');
        if (!chatHistoryContainer) return;
        chatHistoryContainer.innerHTML = '';
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
            deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteConfirmation(chat.id);
            });

            chatElement.appendChild(titleSpan);
            chatElement.appendChild(deleteBtn);

            chatElement.addEventListener('click', () => {
                loadChat(chat.id);
            });
            chatHistoryContainer.appendChild(chatElement);
        });
    }

    function loadChat(chatId) {
        currentChatId = chatId;
        localStorage.setItem('currentChatId', currentChatId);
        chatState.chatId = currentChatId;
        chatContainer.innerHTML = '';
        removeSuggestionsFromChat();

        const chat = chats[chatId];
        if (!chat || chat.messages.length === 0) {
            chatContainer.innerHTML = `
                <div class="text-center mt-5 pt-5">
                    <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
                </div>`;
            addSuggestionsToChat();
        } else {
            chat.messages.forEach(msg => {
                addMessage(msg.content, msg.isUser, false);
            });
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function createNewChat() {
        currentChatId = 'temp-' + Date.now().toString();
        localStorage.setItem('currentChatId', currentChatId);
        chatState.chatId = currentChatId;
        chatContainer.innerHTML = `
            <div class="text-center mt-5 pt-5">
                <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
            </div>`;
        addSuggestionsToChat();
        userInput.focus();
    }

    function addMessage(content, isUser = false, saveToHistory = true) {
        const timestamp = new Date();
        const hours = timestamp.getHours().toString().padStart(2, '0');
        const minutes = timestamp.getMinutes().toString().padStart(2, '0');
        const timeString = `${hours}:${minutes}`;
        if (isUser && currentChatId.startsWith('temp-')) {
            const newChatId = Date.now().toString();
            chats[newChatId] = {
                id: newChatId,
                title: content.length > 30 ? content.substring(0, 30) + '...' : content,
                messages: [{
                    content,
                    isUser: true,
                    timestamp: timestamp.toISOString()
                }],
                createdAt: timestamp.toISOString()
            };
            currentChatId = newChatId;
            localStorage.setItem('currentChatId', currentChatId);
            chatState.chatId = currentChatId;
            saveChats();
            loadChatHistory();
        } else if (saveToHistory && chats[currentChatId]) {
            const chat = chats[currentChatId];
            chat.messages.push({
                content,
                isUser,
                timestamp: timestamp.toISOString()
            });
            if (isUser && chat.messages.length === 1) {
                chat.title = content.length > 30 ? content.substring(0, 30) + '...' : content;
            }
            saveChats();
            loadChatHistory();
        }
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
        const lines = content.split('\n');
        lines.forEach(line => {
            const paragraph = document.createElement('p');
            paragraph.innerHTML = line;
            messageDiv.appendChild(paragraph);
        });
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message p-3 bot-message typing-indicator';
        typingDiv.innerHTML = '<span></span><span></span><span></span>';
        typingDiv.id = 'typing-indicator';
        chatContainer.appendChild(typingDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        userInput.disabled = true;
        userInput.value = 'Enviando...';
        sendButton.disabled = true;
        addMessage(message, true);
        userInput.style.height = 'auto';
        showTyping();

        try {
            const aiResponse = await processUserQuery(message);
            document.getElementById('typing-indicator')?.remove();
            userInput.disabled = false;
            userInput.value = '';
            userInput.focus();
            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';
            addMessage(aiResponse, false);
        } catch (error) {
            console.error('Erro:', error);
            const typing = document.getElementById('typing-indicator');
            if (typing) typing.remove();
            userInput.disabled = false;
            userInput.value = message;
            userInput.focus();
            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';
            addMessage('⚠️ Não foi possível conectar ao servidor ou processar a resposta.', false);
        }
    }

    function showDeleteConfirmation(chatId) {
        const confirmDeleteModal = document.getElementById('confirm-delete');
        if (confirmDeleteModal) {
            chatToDelete = chatId;
            confirmDeleteModal.style.display = 'flex';
        }
    }

    function deleteChat(chatIdToDelete) {
        if (currentChatId === chatIdToDelete) {
            createNewChat();
        }
        delete chats[chatIdToDelete];
        saveChats();
        loadChatHistory();
        const confirmDeleteModal = document.getElementById('confirm-delete');
        if (confirmDeleteModal) confirmDeleteModal.style.display = 'none';
        chatToDelete = null;
    }

    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', createNewChat);
    }
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => deleteChat(chatToDelete));
    }
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            const confirmDeleteModal = document.getElementById('confirm-delete');
            if (confirmDeleteModal) confirmDeleteModal.style.display = 'none';
            chatToDelete = null;
        });
    }

    loadChat(currentChatId);
    loadChatHistory();
    addSuggestionsToChat();
    userInput.focus();

});