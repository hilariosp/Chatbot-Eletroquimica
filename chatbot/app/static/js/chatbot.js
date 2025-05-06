// Função para alternar a sidebar em dispositivos móveis 
function toggleSidebar() {
    const sidebarContent = document.getElementById('sidebarContent');
    sidebarContent.classList.toggle('show');
}

document.addEventListener('DOMContentLoaded', function() {
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatHistoryContainer = document.getElementById('chat-history-container');
    const confirmDeleteModal = document.getElementById('confirm-delete');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    
    // Estado da aplicação
    let currentChatId = Date.now().toString();
    let chats = JSON.parse(localStorage.getItem('danielia-chats')) || {};
    let chatToDelete = null;
    
    // Inicialização
    if (Object.keys(chats).length === 0) {
        currentChatId = 'temp-' + Date.now().toString();
    } else if (!chats[currentChatId]) {
        const sortedChats = Object.values(chats).sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
        currentChatId = sortedChats.length > 0 ? sortedChats[0].id : 'temp-' + Date.now().toString();
    }
    
    loadChat(currentChatId);
    loadChatHistory();
    
    // Auto-ajuste da altura do textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
    
    // Funções auxiliares
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
        }
        
        delete chats[chatToDelete];
        saveChats();
        loadChatHistory();
        confirmDeleteModal.style.display = 'none';
        chatToDelete = null;
    }
    
    function loadChat(chatId) {
        currentChatId = chatId;
        chatContainer.innerHTML = '';
        
        if (chatId.startsWith('temp-')) {
            chatContainer.innerHTML = `
                <div class="text-center mt-5 pt-5">
                    <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
                </div>`;
            return;
        }
        
        const chat = chats[chatId];
        if (!chat) return;
        
        if (chat.messages.length === 0) {
            chatContainer.innerHTML = `
                <div class="text-center mt-5 pt-5">
                    <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
                </div>`;
        } else {
            chat.messages.forEach(msg => {
                addMessage(msg.content, msg.isUser, false);
            });
        }
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function createNewChat() {
        currentChatId = 'temp-' + Date.now().toString();
        chatContainer.innerHTML = `
            <div class="text-center mt-5 pt-5">
                <h2 class="text-white display-4">Como posso te ajudar<span class="text-danger">?</span></h2>
            </div>`;
        
        if (window.innerWidth <= 991.98) {
            document.getElementById('sidebarContent').classList.remove('show');
        }
        
        userInput.focus();
    }
    
    function addMessage(content, isUser = false, saveToHistory = true) {
        if (isUser && currentChatId.startsWith('temp-')) {
            const newChatId = Date.now().toString();
            chats[newChatId] = {
                id: newChatId,
                title: content.length > 30 ? content.substring(0, 30) + '...' : content,
                messages: [{
                    content,
                    isUser: true,
                    timestamp: new Date().toISOString()
                }],
                createdAt: new Date().toISOString()
            };
            currentChatId = newChatId;
            saveChats();
            loadChatHistory();
        }
        else if (saveToHistory && chats[currentChatId]) {
            const chat = chats[currentChatId];
            chat.messages.push({
                content,
                isUser,
                timestamp: new Date().toISOString()
            });
            
            if (isUser && chat.messages.length === 1) {
                chat.title = content.length > 30 ? content.substring(0, 30) + '...' : content;
            }
            
            saveChats();
            loadChatHistory();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message p-3 ${isUser ? 'user-message' : 'bot-message'}`;
        messageDiv.textContent = content;
        
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
        
        addMessage(message, true);
        userInput.value = '';
        userInput.style.height = 'auto';
        
        showTyping();
        
        try {
            const response = await fetch(handleQueryURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: message })
            });
            
            const data = await response.json();
            document.getElementById('typing-indicator').remove();
            
            if (data.error) {
                addMessage(`⚠️ Erro: ${data.error}`);
            } else {
                addMessage(data.answer);
            }
            
        } catch (error) {
            console.error('Erro:', error);
            const typing = document.getElementById('typing-indicator');
            if (typing) typing.remove();
            
            addMessage('⚠️ Não foi possível conectar ao servidor. Verifique sua conexão.');
        }
    }
    
    // Event listeners
    confirmDeleteBtn.addEventListener('click', deleteChat);
    cancelDeleteBtn.addEventListener('click', () => {
        confirmDeleteModal.style.display = 'none';
        chatToDelete = null;
    });
    
});
