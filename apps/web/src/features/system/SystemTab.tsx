/**
 * SystemTab — Aba Sistema (XLS Extrato de Conciliação Bancária)
 */
import { useEffect } from 'react';
import { useSystemStore } from '../../stores/systemStore';
import { useMatchStore } from '../../stores/matchStore';
import { XLSDropzone } from './XLSDropzone';
import { SystemDayView } from './SystemDayView';

export function SystemTab() {
  const statement = useSystemStore(s => s.statement);
  const runMatch = useMatchStore(s => s.runMatch);

  // Rodar matching automaticamente ao carregar dados do sistema
  useEffect(() => {
    if (statement) runMatch();
  }, [statement, runMatch]);

  return (
    <div>
      <XLSDropzone />

      {statement && (
        <div style={{ marginTop: 24 }} className="fade-in-up">
          <div className="section-header">
            <div>
              <span className="section-title">Extrato do sistema</span>
              <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                {statement.file}
              </div>
            </div>
          </div>
          <SystemDayView statement={statement} />
        </div>
      )}
    </div>
  );
}

