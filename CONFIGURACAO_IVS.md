# IVS CRM — Configuração de publicação

Projeto Supabase configurado com URL e chave publishable em `.env.production`.

## 1. Usuários e permissões

Em Supabase > Authentication > Users, crie (ou convide) os usuários:
- Administrador
- Gerente
- Alessandra
- Anderson

Depois execute no SQL Editor (substituindo pelos e-mails reais):

```sql
update public.profiles set role='admin', name='Administrador IVS'
where id = (select id from auth.users where email='EMAIL_ADMIN');

update public.profiles set role='gerente', name='Gerente IVS'
where id = (select id from auth.users where email='EMAIL_GERENTE');

update public.profiles set name='Alessandra'
where id = (select id from auth.users where email='EMAIL_ALESSANDRA');

update public.profiles set name='Anderson'
where id = (select id from auth.users where email='EMAIL_ANDERSON');
```

**Não reexecute o schema.sql:** você informou que já executou no projeto. Reexecutar o script completo cria conflitos nas tabelas existentes.

## 2. GitHub e Vercel

1. Crie um repositório privado e envie os arquivos do projeto (exceto `.env.production`, `.env`, arquivos de senhas).
2. Na Vercel, importe o repositório como projeto Vite.
3. Defina o comando de build `npm run build`, e diretório de saída `dist`.
4. Em Settings > Environment Variables, adicione:
   - `VITE_SUPABASE_URL` = URL do seu projeto Supabase
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave publishable do Supabase
5. Publique (Deploy) e copie a URL gerada.
6. No Supabase > Authentication > URL Configuration, configure Site URL e Redirect URLs com a URL publicada.

## 3. Testes antes de usar dados reais

- Login do administrador e do gerente
- Login de cada vendedor
- Lead de Alessandra invisível ao Anderson e vice-versa
- Atualização da mesma carteira em dois computadores
- Registro de contato e agendamento
- Registro de venda, faturamento e relatório de gerente
- Recuperação de senha e redirecionamento
- Conferência de timezone em agendamento
- Política de privacidade, backup, LGPD e retenção

**Estado:** Código preparado/configurado; nenhuma publicação ou teste online de conta foi realizado nesta entrega.
