// To-Do app on Azure Container Apps (web and api) with Azure Database for PostgreSQL Flexible Server.
// Images are pulled from an existing Azure Container Registry in the same resource group.
// Build the ARM template with: az bicep build --file infra/azure/main.bicep --outfile infra/azure/azuredeploy.json

@description('Lowercase prefix for resource names.')
@minLength(2)
@maxLength(10)
param namePrefix string = 'todo'

param location string = resourceGroup().location

@description('Existing Azure Container Registry in this resource group that holds both images.')
param registryName string

@description('API image name and tag in the registry, for example todo-api:1.0.0.')
param apiImage string

@description('Web image name and tag in the registry, for example todo-web:1.0.0.')
param webImage string

@description('Token signing secret: at least 32 random characters, for example from `openssl rand -base64 48`.')
@secure()
@minLength(32)
param jwtSecret string

param postgresAdminLogin string = 'todoadmin'

@secure()
@minLength(12)
param postgresAdminPassword string

@allowed(['16', '17'])
param postgresVersion string = '16'

@description('Burstable tier SKU.')
param postgresSkuName string = 'Standard_B1ms'

@minValue(1)
@maxValue(10)
param apiMaxReplicas int = 3

@minValue(1)
@maxValue(10)
param webMaxReplicas int = 3

@description('Proxies in front of the API: the external ingress, nginx and the API\'s internal ingress.')
param trustProxyHops int = 3

var suffix = uniqueString(resourceGroup().id)
var apiAppName = '${namePrefix}-api'
var webAppName = '${namePrefix}-web'
var databaseName = 'todo'
var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// One identity for both apps, allowed only to pull images from the registry.
resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-pull-${suffix}'
  location: location
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, pullIdentity.id, acrPullRoleId)
  properties: {
    roleDefinitionId: acrPullRoleId
    principalId: pullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${namePrefix}-pg-${suffix}'
  location: location
  sku: {
    name: postgresSkuName
    tier: 'Burstable'
  }
  properties: {
    version: postgresVersion
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Disabled'
    }
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }

  resource database 'databases' = {
    name: databaseName
    properties: {
      charset: 'UTF8'
      collation: 'en_US.utf8'
    }
  }

  // 0.0.0.0 admits Azure services only; the server still requires TLS, which the API verifies.
  resource allowAzureServices 'firewallRules' = {
    name: 'AllowAzureServices'
    properties: {
      startIpAddress: '0.0.0.0'
      endIpAddress: '0.0.0.0'
    }
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env-${suffix}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var registries = [
  {
    server: registry.properties.loginServer
    identity: pullIdentity.id
  }
]

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${pullIdentity.id}': {} }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      // Internal only: reachable from the web app in the same environment, never from the internet.
      ingress: {
        external: false
        targetPort: 4000
        transport: 'http'
      }
      registries: registries
      secrets: [
        {
          name: 'database-url'
          value: 'postgres://${uriComponent(postgresAdminLogin)}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}'
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${registry.properties.loginServer}/${apiImage}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '4000' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'DATABASE_SSL', value: 'verify-full' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'TRUST_PROXY_HOPS', value: string(trustProxyHops) }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 4000 }
              periodSeconds: 10
            }
            {
              type: 'Readiness'
              httpGet: { path: '/ready', port: 4000 }
              periodSeconds: 10
              timeoutSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: apiMaxReplicas
      }
    }
  }
  dependsOn: [
    acrPull
    postgres::database
    postgres::allowAzureServices
  ]
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: webAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${pullIdentity.id}': {} }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        allowInsecure: false
      }
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${registry.properties.loginServer}/${webImage}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          // Apps in one environment reach each other by name through the internal ingress.
          env: [{ name: 'API_UPSTREAM', value: 'http://${api.name}' }]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/', port: 8080 }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: webMaxReplicas
      }
    }
  }
  dependsOn: [acrPull]
}

output url string = 'https://${web.properties.configuration.ingress.fqdn}'
