/**
 * XLSDropzone — drag & drop ou clique para importar extrato do sistema (.xls / .xlsx)
 * R13 — falha clara se coluna faltante; nunca silencia.
 * R14 — aceita .xls (BIFF8) e .xlsx via SheetJS.
 */
import { useRef, useState, useCallback } from 'react';
import { useSystemStore } from '../../stores/systemStore';

export function XLSDropzone() {
  const importXLS = useSystemStore(s => s.importXLS);
  const importing = useSystemStore(s => s.importing);
  const importError = useSystemStore(s => s.importError);
  const filename = useSystemStore(s => s.filename);
  const clear = useSystemStore(s => s.clear);

  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    await importXLS(file);
  }, [importXLS]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  return (
    <div>
      <div
        id="xls-dropzone"
        className={`dropzone dropzone-system${over ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Área para importar extrato do sistema XLS — clique ou arraste"
        onClick={() => !importing && inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        style={{ cursor: importing ? 'wait' : 'pointer' }}
      >
        {importing ? (
          <>
            <svg className="dropzone-icon loading-pulse" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="dropzone-title">Processando planilha...</span>
          </>
        ) : (
          <>
            <svg className="dropzone-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span className="dropzone-title">
              {filename
                ? `✓ ${filename} — clique para substituir`
                : 'Importar extrato do sistema (.xls ou .xlsx)'}
            </span>
            <span className="dropzone-sub">
              Relatório "Extrato de Conciliação Bancária" exportado do ERP<br />
              Arraste o arquivo aqui ou clique para selecionar
            </span>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx,.XLS,.XLSX"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
          id="xls-file-input"
        />
      </div>

      {importError && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <div>
            <strong>Erro ao importar:</strong> {importError}
          </div>
          <button
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}
            onClick={clear}
            aria-label="Fechar erro"
          >✕</button>
        </div>
      )}
    </div>
  );
}
