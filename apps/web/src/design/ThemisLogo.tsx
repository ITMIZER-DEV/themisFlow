/**
 * ThemisFlow Logo — balança estilizada
 * Prato esquerdo: teal (banco)
 * Prato direito:  gold (sistema)
 * Braço: text (#e8eef7)
 * Nivelados em equilíbrio — Themis, deusa da justiça
 */
export function ThemisLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ThemisFlow logo — balança em equilíbrio"
    >
      {/* Coluna central */}
      <rect x="17" y="10" width="2" height="18" rx="1" fill="#e8eef7" opacity="0.9" />
      {/* Base */}
      <rect x="11" y="27" width="14" height="2.5" rx="1.25" fill="#e8eef7" opacity="0.7" />
      {/* Topo da coluna */}
      <circle cx="18" cy="10" r="1.5" fill="#e8eef7" opacity="0.9" />

      {/* Braço horizontal */}
      <rect x="6" y="13.5" width="24" height="1.5" rx="0.75" fill="#e8eef7" opacity="0.7" />

      {/* Cordas */}
      <line x1="10" y1="15" x2="10" y2="19" stroke="#e8eef7" strokeWidth="1" opacity="0.5" />
      <line x1="26" y1="15" x2="26" y2="19" stroke="#e8eef7" strokeWidth="1" opacity="0.5" />

      {/* Prato esquerdo — TEAL (banco/crédito) */}
      <ellipse cx="10" cy="20" rx="5" ry="1.8" fill="#00c9b1" opacity="0.9" />
      <path d="M5 20 Q10 23.5 15 20" fill="none" stroke="#00c9b1" strokeWidth="1.5" opacity="0.6" />

      {/* Prato direito — GOLD (sistema/saldo) */}
      <ellipse cx="26" cy="20" rx="5" ry="1.8" fill="#f0a500" opacity="0.9" />
      <path d="M21 20 Q26 23.5 31 20" fill="none" stroke="#f0a500" strokeWidth="1.5" opacity="0.6" />

      {/* Linha de fluxo teal (banco) */}
      <path
        d="M5.5 20.5 C6.5 19 8 18.5 10 19"
        stroke="#00c9b1" strokeWidth="1" strokeLinecap="round" opacity="0.5"
      />
      {/* Linha de fluxo gold (sistema) */}
      <path
        d="M26 19 C28 18.5 29.5 19 30.5 20.5"
        stroke="#f0a500" strokeWidth="1" strokeLinecap="round" opacity="0.5"
      />
    </svg>
  );
}
