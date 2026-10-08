-- =====================================================================
-- Bloqueia leitura anônima da view project_summaries.
--
-- Views no Postgres rodam com as permissões do dono (postgres), ignorando
-- o RLS das tabelas de base. Como o Supabase concede SELECT ao papel
-- `anon` por padrão, qualquer pessoa com a chave pública (que está no
-- js/config.js do site) conseguia ler nome, custo total e meta de todos
-- os projetos sem login:
--   GET /rest/v1/project_summaries?select=*   (só com a anon key)
--
-- O site só consulta a view depois do login (papel `authenticated`),
-- então retirar o acesso do `anon` não muda nada para os usuários.
--
-- Execute uma vez no SQL Editor do Supabase. É idempotente.
-- =====================================================================

revoke all on public.project_summaries from anon;
