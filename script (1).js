// TalentFlow AI — lógica de las páginas públicas
// - index.html: formulario de postulación con carga dinámica de vacantes
// - rrhh.html: formulario de creación de vacantes
// Ambos envían al Webhook de n8n con fetch (multipart) y muestran la
// respuesta HTML (éxito / duplicado / datos inválidos) en un div.
// Nota: no se usa iframe porque n8n Cloud envía la cabecera
// X-Frame-Options: SAMEORIGIN, que bloquea la respuesta en iframes.
// Los Respond to Webhook del workflow incluyen Access-Control-Allow-Origin: *
// para permitir el fetch desde el navegador.

// URL del Webhook GET de n8n que devuelve las vacantes activas en JSON
const URL_VACANTES = 'https://reseto.app.n8n.cloud/webhook/vacantes';

// ============================================================
// Carga dinámica de vacantes (solo en la página de postulación)
// ============================================================
const selectVacante = document.getElementById('vacante');

// Vacantes de respaldo por si el endpoint aún no está disponible
const VACANTES_RESPALDO = [
  'Desarrollador Junior',
  'Analista de Datos',
  'Diseñador UX/UI',
  'Soporte Técnico',
  'Practicante de Talento Humano'
];

function llenarVacantes(lista) {
  selectVacante.innerHTML = '<option value="">— Selecciona una vacante —</option>';
  lista.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectVacante.appendChild(opt);
  });
}

if (selectVacante) {
  fetch(URL_VACANTES)
    .then((r) => r.json())
    .then((vacantes) => {
      if (Array.isArray(vacantes) && vacantes.length) {
        llenarVacantes(vacantes.map((v) => v.vacante));
      } else {
        llenarVacantes(VACANTES_RESPALDO);
      }
    })
    .catch(() => llenarVacantes(VACANTES_RESPALDO));
}

// ============================================================
// Utilidad compartida: envío con fetch y respuesta real de n8n
// ============================================================
function manejarEnvio(formId, btnId, msgId, boxId, textoBoton, textoEnviando) {
  const form = document.getElementById(formId);
  const btn = document.getElementById(btnId);
  const msg = document.getElementById(msgId);
  const box = document.getElementById(boxId);
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    msg.className = 'msg sending';
    msg.style.display = '';
    msg.textContent = textoEnviando;
    box.classList.remove('visible');
    box.innerHTML = '';

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form)
      });
      const html = await res.text();
      box.innerHTML = html;
      box.classList.add('visible');
      msg.className = 'msg';
      msg.style.display = 'none';
      form.reset();
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      msg.className = 'msg sending';
      msg.textContent = '❌ No se pudo conectar con el servidor. Intenta de nuevo.';
    }

    btn.disabled = false;
    btn.textContent = textoBoton;
  });
}

// Página pública: postulación de candidatos
manejarEnvio('postulacionForm', 'btn', 'msg', 'confirmBox',
             'Enviar postulación', '⏳ Enviando tu postulación...');

// Página RRHH: creación de vacantes
manejarEnvio('vacanteForm', 'btnVacante', 'msgVacante', 'vacanteBox',
             'Publicar vacante', '⏳ Publicando vacante...');
