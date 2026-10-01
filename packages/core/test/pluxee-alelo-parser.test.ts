import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  parsePluxeePgtosRows,
  parseAleloRecebimentosRows,
  parseAleloOutrasRows,
} from '../src/index.js';

const PLUXEE_PGTOS_XLSX = path.resolve(__dirname, '../../../docs/conciliacao/pluxee/pluxee/extrato_pgtos_30_09_2026 (3).xlsx');
const ALELO_RECEB_XLSX   = path.resolve(__dirname, '../../../docs/conciliacao/alelo/alelo/Recebimentos_Alelo_31_07_2026_29_08_2026.xlsx');

describe('Pluxee & Alelo Voucher Parsers — Taxas Efetivas & Verbas', () => {
  describe('Pluxee (ex-Sodexo) — Alocação Segmentada por Origem (PAT vs Auxílio)', () => {
    it('deve extrair o extrato de pagamentos, aplicar 3,60% no PAT, 6,90% no Auxílio e lançar AJUSTE de Gestão', () => {
      if (!fs.existsSync(PLUXEE_PGTOS_XLSX)) return;
      const wb = XLSX.readFile(PLUXEE_PGTOS_XLSX);
      const ws = wb.Sheets[wb.SheetNames[0]!];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws!, { header: 1, defval: '' });

      const result = parsePluxeePgtosRows(rows, 'extrato_pgtos_pluxee.xlsx');

      expect(result.gateway).toBe('PLUXEE');
      expect(result.resumo).toBeDefined();
      expect(result.resumo.totalBruto).toBe(8082.05);
      expect(result.resumo.totalTaxas).toBe(384.29);
      expect(result.resumo.taxaAdminPat).toBe(202.21);
      expect(result.resumo.taxaAdminAuxilio).toBe(170.10);
      expect(result.resumo.gestaoAuxilio).toBe(11.98);
      expect(result.resumo.totalLiquido).toBe(7697.76);

      // Transações de vendas: 139 + 1 ajuste de gestão = 140
      expect(result.recebiveis.length).toBe(140);

      // 1. Vendas PAT
      const patItems = result.recebiveis.filter((r: any) => r.lancamento && r.lancamento.includes('PAT'));
      expect(patItems.length).toBe(103);
      const brutoPat = patItems.reduce((s: number, r: any) => s + r.valorVenda, 0);
      const taxaPat = patItems.reduce((s: number, r: any) => s + Math.abs(r.descontos), 0);
      expect(Math.round(brutoPat * 100) / 100).toBe(5617.05);
      expect(Math.round(taxaPat * 100) / 100).toBe(202.21);
      const pctPat = (taxaPat / brutoPat) * 100;
      expect(Math.round(pctPat * 100) / 100).toBe(3.60);

      // 2. Vendas Auxílio
      const auxItems = result.recebiveis.filter((r: any) => r.lancamento && r.lancamento.includes('AUXILIO') && r.tipoLancamento === 'PAGAMENTO_REALIZADO');
      expect(auxItems.length).toBe(36);
      const brutoAux = auxItems.reduce((s: number, r: any) => s + r.valorVenda, 0);
      const taxaAux = auxItems.reduce((s: number, r: any) => s + Math.abs(r.descontos), 0);
      expect(Math.round(brutoAux * 100) / 100).toBe(2465.00);
      expect(Math.round(taxaAux * 100) / 100).toBe(170.10);
      const pctAux = (taxaAux / brutoAux) * 100;
      expect(Math.round(pctAux * 100) / 100).toBe(6.90);

      // 3. Ajuste de Gestão de Pagamentos - Auxílio
      const ajusteItem = result.recebiveis.find((r: any) => r.tipoLancamento === 'AJUSTE');
      expect(ajusteItem).toBeDefined();
      expect(ajusteItem.lancamento).toBe('GESTÃO DE PAGAMENTOS - AUXILIO');
      expect(ajusteItem.valorLiquido).toBe(-11.98);

      // 4. Fechamento total do lote
      const totalLiquidoCalculado = result.recebiveis.reduce((s: number, r: any) => s + r.valorLiquido, 0);
      expect(Math.round(totalLiquidoCalculado * 100) / 100).toBe(7697.76);
    });
  });

  describe('Alelo — Recebimentos e Outras Transações (Tarifa TOR)', () => {
    it('deve extrair recebimentos com taxas contratuais (3,60% PAT e 6,90% Auxílio)', () => {
      if (!fs.existsSync(ALELO_RECEB_XLSX)) return;
      const wb = XLSX.readFile(ALELO_RECEB_XLSX);
      const wsRec = wb.Sheets['Recebimentos'];
      expect(wsRec).toBeDefined();
      wsRec!['!ref'] = 'A1:O78';
      const rowsRec = XLSX.utils.sheet_to_json<any[]>(wsRec!, { header: 1, defval: '' });

      const result = parseAleloRecebimentosRows(rowsRec, 'Recebimentos_Alelo.xlsx');
      expect(result.gateway).toBe('ALELO');
      expect(result.recebiveis.length).toBe(77);

      const patRecs = result.recebiveis.filter((r: any) => r.lancamento === 'Alimentação PAT');
      const auxRecs = result.recebiveis.filter((r: any) => r.lancamento === 'Alimentação Auxílio');

      expect(patRecs.length).toBe(25);
      expect(auxRecs.length).toBe(52);

      const brutoPat = patRecs.reduce((s: number, r: any) => s + r.valorVenda, 0);
      const taxaPat  = patRecs.reduce((s: number, r: any) => s + Math.abs(r.descontos), 0);
      expect(Math.round((taxaPat / brutoPat) * 10000) / 100).toBe(3.60);

      const brutoAux = auxRecs.reduce((s: number, r: any) => s + r.valorVenda, 0);
      const taxaAux  = auxRecs.reduce((s: number, r: any) => s + Math.abs(r.descontos), 0);
      expect(Math.round((taxaAux / brutoAux) * 10000) / 100).toBe(6.90);
    });

    it('deve extrair a aba Outras Transações gerando registros de AJUSTE com Tarifa TOR (-1,22)', () => {
      if (!fs.existsSync(ALELO_RECEB_XLSX)) return;
      const wb = XLSX.readFile(ALELO_RECEB_XLSX);
      const wsOutras = wb.Sheets['Outras Transações'];
      expect(wsOutras).toBeDefined();
      wsOutras!['!ref'] = 'A1:I15';
      const rowsOutras = XLSX.utils.sheet_to_json<any[]>(wsOutras!, { header: 1, defval: '' });

      const result = parseAleloOutrasRows(rowsOutras, 'Recebimentos_Alelo.xlsx');
      expect(result.gateway).toBe('ALELO');
      expect(result.recebiveis.length).toBe(12);

      const torItems = result.recebiveis.filter((r: any) => r.tipoLancamento === 'AJUSTE' && r.lancamento.includes('Tarifa TOR'));
      expect(torItems.length).toBe(12);
      expect(torItems[0].valorLiquido).toBe(-1.22);
    });
  });
});
