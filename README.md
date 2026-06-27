# VidasVE

MVP P0: SPA pública con mapa primero, API en Azure Functions, Cosmos DB for NoSQL, Azure Maps sin subscription key en frontend, y despliegue por GitHub Actions con Azure OIDC.

## Estructura

```text
app/                 Vite React TypeScript
api/                 Azure Functions TypeScript
infra/               Bicep
.github/workflows/   CI y deploy
```

La ruta `/` abre el mapa directamente. No hay landing page ni login obligatorio para reportar. La SPA incluye manifest PWA mínimo para instalación; el modo offline completo/outbox sigue limitado al banner de error y reintento.
La SPA no muestra datos demo en producción. Si necesitas la maqueta visual local, usa `VITE_DEMO_MODE=true`.

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

Demo visual local opcional:

```bash
VITE_DEMO_MODE=true npm run dev --workspace app
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
MEDIA_STORAGE_ACCOUNT=<solo si MEDIA_UPLOADS_ENABLED=true>
MEDIA_CONTAINER=report-media
GEOCODING_ENABLED=true
TURNSTILE_SITE_KEY=<opcional, Cloudflare Turnstile>
TURNSTILE_SECRET_KEY=<opcional, Cloudflare Turnstile secret, solo API>
DAILY_MAP_TOKEN_SOFT_LIMIT=5000
```

No configures Azure Maps subscription key en la SPA. El frontend pide `/api/maps/token` y la Function obtiene el token con Managed Identity.
El autocomplete de ubicación usa `/api/places?q=...`, también via Managed Identity, y solo devuelve resultados dentro de `ALLOWED_BBOXES_JSON`.
`ALLOWED_BBOXES_JSON` define las zonas afectadas visibles e interactivas del mapa. Por defecto cubre Caracas, La Guaira, Altos Mirandinos y Guarenas-Guatire; ajusta esos bboxes cuando operaciones confirme nuevas zonas.
Si la API devuelve el tope de 500 reportes, la SPA muestra un aviso para acercar el mapa y reducir el área. No hay clustering server-side todavía.
Si configuras `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`, el formulario usa Cloudflare Turnstile y valida el token en backend. Si faltan, queda activo el fallback local de escribir `VIDA`.

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
- `turnstileSiteKey` y `turnstileSecretKey` opcionales para captcha real con Cloudflare Turnstile

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
MEDIA_UPLOADS_ENABLED opcional, usa `true` para crear Blob Storage y activar archivos
GEOCODING_ENABLED opcional, default `true`
TURNSTILE_SITE_KEY opcional
```

Secrets de GitHub:

```text
APP_HMAC_SECRET
PII_ENCRYPTION_KEY
TURNSTILE_SECRET_KEY opcional
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

## Dominio custom

Azure App Service Domains no permite registrar `vidasve.app` porque el TLD `.app` no está soportado por `Microsoft.DomainRegistration` (`TldValidationFailed ... app`). Registra `vidasve.app` en un registrador que soporte `.app` y luego conecta el apex a Static Web Apps:

```bash
az staticwebapp hostname set \
  --name maparescate-web-j5oyin3m4kbek \
  --resource-group rg-maparescate-prod \
  --hostname vidasve.app \
  --validation-method dns-txt-token

az staticwebapp hostname show \
  --name maparescate-web-j5oyin3m4kbek \
  --resource-group rg-maparescate-prod \
  --hostname vidasve.app
```

Configura en DNS los registros TXT/ALIAS que devuelva Azure, y despues actualiza `ALLOWED_ORIGINS` y `PUBLIC_APP_URL` a `https://vidasve.app`.

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

Importar reportes reales verificados desde CSV:

```bash
API_BASE_URL=https://<function-app>.azurewebsites.net/api npm run import:reports -- verified.csv
```

Columnas útiles: `addressText,knownInfoPublic,type,lat,lng,peopleCount,personName,personAge,personStatus,lastKnownPlace,lastContactText,lastContactAt,signsOfLife,riskFlags,sourceType,reporterContact`.

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
- Owner token limitado al reporte del enlace privado; no se propaga al navegar a otros reportes.
- Cierres no destructivos.
- Eventos append-only.
- Cierre comunitario solo por múltiples señales independientes.
- Reapertura pública y por owner token.
- Dedupe básico al crear reporte.
- Contactos no salen en respuestas públicas por defecto.
- Personas públicas por reporte en `persons[]` con búsqueda por persona, ubicación o código.
- Publicaciones familiares de texto append-only sobre reportes reales.
- Endpoint público `GET /api/search?q=<texto>` para buscar reportes, personas, publicaciones y ubicaciones sin exponer contactos privados.
- Mapa limitado a las zonas afectadas configuradas en `ALLOWED_BBOXES_JSON`.
- Botón público para abuso y señales de vida nuevas.
- Retención configurable de reportes y eventos.
- Manifest PWA mínimo y aviso visual cuando la lista de reportes está truncada.
- Uploads de archivo/media por feature flag; si se activa, la API acepta PNG/JPEG/WebP/PDF hasta 5MB y escribe en Azure Blob Storage.
