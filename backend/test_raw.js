import fs from 'fs';

const url = "https://www.google.com/maps/place/Speranza+Pizzaria/data=!4m7!3m6!1s0x94ce591add48227b:0xacc3cfcd40ca8ed0!8m2!3d-23.5599026!4d-46.6853877!16s%2Fg%2F1tcydzsz!19sChIJeyJIrdRZzpQR0I7KQM3Pw6w?authuser=0&hl=pt-BR&rclk=1";

console.log("Baixando o HTML bruto via fetch...");
const res = await fetch(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    }
});
const html = await res.text();
fs.writeFileSync('raw.html', html);

// Search phone number pattern in raw html
const matches = html.match(/(?:\+55\s?)?(?:\(?0?[1-9]{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}/gi) || [];
const valid = matches.filter(p => !p.startsWith('202') && p.replace(/\D/g, '').length >= 10);
console.log("Found phones:", [...new Set(valid)]);
