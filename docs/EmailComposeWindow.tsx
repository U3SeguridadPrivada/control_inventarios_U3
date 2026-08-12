"use client";

// Ventana de redacción de correo (estilo Gmail flotante) con logo + footer de
// marca en el preview y en el HTML final. Extraída y generalizada de
// app/correo/page.tsx del CRM Bionordi: se le quitó el sistema de plantillas
// precargadas (TPLS/vars/leads) — aquí el cuerpo arranca vacío o con
// `initialBodyHtml`, y todo lo demás (logo, colores, textos de marca) se
// pasa por props para poder reutilizarla en cualquier proyecto.
//
// Dependencias: React, lucide-react (iconos), Tailwind CSS (clases).
// Si el proyecto destino no usa Tailwind, hay que traducir las clases a CSS.

import { useRef, useState } from "react";
import {
  Send, X, Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, Link2, Trash2, Minus, Maximize2, Minimize2,
  Undo2, Redo2, Paperclip, AlignLeft, AlignCenter, AlignRight,
  AlignJustify, Palette, Activity, Check, AlertCircle, Mail,
} from "lucide-react";
import { buildEmailHtml, htmlToPlainText, type BrandConfig } from "./buildEmailHtml";

export interface EmailAttachment {
  filename: string;
  /** base64 sin el prefijo "data:...;base64," */
  content: string;
  size: number;
}

export interface SendPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; content: string }[];
}

export interface EmailComposeWindowProps {
  open: boolean;
  onClose: () => void;
  /** Nombre de quien envía (aparece en negrita en el footer del correo). */
  senderName: string;
  /** Config de marca: logo, nombre de empresa, colores, textos de pie. */
  brand: BrandConfig;
  defaultSubject?: string;
  defaultTo?: string;
  initialBodyHtml?: string;
  /** Debe hacer el POST a tu propio backend/API de envío. */
  onSend: (payload: SendPayload) => Promise<{ success: boolean; error?: string }>;
  /** Límites de adjuntos en MB. */
  maxAttachmentMb?: number;
  maxAttachmentsTotalMb?: number;
}

const COLORES_TEXTO = ["#1E293B", "#475569", "#4E60A9", "#38AD64", "#DC2626", "#D97706"];

function ToolBtn({ onClick, title, active = false, className = "", children }: {
  onClick: () => void;
  title: string;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`p-2.5 md:p-1.5 hover:bg-slate-200 rounded transition-colors ${
        active ? "bg-slate-200 text-[#4E60A9]" : "text-slate-600"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function EmailComposeWindow({
  open, onClose, senderName, brand, defaultSubject = "", defaultTo = "",
  initialBodyHtml = "", onSend, maxAttachmentMb = 8, maxAttachmentsTotalMb = 15,
}: EmailComposeWindowProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const [toInput, setToInput] = useState(defaultTo);
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);

  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [showLinkBar, setShowLinkBar] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showColorBar, setShowColorBar] = useState(false);

  const bodyInitialized = useRef(false);
  if (!bodyInitialized.current && editorRef.current) {
    editorRef.current.innerHTML = initialBodyHtml;
    bodyInitialized.current = true;
  }

  if (!open) return null;

  // ── Formato WYSIWYG ─────────────────────────────────────────────────────
  const restaurarSeleccion = () => {
    const sel = window.getSelection();
    if (!sel || !editorRef.current) return;
    const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (range && editorRef.current.contains(range.commonAncestorContainer)) return;
    const saved = savedRangeRef.current;
    if (saved && editorRef.current.contains(saved.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(saved);
    }
  };

  const format = (command: string, value = "") => {
    editorRef.current?.focus();
    restaurarSeleccion();
    document.execCommand(command, false, value);
  };

  const abrirLinkBar = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorRef.current?.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
    setLinkUrl("");
    setShowColorBar(false);
    setShowLinkBar(true);
  };

  const aplicarLink = () => {
    let url = linkUrl.trim();
    setShowLinkBar(false);
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url)) url = `https://${url}`;
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) {
      const safe = url.replace(/"/g, "%22");
      document.execCommand("insertHTML", false, `<a href="${safe}" target="_blank">${url.replace(/</g, "&lt;")}</a>`);
    } else {
      document.execCommand("createLink", false, url);
    }
  };

  // Pegar como texto plano: el HTML que arrastra Word u otro correo rompe
  // los estilos inline del layout al enviarse.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (text) document.execCommand("insertText", false, text);
  };

  // ── Adjuntos ────────────────────────────────────────────────────────────
  const agregarAdjuntos = async (files: File[]) => {
    let total = attachments.reduce((s, a) => s + a.size, 0);
    const nuevos: EmailAttachment[] = [];
    for (const f of files) {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("lectura fallida"));
        r.readAsDataURL(f);
      }).catch(() => "");
      if (!b64) { alert(`No se pudo leer "${f.name}".`); continue; }
      // Nota: si adjuntas fotos de cámara, comprímelas antes (p. ej. con
      // browser-image-compression o un canvas resize) — un JPEG de 8-12MB
      // sin comprimir puede exceder límites de tamaño de payload/API.
      if (f.size > maxAttachmentMb * 1024 * 1024) {
        alert(`"${f.name}" pesa más de ${maxAttachmentMb} MB y no se adjuntó.`);
        continue;
      }
      if (total + f.size > maxAttachmentsTotalMb * 1024 * 1024) {
        alert(`Los adjuntos superarían ${maxAttachmentsTotalMb} MB en total; "${f.name}" no se adjuntó.`);
        continue;
      }
      total += f.size;
      nuevos.push({ filename: f.name, content: b64, size: f.size });
    }
    if (nuevos.length > 0) setAttachments(p => [...p, ...nuevos]);
  };

  const fmtSize = (n: number) =>
    n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

  // ── Envío ───────────────────────────────────────────────────────────────
  const enviar = async () => {
    if (!toInput.trim() || status === "sending") return;
    setStatus("sending"); setMsg("");

    const bodyHtml = editorRef.current?.innerHTML || "";
    const html = buildEmailHtml(bodyHtml, senderName, brand);
    const text = htmlToPlainText(bodyHtml);

    try {
      const res = await onSend({
        to: toInput.trim(),
        cc: showCc ? ccInput.trim() : undefined,
        bcc: showBcc ? bccInput.trim() : undefined,
        subject,
        html,
        text,
        attachments: attachments.map(a => ({ filename: a.filename, content: a.content })),
      });
      if (res.success) {
        setStatus("ok"); setMsg(`Enviado a ${toInput}`);
        setTimeout(() => { setStatus("idle"); onClose(); }, 1200);
      } else {
        setStatus("error"); setMsg(res.error || "No se pudo enviar el correo.");
      }
    } catch {
      setStatus("error"); setMsg("Error de red al enviar.");
    }
  };

  const cerrar = () => {
    const hayTrabajo = status !== "ok" && (toInput.trim() !== "" || attachments.length > 0);
    if (hayTrabajo && !window.confirm("¿Descartar este borrador?")) return;
    onClose();
  };

  return (
    <>
      {isMaximized && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[69]" onClick={() => setIsMaximized(false)} />
      )}

      <div
        className={`fixed z-[70] transition-all duration-300 ${
          isMaximized
            ? "inset-0 md:inset-10 flex flex-col bg-white border border-[#E8EFF8] rounded-none md:rounded-2xl shadow-2xl overflow-hidden"
            : isMinimized
              ? "bottom-0 right-4 md:right-8 w-[320px] h-[40px] bg-[#0C1630] border border-[#E8EFF8] rounded-t-xl shadow-xl overflow-hidden"
              : "inset-0 md:inset-auto md:bottom-0 md:right-8 w-full md:w-[600px] md:h-full md:max-h-[580px] bg-white border border-[#E8EFF8] rounded-none md:rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        }`}
      >
        {/* Header Bar */}
        <div
          onClick={() => { if (isMinimized) setIsMinimized(false); }}
          className={`bg-[#0C1630] text-white px-4 py-2.5 flex items-center justify-between shrink-0 select-none ${isMinimized ? "cursor-pointer hover:bg-[#152347]" : "cursor-default"}`}
        >
          <span className="text-[13px] font-bold truncate flex items-center gap-2">
            <Mail size={14} className="text-[#38AD64]" />
            Mensaje nuevo
          </span>
          <div className="flex items-center gap-2 text-slate-300" onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? "Restaurar" : "Minimizar"} className="p-1 hover:bg-white/10 hover:text-white rounded transition-colors">
              <Minus size={14} />
            </button>
            <button onClick={() => setIsMaximized(!isMaximized)} title={isMaximized ? "Restaurar" : "Pantalla completa"} className="hidden md:block p-1 hover:bg-white/10 hover:text-white rounded transition-colors">
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={cerrar} title="Cerrar y descartar" className="p-1 hover:bg-red-500 hover:text-white rounded transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className={`flex-1 flex-col min-h-0 bg-white ${isMinimized ? "hidden" : "flex"}`}>
          {/* Para / Cc / Cco / Asunto */}
          <div className="bg-white border-b border-[#E8EFF8] px-4 py-2 flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center gap-2 text-[12.5px] border-b border-slate-100 pb-1.5">
              <span className="text-slate-400 font-bold w-12 text-right text-[11px] uppercase tracking-wider">Para:</span>
              <input type="text" value={toInput} onChange={e => setToInput(e.target.value)} placeholder="destinatario@correo.com"
                className="flex-1 bg-transparent border-0 outline-none text-slate-800 placeholder:text-slate-300 font-medium text-[12.5px]" />
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {!showCc && <button onClick={() => setShowCc(true)} className="text-slate-400 hover:text-[#4E60A9] px-1.5 py-0.5 rounded text-[10.5px] font-extrabold">Cc</button>}
                {!showBcc && <button onClick={() => setShowBcc(true)} className="text-slate-400 hover:text-[#4E60A9] px-1.5 py-0.5 rounded text-[10.5px] font-extrabold">Cco</button>}
              </div>
            </div>

            {showCc && (
              <div className="flex items-center gap-2 text-[12.5px] border-b border-slate-100 pb-1.5">
                <span className="text-slate-400 font-bold w-12 text-right text-[11px] uppercase tracking-wider">Cc:</span>
                <input type="text" value={ccInput} onChange={e => setCcInput(e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none text-slate-800 text-[12.5px]" />
                <button onClick={() => { setShowCc(false); setCcInput(""); }} className="text-slate-300 hover:text-red-500"><X size={13} /></button>
              </div>
            )}

            {showBcc && (
              <div className="flex items-center gap-2 text-[12.5px] border-b border-slate-100 pb-1.5">
                <span className="text-slate-400 font-bold w-12 text-right text-[11px] uppercase tracking-wider">Cco:</span>
                <input type="text" value={bccInput} onChange={e => setBccInput(e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none text-slate-800 text-[12.5px]" />
                <button onClick={() => { setShowBcc(false); setBccInput(""); }} className="text-slate-300 hover:text-red-500"><X size={13} /></button>
              </div>
            )}

            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="text-slate-400 font-bold w-12 text-right text-[11px] uppercase tracking-wider">Asunto:</span>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Escribe el asunto"
                className="flex-1 bg-transparent border-0 outline-none text-slate-800 font-semibold text-[13px]" />
            </div>
          </div>

          {/* Toolbar */}
          <div className="px-3 md:px-4 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0 flex items-center gap-1 overflow-x-auto">
            <ToolBtn onClick={() => format("undo")} title="Deshacer"><Undo2 size={14} /></ToolBtn>
            <ToolBtn onClick={() => format("redo")} title="Rehacer"><Redo2 size={14} /></ToolBtn>
            <div className="h-3 w-px bg-slate-200 mx-0.5" />
            <ToolBtn onClick={() => format("bold")} title="Negrita"><Bold size={14} /></ToolBtn>
            <ToolBtn onClick={() => format("italic")} title="Cursiva"><Italic size={14} /></ToolBtn>
            <ToolBtn onClick={() => format("underline")} title="Subrayado"><Underline size={14} /></ToolBtn>
            <ToolBtn onClick={() => format("strikeThrough")} title="Tachado"><Strikethrough size={14} /></ToolBtn>
            <div className="h-3 w-px bg-slate-200 mx-0.5" />
            <ToolBtn onClick={() => format("justifyLeft")} title="Alinear izquierda"><AlignLeft size={14} /></ToolBtn>
            <ToolBtn onClick={() => format("justifyCenter")} title="Centrar"><AlignCenter size={14} /></ToolBtn>
            <ToolBtn onClick={() => format("justifyRight")} title="Alinear derecha"><AlignRight size={14} /></ToolBtn>
            <ToolBtn onClick={() => format("justifyFull")} title="Justificar"><AlignJustify size={14} /></ToolBtn>
            <div className="h-3 w-px bg-slate-200 mx-0.5" />
            <ToolBtn onClick={() => format("insertUnorderedList")} title="Lista"><List size={14} /></ToolBtn>
            <ToolBtn onClick={() => format("insertOrderedList")} title="Lista numerada"><ListOrdered size={14} /></ToolBtn>
            <div className="h-3 w-px bg-slate-200 mx-0.5" />
            <ToolBtn onClick={() => { setShowLinkBar(false); setShowColorBar(!showColorBar); }} title="Color de texto" active={showColorBar}><Palette size={14} /></ToolBtn>
            <ToolBtn onClick={abrirLinkBar} title="Insertar enlace" active={showLinkBar}><Link2 size={14} /></ToolBtn>
            <ToolBtn onClick={() => fileInputRef.current?.click()} title="Adjuntar" className="relative">
              <Paperclip size={14} />
              {attachments.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#4E60A9] text-white text-[8px] font-bold flex items-center justify-center">{attachments.length}</span>
              )}
            </ToolBtn>
            <ToolBtn onClick={() => format("removeFormat")} title="Limpiar formato"><Trash2 size={14} className="text-slate-400" /></ToolBtn>
          </div>

          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            agregarAdjuntos(files);
          }} />

          {showLinkBar && (
            <div className="px-4 py-2 border-b border-slate-100 bg-white shrink-0 flex items-center gap-2">
              <Link2 size={14} className="text-slate-400 shrink-0" />
              <input autoFocus type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); aplicarLink(); } if (e.key === "Escape") setShowLinkBar(false); }}
                placeholder="https://ejemplo.com"
                className="flex-1 text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#4E60A9]/40" />
              <button onClick={aplicarLink} className="px-3 py-1.5 rounded-lg bg-[#4E60A9] hover:bg-[#3d4e8a] text-white text-[11px] font-bold">Aplicar</button>
              <button onClick={() => setShowLinkBar(false)}><X size={14} className="text-slate-400" /></button>
            </div>
          )}

          {showColorBar && (
            <div className="px-4 py-2 border-b border-slate-100 bg-white shrink-0 flex items-center gap-2">
              <Palette size={14} className="text-slate-400 shrink-0" />
              {COLORES_TEXTO.map(c => (
                <button key={c} type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { format("foreColor", c); setShowColorBar(false); }}
                  className="w-6 h-6 rounded-full ring-1 ring-slate-200 hover:ring-2 hover:ring-[#4E60A9]/50"
                  style={{ background: c }} />
              ))}
            </div>
          )}

          {/* Ventana WYSIWYG con logo + footer de marca */}
          <div className="flex-1 p-2.5 md:p-4 bg-slate-100 overflow-y-auto flex justify-center">
            <div className="bg-white border border-slate-200 shadow-sm overflow-hidden w-full max-w-[580px] flex flex-col h-fit rounded-lg">

              {/* Logo header */}
              <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-50 bg-white">
                <img src={brand.logoUrl} alt={brand.logoAlt} style={{ height: "30px", width: "auto", display: "block" }} />
              </div>

              {/* contentEditable */}
              <div className="px-4 md:px-6 py-4 md:py-5 bg-white min-h-[220px]">
                <div
                  ref={editorRef}
                  contentEditable
                  onPaste={handlePaste}
                  className="outline-none text-[13px] text-slate-700 leading-relaxed min-h-[200px] break-words"
                  style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
                />
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-[#F8FAFC] border-t border-slate-100">
                <p className="text-[10px] text-slate-400 leading-relaxed" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
                  <strong className="text-slate-500 font-bold">{senderName}</strong> · {brand.companyName}<br />
                  {brand.footerTagline && <>{brand.footerTagline}<br /></>}
                  <span className="text-slate-300 text-[9px]">{brand.unsubscribeNote || "Si no desea recibir estos correos, por favor ignore este mensaje."}</span>
                </p>
              </div>

              {/* Barra de acento inferior */}
              <div className="h-[4px]" style={{ background: `linear-gradient(90deg,${brand.accentFrom || "#4E60A9"},${brand.accentTo || "#38AD64"})` }} />
            </div>
          </div>

          {/* Adjuntos */}
          {attachments.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 bg-white shrink-0 flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto">
              {attachments.map((a, i) => (
                <span key={`${a.filename}-${i}`} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-[#EEF3FC] text-[#4E60A9]">
                  <Paperclip size={11} />
                  <span className="truncate max-w-[180px] text-[10.5px] font-bold">{a.filename}</span>
                  <span className="text-[9.5px] font-semibold opacity-60">{fmtSize(a.size)}</span>
                  <button onClick={() => setAttachments(p => p.filter((_, j) => j !== i))} className="p-1 rounded-full hover:bg-[#4E60A9] hover:text-white"><X size={11} /></button>
                </span>
              ))}
            </div>
          )}

          {/* Enviar */}
          <div className="px-4 py-3 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
            <button
              onClick={enviar}
              disabled={status === "sending" || !toInput.trim()}
              className={`flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-[12px] font-bold transition-all shadow-sm ${
                status === "ok" ? "bg-[#059669] text-white" :
                status === "error" ? "bg-[#DC2626] text-white" :
                status === "sending" ? "bg-[#4E60A9]/70 text-white cursor-not-allowed" :
                "bg-[#4E60A9] hover:bg-[#3d4e8a] text-white disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              {status === "sending" ? <><Activity size={12} className="animate-spin" />Enviando…</> :
               status === "ok" ? <><Check size={12} />Enviado</> :
               status === "error" ? <><AlertCircle size={12} />Error</> :
               <><Send size={12} />Enviar</>}
            </button>
            {msg && <span className={`text-[11px] font-semibold ${status === "error" ? "text-[#DC2626]" : "text-slate-500"}`}>{msg}</span>}
          </div>
        </div>
      </div>
    </>
  );
}
