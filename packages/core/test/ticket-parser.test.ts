import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  parseTicketRows,
  parseTicketRecebiveisRows,
} from '../src/index.js';

const VENDAS_XLS_PATH = path.resolve(__dirname, '../../../docs/ticket/20260917_Relatorio_transacoes_e09495f3ace44ba598e9959105f6efbf.xlsx');
const REEMBOLSO_XLS_PATH = path.resolve(__dirname, '../../../docs/ticket/reembolso.xlsx');

describe('Ticket / Edenred Parsers', () => {
  describe('Extrato de Vendas / Transações (XLSX)', () => {
    it('deve extrair com sucesso as 108 transações de vendas do portal Ticket', () => {
      const wb = XLSX.readFile(VENDAS_XLS_PATH);
      const ws = wb.Sheets[wb.SheetNames[0]!];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws!, { header: 1, defval: '' });

      const result = parseTicketRows(rows, 'relatorio_transacoes_ticket.xlsx');

      expect(result.gateway).toBe('TICKET');
      expect(result.vendas.length).toBe(108);

      const v0 = result.vendas[0]!;
      expect(v0.gateway).toBe('TICKET');
      expect(v0.cnpj).toBe('61016510000141');
      expect(v0.ec).toBe('101914650');
      expect(v0.nsu).toBe('821157');
      expect(v0.autorizacao).toBe('821157');
      expect(v0.valorBruto).toBe(34.70);
      expect(v0.valorLiquido).toBe(34.70);
      expect(v0.dataHoraVenda).toBe('2026-08-01T07:30:00');
      expect(v0.bandeira).toBe('TICKET');
      expect(v0.bandeiraBruta).toBe('TAE');
      expect(v0.formaPagamento).toBe('Ticket Alimentação');
      expect(v0.modalidade).toBe('VOUCHER');

      const total = result.vendas.reduce((acc, v) => acc + v.valorBruto, 0);
      expect(Math.round(total * 100) / 100).toBe(6282.51);
    });
  });

  describe('Extrato de Reembolso Detalhado / Recebíveis (XLSX)', () => {
    it('deve extrair os lotes de liquidação e transações analíticas com taxas deduzidas', () => {
      const wb = XLSX.readFile(REEMBOLSO_XLS_PATH);
      const ws = wb.Sheets[wb.SheetNames[0]!];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws!, { header: 1, defval: '' });

      const result = parseTicketRecebiveisRows(rows, 'reembolso.xlsx');

      expect(result.gateway).toBe('TICKET');
      expect(result.recebiveis.length).toBe(33); // 9 lotes PAGAMENTO_REALIZADO + 24 vendas analíticas

      const pagamentos = result.recebiveis.filter((r: any) => r.tipoLancamento === 'PAGAMENTO_REALIZADO');
      const vendasAnaliticas = result.recebiveis.filter((r: any) => r.tipoLancamento === 'VENDA');

      expect(pagamentos.length).toBe(9);
      expect(vendasAnaliticas.length).toBe(24);

      // Validação do lote 447178131 (Ticket Flex)
      const lote0 = pagamentos[0]!;
      expect(lote0.nsu).toBe('447178131');
      expect(lote0.ec).toBe('100693908');
      expect(lote0.cnpj).toBe('61016510000141');
      expect(lote0.dataVenda).toBe('2026-08-12'); // Data de corte
      expect(lote0.dataVencimento).toBe('2026-09-11'); // Data do crédito bancário
      expect(lote0.valorVenda).toBe(717.18);
      expect(lote0.descontos).toBe(-57.57);
      expect(lote0.valorLiquido).toBe(659.61);
      expect(lote0.lancamento).toContain('Reembolso Ticket Ticket Flex 447178131');
      expect(lote0.lancamento).toContain('TPE R$ 43.03');

      // Soma dos 9 lotes
      const totalBruto = pagamentos.reduce((acc: number, r: any) => acc + r.valorVenda, 0);
      const totalLiq = pagamentos.reduce((acc: number, r: any) => acc + r.valorLiquido, 0);
      const totalDesc = pagamentos.reduce((acc: number, r: any) => acc + r.descontos, 0);

      expect(Math.round(totalBruto * 100) / 100).toBe(2588.19);
      expect(Math.round(totalLiq * 100) / 100).toBe(2423.57);
      expect(Math.round(totalDesc * 100) / 100).toBe(-164.62);
      expect(Math.round((totalBruto + totalDesc) * 100) / 100).toBe(2423.57);

      // Validação de uma venda analítica
      const v0 = vendasAnaliticas[0]!;
      expect(v0.nsu).toBe('591600');
      expect(v0.valorVenda).toBe(142.64);
      expect(v0.dataVenda).toBe('2026-08-05');
      expect(v0.dataVencimento).toBe('2026-09-11');
      expect(v0.cartaoMascarado).toBe('************977078');
    });
  });
});
