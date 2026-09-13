/**
 * PairsList — pares casados pelo matchEngine
 * GroupsList — composições N:1 (vários sistema → 1 banco)
 * OnlyBankList — lançamentos só no banco
 * OnlySysList — lançamentos só no sistema
 */
import { useState } from 'react';
import type { MatchPair, MatchGroup, OFXTransaction, SystemItem } from '@themisflow/core';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

// ── Pares casados ────────────────────────────────────────────────
export function PairsList({ pairs }: { pairs: MatchPair[] }) {
  if (!pairs.length) return null;

  return (
    <div className="transactions-section" style={{ marginBottom: 16 }}>
      <div className="transactions-header">
        <span className="transactions-title" style={{ color: 'var(--teal)' }}>
          ✓ Pares casados
        </span>
        <span className="tab-badge tab-badge-teal">{pairs.length}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="trn-table">
          <thead>
            <tr>
              <th>Data Sist.</th>
              <th>Descrição (sistema)</th>
              <th className="right">Valor</th>
              <th>Data Banco</th>
              <th>Memo (banco)</th>
              <th style={{ textAlign: 'center' }}>Δ dias</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => (
              <tr key={i} id={`pair-${p.sys.sid}-${p.ofx.fitid}`}>
                <td className="date-cell mono-cell">{fmtDate(p.sys.date)}</td>
                <td className="memo-cell">{p.sys.desc}</td>
                <td className="mono-cell" style={{
                  textAlign: 'right',
                  color: p.sys.value >= 0 ? 'var(--teal)' : 'var(--red)',
                  fontSize: '0.75rem',
                }}>
                  {fmtBRL(p.sys.value)}
                </td>
                <td className="date-cell mono-cell">{fmtDate(p.ofx.date)}</td>
                <td className="memo-cell">
                  {[p.ofx.memo, p.ofx.name].filter(Boolean).join(' — ') || p.ofx.fitid}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                  {p.dd === 0
                    ? <span style={{ color: 'var(--teal)' }}>✓</span>
                    : <span style={{ color: 'var(--gold)' }}>+{p.dd}d</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Composições N:1 ─────────────────────────────────────────────
function GroupRow({ group }: { group: MatchGroup }) {
  const [open, setOpen] = useState(true);
  const bankLabel = [group.ofx.memo, group.ofx.name].filter(Boolean).join(' — ') || group.ofx.fitid;

  return (
    <div style={{ marginBottom: 10, border: '1px solid var(--teal)', borderRadius: 6, overflow: 'hidden' }}>
      {/* Cabeçalho — linha do banco */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          background: 'var(--teal-bg)', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '0.7rem', color: 'var(--teal)', opacity: 0.7 }}>{open ? '▼' : '▶'}</span>
        <span className="date-cell mono-cell" style={{ fontSize: '0.75rem', color: 'var(--teal)' }}>
          {fmtDate(group.ofx.date)}
        </span>
        <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--teal)', fontWeight: 600 }}>
          {bankLabel}
        </span>
        <span className="mono-cell" style={{ fontSize: '0.75rem', color: 'var(--teal)', fontWeight: 700 }}>
          {fmtBRL(group.ofx.amount)}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--muted)', paddingLeft: 8 }}>
          {group.sys.length} itens
        </span>
      </div>

      {/* Itens do sistema (collapsible) */}
      {open && (
        <table className="trn-table" style={{ margin: 0 }}>
          <tbody>
            {group.sys.map((s, i) => {
              const dd = Math.abs(Math.round(
                (new Date(group.ofx.date + 'T12:00:00').getTime() -
                 new Date(s.date + 'T12:00:00').getTime()) / 86_400_000,
              ));
              return (
                <tr key={s.sid} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td className="date-cell mono-cell" style={{ width: 48 }}>{fmtDate(s.date)}</td>
                  <td className="memo-cell" style={{ color: 'var(--gold)' }}>{s.desc || '—'}</td>
                  <td className="mono-cell" style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--gold)' }}>
                    {fmtBRL(s.value)}
                  </td>
                  <td style={{ width: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                    {dd === 0
                      ? <span style={{ color: 'var(--teal)' }}>✓</span>
                      : <span style={{ color: 'var(--gold)' }}>Δ{dd}d</span>
                    }
                  </td>
                </tr>
              );
            })}
            {/* Linha de soma */}
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td colSpan={2} style={{ padding: '4px 12px', fontSize: '0.7rem', color: 'var(--muted)', textAlign: 'right' }}>
                Soma sistema
              </td>
              <td className="mono-cell" style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: 'var(--teal)', paddingRight: 12 }}>
                {fmtBRL(group.sumSys)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export function GroupsList({ groups }: { groups: MatchGroup[] }) {
  if (!groups.length) return null;

  return (
    <div className="transactions-section" style={{ marginBottom: 16 }}>
      <div className="transactions-header">
        <span className="transactions-title" style={{ color: 'var(--teal)' }}>
          ⊕ Composições N:1
        </span>
        <span className="tab-badge tab-badge-teal">{groups.length}</span>
      </div>
      <div style={{ padding: '8px 16px', fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic' }}>
        Vários lançamentos sistema compõem um único crédito no banco
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        {groups.map((g, i) => <GroupRow key={g.ofx.fitid || i} group={g} />)}
      </div>
    </div>
  );
}

// ── Só no banco ──────────────────────────────────────────────────
export function OnlyBankList({ items }: { items: OFXTransaction[] }) {
  if (!items.length) return (
    <div style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Nenhum lançamento só no banco
    </div>
  );

  return (
    <div className="transactions-section" style={{ marginBottom: 16 }}>
      <div className="transactions-header">
        <span className="transactions-title" style={{ color: 'var(--teal)' }}>
          Só no banco
        </span>
        <span className="tab-badge" style={{ background: 'var(--teal-bg)', color: 'var(--teal)' }}>
          {items.length}
        </span>
      </div>
      <div style={{ padding: '8px 16px', fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic' }}>
        Falta lançar no sistema
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="trn-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Memo / Nome</th>
              <th className="right">Débito</th>
              <th className="right">Crédito</th>
              <th style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>FITID</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t, i) => (
              <tr key={t.fitid || i} id={`only-bank-${t.fitid}`}>
                <td className="date-cell mono-cell">{fmtDate(t.date)}</td>
                <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{t.type}</td>
                <td className="memo-cell">
                  {[t.memo, t.name].filter(Boolean).join(' — ') || '—'}
                </td>
                <td className="deb-cell">{t.amount < 0 ? fmtBRL(Math.abs(t.amount)) : ''}</td>
                <td className="cred-cell">{t.amount >= 0 ? fmtBRL(t.amount) : ''}</td>
                <td className="mono-cell" style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{t.fitid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Só no sistema ────────────────────────────────────────────────
export function OnlySysList({ items }: { items: SystemItem[] }) {
  if (!items.length) return (
    <div style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Nenhum lançamento só no sistema
    </div>
  );

  return (
    <div className="transactions-section" style={{ marginBottom: 16 }}>
      <div className="transactions-header">
        <span className="transactions-title" style={{ color: 'var(--gold)' }}>
          Só no sistema
        </span>
        <span className="tab-badge tab-badge-gold">{items.length}</span>
      </div>
      <div style={{ padding: '8px 16px', fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic' }}>
        Erro de digitação, duplicidade ou não compensado
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="trn-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Observação</th>
              <th className="right">Débito</th>
              <th className="right">Crédito</th>
              <th className="right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {items.map(s => (
              <tr key={s.sid} id={`only-sys-${s.sid}`}>
                <td className="date-cell mono-cell">{fmtDate(s.date)}</td>
                <td className="memo-cell">{s.desc}</td>
                <td className="mono-cell" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {s.obs || '—'}
                </td>
                <td className="deb-cell">{s.deb > 0 ? fmtBRL(s.deb) : ''}</td>
                <td className="cred-cell">{s.cred > 0 ? fmtBRL(s.cred) : ''}</td>
                <td className="mono-cell" style={{
                  textAlign: 'right',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: s.value < 0 ? 'var(--red)' : 'var(--teal)',
                }}>
                  {fmtBRL(s.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
