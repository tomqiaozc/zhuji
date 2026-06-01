// ────────────────────────────────────────────────────────────────
// Zhuji App Service module
// Provisions backend + frontend Linux Web Apps on an EXISTING App
// Service Plan and wires every secret through @Microsoft.KeyVault.
// ────────────────────────────────────────────────────────────────

@description('Azure region.')
param location string

@description('Resource ID of the existing App Service Plan (plan-rwnd-prod).')
param planId string

@description('Name of the backend Web App (e.g. app-backend-zhuji-prod).')
param backendAppName string

@description('Name of the frontend Web App (e.g. app-frontend-zhuji-prod).')
param frontendAppName string

@description('Backend Docker image (without registry, e.g. tomqiaozc/zhuji/backend:latest).')
param backendImage string

@description('Frontend Docker image (without registry, e.g. tomqiaozc/zhuji/frontend:latest).')
param frontendImage string

@description('Docker registry URL (https://ghcr.io).')
param dockerRegistryUrl string

@description('Name of the Key Vault holding all secrets (kv-rwnd-prod).')
param keyVaultName string

@description('Application Insights connection string for telemetry.')
param appInsightsConnectionString string

// ── Backend Web App ──────────────────────────────────────────

resource backendApp 'Microsoft.Web/sites@2023-12-01' = {
  name: backendAppName
  location: location
  kind: 'app,linux,container'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: planId
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${backendImage}'
      alwaysOn: true
      healthCheckPath: '/api/health/liveness'
      appSettings: [
        {
          name: 'DOCKER_REGISTRY_SERVER_URL'
          value: dockerRegistryUrl
        }
        // ghcr is a private-by-default registry, so even public images
        // pull faster with credentials. KV-backed so the PAT is not
        // visible in the portal.
        {
          name: 'DOCKER_REGISTRY_SERVER_USERNAME'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=ZHUJI-GHCR-USERNAME)'
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_PASSWORD'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=ZHUJI-GHCR-TOKEN)'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
          value: 'false'
        }
        // App-level secrets (KV references).
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=ZHUJI-DATABASE-URL)'
        }
        {
          name: 'JWT_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=ZHUJI-JWT-SECRET)'
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=ZHUJI-STORAGE-CONNECTION-STRING)'
        }
        {
          name: 'AZURE_STORAGE_CONTAINER_NAME'
          value: 'zhuji-assets'
        }
        // CORS: the frontend lives on its own hostname; allow it.
        {
          name: 'CORS_ORIGINS'
          value: '["https://${frontendAppName}.azurewebsites.net"]'
        }
        {
          name: 'LOG_LEVEL'
          value: 'INFO'
        }
      ]
    }
  }
}

// ── Frontend Web App ─────────────────────────────────────────

resource frontendApp 'Microsoft.Web/sites@2023-12-01' = {
  name: frontendAppName
  location: location
  kind: 'app,linux,container'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: planId
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${frontendImage}'
      alwaysOn: true
      healthCheckPath: '/'
      appSettings: [
        {
          name: 'DOCKER_REGISTRY_SERVER_URL'
          value: dockerRegistryUrl
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_USERNAME'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=ZHUJI-GHCR-USERNAME)'
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_PASSWORD'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=ZHUJI-GHCR-TOKEN)'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
          value: 'false'
        }
        // nginx envsubst targets — proxy /api → backend, listen on 8080
        // (App Service Linux exposes 8080 by default).
        {
          name: 'BACKEND_URL'
          value: 'https://${backendApp.properties.defaultHostName}'
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'WEBSITES_PORT'
          value: '8080'
        }
      ]
    }
  }
}

// ── Outputs ──────────────────────────────────────────────────

@description('Backend hostname (e.g. app-backend-zhuji-prod.azurewebsites.net).')
output backendHostname string = backendApp.properties.defaultHostName

@description('Frontend hostname.')
output frontendHostname string = frontendApp.properties.defaultHostName

@description('Backend managed identity principal ID — used to grant KV access.')
output backendPrincipalId string = backendApp.identity.principalId

@description('Frontend managed identity principal ID — used to grant KV access.')
output frontendPrincipalId string = frontendApp.identity.principalId
