/**
 * DayCards — cards clicáveis por dia do extrato bancário
 */
import type { DayRow } from '@themisflow/core';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDateLong = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

type DayCardsProps = {
  days: DayRow[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
};

export function DayCards({ days, selectedDate, onSelect }: DayCardsProps) {
  return (
    <div className="day-cards fade-in-up" role="list" aria-label="Dias do extrato bancário">
      {days.map(day => (
        <button
          key={day.date}
          id={`day-card-${day.date}`}
          className={`day-card${selectedDate === day.date ? ' selected' : ''}`}
          onClick={() => onSelect(day.date)}
          role="listitem"
          aria-label={`Dia ${fmtDateLong(day.date)} — saldo ${fmtBRL(day.close)}`}
          aria-pressed={selectedDate === day.date}
        >
          <div className="day-card-date">{fmtDateLong(day.date)}</div>
          <div className="day-card-saldo">{fmtBRL(day.close)}</div>
          <div className="day-card-row">
            <span className="cred">↑ {fmtBRL(day.cred)}</span>
            <span className="deb">↓ {fmtBRL(Math.abs(day.deb))}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--muted)' }}>
            {day.items.length} lançamento{day.items.length !== 1 ? 's' : ''}
          </div>
        </button>
      ))}
    </div>
  );
}
