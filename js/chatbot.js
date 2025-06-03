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
        // Always remove suggestions when loading a chat, then conditionally add them back
        removeSuggestionsFromChat();

        const chat = chats[chatId];
        if (!chat || chat.messages.length === 0) {
            chatContainer.innerHTML = `
                <div class="text-center mt-5 pt-5">
                    <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
                </div>`;
            // Add suggestions only if the chat is empty or new
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
        addSuggestionsToChat(); // Add suggestions when creating a new chat
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
        removeSuggestionsFromChat(); // Remove suggestions once a message is added

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

    // Initial load: determine if it's a new/empty chat or an existing one
    const initialChat = chats[currentChatId];
    if (!initialChat || initialChat.messages.length === 0) {
        createNewChat(); // If no chat or empty, create a new one with suggestions
    } else {
        loadChat(currentChatId); // Otherwise, load the existing chat
    }
    loadChatHistory();
    userInput.focus();
});