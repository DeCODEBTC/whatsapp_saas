import { chromium } from 'playwright';

/**
 * Extrai contatos do Google Maps e envia progresso via callback.
 *
 * @param {string} url - Link do Google Maps
 * @param {function} onProgress - Callback(status, count) para atualizar o frontend
 * @returns {Promise<Array>} - Array com os resultados { name, phone }
 */
export async function extractFromMaps(url, onProgress) {
    let browser;
    try {
        onProgress('Iniciando navegador...', 0);
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            locale: 'pt-BR',
            viewport: { width: 1280, height: 720 }
        });

        const mainPage = await context.newPage();

        onProgress('Acessando o Google Maps...', 0);
        await mainPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Espera a barra lateral carregar
        const feedSelector = '.m6QErb[aria-label]';
        try {
            await mainPage.waitForSelector(feedSelector, { timeout: 20000 });
        } catch (e) {
            onProgress('Aviso: Não encontrei a lista de resultados. Verifique se o link está correto.', 0);
        }

        // --- FASE 1: Scroll para capturar todos os cards ---
        let previousHeight = 0;
        let previousCount = 0;
        let sameCount = 0;

        onProgress('Rolando a página e capturando links de todos os locais...', 0);

        while (true) {
            const scrollStatus = await mainPage.evaluate((selector) => {
                const feed = document.querySelector(selector);
                if (!feed) return { scrolled: false, height: 0 };
                feed.scrollBy(0, 3000);
                return { scrolled: true, height: feed.scrollHeight };
            }, feedSelector);

            if (!scrollStatus.scrolled) break;

            // Aguarda o conteúdo carregar após o scroll
            await mainPage.waitForTimeout(1500);

            const count = await mainPage.evaluate(() => document.querySelectorAll('a.hfpxzc').length);

            onProgress(`Rolando a página... (${count} locais visíveis)`, count);

            // Para apenas se altura E contagem não mudaram por 5 iterações consecutivas
            if (scrollStatus.height === previousHeight && count === previousCount) {
                sameCount++;
                if (sameCount >= 5) break;
            } else {
                sameCount = 0;
            }
            previousHeight = scrollStatus.height;
            previousCount = count;
        }

        // Coleta todos os cards visíveis
        const places = await mainPage.evaluate(() => {
            return Array.from(document.querySelectorAll('a.hfpxzc')).map(a => ({
                name: a.getAttribute('aria-label') || 'Desconhecido',
                url: a.href
            }));
        });

        // Remove duplicatas de URL
        const uniquePlaces = [];
        const seenUrls = new Set();
        for (const p of places) {
            if (!seenUrls.has(p.url)) {
                seenUrls.add(p.url);
                uniquePlaces.push(p);
            }
        }

        onProgress(`${uniquePlaces.length} locais encontrados. Iniciando extração com 2 workers paralelos...`, uniquePlaces.length);

        // Fecha página principal para economizar RAM antes dos workers
        await mainPage.close();

        // --- FASE 2: Workers Paralelos ---
        // 2 workers para evitar OOM no Railway (512MB RAM)
        // 3 workers × páginas pesadas do Google Maps = crash garantido
        const CONCURRENCY = 2;
        let completedCount = 0;
        const finalData = [];
        const queue = [...uniquePlaces];

        const workerFn = async (workerId) => {
            const page = await context.newPage();

            // Bloqueia recursos pesados: imagens, fontes, CSS e mídia
            await page.route('**/*', (route) => {
                const type = route.request().resourceType();
                if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
                    route.abort();
                } else {
                    route.continue();
                }
            });

            while (queue.length > 0) {
                const place = queue.shift();
                console.log(`[Worker ${workerId}] Extraindo: ${place.name}`);
                let phone = null;
                let retries = 2;

                while (retries >= 0) {
                    try {
                        await page.goto(place.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                        // Aguarda o botão de telefone renderizar (JS assíncrono do Maps)
                        try {
                            await page.waitForSelector(
                                'button[data-item-id*="phone:tel:"], button[data-tooltip*="telefone"], button[data-tooltip*="phone"]',
                                { timeout: 5000 }
                            );
                        } catch (e) { /* lugar sem telefone, segue */ }

                        phone = await page.evaluate(() => {
                            // Método 1: data-item-id com número de telefone (mais confiável)
                            const phoneBtn = document.querySelector('button[data-item-id*="phone:tel:"]');
                            if (phoneBtn) {
                                return phoneBtn.getAttribute('data-item-id').replace(/.*phone:tel:/, '').trim();
                            }

                            // Método 2: aria-label de botão de telefone/tooltip
                            const tooltipBtn = document.querySelector('button[data-tooltip*="telefone"], button[data-tooltip*="phone"]');
                            if (tooltipBtn) {
                                let label = tooltipBtn.getAttribute('aria-label') || '';
                                if (label.includes(':')) label = label.split(':').pop().trim();
                                label = label.replace(/Copiar|número|de|telefone|phone|number/gi, '').trim();
                                if (label.replace(/\D/g, '').length >= 8) return label;
                            }

                            // Método 3: qualquer elemento com data-item-id contendo "phone"
                            const phoneEl = document.querySelector('[data-item-id*="phone"]');
                            if (phoneEl) {
                                const text = (phoneEl.getAttribute('aria-label') || phoneEl.innerText || '').trim();
                                const match = text.match(/[\+\d][\d\s\-\(\)]{7,19}/);
                                if (match) {
                                    const digits = match[0].replace(/\D/g, '');
                                    if (digits.length >= 8 && digits.length <= 15) return match[0].trim();
                                }
                            }

                            // Método 4: Regex no corpo da página (fallback)
                            const lines = document.body.innerText.split('\n');
                            for (let line of lines) {
                                line = line.trim();
                                if (!line || line.length > 60) continue;
                                if (line.match(/(Rua|Av\.|Avenida|Praça|Rodovia|Bairro|CEP|Estado|Cidade|Logradouro)/i)) continue;
                                const cleanLine = line.replace(/\d{5}-\d{3}/g, '');
                                const match = cleanLine.match(/(?:\+?55\s?)?(?:\(?0?[1-9]{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}/);
                                if (match) {
                                    const digits = match[0].replace(/\D/g, '');
                                    if (digits.length >= 8 && digits.length <= 15) return match[0];
                                }
                            }
                            return null;
                        });

                        break; // sucesso
                    } catch (e) {
                        if (e.message && e.message.includes('has been closed')) {
                            // Browser crashou (OOM): registra item atual e drena a fila
                            // para garantir que o resultado final tenha TODOS os contatos
                            console.error(`[Worker ${workerId}] Browser fechado. Registrando itens restantes sem telefone.`);
                            finalData.push({ name: place.name, phone: '' });
                            completedCount++;
                            while (queue.length > 0) {
                                const remaining = queue.shift();
                                finalData.push({ name: remaining.name, phone: '' });
                                completedCount++;
                            }
                            onProgress(`Extração parcial (browser reiniciou). (${completedCount}/${uniquePlaces.length})`, completedCount);
                            await page.close().catch(() => {});
                            return;
                        }
                        console.error(`[Worker ${workerId}] Tentativa falhou para ${place.name}: ${e.message}`);
                        retries--;
                        // setTimeout puro — page.waitForTimeout falha se a página crashar
                        if (retries >= 0) await new Promise(r => setTimeout(r, 1000));
                    }
                }

                // Adiciona SEMPRE à lista final, mesmo sem telefone
                finalData.push({ name: place.name, phone: phone || '' });
                completedCount++;
                onProgress(`Extraindo telefones... (${completedCount}/${uniquePlaces.length})`, completedCount);
            }

            await page.close().catch(() => {});
        };

        const workers = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            workers.push(workerFn(i + 1));
        }

        await Promise.all(workers);

        onProgress(`Extração finalizada! ${finalData.length} contatos coletados.`, finalData.length);
        return finalData;

    } catch (e) {
        console.error('Maps Scraping error: ', e);
        throw e;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}
