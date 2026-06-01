using '../main.bicep'

param projectName = 'zhuji'
param environment = 'prod'
param location = 'eastasia'

// Reuse all of rg-rewind-ea's shared infra. Override only if those names
// ever change.
param appServicePlanName = 'plan-rwnd-prod'
param keyVaultName       = 'kv-rwnd-prod'
param appInsightsName    = 'ai-rwnd-prod'
param storageAccountName = 'stqefxzrxiqz4kw'
param assetsContainerName = 'zhuji-assets'

// Pin images to :latest by default — GitHub Actions overrides to the
// commit SHA at deploy time via `az deployment group create --parameters`.
param backendImage  = 'tomqiaozc/zhuji/backend:latest'
param frontendImage = 'tomqiaozc/zhuji/frontend:latest'
