import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as xlsxModule from 'xlsx';
const XLSX: any = (xlsxModule as any).default || xlsxModule;
import prismaPlugin from '../src/plugins/prisma.js';
import duckdbPlugin from '../src/plugins/duckdb.js';
import authPlugin from '../src/plugins/auth.js';
import adquirenteRoutes from '../src/routes/adquirente.js';
import {
  parsePluxeePgtosRows,
  parseAleloRecebimentosRows,
  parseAleloOutrasRows,
} from '@themisflow/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUXEE_PGTOS_XLSX = path.resolve(__dirname, '../../../docs/conciliacao/pluxee/pluxee/extrato_pgtos_30_09_2026 (3).xlsx');
const ALELO_RECEB_XLSX   = path.resolve(__dirname, '../../../docs/conciliacao/alelo/alelo/Recebimentos_Alelo_31_07_2026_29_08_2026.xlsx');

describe('Fluxo Completo Pluxee & Alelo — Contratos, Taxas Efetivas e Encargos', () => {
  let app: FastifyInstance;
  let token: string;

  before(async () => {
    app = Fastify({ logger: false });
    await app.register(fastifyCookie);
    await app.register(fastifyJwt, { secret: 'test-secret-1234567890123456789012' });
    await app.register(prismaPlugin);
    await app.register(duckdbPlugin);
    await app.register(authPlugin);
    await app.register(adquirenteRoutes, { prefix: '/api/adquirente' });
    await app.ready();

    const adminUser = await app.prisma.user.findFirst({ where: { email: 'admin@itmizer.com.br' } });
    assert.ok(adminUser, 'Admin user deve existir');

    token = app.jwt.sign({ id: adminUser.id, email: adminUser.email, nome: adminUser.nome, role: 'admin' });
  });

  after(async () => {
    await app.close();
  });

  it('1. Deve projetar taxas em vendas brutas Pluxee diferenciando PAT (3,60%) e Auxílio (6,90%)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/adquirente/lotes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        arquivo: 'teste_vendas_pluxee.xlsx',
        gateway: 'PLUXEE',
        tipo: 'VENDAS',
        dataInicio: '2026-09-01',
        dataFim: '2026-09-30',
        vendas: [
          {
            idempotencyKey: 'PLUXEE::001::PLUX001::2026-09-10',
            gateway: 'PLUXEE',
            ec: '001',
            cnpj: '00000000000191',
            bandeira: 'PLUXEE',
            bandeiraBruta: 'ALIMENTACAO PAT',
            modalidade: 'VOUCHER',
            formaPagamento: 'Pluxee Alimentação',
            dataHoraVenda: '2026-09-10 12:00:00',
            status: 'APROVADA',
            parcelas: 1,
            cartaoMascarado: '************1234',
            autorizacao: 'AUT001',
            nsu: 'PLUX001',
            terminal: '0001',
            meioCaptura: 'TEF',
            valorBruto: 100.00,
            valorTaxa: 0,
            valorLiquido: 100.00,
          },
          {
            idempotencyKey: 'PLUXEE::001::PLUX002::2026-09-10',
            gateway: 'PLUXEE',
            ec: '001',
            cnpj: '00000000000191',
            bandeira: 'PLUXEE',
            bandeiraBruta: 'AUXILIO ALIMENTACAO',
            modalidade: 'VOUCHER',
            formaPagamento: 'Pluxee Auxílio',
            dataHoraVenda: '2026-09-10 12:30:00',
            status: 'APROVADA',
            parcelas: 1,
            cartaoMascarado: '************5678',
            autorizacao: 'AUT002',
            nsu: 'PLUX002',
            terminal: '0001',
            meioCaptura: 'TEF',
            valorBruto: 100.00,
            valorTaxa: 0,
            valorLiquido: 100.00,
          },
        ],
      },
    });

    assert.equal(res.statusCode, 201);

    const vPat = await app.prisma.adquirenteVenda.findFirst({ where: { gateway: 'PLUXEE', nsu: 'PLUX001' } });
    const vAux = await app.prisma.adquirenteVenda.findFirst({ where: { gateway: 'PLUXEE', nsu: 'PLUX002' } });

    assert.ok(vPat && vAux);
    // PAT: 3,60% -> -3,60, líquido 96,40
    assert.equal(Number(vPat.valorTaxa), -3.60);
    assert.equal(Number(vPat.valorLiquido), 96.40);

    // Auxílio: 6,90% -> -6,90, líquido 93,10
    assert.equal(Number(vAux.valorTaxa), -6.90);
    assert.equal(Number(vAux.valorLiquido), 93.10);
  });

  it('2. Deve importar pagamentos Pluxee com distribuição de taxas por produto e taxa encargo de Gestão', async () => {
    if (!fs.existsSync(PLUXEE_PGTOS_XLSX)) return;
    const buf = fs.readFileSync(PLUXEE_PGTOS_XLSX);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]!];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws!, { header: 1, defval: '' });

    const parsed = parsePluxeePgtosRows(rows, 'extrato_pgtos_pluxee.xlsx');
    assert.equal(parsed.recebiveis.length, 140);

    const datas = parsed.recebiveis.map(r => r.dataVencimento).sort();
    const dataInicio = datas[0]!;
    const dataFim = datas[datas.length - 1]!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/adquirente/lotes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        arquivo: 'extrato_pgtos_pluxee.xlsx',
        gateway: 'PLUXEE',
        tipo: 'RECEBIVEIS',
        dataInicio,
        dataFim,
        recebiveis: parsed.recebiveis,
      },
    });

    assert.equal(res.statusCode, 201);

    // Consulta KPI do Pluxee
    const kpiRes = await app.inject({
      method: 'GET',
      url: '/api/adquirente/kpi?gateway=PLUXEE',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(kpiRes.statusCode, 200);
    const kpi = kpiRes.json();
    assert.ok(kpi.auditoriaGuias && kpi.auditoriaGuias.length > 0);

    // Verifica encargos contratados
    assert.ok(kpi.encargosContratados && kpi.encargosContratados.length > 0);
    const encargoGestao = kpi.encargosContratados.find((e: any) => e.descricao.includes('Gestão de Pagamentos'));
    assert.ok(encargoGestao, 'Deve encontrar encargo Gestão de Pagamentos');
    assert.equal(encargoGestao.valor, 5.99);

    // Verifica que auditoriaGuias tem linhas com cálculo de taxa efetiva e contratada
    const guiaPat = kpi.auditoriaGuias.find((g: any) => g.lancamento?.includes('PAT'));
    assert.ok(guiaPat, 'Auditoria deve ter linha PAT');
    assert.equal(guiaPat.taxaMdrContratada, 3.60);
    assert.equal(Math.round(guiaPat.taxaEfetivaPct * 100) / 100, 3.60);

    const guiaAux = kpi.auditoriaGuias.find((g: any) => g.lancamento?.includes('AUXILIO'));
    assert.ok(guiaAux, 'Auditoria deve ter linha Auxílio');
    assert.equal(guiaAux.taxaMdrContratada, 6.90);
    assert.equal(Math.round(guiaAux.taxaEfetivaPct * 100) / 100, 6.90);
  });

  it('3. Deve importar Recebimentos e Outras Transações Alelo e confrontar contra contrato Alelo', async () => {
    if (!fs.existsSync(ALELO_RECEB_XLSX)) return;
    const buf = fs.readFileSync(ALELO_RECEB_XLSX);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const wsRec = wb.Sheets['Recebimentos'];
    assert.ok(wsRec, 'Aba Recebimentos deve existir');
    wsRec['!ref'] = 'A1:O78';
    const rowsRec = XLSX.utils.sheet_to_json<any[]>(wsRec, { header: 1, defval: '' });

    const wsOutras = wb.Sheets['Outras Transações'] || wb.Sheets['Outras transações'];
    assert.ok(wsOutras, 'Aba Outras Transações deve existir');
    wsOutras['!ref'] = 'A1:I15';
    const rowsOutras = XLSX.utils.sheet_to_json<any[]>(wsOutras, { header: 1, defval: '' });

    const parsedReceb = parseAleloRecebimentosRows(rowsRec, 'Recebimentos_Alelo.xlsx');
    const parsedOutras = parseAleloOutrasRows(rowsOutras, 'Recebimentos_Alelo.xlsx');

    const todosRecebiveis = [...parsedReceb.recebiveis, ...parsedOutras.recebiveis];
    assert.ok(todosRecebiveis.length >= 70);

    const datas = todosRecebiveis.map(r => r.dataVencimento).sort();
    const dataInicio = datas[0]!;
    const dataFim = datas[datas.length - 1]!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/adquirente/lotes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        arquivo: 'Recebimentos_Alelo_31_07_2026_29_08_2026.xlsx',
        gateway: 'ALELO',
        tipo: 'RECEBIVEIS',
        dataInicio,
        dataFim,
        recebiveis: todosRecebiveis,
      },
    });

    assert.equal(res.statusCode, 201);

    // Consulta KPI do Alelo
    const kpiRes = await app.inject({
      method: 'GET',
      url: '/api/adquirente/kpi?gateway=ALELO',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(kpiRes.statusCode, 200);
    const kpi = kpiRes.json();
    assert.ok(kpi.encargosContratados && kpi.encargosContratados.length > 0);
    const encargoTor = kpi.encargosContratados.find((e: any) => e.descricao.includes('Tarifa TOR'));
    assert.ok(encargoTor, 'Deve encontrar encargo Tarifa TOR');
    assert.equal(encargoTor.valor, 1.22);

    // Verifica auditoria de guias do Alelo
    assert.ok(kpi.auditoriaGuias && kpi.auditoriaGuias.length > 0);
    const guiaAleloPat = kpi.auditoriaGuias.find((g: any) => g.lancamento?.includes('PAT') || g.bandeira === 'ALELO');
    assert.ok(guiaAleloPat, 'Deve conter guias auditadas Alelo');
  });
});
