// Funções relacionadas à sidebar (se houver)
function toggleSidebar() {
    const sidebarContent = document.getElementById('sidebarContent');
    if (sidebarContent) {
        sidebarContent.classList.toggle('show');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    
    // Usando 'currentChatId' para consistência com o JS fornecido pelo usuário
    // e 'danielia-chats' para o histórico local.
    let currentChatId = localStorage.getItem('currentChatId') || ('temp-' + Date.now().toString());
    let chats = JSON.parse(localStorage.getItem('danielia-chats')) || {};
    let chatToDelete = null; // Variável para o modal de exclusão (se houver)

    // Função para adicionar sugestões (se houver um container para elas)
    function addSuggestionsToChat() {
        const chatContainer = document.querySelector('.chatbot-container'); // Ou o ID correto do container principal do chat
        if (!chatContainer) {
            console.warn("Elemento '.chatbot-container' não encontrado para adicionar sugestões.");
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
        const chatContainer = document.querySelector('.chatbot-container'); // Ou o ID correto
        if (!chatContainer) return;
        const suggestionsDiv = chatContainer.querySelector('.suggestions');
        if (suggestionsDiv) {
            chatContainer.removeChild(suggestionsDiv);
        }
    }

    // Função para salvar chats no localStorage
    function saveChats() {
        localStorage.setItem('danielia-chats', JSON.stringify(chats));
    }

    // Função para carregar histórico de chats na sidebar (se houver)
    function loadChatHistory() {
        const chatHistoryContainer = document.getElementById('chat-history-container');
        if (!chatHistoryContainer) {
            // console.warn("Elemento 'chat-history-container' não encontrado. Histórico de chats não será carregado.");
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
                // showDeleteConfirmation(chat.id); // Se você tiver um modal de confirmação
                deleteChat(chat.id); // Exclui diretamente para simplificar
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
        chatBox.innerHTML = ''; // Limpa o chatbox
        removeSuggestionsFromChat(); // Remove sugestões ao carregar um chat existente

        const chat = chats[chatId];
        if (!chat || chat.messages.length === 0) {
            // Se o chat está vazio, mostra o placeholder e sugestões
            chatBox.innerHTML = `
                <div class="text-center mt-5 pt-5">
                    <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
                </div>`;
            addSuggestionsToChat();
        } else {
            // Adiciona as mensagens do histórico
            chat.messages.forEach(msg => {
                addMessage(msg.content, msg.isUser, false); // Não salva novamente no histórico
            });
        }
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Função para criar um novo chat (limpa a tela e gera um temp-id)
    function createNewChat() {
        currentChatId = 'temp-' + Date.now().toString();
        localStorage.setItem('currentChatId', currentChatId);
        chatBox.innerHTML = `
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
        const minutes = timestamp.getMinutes().toString().padStart(2, '0');
        const timeString = `${hours}:${minutes}`;

        // Lógica para criar um novo chat real quando o usuário envia a primeira mensagem
        if (isUser && currentChatId.startsWith('temp-')) {
            const newChatId = Date.now().toString(); // Gerar um ID baseado em timestamp
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
            currentChatId = newChatId; // Atualiza o ID da sessão atual
            localStorage.setItem('currentChatId', currentChatId);
            saveChats(); // Salva no localStorage
            loadChatHistory(); // Atualiza a sidebar de histórico
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
            saveChats(); // Salva no localStorage
            loadChatHistory(); // Atualiza a sidebar de histórico
        }

        // Remove o placeholder inicial e sugestões se houver
        const placeholder = chatBox.querySelector('.text-center');
        if (placeholder) {
            chatBox.removeChild(placeholder);
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
            paragraph.textContent = line;
            messageDiv.appendChild(paragraph);
        });

        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight; // Rola para o final
    }

    // Função para mostrar o indicador de digitação
    function showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message p-3 bot-message typing-indicator';
        typingDiv.innerHTML = '<span></span><span></span><span></span>';
        typingDiv.id = 'typing-indicator';
        chatBox.appendChild(typingDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Função principal para enviar mensagem
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        userInput.disabled = true;
        const originalText = userInput.value;
        userInput.value = 'Enviando...';
        sendButton.disabled = true;

        addMessage(message, true); // Adiciona mensagem do usuário e gerencia o chat_id localmente
        userInput.style.height = 'auto';

        showTyping();

        try {
            const response = await fetch('/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // CORREÇÃO CRÍTICA: Envia 'chat_id' como esperado pelo backend
                body: JSON.stringify({ query: message, chat_id: currentChatId }), 
            });
            const responseData = await response.json();

            document.getElementById('typing-indicator')?.remove();

            userInput.disabled = false;
            userInput.value = '';
            userInput.focus();

            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

            if (responseData.error) {
                addMessage(`⚠️ Erro: ${responseData.error}`, false);
            } else {
                addMessage(responseData.answer, false);
            }

            // Não é necessário atualizar currentChatId aqui, pois addMessage já faz isso
            // quando um temp-id é convertido para um ID real.
            // O backend sempre retorna o chat_id correto.

        } catch (error) {
            console.error('Erro:', error);
            const typing = document.getElementById('typing-indicator');
            if (typing) typing.remove();

            userInput.disabled = false;
            userInput.value = originalText;
            userInput.focus();

            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

            addMessage('⚠️ Não foi possível conectar ao servidor.', false);
        }
    }

    // Funções relacionadas à exclusão de chat (se houver modal e botões)
    function showDeleteConfirmation(chatId) {
        const confirmDeleteModal = document.getElementById('confirm-delete');
        if (confirmDeleteModal) {
            chatToDelete = chatId;
            confirmDeleteModal.style.display = 'flex';
        }
    }

    function deleteChat(chatIdToDelete) { // Simplificado para excluir direto
        if (currentChatId === chatIdToDelete) {
            createNewChat(); // Inicia um novo chat se o atual for excluído
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

    // Event listeners para botões de nova conversa e exclusão (se existirem no HTML)
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
    document.addEventListener('DOMContentLoaded', () => {
        loadChat(currentChatId); // Carrega o chat atual (ou cria um novo se temp-)
        loadChatHistory(); // Carrega o histórico na sidebar
        addSuggestionsToChat(); // Adiciona as sugestões iniciais
        userInput.focus(); // Foca no input
    });
});
