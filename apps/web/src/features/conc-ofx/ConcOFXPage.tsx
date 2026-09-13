import { useState } from 'react';
import { useBankStore } from '../../stores/bankStore';
import { useConcOFXStore } from '../../stores/concOFXStore';
import { PixTab } from './PixTab';
import { CartaoTab } from './CartaoTab';
import { NaoClassificadoTab } from './NaoClassificadoTab';

type Tab = 'pix' | 'cartao' | 'nao-class';

// Mês atual como padrão de período
function periodoDefault() {
  const hoje = new Date();
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return {
    dataInicio: ini.toISOString().slice(0, 10),
    dataFim:    hoje.toISOString().slice(0, 10),
  };
}

export function ConcOFXPage() {
  const accounts    = useBankStore(s => s.accounts);
  const selectedKey = useBankStore(s => s.selectedKey);
  const selectAcc   = useBankStore(s => s.selectAccount);

  const { pixMatches, cartaoMatches, naoClassificados, loading, error, runConciliacao } = useConcOFXStore();

  const [tab,   setTab]  = useState<Tab>('pix');
  const [period, setPeriod] = useState(periodoDefault());
  const [accKey, setAccKey] = useState(selectedKey ?? '');

  const accountList = [...accounts.entries()].map(([key, acc]) => ({
    key,
    label: `${acc.bankId} — ${acc.acctId}`,
  }));

  async function handleConciliar() {
    if (!accKey) return;
    await runConciliacao({ ...period, accountKey: accKey });
  }

  const rodou = pixMatches.length > 0 || cartaoMatches.length > 0 || naoClassificados.length > 0;

  const conciliadosPix    = pixMatches.filter(m => m.status === 'CONCILIADO').length;
  const conciliadosCartao = cartaoMatches.filter(m => m.status === 'CONCILIADO').length;
  const divergencias      = pixMatches.filter(m => m.status !== 'CONCILIADO').length
                          + cartaoMatches.filter(m => m.status === 'DIVERGENTE').length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>
          Conciliação OFX × Adquirente
        </h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '4px 0 0' }}>
          Cruza lançamentos do extrato bancário (PIX e cartão) com os dados do Getnet.
        </p>
      </div>

      {/* Filtro + ação */}
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20,
        display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>Período</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="date"
              value={period.dataInicio}
              onChange={e => setPeriod(s => ({ ...s, dataInicio: e.target.value }))}
              style={{ padding: '7px 10px', background: 'var(--panel-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '0.8rem' }}
            />
            <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>até</span>
            <input
              type="date"
              value={period.dataFim}
              onChange={e => setPeriod(s => ({ ...s, dataFim: e.target.value }))}
              style={{ padding: '7px 10px', background: 'var(--panel-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '0.8rem' }}
            />
          </div>
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>Conta OFX</div>
          {accountList.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--gold)', padding: '7px 0' }}>
              Nenhum extrato OFX importado. Vá em Conciliação Bancária e importe um arquivo .ofx primeiro.
            </div>
          ) : (
            <select
              value={accKey}
              onChange={e => { setAccKey(e.target.value); selectAcc(e.target.value); }}
              style={{ padding: '7px 10px', background: 'var(--panel-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '0.8rem', cursor: 'pointer', minWidth: 220 }}
            >
              <option value="">Selecione a conta…</option>
              {accountList.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          )}
        </div>

        <button
          className="btn btn-primary"
          style={{ flexShrink: 0, padding: '8px 20px' }}
          onClick={() => void handleConciliar()}
          disabled={loading || !accKey || !period.dataInicio || !period.dataFim}
        >
          {loading ? 'Conciliando…' : 'Conciliar'}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Resumo global */}
      {rodou && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--teal)', borderRadius: 'var(--radius-sm)', padding: '10px 18px', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--muted)' }}>PIX conciliado: </span>
            <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{conciliadosPix} / {pixMatches.length}</span>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--gold)', borderRadius: 'var(--radius-sm)', padding: '10px 18px', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--muted)' }}>Cartão conciliado: </span>
            <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{conciliadosCartao} / {cartaoMatches.length}</span>
          </div>
          {naoClassificados.length > 0 && (
            <div style={{ background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--gold) 40%, transparent)', borderRadius: 'var(--radius-sm)', padding: '10px 18px', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--muted)' }}>Não classificados: </span>
              <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{naoClassificados.length}</span>
            </div>
          )}
          {divergencias > 0 && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', padding: '10px 18px', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--muted)' }}>Divergências: </span>
              <span style={{ fontWeight: 700, color: 'var(--red)' }}>{divergencias}</span>
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <nav className="tab-bar" role="tablist" style={{ marginBottom: 0 }}>
        <button
          role="tab"
          aria-selected={tab === 'pix'}
          className={`tab-btn${tab === 'pix' ? ' active-bank' : ''}`}
          onClick={() => setTab('pix')}
        >
          PIX
          {pixMatches.length > 0 && (
            <span className={`tab-badge ${pixMatches.some(m => m.status !== 'CONCILIADO') ? 'tab-badge-warn' : 'tab-badge-ok'}`}>
              {pixMatches.length}
            </span>
          )}
        </button>

        <button
          role="tab"
          aria-selected={tab === 'cartao'}
          className={`tab-btn${tab === 'cartao' ? ' active-system' : ''}`}
          onClick={() => setTab('cartao')}
        >
          Cartões
          {cartaoMatches.length > 0 && (
            <span className={`tab-badge ${cartaoMatches.some(m => m.status === 'DIVERGENTE') ? 'tab-badge-warn' : 'tab-badge-ok'}`}>
              {cartaoMatches.length}
            </span>
          )}
        </button>

        <button
          role="tab"
          aria-selected={tab === 'nao-class'}
          className={`tab-btn${tab === 'nao-class' ? ' active-compare' : ''}`}
          onClick={() => setTab('nao-class')}
        >
          Não Classificados
          {naoClassificados.length > 0 && (
            <span className="tab-badge tab-badge-warn">{naoClassificados.length}</span>
          )}
        </button>
      </nav>

      {/* Conteúdo */}
      <div className="tab-content" style={{ marginTop: 0 }}>
        {tab === 'pix'      && <PixTab      matches={pixMatches} />}
        {tab === 'cartao'   && <CartaoTab   matches={cartaoMatches} />}
        {tab === 'nao-class' && <NaoClassificadoTab entries={naoClassificados} />}
      </div>
    </div>
  );
}
