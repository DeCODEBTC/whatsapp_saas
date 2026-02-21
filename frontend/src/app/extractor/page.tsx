'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, Map, Play, Loader2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ExtractorPage() {
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState('idle'); // idle, running, complete, error
    const [progressLabel, setProgressLabel] = useState('');
    const [count, setCount] = useState(0);
    const [results, setResults] = useState([]);
    const [errorMsg, setErrorMsg] = useState('');

    const eventSourceRef = useRef<EventSource | null>(null);

    const startExtraction = () => {
        if (!url || !url.includes('google.com/maps')) {
            setErrorMsg('Por favor, insira um link válido do Google Maps');
            return;
        }

        setErrorMsg('');
        setStatus('running');
        setProgressLabel('Iniciando conexão com servidor...');
        setCount(0);
        setResults([]);

        // Limpa conexão anterior se houver
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        // Backend URL
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const sseUrl = `${API_URL}/api/extract?url=${encodeURIComponent(url)}`;
        const es = new EventSource(sseUrl);
        eventSourceRef.current = es;

        es.addEventListener('progress', (e) => {
            const data = JSON.parse(e.data);
            setProgressLabel(data.message);
            setCount(data.count);
        });

        es.addEventListener('result', (e) => {
            const data = JSON.parse(e.data);
            setResults(data);
            setStatus('complete');
            setProgressLabel('Extração Concluída!');
            setCount(data.length);
            es.close();
        });

        es.addEventListener('error', (e: Event) => {
            const errorEvent = e as MessageEvent;
            let esError = 'Erro na conexão ou no scraping.';
            try {
                if (errorEvent.data) {
                    const data = JSON.parse(errorEvent.data);
                    esError = data.error || esError;
                }
            } catch (err) { }

            setErrorMsg(esError);
            setStatus('error');
            es.close();
        });
    };

    // Cleanup caso o componente seja desmontado
    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    const downloadExcel = () => {
        if (results.length === 0) return;

        const worksheet = XLSX.utils.json_to_sheet(results);
        // Ajuste largura das colunas
        worksheet['!cols'] = [{ wch: 40 }, { wch: 20 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Contatos");

        XLSX.writeFile(workbook, "Contatos_GoogleMaps.xlsx");
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 sm:p-12 font-sans">
            <div className="max-w-3xl mx-auto flex flex-col gap-6">

                <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                    <Map className="w-8 h-8 text-blue-500" />
                    Extrator Google Maps
                </h1>
                <p className="text-zinc-500 dark:text-zinc-400">
                    Cole o link de uma busca do Google Maps abaixo. O sistema irá rolar a página até o fim para coletar todos os estabelecimentos com telefone.
                </p>

                {errorMsg && (
                    <div className="bg-red-50 text-red-600 border border-red-200 p-4 rounded-xl flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4">
                    <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Link do Google Maps</label>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            disabled={status === 'running'}
                            placeholder="https://www.google.com/maps/search/pizzarias..."
                            className="flex-1 px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                        <button
                            onClick={startExtraction}
                            disabled={status === 'running' || !url}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
                        >
                            {status === 'running' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                            Extrair
                        </button>
                    </div>

                    {/* Progress Area */}
                    {(status === 'running' || status === 'complete') && (
                        <div className="mt-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-blue-800 dark:text-blue-300 flex items-center gap-2">
                                    {status === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {progressLabel}
                                </span>
                                <span className="text-sm font-bold text-blue-900 dark:text-blue-200 bg-blue-100 dark:bg-blue-900 px-3 py-1 rounded-full">
                                    {count} encontrados
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Results Area */}
                {status === 'complete' && results.length > 0 && (
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold dark:text-white">Resultado da Extração</h2>
                            <button
                                onClick={downloadExcel}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
                            >
                                <Download className="w-4 h-4" />
                                Baixar em Excel (.xlsx)
                            </button>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 mt-2 max-h-96">
                            <table className="w-full text-left text-sm text-zinc-600 dark:text-zinc-400">
                                <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-800 font-semibold sticky top-0">
                                    <tr>
                                        <th className="px-6 py-4">Nome</th>
                                        <th className="px-6 py-4 text-right">Telefone</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                                    {results.map((r: any, i) => (
                                        <tr key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                                            <td className="px-6 py-3 font-medium text-zinc-900 dark:text-zinc-300">{r.name}</td>
                                            <td className="px-6 py-3 text-right">{r.phone || <span className="text-zinc-400 italic">Nenhum</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
