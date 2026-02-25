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

        // UMA única página para tudo — sem workers paralelos
        // Workers paralelos = múltiplas páginas pesadas do Maps na RAM → OOM → crash
        const page = await context.newPage();

        // Bloqueia recursos pesados para reduzir memória
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'media', 'font'].includes(type)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        onProgress('Acessando o Google Maps...', 0);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Espera a barra lateral de resultados carregar
        const feedSelector = '.m6QErb[aria-label]';
        try {
            await page.waitForSelector(feedSelector, { timeout: 20000 });
        } catch (e) {
            onProgress('Aviso: Não encontrei a lista de resultados. Verifique se o link está correto.', 0);
        }

        // --- FASE 1: Scroll para capturar todos os cards ---
        let previousHeight = 0;
        let previousCount = 0;
        let sameCount = 0;

        onProgress('Rolando a página e capturando todos os locais...', 0);

        while (true) {
            const scrollStatus = await page.evaluate((selector) => {
                const feed = document.querySelector(selector);
                if (!feed) return { scrolled: false, height: 0 };
                feed.scrollBy(0, 3000);
                return { scrolled: true, height: feed.scrollHeight };
            }, feedSelector);

            if (!scrollStatus.scrolled) break;

            await page.waitForTimeout(1500);

            const count = await page.evaluate(() => document.querySelectorAll('a.hfpxzc').length);
            onProgress(`Rolando a página... (${count} locais visíveis)`, count);

            if (scrollStatus.height === previousHeight && count === previousCount) {
                sameCount++;
                if (sameCount >= 5) break;
            } else {
                sameCount = 0;
            }
            previousHeight = scrollStatus.height;
            previousCount = count;
        }

        // Coleta todos os cards (nome + URL)
        const places = await page.evaluate(() =>
            Array.from(document.querySelectorAll('a.hfpxzc')).map(a => ({
                name: a.getAttribute('aria-label') || 'Desconhecido',
                url: a.href
            }))
        );

        // Remove duplicatas
        const uniquePlaces = [];
        const seenUrls = new Set();
        for (const p of places) {
            if (!seenUrls.has(p.url)) {
                seenUrls.add(p.url);
                uniquePlaces.push(p);
            }
        }

        onProgress(`${uniquePlaces.length} locais encontrados. Extraindo nome e telefone...`, uniquePlaces.length);

        // --- FASE 2: Visita cada lugar na mesma página (sequencial, baixo consumo de RAM) ---
        const finalData = [];

        for (let i = 0; i < uniquePlaces.length; i++) {
            const place = uniquePlaces[i];
            let phone = null;

            try {
                await page.goto(place.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // Aguarda o telefone aparecer no DOM (JS assíncrono do Maps)
                try {
                    await page.waitForSelector(
                        'a[href^="tel:"], button[data-item-id*="phone:tel:"]',
                        { timeout: 5000 }
                    );
                } catch (e) { /* lugar sem telefone, ok */ }

                phone = await page.evaluate(() => {
                    // Método 0: <a href="tel:..."> — o mais confiável e semântico
                    const telLink = document.querySelector('a[href^="tel:"]');
                    if (telLink) {
                        return telLink.getAttribute('href').replace('tel:', '').trim();
                    }

                    // Método 1: data-item-id no botão do Maps
                    const phoneBtn = document.querySelector('button[data-item-id*="phone:tel:"]');
                    if (phoneBtn) {
                        return phoneBtn.getAttribute('data-item-id').replace(/.*phone:tel:/, '').trim();
                    }

                    // Método 2: aria-label de botão de telefone
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
                        if (match && match[0].replace(/\D/g, '').length >= 8) return match[0].trim();
                    }

                    // Método 4: Regex no corpo da página (fallback final)
                    for (let line of document.body.innerText.split('\n')) {
                        line = line.trim();
                        if (!line || line.length > 60) continue;
                        if (line.match(/(Rua|Av\.|Avenida|Praça|Rodovia|Bairro|CEP|Estado|Cidade|Logradouro)/i)) continue;
                        const match = line.replace(/\d{5}-\d{3}/g, '')
                            .match(/(?:\+?55\s?)?(?:\(?0?[1-9]{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}/);
                        if (match && match[0].replace(/\D/g, '').length >= 8) return match[0];
                    }
                    return null;
                });

            } catch (e) {
                if (e.message && e.message.includes('has been closed')) {
                    // Browser fechou (OOM): registra todos os restantes com telefone vazio
                    for (let j = i; j < uniquePlaces.length; j++) {
                        finalData.push({ name: uniquePlaces[j].name, phone: '' });
                    }
                    onProgress(`Extração parcial: ${finalData.length} contatos registrados.`, finalData.length);
                    return finalData;
                }
                console.error(`Falha para ${place.name}: ${e.message}`);
            }

            finalData.push({ name: place.name, phone: phone || '' });
            onProgress(`Extraindo nome e telefone... (${i + 1}/${uniquePlaces.length})`, i + 1);
        }

        onProgress(`Extração finalizada! ${finalData.length} contatos coletados.`, finalData.length);
        return finalData;

    } catch (e) {
        console.error('Maps Scraping error: ', e);
        throw e;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}
