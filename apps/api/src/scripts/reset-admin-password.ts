import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@itmizer.com.br';
  const novaSenha = process.argv[3] || process.env.ADMIN_SENHA || 'ThemisFlow@2026';

  console.log(`\n▶ Redefinindo senha para o usuário: ${email}...`);
  const hash = await bcrypt.hash(novaSenha, 12);

  // Garante existência do papel 'admin'
  const roleAdmin = await prisma.role.upsert({
    where: { slug: 'admin' },
    update: {},
    create: { nome: 'Administrador', slug: 'admin', descricao: 'Acesso total ao sistema' },
  });

  // Atualiza ou cria o usuário com a nova senha
  const user = await prisma.user.upsert({
    where: { email },
    update: { senha: hash, ativo: true },
    create: { nome: 'Administrador', email, senha: hash, ativo: true },
  });

  // Vincula papel de admin
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: roleAdmin.id } },
    update: {},
    create: { userId: user.id, roleId: roleAdmin.id },
  });

  console.log(`✓ Sucesso! O usuário "${email}" agora pode logar com a senha: "${novaSenha}"\n`);
}

main()
  .catch((err) => {
    console.error('✖ Erro ao redefinir senha:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
