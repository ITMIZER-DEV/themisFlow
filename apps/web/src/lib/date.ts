/**
 * Utilitários de Data, Hora e Fuso Horário no Padrão Brasileiro (pt-BR / GMT-3)
 * Blindado contra o bug de desvio de 1 dia (UTC Midnight vs America/Sao_Paulo).
 */

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Formata qualquer data ("YYYY-MM-DD", "YYYYMMDD", Date, ISO string)
 * estritamente no padrão brasileiro "DD/MM/AAAA".
 * Nunca sofre desvio de fuso horário.
 */
export function fmtDate(val: string | Date | null | undefined): string {
  if (!val) return '—';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '—';
    // Utiliza timezone de Brasília
    return val.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  const str = String(val).trim();
  if (!str) return '—';

  // "20260911" → "11/09/2026"
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
  }

  // "2026-09-11" ou "2026-09-11T..." ou "2026-09-11 00:00:00"
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  // "11/09/2026" (já no formato BR)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }

  try {
    const d = new Date(str);
    return isNaN(d.getTime()) ? str : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return str;
  }
}

/**
 * Formata strings de data e hora ("YYYY-MM-DDTHH:mm:ss", ISO ou Date)
 * para o padrão "DD/MM/AAAA HH:mm:ss" ou "DD/MM/AAAA HH:mm" em GMT-3.
 */
export function fmtDateTime(val: string | Date | null | undefined, includeSeconds = false): string {
  if (!val) return '—';

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '—';
    return val.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
    });
  }

  const str = String(val).trim();
  if (!str) return '—';

  // Se for string ISO com T ou espaço sem Z (tempo local direto)
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m && !str.endsWith('Z')) {
    const seg = includeSeconds && m[6] ? `:${m[6]}` : '';
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}${seg}`;
  }

  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
    });
  } catch {
    return str;
  }
}

/**
 * Formata apenas a hora "HH:mm" ou "HH:mm:ss" no fuso horário do Brasil.
 */
export function fmtTime(val: string | Date | null | undefined, includeSeconds = false): string {
  if (!val) return '—';
  try {
    const d = typeof val === 'string' ? new Date(val) : val;
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit', minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
    });
  } catch {
    return String(val);
  }
}

/**
 * Converte competência "2026-09" em "Setembro / 2026".
 */
export function fmtCompetencia(mesIso?: string | null): string {
  if (!mesIso) return '—';
  const parts = mesIso.trim().split('-');
  if (parts.length < 2) return mesIso;
  const ano = parts[0];
  const mesIdx = parseInt(parts[1], 10) - 1;
  const nomeMes = NOMES_MESES[mesIdx] ?? parts[1];
  return `${nomeMes} / ${ano}`;
}

/**
 * Retorna lista dos últimos N meses formatados para select/dropdown
 */
export function getOpcoesMesesCompetencia(qtdMeses = 12): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = [];
  const now = new Date();
  
  for (let i = 0; i < qtdMeses; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const val = `${ano}-${mes}`;
    result.push({
      value: val,
      label: fmtCompetencia(val),
    });
  }
  return result;
}
