// js/chatbot.js

// Funções relacionadas à sidebar (se houver)
function toggleSidebar() {
    const sidebarContent = document.getElementById('sidebarContent');
    if (sidebarContent) {
        sidebarContent.classList.toggle('show');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Carrega os dados estáticos primeiro (do main.js)
    // As funções loadQuestions, loadPotentialsTable, loadKnowledgeBase são globais de main.js
    await Promise.all([
        loadQuestions(),
        loadPotentialsTable(),
        loadKnowledgeBase()
    ]);

    const chatContainer = document.getElementById('chat-container'); 
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    
    // Gerenciamento de histórico de chats usando localStorage (separado do chatState.currentQuestionData)
    let currentChatId = localStorage.getItem('currentChatId') || ('temp-' + Date.now().toString());
    let chats = JSON.parse(localStorage.getItem('pilhia-chats')) || {}; // Renomeado para 'pilhia-chats'
    let chatToDelete = null; // Variável para o modal de exclusão

    // Inicializa o chatState.chatId global do main.js
    // chatState é um objeto global definido em main.js
    if (typeof chatState !== 'undefined') {
        chatState.chatId = currentChatId;
    } else {
        console.error("Erro: chatState não está definido. Verifique a ordem dos scripts.");
    }

    // Função para adicionar sugestões
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

    // Função para remover sugestões
    function removeSuggestionsFromChat() {
        if (!chatContainer) return;
        const suggestionsDiv = chatContainer.querySelector('.suggestions');
        if (suggestionsDiv) {
            chatContainer.removeChild(suggestionsDiv);
        }
    }

    // Função para salvar chats no localStorage
    function saveChats() {
        localStorage.setItem('pilhia-chats', JSON.stringify(chats));
    }

    // Função para carregar histórico de chats na sidebar
    function loadChatHistory() {
        const chatHistoryContainer = document.getElementById('chat-history-container');
        if (!chatHistoryContainer) {
            return;
        }
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
                showDeleteConfirmation(chat.id); // Mostra o modal de confirmação
            });

            chatElement.appendChild(titleSpan);
            chatElement.appendChild(deleteBtn);

            chatElement.addEventListener('click', () => {
                loadChat(chat.id);
                // if (window.innerWidth <= 991.98) { // Se tiver sidebar responsiva
                //     document.getElementById('sidebarContent').classList.remove('show');
                // }
            });

            chatHistoryContainer.appendChild(chatElement);
        });
    }

    // Função para carregar um chat específico
    function loadChat(chatId) {
        currentChatId = chatId;
        localStorage.setItem('currentChatId', currentChatId);
        chatState.chatId = currentChatId; // Atualiza o chatState global
        
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
                addMessage(msg.content, msg.isUser, false); // Não salva novamente ao carregar
            });
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Função para criar um novo chat (limpa a tela e gera um temp-id)
    function createNewChat() {
        currentChatId = 'temp-' + Date.now().toString();
        localStorage.setItem('currentChatId', currentChatId);
        chatState.chatId = currentChatId; // Atualiza o chatState global

        chatContainer.innerHTML = `
            <div class="text-center mt-5 pt-5">
                <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
            </div>`;
        addSuggestionsToChat();
        // if (window.innerWidth <= 991.98) { // Se tiver sidebar responsiva
        //     document.getElementById('sidebarContent').classList.remove('show');
        // }
        userInput.focus();
    }

    // Função para adicionar mensagem ao chatbox e gerenciar histórico local
    function addMessage(content, isUser = false, saveToHistory = true) {
        const timestamp = new Date();
        const hours = timestamp.getHours().toString().padStart(2, '0');
        const minutes = timestamp.getMinutes().toString().padStart(2, '0'); // CORREÇÃO: Usar getMinutes()
        const timeString = `${hours}:${minutes}`;

        // Lógica para criar um novo chat real quando o usuário envia a primeira mensagem
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
            chatState.chatId = currentChatId; // Atualiza o chatState global
            saveChats(); 
            loadChatHistory(); 
        }
        // Adiciona a mensagem ao histórico do chat atual, se for para salvar
        else if (saveToHistory && chats[currentChatId]) {
            const chat = chats[currentChatId];
            chat.messages.push({
                content,
                isUser,
                timestamp: timestamp.toISOString()
            });

            // Atualiza o título do chat se for a primeira mensagem do usuário em um chat existente
            if (isUser && chat.messages.length === 1) {
                chat.title = content.length > 30 ? content.substring(0, 30) + '...' : content;
            }
            saveChats(); 
            loadChatHistory(); 
        }

        // Remove o placeholder inicial e sugestões se houver
        const placeholder = chatContainer.querySelector('.text-center');
        if (placeholder) {
            chatContainer.removeChild(placeholder);
        }
        removeSuggestionsFromChat();

        // Cria e adiciona o elemento da mensagem ao chatbox
        const messageDiv = document.createElement('div');
        messageDiv.className = `message p-3 ${isUser ? 'user-message' : 'bot-message'}`;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = timeString;
        messageDiv.appendChild(timeSpan);

        // Divide o conteúdo por quebras de linha para criar parágrafos
        const lines = content.split('\n');
        lines.forEach(line => {
            const paragraph = document.createElement('p');
            // Usar innerHTML para permitir quebras de linha e formatação básica
            paragraph.innerHTML = line; 
            messageDiv.appendChild(paragraph);
        });

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Função para mostrar o indicador de digitação
    function showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message p-3 bot-message typing-indicator';
        typingDiv.innerHTML = '<span></span><span></span><span></span>';
        typingDiv.id = 'typing-indicator';
        chatContainer.appendChild(typingDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Função principal para enviar mensagem (AGORA CHAMA processUserQuery do main.js)
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        userInput.disabled = true;
        userInput.value = 'Enviando...';
        sendButton.disabled = true;

        addMessage(message, true); // Adiciona a mensagem do usuário ao histórico local
        userInput.style.height = 'auto';

        showTyping();

        try {
            // AQUI ESTÁ A MUDANÇA CRÍTICA:
            // Chamamos processUserQuery (definido em main.js) que já sabe como interagir com a IA.
            const aiResponse = await processUserQuery(message); 
            
            document.getElementById('typing-indicator')?.remove();

            userInput.disabled = false;
            userInput.value = ''; // Limpa o input após o envio
            userInput.focus();

            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

            addMessage(aiResponse, false); // Adiciona a resposta da IA ao histórico local

        } catch (error) {
            console.error('Erro:', error);
            const typing = document.getElementById('typing-indicator');
            if (typing) typing.remove();

            userInput.disabled = false;
            userInput.value = message; // Restaura a mensagem original em caso de erro
            userInput.focus();

            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

            addMessage('⚠️ Não foi possível conectar ao servidor ou processar a resposta.', false);
        }
    }

    // Funções relacionadas à exclusão de chat (modal e botões)
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

    // Event Listeners
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
    
    // Inicialização ao carregar a página
    loadChat(currentChatId); // Carrega o chat atual (ou cria um novo se temp-)
    loadChatHistory(); // Carrega o histórico na sidebar
    addSuggestionsToChat(); // Adiciona as sugestões iniciais
    userInput.focus(); // Foca no input
});
