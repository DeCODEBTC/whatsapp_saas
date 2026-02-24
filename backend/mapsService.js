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
        onProgress('Iniciando navegador com múltiplos workers...', 0);
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // Context com User-Agent e Locale para parecer mais "humano"
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

        let previousHeight = 0;
        let sameHeightCount = 0;

        onProgress('Rolando a página e capturando links de todos os locais...', 0);

        while (true) {
            const scrollStatus = await mainPage.evaluate((selector) => {
                const feed = document.querySelector(selector);
                if (feed) {
                    feed.scrollBy(0, 3000);
                    return { scrolled: true, height: feed.scrollHeight };
                }
                return { scrolled: false, height: 0 };
            }, feedSelector);

            if (!scrollStatus.scrolled) break;

            if (scrollStatus.height === previousHeight) {
                sameHeightCount++;
                if (sameHeightCount >= 3) break;
            } else {
                sameHeightCount = 0;
            }
            previousHeight = scrollStatus.height;
            await mainPage.waitForTimeout(2000); // Pausa um pouco maior para carregar conteúdo

            const count = await mainPage.evaluate(() => document.querySelectorAll('a.hfpxzc').length);
            onProgress(`Rolando a página... (${count} locais visíveis)`, count);
        }

        // Pega URL direta de todos os cards
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

        onProgress(`${uniquePlaces.length} locais encontrados. Iniciando extração com 5 workers paralelos...`, uniquePlaces.length);

        // Fecha página principal pra economizar RAM
        await mainPage.close();

        // --- FASE 2: Workers Paralelos ---
        const CONCURRENCY = 5;
        let completedCount = 0;
        let finalData = [];
        const queue = [...uniquePlaces];

        const workerFn = async () => {
            const page = await context.newPage();
            // Bloqueia imagens/media para performance
            await page.route('**/*', (route) => {
                const type = route.request().resourceType();
                if (['image', 'media', 'font'].includes(type)) {
                    route.abort();
                } else {
                    route.continue();
                }
            });

            while (queue.length > 0) {
                const place = queue.shift();
                let phone = null;
                let retries = 2; // Tentativas se a página falhar ao carregar

                // Pequeno atraso aleatório para simular comportamento humano
                await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);

                while (retries >= 0) {
                    try {
                        await page.goto(place.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                        // Espera rápida por seletores de telefone
                        try {
                            await page.waitForSelector('button[data-tooltip*="telefone"], button[data-item-id^="phone:"], button[data-tooltip*="phone"], button[data-tooltip*="Copiar"]', { timeout: 6000 });
                        } catch (e) { }

                        phone = await page.evaluate(() => {
                            // Metodo 1: atributo data-item-id
                            const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]');
                            if (phoneBtn) {
                                return phoneBtn.getAttribute('data-item-id').replace('phone:tel:', '');
                            }

                            // Metodo 2: tooltip label
                            const tooltipBtn = document.querySelector('button[data-tooltip*="telefone"], button[data-tooltip*="phone"], button[data-tooltip*="Copiar"]');
                            if (tooltipBtn) {
                                let label = tooltipBtn.getAttribute('aria-label') || '';
                                if (label.includes(':')) label = label.split(':').pop().trim();
                                label = label.replace(/Copiar|número|de|telefone|phone|number/gi, '').trim();
                                if (label.replace(/\D/g, '').length >= 8) return label;
                            }

                            // Metodo 3: fallbacks de Regex
                            const rawText = document.body.innerText.replace(/\d{5}-\d{3}/g, '');
                            const lines = rawText.split('\n');

                            for (let line of lines) {
                                if (line.match(/(Rua|Av\.|Avenida|Praça|Rodovia|Bairro|CEP|Estado|Cidade|Logradouro)/i)) continue;
                                const match = line.match(/(?:\+?55\s?)?(?:\(?0?[1-9]{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}/);
                                if (match) {
                                    const digits = match[0].replace(/\D/g, '');
                                    if (digits.length >= 8 && digits.length <= 15) return match[0];
                                }
                            }
                            return null;
                        });
                        break; // Se chegou aqui, deu certo (mesmo se phone for null)
                    } catch (e) {
                        console.error(`Tentativa falhou para ${place.name}: ${e.message}`);
                        retries--;
                        if (retries >= 0) await page.waitForTimeout(2000);
                    }
                }

                // IMPORTANTE: Adiciona SEMPRE à lista final, mesmo que phone seja null
                finalData.push({
                    name: place.name,
                    phone: phone || ''
                });

                completedCount++;
                onProgress(`Extraindo telefones... (${completedCount}/${uniquePlaces.length})`, completedCount);
            }
            await page.close();
        };

        const workers = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            workers.push(workerFn());
        }

        await Promise.all(workers);

        onProgress(`Extração finalizada com sucesso!`, finalData.length);
        return finalData;

    } catch (e) {
        console.error("Maps Scraping error: ", e);
        throw e;
    } finally {
        if (browser) await browser.close();
    }
}
