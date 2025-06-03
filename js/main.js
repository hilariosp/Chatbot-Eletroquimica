// js/main.js

// Gerenciamento de estado do chat no frontend (GLOBAL)
// Este objeto 'chatState' será acessado por outros scripts como chatbot.js
const chatState = {
    chatId: null, // ID do chat atual, gerenciado por chatbot.js (local storage)
    currentQuestionData: null, // Para o estado do quiz (usado pelo chatbot)
    questionsList: [], // Questões carregadas (usado pelo chatbot)
    potentialsTable: {}, // Tabela de potenciais carregada (usado pelo chatbot)
    knowledgeBase: "" // Conteúdo da base de dados carregado (usado pelo chatbot)
};

// SUAS CHAVES DA API DO OPENROUTER
// Adicione todas as suas chaves da API do OpenRouter aqui.
// A função irá alternar aleatoriamente entre elas.
const OPENROUTER_API_KEYS = [
    "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"
];

// Função para obter uma chave de API aleatória
function getRandomOpenRouterApiKey() {
    if (OPENROUTER_API_KEYS.length === 0) {
        console.error("Erro: Nenhuma chave da API do OpenRouter configurada.");
        return null;
    }
    const randomIndex = Math.floor(Math.random() * OPENROUTER_API_KEYS.length);
    return OPENROUTER_API_KEYS[randomIndex];
}

// ==========================================================
// FUNÇÕES DE CARREGAMENTO DE DADOS ESTÁTICOS (do GitHub Pages)
// ==========================================================

async function loadQuestions() {
    try {
        const response = await fetch('./data/questoes/eletroquimica.json'); 
        if (!response.ok) {
            throw new Error(`Erro ao carregar questões: ${response.statusText}`);
        }
        const data = await response.json();
        
        let formattedQuestions = [];
        if (Array.isArray(data)) {
            data.slice(0, 10).forEach(item => { // Limita a 10 questões
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
        } else if (typeof data === 'object' && data !== null) { // Caso seja um único objeto de questão
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
    // AGORA: Caminho para o arquivo da base de dados é 'eletroquimica.json'
    const knowledgeBaseFile = './data/basededados/eletroquimica.json'; 
    
    try {
        const response = await fetch(knowledgeBaseFile);
        if (!response.ok) {
            console.warn(`Ficheiro da base de dados não encontrado ou erro ao carregar ${knowledgeBaseFile}: ${response.statusText}`);
            chatState.knowledgeBase = ""; // Garante que a base de dados esteja vazia em caso de erro
            return;
        }
        const jsonData = await response.json();
        
        // Formata o JSON para uma string legível pela IA, incluindo as palavras-chave
        if (Array.isArray(jsonData)) {
            fileText = jsonData.map(item => {
                let formattedItem = "";
                if (item.topico) formattedItem += `Tópico: ${item.topico}\n`;
                if (item.conteudo) formattedItem += `Conteúdo: ${item.conteudo}\n`;
                if (item.palavras_chave && item.palavras_chave.length > 0) {
                    formattedItem += `Palavras-chave: ${item.palavras_chave.join(", ")}\n`;
                }
                return formattedItem;
            }).join("\n---\n"); // Separador entre tópicos
        } else {
            // Caso o JSON não seja um array (e.g., um único objeto ou outro formato)
            fileText = JSON.stringify(jsonData, null, 2); 
        }
        
        content += `\n--- Conteúdo de ${knowledgeBaseFile} ---\n${fileText.substring(0, 7500)}\n`; // Limita a 7500 caracteres por arquivo (para deixar espaço para o prompt)
        chatState.knowledgeBase = content.substring(0, 8000); // Limita o total a 8000 caracteres
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
    chatState.currentQuestionData = q; // Armazena a questão atual no estado
    return q.pergunta;
}

// ==========================================================
// FUNÇÃO UNIFICADA PARA CHAMAR A API OPENROUTER DIRETAMENTE
// ==========================================================

/**
 * Envia uma requisição diretamente para a API do OpenRouter.
 * @param {string} prompt O texto do prompt para a IA.
 * @param {string} systemPrompt O prompt de sistema para a IA.
 * @param {string} [model="meta-llama/llama-3.2-3b-instruct:free"] Modelo da IA a ser usado.
 * @param {number} [temperature=0.5] Temperatura da IA.
 * @param {number} [max_tokens=1500] Máximo de tokens da resposta da IA.
 * @returns {Promise<string>} A resposta da IA.
 */
async function callOpenRouterAPI(prompt, systemPrompt, model = "meta-llama/llama-3.2-3b-instruct:free", temperature = 0.5, max_tokens = 1500) {
    // Obtém uma chave de API aleatória a cada chamada
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
                "Authorization": "Bearer " + currentApiKey, // Usa a chave aleatória aqui
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.origin, // Usa o domínio atual para o referer
                "X-Title": "PilhIA Frontend" // Identificador para o OpenRouter
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
                    console.error("Detalhes do erro da API OpenRouter (raw JSON):", errorData);
                    
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
                    errorDetails = `Resposta da API não é JSON válido. Texto: ${errorText.substring(0, 500)}... (Erro de parse: ${jsonParseError.message})`;
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
        const displayError = error instanceof Error ? error.message : String(error);
        return `⚠️ Erro na comunicação com a IA: ${displayError}.`;
    }
}

// ==========================================================
// SYSTEM_PROMPTS (para diferentes contextos de IA)
// ==========================================================

const SYSTEM_PROMPT_CHATBOT = `
Você é PilhIA, um assistente especializado e focado EXCLUSIVAMENTE em eletroquímica, baterias, eletrólise e pilha de Daniell.

1. COMPORTAMENTO:
- Mantenha respostas claras, concisas e diretamente relacionadas à eletroquímica.
- **FORNEÇA RESPOSTAS APENAS COM BASE NA DOCUMENTAÇÃO DE REFERÊNCIA EXPLÍCITAMENTE FORNECIDA NO CONTEXTO. NÃO BUSQUE INFORMAÇÕES EXTERNAS.**
- **Se a pergunta for para 'entender' ou 'explicar' um conceito presente no contexto (ex: 'Quero entender eletroquímica', 'Explique a eletrólise'), você DEVE usar o conteúdo da base de dados para fornecer uma explicação clara e concisa.**
- **Se o usuário solicitar uma explicação usando analogias (ex: 'Explique eletroquímica fazendo analogias com um jogo'), você PODE usar analogias, desde que elas sirvam para CLARIFICAR os conceitos de eletroquímica presentes na sua base de dados. A analogia deve ser uma FERRAMENTA de ensino, não uma forma de introduzir informações externas ou fora do escopo.**
- Se o conceito não estiver explicitamente no contexto, ou a pergunta for muito vaga ou fora do tópico de eletroquímica (baterias, eletrólise, pilha de Daniell), responda APENAS E EXCLUSIVAMENTE: "Não sei responder isso".
- Se a pergunta for incompleta (ex: 'o que é a'), responda: "Não sei responder isso".
- Se for perguntado algo fora de eletroquímica (baterias, eletrólise, pilha de Daniell), responda que não pode responder por estar fora do assunto.
- Se pedir questões sobre eletroquímica, você deve pegar elas diretamente da sua lista de questões (que está no seu contexto), e soltar apenas uma por vez.
- Ao explicar a resposta de uma questão, forneça APENAS a justificativa conceitual e quimicamente ACURADA para a alternativa CORRETA. NÃO re-afirme a letra da alternativa correta, NÃO mencione outras alternativas e NÃO tente re-calcular ou re-raciocinar a questão. Sua explicação deve ser uma justificativa direta, concisa e precisa, focando nos princípios da eletroquímica.

2. FORMATO:
- Use parágrafos curtos e marcadores quando apropriado.
- Não faça uso de formatações complexas como LaTeX ou fórmulas matemáticas embutidas no texto; use texto simples.
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
// FUNÇÕES DE PROCESSAMENTO DE QUERIES (para o chatbot geral)
// ==========================================================

async function processUserQuery(user_input) {
    const user_lower = user_input.toLowerCase();
    let response = "";

    // 1. Lógica para cálculo de voltagem (PRIORITÁRIA)
    if (user_lower.includes("calcular a voltagem de uma pilha de")) {
        const eletrodosStr = user_lower.split("de uma pilha de")[1].trim();
        response = calcularVoltagemPilha(eletrodosStr);
        chatState.currentQuestionData = null; // Limpa o estado do quiz
    } 
    // 2. Lógica para responder a questões (se uma questão foi generada anteriormente)
    else if (chatState.currentQuestionData) {
        const questionData = chatState.currentQuestionData;
        const correct_answer_letter = questionData.resposta_correta.toLowerCase();

        if (user_lower === "sim") {
            response = generateQuestion();
            if (response.includes("Não há mais questões disponíveis.")) {
                chatState.currentQuestionData = null; // Limpa se não há mais questões
            }
        } else if (user_lower === "não") {
            response = "Ótimo. Deseja mais alguma coisa?";
            chatState.currentQuestionData = null; // Limpa o estado do quiz
        } else if (['a', 'b', 'c', 'd', 'e'].includes(user_lower)) {
            // Envia a questão atual para a IA para obter a explicação
            const explanationPrompt = (
                `Para a questão: '${questionData.pergunta}'\n`
                + `A alternativa correta é '(${correct_answer_letter.toUpperCase()})'. `
                + `Forneça a justificativa conceitual e quimicamente ACURADA para esta alternativa, `
                + `focando nos princípios da eletroquímica. `
                + `Seja conciso e preciso. **NÃO re-afirme a letra da alternativa correta, `
                + `NÃO mencione outras alternativas e NÃO tente re-calcular ou re-raciocinar a questão.**`
            );
            const explanation = await callOpenRouterAPI(explanationPrompt, SYSTEM_PROMPT_CHATBOT);
            
            const isCorrect = (user_lower === correct_answer_letter);
            if (isCorrect) {
                response = `Você acertou! A resposta correta é (${correct_answer_letter.toUpperCase()}).\n${explanation}\nDeseja fazer outra questão? (sim/não)`;
            } else {
                response = `Você errou. A resposta correta é (${correct_answer_letter.toUpperCase()}).\n${explanation}\nDeseja fazer outra questão? (sim/não)`;
            }
            // Não limpa currentQuestionData aqui, espera "sim/não" para gerar nova ou finalizar.
        } else {
            // Se não for uma alternativa e não for "sim"/"não", trata como consulta geral
            // e limpa o estado do quiz.
            chatState.currentQuestionData = null; 
            const generalPrompt = `Contexto: ${chatState.knowledgeBase.substring(0, 7000)}\n\nPergunta: ${user_input.substring(0, 300)}`;
            response = await callOpenRouterAPI(generalPrompt, SYSTEM_PROMPT_CHATBOT);
        }
    }
    // 3. Lógica para gerar questões (se não estiver respondendo uma questão ou cálculo)
    else if (user_lower.includes("gerar questões") || user_lower.includes("questões enem") || user_lower.includes("questão")) {
        response = generateQuestion();
    }
    // 4. Lógica para consulta com LLM (se nada acima for acionado)
    else {
        const generalPrompt = `Contexto: ${chatState.knowledgeBase.substring(0, 7000)}\n\nPergunta: ${user_input.substring(0, 300)}`;
        response = await callOpenRouterAPI(generalPrompt, SYSTEM_PROMPT_CHATBOT);
    }

    return response;
}

// As funções loadQuestions, loadPotentialsTable, loadKnowledgeBase,
// calcularVoltagemPilha, generateQuestion, callOpenRouterAPI, processUserQuery
// são expostas globalmente para serem usadas por outros scripts (como chatbot.js).
