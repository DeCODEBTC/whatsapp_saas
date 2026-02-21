import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
// Em Node.js commonjs importamos via require, mas como estamos em ES Modules, precisamos dessa sintaxe 
// ou renomear o package 'whatsapp-web.js' no import dependendo da lib, usamos pkg destructing.
import qrcode from 'qrcode';

let client = null;
let sessionStatus = 'disconnected'; // 'disconnected' | 'qrcode' | 'connected'
let currentQR = null;

export function getSessionStatus() {
    return sessionStatus;
}

export function getQRCode() {
    return currentQR;
}

export function getClient() {
    return client;
}

export async function disconnectWhatsAppClient() {
    if (!client) {
        sessionStatus = 'disconnected';
        currentQR = null;
        return { success: true, message: 'Nenhum cliente rodando, estado resetado.' };
    }

    try {
        console.log('Solicitando logout do WhatsApp...');
        await client.logout();
    } catch (e) {
        console.error('Erro ao fazer logout, tentando forçar destroy:', e);
    } finally {
        if (client) {
            await client.destroy().catch(() => console.log("Ignorando erro no destroy"));
        }
        client = null;
        sessionStatus = 'disconnected';
        currentQR = null;
    }
    return { success: true };
}

export async function startWhatsAppClient() {
    if (client) {
        console.log('Cliente já instanciado.');
        return;
    }

    console.log('Iniciando Cliente WhatsApp-Web.js...');
    sessionStatus = 'starting';

    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './whatsapp_sessions' // Pasta onde os cookies serão salvos no servidor
        }),
        puppeteer: {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            headless: true
        }
    });

    client.on('qr', async (qr) => {
        // Generate and scan this code with your phone
        console.log('QR RECEIVED (Gerando Base64)');
        sessionStatus = 'qrcode';
        try {
            const qrBase64 = await qrcode.toDataURL(qr);
            currentQR = qrBase64;
        } catch (err) {
            console.error('Erro ao gerar imagem QR', err);
            currentQR = qr; // Fallback
        }
    });

    client.on('ready', async () => {
        console.log('Cliente WhatsApp está PRONTO!');
        sessionStatus = 'connected';
        currentQR = null;
    });

    client.on('authenticated', () => {
        console.log('Autenticado com sucesso!');
    });

    client.on('auth_failure', async msg => {
        console.error('Falha na autenticação', msg);
        sessionStatus = 'disconnected';
    });

    client.on('disconnected', async (reason) => {
        console.log('Cliente WhatsApp Desconectado', reason);
        sessionStatus = 'disconnected';
        currentQR = null;
        client.destroy();
        client = null;
    });

    client.initialize().catch(err => {
        console.error('🚨 Erro Fatal ao iniciar o WhatsApp (Problema no Puppeteer / Chrome executável):', err);
        sessionStatus = 'error_initializing';
        client = null;
    });
}


