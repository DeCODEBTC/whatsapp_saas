import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
// Em Node.js commonjs importamos via require, mas como estamos em ES Modules, precisamos dessa sintaxe 
// ou renomear o package 'whatsapp-web.js' no import dependendo da lib, usamos pkg destructing.
import qrcode from 'qrcode-terminal';
import { supabase } from './supabaseClient.js';

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
    if (!client) return { success: false, message: 'Nenhum cliente rodando' };

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
        await updateDbSessionStatus('disconnected');
    }
    return { success: true };
}

export async function startWhatsAppClient() {
    if (client) {
        console.log('Cliente já instanciado.');
        return;
    }

    console.log('Iniciando Cliente WhatsApp-Web.js...');

    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './whatsapp_sessions' // Pasta onde os cookies serão salvos no servidor
        }),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            headless: true
        }
    });

    client.on('qr', async (qr) => {
        // Generate and scan this code with your phone
        console.log('QR RECEIVED', qr);
        sessionStatus = 'qrcode';
        currentQR = qr;

        // Atualiza o BD para o frontend saber
        await updateDbSessionStatus('qrcode');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', async () => {
        console.log('Cliente WhatsApp está PRONTO!');
        sessionStatus = 'connected';
        currentQR = null;
        await updateDbSessionStatus('connected');
    });

    client.on('authenticated', () => {
        console.log('Autenticado com sucesso!');
    });

    client.on('auth_failure', async msg => {
        console.error('Falha na autenticação', msg);
        sessionStatus = 'disconnected';
        await updateDbSessionStatus('disconnected');
    });

    client.on('disconnected', async (reason) => {
        console.log('Cliente WhatsApp Desconectado', reason);
        sessionStatus = 'disconnected';
        currentQR = null;
        await updateDbSessionStatus('disconnected');
        client.destroy();
        client = null;
    });

    client.initialize();
}

async function updateDbSessionStatus(status) {
    const sessionName = 'default';

    // Tenta checar se já existe e atualizar, senão cria
    const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('session_name', sessionName)
        .single();

    if (data) {
        await supabase.from('whatsapp_sessions')
            .update({ status: status })
            .eq('id', data.id);
    } else {
        await supabase.from('whatsapp_sessions')
            .insert([{ session_name: sessionName, status: status }]);
    }
}
