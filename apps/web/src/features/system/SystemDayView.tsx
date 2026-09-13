/**
 * SystemDayView — exibe o extrato do sistema dia a dia
 * Layout que o operador já conhece: cabeçalho de dia com saldos + lista de lançamentos.
 * R10–R13 — mapeamento por nome de coluna; integridade sinalizada.
 */
import { useState } from 'react';
import type { SystemStatement, SystemDay, SystemItem } from '@themisflow/core';
import { dayIntegrity } from '@themisflow/core';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// ── Cabeçalho de dia ─────────────────────────────────────────────
function DayHeader({ day, expanded, onToggle }: {
  day: SystemDay;
  expanded: boolean;
  onToggle: () => void;
}) {
  const integ = dayIntegrity(day);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--panel-alt)',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={onToggle}
      role="button"
      aria-expanded={expanded}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onToggle()}
      id={`sys-day-${day.date}`}
    >
      {/* Data + banco */}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600, minWidth: 110 }}>
        {fmtDate(day.date)}
      </span>
      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {day.bank}
      </span>

      {/* Saldos */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted)' }}>
          Ant: <span style={{ color: 'var(--text-soft)' }}>{fmtBRL(day.saldoAnt)}</span>
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--red)' }}>
          ↓ {fmtBRL(day.totDeb)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--teal)' }}>
          ↑ {fmtBRL(day.totCred)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600 }}>
          {fmtBRL(day.saldoDia)}
        </span>

        {/* Alerta R13 — integridade */}
        {!integ.ok && (
          <span
            title={`Export parcial: soma dos itens (Déb: ${fmtBRL(integ.sumDeb)}, Créd: ${fmtBRL(integ.sumCred)}) ≠ totais do cabeçalho`}
            style={{ color: 'var(--gold)', fontSize: '0.7rem', cursor: 'help' }}
          >
            ⚠ parcial
          </span>
        )}

        {/* Contagem + expand */}
        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          {day.items.length} lanç.
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}

// ── Linha de lançamento ──────────────────────────────────────────
function ItemRow({ item }: { item: SystemItem }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <td className="mono-cell" style={{ paddingLeft: 32, fontSize: '0.75rem', color: 'var(--text-soft)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.desc}
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted)', padding: '6px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.obs || '—'}
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', padding: '6px 12px', whiteSpace: 'nowrap' }}>
        {item.doc || '—'}
      </td>
      <td className="deb-cell">
        {item.deb > 0 ? fmtBRL(item.deb) : ''}
      </td>
      <td className="cred-cell">
        {item.cred > 0 ? fmtBRL(item.cred) : ''}
      </td>
      <td style={{ padding: '6px 12px', textAlign: 'center' }}>
        {item.sysConc && (
          <span style={{ fontSize: '0.65rem', color: 'var(--teal)', fontWeight: 600 }}>✓</span>
        )}
      </td>
    </tr>
  );
}

// ── SystemDayView ─────────────────────────────────────────────────
export function SystemDayView({ statement }: { statement: SystemStatement }) {
  const days = [...statement.days.values()];
  const [expanded, setExpanded] = useState<Set<string>>(new Set(days.slice(0, 3).map(d => d.date)));

  const toggle = (date: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const expandAll = () => setExpanded(new Set(days.map(d => d.date)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div>
      {/* Ações */}
      <div className="actions-row">
        <button className="btn btn-ghost" onClick={expandAll} id="btn-expand-all">
          Expandir todos
        </button>
        <button className="btn btn-ghost" onClick={collapseAll} id="btn-collapse-all">
          Recolher todos
        </button>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
          {days.length} dias · {statement.items.length} lançamentos
        </span>
      </div>

      {/* Lista de dias */}
      <div
        className="transactions-section fade-in-up"
        style={{ overflow: 'hidden' }}
      >
        {days.map(day => (
          <div key={day.date}>
            <DayHeader
              day={day}
              expanded={expanded.has(day.date)}
              onToggle={() => toggle(day.date)}
            />

            {expanded.has(day.date) && (
              <div style={{ overflowX: 'auto' }}>
                <table className="trn-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 32 }}>Descrição</th>
                      <th>Observação</th>
                      <th>CPF/CNPJ</th>
                      <th className="right">Débito</th>
                      <th className="right">Crédito</th>
                      <th style={{ textAlign: 'center' }}>Conc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.items.map(item => (
                      <ItemRow key={item.sid} item={item} />
                    ))}
                    {day.items.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                          Nenhum lançamento neste dia
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
