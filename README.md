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

La SPA usa `/api` con proxy a `http://127.0.0.1:7071`. Si quieres usar una API remota:

```bash
VITE_API_BASE_URL=https://<function-app>.azurewebsites.net/api npm run dev
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

Cosmos se crea con free tier y throughput compartido de 1000 RU/s. Blob Storage de media solo se crea si `mediaUploadsEnabled=true`.
Si la suscripcion ya uso el unico Cosmos free tier permitido, despliega con `enableCosmosFreeTier=false`.

## GitHub Actions con Azure OIDC

Configura federated credential en Azure para el repo de GitHub y agrega estas variables de GitHub:

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
```

Secrets de GitHub:

```text
APP_HMAC_SECRET
PII_ENCRYPTION_KEY
```

No se usa publish profile. `deploy-app.yml` obtiene el token de deploy de Static Web Apps durante el workflow con Azure CLI y lo enmascara.

## Pruebas y build

```bash
npm run test
npm run build
```

Pruebas incluidas:

- `calculatePriority`
- `deriveStatus`
- proof-of-work challenge
- rate limit

## Reglas P0 implementadas

- Reportar sin login.
- Proof-of-work en mutaciones.
- Honeypot en formulario de reporte.
- Rate limits por IP, device, contacto, reporte y geoCell.
- Owner token privado con HMAC.
- Cierres no destructivos.
- Eventos append-only.
- Cierre comunitario solo por multiples senales independientes.
- Reapertura publica y por owner token.
- Dedupe basico al crear reporte.
- Contactos no salen en respuestas publicas por defecto.
- Media uploads desactivado por feature flag.
