import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prismaPlugin from '../src/plugins/prisma.js';
import duckdbPlugin from '../src/plugins/duckdb.js';
import authPlugin from '../src/plugins/auth.js';
import adquirenteRoutes from '../src/routes/adquirente.js';
import { parseVrVendasEdi, parseVrReembolsosEdi } from '@themisflow/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SALES_TXT_PATH = path.resolve(__dirname, '../../../docs/vr/vr/extracted_sales/extratos/extrato_vendas_vr_2026-08-01_a_2026-09-15.txt');
const REFUND_TXT_PATH = path.resolve(__dirname, '../../../docs/vr/vr/extracted_refund/extratos/extrato_reembolsos_vr_undefined_a_undefined.txt');

describe('Fluxo Completo de Vendas VR, Projeção de Taxas e Auditoria de Guias', () => {
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

    // Obtém usuário admin do banco para autenticação
    const adminUser = await app.prisma.user.findFirst({ where: { email: 'admin@itmizer.com.br' } });
    assert.ok(adminUser, 'Admin user deve existir');

    token = app.jwt.sign({ id: adminUser.id, email: adminUser.email, nome: adminUser.nome, role: 'admin' });
  });

  after(async () => {
    await app.close();
  });

  it('1. Deve importar Vendas VR brutas e projetar automaticamente taxa MDR e data de liquidação', async () => {
    const text = fs.readFileSync(SALES_TXT_PATH, 'latin1');
    const parsed = parseVrVendasEdi(text, 'extrato_vendas_vr.txt');

    assert.equal(parsed.vendas.length, 110, 'Deve conter 110 vendas brutas');
    // No parser original da VR, a taxa é 0
    assert.equal(parsed.vendas[0]!.valorTaxa, 0);

    const datas = parsed.vendas.map(v => v.dataHoraVenda.slice(0, 10)).sort();
    const dataInicio = datas[0]!;
    const dataFim = datas[datas.length - 1]!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/adquirente/lotes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        arquivo: 'extrato_vendas_vr.txt',
        gateway: 'VR',
        tipo: 'VENDAS',
        dataInicio,
        dataFim,
        vendas: parsed.vendas,
      },
    });

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.success, true);
    assert.ok(body.adicionadas > 0 || body.atualizadas > 0);

    // Consulta no banco uma venda importada para conferir a taxa projetada
    const vendaDb = await app.prisma.adquirenteVenda.findFirst({
      where: { gateway: 'VR', nsu: '349' },
    });
    assert.ok(vendaDb, 'Venda 349 deve existir no banco');
    assert.equal(Number(vendaDb.valorBruto), 23.03);

    // Taxa contratada de 3,50% sobre 23.03: 23.03 * 0.035 = 0.81 (arredondado)
    assert.ok(Number(vendaDb.valorTaxa) < 0, 'Taxa projetada deve ser negativa');
    assert.equal(Number(vendaDb.valorTaxa), -0.81);
    assert.equal(Number(vendaDb.valorLiquido), 22.22);
    assert.ok(vendaDb.dataPrimeiroPgto, 'Data prevista de pagamento deve ser calculada (D+15)');
  });

  it('2. Deve importar Guias de Reembolso VR (Recebíveis) com taxas e repasses reais', async () => {
    const text = fs.readFileSync(REFUND_TXT_PATH, 'latin1');
    const parsed = parseVrReembolsosEdi(text, 'extrato_reembolsos_vr.txt');

    assert.equal(parsed.recebiveis.length, 17, 'Deve conter 17 guias de reembolso');

    const datas = parsed.recebiveis.map((r: any) => r.dataVencimento).sort();
    const dataInicio = datas[0]!;
    const dataFim = datas[datas.length - 1]!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/adquirente/lotes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        arquivo: 'extrato_reembolsos_vr.txt',
        gateway: 'VR',
        tipo: 'RECEBIVEIS',
        dataInicio,
        dataFim,
        recebiveis: parsed.recebiveis,
      },
    });

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.success, true);

    // Consulta a primeira guia no banco
    const guiaDb = await app.prisma.adquirenteRecebivel.findFirst({
      where: { gateway: 'VR', autorizacao: '732453164' },
    });
    assert.ok(guiaDb, 'Guia 732453164 deve existir no banco');
    assert.equal(Number(guiaDb.valorVenda), 3.60);
    assert.equal(Number(guiaDb.descontos), -0.13);
    assert.equal(Number(guiaDb.valorLiquido), 3.47);
  });

  it('3. Deve consultar KPI e auditoria de taxas das Guias de Reembolso VR com confronto contratual', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/adquirente/kpi?gateway=VR',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    assert.ok(body.taxasEfetivas.length > 0, 'Deve conter taxas efetivas das vendas');

    // Taxa contratada de 3.50% deve ter sido vinculada
    const taxaVenda = body.taxasEfetivas[0]!;
    assert.equal(taxaVenda.taxaMdrContratada, 3.50);

    // Auditoria de Guias de Reembolso
    assert.ok(body.auditoriaGuias && body.auditoriaGuias.length > 0, 'Deve conter auditoriaGuias');
    const guiaAudit = body.auditoriaGuias[0]!;
    assert.ok(guiaAudit.totalBruto > 0);
    assert.ok(guiaAudit.totalTaxa > 0);
    assert.ok(guiaAudit.taxaEfetivaPct > 0);
    assert.equal(guiaAudit.taxaMdrContratada, 3.50);
    assert.ok(guiaAudit.divergenciaPct !== null);
  });

  it('4. Deve vincular venda VR à Guia de Reembolso de lote via /vendas/:key/pagamento', async () => {
    const vendaDb = await app.prisma.adquirenteVenda.findFirst({
      where: { gateway: 'VR' },
      orderBy: { dataHoraVenda: 'desc' },
    });
    assert.ok(vendaDb, 'Venda deve existir');

    const res = await app.inject({
      method: 'GET',
      url: `/api/adquirente/vendas/${encodeURIComponent(vendaDb.idempotencyKey)}/pagamento`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    assert.equal(body.isGuiaLote, true, 'isGuiaLote deve ser true para venda VR vinculada em lote');
    assert.ok(body.recebiveis.length > 0, 'Deve retornar a Guia de Reembolso associada');
    assert.ok(body.recebiveis[0]!.autorizacao, 'Guia de Reembolso deve conter número de autorização');
  });
});
