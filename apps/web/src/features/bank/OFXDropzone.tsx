/**
 * OFXDropzone — drag & drop ou clique para importar extrato OFX
 */
import { useRef, useState, useCallback } from 'react';
import { useBankStore } from '../../stores/bankStore';

export function OFXDropzone() {
  const importOFX = useBankStore(s => s.importOFX);
  const errors = useBankStore(s => s.importErrors);
  const clearErrors = useBankStore(s => s.clearErrors);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      await importOFX(file);
    }
  }, [importOFX]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    void handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div>
      <div
        id="ofx-dropzone"
        className={`dropzone${over ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Área para importar extrato OFX — clique ou arraste"
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <svg className="dropzone-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <polyline points="9,15 12,12 15,15" />
        </svg>
        <span className="dropzone-title">Importar extrato bancário (.ofx)</span>
        <span className="dropzone-sub">
          Arraste o arquivo OFX aqui ou clique para selecionar<br />
          Múltiplos arquivos e contas são suportados
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".ofx,.OFX"
          multiple
          style={{ display: 'none' }}
          onChange={e => void handleFiles(e.target.files)}
          id="ofx-file-input"
        />
      </div>

      {errors.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {errors.map((err, i) => (
            <div key={i} className="alert alert-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {err}
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={clearErrors}>
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
