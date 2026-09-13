/**
 * BalanceChart — gráfico SVG de evolução do saldo bancário
 * Port fiel do gráfico da referência HTML v0. Sem lib de chart externa.
 * R9 — Saldo é calculado sobre o universo completo; filtros de UI não afetam o gráfico.
 */
import { useMemo } from 'react';
import type { DayRow } from '@themisflow/core';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

type BalanceChartProps = {
  days: DayRow[];
  anchored: boolean;
};

const W = 800;
const H = 180;
const PAD = { top: 20, right: 20, bottom: 36, left: 16 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

export function BalanceChart({ days, anchored }: BalanceChartProps) {
  const { points, minV, maxV, ticks, xLabels } = useMemo(() => {
    if (!days.length) return { points: [], minV: 0, maxV: 0, ticks: [], xLabels: [] };

    // Pontos: abertura do primeiro dia + fechamentos de cada dia
    const vals: number[] = [days[0]!.open, ...days.map(d => d.close)];
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;

    const toX = (i: number) => PAD.left + (i / (vals.length - 1)) * INNER_W;
    const toY = (v: number) => PAD.top + INNER_H - ((v - minV) / range) * INNER_H;

    const points = vals.map((v, i) => ({ x: toX(i), y: toY(v), v }));

    // Ticks Y: 4 linhas
    const ticks = [0, 1, 2, 3].map(i => {
      const v = minV + (range * i) / 3;
      return { y: toY(v), label: fmtBRL(v) };
    });

    // Labels X: datas
    const xLabels = [0, ...days.map((_, i) => i + 1)].map((i) => {
      const date = i === 0 ? days[0]!.date : days[i - 1]!.date;
      const [, m, d] = date.split('-');
      return { x: toX(i), label: i === 0 ? `ab.\n${d}/${m}` : `${d}/${m}` };
    });

    return { points, minV, maxV, ticks, xLabels };
  }, [days]);

  if (!days.length || !points.length) return null;

  // Construir path de linha e área
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = pathD + ` L${points.at(-1)!.x.toFixed(1)},${(PAD.top + INNER_H).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + INNER_H).toFixed(1)} Z`;

  return (
    <div className="chart-wrap">
      <div className="chart-header">
        <span className="chart-title">Evolução do saldo</span>
        <div className="chart-legend">
          <span>
            <span className="dot" style={{ background: 'var(--teal)' }} />
            Saldo {anchored ? 'absoluto' : 'relativo'}
          </span>
          {!anchored && (
            <span style={{ color: 'var(--gold)' }}>⚠ sem LEDGERBAL — valores relativos</span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Gráfico de evolução do saldo bancário"
      >
        <defs>
          <linearGradient id="teal-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00c9b1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00c9b1" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines Y */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={t.y.toFixed(1)}
              x2={W - PAD.right} y2={t.y.toFixed(1)}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x={W - PAD.right + 4}
              y={Number(t.y.toFixed(1)) + 4}
              fontSize="9"
              fill="var(--muted)"
              textAnchor="start"
            >
              {fmtBRL(minV + (maxV - minV) * i / 3)}
            </text>
          </g>
        ))}

        {/* Área preenchida */}
        <path d={areaD} fill="url(#teal-gradient)" />

        {/* Linha de saldo */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--teal)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Pontos */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x.toFixed(1)} cy={p.y.toFixed(1)}
              r="3.5"
              fill="var(--teal)"
              stroke="var(--panel)"
              strokeWidth="2"
            />
          </g>
        ))}

        {/* Labels X */}
        {xLabels.map((l, i) => (
          <text
            key={i}
            x={l.x.toFixed(1)}
            y={PAD.top + INNER_H + 16}
            fontSize="9"
            fill="var(--muted)"
            textAnchor="middle"
          >
            {l.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
