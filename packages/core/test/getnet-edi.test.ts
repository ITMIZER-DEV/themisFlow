import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseGetnetEdiFile } from '../src/getnet-edi-parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const extratosDir = join(here, '../../../docs/conciliacao/getnet/extratos');

describe('Getnet EDI V10 Parser (@themisflow/core)', () => {
  const file1Path = join(extratosDir, 'getnetextr_20260911_14961495_c103.txt');
  const file2Path = join(extratosDir, 'getnetextr_20260912_14961495_c103.txt');

  it('deve processar com sucesso o arquivo do dia 11/09/2026', () => {
    if (!existsSync(file1Path)) {
      console.warn('Arquivo getnetextr_20260911 não encontrado, pulando...');
      return;
    }

    const content = readFileSync(file1Path, 'latin1');
    const result = parseGetnetEdiFile(content, 'getnetextr_20260911_14961495_c103.txt');

    // 1. Header
    expect(result.header).not.toBeNull();
    expect(result.header?.ec).toBe('14961495');
    expect(result.header?.cnpjAdquirente).toBe('10440482000154');
    expect(result.header?.dataMovimento).toBe('2026-09-11');
    expect(result.header?.versaoLayout).toContain('SANT. V.10.3 400 BYTES');

    // 2. Quantidade de registros
    expect(result.rvs.length).toBe(41);
    expect(result.cvs.length).toBe(405);
    expect(result.cessoes.length).toBe(6);
    expect(result.urs.length).toBe(15);
    expect(result.trailer?.totalRegistros).toBe(469);

    // 3. Auditoria Matemática (RVs x CVs)
    expect(result.auditoria.auditoriaBatida).toBe(true);
    expect(result.auditoria.somaBrutoRVs).toBe(18184.61);
    expect(result.auditoria.somaBrutoCVs).toBe(18184.61);
    expect(result.auditoria.difBruto).toBe(0);
    expect(result.auditoria.somaMdrRVs).toBe(199.03);
    expect(result.auditoria.somaMdrCVs).toBe(199.03);
    expect(result.auditoria.difMdr).toBe(0);

    // 4. Mapeamento para Vendas e Recebíveis
    expect(result.vendas.length).toBe(405);
    expect(result.recebiveis.length).toBe(41);

    const primeiraVenda = result.vendas[0];
    expect(primeiraVenda.gateway).toBe('GETNET');
    expect(primeiraVenda.ec).toBe('14961495');
    expect(primeiraVenda.nsu).toBe('5083570');
    expect(primeiraVenda.autorizacao).toBe('852330');
    expect(primeiraVenda.terminal).toBe('TF111371');
    expect(primeiraVenda.valorBruto).toBe(86.37);
    expect(primeiraVenda.valorTaxa).toBe(-1.11);
    expect(primeiraVenda.valorLiquido).toBe(85.26);
    expect(primeiraVenda.bandeira).toBe('VISA');
    expect(primeiraVenda.modalidade).toBe('CREDITO');

    // Recebíveis Liquidados (LQ)
    const liquidados = result.recebiveis.filter((r) => r.tipoLancamento === 'PAGAMENTO_REALIZADO');
    expect(liquidados.length).toBe(29);
  });

  it('deve processar com sucesso o arquivo do dia 12/09/2026', () => {
    if (!existsSync(file2Path)) {
      console.warn('Arquivo getnetextr_20260912 não encontrado, pulando...');
      return;
    }

    const content = readFileSync(file2Path, 'latin1');
    const result = parseGetnetEdiFile(content, 'getnetextr_20260912_14961495_c103.txt');

    // 1. Header
    expect(result.header).not.toBeNull();
    expect(result.header?.ec).toBe('14961495');
    expect(result.header?.dataMovimento).toBe('2026-09-12');

    // 2. Quantidade de registros
    expect(result.rvs.length).toBe(33);
    expect(result.cvs.length).toBe(329);
    expect(result.trailer?.totalRegistros).toBe(364);

    // 3. Auditoria Matemática (RVs x CVs)
    expect(result.auditoria.auditoriaBatida).toBe(true);
    expect(result.auditoria.somaBrutoRVs).toBe(17180.08);
    expect(result.auditoria.somaBrutoCVs).toBe(17180.08);
    expect(result.auditoria.difBruto).toBe(0);
    expect(result.auditoria.somaMdrRVs).toBe(179.44);
    expect(result.auditoria.somaMdrCVs).toBe(179.44);
    expect(result.auditoria.difMdr).toBe(0);

    // 4. Mapeamento
    expect(result.vendas.length).toBe(329);
    expect(result.recebiveis.length).toBe(33);
  });
});
