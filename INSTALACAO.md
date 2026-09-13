# Guia de Instalação — ThemisFlow

> Pré-requisito: Windows Server com acesso à internet.

---

## 1. Instalar Docker Desktop

1. Baixe em: https://www.docker.com/products/docker-desktop/
2. Execute o instalador e **marque a opção WSL 2** quando solicitado.
3. Reinicie o servidor.
4. Abra o PowerShell e confirme:
   ```powershell
   docker version
   ```

---

## 2. Instalar Portainer

Execute no PowerShell (uma única vez por servidor):

```powershell
# Cria volume para dados do Portainer
docker volume create portainer_data

# Sobe o Portainer
docker run -d `
  --name portainer `
  --restart=always `
  -p 8000:8000 `
  -p 9443:9443 `
  -v /var/run/docker.sock:/var/run/docker.sock `
  -v portainer_data:/data `
  portainer/portainer-ce:latest
```

Acesse: **https://localhost:9443** e crie o usuário admin.

---

## 3. Configurar o DNS do Cliente

No painel de DNS do cliente, adicione um registro **A** apontando para o IP público deste servidor:

| Tipo | Nome | Valor |
|---|---|---|
| A | `themisflow` | `<IP do servidor>` |

Resultado: `themisflow.empresa.com.br` → servidor

> Aguarde até 10 minutos para o DNS propagar.

---

## 4. Subir o Stack Traefik

> O Traefik gerencia HTTPS automaticamente via Let's Encrypt.

1. No Portainer, acesse: **Stacks > Add Stack**
2. Nome: `traefik`
3. Em **Web Editor**, cole o conteúdo de `docker/traefik/docker-compose.yml`
4. Em **Environment Variables**, adicione:

| Variável | Valor |
|---|---|
| `ACME_EMAIL` | e-mail do responsável técnico |
| `DASHBOARD_PASS` | hash bcrypt da senha (gere em https://bcrypt-generator.com) |
| `TRAEFIK_DOMAIN` | domínio base do servidor (ex: `empresa.com.br`) |

5. Clique em **Deploy the stack**

---

## 5. Subir o Stack ThemisFlow

1. No Portainer, acesse: **Stacks > Add Stack**
2. Nome: `themisflow`
3. Em **Web Editor**, cole o conteúdo de `docker-compose.yml`
4. Em **Environment Variables**, adicione:

| Variável | Valor |
|---|---|
| `THEMIS_DOMAIN` | `themisflow.empresa.com.br` |
| `POSTGRES_PASSWORD` | senha forte e única |
| `JWT_SECRET` | execute: `openssl rand -hex 32` |
| `POSTGRES_PORT` | `5432` |
| `ADMIN_EMAIL` | `admin@empresa.com.br` |
| `ADMIN_SENHA` | senha inicial (o usuário deve trocar no primeiro acesso) |

5. Clique em **Deploy the stack**

> O sistema irá automaticamente:
> - Criar o banco de dados
> - Rodar as migrations
> - Criar o usuário administrador
> - Solicitar o certificado HTTPS ao Let's Encrypt

---

## 6. Primeiro Acesso

Acesse: **https://themisflow.empresa.com.br**

Use as credenciais configuradas em `ADMIN_EMAIL` e `ADMIN_SENHA`.

> ⚠️ **Importante:** Troque a senha no primeiro acesso!

---

## Acesso ao Banco de Dados (DBeaver / pgAdmin)

| Campo | Valor |
|---|---|
| Host | IP do servidor |
| Porta | `POSTGRES_PORT` (ex: 5432) |
| Banco | `themisflow` |
| Usuário | `itmizer` |
| Senha | `POSTGRES_PASSWORD` |

---

## Suporte

Em caso de problemas: **suporte@itmizer.com.br**
