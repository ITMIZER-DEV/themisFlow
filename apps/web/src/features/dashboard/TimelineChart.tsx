import { useState, useMemo } from 'react';

interface TimelineItem {
  data: string;
  vendas: number;
  recebido: number;
  previsto: number;
}

interface TimelineChartProps {
  data: TimelineItem[];
  onSelectDay?: (dia: string) => void;
  selectedDay?: string | null;
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDia(iso: string) {
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return iso;
}

export function TimelineChart({ data, onSelectDay, selectedDay }: TimelineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { maxVal, points } = useMemo(() => {
    if (!data || data.length === 0) return { maxVal: 1, points: [] };

    let max = 0;
    for (const d of data) {
      if (d.vendas > max) max = d.vendas;
      if (d.recebido > max) max = d.recebido;
      if (d.previsto > max) max = d.previsto;
    }
    if (max === 0) max = 1000;
    return { maxVal: max * 1.15, points: data };
  }, [data]);

  const svgWidth = 900;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingY = 30;
  const chartW = svgWidth - paddingX * 2;
  const chartH = svgHeight - paddingY * 2;

  const n = points.length;
  const step = n > 1 ? chartW / (n - 1) : chartW;

  const getCoord = (idx: number, val: number) => {
    const x = paddingX + idx * step;
    const y = svgHeight - paddingY - (val / maxVal) * chartH;
    return { x, y: Math.max(paddingY, Math.min(svgHeight - paddingY, y)) };
  };

  // Build SVG Path strings
  const vendasPath = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, p, i) => {
      const { x, y } = getCoord(i, p.vendas);
      return `${acc} ${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, '');
  }, [points, maxVal]);

  const recebidoPath = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, p, i) => {
      const { x, y } = getCoord(i, p.recebido);
      return `${acc} ${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, '');
  }, [points, maxVal]);

  const previstoPath = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, p, i) => {
      const { x, y } = getCoord(i, p.previsto);
      return `${acc} ${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, '');
  }, [points, maxVal]);

  const hoveredItem = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--sp-4)',
      position: 'relative',
    }}>
      {/* Header with Legend */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Fluxo Diário: Vendas × Recebimentos Realizados × Previsão Futura
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '2px 0 0' }}>
            Clique em qualquer dia para abrir o detalhamento analítico instantâneo (drilldown)
          </p>
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 3, background: 'var(--teal)', borderRadius: 2 }} />
            <span style={{ color: 'var(--teal)' }}>Vendas (Bruto)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 3, background: 'var(--gold)', borderRadius: 2 }} />
            <span style={{ color: 'var(--gold)' }}>Recebido (Liquidado)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 3, background: '#818cf8', borderRadius: 2, borderTop: '2px dashed #818cf8' }} />
            <span style={{ color: '#818cf8' }}>Previsão / Agenda</span>
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: '100%', minWidth: 600, height: 'auto', display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = svgHeight - paddingY - ratio * chartH;
            return (
              <g key={i}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={svgWidth - paddingX}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="4,4"
                  strokeWidth="0.8"
                />
                <text
                  x={paddingX - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--muted)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {fmtMoeda(ratio * maxVal).replace(',00', '')}
                </text>
              </g>
            );
          })}

          {/* Paths */}
          {vendasPath && (
            <path
              d={vendasPath}
              fill="none"
              stroke="var(--teal)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {recebidoPath && (
            <path
              d={recebidoPath}
              fill="none"
              stroke="var(--gold)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {previstoPath && (
            <path
              d={previstoPath}
              fill="none"
              stroke="#818cf8"
              strokeWidth="2"
              strokeDasharray="4,3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive columns for click & hover */}
          {points.map((p, i) => {
            const { x } = getCoord(i, 0);
            const isHovered = hoveredIdx === i;
            const isSelected = selectedDay === p.data;
            const colWidth = Math.max(step * 0.8, 12);

            return (
              <g
                key={p.data}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectDay?.(p.data)}
                onMouseEnter={() => setHoveredIdx(i)}
              >
                {/* Highlight background column on hover/selection */}
                {(isHovered || isSelected) && (
                  <rect
                    x={x - colWidth / 2}
                    y={paddingY}
                    width={colWidth}
                    height={chartH}
                    fill={isSelected ? 'rgba(0, 201, 177, 0.18)' : 'rgba(255, 255, 255, 0.05)'}
                    rx="3"
                  />
                )}

                {/* Vertical marker line */}
                {(isHovered || isSelected) && (
                  <line
                    x1={x}
                    y1={paddingY}
                    x2={x}
                    y2={svgHeight - paddingY}
                    stroke={isSelected ? 'var(--teal)' : 'var(--border-strong)'}
                    strokeWidth="1.2"
                  />
                )}

                {/* Point dots */}
                {p.vendas > 0 && (
                  <circle
                    cx={x}
                    cy={getCoord(i, p.vendas).y}
                    r={isHovered ? 5 : 3}
                    fill="var(--teal)"
                    stroke="#0b1220"
                    strokeWidth="1.5"
                  />
                )}
                {p.recebido > 0 && (
                  <circle
                    cx={x}
                    cy={getCoord(i, p.recebido).y}
                    r={isHovered ? 5 : 3}
                    fill="var(--gold)"
                    stroke="#0b1220"
                    strokeWidth="1.5"
                  />
                )}

                {/* X Axis Label */}
                {(i % Math.ceil(n / 10) === 0 || i === n - 1) && (
                  <text
                    x={x}
                    y={svgHeight - paddingY + 16}
                    textAnchor="middle"
                    fill={isSelected ? 'var(--teal)' : isHovered ? 'var(--text)' : 'var(--muted)'}
                    fontSize="9"
                    fontWeight={isSelected || isHovered ? 'bold' : 'normal'}
                    fontFamily="var(--font-mono)"
                  >
                    {fmtDia(p.data)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover Floating Tooltip */}
      {hoveredItem && (
        <div style={{
          position: 'absolute',
          top: 14,
          right: 20,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid var(--border-strong)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 14px',
          fontSize: '0.75rem',
          pointerEvents: 'none',
          zIndex: 10,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
        }}>
          <div>
            <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>Dia:</span>{' '}
            <strong style={{ color: 'var(--text)' }}>{hoveredItem.data}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--teal)', fontSize: '0.7rem' }}>Vendas:</span>{' '}
            <strong style={{ color: 'var(--teal)' }}>{fmtMoeda(hoveredItem.vendas)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--gold)', fontSize: '0.7rem' }}>Recebido:</span>{' '}
            <strong style={{ color: 'var(--gold)' }}>{fmtMoeda(hoveredItem.recebido)}</strong>
          </div>
          {hoveredItem.previsto > 0 && (
            <div>
              <span style={{ color: '#818cf8', fontSize: '0.7rem' }}>Previsto:</span>{' '}
              <strong style={{ color: '#818cf8' }}>{fmtMoeda(hoveredItem.previsto)}</strong>
            </div>
          )}
          <span style={{ fontSize: '0.65rem', color: 'var(--teal)', background: 'rgba(0,201,177,0.1)', padding: '2px 6px', borderRadius: 4 }}>
            Clique p/ detalhar
          </span>
        </div>
      )}
    </div>
  );
}
