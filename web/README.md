# Intendex — site web (Next.js)

Lit uniquement les données **publiées** de Supabase, avec la clé publique (anon / publishable).

## Lancer en local
```bash
cd web
cp .env.example .env.local     # puis coller la clé anon / publishable
npm install
npm run dev                    # → http://localhost:3000
```

Pages : `/` · `/mcp` · `/mcp/[slug]` · `/tasks` · `/tasks/[slug]` · `/capabilities` · `/signals` · `/sources` · `/search?q=`
