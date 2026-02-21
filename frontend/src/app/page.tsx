'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Smartphone, LogIn, Map, Send, Loader2, CheckCircle2 } from 'lucide-react';

export default function Home() {
  const [status, setStatus] = useState<string>('disconnected');
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/status`);
      const data = await res.json();
      setStatus(data.status);

      if (data.status === 'qrcode') {
        const qrRes = await fetch(`${API_URL}/api/whatsapp/qr`);
        const qrData = await qrRes.json();
        if (qrData.qr) {
          // Nós precisaremos que o backend mande Base64 em vez do texto ASCII para mostrar no React, 
          // mas por agora podemos colocar um aviso.
          // O qrcode-terminal funciona apenas no NodeJS. Para mostrar no front precisamos gerar no front via QRCode lib ou o back mandar o base64.
          setQrBase64(qrData.qr);
        }
      }
    } catch (e) {
      console.error("API error", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleConnectClick = async () => {
    setIsLoading(true);
    try {
      await fetch(`${API_URL}/api/whatsapp/start`, { method: 'POST' });
    } catch (e) {
      console.error("Failed to start", e);
    }
  };

  const handleDisconnectClick = async () => {
    setIsLoading(true);
    try {
      await fetch(`${API_URL}/api/whatsapp/disconnect`, { method: 'POST' });
      setStatus('disconnected');
      setQrBase64(null);
    } catch (e) {
      console.error("Failed to disconnect", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 sm:p-12 font-sans flex flex-col items-center justify-center">

      <div className="max-w-4xl w-full flex flex-col items-center text-center gap-4 mb-12">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-2">
          <Smartphone className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
          WhatsApp <span className="text-blue-600 dark:text-blue-500">SaaS</span>
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto">
          Centralize sua extração de leads e disparos de prospecção do WhatsApp.
        </p>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Card do WhatsApp */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-emerald-600"></div>

          <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-500" />
            Sessão do WhatsApp
          </h2>

          {isLoading ? (
            <div className="flex flex-col items-center text-zinc-400 mt-4">
              <Loader2 className="w-8 h-8 animate-spin mb-2 text-emerald-500" />
              <p className="text-sm">Verificando status...</p>
            </div>
          ) : status === 'connected' ? (
            <div className="flex flex-col items-center text-emerald-600 dark:text-emerald-500 mt-4 bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 w-full relative group/conn">
              <CheckCircle2 className="w-10 h-10 mb-2" />
              <p className="font-semibold text-lg">Conectado!</p>
              <p className="text-xs mt-1 text-emerald-600/80 mb-3">Pronto para disparos</p>

              {/* Botão de Desconectar */}
              <button
                onClick={handleDisconnectClick}
                className="text-xs px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors font-medium border border-red-200 dark:border-red-900/50"
              >
                Desconectar WhatsApp
              </button>
            </div>
          ) : status === 'qrcode' ? (
            <div className="flex flex-col items-center text-orange-600 mt-4 w-full">
              <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl w-full flex flex-col items-center">
                <p className="font-semibold text-sm">Escaneie o QR Code</p>
                <p className="text-xs text-orange-700/80 mt-1 mb-3 text-center">Abra o terminal do Backend (porta 3001) para ler o QR com celular.</p>
                <button
                  onClick={handleDisconnectClick}
                  className="text-xs px-4 py-2 bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 rounded-lg transition-colors font-medium mt-2"
                >
                  Cancelar Conexão
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center mt-4 w-full">
              <p className="text-zinc-500 text-sm mb-4">Sessão desconectada ou expirada.</p>
              <button
                onClick={handleConnectClick}
                className="w-full bg-zinc-900 dark:bg-white text-white dark:text-black py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <LogIn className="w-4 h-4" />
                Iniciar Conexão
              </button>
            </div>
          )}
        </div>

        {/* Card Extrator */}
        <Link href="/extractor" className="group bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col items-center text-center gap-4 hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:shadow-md relative overflow-hidden">
          <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Map className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Extrator Maps</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Varra o Google Maps e extraia contatos direto para Planilha de Excel.</p>
          </div>
          <span className="mt-auto pt-4 text-sm font-semibold text-blue-600 dark:text-blue-500">Acessar Extrator &rarr;</span>
        </Link>

        {/* Card Disparos */}
        <Link href="/sender" className="group bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col items-center text-center gap-4 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all hover:shadow-md relative overflow-hidden">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Send className="w-8 h-8 text-emerald-600 dark:text-emerald-400 ml-1" />
          </div>
          <div>
            <h2 className="text-xl font-bold dark:text-white mb-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Disparador</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Faça upload da planilha e mande WhatsApp de prospecção sem limites.</p>
          </div>
          <span className="mt-auto pt-4 text-sm font-semibold text-emerald-600 dark:text-emerald-500">Acessar Disparos &rarr;</span>
        </Link>

      </div>
    </div>
  );
}

