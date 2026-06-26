targetScope = 'resourceGroup'

@description('Short, lowercase resource prefix. Example: maparescate')
param appName string = 'maparescate'

@description('Azure region for regional resources.')
param location string = resourceGroup().location

@secure()
@description('32+ byte random string used for HMAC hashes and owner tokens.')
param appHmacSecret string

@secure()
@description('32 byte random string/base64 used for AES-GCM PII encryption.')
param piiEncryptionKey string

@description('Allowed browser origins for the Function API.')
param allowedOrigins string

@description('Public app URL used to create share links.')
param publicAppUrl string

@description('Allowed report bboxes as JSON.')
param allowedBboxesJson string = '[{"name":"Caracas","minLng":-67.24,"minLat":10.34,"maxLng":-66.72,"maxLat":10.62},{"name":"La Guaira","minLng":-67.36,"minLat":10.43,"maxLng":-66.72,"maxLat":10.76},{"name":"Altos Mirandinos","minLng":-67.18,"minLat":10.24,"maxLng":-66.82,"maxLat":10.48},{"name":"Guarenas-Guatire","minLng":-66.78,"minLat":10.34,"maxLng":-66.46,"maxLat":10.57}]'

param defaultCenterJson string = '[10.6031,-66.9334]'
param defaultZoom string = '11'
param mediaUploadsEnabled bool = false
param enableCosmosFreeTier bool = true
param dailyMapTokenSoftLimit string = '5000'
param reportRetentionSeconds int = 7776000
param eventRetentionSeconds int = 7776000
param monthlyBudgetAmount int = 25
param budgetContactEmailsJson string = '[]'
param budgetStartDate string = utcNow('yyyy-MM-01')

@description('Optional Azure RBAC role definition id for Azure Maps token access. Leave empty if your tenant uses a different built-in role name and assign it separately.')
param azureMapsRoleDefinitionId string = ''

var suffix = uniqueString(resourceGroup().id, appName)
var storageName = toLower('${take(appName, 7)}func${suffix}')
var mediaStorageName = toLower('${take(appName, 6)}media${suffix}')
var cosmosName = toLower('${appName}-cosmos-${suffix}')
var functionAppName = toLower('${appName}-api-${suffix}')
var planName = toLower('${appName}-plan-${suffix}')
var staticWebAppName = toLower('${appName}-web-${suffix}')
var mapsName = toLower('${appName}-maps-${suffix}')
var identityName = toLower('${appName}-id-${suffix}')
var deploymentStorageContainerName = 'app-package-${take(functionAppName, 32)}-${take(suffix, 7)}'
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
var budgetContactEmails = json(budgetContactEmailsJson)

resource functionStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${functionStorage.name}/default/${deploymentStorageContainerName}'
  properties: {
    publicAccess: 'None'
  }
}

resource functionIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource functionStorageBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionStorage.id, functionIdentity.id, storageBlobDataOwnerRoleId)
  scope: functionStorage
  properties: {
    principalId: functionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
  }
}

resource functionStorageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionStorage.id, functionIdentity.id, storageBlobDataContributorRoleId)
  scope: functionStorage
  properties: {
    principalId: functionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

resource functionStorageQueueContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionStorage.id, functionIdentity.id, storageQueueDataContributorRoleId)
  scope: functionStorage
  properties: {
    principalId: functionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataContributorRoleId)
  }
}

resource functionStorageTableContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionStorage.id, functionIdentity.id, storageTableDataContributorRoleId)
  scope: functionStorage
  properties: {
    principalId: functionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageTableDataContributorRoleId)
  }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: enableCosmosFreeTier
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    disableLocalAuth: true
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'maparescate'
  properties: {
    resource: {
      id: 'maparescate'
    }
    options: {
      throughput: 1000
    }
  }
}

resource reports 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'reports'
  properties: {
    resource: {
      id: 'reports'
      defaultTtl: reportRetentionSeconds
      partitionKey: {
        paths: [
          '/areaKey'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        spatialIndexes: [
          {
            path: '/location/?'
            types: [
              'Point'
              'Polygon'
            ]
          }
        ]
      }
    }
  }
}

resource events 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'events'
  properties: {
    resource: {
      id: 'events'
      defaultTtl: eventRetentionSeconds
      partitionKey: {
        paths: [
          '/reportId'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource rateLimits 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'rateLimits'
  properties: {
    resource: {
      id: 'rateLimits'
      defaultTtl: 7200
      partitionKey: {
        paths: [
          '/bucket'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource securityEvents 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'securityEvents'
  properties: {
    resource: {
      id: 'securityEvents'
      defaultTtl: 7776000
      partitionKey: {
        paths: [
          '/day'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource mapTokenQuotas 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'mapTokenQuotas'
  properties: {
    resource: {
      id: 'mapTokenQuotas'
      defaultTtl: 2592000
      partitionKey: {
        paths: [
          '/day'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource media 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = if (mediaUploadsEnabled) {
  parent: database
  name: 'media'
  properties: {
    resource: {
      id: 'media'
      partitionKey: {
        paths: [
          '/reportId'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource maps 'Microsoft.Maps/accounts@2023-06-01' = {
  name: mapsName
  location: 'global'
  sku: {
    name: 'G2'
  }
  kind: 'Gen2'
  properties: {}
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${appName}-appi-${suffix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
  }
}

resource monthlyBudget 'Microsoft.Consumption/budgets@2023-05-01' = if (length(budgetContactEmails) > 0) {
  name: '${appName}-monthly-budget'
  properties: {
    category: 'Cost'
    amount: monthlyBudgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      actual80: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: budgetContactEmails
      }
    }
  }
}

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${functionIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${functionStorage.properties.primaryEndpoints.blob}${deploymentStorageContainerName}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: functionIdentity.id
          }
        }
      }
      runtime: {
        name: 'node'
        version: '20'
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 2048
      }
    }
  }
  dependsOn: [
    functionStorageBlobOwner
    functionStorageBlobContributor
    functionStorageQueueContributor
    functionStorageTableContributor
  ]
}

resource functionAppSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: {
    AzureWebJobsStorage__accountName: functionStorage.name
    AzureWebJobsStorage__credential: 'managedidentity'
    AzureWebJobsStorage__clientId: functionIdentity.properties.clientId
    FUNCTIONS_EXTENSION_VERSION: '~4'
    AZURE_CLIENT_ID: functionIdentity.properties.clientId
    APP_ENV: 'prod'
    APP_HMAC_SECRET: appHmacSecret
    PII_ENCRYPTION_KEY: piiEncryptionKey
    COSMOS_ENDPOINT: cosmos.properties.documentEndpoint
    COSMOS_DATABASE: 'maparescate'
    AZURE_MAPS_CLIENT_ID: maps.properties.uniqueId
    ALLOWED_ORIGINS: allowedOrigins
    PUBLIC_APP_URL: publicAppUrl
    ALLOWED_BBOXES_JSON: allowedBboxesJson
    DEFAULT_CENTER_JSON: defaultCenterJson
    DEFAULT_ZOOM: defaultZoom
    MEDIA_UPLOADS_ENABLED: string(mediaUploadsEnabled)
    MEDIA_STORAGE_ACCOUNT: mediaUploadsEnabled ? mediaStorageName : ''
    MEDIA_CONTAINER: 'report-media'
    DAILY_MAP_TOKEN_SOFT_LIMIT: dailyMapTokenSoftLimit
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
  }
}

resource cosmosRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, functionApp.name, cosmosDataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: functionIdentity.properties.principalId
    scope: cosmos.id
  }
}

resource mapsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(azureMapsRoleDefinitionId)) {
  name: guid(maps.id, functionApp.name, azureMapsRoleDefinitionId)
  scope: maps
  properties: {
    principalId: functionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureMapsRoleDefinitionId)
  }
}

resource mediaStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = if (mediaUploadsEnabled) {
  name: mediaStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = if (mediaUploadsEnabled) {
  name: '${mediaStorage.name}/default/report-media'
  properties: {
    publicAccess: 'None'
  }
}

resource mediaRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (mediaUploadsEnabled) {
  name: guid(mediaStorage.id, functionApp.name, 'blob-data-contributor')
  scope: mediaStorage
  properties: {
    principalId: functionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  }
}

output staticWebAppName string = swa.name
output staticWebAppUrl string = 'https://${swa.properties.defaultHostname}'
output functionAppName string = functionApp.name
output functionUrl string = 'https://${functionApp.properties.defaultHostName}/api'
output cosmosAccountName string = cosmos.name
output mapsAccountName string = maps.name
output azureMapsClientId string = maps.properties.uniqueId
output applicationInsightsName string = appInsights.name
