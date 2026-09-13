# Guia de Implantação MVP — ThemisFlow no Docker & Portainer

Este guia explica como implantar o **ThemisFlow** do zero no **Docker e Portainer**, de forma rápida, robusta e direta.

---

## 🏛️ Arquitetura do MVP

A implantação MVP roda 3 containers isolados em uma rede interna, sem necessidade inicial de Traefik:

```
                  Navegador do Usuário
                           │
                           ▼ HTTP Porta 80
                ┌─────────────────────┐
                │   themisflow-web    │ (Nginx 1.27 + Vite SPA)
                └──────────┬──────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
       Arquivos React               /api/* (Proxy Reverso)
                                         │
                                         ▼ Porta 3001 (Interna)
                                ┌─────────────────────┐
                                │   themisflow-api    │ (Fastify + Prisma ORM)
                                └──────────┬──────────┘
                                           │
                                           ▼ Porta 5432 (Interna)
                                ┌─────────────────────┐
                                │    themisflow-db    │ (PostgreSQL 16)
                                └─────────────────────┘
                                           │
                                    Volume: pgdata
```

### 🔑 Credenciais Padrão (Primeiro Acesso)
* **URL do Sistema**: `http://<IP-DO-SERVIDOR>`
* **E-mail do Administrador**: `admin@themisflow.local`
* **Senha Inicial**: `ThemisFlow@2026`
* **Banco de Dados**: Porta `5432`, Banco `themisflow`, Usuário `itmizer`, Senha `Th3m1s_DB_2026!`

> ⚠️ **Aviso de Segurança**: No primeiro login, acesse o menu de usuários e altere a senha do administrador.

---

## 🚀 Como Implantar no Portainer / Servidor (Escolha seu Cenário)

---

### Cenário 1: Deploy Rápido via Pacote ZIP (⭐ Recomendado para o Cliente Piloto)
> **Ideal para transferir o projeto pronto para o servidor sem depender de Git ou de Docker local na sua máquina.** O pacote contém todo o código-fonte limpo (~260 KB), manifests, configurações do cliente piloto e scripts de auto-inicialização.

#### Passo 1: Gerar o arquivo ZIP na sua máquina
No PowerShell, dentro da pasta do projeto, execute:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-deploy-zip.ps1
```
*(Ou informe parâmetros customizados: `.\scripts\package-deploy-zip.ps1 -PilotName "Supermercado X" -AdminEmail "admin@cliente.com.br" -AdminSenha "SenhaForte123"`)*

Será gerado o arquivo: **`themisflow-deploy-pilot.zip`** (apenas ~260 KB).

#### Passo 2: Enviar e descompactar no servidor
1. Envie `themisflow-deploy-pilot.zip` para o servidor (via SCP, FileZilla ou rede local):
   ```bash
   scp themisflow-deploy-pilot.zip usuario@ip-servidor:/home/usuario/
   ```
2. No terminal do servidor:
   ```bash
   unzip themisflow-deploy-pilot.zip -d themisflow
   cd themisflow
   ```
3. *(Opcional)* Se desejar ajustar alguma variável antes de subir, edite o arquivo `.env`:
   ```bash
   nano .env
   ```

#### Passo 3: Iniciar a aplicação
Basta executar o script de inicialização:
```bash
chmod +x start-stack.sh && ./start-stack.sh
```
*(Ou, se preferir gerenciar via Portainer UI: vá em **Stacks** → **Add Stack** e use a opção **Local path** ou crie a stack apontando para a pasta `themisflow`).*

O Docker no servidor irá compilar as imagens, aplicar as migrações do PostgreSQL, rodar o seed do **cliente piloto** e disponibilizar a aplicação em:
👉 **`http://<IP-DO-SERVIDOR>`**

---

### Cenário 2: Portainer Web Editor (Imagens Pré-construídas)
> **Alternativa** caso o servidor de produção não tenha acesso à internet para baixar pacotes ou compilar imagens.

#### Passo 1: Construir e exportar as imagens na sua máquina
1. Certifique-se de que o **Docker Desktop** está aberto e rodando no seu computador.
2. No PowerShell, dentro da pasta do projeto, execute:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\build-mvp.ps1
   ```
   *(Ou no Linux/Mac/WSL: `./scripts/build-mvp.sh`)*
3. Quando perguntado, confirme para gerar o arquivo `.tar` das imagens.
4. Será gerado o arquivo: `themisflow-mvp-images.tar`

#### Passo 2: Enviar e carregar no servidor
1. Copie o arquivo `themisflow-mvp-images.tar` para o servidor (via SCP, FileZilla ou rede local).
2. No terminal do servidor onde o Portainer está instalado, execute:
   ```bash
   docker load -i themisflow-mvp-images.tar
   ```
   *Isso carregará as imagens `themisflow-api:mvp` e `themisflow-web:mvp` diretamente no Docker do servidor.*

#### Passo 3: Criar a Stack no Portainer
1. Abra o Portainer (`https://<IP>:9443`).
2. Acesse: **Stacks** → **Add Stack**.
3. **Name**: `themisflow`
4. Selecione a aba **Web editor**.
5. Abra o arquivo [docker-compose.portainer-webeditor.yml](docker-compose.portainer-webeditor.yml) do projeto, copie todo o conteúdo e cole no editor do Portainer.
6. Clique no botão **Deploy the stack**.
7. Aguarde alguns segundos até os 3 containers ficarem com status **healthy** / **running**.

Pronto! O sistema já estará disponível em `http://<IP-DO-SERVIDOR>`.

---

### Cenário 3: Portainer via Repositório Git (Deploy Automático)
> **Recomendado** se você enviou o código do ThemisFlow para um repositório Git (GitHub, GitLab ou Gitea).

1. No Portainer, vá em: **Stacks** → **Add Stack**.
2. **Name**: `themisflow`
3. Selecione a opção **Repository**.
4. Preencha os dados:
   * **Repository URL**: URL do seu repositório Git (ex: `https://github.com/seu-usuario/themisflow.git`)
   * **Repository reference**: `refs/heads/main` (ou sua branch)
   * **Compose path**: `docker-compose.portainer-mvp.yml`
5. *(Se o repositório for privado)*: Ative **Authentication** e informe suas credenciais / token de acesso.
6. Clique em **Deploy the stack**.
7. O Portainer irá clonar o repositório, compilar as imagens e subir os containers automaticamente!

---

### Cenário 3: Testar Localmente no seu Computador
Se você quiser validar e navegar no ThemisFlow completo no Docker antes de enviar para o servidor:

1. Inicie o Docker Desktop.
2. No PowerShell:
   ```powershell
   docker compose -f docker-compose.portainer-mvp.yml up -d --build
   ```
3. Acompanhe os logs da inicialização (migrations + seed):
   ```powershell
   docker logs -f themisflow-api
   ```
4. Assim que aparecer `▶ [ThemisFlow API] Iniciando servidor...`, acesse no navegador:
   **http://localhost**

Para parar a execução local:
```powershell
docker compose -f docker-compose.portainer-mvp.yml down
```

---

## 🛠️ Resolução de Dúvidas e Problemas Frequentes

### 1. "Porta 80 já em uso"
Se a porta 80 já estiver ocupada no servidor por outro serviço (ex: IIS, Apache, Traefik ou Nginx existente):
* No arquivo compose, altere a porta do serviço `web` para outra porta livre, por exemplo:
  ```yaml
  ports:
    - "8080:80"
  ```
* O acesso passará a ser: `http://<IP-DO-SERVIDOR>:8080`

### 2. "Porta 5432 já em uso"
Se já existir outro banco PostgreSQL rodando no servidor na porta 5432 padrão:
* Altere o mapeamento de portas do serviço `db`:
  ```yaml
  ports:
    - "5433:5432"
  ```
  *(A comunicação interna entre API e banco continuará funcionando normalmente através do hostname `db`)*

### 3. Como reiniciar a base de dados do zero?
Se precisar resetar o banco de dados e recriar o seed inicial:
1. No Portainer, pare a stack.
2. Acesse **Volumes** e exclua o volume `themisflow_pgdata`.
3. Inicie a stack novamente. As tabelas e o usuário administrador padrão serão recriados do zero.
