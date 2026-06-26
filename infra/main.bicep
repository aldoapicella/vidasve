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
param allowedBboxesJson string = '[{"name":"Caracas","minLng":-67.20,"minLat":10.35,"maxLng":-66.70,"maxLat":10.65},{"name":"La Guaira","minLng":-67.35,"minLat":10.45,"maxLng":-66.75,"maxLat":10.75}]'

param defaultCenterJson string = '[10.6031,-66.9334]'
param defaultZoom string = '11'
param mediaUploadsEnabled bool = false
param enableCosmosFreeTier bool = true
param dailyMapTokenSoftLimit string = '5000'

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
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource functionStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
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

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'linux'
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

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${functionStorage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${functionStorage.listKeys().keys[0].value}'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'APP_ENV'
          value: 'prod'
        }
        {
          name: 'APP_HMAC_SECRET'
          value: appHmacSecret
        }
        {
          name: 'PII_ENCRYPTION_KEY'
          value: piiEncryptionKey
        }
        {
          name: 'COSMOS_ENDPOINT'
          value: cosmos.properties.documentEndpoint
        }
        {
          name: 'COSMOS_DATABASE'
          value: 'maparescate'
        }
        {
          name: 'AZURE_MAPS_CLIENT_ID'
          value: maps.properties.uniqueId
        }
        {
          name: 'ALLOWED_ORIGINS'
          value: allowedOrigins
        }
        {
          name: 'PUBLIC_APP_URL'
          value: publicAppUrl
        }
        {
          name: 'ALLOWED_BBOXES_JSON'
          value: allowedBboxesJson
        }
        {
          name: 'DEFAULT_CENTER_JSON'
          value: defaultCenterJson
        }
        {
          name: 'DEFAULT_ZOOM'
          value: defaultZoom
        }
        {
          name: 'MEDIA_UPLOADS_ENABLED'
          value: string(mediaUploadsEnabled)
        }
        {
          name: 'DAILY_MAP_TOKEN_SOFT_LIMIT'
          value: dailyMapTokenSoftLimit
        }
      ]
    }
  }
}

resource cosmosRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, functionApp.name, cosmosDataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: functionApp.identity.principalId
    scope: cosmos.id
  }
}

resource mapsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(azureMapsRoleDefinitionId)) {
  name: guid(maps.id, functionApp.name, azureMapsRoleDefinitionId)
  scope: maps
  properties: {
    principalId: functionApp.identity.principalId
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
    principalId: functionApp.identity.principalId
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
