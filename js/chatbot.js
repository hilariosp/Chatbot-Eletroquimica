// AQUI ESTÃO SUAS CHAVES PARCIAIS CONFIGURADAS
// A cada acesso, o site escolherá uma delas aleatoriamente.
const listaDeChavesParciais = [
    {
        prefixo: "sk-or-v1-eac89e675eba077003989ddfda67b1e8f00eca9ccd1adc549d4deaf96040c9",
        sufixo_secreto: "68" 
    },
    {
        prefixo: "sk-or-v1-395661ee7bf18e28f2f59708ec72e935f109b30a9f1ad5c82a4afbdb56a50e",
        sufixo_secreto: "50"
    },
    {
        prefixo: "sk-or-v1-ae56bac32a43f5bdf0f4bf88c9ba894f6698ad2e315b2302243965f102c71a",
        sufixo_secreto: "64"
    },
    {
        prefixo: "sk-or-v1-6448d95777ee157d65c0bbbfce320215db166e20a60d558132fdb263a2f35d",
        sufixo_secreto: "d3"
    },
    {
        prefixo: "sk-or-v1-d2f8bbf3114e37099ea143c0c5f89fcd67bdc8fee97c3db27757cc17e73e1d",
        sufixo_secreto: "54"
    },
    {
        prefixo: "sk-or-v1-f7aea869f4a46f3491f0553a985cabded6023cb96cf3fdf6f03b7627fdea36",
        sufixo_secreto: "27"
    },
    {
        prefixo: "sk-or-v1-54f127a5dd20a6b0629aa66847cc4c7df9a54067107ceb4bc7e0a7641a3287",
        sufixo_secreto: "40"
    },
    {
        prefixo: "sk-or-v1-a932c68afeaa8d4c1dceba885c84cef22f57a6711215c290f2ecea352b76fd",
        sufixo_secreto: "5a"
    },
    {
        prefixo: "sk-or-v1-97ae06d8d233f5401ff40b39d465149e660102e0533b2dd80e8ae3733d2f18",
        sufixo_secreto: "d0"
    },
    {
        prefixo: "sk-or-v1-205e3a201f340a687a2c39b7bcb3d6eb29bde388f0528d2b8c9d3f5f304844",
        sufixo_secreto: "31"
    }
];

// Variável para guardar a chave completa depois que o usuário a montar
let chaveCompletaMontada = null;

// Estado global do chat
const chatState = {
    chatId: null,
    currentQuestionData: null,
    questionsList: [],
    potentialsTable: {},
    knowledgeBase: ""
};

// Função que monta a chave com a ajuda do usuário
function getOpenRouterApiKey() {
    // Se a chave já foi montada nesta sessão, usa ela novamente
    if (chaveCompletaMontada) {
        return chaveCompletaMontada;
    }

    // Escolhe uma chave parcial aleatoriamente da sua lista
    const chaveParcial = listaDeChavesParciais[Math.floor(Math.random() * listaDeChavesParciais.length)];

    // Pede ao usuário para digitar o final secreto da chave
    const inputDoUsuario = prompt(`Para completar a chave, digite este sufixo: ${chaveParcial.sufixo_secreto}`);


    // Verifica se o que o usuário digitou bate com o final secreto
    if (inputDoUsuario && inputDoUsuario.trim() === chaveParcial.sufixo_secreto) {
        // Se bateu, monta a chave completa e a salva para usar nesta sessão
        chaveCompletaMontada = chaveParcial.prefixo + inputDoUsuario.trim();
        alert("Chave validada com sucesso!");
        return chaveCompletaMontada;
    } else {
        // Se não bateu, avisa o usuário
        alert("Final da chave incorreto. A IA não poderá ser usada.");
        return null;
    }
}

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
        }
        chatState.questionsList = formattedQuestions;
    } catch (error) {
        console.error("⚠️ Erro ao carregar questões:", error);
    }
}

async function loadPotentialsTable() {
    try {
        const response = await fetch('./data/tabelas/tabela_potenciais.json');
        if (!response.ok) throw new Error(`Erro ao carregar tabela de potenciais: ${response.statusText}`);
        const data = await response.json();
        let potentials = {};
        data.forEach(item => {
            if (item.metal && item.potencial !== undefined) {
                potentials[item.metal.toLowerCase()] = item.potencial;
            }
        });
        chatState.potentialsTable = potentials;
    } catch (error) {
        console.error("⚠️ Erro ao carregar tabela de potenciais:", error);
    }
}

async function loadKnowledgeBase() {
    try {
        const response = await fetch('./data/basededados/eletroquimica.json');
        if (!response.ok) return;
        const jsonData = await response.json();
        let fileText = "";
        if (Array.isArray(jsonData)) {
            fileText = jsonData.map(item => {
                let formattedItem = `Tópico: ${item.topico || ''}\nConteúdo: ${item.conteudo || ''}\n`;
                if (item.palavras_chave) {
                    formattedItem += `Palavras-chave: ${item.palavras_chave.join(", ")}\n`;
                }
                return formattedItem;
            }).join("\n---\n");
        }
        chatState.knowledgeBase = fileText; // Carrega a base de dados completa
    } catch (error) {
        console.error(`⚠️ Erro ao carregar a base de dados:`, error);
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
        if (!foundMatch) return `Não encontrei o potencial padrão para '${eletrodo}'.`;
    }
    if (Object.keys(potentials).length < 2) return "Não foi possível encontrar potenciais para ambos os eletrodos.";

    const catodoName = Object.keys(potentials).reduce((a, b) => potentials[a] > potentials[b] ? a : b);
    const anodoName = Object.keys(potentials).reduce((a, b) => potentials[a] < potentials[b] ? a : b);
    const voltagem = potentials[catodoName] - potentials[anodoName];
    return `A voltagem da pilha com ${catodoName.charAt(0).toUpperCase() + catodoName.slice(1)} e ${anodoName.charAt(0).toUpperCase() + anodoName.slice(1)} é de ${voltagem.toFixed(2)} V.`;
}

function generateQuestion() {
    if (chatState.questionsList.length === 0) return "Não há mais questões disponíveis.";
    const q = chatState.questionsList[Math.floor(Math.random() * chatState.questionsList.length)];
    chatState.currentQuestionData = q;
    return q.pergunta;
}

// ==================== PROMPT DO SISTEMA (CORRIGIDO) ====================
// Esta versão é mais concisa e direta para evitar erros com o provedor da API.
const SYSTEM_PROMPT_CHATBOT = `
Você é PilhIA, um assistente de IA especializado em eletroquímica.
Sua principal função é ajudar estudantes a entenderem este campo da química.

**Suas diretrizes:**
1.  **Foco Total:** Responda apenas a perguntas sobre eletroquímica, como pilhas (incluindo a de Daniell), baterias, eletrólise, reações de oxirredução (redox) e corrosão.
2.  **Use o Conhecimento Fornecido:** Baseie TODAS as suas respostas no contexto e na base de conhecimento que acompanham a pergunta do usuário. Não use informações externas.
3.  **Seja um Professor:** Explique conceitos de forma clara, didática e passo a passo. Se o usuário pedir analogias, use-as para simplificar o aprendizado.
4.  **Questões:** Ao receber um pedido por uma "questão", forneça uma das questões da sua lista, sem a resposta. Ao explicar a resposta de uma questão, foque apenas na justificativa da alternativa correta.
5.  **Fora de Escopo:** Se a pergunta não for sobre eletroquímica, responda educadamente: "Desculpe, minha especialidade é apenas eletroquímica e não posso ajudar com este assunto."
6.  **Formato:** Use parágrafos curtos e listas para facilitar a leitura. Evite formatação complexa.
`;

// ==================== CHAMADA À OPENROUTER (API) ====================
// CORREÇÃO: O modelo foi trocado para um que está atualmente disponível na camada gratuita.
async function callOpenRouterAPI(prompt, systemPrompt = SYSTEM_PROMPT_CHATBOT, model = "mistralai/mistral-7b-instruct:free", temperature = 0.5, max_tokens = 1500) {
    const currentApiKey = getOpenRouterApiKey();
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
                const errorData = JSON.parse(errorText);
                errorDetails = errorData.error?.message || errorData.detail || JSON.stringify(errorData);
            } catch {
                errorDetails = `A resposta da API não é um JSON válido. Status: ${response.status}`;
            }
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

    // CORREÇÃO: Reduzido o tamanho do contexto para evitar erros de limite de prompt.
    const KNOWLEDGE_CONTEXT_SIZE = 4000;

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
                `Forneça a justificativa conceitual e quimicamente precisa para esta alternativa, ` +
                `focando nos princípios da eletroquímica. Seja conciso. ` +
                `Não mencione as outras alternativas.`
            );
            const explanation = await callOpenRouterAPI(explanationPrompt, SYSTEM_PROMPT_CHATBOT);
            const isCorrect = (user_lower === correct_answer_letter);
            if (isCorrect) {
                response = `Você acertou! A resposta correta é (${correct_answer_letter.toUpperCase()}).\n\n**Justificativa:**\n${explanation}\n\nDeseja fazer outra questão? (sim/não)`;
            } else {
                response = `Você errou. A resposta correta é (${correct_answer_letter.toUpperCase()}).\n\n**Justificativa:**\n${explanation}\n\nDeseja fazer outra questão? (sim/não)`;
            }
        } else {
            chatState.currentQuestionData = null;
            const generalPrompt = `Contexto: ${chatState.knowledgeBase.substring(0, KNOWLEDGE_CONTEXT_SIZE)}\n\nPergunta do usuário: ${user_input}`;
            response = await callOpenRouterAPI(generalPrompt, SYSTEM_PROMPT_CHATBOT);
        }
    } else if (user_lower.includes("gerar questões") || user_lower.includes("questões enem") || user_lower.includes("questão")) {
        response = generateQuestion();
    } else {
        const generalPrompt = `Contexto: ${chatState.knowledgeBase.substring(0, KNOWLEDGE_CONTEXT_SIZE)}\n\nPergunta do usuário: ${user_input}`;
        response = await callOpenRouterAPI(generalPrompt, SYSTEM_PROMPT_CHATBOT);
    }
    return response;
}

// ==================== SIDEBAR E UI CHAT MULTI-HISTÓRICO ====================
// Nenhuma alteração necessária nesta seção. O código original está mantido.

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
                    <div class="card suggestion-card" data-suggestion="Quero ajuda para entender o que é uma pilha de Daniell">
                        <div class="card-body text-center">
                            <h6 class="card-title">Resolver Dúvidas</h6>
                            <p class="card-text small">Tire dúvidas sobre determinado assunto do campo de eletroquímica.</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card suggestion-card" data-suggestion="Calcular a voltagem de uma pilha de zinco e cobre">
                        <div class="card-body text-center">
                            <h6 class="card-title">Pilha Virtual</h6>
                            <p class="card-text small">Monte uma pilha virtual e calcule a voltagem.</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card suggestion-card" data-suggestion="Explique eletrólise fazendo uma analogia com uma fábrica">
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
            paragraph.innerHTML = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Adiciona suporte para negrito
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
