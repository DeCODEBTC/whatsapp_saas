import { supabase } from './supabaseClient.js';
import { getClient, getSessionStatus } from './whatsappService.js';

// Função para formatar o número pro formato do whatsapp-web.js (ex: 5511999999999@c.us)
function formatPhoneForWhatsApp(phone) {
    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
    }
    return cleanPhone + '@c.us';
}

function createMessage(template, lead) {
    let message = template;
    message = message.replace(/{nome}/g, lead.name || 'seu estabelecimento');
    message = message.replace(/{empresa}/g, lead.name || 'seu estabelecimento');
    message = message.replace(/{instagram}/g, lead.instagram || 'no seu perfil');
    message = message.replace(/{endereco}/g, lead.address || 'sua região');
    return message;
}

// Loop que roda a cada 10 segundos buscando pendências no banco
export async function startCampaignLoop() {
    console.log('⏳ Iniciando Worker de Campanhas...');

    setInterval(async () => {
        try {
            if (getSessionStatus() !== 'connected') {
                return; // Não envia se não tiver conectado
            }

            const client = getClient();
            if (!client) return;

            // Busch as campanhas rodando (running)
            const { data: runningCampaigns } = await supabase
                .from('campaigns')
                .select('*')
                .eq('status', 'running');

            if (!runningCampaigns || runningCampaigns.length === 0) {
                return; // Nenhuma campanha rodando
            }

            for (const campaign of runningCampaigns) {
                // Pega 1 lead pendente dessa campanha por vez
                const { data: leadsToProcess } = await supabase
                    .from('campaign_leads')
                    .select(`
            id, 
            status, 
            leads (name, phone, instagram, address)
          `)
                    .eq('campaign_id', campaign.id)
                    .eq('status', 'pending')
                    .limit(1);

                if (leadsToProcess && leadsToProcess.length > 0) {
                    const leadToProcess = leadsToProcess[0];
                    const leadData = Array.isArray(leadToProcess.leads) ? leadToProcess.leads[0] : leadToProcess.leads;

                    if (!leadData.phone || leadData.phone.length < 8) {
                        await supabase.from('campaign_leads')
                            .update({ status: 'error', error_message: 'Sem telefone' })
                            .eq('id', leadToProcess.id);
                        continue;
                    }

                    const message = createMessage(campaign.message_template, leadData);
                    const formattedPhone = formatPhoneForWhatsApp(leadData.phone);

                    console.log(`📤 Enviando para ${leadData.name} - ${formattedPhone}`);

                    try {
                        // Verifica se o número existe no whatsapp (se for mobile/BR, é bom fazer verify)
                        const isRegistered = await client.isRegisteredUser(formattedPhone);
                        if (!isRegistered) {
                            await supabase.from('campaign_leads')
                                .update({ status: 'error', error_message: 'Número não registrado no WhatsApp' })
                                .eq('id', leadToProcess.id);
                            continue;
                        }

                        await client.sendMessage(formattedPhone, message);

                        // Marca como enviado
                        await supabase.from('campaign_leads')
                            .update({ status: 'sent' })
                            .eq('id', leadToProcess.id);

                        console.log(`✅ Enviado com sucesso para ${leadData.name}`);

                        // Dá um pause de 5 segundos de segurança para o rate limit (além dos 10s do setInterval principal)
                        await new Promise(r => setTimeout(r, 5000));

                    } catch (e) {
                        console.error(`❌ Erro ao enviar para ${leadData.name}:`, e.message);
                        await supabase.from('campaign_leads')
                            .update({ status: 'error', error_message: e.message })
                            .eq('id', leadToProcess.id);
                    }
                } else {
                    // Se não achou nenhum pendente pra essa campanha running, então possivelmente finalizou
                    // Verifica se realmente tem 0 pendentes
                    const { count } = await supabase.from('campaign_leads')
                        .select('*', { count: 'exact', head: true })
                        .eq('campaign_id', campaign.id)
                        .eq('status', 'pending');

                    if (count === 0) {
                        console.log(`🏁 Campanha ${campaign.name} finalizada!`);
                        await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
                    }
                }
            }
        } catch (e) {
            console.error('Erro no Worker Loop:', e);
        }
    }, 10000); // Roda a cada 10 segundos
}
