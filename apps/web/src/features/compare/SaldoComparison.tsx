/**
 * SaldoComparison — confronto de saldos dia a dia (banco × sistema)
 * Mostra: saldo anterior, débitos, créditos e saldo do dia para cada lado.
 * Coluna Δ em teal/gold/red conforme divergência.
 */
import type { DayComputed } from '@themisflow/core';
import type { SystemStatement } from '@themisflow/core';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const delta = (bank: number, sys: number) => {
  const d = Math.round((bank - sys) * 100) / 100;
  return d;
};

type Props = {
  bank: DayComputed;
  system: SystemStatement;
};

type RowData = {
  date: string;
  bankOpen: number; bankDeb: number; bankCred: number; bankClose: number;
  sysAnt: number;  sysDeb: number;  sysCred: number;  sysDia: number;
  deltaOpen: number; deltaDeb: number; deltaCred: number; deltaClose: number;
};

export function SaldoComparison({ bank, system }: Props) {
  // Construir mapa banco por dia
  const bankByDay = new Map(bank.days.map(d => [d.date, d]));

  // Interseção: apenas dias cobertos pelo sistema
  const rows: RowData[] = [...system.days.values()].map(sys => {
    const b = bankByDay.get(sys.date);
    const bankOpen  = b?.open   ?? 0;
    const bankDeb   = b?.deb    ?? 0;
    const bankCred  = b?.cred   ?? 0;
    const bankClose = b?.close  ?? 0;

    return {
      date:       sys.date,
      bankOpen, bankDeb, bankCred, bankClose,
      sysAnt:  sys.saldoAnt,
      sysDeb:  -sys.totDeb,   // totDeb é positivo no sistema; inverte para comparar com banco (negativo)
      sysCred: sys.totCred,
      sysDia:  sys.saldoDia,
      deltaOpen:  delta(bankOpen,  sys.saldoAnt),
      deltaDeb:   delta(Math.abs(bankDeb), sys.totDeb),
      deltaCred:  delta(bankCred, sys.totCred),
      deltaClose: delta(bankClose, sys.saldoDia),
    };
  });

  const DeltaCell = ({ v }: { v: number }) => {
    if (Math.abs(v) < 0.01) return (
      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--teal)' }}>
        ✓
      </td>
    );
    return (
      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: Math.abs(v) > 1 ? 'var(--red)' : 'var(--gold)', fontWeight: 600 }}>
        {v > 0 ? '+' : ''}{fmtBRL(v)}
      </td>
    );
  };

  if (!rows.length) return (
    <div style={{ padding: 16, color: 'var(--muted)', fontSize: '0.8rem', textAlign: 'center' }}>
      Nenhum dia em comum entre banco e sistema.
    </div>
  );

  return (
    <div className="transactions-section" style={{ marginBottom: 20 }}>
      <div className="transactions-header">
        <span className="transactions-title">Confronto de saldos por dia</span>
        <span className="transactions-count">{rows.length} dias</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="trn-table" aria-label="Confronto de saldos banco vs sistema">
          <thead>
            <tr>
              <th rowSpan={2}>Data</th>
              <th colSpan={4} style={{ textAlign: 'center', color: 'var(--teal)', borderBottom: '1px solid var(--border)' }}>
                Banco (OFX)
              </th>
              <th colSpan={4} style={{ textAlign: 'center', color: 'var(--gold)', borderBottom: '1px solid var(--border)' }}>
                Sistema (XLS)
              </th>
              <th colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                Δ Diferença
              </th>
            </tr>
            <tr>
              {/* Banco */}
              <th className="right" style={{ color: 'var(--teal)' }}>Anterior</th>
              <th className="right" style={{ color: 'var(--teal)' }}>Débitos</th>
              <th className="right" style={{ color: 'var(--teal)' }}>Créditos</th>
              <th className="right" style={{ color: 'var(--teal)' }}>Saldo</th>
              {/* Sistema */}
              <th className="right" style={{ color: 'var(--gold)' }}>Anterior</th>
              <th className="right" style={{ color: 'var(--gold)' }}>Débitos</th>
              <th className="right" style={{ color: 'var(--gold)' }}>Créditos</th>
              <th className="right" style={{ color: 'var(--gold)' }}>Saldo</th>
              {/* Delta */}
              <th className="right">Anterior</th>
              <th className="right">Débitos</th>
              <th className="right">Créditos</th>
              <th className="right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.date} style={{
                background: Math.abs(r.deltaClose) > 0.01 ? 'rgba(255,93,108,0.04)' : undefined
              }}>
                <td className="date-cell mono-cell">{fmtDate(r.date)}</td>
                {/* Banco */}
                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--text-soft)', fontSize: '0.72rem' }}>{fmtBRL(r.bankOpen)}</td>
                <td className="deb-cell">{fmtBRL(Math.abs(r.bankDeb))}</td>
                <td className="cred-cell">{fmtBRL(r.bankCred)}</td>
                <td className="saldo-cell">{fmtBRL(r.bankClose)}</td>
                {/* Sistema */}
                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--text-soft)', fontSize: '0.72rem' }}>{fmtBRL(r.sysAnt)}</td>
                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)', fontSize: '0.72rem' }}>{fmtBRL(r.sysDeb < 0 ? -r.sysDeb : r.sysDeb)}</td>
                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)', fontSize: '0.72rem' }}>{fmtBRL(r.sysCred)}</td>
                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)', fontSize: '0.72rem', fontWeight: 600 }}>{fmtBRL(r.sysDia)}</td>
                {/* Delta */}
                <DeltaCell v={r.deltaOpen} />
                <DeltaCell v={r.deltaDeb} />
                <DeltaCell v={r.deltaCred} />
                <DeltaCell v={r.deltaClose} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
