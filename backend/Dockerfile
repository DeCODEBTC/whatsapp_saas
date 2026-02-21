FROM node:20-bookworm

# Instala dependências nativas para o Playwright (Chromium) e Puppeteer (WhatsApp)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    libxss1 \
    libnss3 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala as libs do Node
COPY package*.json ./
RUN npm install

# Baixa os binários do Chromium usados pelo scraper do Google Maps
RUN npx playwright install chromium --with-deps

# Copia o restante do código backend
COPY . .

EXPOSE 3001

# Comando de boot do servidor
CMD ["npm", "start"]
