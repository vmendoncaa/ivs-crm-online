# IVS CRM Online — primeira versão técnica

Aplicação web em **Vite + JavaScript + Supabase** para o Instituto Visão Solidária — Piracicaba, baseada no layout escuro do protótipo anterior.

## O que já está implementado

- Login e recuperação de senha por e-mail (Supabase Auth).
- Perfis **admin**, **gerente** e **vendedor**.
- Políticas RLS no banco: vendedores veem apenas seus registros; gerentes e administradores veem a loja toda.
- Carteira compartilhada: cadastro e edição, filtros, prioridades e próximas ações.
- Registro de contatos por telefone/WhatsApp, agenda e comparecimento, registro de vendas.
- Dashboard de faturamento mensal e pendências, resumo por funcionário.
- Layout responsivo; sem dados fictícios na instância real.

**Não implementado nesta versão:** integração BR Whats, notificações push, registro de auditoria de mudanças, upload CSV, gerenciamento de contas pela interface, paginação completa para bases grandes, serviço de jobs automáticos e conciliação com SSÓtica. Os números financeiros dependem dos lançamentos de vendas e não substituem o caixa/ERP.

## 1. Criar Supabase

1. Crie uma conta em https://supabase.com e um projeto novo.
2. Vá ao **SQL Editor**, cole e execute `supabase/schema.sql` em projeto vazio.
3. Em **Project Settings → API Keys** copie a URL e a **publishable key** (ou a `anon` legada). **Nunca copie a `service_role` ou secret key para o frontend**.
4. Em **Authentication → Users**, crie os usuários manualmente com e-mail e senha para administrador, gerente, Alessandra e Anderson. Ao criar o usuário, o trigger produz um perfil padrão `vendedor`.
5. No SQL Editor, promova o administrador e o gerente, usando seus e-mails reais:

```sql
update public.profiles set role='admin', name='Administrador IVS'
where id=(select id from auth.users where email='ADMIN@SUAEMPRESA.COM');

update public.profiles set role='gerente', name='Gerente IVS'
where id=(select id from auth.users where email='GERENTE@SUAEMPRESA.COM');

update public.profiles set name='Alessandra'
where id=(select id from auth.users where email='ALESSANDRA@SUAEMPRESA.COM');

update public.profiles set name='Anderson'
where id=(select id from auth.users where email='ANDERSON@SUAEMPRESA.COM');
```

6. Configure `Authentication → URL Configuration` com o endereço de produção em **Site URL** e adicione endereço local (`http://localhost:5173`) a **Redirect URLs** se usar redefinição de senha.
7. Revise política de senhas, MFA (recomendado aos gestores), backup e termos de privacidade antes de alimentar com dados reais de clientes.

## 2. Rodar localmente

Requer Node.js 20.19+ ou 22.12+ (compatível com Vite 7).

```bash
npm install
cp .env.example .env
```

Edite `.env` e preencha:

```env
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable_key>
```

Depois:

```bash
npm run dev
```

Abra http://localhost:5173. Para produção, execute `npm run build`.

## 3. Publicar na Vercel

1. Envie a pasta deste projeto a um repositório privado GitHub.
2. Acesse https://vercel.com, crie um projeto e importe o repositório.
3. Framework Preset: **Vite**; Build Command: `npm run build`; Output Directory: `dist`.
4. Configure em **Environment Variables** as mesmas variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Faça deploy e teste login + permissões com contas reais separadas.
6. Ajuste Site URL e Redirect URLs no Supabase usando a URL publicada e seu domínio customizado, se houver.

`vercel.json` permite rotas SPA no domínio.

## 4. Checklist antes de disponibilizar aos vendedores

- [ ] Criar usuários por convites administrativos e atribuir perfis corretos.
- [ ] Validar RLS: vendedor Alessandra não pode ler/alterar carteira de Anderson, nem listar todos os usuários.
- [ ] Validar que gerente enxerga a loja inteira e vendedor só vê seu faturamento.
- [ ] Garantir base legal, minimização, retenção e gestão de consentimento dos dados (LGPD).
- [ ] Confirmar fuso horário nos agendamentos e padronizar operação para America/Sao_Paulo.
- [ ] Definir rotina de backup e exportação operacional.
- [ ] Configurar monitoramento e domínio HTTPS.

## 5. Integrar BR Whats (próxima etapa)

Solicitar documentação da API/webhook da BR Whats. O fluxo correto é **BR Whats → endpoint server-side autenticado → validação da assinatura/token → upsert de leads no Supabase → atribuição de vendedor**. Nunca colocar tokens privados da BR Whats no JavaScript do navegador. É necessário definir deduplicação por ID externo/telefone normalizado e verificar consentimento antes de disparar novas mensagens.

## Notas importantes

- O sistema é uma **base funcional para implantação**, não está hospedado e não acessa dados reais sem configuração.
- Vendas são lançadas por quem está logado; para uma venda atribuída a outro colaborador, essa regra precisa ser ampliada de forma controlada.
- O relatório do mês considera o limite de registros buscados no navegador nesta versão, não deve ser usado como relatório contábil definitivo.
- A UI apresenta horários agendados em Piracicaba, mas o formulário `datetime-local` usa o fuso local do dispositivo. Configure dispositivos da loja com fuso São Paulo até adaptar o componente de entrada explicitamente.
