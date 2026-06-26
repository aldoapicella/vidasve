# MapaRescate Venezuela

MVP P0: SPA publica con mapa primero, API en Azure Functions, Cosmos DB for NoSQL, Azure Maps sin subscription key en frontend, y despliegue por GitHub Actions con Azure OIDC.

## Estructura

```text
app/                 Vite React TypeScript
api/                 Azure Functions TypeScript
infra/               Bicep
.github/workflows/   CI y deploy
```

La ruta `/` abre el mapa directamente. No hay landing page ni login obligatorio para reportar.

## Setup local

Requisitos:

- Node.js 20+
- npm 10+
- Azure Functions Core Tools para correr `api/` localmente

Instalar:

```bash
npm install
```

API local:

```bash
cp api/local.settings.example.json api/local.settings.json
cd api
npm run build
func start
```

SPA local:

```bash
cd app
npm run dev
```

La SPA usa `/api` con proxy a la API productiva. Para usar Functions local:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:7071 npm run dev --workspace app
```

## Variables de entorno API

Obligatorias en Azure:

```text
APP_ENV=prod
APP_HMAC_SECRET=<random 32+ bytes>
PII_ENCRYPTION_KEY=<random 32 bytes o base64>
COSMOS_ENDPOINT=https://...
COSMOS_DATABASE=maparescate
AZURE_MAPS_CLIENT_ID=<maps account client id>
ALLOWED_ORIGINS=https://<static-web-app>,https://<dominio-custom>
PUBLIC_APP_URL=https://<static-web-app-o-dominio>
ALLOWED_BBOXES_JSON=[...]
DEFAULT_CENTER_JSON=[10.6031,-66.9334]
DEFAULT_ZOOM=11
MEDIA_UPLOADS_ENABLED=false
DAILY_MAP_TOKEN_SOFT_LIMIT=5000
```

No configures Azure Maps subscription key en la SPA. El frontend pide `/api/maps/token` y la Function obtiene el token con Managed Identity.

## Infraestructura

Crear resource group:

```bash
az group create -n <resource-group> -l eastus2
```

Generar secretos locales para parametros:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Desplegar:

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.example.json
```

Valores reales que debes configurar:

- `appHmacSecret`
- `piiEncryptionKey`
- `allowedOrigins`
- `publicAppUrl`
- `azureMapsRoleDefinitionId` si quieres que Bicep haga el role assignment de Azure Maps en tu tenant
- `budgetContactEmailsJson` opcional, ejemplo `["ops@example.com"]`, para crear alertas de costo
- `reportRetentionSeconds` y `eventRetentionSeconds` opcionales; default 90 dias

Cosmos se crea con free tier, throughput compartido de 1000 RU/s y TTL configurable para reportes/eventos. Application Insights se crea para la Function App. Blob Storage de media solo se crea si `mediaUploadsEnabled=true`.
Si la suscripcion ya uso el unico Cosmos free tier permitido, despliega con `enableCosmosFreeTier=false`.

## GitHub Actions con Azure OIDC

Configura un federated credential en Azure para el repo de GitHub. Puede ser sobre una app registration de Entra o sobre una User Assigned Managed Identity. Este despliegue usa la Managed Identity `maparescate-github-deploy` porque el tenant no permite registrar apps desde este usuario.

Variables de GitHub requeridas:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
AZURE_RESOURCE_GROUP
AZURE_LOCATION
APP_NAME
ALLOWED_ORIGINS
PUBLIC_APP_URL
SWA_NAME
FUNCTION_APP_NAME
AZURE_MAPS_ROLE_DEFINITION_ID
BUDGET_CONTACT_EMAILS_JSON opcional, ejemplo ["ops@example.com"]
MONTHLY_BUDGET_AMOUNT opcional, default 25
```

Secrets de GitHub:

```text
APP_HMAC_SECRET
PII_ENCRYPTION_KEY
```

No se usa publish profile. `deploy-app.yml` obtiene el token de deploy de Static Web Apps durante el workflow con Azure CLI y lo enmascara.

Valores productivos actuales:

```text
AZURE_RESOURCE_GROUP=rg-maparescate-prod
AZURE_LOCATION=eastus2
SWA_NAME=maparescate-web-j5oyin3m4kbek
FUNCTION_APP_NAME=maparescate-api-j5oyin3m4kbek
PUBLIC_APP_URL=https://ashy-sky-0df7fa50f.7.azurestaticapps.net
```

## Pruebas y build

```bash
npm run test
npm run build
```

Health checks:

```bash
curl https://<function-app>.azurewebsites.net/api/health
curl https://<function-app>.azurewebsites.net/api/health/deep
```

Pruebas incluidas:

- `calculatePriority`
- `deriveStatus`
- proof-of-work challenge
- proof-of-work replay
- rate limit

## Reglas P0 implementadas

- Reportar sin login.
- Proof-of-work en mutaciones.
- Challenge proof-of-work de un solo uso.
- Honeypot en formulario de reporte.
- Rate limits por IP, device, contacto, reporte y geoCell.
- Owner token privado con HMAC; enlaces nuevos lo llevan en hash fragment.
- Cierres no destructivos.
- Eventos append-only.
- Cierre comunitario solo por multiples senales independientes.
- Reapertura publica y por owner token.
- Dedupe basico al crear reporte.
- Contactos no salen en respuestas publicas por defecto.
- Boton publico para abuso y senales de vida nuevas.
- Retencion configurable de reportes y eventos.
- Media uploads desactivado por feature flag.
