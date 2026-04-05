// ═══════════════════════════════════════════════════════════════
//  OficiosYA — app.js
//  Stack: Vanilla JS + Supabase
//  Roles: admin (admin@oficiosya.com) | usuario
// ═══════════════════════════════════════════════════════════════

import { supabase } from "./supabaseClient.js";

// ─── CONSTANTES ─────────────────────────────────────────────────
const ADMIN_EMAIL = "admin@oficiosya.com";
const OFICIO_EMOJIS = {
  Electricista:"💡", Plomero:"🔩", Gasista:"🔥", Carpintero:"🪵",
  Pintor:"🎨", Cerrajero:"🔑", Técnico:"📱", Albañil:"🧱", Jardinero:"🌿",
};
const AVATAR_COLORS = [
  "#E01E2B","#b8151f","#c0392b","#922b21","#7b241c",
  "#1a1a2e","#16213e","#0f3460","#1a472a","#4a235a",
];
const DEBOUNCE_MS = 350;

// ─── ESTADO ─────────────────────────────────────────────────────
const state = {
  user:          null,
  isAdmin:       false,
  profesionales: [],
  filtroOficio:  "todos",
  busqueda:      "",
  orden:         "rating",
  profActual:    null,
  starsSel:      0,
  debounceTimer: null,
};

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) setUser(session.user);
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      renderNav();
      renderGrid();
      if (state.isAdmin) renderAdminStats();
    });
    await loadProfesionales();
    renderGrid();
    renderStats();
  } catch (err) {
    console.error("Init error:", err);
    showAlert("Error al iniciar la aplicación.", "error");
  } finally {
    hideLoader();
  }
}

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════
function setUser(user) {
  state.user    = user;
  state.isAdmin = user?.email === ADMIN_EMAIL;
  renderNav();
}

async function login() {
  const email = val("login-email").trim().toLowerCase();
  const pass  = val("login-pass");
  if (!email || !pass) return showAlert("Completá email y contraseña.", "error");
  if (!isValidEmail(email)) return showAlert("Email inválido.", "error");
  setBtnLoading("btn-login", true);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    closeModal("m-auth");
    showAlert("¡Bienvenido de vuelta! 👋", "success");
    clearAuthForms();
  } catch (err) {
    showAlert(authErrorMsg(err.message), "error");
  } finally {
    setBtnLoading("btn-login", false);
  }
}

async function register() {
  const email = val("reg-email").trim().toLowerCase();
  const pass  = val("reg-pass");
  const pass2 = val("reg-pass2");
  if (!email || !pass || !pass2) return showAlert("Completá todos los campos.", "error");
  if (!isValidEmail(email)) return showAlert("Email inválido.", "error");
  if (pass.length < 6) return showAlert("La contraseña debe tener al menos 6 caracteres.", "error");
  if (pass !== pass2) return showAlert("Las contraseñas no coinciden.", "error");
  setBtnLoading("btn-register", true);
  try {
    const { error } = await supabase.auth.signUp({ email, password: pass });
    if (error) throw error;
    closeModal("m-auth");
    showAlert("¡Cuenta creada! Revisá tu email para confirmar.", "success");
    clearAuthForms();
  } catch (err) {
    showAlert(authErrorMsg(err.message), "error");
  } finally {
    setBtnLoading("btn-register", false);
  }
}

async function logout() {
  await supabase.auth.signOut();
  state.user = null;
  state.isAdmin = false;
  renderNav();
  renderGrid();
  showAlert("Sesión cerrada.", "info");
}

// ═══════════════════════════════════════════════════════════════
//  DATA — PROFESIONALES
// ═══════════════════════════════════════════════════════════════
async function loadProfesionales() {
  try {
    const { data, error } = await supabase
      .from("profesionales")
      .select(`
        id, nombre, oficio, telefono, ubicacion, descripcion,
        user_id, created_at, views,
        calificaciones ( estrellas ),
        comentarios ( id )
      `)
      .order("created_at", { ascending: false });
    if (error) throw error;
    state.profesionales = (data || []).map(enrichProf);
  } catch (err) {
    console.error("loadProfesionales:", err);
    showAlert("No se pudieron cargar los profesionales.", "error");
  }
}

function enrichProf(p) {
  const cals = p.calificaciones || [];
  const avg  = cals.length
    ? cals.reduce((a, c) => a + c.estrellas, 0) / cals.length
    : 0;
  return {
    ...p,
    avg:        Math.round(avg * 10) / 10,
    totalCals:  cals.length,
    totalComs:  (p.comentarios || []).length,
  };
}

async function registrarProfesional() {
  if (!state.user) return openModal("m-auth");
  const nombre    = val("rp-nombre").trim();
  const oficio    = val("rp-oficio");
  const telefono  = val("rp-tel").trim();
  const ubicacion = val("rp-ubicacion").trim();
  const descripcion = val("rp-desc").trim();
  if (!nombre || !oficio || !telefono || !ubicacion || !descripcion)
    return showAlert("Completá todos los campos obligatorios.", "error");
  if (!isValidTel(telefono))
    return showAlert("El teléfono parece incorrecto.", "error");
  if (descripcion.length > 400)
    return showAlert("La descripción supera los 400 caracteres.", "error");
  setBtnLoading("btn-guardar-prof", true);
  try {
    const { error } = await supabase.from("profesionales").insert({
      nombre, oficio, telefono, ubicacion, descripcion,
      user_id: state.user.id,
      views: 0,
    });
    if (error) throw error;
    closeModal("m-registrar-prof");
    clearProfForm();
    await loadProfesionales();
    renderGrid();
    renderStats();
    showAlert(`¡Perfil de ${nombre.split(" ")[0]} publicado! 🎉`, "success");
  } catch (err) {
    showAlert("Error al publicar el perfil: " + err.message, "error");
  } finally {
    setBtnLoading("btn-guardar-prof", false);
  }
}

async function eliminarProfesional() {
  const p = state.profActual;
  if (!p) return;
  if (!state.user) return showAlert("Iniciá sesión para continuar.", "error");
  const isOwner = p.user_id === state.user.id;
  if (!isOwner && !state.isAdmin)
    return showAlert("No tenés permiso para eliminar este perfil.", "error");
  if (!confirm(`¿Eliminás el perfil de ${p.nombre}? Esta acción no se puede deshacer.`)) return;
  try {
    const { error } = await supabase.from("profesionales").delete().eq("id", p.id);
    if (error) throw error;
    closeModal("m-perfil");
    state.profActual = null;
    await loadProfesionales();
    renderGrid();
    renderStats();
    showAlert("Perfil eliminado.", "info");
  } catch (err) {
    showAlert("Error al eliminar: " + err.message, "error");
  }
}

// ═══════════════════════════════════════════════════════════════
//  VISTAS (views)
// ═══════════════════════════════════════════════════════════════
async function sumarVista(id) {
  try {
    // Incremento atómico via RPC (ver SQL setup en README)
    const { error } = await supabase.rpc("increment_views", { prof_id: id });
    if (error) {
      // Fallback: leer + update
      const { data } = await supabase.from("profesionales").select("views").eq("id", id).single();
      await supabase.from("profesionales").update({ views: (data?.views ?? 0) + 1 }).eq("id", id);
    }
    // Actualizar local
    const local = state.profesionales.find(p => p.id === id);
    if (local) local.views = (local.views ?? 0) + 1;
  } catch (err) {
    console.warn("sumarVista:", err);
  }
}

// ═══════════════════════════════════════════════════════════════
//  COMENTARIOS Y CALIFICACIONES
// ═══════════════════════════════════════════════════════════════
async function loadComentarios(profId) {
  try {
    const { data, error } = await supabase
      .from("comentarios")
      .select("id, comentario, created_at, user_id")
      .eq("profesional_id", profId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("loadComentarios:", err);
    return [];
  }
}

async function loadCalificacion(profId, userId) {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from("calificaciones")
      .select("estrellas")
      .eq("profesional_id", profId)
      .eq("user_id", userId)
      .maybeSingle();
    return data?.estrellas ?? null;
  } catch { return null; }
}

async function enviarComentario() {
  if (!state.user) return showAlert("Iniciá sesión para comentar.", "error");
  const p   = state.profActual;
  const txt = val("comentario-txt").trim();
  if (!txt) return showAlert("Escribí un comentario.", "error");
  if (txt.length < 5) return showAlert("El comentario es muy corto.", "error");
  if (state.starsSel === 0) return showAlert("Seleccioná una calificación.", "error");
  try {
    // Upsert calificación
    await supabase.from("calificaciones").upsert({
      profesional_id: p.id,
      user_id:        state.user.id,
      estrellas:      state.starsSel,
    }, { onConflict: "profesional_id,user_id" });
    // Insertar comentario
    const { error } = await supabase.from("comentarios").insert({
      profesional_id: p.id,
      user_id:        state.user.id,
      comentario:     sanitize(txt),
    });
    if (error) throw error;
    document.getElementById("comentario-txt").value = "";
    state.starsSel = 0;
    renderStarsInput(0);
    // Recargar perfil
    await loadProfesionales();
    renderGrid();
    await abrirPerfilInner(p.id, false); // no sumar vista de nuevo
    showAlert("¡Calificación publicada! Gracias. ⭐", "success");
  } catch (err) {
    showAlert("Error al publicar: " + err.message, "error");
  }
}

function selStar(n) {
  state.starsSel = n;
  renderStarsInput(n);
}

function renderStarsInput(n) {
  document.querySelectorAll("#stars-input .star-interactive").forEach((el, i) => {
    el.className = `star-interactive ${i < n ? "star-on" : "star-off"}`;
  });
}

// ═══════════════════════════════════════════════════════════════
//  ABRIR PERFIL
// ═══════════════════════════════════════════════════════════════
async function abrirPerfil(id) {
  await abrirPerfilInner(id, true);
}

async function abrirPerfilInner(id, contarVista = true) {
  const p = state.profesionales.find(x => x.id === id);
  if (!p) return;
  state.profActual = p;
  if (contarVista) await sumarVista(id);

  // Avatar
  const av = document.getElementById("mp-av");
  av.style.background = avatarColor(p.nombre);
  av.textContent = initials(p.nombre);

  // Datos básicos
  setText("mp-nombre",    p.nombre);
  setText("mp-oficio",    `${OFICIO_EMOJIS[p.oficio] || "🔧"} ${p.oficio}`);
  setText("mp-ubicacion", `📍 ${p.ubicacion}`);
  setText("mp-tel",       p.telefono);
  setText("mp-ubi",       p.ubicacion);
  setText("mp-desc",      p.descripcion);
  setText("mp-vistas",    p.views ?? 0);

  // WA
  const waLink = document.getElementById("mp-wa");
  const telNum = p.telefono.replace(/\D/g, "");
  waLink.href = `https://wa.me/549${telNum}?text=${encodeURIComponent(`Hola ${p.nombre}, te contacto desde OficiosYA.`)}`;

  // Rating
  const rat = p.avg > 0 ? p.avg.toFixed(1) : "—";
  setText("mp-rating-num", rat);
  document.getElementById("mp-stars").innerHTML = starsHTML(p.avg, 18);
  setText("mp-rating-detail", `${p.totalCals} calificación${p.totalCals !== 1 ? "es" : ""}`);

  // Botón eliminar — solo dueño o admin
  const btnEl = document.getElementById("mp-eliminar");
  if (state.user && (p.user_id === state.user.id || state.isAdmin)) {
    btnEl.classList.remove("hidden");
  } else {
    btnEl.classList.add("hidden");
  }

  // Comentarios
  const comentarios = await loadComentarios(id);
  const comList = document.getElementById("mp-comentarios");
  comList.innerHTML = comentarios.length
    ? comentarios.map(c => `
        <div class="comentario-item">
          <div class="comentario-top">
            <span class="comentario-autor">👤 ${maskEmail(c.user_id)}</span>
            <span class="comentario-fecha">${relativeTime(c.created_at)}</span>
          </div>
          <div class="comentario-texto">${escapeHtml(c.comentario)}</div>
        </div>`).join("")
    : `<p style="color:var(--gris-400);font-size:13px;">Todavía no hay comentarios.</p>`;

  // Mostrar/ocultar form según sesión
  const formWrap = document.getElementById("form-comentario-wrap");
  const loginCTA = document.getElementById("form-login-cta");
  if (state.user) {
    formWrap.classList.remove("hidden");
    loginCTA.classList.add("hidden");
    // Pre-cargar calificación previa
    const prevStar = await loadCalificacion(id, state.user.id);
    state.starsSel = prevStar ?? 0;
    renderStarsInput(state.starsSel);
    document.getElementById("comentario-txt").value = "";
  } else {
    formWrap.classList.add("hidden");
    loginCTA.classList.remove("hidden");
  }

  openModal("m-perfil");
}

// ═══════════════════════════════════════════════════════════════
//  RENDER NAV
// ═══════════════════════════════════════════════════════════════
function renderNav() {
  const guest = document.getElementById("nav-guest");
  const user  = document.getElementById("nav-user");
  if (state.user) {
    guest.classList.add("hidden");
    user.classList.remove("hidden");
    setText("nav-email", state.user.email);
    document.getElementById("nav-avatar").textContent = initials(state.user.email);
    const adminBadge = document.getElementById("nav-admin-badge");
    state.isAdmin
      ? adminBadge.classList.remove("hidden")
      : adminBadge.classList.add("hidden");
    document.getElementById("btn-registrar-prof")?.classList.remove("hidden");
    if (state.isAdmin) {
      document.getElementById("btn-admin")?.classList.remove("hidden");
    }
  } else {
    guest.classList.remove("hidden");
    user.classList.add("hidden");
    document.getElementById("btn-registrar-prof")?.classList.add("hidden");
    document.getElementById("btn-admin")?.classList.add("hidden");
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER GRID
// ═══════════════════════════════════════════════════════════════
function renderGrid() {
  const busq = state.busqueda.toLowerCase();
  let lista = state.profesionales.filter(p => {
    const mOf = state.filtroOficio === "todos" || p.oficio === state.filtroOficio;
    const mBq = !busq || p.nombre.toLowerCase().includes(busq)
                       || p.oficio.toLowerCase().includes(busq)
                       || (p.descripcion || "").toLowerCase().includes(busq)
                       || (p.ubicacion || "").toLowerCase().includes(busq);
    return mOf && mBq;
  });

  lista = sortLista(lista, state.orden);

  setText("ctr", `(${lista.length})`);
  const grid = document.getElementById("grid");

  if (!lista.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="ico">🔍</div>
        <h3>Sin resultados</h3>
        <p>Probá con otro oficio o término de búsqueda.</p>
      </div>`;
    return;
  }

  grid.innerHTML = lista.map(tarjetaHTML).join("");
}

function sortLista(lista, orden) {
  return [...lista].sort((a, b) => {
    if (orden === "rating")   return b.avg - a.avg;
    if (orden === "vistas")   return (b.views ?? 0) - (a.views ?? 0);
    if (orden === "nombre")   return a.nombre.localeCompare(b.nombre);
    if (orden === "reciente") return new Date(b.created_at) - new Date(a.created_at);
    return 0;
  });
}

function tarjetaHTML(p) {
  const pr = p.avg > 0 ? p.avg.toFixed(1) : "—";
  const col = avatarColor(p.nombre);
  const em  = OFICIO_EMOJIS[p.oficio] || "🔧";
  return `
  <div class="card prof-card" onclick="App.abrirPerfil('${p.id}')">
    <div class="prof-card-inner">
      <div class="prof-card-header">
        <div class="prof-avatar" style="background:${col};">${initials(p.nombre)}</div>
        <div class="prof-card-info">
          <div class="prof-nombre">${escapeHtml(p.nombre)}</div>
          <div class="prof-meta">
            <span class="prof-oficio">${em} ${escapeHtml(p.oficio)}</span>
            <span class="prof-ubicacion">${escapeHtml(p.ubicacion)}</span>
          </div>
          <div class="prof-rating-row">
            ${starsHTML(p.avg, 13)}
            <span class="prof-rating-num">${pr}</span>
            <span class="prof-rating-count">(${p.totalCals} cal.)</span>
          </div>
        </div>
      </div>
      <p class="prof-desc">${escapeHtml(p.descripcion || "")}</p>
      <div class="prof-card-footer">
        <div class="prof-views">
          <span>👁</span><span>${p.views ?? 0} vistas</span>
        </div>
        <button class="btn btn-wa btn-sm" onclick="event.stopPropagation();waClick('${p.telefono}','${escapeHtml(p.nombre)}')">💬 WA</button>
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  RENDER STATS (hero)
// ═══════════════════════════════════════════════════════════════
function renderStats() {
  const profs   = state.profesionales.length;
  const vistas  = state.profesionales.reduce((a, p) => a + (p.views ?? 0), 0);
  const cals    = state.profesionales.flatMap(p => Array(p.totalCals).fill(p.avg));
  const avgGlob = cals.length
    ? (cals.reduce((a, v) => a + v, 0) / cals.length).toFixed(1)
    : "—";
  animCount("stat-profs",  profs);
  animCount("stat-vistas", vistas);
  setText("stat-rating", avgGlob);
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════
function renderAdminStats() {
  if (!state.isAdmin) return;
  const profs  = state.profesionales.length;
  const vistas = state.profesionales.reduce((a, p) => a + (p.views ?? 0), 0);
  const allAvg = state.profesionales.filter(p => p.avg > 0).map(p => p.avg);
  const rat    = allAvg.length
    ? (allAvg.reduce((a, v) => a + v, 0) / allAvg.length).toFixed(1)
    : "—";
  setText("adm-profs",  profs);
  setText("adm-rating", rat);
  setText("adm-vistas", vistas);

  // Lista profesionales admin
  const sorted = [...state.profesionales].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  document.getElementById("adm-profs-tab").innerHTML = sorted.length
    ? sorted.map(p => `
        <div class="admin-prof-row">
          <div class="prof-avatar" style="width:36px;height:36px;min-width:36px;border-radius:8px;font-size:13px;background:${avatarColor(p.nombre)};">${initials(p.nombre)}</div>
          <div class="admin-prof-info">
            <div class="admin-prof-nombre">${escapeHtml(p.nombre)}</div>
            <div class="admin-prof-meta">${p.oficio} · ${p.ubicacion} · 👁 ${p.views ?? 0} · ★ ${p.avg > 0 ? p.avg.toFixed(1) : "—"}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-outline btn-sm" onclick="App.abrirPerfil('${p.id}')">Ver</button>
            <button class="btn btn-danger btn-sm" onclick="adminEliminar('${p.id}','${escapeHtml(p.nombre)}')">🗑</button>
          </div>
        </div>`).join("")
    : `<p style="color:var(--gris-500);font-size:13px;padding:12px 0;">No hay profesionales registrados.</p>`;

  // Stats tab
  document.getElementById("adm-stats-tab").innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="background:linear-gradient(135deg,var(--negro),var(--negro-3));border-radius:var(--r-sm);padding:16px;border:1px solid var(--negro-4);">
        <div style="color:rgba(255,255,255,.38);font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Top 5 por vistas</div>
        ${[...state.profesionales].sort((a,b)=>(b.views??0)-(a.views??0)).slice(0,5).map((p,i)=>`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <span style="font-family:'Syne',sans-serif;font-weight:700;color:var(--rojo);width:18px;font-size:13px;">${i+1}</span>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;color:white;">${escapeHtml(p.nombre)}</div>
              <div style="font-size:11px;color:rgba(255,255,255,.38);">${p.oficio}</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
              <span style="color:var(--rojo);font-family:'Syne',sans-serif;font-weight:700;font-size:16px;">${p.views ?? 0}</span>
              <span style="font-size:11px;color:rgba(255,255,255,.38);">vistas</span>
            </div>
          </div>
        `).join("")}
      </div>
      <div style="background:var(--gris-50);border-radius:var(--r-sm);padding:14px;font-size:13px;color:var(--gris-600);">
        💡 Para ver analytics avanzados integrá con <strong>Plausible</strong> o <strong>PostHog</strong> en producción.
      </div>
    </div>`;
}

async function adminEliminar(id, nombre) {
  if (!state.isAdmin) return;
  if (!confirm(`¿Eliminás el perfil de ${nombre}?`)) return;
  try {
    const { error } = await supabase.from("profesionales").delete().eq("id", id);
    if (error) throw error;
    await loadProfesionales();
    renderGrid();
    renderStats();
    renderAdminStats();
    showAlert(`Perfil de ${nombre} eliminado.`, "info");
  } catch (err) {
    showAlert("Error al eliminar: " + err.message, "error");
  }
}

// ═══════════════════════════════════════════════════════════════
//  FILTROS / BUSQUEDA / ORDEN
// ═══════════════════════════════════════════════════════════════
function filtrar(el, oficio) {
  document.querySelectorAll(".filtro-chip").forEach(c => c.classList.remove("activo"));
  el.classList.add("activo");
  state.filtroOficio = oficio;
  renderGrid();
}

function buscar(q) {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.busqueda = q;
    renderGrid();
  }, DEBOUNCE_MS);
}

function ordenar(val) {
  state.orden = val;
  renderGrid();
}

// ═══════════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════════
function val(id) {
  return (document.getElementById(id)?.value ?? "").trim();
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function setBtnLoading(id, loading) {
  const el = document.getElementById(id);
  if (!el) return;
  el.disabled = loading;
  if (loading) el.dataset.orig = el.textContent, el.textContent = "Cargando…";
  else el.textContent = el.dataset.orig || el.textContent;
}

function showAlert(msg, type = "info") {
  const container = document.getElementById("alert-container");
  const div = document.createElement("div");
  div.className = `alert alert-${type}`;
  div.innerHTML = `<span>${msg}</span>`;
  div.addEventListener("click", () => dismissAlert(div));
  container.appendChild(div);
  setTimeout(() => dismissAlert(div), 4000);
}

function dismissAlert(el) {
  el.classList.add("fade-out");
  el.addEventListener("animationend", () => el.remove(), { once: true });
}

function hideLoader() {
  const loader = document.getElementById("loader");
  loader.classList.add("fade-out");
  loader.addEventListener("transitionend", () => loader.remove(), { once: true });
}

function animCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let cur = 0;
  const step = Math.ceil(target / 28);
  const iv = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur.toLocaleString();
    if (cur >= target) clearInterval(iv);
  }, 40);
}

// ═══════════════════════════════════════════════════════════════
//  MODAL HELPERS
// ═══════════════════════════════════════════════════════════════
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("open");
  document.body.style.overflow = "hidden";
  if (id === "m-admin") renderAdminStats();
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
  document.body.style.overflow = "";
}

function closeModalOutside(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

function switchAuthTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("tab-login").classList.toggle("activo", isLogin);
  document.getElementById("tab-register").classList.toggle("activo", !isLogin);
  document.getElementById("auth-login-form").classList.toggle("hidden", !isLogin);
  document.getElementById("auth-register-form").classList.toggle("hidden", isLogin);
}

function adminTab(el, tabId) {
  document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("activo"));
  el.classList.add("activo");
  ["adm-profs-tab", "adm-stats-tab"].forEach(id =>
    document.getElementById(id).classList.toggle("hidden", id !== tabId)
  );
}

function clearAuthForms() {
  ["login-email","login-pass","reg-email","reg-pass","reg-pass2"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function clearProfForm() {
  ["rp-nombre","rp-oficio","rp-tel","rp-ubicacion","rp-desc"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// ═══════════════════════════════════════════════════════════════
//  MISC HELPERS
// ═══════════════════════════════════════════════════════════════
function waClick(tel, nombre) {
  const num = tel.replace(/\D/g, "");
  window.open(
    `https://wa.me/549${num}?text=${encodeURIComponent(`Hola ${nombre}, te contacto desde OficiosYA.`)}`,
    "_blank", "noopener"
  );
}

function starsHTML(avg, size = 14) {
  let h = "";
  for (let i = 1; i <= 5; i++)
    h += `<span class="${i <= Math.round(avg) ? "star-on" : "star-off"}" style="font-size:${size}px;">★</span>`;
  return `<span class="stars">${h}</span>`;
}

function avatarColor(name = "") {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name = "") {
  return name.split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase() || "?";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidTel(tel) {
  return tel.replace(/\D/g, "").length >= 7;
}

function sanitize(str) {
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
}

function escapeHtml(str = "") {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function maskEmail(userId = "") {
  // userId es UUID de Supabase — mostrar primeros 8 chars
  return `usuario_${userId.slice(0, 8)}`;
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} día${d > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("es-AR");
}

function authErrorMsg(msg = "") {
  if (msg.includes("Invalid login")) return "Email o contraseña incorrectos.";
  if (msg.includes("already registered")) return "Este email ya está registrado.";
  if (msg.includes("Email not confirmed")) return "Confirmá tu email antes de ingresar.";
  return msg;
}

// ═══════════════════════════════════════════════════════════════
//  EXPOSICIÓN GLOBAL (onclick en HTML)
// ═══════════════════════════════════════════════════════════════
window.App = {
  login, register, logout,
  registrarProfesional, eliminarProfesional,
  abrirPerfil, enviarComentario, selStar,
  filtrar, buscar, ordenar,
};
window.openModal          = openModal;
window.closeModal         = closeModal;
window.closeModalOutside  = closeModalOutside;
window.switchAuthTab      = switchAuthTab;
window.adminTab           = adminTab;
window.adminEliminar      = adminEliminar;
window.waClick            = waClick;

// ─── BOOTSTRAP ──────────────────────────────────────────────────
init();
