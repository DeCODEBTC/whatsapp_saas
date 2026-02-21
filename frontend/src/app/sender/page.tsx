'use client';

import { useState, useRef } from 'react';
import { Upload, Send, FileSpreadsheet, AlertCircle, CheckCircle2, ChevronRight, XIcon } from 'lucide-react';
import * as XLSX from 'xlsx';

type Contact = {
    nome: string;
    telefone: string;
    status: 'pending' | 'sending' | 'success' | 'error';
    errorMsg?: string;
};

export default function SenderPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [messageTemplate, setMessageTemplate] = useState('Olá {nome}, tudo bem?');
    const [isSending, setIsSending] = useState(false);
    const [globalError, setGlobalError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cancelRef = useRef(false);

    const handleInterrupt = () => {
        cancelRef.current = true;
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                // Normaliza as colunas (procurando 'Nome' e 'Telefone' ignorando case)
                const parsedContacts: Contact[] = data.map((row: any) => {
                    const keys = Object.keys(row);
                    const nameKey = keys.find(k => k.toLowerCase().includes('nome'));
                    const phoneKey = keys.find(k => k.toLowerCase().includes('telefon') || k.toLowerCase().includes('celular') || k.toLowerCase().includes('phone'));

                    return {
                        nome: nameKey ? row[nameKey] : 'Cliente',
                        telefone: phoneKey ? String(row[phoneKey]) : '',
                        status: 'pending' as const
                    };
                }).filter((c: Contact) => c.telefone); // Filtra quem não tem telefone

                setContacts(parsedContacts);
                setGlobalError('');
            } catch (err) {
                setGlobalError('Erro ao ler a planilha. Certifique-se de que é um Excel ou CSV válido com colunas de Nome e Telefone.');
            }
        };
        reader.readAsBinaryString(file);
    };

    const clearContacts = () => {
        setContacts([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (!file) return;

        // Reaproveita a mesma logica do handleFileUpload montando um evento fake compatível
        const fakeEvent = {
            target: { files: [file] }
        } as unknown as React.ChangeEvent<HTMLInputElement>;

        handleFileUpload(fakeEvent);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); // Impede que o browser abra o arquivo
    };

    const startSending = async () => {
        if (contacts.length === 0) return;
        if (!messageTemplate) {
            setGlobalError('Por favor, digite uma mensagem.');
            return;
        }

        setIsSending(true);
        cancelRef.current = false;
        setGlobalError('');

        // Dispara um a um para controlar o status na tela e não sobrecarregar
        let newContacts = [...contacts];

        for (let i = 0; i < newContacts.length; i++) {
            if (cancelRef.current) {
                setGlobalError('Disparo interrompido pelo usuário.');
                break;
            }
            if (newContacts[i].status === 'success') continue;

            newContacts[i].status = 'sending';
            setContacts([...newContacts]);

            // Formata a mensagem com as variaveis
            let finalMessage = messageTemplate;
            finalMessage = finalMessage.replace(/{nome}/gi, newContacts[i].nome || 'Cliente');

            try {
                const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

                // Chama a API do backend
                const res = await fetch(`${API_URL}/api/whatsapp/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: newContacts[i].telefone,
                        message: finalMessage
                    })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Erro desconhecido');
                }

                newContacts[i].status = 'success';

                // Pausa de 15 segundos para evitar banimento (rate limit do WhatsApp)
                // Usando loop de 1 seg para que o cancelamento seja instantâneo
                for (let sec = 0; sec < 15; sec++) {
                    if (cancelRef.current) break;
                    await new Promise(r => setTimeout(r, 1000));
                }

            } catch (error: any) {
                newContacts[i].status = 'error';
                newContacts[i].errorMsg = error.message;
            }

            setContacts([...newContacts]);
        }

        setIsSending(false);
    };

    const successCount = contacts.filter(c => c.status === 'success').length;
    const errorCount = contacts.filter(c => c.status === 'error').length;
    const progressPerc = contacts.length > 0 ? ((successCount + errorCount) / contacts.length) * 100 : 0;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 sm:p-12 font-sans">
            <div className="max-w-5xl mx-auto flex flex-col gap-6">

                <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                    <Send className="w-8 h-8 text-emerald-500" />
                    Disparador de Campanhas
                </h1>
                <p className="text-zinc-500 dark:text-zinc-400">
                    Faça upload da sua planilha do Excel com <b>Nome</b> e <b>Telefone</b> e inicie os disparos. Os disparos acontecerão diretamente da sua máquina.
                </p>

                {globalError && (
                    <div className="bg-red-50 text-red-600 border border-red-200 p-4 rounded-xl flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{globalError}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

                    {/* Setup / Configuração */}
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col gap-6">

                        {/* Upload */}
                        <div className="flex flex-col gap-3">
                            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Planilha de Contatos</label>

                            {contacts.length === 0 ? (
                                <div
                                    className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-8 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex flex-col items-center justify-center cursor-pointer relative"
                                    onClick={() => fileInputRef.current?.click()}
                                    onDrop={handleDrop}
                                    onDragOver={handleDragOver}
                                >
                                    <FileSpreadsheet className="w-10 h-10 text-zinc-400 mb-3" />
                                    <span className="text-zinc-600 dark:text-zinc-300 font-medium">Clique para selecionar ou arraste o .xlsx</span>
                                    <span className="text-xs text-zinc-500 mt-1">Excel exportado do Google Maps também funciona</span>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        accept=".xlsx, .xls, .csv"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                    />
                                </div>
                            ) : (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-lg"><FileSpreadsheet className="w-5 h-5 text-blue-700 dark:text-blue-300" /></div>
                                        <div>
                                            <p className="font-semibold text-blue-900 dark:text-blue-100">{contacts.length} contatos carregados</p>
                                            <p className="text-xs text-blue-700 dark:text-blue-400">Pronto para envio</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={clearContacts}
                                        disabled={isSending}
                                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-full text-blue-700 dark:text-blue-300 transition-colors disabled:opacity-50"
                                    >
                                        <XIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Mensagem */}
                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-end">
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Template da Mensagem</label>
                                <span className="text-xs text-zinc-500">Variáveis: {'{nome}'}</span>
                            </div>
                            <textarea
                                disabled={isSending}
                                rows={6}
                                value={messageTemplate}
                                onChange={e => setMessageTemplate(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
                                placeholder="Digite sua mensagem de prospecção..."
                            />
                        </div>

                        {/* Botões de disparo e parada */}
                        <div className="flex gap-4 mt-2">
                            <button
                                onClick={startSending}
                                disabled={isSending || contacts.length === 0}
                                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex-1 py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-colors text-lg shadow-sm"
                            >
                                <Send className="w-5 h-5" />
                                {isSending ? 'Disparando...' : 'Iniciar Disparo'}
                            </button>

                            {isSending && (
                                <button
                                    onClick={handleInterrupt}
                                    className="bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 px-6 py-4 rounded-xl font-bold flex justify-center items-center transition-colors shadow-sm"
                                >
                                    Parar
                                </button>
                            )}
                        </div>
                    </div>


                    {/* Lista / Progresso */}
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col h-full">
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-1">Status do Envio</h2>
                        <div className="flex items-center gap-4 mb-6 mt-2">
                            <div className="flex-1 h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-300"
                                    style={{ width: `${progressPerc}%` }}
                                />
                            </div>
                            <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                                {successCount + errorCount} / {contacts.length}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 max-h-[500px]">
                            {contacts.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-zinc-400 pb-10">
                                    <CheckCircle2 className="w-12 h-12 mb-3 opacity-20" />
                                    <p>Nenhuma planilha carregada</p>
                                </div>
                            ) : (
                                <ul className="flex flex-col gap-2">
                                    {contacts.map((c, i) => (
                                        <li key={i} className={`p-3 rounded-lg border flex items-center justify-between text-sm transition-colors ${c.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50' :
                                            c.status === 'error' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50' :
                                                c.status === 'sending' ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50' :
                                                    'bg-transparent border-zinc-100 dark:border-zinc-800'
                                            }`}>
                                            <div className="flex flex-col truncate pr-4">
                                                <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">{c.nome}</span>
                                                <span className="text-zinc-500 text-xs">{c.telefone}</span>
                                            </div>

                                            <div className="flex py-1 px-2.5 rounded-full text-xs font-bold shrink-0">
                                                {c.status === 'pending' && <span className="text-zinc-500">Aguardando</span>}
                                                {c.status === 'sending' && <span className="text-blue-600 dark:text-blue-400 flex"><ChevronRight className="w-4 h-4 animate-pulse mr-1" />Enviando</span>}
                                                {c.status === 'success' && <span className="text-emerald-600 dark:text-emerald-400 flex"><CheckCircle2 className="w-4 h-4 mr-1" />Sucesso</span>}
                                                {c.status === 'error' && (
                                                    <span className="text-red-600 dark:text-red-400 flex flex-col items-end">
                                                        <span className="flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> Erro</span>
                                                        <span className="text-[10px] font-normal opacity-80 mt-1 max-w-[120px] truncate" title={c.errorMsg}>{c.errorMsg}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
