# ITMIZER Conciliador Bancário

Apoio à conciliação bancária: Banco (OFX) × Sistema/ERP (XLS).

**Comece por `CLAUDE-kickoff-conciliador.md`.**

```bash
npm install
npm run test:golden   # 6 golden tests do núcleo — devem passar sempre
```

- `reference/` — contrato: v0 funcional (HTML único), núcleo validado e fixtures. Não editar.
- Fase 1: Vite + React + TS, núcleo portado p/ `packages/core`, build single-file offline.
