// js/chatbot.js

// Chave da API será substituída pelo GitHub Actions no deploy
let openRouterApiKey = "%%OPENROUTER_API_KEY_PLACEHOLDER%%";

// Estado global do chat e dados auxiliares
const chatState = {
    chatId: null, // ID do chat atual, caso queira expandir para multi-chat
    currentQuestionData: null, // Para o estado do quiz
    questionsList: [], // Questões carregadas
    potentialsTable: {}, // Tabela de potenciais
    knowledgeBase: "" // Base de dados carregada
};

// ==========================================================
// OPENROUTER API KEY MANAGEMENT
// ==========================================================

const OPENROUTER_API_KEYS = []; // Deixe vazio no frontend público!

function getRandomOpenRouterApiKey() {
    if (OPENROUTER_API_KEYS.length === 0) {
        if (!openRouterApiKey || openRouterApiKey === "%%OPENROUTER_API_KEY_PLACEHOLDER%%") {
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

// ===========================================================
// FUNÇÕES DE CARREGAMENTO DE DADOS ESTÁTICOS (do GitHub Pages)
// ===========================================================

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

// ==========================================================
// FUNÇÕES DE CÁLCULO E LÓGICA DO QUIZ (FRONTEND)
// ==========================================================

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

// ==========================================================
// SYSTEM PROMPT PARA CHATBOT
// ==========================================================

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

// ==========================================================
// FUNÇÃO UNIFICADA PARA CHAMAR A API OPENROUTER DIRETAMENTE
// ==========================================================

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
                } catch (jsonParseError) {
                    errorDetails = `Resposta da API não é JSON válido. Texto: ${errorText.substring(0, 500)}...`;
                }
            } catch (readError) {
                errorDetails = `Erro ao ler resposta da API: ${readError.message}. Status HTTP: ${response.status} ${response.statusText}`;
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

// ==========================================================
// FUNÇÃO DE PROCESSAMENTO DE CONSULTAS DO CHATBOT
// ==========================================================

async function processUserQuery(user_input) {
    const user_lower = user_input.toLowerCase();
    let response = "";

    // 1. Cálculo de voltagem de pilha
    if (user_lower.includes("calcular a voltagem de uma pilha de")) {
        const eletrodosStr = user_lower.split("de uma pilha de")[1].trim();
        response = calcularVoltagemPilha(eletrodosStr);
        chatState.currentQuestionData = null;
    } 
    // 2. Lógica para responder questões do quiz
    else if (chatState.currentQuestionData) {
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
    }
    // 3. Gerar questões se o usuário pedir
    else if (user_lower.includes("gerar questões") || user_lower.includes("questões enem") || user_lower.includes("questão")) {
        response = generateQuestion();
    }
    // 4. Consulta geral
    else {
        const generalPrompt = `Contexto: ${chatState.knowledgeBase.substring(0, 7000)}\n\nPergunta: ${user_input.substring(0, 300)}`;
        response = await callOpenRouterAPI(generalPrompt, SYSTEM_PROMPT_CHATBOT);
    }

    return response;
}

// ==========================================================
// FUNÇÕES DE UI (CHAT)
// ==========================================================

function displayMessage(message, sender) {
    const chatContainer = document.getElementById('chat-container'); 
    if (!chatContainer) {
        console.error("Erro: Elemento com ID 'chat-container' não encontrado no HTML.");
        return; 
    }
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    messageElement.innerHTML = sender === 'bot typing' ? message : formatMessage(message);
    chatContainer.appendChild(messageElement);
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
    const chatContainer = document.getElementById('chat-container'); 
    if (!chatContainer) return;
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.classList.add('suggestions-container');
    suggestions.forEach(suggestionText => {
        const button = document.createElement('button');
        button.classList.add('suggestion-button');
        button.textContent = suggestionText;
        button.onclick = () => {
            document.getElementById('user-input').value = suggestionText;
            handleUserQuery(suggestionText);
            removeSuggestionsFromChat();
        };
        suggestionsContainer.appendChild(button);
    });
    chatContainer.appendChild(suggestionsContainer);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeSuggestionsFromChat() {
    const chatContainer = document.getElementById('chat-container'); 
    if (!chatContainer) return;
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
    const chatContainer = document.getElementById('chat-container'); 
    if (!chatContainer) return;
    const messages = Array.from(chatContainer.children)
        .filter(msgElement => msgElement.classList.contains('message') && !msgElement.classList.contains('typing') && !msgElement.classList.contains('suggestions-container'))
        .map(msgElement => ({
            text: msgElement.innerText,
            sender: msgElement.classList.contains('user') ? 'user' : 'bot'
        }));
    localStorage.setItem('chatHistory', JSON.stringify(messages));
}

function clearChatHistory() {
    localStorage.removeItem('chatHistory');
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
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
    addSuggestionsToChat(['calcular pilha cobre e zinco']);
}

async function handleUserQuery(user_input) {
    if (!user_input.trim()) return;

    displayMessage(user_input, 'user');
    document.getElementById('user-input').value = '';

    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    try {
        const response = await processUserQuery(user_input);

        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (response) displayMessage(response, 'bot');
        saveChatHistory();
    } catch (error) {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        displayMessage("Ocorreu um erro ao tentar obter a resposta. Por favor, tente novamente.", 'bot');
    }
}

// ==========================================================
// INICIALIZAÇÃO DO CHATBOT AO CARREGAR A PÁGINA
// ==========================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadPotentialsTable();
    await loadKnowledgeBase();
    await loadQuestions();

    if (document.getElementById('chat-container')) loadChatHistory();

    const sendButton = document.getElementById('send-button');
    const userInput = document.getElementById('user-input');

    if (sendButton) {
        sendButton.addEventListener('click', () => {
            handleUserQuery(userInput.value);
        });
    }
    if (userInput) {
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendButton.click();
            }
        });
    }

    displayMessage("Olá! Sou a PilhIA, sua assistente educativa em eletroquímica. Posso te ajudar a **calcular voltagens de pilhas** (ex: 'calcular pilha cobre e zinco').", 'bot');
    addSuggestionsToChat(['calcular pilha cobre e zinco']);
});