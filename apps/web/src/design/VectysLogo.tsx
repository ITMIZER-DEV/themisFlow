import React from 'react';

export interface VectysLogoProps {
  /** Tamanho do ícone/altura base em pixels (padrão: 32) */
  size?: number;
  /** Variante de exibição */
  variant?: 'icon' | 'horizontal' | 'full' | 'stacked';
  /** Tema de fundo: 'dark' (negativo), 'light' (positivo) ou 'auto' (usa variáveis CSS) */
  theme?: 'dark' | 'light' | 'auto';
  /** Exibir ou não o subtítulo "SISTEMA DE CONCILIAÇÃO BANCÁRIA..." */
  showSubtitle?: boolean;
  /** Sobrescrever classe CSS para styling adicional */
  className?: string;
  /** Estilos inline no contêiner */
  style?: React.CSSProperties;
}

/**
 * VECTYS by itmizer — Símbolo Vetorial Oficial (Isótipo)
 * Geometria:
 * - Duas lâminas dinâmicas em espelho/paridade:
 *   - Faceta superior: Azul Corporativo (#0B5FFF)
 *   - Faceta inferior: Teal / Verde Moderno (#14B8A6)
 * - Escudo central com Check de Conformidade (no espaço negativo):
 *   - Dark theme (negativo): escudo branco (#FFFFFF) com check azul escuro (#0F2A44)
 *   - Light theme (positivo): escudo azul escuro (#0F2A44) com check branco (#FFFFFF)
 */
export function VectysSymbol({
  size = 32,
  theme = 'auto',
  className = '',
  style = {},
}: {
  size?: number;
  theme?: 'dark' | 'light' | 'auto';
  className?: string;
  style?: React.CSSProperties;
}) {
  // Proporção do viewBox é 76 x 56 (aprox 1.35 : 1)
  const width = Math.round(size * 1.35);
  const height = size;

  // Gerar ID único para gradientes não colidirem em múltiplas instâncias
  const id = React.useId().replace(/:/g, '');
  const blueGradId = `vectys-blue-${id}`;
  const tealGradId = `vectys-teal-${id}`;

  const isLight = theme === 'light';

  // Cores do escudo e check
  const shieldColor = isLight ? '#0F2A44' : '#FFFFFF';
  const checkColor = isLight ? '#FFFFFF' : '#0F2A44';

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 76 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      aria-label="VECTYS by itmizer — Balança geométrica com check de conformidade"
      role="img"
    >
      <defs>
        {/* Gradiente Azul Corporativo VECTYS */}
        <linearGradient id={blueGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B5FFF" />
          <stop offset="100%" stopColor="#2575FC" />
        </linearGradient>

        {/* Gradiente Teal Moderno VECTYS / ITMIZER */}
        <linearGradient id={tealGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#0D9488" />
        </linearGradient>

        {/* Sombra sutil para profundidade corporativa */}
        <filter id={`shadow-${id}`} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="rgba(0,0,0,0.3)" />
        </filter>
      </defs>

      <g filter={`url(#shadow-${id})`}>
        {/* ── LÂMINA ESQUERDA (Paridade / Banco & Vendas) ───────────────── */}
        {/* Faceta Superior Esquerda — Azul Corporativo */}
        <path
          d="M 8 13 L 29 23.5 L 29 37 L 8 26.5 Z"
          fill={`url(#${blueGradId})`}
        />
        {/* Faceta Inferior Esquerda — Teal Moderno */}
        <path
          d="M 8 26.5 L 29 37 L 29 50.5 L 8 40 Z"
          fill={`url(#${tealGradId})`}
        />

        {/* ── LÂMINA DIREITA (Paridade / ERP & Recebíveis) ──────────────── */}
        {/* Faceta Superior Direita — Azul Corporativo */}
        <path
          d="M 47 23.5 L 68 13 L 68 26.5 L 47 37 Z"
          fill={`url(#${blueGradId})`}
        />
        {/* Faceta Inferior Direita — Teal Moderno */}
        <path
          d="M 47 37 L 68 26.5 L 68 40 L 47 50.5 Z"
          fill={`url(#${tealGradId})`}
        />

        {/* ── ESCUDO CENTRAL (Check de Conformidade & Auditoria) ───────── */}
        {/* Elongated Hexagon Shield */}
        <path
          d="M 38 18 L 45.5 24 L 45.5 45 L 38 51 L 30.5 45 L 30.5 24 Z"
          fill={shieldColor}
        />

        {/* Checkmark no Espaço Negativo */}
        <path
          d="M 33.8 34.5 L 36.8 37.8 L 42.2 31.8"
          stroke={checkColor}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/**
 * Logotipo Completo VECTYS com Tipografia Cabinet Grotesk / DM Sans
 */
export function VectysLogo({
  size = 32,
  variant = 'horizontal',
  theme = 'auto',
  showSubtitle = false,
  className = '',
  style = {},
}: VectysLogoProps) {
  if (variant === 'icon') {
    return <VectysSymbol size={size} theme={theme} className={className} style={style} />;
  }

  const isLight = theme === 'light';
  const textColor = isLight ? '#0F2A44' : '#FFFFFF';
  const subColor = isLight ? '#1F2937' : '#94A3B8';
  const itmizerColor = isLight ? '#0B5FFF' : '#14B8A6';
  const subtitleColor = isLight ? '#475569' : '#64748B';

  const fontBrand = "'Cabinet Grotesk', 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif";

  // Dimensões proporcionais
  const titleFontSize = Math.round(size * 0.72);
  const byFontSize = Math.round(size * 0.36);
  const subFontSize = Math.max(9, Math.round(size * 0.24));

  if (variant === 'stacked') {
    return (
      <div
        className={`vectys-logo-stacked ${className}`}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: Math.round(size * 0.2),
          userSelect: 'none',
          ...style,
        }}
      >
        <VectysSymbol size={Math.round(size * 1.2)} theme={theme} />
        <div>
          <div
            style={{
              fontFamily: fontBrand,
              fontWeight: 800,
              fontSize: `${titleFontSize * 1.2}px`,
              letterSpacing: '0.08em',
              color: textColor,
              lineHeight: 1,
            }}
          >
            VECTYS
          </div>
          <div
            style={{
              fontSize: `${byFontSize}px`,
              color: subColor,
              marginTop: 4,
              letterSpacing: '0.04em',
            }}
          >
            by <strong style={{ color: itmizerColor, fontWeight: 700 }}>itmizer</strong>
          </div>
        </div>
        {showSubtitle && (
          <div
            style={{
              fontSize: `${subFontSize}px`,
              color: subtitleColor,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 600,
              maxWidth: 320,
              lineHeight: 1.4,
              marginTop: 4,
            }}
          >
            Sistema de Conciliação Bancária, Auditoria de Cartões e Fluxo de Caixa
          </div>
        )}
      </div>
    );
  }

  // Horizontal / Full
  return (
    <div
      className={`vectys-logo ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(size * 0.35),
        userSelect: 'none',
        ...style,
      }}
    >
      <VectysSymbol size={size} theme={theme} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1 }}>
          <span
            style={{
              fontFamily: fontBrand,
              fontWeight: 800,
              fontSize: `${titleFontSize}px`,
              letterSpacing: '0.07em',
              color: textColor,
            }}
          >
            VECTYS
          </span>
          <span
            style={{
              fontSize: `${byFontSize}px`,
              color: subColor,
              letterSpacing: '0.03em',
            }}
          >
            by <span style={{ color: itmizerColor, fontWeight: 700 }}>itmizer</span>
          </span>
        </div>

        {showSubtitle && (
          <div
            style={{
              fontSize: `${subFontSize}px`,
              color: subtitleColor,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginTop: 4,
              lineHeight: 1.2,
            }}
          >
            Sistema de Conciliação Bancária, Auditoria de Cartões e Fluxo de Caixa
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compatibilidade legada — redireciona ThemisLogo para o novo VectysSymbol
 */
export function ThemisLogo({ size = 32 }: { size?: number }) {
  return <VectysSymbol size={size} />;
}
