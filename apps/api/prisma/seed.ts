import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ── Permissões ───────────────────────────────────────────────────
  const permissoes = await Promise.all([
    prisma.permission.upsert({ where: { chave: 'conciliacao-bancaria.view' }, update: {}, create: { chave: 'conciliacao-bancaria.view', descricao: 'Acessar módulo de conciliação bancária' } }),
    prisma.permission.upsert({ where: { chave: 'sitef.view' }, update: {}, create: { chave: 'sitef.view', descricao: 'Acessar módulo de conciliação SITEF' } }),
    prisma.permission.upsert({ where: { chave: 'sitef.import' }, update: {}, create: { chave: 'sitef.import', descricao: 'Importar planilhas SITEF' } }),
    prisma.permission.upsert({ where: { chave: 'taxas.view' }, update: {}, create: { chave: 'taxas.view', descricao: 'Acessar contratos de taxas de cartão' } }),
    prisma.permission.upsert({ where: { chave: 'taxas.manage' }, update: {}, create: { chave: 'taxas.manage', descricao: 'Criar e editar contratos de taxas' } }),
    prisma.permission.upsert({ where: { chave: 'adquirente.view' }, update: {}, create: { chave: 'adquirente.view', descricao: 'Acessar conciliação de adquirentes' } }),
    prisma.permission.upsert({ where: { chave: 'adquirente.import' }, update: {}, create: { chave: 'adquirente.import', descricao: 'Importar planilhas de adquirente' } }),
    prisma.permission.upsert({ where: { chave: 'ofx-padroes.view' }, update: {}, create: { chave: 'ofx-padroes.view', descricao: 'Visualizar biblioteca de padrões OFX' } }),
    prisma.permission.upsert({ where: { chave: 'ofx-padroes.manage' }, update: {}, create: { chave: 'ofx-padroes.manage', descricao: 'Gerenciar padrões OFX (criar, editar, excluir)' } }),
    prisma.permission.upsert({ where: { chave: 'admin.config' }, update: {}, create: { chave: 'admin.config', descricao: 'Acessar configurações administrativas' } }),
    prisma.permission.upsert({ where: { chave: 'admin.usuarios' }, update: {}, create: { chave: 'admin.usuarios', descricao: 'Gerenciar usuários' } }),
    prisma.permission.upsert({ where: { chave: 'admin.papeis' }, update: {}, create: { chave: 'admin.papeis', descricao: 'Gerenciar papéis e permissões' } }),
    prisma.permission.upsert({ where: { chave: 'admin.menu' }, update: {}, create: { chave: 'admin.menu', descricao: 'Configurar menu por papel' } }),
  ]);

  // ── Papéis ───────────────────────────────────────────────────────
  const roleAdmin = await prisma.role.upsert({
    where: { slug: 'admin' },
    update: {},
    create: { nome: 'Administrador', slug: 'admin', descricao: 'Acesso total ao sistema' },
  });
  const roleOperador = await prisma.role.upsert({
    where: { slug: 'operador' },
    update: {},
    create: { nome: 'Operador', slug: 'operador', descricao: 'Acesso ao módulo financeiro' },
  });

  // Admin: todas as permissões
  for (const p of permissoes) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: roleAdmin.id, permissionId: p.id } },
      update: {},
      create: { roleId: roleAdmin.id, permissionId: p.id },
    });
  }

  // Operador: conciliação bancária + SITEF
  const permConcil      = permissoes.find(p => p.chave === 'conciliacao-bancaria.view')!;
  const permSitef       = permissoes.find(p => p.chave === 'sitef.view')!;
  const permSitefImport = permissoes.find(p => p.chave === 'sitef.import')!;

  for (const perm of [permConcil, permSitef, permSitefImport]) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: roleOperador.id, permissionId: perm.id } },
      update: {},
      create: { roleId: roleOperador.id, permissionId: perm.id },
    });
  }

  // ── Menu items ───────────────────────────────────────────────────
  const menuConcil = await prisma.menuItem.upsert({
    where: { chave: 'conciliacao-bancaria' },
    update: {},
    create: { chave: 'conciliacao-bancaria', rotulo: 'Conciliação Bancária', icone: 'bank', rota: '/conciliacao-bancaria', permissao: 'conciliacao-bancaria.view', ordem: 1 },
  });

  const menuSitef = await prisma.menuItem.upsert({
    where: { chave: 'sitef' },
    update: {},
    create: { chave: 'sitef', rotulo: 'SITEF', icone: 'terminal', rota: '/sitef', permissao: 'sitef.view', ordem: 2 },
  });

  const menuTaxas = await prisma.menuItem.upsert({
    where: { chave: 'taxas' },
    update: {},
    create: { chave: 'taxas', rotulo: 'Taxas de Cartão', icone: 'percent', rota: '/taxas', permissao: 'taxas.view', ordem: 3 },
  });

  const menuAdquirente = await prisma.menuItem.upsert({
    where: { chave: 'adquirente' },
    update: {},
    create: { chave: 'adquirente', rotulo: 'Adquirentes', icone: 'credit-card', rota: '/adquirente', permissao: 'adquirente.view', ordem: 4 },
  });

  const menuConcOFX = await prisma.menuItem.upsert({
    where: { chave: 'conc-ofx' },
    update: {},
    create: { chave: 'conc-ofx', rotulo: 'Conc. OFX × Adquirente', icone: 'git-merge', rota: '/conc-ofx', permissao: 'adquirente.view', ordem: 5 },
  });

  const menuOfxPadroes = await prisma.menuItem.upsert({
    where: { chave: 'ofx-padroes' },
    update: {},
    create: { chave: 'ofx-padroes', rotulo: 'Padrões OFX', icone: 'book', rota: '/ofx-padroes', permissao: 'ofx-padroes.manage', ordem: 5 },
  });

  const menuAdmin = await prisma.menuItem.upsert({
    where: { chave: 'admin' },
    update: {},
    create: { chave: 'admin', rotulo: 'Administração', icone: 'settings', rota: '/admin', permissao: 'admin.config', ordem: 99 },
  });

  const subMenuItems = [
    { chave: 'admin.empresa',  rotulo: 'Empresa',           rota: '/admin/empresa',  permissao: 'admin.config',   ordem: 0 },
    { chave: 'admin.sftp',     rotulo: 'SFTP & Agendador',  rota: '/admin/sftp',     permissao: 'admin.config',   ordem: 1 },
    { chave: 'admin.usuarios', rotulo: 'Usuários',          rota: '/admin/usuarios', permissao: 'admin.usuarios', ordem: 2 },
    { chave: 'admin.papeis',   rotulo: 'Papéis',            rota: '/admin/papeis',   permissao: 'admin.papeis',   ordem: 3 },
    { chave: 'admin.menu',     rotulo: 'Menu',              rota: '/admin/menu',     permissao: 'admin.menu',     ordem: 4 },
  ];

  for (const sub of subMenuItems) {
    await prisma.menuItem.upsert({
      where: { chave: sub.chave },
      update: {},
      create: { ...sub, parentId: menuAdmin.id },
    });
  }

  // ── Associar menu aos papéis ─────────────────────────────────────
  // Admin vê tudo
  const todosMenus = await prisma.menuItem.findMany();
  for (const m of todosMenus) {
    await prisma.roleMenuItem.upsert({
      where: { roleId_menuItemId: { roleId: roleAdmin.id, menuItemId: m.id } },
      update: {},
      create: { roleId: roleAdmin.id, menuItemId: m.id },
    });
  }
  // Admin vê taxas também
  // (já incluído no loop "todosMenus" acima)

  // Operador vê conciliação bancária, SITEF, Taxas, Adquirentes, Conc. OFX e Padrões OFX
  for (const m of [menuConcil, menuSitef, menuTaxas, menuAdquirente, menuConcOFX, menuOfxPadroes]) {
    await prisma.roleMenuItem.upsert({
      where: { roleId_menuItemId: { roleId: roleOperador.id, menuItemId: m.id } },
      update: {},
      create: { roleId: roleOperador.id, menuItemId: m.id },
    });
  }

  // ── Usuário admin do Cliente Piloto ──────────────────────────────
  const pilotName     = process.env.PILOT_CLIENT_NAME ?? 'Cliente Piloto';
  const adminNome     = process.env.ADMIN_NOME ?? `Administrador (${pilotName})`;
  const adminEmail    = process.env.ADMIN_EMAIL ?? 'admin@itmizer.com.br';
  const adminSenha    = process.env.ADMIN_SENHA ?? 'admin123';
  const hashAdmin     = await bcrypt.hash(adminSenha, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { nome: adminNome },
    create: { nome: adminNome, email: adminEmail, senha: hashAdmin },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: roleAdmin.id } },
    update: {},
    create: { userId: adminUser.id, roleId: roleAdmin.id },
  });

  // ── Usuário operador do Cliente Piloto ───────────────────────────
  const operadorEmail = process.env.OPERADOR_EMAIL ?? 'operador@itmizer.com.br';
  const operadorSenha = process.env.OPERADOR_SENHA ?? 'operador123';
  const operadorNome  = process.env.OPERADOR_NOME ?? `Operador Financeiro (${pilotName})`;
  const hashOperador  = await bcrypt.hash(operadorSenha, 12);

  const operadorUser = await prisma.user.upsert({
    where: { email: operadorEmail },
    update: { nome: operadorNome },
    create: { nome: operadorNome, email: operadorEmail, senha: hashOperador },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: operadorUser.id, roleId: roleOperador.id } },
    update: {},
    create: { userId: operadorUser.id, roleId: roleOperador.id },
  });

  // ── Contrato Inicial de Taxas (Piloto Getnet / Adquirente) ────────
  const nomeContrato = `Contrato Piloto Getnet — ${pilotName}`;
  const contratoExiste = await prisma.taxaContrato.findFirst({
    where: { rede: 'GETNET', ativo: true },
  });

  if (!contratoExiste) {
    const novoContrato = await prisma.taxaContrato.create({
      data: {
        nome: nomeContrato,
        rede: 'GETNET',
        dataInicio: new Date('2026-01-01'),
        ativo: true,
        observacoes: `Contrato inicial gerado para o cliente piloto ${pilotName}. Ajuste as taxas na interface se necessário.`,
        criadoPor: adminUser.id,
      },
    });

    const itensBase = [
      // Débito
      { tipoPagamento: 'DEBITO', bandeira: 'VISA',   modalidade: 'A_VISTA', taxaMdr: 1.15, prazoRecebimento: 1 },
      { tipoPagamento: 'DEBITO', bandeira: 'MASTER', modalidade: 'A_VISTA', taxaMdr: 1.15, prazoRecebimento: 1 },
      { tipoPagamento: 'DEBITO', bandeira: 'ELO',    modalidade: 'A_VISTA', taxaMdr: 1.30, prazoRecebimento: 1 },
      // Crédito à vista
      { tipoPagamento: 'CREDITO', bandeira: 'VISA',   modalidade: 'A_VISTA', taxaMdr: 2.10, prazoRecebimento: 30 },
      { tipoPagamento: 'CREDITO', bandeira: 'MASTER', modalidade: 'A_VISTA', taxaMdr: 2.10, prazoRecebimento: 30 },
      { tipoPagamento: 'CREDITO', bandeira: 'ELO',    modalidade: 'A_VISTA', taxaMdr: 2.30, prazoRecebimento: 30 },
      // Crédito parcelado 2-6x
      { tipoPagamento: 'CREDITO', bandeira: 'VISA',   modalidade: 'PARCELADO_LOJA', parcelaMin: 2, parcelaMax: 6, taxaMdr: 2.80, prazoRecebimento: 30 },
      { tipoPagamento: 'CREDITO', bandeira: 'MASTER', modalidade: 'PARCELADO_LOJA', parcelaMin: 2, parcelaMax: 6, taxaMdr: 2.80, prazoRecebimento: 30 },
      { tipoPagamento: 'CREDITO', bandeira: 'ELO',    modalidade: 'PARCELADO_LOJA', parcelaMin: 2, parcelaMax: 6, taxaMdr: 3.10, prazoRecebimento: 30 },
      // Voucher
      { tipoPagamento: 'VOUCHER', bandeira: 'ALELO',  modalidade: 'A_VISTA', taxaMdr: 3.50, prazoRecebimento: 30 },
      { tipoPagamento: 'VOUCHER', bandeira: 'SODEXO', modalidade: 'A_VISTA', taxaMdr: 3.50, prazoRecebimento: 30 },
      { tipoPagamento: 'VOUCHER', bandeira: 'TICKET', modalidade: 'A_VISTA', taxaMdr: 3.50, prazoRecebimento: 30 },
    ];

    for (const item of itensBase) {
      await prisma.taxaItem.create({
        data: {
          contratoId: novoContrato.id,
          tipoPagamento: item.tipoPagamento,
          bandeira: item.bandeira,
          modalidade: item.modalidade,
          parcelaMin: item.parcelaMin ?? 1,
          parcelaMax: item.parcelaMax ?? 1,
          taxaMdr: item.taxaMdr,
          prazoRecebimento: item.prazoRecebimento,
        },
      });
    }
  }

  // ── Configuração Inicial da Empresa Piloto ───────────────────────
  await prisma.empresaConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      razaoSocial: `${pilotName} LTDA`,
      nomeFantasia: pilotName,
      cnpj: process.env.PILOT_CLIENT_CNPJ ?? '',
      email: adminEmail,
      erpTipo: 'POSTGRESQL',
      erpPorta: 5432,
      erpAtivo: false,
    },
  });

  // ── Padrões OFX padrão (biblioteca inicial) ──────────────────────
  const padroesSeed = [
    // PIX — mais específico tem prioridade maior
    { texto: 'PIX RECEBIDO',      tipo: 'PIX',           bandeira: null, banco: null, prioridade: 8 },
    { texto: 'RECEBIMENTO PIX',   tipo: 'PIX',           bandeira: null, banco: null, prioridade: 8 },
    { texto: 'PIX CREDITO',       tipo: 'PIX',           bandeira: null, banco: null, prioridade: 7 },
    { texto: 'CREDITO PIX',       tipo: 'PIX',           bandeira: null, banco: null, prioridade: 7 },
    { texto: 'PIX',               tipo: 'PIX',           bandeira: null, banco: null, prioridade: 0 },

    // Adquirentes / liquidação de cartão
    { texto: 'GETNET',            tipo: 'CARTAO',        bandeira: null, banco: null, prioridade: 5 },
    { texto: 'CIELO',             tipo: 'CARTAO',        bandeira: null, banco: null, prioridade: 5 },
    { texto: 'STONE',             tipo: 'CARTAO',        bandeira: null, banco: null, prioridade: 5 },
    { texto: 'PAGSEGURO',         tipo: 'CARTAO',        bandeira: null, banco: null, prioridade: 5 },
    { texto: 'REDE ADQUIRENTE',   tipo: 'CARTAO',        bandeira: null, banco: null, prioridade: 6 },
    { texto: 'LIQUIDACAO ADQUIRENTE', tipo: 'CARTAO',   bandeira: null, banco: null, prioridade: 8 },
    { texto: 'CREDITO ADQUIRENTE',    tipo: 'CARTAO',   bandeira: null, banco: null, prioridade: 8 },

    // Transferências
    { texto: 'TED',               tipo: 'TRANSFERENCIA', bandeira: null, banco: null, prioridade: 5 },
    { texto: 'DOC',               tipo: 'TRANSFERENCIA', bandeira: null, banco: null, prioridade: 5 },
    { texto: 'TEV',               tipo: 'TRANSFERENCIA', bandeira: null, banco: null, prioridade: 5 },

    // Tarifas / encargos
    { texto: 'TARIFA',            tipo: 'TARIFA',        bandeira: null, banco: null, prioridade: 5 },
    { texto: 'MANUTENCAO',        tipo: 'TARIFA',        bandeira: null, banco: null, prioridade: 5 },
    { texto: 'IOF',               tipo: 'TARIFA',        bandeira: null, banco: null, prioridade: 7 },
    { texto: 'CPMF',              tipo: 'TARIFA',        bandeira: null, banco: null, prioridade: 7 },

    // Ignorar — saldos e aberturas de período
    { texto: 'SALDO ANTERIOR',    tipo: 'IGNORAR',       bandeira: null, banco: null, prioridade: 10 },
    { texto: 'SALDO INICIAL',     tipo: 'IGNORAR',       bandeira: null, banco: null, prioridade: 10 },
  ] as const;

  for (const p of padroesSeed) {
    const existe = await prisma.ofxPadrao.findFirst({
      where: { texto: p.texto, banco: p.banco },
    });
    if (!existe) {
      await prisma.ofxPadrao.create({ data: { ...p, origem: 'MANUAL' } });
    }
  }

  console.log(`✓ Seed concluído para: ${pilotName}`);
  console.log(`  - Admin:    ${adminEmail}`);
  console.log(`  - Operador: ${operadorEmail}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
