# Executive View Test - Dynatrace App

## 📋 Descripción General

**Executive View Test** es una aplicación Dynatrace diseñada para proporcionar una vista ejecutiva consolidada del estado y performance de tus aplicaciones. Permite visualizar métricas clave de disponibilidad, usuarios conectados, volumen de solicitudes, errores y generación de ingresos en tiempo real.

La aplicación está construida con **React** y **TypeScript** usando el Dynatrace App Toolkit, integrándose directamente con el Dynatrace Platform para consultar datos desde Grail (Dynatrace's data lake) mediante **DQL** (Dynatrace Query Language).

### 🎯 Casos de Uso

- **Monitoreo de Disponibilidad**: Visualiza la disponibilidad de tus aplicaciones en diferentes timeframes
- **Análisis de Impacto de Usuarios**: Observa cuántos usuarios están conectados en tiempo real
- **Seguimiento de Errores**: Identifica aplicaciones con tasas altas de error
- **Análisis de Ingresos**: Correlaciona el rendimiento técnico con el impacto en ingresos
- **Reporting**: Exporta datos a CSV para análisis posteriores e imprime reportes

## 📁 Estructura del Proyecto

```
exec-view-test/
├── ui/                          # Código del frontend (React + TypeScript)
│   ├── app/
│   │   ├── App.tsx              # Componente raíz con enrutamiento
│   │   ├── components/
│   │   │   ├── Header.tsx        # Navegación principal
│   │   │   └── Card.tsx          # Componente de tarjeta reutilizable
│   │   └── pages/
│   │       ├── Home.tsx          # Página de inicio
│   │       ├── Executive.tsx      # Dashboard ejecutivo con gráficos
│   │       ├── ChannelDetail.tsx  # Vista detallada de aplicaciones (canal)
│   │       └── Data.tsx           # Tabla de datos brutos
│   ├── main.tsx                 # Punto de entrada de React
│   ├── assets/                  # Imágenes y recursos estáticos
│   └── tsconfig.json            # Configuración de TypeScript
├── app.config.json              # Configuración de la app (nombre, ID, scopes)
├── package.json                 # Dependencias del proyecto
├── eslint.config.mjs            # Configuración de linting
├── guide.md                      # Guía rápida de desarrollo
└── README.md                    # Este archivo
```

## ✨ Características Principales

### 1. **Vista de Detalle de Canal (ChannelDetail)**
   - Grid responsivo mostrando hasta 30 aplicaciones
   - Tarjetas con información de cada aplicación:
     - Nombre de la aplicación
     - Porcentaje de disponibilidad con indicador visual
     - Usuarios conectados
     - Volumen de solicitudes
     - Cantidad de errores
     - Ingresos generados
   - **Botón Export CSV**: Descarga los datos en formato CSV para análisis externo
   - **Botón Print Cards**: Imprime solo el grid de tarjetas (vista limpia para reportes)
   - Selector de timeframe (últimos 5m, 10m, 30m, 1h, 6h, 24h)

### 2. **Dashboard Ejecutivo (Executive)**
   - Visualización de métricas clave en KPI tiles
   - Gráficos de series de tiempo para análisis histórico
   - Vista consolidada para presentaciones ejecutivas

### 3. **Vista de Datos Brutos (Data)**
   - Tabla completa de datos sin procesar
   - Ideal para análisis detallado y debugging

### 4. **Página de Inicio (Home)**
   - Tarjetas de navegación hacia diferentes secciones
   - Punto de entrada amigable para nuevos usuarios

## 🚀 Guía de Inicio Rápido

### Requisitos Previos
- **Node.js** 16.x o superior
- **npm** 7.x o superior
- Acceso a un **environment Dynatrace** con datos de RUM (Real User Monitoring)
- Dynatrace App Toolkit instalado globalmente: `npm install -g @dynatrace/dt-app`

### Instalación

1. **Clonar o descargar el proyecto**
   ```bash
   cd exec-view-test
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar el environment Dynatrace**
   - Abre `app.config.json`
   - Reemplaza `environmentUrl` con tu URL de Dynatrace
   ```json
   {
     "environmentUrl": "https://tu-environment.dynatracelabs.com/"
   }
   ```

4. **Verificar permisos (Scopes)**
   - La app requiere estos permisos en tu Dynatrace environment:
     - `storage:logs:read` - Lectura de logs
     - `storage:buckets:read` - Lectura de buckets
     - `storage:metrics:read` - Lectura de métricas RUM
     - `storage:entities:read` - Lectura de entidades de aplicaciones

### Desarrollo Local

#### Iniciar el servidor de desarrollo
```bash
npm run start
```
- Se abrirá automáticamente `http://localhost:8080`
- Los cambios se reflejan en vivo (hot reload)
- Los errores aparecerán en la consola del navegador

#### Editar componentes
- Modifica archivos en `ui/app/` y guarda
- La página se recargará automáticamente
- Verifica errores de TypeScript/ESLint en la terminal

## 📚 Comandos Disponibles

### Desarrollo
| Comando | Descripción |
|---------|-------------|
| `npm run start` | Inicia el servidor de desarrollo con hot reload |
| `npm run build` | Compila la app para producción en carpeta `dist/` |

### Despliegue
| Comando | Descripción |
|---------|-------------|
| `npm run deploy` | Construye y despliega la app al environment configurado en `app.config.json` |
| `npm run uninstall` | Desinstala la app del environment Dynatrace |

### Mantenimiento
| Comando | Descripción |
|---------|-------------|
| `npm run update` | Actualiza paquetes de Dynatrace SDK a la última versión |
| `npm run generate:function` | Genera una nueva función serverless en la carpeta `api/` |

### Utilidades
| Comando | Descripción |
|---------|-------------|
| `npm run info` | Muestra información del CLI y environment |
| `npm run help` | Muestra ayuda completa del Dynatrace App Toolkit |

## 🔧 Configuración

### `app.config.json`
Este archivo controla la configuración de la aplicación:

```json
{
  "environmentUrl": "https://tu-environment.dynatracelabs.com/",
  "app": {
    "name": "exec-view-test",           // Nombre mostrado en UI
    "id": "my.exec.view.test",          // ID único de la app
    "version": "0.0.9",                 // Versión semántica
    "description": "...",               // Descripción corta
    "scopes": [...]                     // Permisos requeridos
  }
}
```

**Importante**: Cambia `environmentUrl` a tu Dynatrace environment antes de ejecutar.

## 📊 Querys DQL Utilizadas

La app ejecuta queries DQL (Dynatrace Query Language) para obtener datos:

### ChannelDetail - Snapshot de Métricas
```dql
timeseries {
  availability = avg(app.availability, scalar: true),
  connected_users = avg(app.users.connected, scalar: true),
  requests = sum(app.requests, scalar: true),
  errors = sum(app.request.errors, scalar: true),
  revenue = sum(app.transactions.revenue, scalar: true)
}, by: { app }
```

Puedes encontrar estas queries en `ui/app/pages/ChannelDetail.tsx` y `Executive.tsx`.

## 🎨 Componentes Principales

### `ChannelDetail` (`ui/app/pages/ChannelDetail.tsx`)
- **Props**:
  - `embedded`: Boolean - Controla estilo en modo embebido
  - `selectedId`: String - ID de app seleccionada
  - `timeframe`: "5m" | "10m" | "30m" | "1h" | "6h" | "24h"
  - `onTimeframeChange`: Callback para cambios de timeframe

- **Características**:
  - KPI tiles con métricas consolidadas
  - Grid responsivo de aplicaciones
  - Export a CSV con timestamp
  - Impresión de grid limpio (sin header/footer)
  - Indicadores de estado (Operational, Degraded, Critical)
  - Progress bars para visualización de disponibilidad

### `Card` (`ui/app/components/Card.tsx`)
- Componente de navegación con imagen y nombre
- Soporta links internos y externos
- Estilizado con Strato Design System

## 📤 Exportar y Imprimir

### Exportar a CSV
- Click en el botón **"Export CSV"** en ChannelDetail
- Descarga automática de archivo `channel-detail-{timeframe}-{timestamp}.csv`
- Contiene: nombre, ID, disponibilidad, estado, usuarios, solicitudes, errores, ingresos

### Imprimir Grid
- Click en el botón **"Print Cards"**
- Se abre el diálogo de impresión del navegador
- Solo muestra el grid de tarjetas (sin navbar, sidebar, etc.)
- Optimizado para papel A4

## 🔐 Permisos y Seguridad

La app opera bajo el modelo de seguridad de Dynatrace:
- **Scope-based access**: Solo accede a datos que el usuario tiene permiso
- **API tokens**: Dynatrace gestiona automáticamente la autenticación
- **Datos sensibles**: Números de ingresos se muestran en formato monetario (PEN)

## 🐛 Troubleshooting

### La app no carga datos
**Causa**: Timeframe sin datos o permisos insuficientes
```
- Verifica que tu app tenga RUM data enabled
- Confirma que los scopes estén configurados correctamente
- Intenta cambiar el timeframe
```

### Error "403 Forbidden"
**Causa**: Scopes insuficientes en `app.config.json`
```
- Asegúrate que todos los scopes están agregados en app.config.json
- Redeploy la app: npm run deploy
```

### Cambios no se reflejan en desarrollo
**Causa**: El hot reload no se activó
```
- Recarga manualmente: Ctrl+R o Cmd+R
- Verifica la consola del navegador para errores
- Revisa la terminal para errores de compilación
```

## 🤝 Desarrollo y Contribución

### Estructura de Componentes
- Componentes funcionales con React Hooks
- TypeScript strict mode habilitado
- Estilos inline con theme variables

### Agregar Nueva Página
1. Crea un archivo en `ui/app/pages/MiPagina.tsx`
2. Actualiza rutas en `ui/app/App.tsx`
3. Agrega navegación en `ui/app/components/Header.tsx`

### Agregar Nueva Query DQL
1. Define la query en tu componente
2. Usa el hook `useDql` de `@dynatrace-sdk/react-hooks`
3. Maneja estados de loading/error

### Estándares de Código
- **ESLint**: `npm run build` valida el código
- **TypeScript**: Strict mode activo
- **Formato**: Usa prettier (si está configurado)

## 📖 Recursos Adicionales

- **Documentación Oficial**: [Dynatrace Developer](https://dt-url.net/developers)
- **Dynatrace Query Language (DQL)**: [DQL Docs](https://dt-url.net/dql)
- **React Documentation**: [react.dev](https://react.dev)
- **TypeScript Handbook**: [typescriptlang.org](https://www.typescriptlang.org/docs/)
- **Dynatrace Strato Components**: [Strato Design System](https://dynatrace.github.io/strato-components/)

## 📝 Notas de Versión

### v0.0.9
- ✨ Agregado botón "Export CSV" en ChannelDetail
- ✨ Agregado botón "Print Cards" con impresión limpia del grid
- 🎨 Íconos SVG en botones de acciones

### Versiones Anteriores
- v0.0.1: Versión inicial con routing, fetching de datos y charting

## 📄 Licencia

Este proyecto es propiedad de Dynatrace. Consulta con tu administrador para términos de uso.

---

**¿Necesitas ayuda?** Revisa la [guía rápida](guide.md) o contacta a tu administrador Dynatrace.
