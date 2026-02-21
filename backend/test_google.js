import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        locale: 'pt-BR'
    });
    const page = await context.newPage();

    // Instead of using the maps URL, we just query google search for the business name + phone
    await page.goto("https://www.google.com/search?q=Speranza+Pizzaria+telefone", { waitUntil: 'domcontentloaded' });

    // Fallback regex inside the page evaluate
    const phone = await page.evaluate(() => {
        // Look for the big phone number box in Google Search knowledge panel
        const el = document.querySelector('span.LrzXr.zdqRlf.kno-fv');
        if (el) return el.innerText;

        const el2 = document.querySelector('.Z0LcW');
        if (el2) return el2.innerText;

        // Find generic phone number pattern in the text if specific structure is missing
        const text = document.body.innerText;
        const match = text.match(/(?:\(?0?[1-9]{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}/);
        if (match) return match[0];

        return null;
    });

    console.log("Telefone do Google Search:", phone);
    await browser.close();
})();
