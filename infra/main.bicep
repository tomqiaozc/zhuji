// ────────────────────────────────────────────────────────────────
// Zhuji M6 — Azure Deploy (root)
//
// Reuses every shared resource in `rg-rewind-ea` that rewind /
// feedscope / travel-copilot already pay for. New cost added by this
// template is ~0 (App Service sites are free on an existing plan; a
// Storage container is free).
//
// What this deploys:
//   • 2 App Service Web Apps (backend + frontend) on plan-rwnd-prod
//     - SystemAssigned managed identities → KV "Get" access
//     - DOCKER pull from ghcr.io/tomqiaozc/zhuji/{backend,frontend}
//     - Standard App Insights + health-probe paths
//   • Key Vault access policies for the two new identities
//   • Storage container "zhuji-assets" (private; backend uses an
//     account connection string from KV to issue blob URLs)
//
// What it does NOT do (intentional, owner action required):
//   • Provision Key Vault SECRETS — they hold real credentials and
//     must be set with `az keyvault secret set ...` once by the
//     owner. See infra/README.md.
//   • Provision the `zhuji` PostgreSQL database on pg-rwnd-prod —
//     owner runs `CREATE DATABASE zhuji;` once. See infra/README.md.
//   • Configure GitHub Actions OIDC / secrets. See infra/README.md.
// ────────────────────────────────────────────────────────────────

targetScope = 'resourceGroup'

@description('Project name used as a prefix for new resource names.')
param projectName string = 'zhuji'

@description('Environment slug (prod by default; only used in resource naming).')
param environment string = 'prod'

@description('Azure region for new resources. Defaults to the resource group location.')
param location string = resourceGroup().location

// ── References to existing rg-rewind-ea infrastructure ─────────

@description('Existing App Service Plan that hosts rewind / feedscope / travel-copilot.')
param appServicePlanName string = 'plan-rwnd-prod'

@description('Existing Key Vault — both apps read secrets via @Microsoft.KeyVault references.')
param keyVaultName string = 'kv-rwnd-prod'

@description('Existing Application Insights resource — same instance the rewind apps log to.')
param appInsightsName string = 'ai-rwnd-prod'

@description('Existing Storage account for blobs (rewind / feedscope already use it).')
param storageAccountName string = 'stqefxzrxiqz4kw'

@description('Blob container created in the existing storage account for zhuji assets.')
param assetsContainerName string = 'zhuji-assets'

// ── Derived names ──────────────────────────────────────────────

var suffix = '${projectName}-${environment}'
var backendAppName = 'app-backend-${suffix}'
var frontendAppName = 'app-frontend-${suffix}'

// Override at deploy time to pin to a specific image SHA.
@description('Backend image (ghcr.io/<owner>/zhuji/backend:<tag>).')
param backendImage string = 'tomqiaozc/zhuji/backend:latest'

@description('Frontend image (ghcr.io/<owner>/zhuji/frontend:<tag>).')
param frontendImage string = 'tomqiaozc/zhuji/frontend:latest'

@description('GHCR pull URL — kept as a parameter so a local registry can be swapped in.')
param dockerRegistryUrl string = 'https://ghcr.io'

// ── Existing resources (referenced, not created) ───────────────

resource plan 'Microsoft.Web/serverfarms@2023-12-01' existing = {
  name: appServicePlanName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

// ── New blob container for zhuji ───────────────────────────────

resource assetsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/${assetsContainerName}'
  properties: {
    publicAccess: 'None'
  }
}

// ── App Service sites ─────────────────────────────────────────

module zhujiSites 'modules/appservice.bicep' = {
  name: 'zhuji-appservice'
  params: {
    location: location
    planId: plan.id
    backendAppName: backendAppName
    frontendAppName: frontendAppName
    backendImage: backendImage
    frontendImage: frontendImage
    dockerRegistryUrl: dockerRegistryUrl
    keyVaultName: keyVaultName
    appInsightsConnectionString: appInsights.properties.ConnectionString
  }
}

// ── Key Vault access policies for the new managed identities ──
//
// "Get" + "List" on secrets — App Service needs both to resolve the
// `@Microsoft.KeyVault(...)` references in its app settings.

resource kvAccess 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: zhujiSites.outputs.backendPrincipalId
        permissions: {
          secrets: [ 'get', 'list' ]
        }
      }
      {
        tenantId: subscription().tenantId
        objectId: zhujiSites.outputs.frontendPrincipalId
        permissions: {
          secrets: [ 'get', 'list' ]
        }
      }
    ]
  }
}

// ── Outputs ──────────────────────────────────────────────────

@description('Backend public hostname.')
output backendHostname string = zhujiSites.outputs.backendHostname

@description('Frontend public hostname.')
output frontendHostname string = zhujiSites.outputs.frontendHostname

@description('Blob container name created for zhuji assets.')
output assetsContainerNameOut string = assetsContainerName
