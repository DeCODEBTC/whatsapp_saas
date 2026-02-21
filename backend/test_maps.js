import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: false }); // VAMOS VER O QUE ELE ESTÁ VENDO
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        locale: 'pt-BR'
    });
    const page = await context.newPage();

    // We do NOT block anything

    // Test URL extracted from the actual search
    const url = "https://www.google.com/maps/place/Speranza+Pizzaria/data=!4m7!3m6!1s0x94ce591add48227b:0xacc3cfcd40ca8ed0!8m2!3d-23.5599026!4d-46.6853877!16s%2Fg%2F1tcydzsz!19sChIJeyJIrdRZzpQR0I7KQM3Pw6w?authuser=0&hl=pt-BR&rclk=1";

    console.log("Acessando a página...");
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Aguardamos 5 segundos
    await page.waitForTimeout(5000);

    const phone = await page.evaluate(() => {
        const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]');
        if (phoneBtn) {
            return phoneBtn.getAttribute('data-item-id').replace('phone:tel:', '');
        }
        const tooltipBtn = document.querySelector('button[data-tooltip*="telefone"], button[data-tooltip*="phone"]');
        if (tooltipBtn) {
            let label = tooltipBtn.getAttribute('aria-label') || '';
            if (label.includes(':')) return label.split(':').pop().trim();
            return label.replace(/Copiar|número|de|telefone|phone|number/gi, '').trim();
        }
        return null;
    });

    console.log("Telefone Encontrado:", phone);
    await browser.close();
})();
