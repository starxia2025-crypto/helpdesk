# Soporte Macmillan

Esta iteración adapta el proyecto a un escenario real de soporte educativo para Macmillan.

## Cambios implementados

- Rebranding principal a `Soporte Macmillan`
- Nuevo rol `manager` para acceso a estadísticas
- Nueva base de formulario para incidencias educativas:
  - colegio
  - correo del informador
  - consulta sobre alumno/docente
  - matrícula
  - etapa
  - curso
  - asignatura
  - tipo de consulta
  - descripción
  - observaciones
- Vista `/admin` como backoffice técnico inicial
- Base de datos preparada con tabla `schools`

## Arquitectura objetivo

El objetivo de negocio es evolucionar hacia:

- una misma base de datos PostgreSQL
- un esquema lógico por cliente o grupo educativo
- datos operativos separados por cliente
- operación centralizada del equipo técnico de Macmillan

En esta iteración se mantiene la lógica actual por `tenantId` para no romper el sistema existente, pero se deja preparado el terreno para:

- añadir `dbSchema` por cliente
- gestionar colegios dependientes de un cliente principal
- separar más tarde consultas, documentos y configuraciones por esquema

## Próximos módulos recomendados

### 1. Correo transaccional

- aviso al equipo técnico al crear incidencia
- confirmación al usuario al cerrar o resolver ticket
- plantillas por cliente

### 2. Gestión real de colegios

- CRUD de colegios en `/admin`
- jerarquía colegio central / colegios asociados
- filtros y estadísticas por colegio

### 3. Exportación e informes

- exportación CSV/XLSX
- informes por rango de fechas
- resúmenes por colegio, etapa, asignatura y tipo de consulta

### 4. Estadísticas avanzadas

- distribución por colegio
- distribución por etapa educativa
- tiempos medios de resolución por colegio
- reparto por profesor o informador

### 5. IA conversacional

- configuración de `OPENAI_API_KEY`
- acceso a tickets, documentos y base de conocimiento
- respuestas asistidas para soporte

### 6. Accesos rápidos de cliente

- enlaces configurables por tenant
- accesos a plataformas Macmillan
- portal personalizado por cliente
