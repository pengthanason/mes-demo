# MES Knex Scaffold

Purpose: bootstrap schema migration workflow for Node/MES.

## Setup
1. Install knex cli locally (dev dependency):
```bash
cd mes_backbone
npm install --save-dev knex
```

## Commands
1. Check migration status:
```bash
npx knex --knexfile knexfile.js migrate:status
```
2. Create migration:
```bash
npx knex --knexfile knexfile.js migrate:make describe_change
```
3. Apply migrations:
```bash
npx knex --knexfile knexfile.js migrate:latest
```
4. Roll back one batch:
```bash
npx knex --knexfile knexfile.js migrate:rollback
```

## Notes
1. Baseline placeholder migration is included for N+1 bootstrap.
2. Full conversion from `mes_backbone/schema.sql` is planned in `DBM-02`.
