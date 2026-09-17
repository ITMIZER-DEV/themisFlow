import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  parseVrBeneficiosRows,
  parseVrRecebiveisRows,
  parseVrVendasEdi,
  parseVrReembolsosEdi,
  conciliaAdquirenteComSitef,
  type VendaInput,
  type SitefInput,
} from '../src/index.js';

const SALES_XLS_PATH = path.resolve(__dirname, '../../../docs/vr/vr/extracted_sales/extratos/extrato_vendas_vr_2026-08-01_a_2026-09-15.xls');
const SALES_TXT_PATH = path.resolve(__dirname, '../../../docs/vr/vr/extracted_sales/extratos/extrato_vendas_vr_2026-08-01_a_2026-09-15.txt');
const REFUND_XLS_PATH = path.resolve(__dirname, '../../../docs/vr/vr/extracted_refund/extratos/extrato_reembolsos_vr_undefined_a_undefined.xls');
const REFUND_TXT_PATH = path.resolve(__dirname, '../../../docs/vr/vr/extracted_refund/extratos/extrato_reembolsos_vr_undefined_a_undefined.txt');

describe('VR Benefícios Parsers', () => {
  describe('Extrato de Vendas (XLS)', () => {
    it('deve extrair com sucesso as transações da planilha de vendas VR', () => {
      const wb = XLSX.readFile(SALES_XLS_PATH);
      const ws = wb.Sheets[wb.SheetNames[0]!];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws!, { header: 1, defval: '' });

      const result = parseVrBeneficiosRows(rows, 'extrato_vendas_vr.xls');

      expect(result.gateway).toBe('VR');
      expect(result.vendas.length).toBe(110);

      // Validação da primeira venda
      const v0 = result.vendas[0]!;
      expect(v0.gateway).toBe('VR');
      expect(v0.cnpj).toBe('61016510000141');
      expect(v0.autorizacao).toBe('000353');
      expect(v0.nsu).toBe('000353');
      expect(v0.valorBruto).toBe(35.91);
      expect(v0.valorLiquido).toBe(35.91);
      expect(v0.cartaoMascarado).toBe('637036******8372');
      expect(v0.dataHoraVenda).toBe('2026-08-01T20:42:00');
      expect(v0.bandeiraBruta).toBe('VR Auxílio Alimentação');

      // Soma total das vendas deve bater com R$ 4.449,00
      const total = result.vendas.reduce((acc, v) => acc + v.valorBruto, 0);
      expect(Math.round(total * 100) / 100).toBe(4449.00);
    });
  });

  describe('Extrato de Vendas (EDI / TXT 200 posições)', () => {
    it('deve extrair com precisão as transações do arquivo posicional da VR', () => {
      const text = fs.readFileSync(SALES_TXT_PATH, 'latin1');
      const result = parseVrVendasEdi(text, 'extrato_vendas_vr.txt');

      expect(result.gateway).toBe('VR');
      expect(result.vendas.length).toBe(110);

      // Primeira venda do TXT
      const v0 = result.vendas[0]!;
      expect(v0.autorizacao).toBe('349');
      expect(v0.valorBruto).toBe(23.03);
      expect(v0.cartaoMascarado).toBe('627416******2016');
      expect(v0.dataHoraVenda).toBe('2026-08-01T11:56:13');
      expect(v0.bandeiraBruta).toBe('VR Refeição');

      const total = result.vendas.reduce((acc, v) => acc + v.valorBruto, 0);
      expect(Math.round(total * 100) / 100).toBe(4449.00);
    });
  });

  describe('Guias de Reembolso / Recebíveis (XLS)', () => {
    it('deve extrair as guias de reembolso com valor bruto, taxas e repasse líquido', () => {
      const wb = XLSX.readFile(REFUND_XLS_PATH);
      const ws = wb.Sheets[wb.SheetNames[0]!];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws!, { header: 1, defval: '' });

      const result = parseVrRecebiveisRows(rows, 'extrato_reembolsos_vr.xls');

      expect(result.gateway).toBe('VR');
      expect(result.recebiveis.length).toBe(17);

      const r0 = result.recebiveis[0]!;
      expect(r0.nsu).toBe('732453164');
      expect(r0.autorizacao).toBe('732453164');
      expect(r0.dataVenda).toBe('2026-09-13'); // Data do corte
      expect(r0.dataVencimento).toBe('2026-09-28'); // Data prevista de pagamento
      expect(r0.valorVenda).toBe(3.60);
      expect(r0.valorLiquido).toBe(3.47);
      expect(r0.descontos).toBe(-0.13);

      // Soma das guias
      const totalBruto = result.recebiveis.reduce((acc: number, r: any) => acc + r.valorVenda, 0);
      const totalLiq = result.recebiveis.reduce((acc: number, r: any) => acc + r.valorLiquido, 0);
      expect(Math.round(totalBruto * 100) / 100).toBe(2156.24);
      expect(Math.round(totalLiq * 100) / 100).toBe(2009.15);
    });
  });

  describe('Guias de Reembolso (EDI / TXT)', () => {
    it('deve processar o arquivo de texto de guias da VR', () => {
      const text = fs.readFileSync(REFUND_TXT_PATH, 'latin1');
      const result = parseVrReembolsosEdi(text, 'extrato_reembolsos_vr.txt');

      expect(result.gateway).toBe('VR');
      expect(result.recebiveis.length).toBe(17);

      const r0 = result.recebiveis[0]!;
      expect(r0.nsu).toBe('732453164');
      expect(r0.dataVencimento).toBe('2026-09-28');
      expect(r0.valorVenda).toBe(3.60);
      expect(r0.valorLiquido).toBe(3.47);
      expect(r0.descontos).toBe(-0.13);
    });
  });

  describe('Conciliação VR × SiTef (Fluxo 1)', () => {
    it('deve conciliar perfeitamente venda VR com transação TEF do SiTef via autorização', () => {
      const vendas: VendaInput[] = [
        {
          idempotencyKey: 'VR::61016510000141::000353::2026-08-01',
          nsu: '000353',
          autorizacao: '000353',
          terminal: '',
          valorBruto: 35.91,
          dataHoraVenda: '2026-08-01T20:42:00',
        },
      ];

      const sitefs: SitefInput[] = [
        {
          idempotencyKey: '000353::PDV01::LOJA1::SmartNetVoucher::2026-08-01',
          nsu: '12345',
          nsuHost: '000000000353',
          autorizacao: '000353',
          terminalLogico: 'POS01',
          valor: 35.91,
          dataDia: '2026-08-01',
        },
      ];

      const res = conciliaAdquirenteComSitef(vendas, sitefs);
      expect(res.resumo.conciliados).toBe(1);
      expect(res.vendas[0]!.status).toBe('CONCILIADO');
      expect(res.vendas[0]!.matchVia).toBe('AUTORIZACAO');
    });
  });
});
