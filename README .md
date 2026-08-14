# TalentFlow AI — Sistema Inteligente de Preselección de Candidatos

**Curso:** Inteligencia Artificial 1 — Campus Bucaramanga
**Autor:** Johan Serrano
**Fecha:** Agosto 2026

Sistema automatizado que registra postulaciones laborales mediante un formulario web, analiza hojas de vida (PDF) con un modelo de lenguaje (LLM), calcula un score de compatibilidad candidato–vacante (0-100), prioriza la revisión humana y notifica al equipo de RRHH. La IA actúa exclusivamente como herramienta de apoyo: **ningún candidato es descartado automáticamente** y la decisión final permanece en manos de RRHH.

---

## 1. Arquitectura del Sistema

```
CANDIDATO
    │
    ▼
FORMULARIO WEB (HTML nativo, POST multipart, anti-CORS vía iframe oculto)
    │
    ▼
WEBHOOK (n8n Cloud — producción)
    │
    ▼
CODE4 — Validación de entrada (campos obligatorios, formato de correo, PDF presente)
    │
    ▼
IF1 ─┬─ validacion_ok = false → RESPOND "Datos inválidos" → FIN
    │
    └─ true → EXTRACT FROM FILE (PDF → texto plano)
                  │
                  ▼
              IF2 ─┬─ texto insuficiente o imagen (PDF escaneado / JPG / PNG)
                  │      → GOOGLE DRIVE (upload → copy con OCR → export texto) ─┐
                  │                                                         │
                  └─ texto extraído correctamente ──────────────────────────┤
                                                                            ▼
              GET ROW(S) — Google Sheets (lectura de registros existentes)
    │
    ▼
CODE — Detección de duplicados (correo + vacante)
    │
    ▼
IF ─┬─ true  → RESPOND "Ya estás registrado en esta vacante" → FIN
    │
    └─ false → CODE3 — Requisitos de la vacante leídos de la hoja "Vacantes" (inyectados al prompt)
                  │
                  ▼
              HTTP REQUEST → API Groq (Llama 3.3 70B)
                  │
                  ▼
              CODE — Parseo JSON + clasificación determinista por umbrales
                  │
                  ▼
              SWITCH ─┬─ ≥80 REVISION_PRIORITARIA → Telegram (aviso RRHH) ─┐
                      ├─ 60-79 REVISION_MANUAL ───────────────────────────┤
                      └─ <60 REVISION_SECUNDARIA ─────────────────────────┤
                                                                          ▼
                                                    APPEND ROW — Google Sheets
                                                                          │
                                                                          ▼
                                                    RESPOND "Solicitud enviada"

BOT DE CONSULTA (flujo paralelo):
Telegram Trigger → Switch (comandos) ─┬─ /candidato <ID> → Get row(s) filtrado → Send Message (ficha)
                                      └─ /pendientes → Get row(s) (estado=PENDIENTE_REVISION) → Code (lista) → Send Message

GESTIÓN DE VACANTES (flujo paralelo):
Página RRHH (rrhh.html) → Webhook POST /nueva-vacante → validación + duplicado
→ Append row en hoja "Vacantes" → Respond "Vacante publicada"
Formulario público → Webhook GET /vacantes → Get row(s) hoja "Vacantes" (activas)
→ Respond JSON con cabecera CORS → el select del formulario se llena dinámicamente

DASHBOARD:
Google Sheets ←── Gráficos nativos de Sheets publicados (Publicar gráfico → Insertar)
                 └── embebidos vía iframe en la página RRHH (rrhh.html)
                 └── se actualizan solos con cada nuevo registro
```

### Principios de diseño aplicados
- **Arquitectura orientada a eventos:** todo el pipeline se dispara por el webhook al recibir una postulación.
- **Separación de responsabilidades:** la IA realiza la evaluación semántica; las reglas de negocio (umbrales de clasificación) se ejecutan de forma determinista en código, nunca delegadas al modelo generativo.
- **Desacoplamiento:** el dashboard lee directamente la capa de persistencia; no depende de que n8n esté activo.
- **Mínima superficie de credenciales:** todas las claves viven en credenciales de n8n, nunca en el código ni en el repositorio.

---

## 2. Componentes e Integraciones

| Componente | Tecnología | Función |
|---|---|---|
| Formulario web | HTML5 + CSS + JS mínimo | Registro de postulación con carga de PDF o imagen; envío nativo multipart (evita CORS) y confirmación en página vía iframe oculto; vacantes cargadas dinámicamente desde el backend |
| Página RRHH | HTML5 + CSS + JS | Creación de vacantes y dashboard con gráficos publicados de Google Sheets embebidos |
| Motor de automatización | n8n Cloud | Orquestación del pipeline completo |
| Extracción documental | Nodo nativo "Extract from File" | Conversión del PDF a texto plano |
| OCR | Google Drive API (conversión a Google Doc) | Reconocimiento de texto en PDFs escaneados e imágenes (JPG/PNG): el archivo se sube a Drive, se copia convirtiendo a Google Doc (OCR automático, `ocrLanguage=spa`) y se exporta como texto plano |
| Modelo de IA | Groq API — Llama 3.3 70B Versatile | Análisis del CV, score de compatibilidad, validación cruzada formulario↔CV |
| Base de datos | Google Sheets | Registro centralizado y trazabilidad |
| Bot RRHH | Telegram Bot API | Notificaciones de revisión prioritaria y consultas (/candidato, /pendientes) |
| Dashboard | Google Sheets (gráficos publicados) | Métricas del proceso: candidatos por vacante, clasificación y score promedio; se auto-actualizan con cada registro |

---

## 3. Modelo de Datos (Google Sheets)

| Columna | Origen | Descripción |
|---|---|---|
| id | Código | Identificador único consecutivo `TF-2026-XXXX` (conteo de filas + padding) |
| fecha | Código | Timestamp ISO de la postulación |
| nombre, correo, telefono | Formulario | Datos de contacto del candidato |
| vacante | Formulario | Vacante seleccionada |
| experiencia | Formulario | Años de experiencia declarados |
| tecnologias | Formulario | Habilidades declaradas |
| score | IA | Compatibilidad 0-100 (rúbrica declarada en el prompt) |
| clasificacion | Código | Derivada del score: ≥80 REVISION_PRIORITARIA, 60-79 REVISION_MANUAL, <60 REVISION_SECUNDARIA |
| fortalezas, brechas | IA | Puntos fuertes y faltantes detectados |
| habilidades | IA | Tecnologías extraídas del CV |
| nivel_educativo | IA | Nivel de formación detectado |
| experiencia_anios | IA | Años de experiencia estimados del CV |
| coherencia | IA | alta/media/baja — consistencia formulario↔CV |
| observacion_coherencia | IA | Explicación de inconsistencias detectadas |
| resumen | IA | Resumen ejecutivo del perfil (2-3 líneas) |
| estado | Código | ANALIZADO o PENDIENTE_REVISION (si score ≥80) |
| revision_rrhh | Humano | Campo libre para el veredicto de RRHH |

**Estados del ciclo de vida:** RECIBIDO → ANALIZADO → PENDIENTE_REVISION → PRESELECCIONADO → ENTREVISTA → FINALIZADO.

**Reglas de negocio implementadas:**
- ID único consecutivo por postulación.
- Deduplicación por clave compuesta correo + vacante (mismo correo puede postular a vacantes distintas).
- Clasificación por umbrales deterministas (código), no generada por el LLM.
- Ningún candidato se descarta automáticamente; todos quedan registrados.
- La IA no evalúa ni menciona criterios protegidos (género, edad, foto, estado civil, nacionalidad, religión, orientación sexual, discapacidad).

---

## 4. Workflows (n8n)

### 4.1 Flujo principal de postulación
1. **Webhook** (POST, multipart/form-data, path personalizado, Respond: "Using Respond to Webhook node").
2. **Code4** — validación de entrada: campos obligatorios (nombre, correo, teléfono, vacante, experiencia, tecnologías), formato de correo válido y presencia del archivo.
3. **If1** — `validacion_ok = false` → **Respond2** (HTML rojo "Datos inválidos"); true → continúa.
4. **Extract from File** (operation PDF, Input Binary Field: `cv`).
5. **Rama OCR (Google Drive)** — se activa si el archivo es una imagen (JPG/PNG, detectado por mimeType antes de la extracción) o si el texto extraído del PDF es insuficiente (< 50 caracteres, típico de PDF escaneado). Tres pasos: **Google Drive Upload** (sube el binario `cv`) → **HTTP Request** POST `/drive/v3/files/{id}/copy?ocrLanguage=spa` con body `{"mimeType":"application/vnd.google-apps.document"}` (la conversión a Google Doc ejecuta el OCR) → **HTTP Request** GET `/drive/v3/files/{id}/export?mimeType=text/plain` (descarga el texto reconocido). Un nodo **Code** re-adjunta el binario original desde el Webhook cuando la extracción previa lo eliminó. El texto reconocido se unifica con el de extracción normal en el nodo **Code-TextoCV** y el flujo continúa idéntico para ambas rutas.
6. **Get row(s) in sheet** — lectura completa para deduplicación e ID consecutivo (Settings → "Always Output Data" activado para soportar base vacía).
7. **Code1** — detección de duplicado por correo + vacante.
8. **If** — duplicado = true → **Respond to Webhook** (HTML amarillo "ya registrado"); false → continúa.
9. **Code3** — lee la hoja **Vacantes** y obtiene los requisitos de la vacante seleccionada, que se inyectan al prompt de evaluación para anclar el score a criterios objetivos del rol.
10. **HTTP Request** — POST a `https://api.groq.com/openai/v1/chat/completions` (Header Auth Bearer, JSON body, temperature 0, response_format json_object).
11. **Code in JavaScript** — `JSON.parse` de la respuesta + clasificación y estado deterministas.
12. **Switch** — tres salidas por score (prioritario/manual/secundario). Solo la rama prioritario pasa por **Telegram** (Send Message a RRHH).
13. **Append row in sheet** — persistencia con mapeo de todas las columnas e ID consecutivo.
14. **Respond to Webhook1** — HTML verde "solicitud enviada" (Content-Type: text/html).

### 4.3 Gestión de vacantes (RRHH)
- **Webhook2** (POST, path `nueva-vacante`, form-urlencoded) → **Code5** (validación de nombre y requisitos) → **Get row(s) hoja Vacantes** → **Code6** (duplicado por nombre de vacante) → **If3**:
  - duplicada → **Respond** (HTML amarillo "La vacante ya existe").
  - nueva → **Append row hoja Vacantes** (vacante, requisitos, activa=SI, fecha) → **Respond** (HTML verde "Vacante publicada").
- **Webhook3** (GET, path `vacantes`) → **Get row(s) hoja Vacantes** → **Code7** (filtra `activa = SI` y arma el arreglo JSON) → **Respond JSON** con cabecera de respuesta `Access-Control-Allow-Origin: *` y `Content-Type: application/json`. El formulario público consume este endpoint con `fetch()` al cargar la página para llenar el `<select>` de vacantes.

**Hoja "Vacantes" (nuevo tab del mismo Google Sheets):** columnas `vacante`, `requisitos`, `activa`, `fecha`.

### 4.2 Bot de consulta (RRHH)
- **Telegram Trigger** (message) → **Switch1** (comandos por string):
  - `/candidato <ID>` → Get row(s) filtrado por columna `id` (extracción del ID con `replace` + `trim`) → Send Message con la ficha completa del candidato.
  - `/pendientes` → Get row(s) filtrado por `estado = PENDIENTE_REVISION` → Code (formateo de lista) → Send Message.
- El Chat ID de respuesta se toma del mensaje entrante (`message.chat.id`), no fijo.

---

## 5. Configuración y Variables de Entorno

Ninguna credencial se almacena en el código ni en el repositorio. Todas viven como **credenciales de n8n**:

| Credencial | Dónde se obtiene | Uso |
|---|---|---|
| Google Sheets account (OAuth2) | Google Cloud / consentimiento OAuth | Lectura y escritura del Sheet |
| Header Auth (Groq) | console.groq.com → API Keys | `Authorization: Bearer <key>` en el HTTP Request |
| Telegram account | @BotFather → token del bot | Nodos Telegram y Telegram Trigger |
| Google Drive account (OAuth2) | Google Cloud (habilitar Drive API) / consentimiento OAuth | Subida temporal del archivo, conversión OCR y exportación de texto |

**Chat ID de RRHH:** se obtiene escribiendo primero al bot y consultando `https://api.telegram.org/bot<TOKEN>/getUpdates`.

**URL del webhook de producción:** generada por n8n con path personalizado; configurada como `action` del formulario HTML.

---

## 6. Prompts Utilizados

### 6.1 System prompt (análisis de CV)
```
Eres un asistente de RRHH que analiza hojas de vida. Evalúas la compatibilidad del candidato con la vacante indicada y respondes SOLO con un JSON válido, sin markdown ni texto adicional, con esta estructura exacta: {"score": <numero 0-100>, "experiencia_anios": <numero>, "habilidades": [<lista>], "nivel_educativo": "<...>", "fortalezas": [<2-4>], "brechas": [<2-4>], "coherencia": <"alta"|"media"|"baja">, "observacion_coherencia": "<1-2 lineas>", "resumen": "<2-3 lineas>"}.
Guía de puntaje: experiencia directa en el rol hasta 40 puntos, tecnologías requeridas hasta 30, formación hasta 20, certificaciones hasta 10.
Además: compara los datos declarados en el formulario con el contenido real del CV; si hay inconsistencias claras, menciónalo en las brechas, bájalo en coherencia y refléjalo bajando el score.
REGLAS: Nunca recomiendas descartar a nadie, solo priorizas la revisión humana. NUNCA evalúas ni mencionas género, edad, foto, estado civil, nacionalidad, religión, orientación sexual ni discapacidad — solo habilidades, experiencia y formación.
```

### 6.2 User prompt (plantilla)
```
Vacante: <vacante del formulario>. REQUISITOS DE LA VACANTE: <requisitos inyectados por Code3>. DATOS DECLARADOS POR EL CANDIDATO — Experiencia declarada: <experiencia>. Tecnologías declaradas: <tecnologias>. HOJA DE VIDA (PDF): <texto extraído del PDF>
```

**Decisiones de prompting:** `temperature: 0` para maximizar determinismo (tarea de evaluación, no generación creativa); `response_format: json_object` para restringir el espacio de salida a JSON parseable; rúbrica de puntaje explícita para que el score sea defendible; validación cruzada entre datos autodeclarados y evidencia documental.

### 6.3 Clasificación (código, no prompt)
```javascript
const s = analisis.score;
analisis.clasificacion =
  s >= 80 ? 'REVISION_PRIORITARIA' :
  s >= 60 ? 'REVISION_MANUAL' :
            'REVISION_SECUNDARIA';
analisis.estado = s >= 80 ? 'PENDIENTE_REVISION' : 'ANALIZADO';
```

---

## 7. Pruebas Realizadas

| # | Caso de prueba | Resultado esperado | Resultado |
|---|---|---|---|
| 1 | Postulación nueva completa con PDF | Fila en Sheet con ID, score y clasificación | ✅ |
| 2 | Mismo correo + misma vacante | Mensaje "Ya estás registrado", sin fila nueva, sin llamada a la IA | ✅ |
| 3 | Mismo correo + vacante diferente | Postulación procesada y guardada | ✅ |
| 4 | Datos inflados/inconsistentes (declara "más de 5 años" con CV de 3) | coherencia media/baja + observación de inconsistencia | ✅ Detectado por la IA |
| 5 | Tecnologías declaradas sin sentido ("wedwef") | Mencionado en brechas como posible error de tipeo | ✅ |
| 6 | Score ≥80 | Notificación Telegram a RRHH + estado PENDIENTE_REVISION | ✅ |
| 7 | Score <60 | Clasificación REVISION_SECUNDARIA calculada por código | ✅ |
| 8 | `/candidato TF-2026-XXXX` en el bot | Ficha completa del candidato | ✅ |
| 9 | `/pendientes` en el bot | Lista de candidatos con estado PENDIENTE_REVISION | ✅ |
| 10 | Sheet vacío (primera postulación) | Flujo completo sin frenarse ("Always Output Data") | ✅ |
| 11 | Consistencia del score ante misma entrada | Scores estables con temperature 0 | ✅ |
| 12 | Campo obligatorio vacío / correo mal formado | Respuesta "Datos inválidos" sin procesar el CV ni llamar a la IA | ✅ |
| 13 | Vacante con requisitos predefinidos | Score anclado a los requisitos de la vacante inyectados por Code3 | ✅ |
| 14 | PDF escaneado (imagen sin texto seleccionable, 0 caracteres extraíbles) | Texto reconocido vía OCR de Google Drive y postulación analizada normalmente | ✅ (score 20, habilidades extraídas, inconsistencia declarado↔CV detectada) |
| 15 | Hoja de vida subida como imagen (JPG/PNG) | Texto reconocido vía OCR y flujo completo | ✅ |
| 16 | Crear vacante desde la página RRHH | Fila nueva en hoja "Vacantes" y mensaje "Vacante publicada" | ✅ |
| 17 | Vacante nueva creada aparece en el formulario público | El `<select>` lista la vacante sin tocar el HTML | ✅ |
| 18 | Crear vacante con nombre duplicado | Mensaje "La vacante ya existe", sin fila nueva | ✅ |

---

## 8. Consideraciones de Seguridad

- API Keys y tokens únicamente en credenciales de n8n; el JSON del workflow exportado no contiene secretos.
- Validación de tipo de archivo (PDF, JPG o PNG) en el formulario.
- Validación de entrada en el flujo (campos obligatorios y formato de correo) antes de cualquier procesamiento o llamada a la IA.
- Consentimiento explícito de tratamiento de datos personales (checkbox obligatorio).
- Repositorio privado; acceso por invitación al Trainer.
- Respuesta del webhook con Content-Type controlado.

## 9. Consideraciones Éticas de IA

- La IA prioriza; el humano decide. No hay descarte automático.
- Criterios protegidos excluidos explícitamente en el prompt del sistema.
- Las reglas de negocio críticas (umbrales) son deterministas y auditables, no generadas por el modelo.
- Validación cruzada formulario↔CV como mecanismo de integridad del proceso.

## 10. Limitaciones Conocidas

- La calidad del OCR depende de la legibilidad de la imagen escaneada (fotos muy borrosas pueden dar texto imperfecto).
- Variabilidad residual mínima del LLM (mitigada con temperature 0 y JSON mode).
- ID consecutivo bajo supuesto de baja concurrencia (en producción se usarían secuencias de base de datos).
- Dependencia de APIs externas (Groq, Telegram, Google) y sus límites gratuitos.

## 11. Trabajo Futuro

- Autenticación para la página de RRHH (actualmente es una página de gestión interna; en producción requeriría login).
- Notificación por correo electrónico al candidato con su ID de seguimiento.
- Comando `/revisado <ID>` para actualización de estado desde el bot.
- Resumen diario automático de postulaciones para RRHH (Schedule Trigger).

---

## 12. Estructura del Repositorio

| Archivo | Contenido |
|---|---|
| `README.md` | Documentación técnica completa (este documento) |
| `workflow.json` | Exportación del workflow n8n (sin credenciales ni secretos) |
| `index.html` | Formulario web de postulación (vacantes dinámicas, PDF o imagen) |
| `rrhh.html` | Página de RRHH: creación de vacantes + dashboard embebido |
| `styles.css` | Estilos compartidos de ambas páginas |
| `script.js` | Lógica compartida (carga dinámica de vacantes, envío anti-CORS vía iframe y respuesta real de n8n) |

> **Nota:** reemplazar en `index.html` la URL del Webhook de postulación, en `rrhh.html` la URL del Webhook de vacantes y los `src` de los iframes de los gráficos publicados de Google Sheets, y en `script.js` la URL del Webhook GET de vacantes — todas por las URLs de producción generadas por n8n / Google Sheets.

---

## 13. Enlaces Finales

| Recurso | Enlace |
|---|---|
| Formulario publicado | *(pegar aquí la URL pública del formulario)* |
| Página RRHH publicada | *(pegar aquí la URL pública de rrhh.html)* |
| Dashboard (gráficos publicados de Sheets) | https://kbkgiv54abh2w.kimi.page/rrhh.html (embebidos en la sección "Dashboard del proceso") |
| Google Sheets (opcional, si el profesor tendrá acceso) | *(pegar aquí el enlace con permiso de lectura)* |
| Bot de Telegram | *(nombre de usuario del bot, ej. @TalentFlowAIBot)* |
