import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { startWhatsAppClient, disconnectWhatsAppClient, getSessionStatus, getQRCode, getClient } from './whatsappService.js';
import { extractFromMaps } from './mapsService.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Rotas do WhatsApp
app.get('/api/whatsapp/status', (req, res) => {
    res.json({ status: getSessionStatus() });
});

app.get('/api/whatsapp/qr', (req, res) => {
    const qr = getQRCode();
    if (!qr) {
        return res.status(404).json({ error: 'QR Code not available or session already connected' });
    }
    res.json({ qr });
});

app.post('/api/whatsapp/start', async (req, res) => {
    const status = getSessionStatus();
    if (status === 'connected') {
        return res.json({ message: 'Already connected', status });
    }

    // Start the background process without awaiting its full resolution 
    // so the HTTP request doesn't hang forever
    startWhatsAppClient();
    res.json({ message: 'WhatsApp client starting initialization...' });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
    const result = await disconnectWhatsAppClient();
    if (result.success) {
        res.json({ message: 'WhatsApp desconectado com sucesso' });
    } else {
        res.status(400).json({ error: result.message });
    }
});

// ==========================================
// NOVAS ROTAS SÃO ADICIONADAS AQUI 
// ==========================================

// 1. Rota de Extração (Server-Sent Events)
app.get('/api/extract', async (req, res) => {
    const { url } = req.query;
    if (!url || !url.includes('google.com/maps')) {
        return res.status(400).json({ error: 'URL do Google Maps inválida ou não fornecida.' });
    }

    // Configura os headers para Server-Sent Events (SSE)
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    // Função helper para enviar o update em formato compatível com EventStream
    const sendEvent = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const results = await extractFromMaps(url, (message, count) => {
            sendEvent('progress', { message, count });
        });

        sendEvent('result', results);
        res.end(); // Encerra a conexão SSE
    } catch (error) {
        console.error('Erro na extração:', error);
        sendEvent('error', { error: 'Ocorreu um erro durante a extração.' });
        res.end();
    }
});

// 2. Rota para Disparos Individuais
app.post('/api/whatsapp/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'Telefone e Mensagem são obrigatórios.' });
    }

    const status = getSessionStatus();
    if (status !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp não está conectado.' });
    }

    const client = getClient();

    // Formata telefone (removendo não-numéricos) e tira o zero inicial do DDD se houver
    let cleanPhone = phone.replace(/\D/g, '');
    cleanPhone = cleanPhone.replace(/^0+/, ''); // Ex: 044999... -> 44999...

    if (!cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
    }

    // Evita mandar lixo nulo (ex: 55 apenas) pra dentro do wasm do client que estoura 500
    if (cleanPhone.length < 12) {
        return res.status(400).json({ error: `Telefone inválido ou muito curto: ${cleanPhone}` });
    }

    const formattedPhone = cleanPhone + '@c.us';

    try {
        // Verifica se é ZAP usando getNumberId (que lida perfeitamente com a variação do 9º dígito do Brasil)
        const numberId = await client.getNumberId(cleanPhone);
        if (!numberId) {
            return res.status(400).json({ error: 'Número não registrado no WhatsApp.' });
        }

        await client.sendMessage(numberId._serialized, message);
        return res.json({ success: true, message: 'Mensagem enviada com sucesso.' });
    } catch (error) {
        console.error(`Erro crítico no envio para ${formattedPhone}:`, error);
        // Retorna o inner message do erro para pintar o motivo real no frontend
        return res.status(500).json({ error: `Falha no Zap: ${error.message || 'Desconhecido'}` });
    }
});

// Iniciando o servidor
app.listen(PORT, () => {
    console.log(`🚀 Backend SaaS rodando na porta ${PORT}`);

    // Opcional: já tentar iniciar o cliente WhatsApp na memoria ao ligar o servdor
    startWhatsAppClient();
});
