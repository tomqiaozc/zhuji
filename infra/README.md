# Zhuji M6 — Azure Deployment

This directory contains the Bicep IaC for `zhuji-prod`. It deploys 2 new
App Service Web Apps (backend + frontend) onto the existing `rg-rewind-ea`
infrastructure, **reusing** the App Service Plan, PostgreSQL Flexible
Server, Key Vault, App Insights, and Storage account that rewind /
feedscope / travel-copilot already pay for.

```
infra/
├── main.bicep                  ← orchestrator (references shared infra)
├── modules/
│   └── appservice.bicep        ← 2 web apps + identities + KV references
└── parameters/
    └── prod.bicepparam         ← prod parameter set
```

## What this template provisions

| Resource                              | Created by Bicep? | Notes                                              |
| ------------------------------------- | ----------------- | -------------------------------------------------- |
| `app-backend-zhuji-prod` (Web App)    | ✅                | DOCKER\| from ghcr.io/tomqiaozc/zhuji/backend     |
| `app-frontend-zhuji-prod` (Web App)   | ✅                | DOCKER\| from ghcr.io/tomqiaozc/zhuji/frontend    |
| KV access policy for 2 new identities | ✅                | `get` + `list` on secrets                          |
| `zhuji-assets` blob container         | ✅                | private, on `stqefxzrxiqz4kw`                      |
| `plan-rwnd-prod`                      | ✗ (reused)        | App Service Plan shared with rewind                |
| `pg-rwnd-prod`                        | ✗ (reused)        | PostgreSQL 16, B1ms Burstable                      |
| `kv-rwnd-prod`                        | ✗ (reused)        | Stores all secrets                                 |
| `ai-rwnd-prod`                        | ✗ (reused)        | App Insights                                       |
| `stqefxzrxiqz4kw`                     | ✗ (reused)        | Storage account; we create the container under it  |

The Bicep template never writes secret VALUES — those must be set by hand
once with `az keyvault secret set` (see owner action checklist below).

## Cost impact

| Item                           | Monthly $ |
| ------------------------------ | --------- |
| 2 new Web Apps on existing B1  | ¥0 (same plan, no extra charge) |
| New blob container             | ¥0 (pay-per-byte; assets are small) |
| Asset storage egress           | ~¥1-5/mo for single-user usage |
| PostgreSQL `zhuji` database    | ¥0 (lives on existing pg-rwnd-prod) |

**Total new spend: < ¥5 / month.** No new App Service Plan, no new
PostgreSQL server, no new Key Vault. Set a $20/mo budget alert on
`rg-rewind-ea` if you don't already have one — that catches both this
deployment and the existing rewind apps.

---

## Owner action checklist (one-time setup)

Run these **once** as the business owner (`tomqiaozc` / personal Azure
account). The agent cannot do these because they require interactive
auth or credentials that must not enter the repo.

### 1. Verify you are in the right Azure context

```bash
az login                  # → personal account 18017822420@163.com
az account set --subscription "Visual Studio Enterprise Subscription"
az account show --query '{name:name, id:id}' -o table
# Expected: id = 8de692bb-7643-4b91-8e39-49b343000dff
```

If you see an MSIT / company subscription here — **stop**. Run
`az account list -o table` and pick the personal one.

### 2. Create the `zhuji` PostgreSQL database

```bash
# Connect to the existing pg-rwnd-prod and create the zhuji DB.
# Reuses the rewindadmin login. Run from a machine whitelisted in the
# Postgres firewall (Azure portal → pg-rwnd-prod → Networking).
psql "host=pg-rwnd-prod.postgres.database.azure.com \
      port=5432 user=rewindadmin sslmode=require dbname=postgres" \
     -c "CREATE DATABASE zhuji;"
```

### 3. Generate + write Key Vault secrets

```bash
KV=kv-rwnd-prod

# JWT — 32+ random hex chars
az keyvault secret set --vault-name $KV --name ZHUJI-JWT-SECRET \
  --value "$(openssl rand -hex 32)"

# Postgres connection string for the backend. Uses asyncpg + the new db.
az keyvault secret set --vault-name $KV --name ZHUJI-DATABASE-URL \
  --value "postgresql+asyncpg://rewindadmin:<PG_PASSWORD>@pg-rwnd-prod.postgres.database.azure.com:5432/zhuji?ssl=require"

# Storage connection string (copy from the existing storage account).
STORAGE_CONN=$(az storage account show-connection-string \
  --resource-group rg-rewind-ea --name stqefxzrxiqz4kw \
  --query connectionString -o tsv)
az keyvault secret set --vault-name $KV --name ZHUJI-STORAGE-CONNECTION-STRING \
  --value "$STORAGE_CONN"

# GHCR pull credentials — create a classic PAT on github.com/tomqiaozc
# with `read:packages` only, never anything else.
az keyvault secret set --vault-name $KV --name ZHUJI-GHCR-USERNAME --value "tomqiaozc"
az keyvault secret set --vault-name $KV --name ZHUJI-GHCR-TOKEN    --value "<ghcr-pat>"
```

### 4. Deploy the Bicep template

```bash
az deployment group create \
  --resource-group rg-rewind-ea \
  --template-file infra/main.bicep \
  --parameters infra/parameters/prod.bicepparam
```

What-if (preview without applying):

```bash
az deployment group what-if \
  --resource-group rg-rewind-ea \
  --template-file infra/main.bicep \
  --parameters infra/parameters/prod.bicepparam
```

### 5. Configure GitHub for the deploy workflow

The workflow lives at `.github/workflows/deploy.yml` and runs on every
push to `main`. It needs:

#### a) `AZURE_CREDENTIALS` secret

Create a Service Principal scoped to `rg-rewind-ea` only:

```bash
az ad sp create-for-rbac --name "zhuji-deploy-sp" \
  --role Contributor \
  --scopes /subscriptions/8de692bb-7643-4b91-8e39-49b343000dff/resourceGroups/rg-rewind-ea \
  --json-auth
```

Paste the resulting JSON into
`GitHub → Settings → Secrets and variables → Actions → New repository secret`
named `AZURE_CREDENTIALS`.

#### b) Workflow variables

`GitHub → Settings → Secrets and variables → Actions → Variables`:

| Variable             | Value                            |
| -------------------- | -------------------------------- |
| `RESOURCE_GROUP`     | `rg-rewind-ea`                   |
| `BACKEND_APP_NAME`   | `app-backend-zhuji-prod`         |
| `FRONTEND_APP_NAME`  | `app-frontend-zhuji-prod`        |

#### c) GHCR image visibility

After the first `Deploy` run pushes images to `ghcr.io/tomqiaozc/zhuji/*`,
either:
- make the packages **public**: `https://github.com/users/tomqiaozc/packages/container/zhuji%2Fbackend → Settings → Change visibility → Public`, OR
- keep them private and rely on the `ZHUJI-GHCR-USERNAME` / `ZHUJI-GHCR-TOKEN` KV
  secrets the App Service uses to pull (already configured in step 3).

### 6. Verify

```bash
# Backend
curl https://app-backend-zhuji-prod.azurewebsites.net/api/health/liveness
# → {"status":"ok"}

# Frontend
open https://app-frontend-zhuji-prod.azurewebsites.net/
# → 登录页应该出现，注册账号 → 加载示例项目 → 验证多设备同步
```

The frontend container reverse-proxies `/api` to the backend hostname
that Bicep injects via `BACKEND_URL`, so the SPA's `fetch('/api/...')`
calls hit the backend without any extra config.

---

## Local recovery for a misconfigured deploy

- **Migrations failed**: the backend `entrypoint.sh` logs migration
  output then starts anyway. Inspect logs:
  `az webapp log tail --resource-group rg-rewind-ea --name app-backend-zhuji-prod`.
- **App Service can't pull from ghcr**: the most common cause is a
  rotated/missing GHCR PAT. Re-run step 3 (`ZHUJI-GHCR-TOKEN`), then
  `az webapp restart -g rg-rewind-ea -n app-backend-zhuji-prod`.
- **Stuck on an old image**: pin `backendImage`/`frontendImage` in
  `prod.bicepparam` to a specific SHA and redeploy.
