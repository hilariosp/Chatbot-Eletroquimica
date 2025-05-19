
    function toggleSidebar() {
        const sidebarContent = document.getElementById('sidebarContent');
        sidebarContent.classList.toggle('show');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const chatContainer = document.getElementById('chat-container');
        const userInput = document.getElementById('user-input');
        const sendButton = document.getElementById('send-button');
        const newChatBtn = document.getElementById('new-chat-btn');
        const chatHistoryContainer = document.getElementById('chat-history-container');
        const confirmDeleteModal = document.getElementById('confirm-delete');
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        const cancelDeleteBtn = document.getElementById('cancel-delete');


        let currentChatId = localStorage.getItem('currentChatId') || ('temp-' + Date.now().toString());
        let chats = JSON.parse(localStorage.getItem('danielia-chats')) || {};
        let chatToDelete = null;


        loadChat(currentChatId);
        loadChatHistory();
        addSuggestionsToChat(); 

        function addSuggestionsToChat() {
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
                            <div class="card suggestion-card" data-suggestion="Simule uma pilha de [eletrodo 1] e [eletrodo 2] e calcule sua voltagem.">
                                <div class="card-body text-center">
                                    <h6 class="card-title">Pilha Virtual</h6>
                                    <p class="card-text small">Monte uma pilha virtual e calcule a voltagem.</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card suggestion-card" data-suggestion="Gerar um flashcard com trechos da base de dados sobre eletroquímica">
                                <div class="card-body text-center">
                                    <h6 class="card-title">Flashcard</h6>
                                    <p class="card-text small">Crie um cartão de estudo rápido com informações sobre eletroquímica</p>
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
            const suggestionsDiv = chatContainer.querySelector('.suggestions');
            if (suggestionsDiv) {
                chatContainer.removeChild(suggestionsDiv);
            }
        }

        userInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        function saveChats() {
            localStorage.setItem('danielia-chats', JSON.stringify(chats));
        }

        function loadChatHistory() {
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
                    if (window.innerWidth <= 991.98) {
                        document.getElementById('sidebarContent').classList.remove('show');
                    }
                });

                chatHistoryContainer.appendChild(chatElement);
            });
        }

        function showDeleteConfirmation(chatId) {
            chatToDelete = chatId;
            confirmDeleteModal.style.display = 'flex';
        }

        function deleteChat() {
            if (!chatToDelete) return;

            if (currentChatId === chatToDelete) {
                currentChatId = 'temp-' + Date.now().toString();
                chatContainer.innerHTML = `
                    <div class="text-center mt-5 pt-5">
                        <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
                    </div>`;
                localStorage.setItem('currentChatId', currentChatId);
                addSuggestionsToChat();
            }

            delete chats[chatToDelete];
            saveChats();
            loadChatHistory();
            confirmDeleteModal.style.display = 'none';
            chatToDelete = null;
        }

        function loadChat(chatId) {
            currentChatId = chatId;
            localStorage.setItem('currentChatId', currentChatId);
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
            chatContainer.innerHTML = `
                <div class="text-center mt-5 pt-5">
                    <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
                </div>`;
            addSuggestionsToChat();
            if (window.innerWidth <= 991.98) {
                document.getElementById('sidebarContent').classList.remove('show');
            }
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
                saveChats();
                loadChatHistory();
            }
            else if (saveToHistory && chats[currentChatId]) {
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

            const messageDiv = document.createElement('div');
            messageDiv.className = `message p-3 ${isUser ? 'user-message' : 'bot-message'}`;

            // Adiciona a hora da mensagem
            const timeSpan = document.createElement('span');
            timeSpan.className = 'message-time';
            timeSpan.textContent = timeString;
            messageDiv.appendChild(timeSpan);

            const lines = content.split('\n');
            lines.forEach(line => {
                const paragraph = document.createElement('p');
                paragraph.textContent = line;
                messageDiv.appendChild(paragraph);
            });

            removeSuggestionsFromChat();
            const placeholder = chatContainer.querySelector('.text-center');
            if (placeholder) {
                chatContainer.removeChild(placeholder);
            }

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
            const originalText = userInput.value;
            userInput.value = 'Enviando...';
            sendButton.disabled = true;


            addMessage(message, true);
            userInput.style.height = 'auto';

            showTyping();

            try {
                const response = await fetch('/query', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ query: message, conversation_id: currentChatId }),
                });
                const responseData = await response.json();

                document.getElementById('typing-indicator')?.remove();

                userInput.disabled = false;
                userInput.value = '';
                userInput.focus();

                sendButton.disabled = false;
                sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

                if (responseData.error) {
                    addMessage(`⚠️ Erro: ${responseData.error}`);
                } else {
                    addMessage(responseData.answer);
                }

            } catch (error) {
                console.error('Erro:', error);
                const typing = document.getElementById('typing-indicator');
                if (typing) typing.remove();

                userInput.disabled = false;
                userInput.value = originalText;
                userInput.focus();

                sendButton.disabled = false;
                sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

                addMessage('⚠️ Não foi possível conectar ao servidor.');
            }
        }

        newChatBtn.addEventListener('click', createNewChat);
        sendButton.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });
        confirmDeleteBtn.addEventListener('click', deleteChat);
        cancelDeleteBtn.addEventListener('click', () => {
            confirmDeleteModal.style.display = 'none';
            chatToDelete = null;
        });
    });