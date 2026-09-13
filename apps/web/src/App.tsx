/**
 * App — shell principal do ThemisFlow
 * 3 abas: Banco (OFX) | Sistema (XLS) | Comparativo
 */
import { useState } from 'react';
import { ThemisLogo } from './design/ThemisLogo';
import { BankTab } from './features/bank/BankTab';
import { SystemTab } from './features/system/SystemTab';
import { CompareTab } from './features/compare/CompareTab';
import { useBankStore } from './stores/bankStore';
import { useSystemStore } from './stores/systemStore';
import { useMatchStore } from './stores/matchStore';

type Tab = 'bank' | 'system' | 'compare';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('bank');

  const bankAccounts = useBankStore(s => s.accounts);
  const systemStatement = useSystemStore(s => s.statement);
  const matchResult = useMatchStore(s => s.result);

  const bankCount = [...bankAccounts.values()].reduce((s, a) => s + a.trnsWithId.length, 0);
  const sysCount = systemStatement?.items.length ?? 0;
  const divergencias = matchResult
    ? matchResult.onlySys.length + matchResult.onlyBank.length
    : null;

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    // Rodar matching ao entrar na aba comparativo
    if (tab === 'compare') {
      useMatchStore.getState().runMatch();
    }
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header" role="banner">
        <a href="/" className="app-logo" aria-label="ThemisFlow — página inicial">
          <ThemisLogo size={32} />
          <div>
            <div className="app-logo-name">ThemisFlow</div>
            <div className="app-logo-sub">ITMIZER · Conciliação Bancária</div>
          </div>
        </a>

        {/* Indicador de status global */}
        {bankAccounts.size > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {divergencias !== null && (
              <span className={`tab-badge ${divergencias === 0 ? 'tab-badge-ok' : 'tab-badge-warn'}`}>
                {divergencias === 0 ? '✓ Conciliado' : `${divergencias} divergências`}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Tab Bar */}
      <nav className="tab-bar" role="tablist" aria-label="Seções do ThemisFlow">
        <button
          id="tab-banco"
          role="tab"
          aria-selected={activeTab === 'bank'}
          aria-controls="panel-banco"
          className={`tab-btn${activeTab === 'bank' ? ' active-bank' : ''}`}
          onClick={() => switchTab('bank')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          Banco (OFX)
          {bankCount > 0 && (
            <span className="tab-badge tab-badge-teal">{bankCount}</span>
          )}
        </button>

        <button
          id="tab-sistema"
          role="tab"
          aria-selected={activeTab === 'system'}
          aria-controls="panel-sistema"
          className={`tab-btn${activeTab === 'system' ? ' active-system' : ''}`}
          onClick={() => switchTab('system')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
          Sistema (XLS)
          {sysCount > 0 && (
            <span className="tab-badge tab-badge-gold">{sysCount}</span>
          )}
        </button>

        <button
          id="tab-comparativo"
          role="tab"
          aria-selected={activeTab === 'compare'}
          aria-controls="panel-comparativo"
          className={`tab-btn${activeTab === 'compare' ? ' active-compare' : ''}`}
          onClick={() => switchTab('compare')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Comparativo
          {divergencias !== null && (
            <span className={`tab-badge ${divergencias === 0 ? 'tab-badge-ok' : 'tab-badge-warn'}`}>
              {divergencias === 0 ? '✓' : divergencias}
            </span>
          )}
        </button>
      </nav>

      {/* Panels */}
      <main className="tab-content">
        <div
          id="panel-banco"
          role="tabpanel"
          aria-labelledby="tab-banco"
          style={{ display: activeTab === 'bank' ? 'block' : 'none' }}
        >
          <BankTab />
        </div>

        <div
          id="panel-sistema"
          role="tabpanel"
          aria-labelledby="tab-sistema"
          style={{ display: activeTab === 'system' ? 'block' : 'none' }}
        >
          <SystemTab />
        </div>

        <div
          id="panel-comparativo"
          role="tabpanel"
          aria-labelledby="tab-comparativo"
          style={{ display: activeTab === 'compare' ? 'block' : 'none' }}
        >
          <CompareTab />
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '8px 24px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.7rem',
        color: 'var(--muted)',
      }}>
        <span>ThemisFlow v0.1 · ITMIZER · Dados processados localmente</span>
        <span>🔒 Nenhum dado enviado para servidores externos</span>
      </footer>
    </div>
  );
}
