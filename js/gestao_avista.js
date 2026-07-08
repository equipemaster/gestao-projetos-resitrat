// ─── Gestão à Vista — rotating kiosk dashboard ─────────────────────────────────

const SLIDE_INTERVAL_MS = 15000;
const REFRESH_INTERVAL_MS = 60000;
const ALL_SLIDE_IDS = ['slide-progress', 'slide-3d', 'slide-hold', 'slide-done', 'slide-cost'];
const SCROLL_TARGETS = { 'slide-progress': 'progress-grid', 'slide-3d': 'threed-grid', 'slide-hold': 'hold-grid', 'slide-done': 'done-grid', 'slide-cost': 'cost-list' };

// Every status this kiosk is capable of displaying (in progress, on hold,
// completed — both the current English values and legacy Portuguese ones).
// Anything outside this set (e.g. a Cancelled project) is filtered out by the
// backend query in loadData() rather than fetched and discarded client-side.
const RELEVANT_PROJECT_STATUSES = ['In Progress', 'Em Andamento', 'On Hold', 'Em Espera', 'Completed', 'Concluído'];

let currentSlide = 0;
let slideTimer = null;
let scrollAnimId = null;
let allProjects = [];
let allExits = [];
let clientMap = {};
let tasksByProject = {};
let threeDPreviewByProject = {};

// Only rotate through slides that actually have something to show — e.g. skip
// "Em Espera" entirely if there are no on-hold projects right now. The cost
// slide isn't a project-status bucket, so it always stays in rotation (it has
// its own empty state for "no exits this month").
let activeSlides = [...ALL_SLIDE_IDS];

function computeActiveSlides() {
    const active = [];
    if (allProjects.some(p => isEffectivelyInProgress(p))) active.push('slide-progress');
    if (allProjects.some(p => isVisible3d(p))) active.push('slide-3d');
    if (allProjects.some(p => isOnHold(p.status))) active.push('slide-hold');
    if (allProjects.some(p => isEffectivelyCompleted(p))) active.push('slide-done');
    active.push('slide-cost');
    return active;
}

document.addEventListener('DOMContentLoaded', async () => {
    startClock();
    await loadData();
    startSlideRotation();
    setInterval(loadData, REFRESH_INTERVAL_MS);
});

// ─── Clock ──────────────────────────────────────────────────────────────────

function startClock() {
    const update = () => {
        const now = new Date();
        const clockEl = document.getElementById('live-clock');
        const dateEl = document.getElementById('live-date');
        if (clockEl) clockEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (dateEl) dateEl.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    };
    update();
    setInterval(update, 1000);
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

// [start, end) bounds for "this month", used to scope the stock-exits query
// to only the rows the cost slide actually displays.
function currentMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
}

async function loadData() {
    try {
        // The kiosk only ever shows these statuses (Cancelled/unknown statuses
        // are never rendered on any slide) — filtering server-side via .in()
        // means Postgres does the filtering instead of shipping every project
        // ever created down the wire just to discard most of it in JS. Same
        // idea for stock exits: the cost slide only ever shows the current
        // month, so the query is scoped to that range instead of pulling the
        // entire, ever-growing exit history.
        const { startISO, endISO } = currentMonthRange();
        const [projects, exits, clients] = await Promise.all([
            fetchProjectSummariesByStatus(RELEVANT_PROJECT_STATUSES),
            fetchStockExitsForDateRange(startISO, endISO),
            fetchClients()
        ]);

        allProjects = projects || [];
        allExits = exits || [];
        clientMap = {};
        (clients || []).forEach(c => clientMap[c.id] = c);

        // Tasks are only needed for the projects actually being displayed —
        // scope the query to those project ids instead of fetching the whole
        // tasks table.
        const tasks = await fetchTasksByProjectIds(allProjects.map(p => p.id));
        tasksByProject = {};
        (tasks || []).forEach(t => {
            if (!t.project_id) return;
            (tasksByProject[t.project_id] = tasksByProject[t.project_id] || []).push(t);
        });

        renderProgressSlide(allProjects);
        renderHoldSlide(allProjects);
        renderDoneSlide(allProjects);
        renderCostSlide(allExits);
        refreshActiveSlides();

        // Re-rendering replaces innerHTML (scrollTop resets to 0) — restart the
        // auto-scroll for whichever slide is currently on screen.
        autoScrollActiveSlide();

        // Fire-and-forget: rendering a PDF's first page to SVG
        // (loadThreeDPreviewsAndRender, below) means a signed-URL round trip +
        // pdf.js parse + SVG build per project with a 3D attachment, which
        // can take seconds. loadData() used to await this before doing
        // anything else, so opening the kiosk — and every 60s refresh —
        // stalled the "Em Andamento" slide (and slide rotation start) behind
        // however long the 3D renders took, even though that's unrelated
        // data. Not awaiting here lets the caller (DOMContentLoaded / the
        // refresh interval) move on immediately; loadThreeDPreviewsAndRender()
        // patches slide-3d in progressively, block by block, as each finishes.
        loadThreeDPreviewsAndRender(allProjects);
    } catch (e) {
        console.error('Error loading Gestão à Vista data:', e);
    }
}

// Recomputes which slides currently have data. Keeps showing whichever slide
// is on screen if it still qualifies (e.g. a periodic refresh shouldn't yank
// the display away mid-view); only jumps back to the first slide if the one
// being shown just lost its last project.
function refreshActiveSlides() {
    const currentSlideId = activeSlides[currentSlide];
    activeSlides = computeActiveSlides();
    const idx = activeSlides.indexOf(currentSlideId);
    currentSlide = idx !== -1 ? idx : 0;
    applySlideVisibility();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value || 0);
}

function isInProgress(status) {
    return status === 'In Progress' || status === 'Em Andamento';
}

function isCompleted(status) {
    return status === 'Completed' || status === 'Concluído';
}

function isOnHold(status) {
    return status === 'On Hold' || status === 'Em Espera';
}

// A project pode estar marcado como Completed no banco mas ainda ter uma tarefa
// pendente (ex.: uma tarefa nova adicionada depois da conclusão automática) —
// nesses casos ele deve continuar aparecendo em "Em Andamento" até que todas as
// tarefas estejam de fato concluídas.
function hasPendingTasks(projectId) {
    const tasks = tasksByProject[projectId] || [];
    return tasks.some(t => t.status !== 'Done' && t.status !== 'Concluída');
}

function isEffectivelyCompleted(p) {
    return isCompleted(p.status) && !hasPendingTasks(p.id);
}

function isEffectivelyInProgress(p) {
    if (isInProgress(p.status)) return true;
    return isCompleted(p.status) && hasPendingTasks(p.id);
}

// Cancelled projects are never shown on any slide (matches the other status
// slides, which likewise only cover in-progress/on-hold/completed).
function isVisible3d(p) {
    return !!p.project_3d_pdf_path && (isEffectivelyInProgress(p) || isOnHold(p.status) || isEffectivelyCompleted(p));
}

// The kiosk shows the 3D design directly on the card (no click required), so
// the PDF's first page is rendered client-side via pdf.js — as an inline
// SVG rather than a rasterized PNG data URL. These are engineering design
// PDFs, i.e. mostly vector line-art, so an SVG stays crisp at any tile size
// and is typically far lighter than a canvas-rasterized-then-PNG-encoded
// image of the same page, with no need to pick a target pixel width up
// front (unlike a raster, an SVG scales via CSS with no quality loss, so
// there's no THREE_D_PREVIEW_TARGET_WIDTH tradeoff to make). The storage
// bucket is private, so a signed URL is still needed to fetch the PDF
// bytes, but once rendered the SVG markup itself needs no further requests.
const PROJECT_3D_BUCKET = 'project-3d-pdfs';

// Rendered previews are cached by storage path so an unchanged attachment
// isn't re-rendered on every 60s refresh — only new/changed attachments pay
// the pdf.js render cost.
const threeDPreviewCache = {};

async function renderPdfFirstPageToSvg(url) {
    const pdf = await pdfjsLib.getDocument(url).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const opList = await page.getOperatorList();
    const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
    const svgElement = await svgGfx.getSVG(opList, viewport);
    // getSVG sizes the element in absolute px and sets preserveAspectRatio to
    // "none" (stretch to fill). The card should instead scale the SVG to fit
    // its box the way object-contain does for an <img>: stretch width/height
    // to fill the container, but swap preserveAspectRatio to "xMidYMid meet"
    // so the viewBox getSVG already set is scaled proportionally (never
    // cropped/stretched) and centered within it.
    svgElement.setAttribute('width', '100%');
    svgElement.setAttribute('height', '100%');
    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return new XMLSerializer().serializeToString(svgElement);
}

// Loads/renders 3D previews in sequential blocks rather than kicking off
// every pending PDF at once — a project list with a dozen 3D attachments
// used to open a dozen parallel fetch+render pipelines the moment the kiosk
// loaded. Instead, pending PDFs are chunked into blocks of
// THREE_D_BLOCK_SIZE: each block's signed URLs are requested together in one
// batched call, rendered in parallel among themselves, patched into the
// slide, and only then does the next block start — so the browser never has
// more than one block's worth of PDFs in flight, and the slide fills in
// progressively block by block instead of all-or-nothing. Pending PDFs are
// sorted alphabetically first (matching the order the slide itself renders
// in) so the first block loaded is also the first block seen on screen.
const THREE_D_BLOCK_SIZE = 3;

async function loadThreeDPreviewsAndRender(projects) {
    try {
        const withPdf = projects.filter(p => p.project_3d_pdf_path);

        const pending = [];
        withPdf.forEach(p => {
            const cached = threeDPreviewCache[p.project_3d_pdf_path];
            if (cached) threeDPreviewByProject[p.id] = cached;
            else pending.push(p);
        });
        pending.sort((a, b) => a.name.localeCompare(b.name));

        renderThreeDSlide(projects);
        refreshActiveSlides();

        for (let i = 0; i < pending.length; i += THREE_D_BLOCK_SIZE) {
            const block = pending.slice(i, i + THREE_D_BLOCK_SIZE);

            let signedUrlByPath = {};
            try {
                const paths = block.map(p => p.project_3d_pdf_path);
                const { data, error } = await _supabase.storage.from(PROJECT_3D_BUCKET).createSignedUrls(paths, 3600);
                if (error) throw error;
                (data || []).forEach(entry => {
                    if (entry && entry.signedUrl && entry.path) signedUrlByPath[entry.path] = entry.signedUrl;
                });
            } catch (e) {
                console.error('Error creating signed URLs for 3D previews:', e);
            }

            await Promise.all(block.map(async p => {
                const path = p.project_3d_pdf_path;
                const url = signedUrlByPath[path];
                if (!url) return;
                try {
                    const svg = await renderPdfFirstPageToSvg(url);
                    threeDPreviewCache[path] = svg;
                    threeDPreviewByProject[p.id] = svg;
                } catch (e) {
                    console.error('Error rendering project 3D preview:', e);
                }
            }));

            renderThreeDSlide(projects);
            refreshActiveSlides();
        }
    } catch (e) {
        console.error('Error loading 3D previews:', e);
    }
}

const TASK_STATUS_ORDER = { 'In Progress': 0, 'Em Andamento': 0, 'To Do': 1, 'A Fazer': 1, 'Done': 2, 'Concluída': 2, 'Concluído': 2 };
const ETAPAS_MAX_VISIBLE = 4;

function taskStatusIcon(status) {
    const order = TASK_STATUS_ORDER[status];
    if (order === 2) {
        return `<span class="material-symbols-outlined ms-fill text-emerald-500 flex-shrink-0" style="font-size:14px">check_circle</span>`;
    }
    if (order === 0) {
        return `<span class="relative flex items-center justify-center flex-shrink-0" style="width:14px;height:14px">
            <span class="absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75 animate-ping"></span>
            <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
        </span>`;
    }
    return `<span class="material-symbols-outlined text-gray-300 flex-shrink-0" style="font-size:14px">radio_button_unchecked</span>`;
}

// Time a task has spent "open": creation until completion (Done tasks — falling
// back to due_date since tasks have no completed_at column, only projects do)
// or creation until now (still-open tasks, i.e. how long it's been sitting).
function taskDurationMs(t) {
    if (!t.created_at) return null;
    const start = new Date(t.created_at);
    const isDone = TASK_STATUS_ORDER[t.status] === 2;
    const end = isDone ? new Date(t.completed_at || t.due_date || t.created_at) : new Date();
    const ms = end - start;
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function formatDuration(ms) {
    const hours = ms / 3.6e6;
    if (hours < 24) return `${Math.max(1, Math.round(hours))}h`;
    return `${Math.round(hours / 24)}d`;
}

// "Etapas" = the project's tasks, pulled straight from the tasks board
// (quadro de tarefas). Order is always by status first — In Progress leads,
// Done trails last — with the longest-running stage flagged wherever it
// naturally falls, never reordered ahead of that status grouping.
function statusThenDueDate(a, b) {
    const diff = (TASK_STATUS_ORDER[a.task.status] ?? 1) - (TASK_STATUS_ORDER[b.task.status] ?? 1);
    if (diff !== 0) return diff;
    return (a.task.due_date || '').localeCompare(b.task.due_date || '');
}

function renderEtapas(projectId) {
    const tasks = tasksByProject[projectId] || [];
    if (tasks.length === 0) return '';

    const withDuration = tasks.map(t => ({ task: t, duration: taskDurationMs(t) }));

    let longest = null;
    withDuration.forEach(x => {
        if (x.duration != null && (!longest || x.duration > longest.duration)) longest = x;
    });

    const ordered = withDuration.slice().sort(statusThenDueDate);

    let visible = ordered.slice(0, ETAPAS_MAX_VISIBLE);

    // Guarantee the longest stage is visible even if it'd be cut off by the
    // slice above — but insert it back at its correct sorted position instead
    // of pinning it to the front, so the status order is never broken.
    if (longest && !visible.some(x => x.task.id === longest.task.id)) {
        visible = visible.slice(0, ETAPAS_MAX_VISIBLE - 1);
        visible.push(longest);
        visible.sort(statusThenDueDate);
    }

    const remaining = ordered.length - visible.length;

    const items = visible.map(({ task: t, duration }) => {
        const isDone = TASK_STATUS_ORDER[t.status] === 2;
        const isLongest = !!longest && t.id === longest.task.id;
        const durationBadge = duration != null
            ? `<span class="flex items-center gap-0.5 text-[10px] font-semibold flex-shrink-0 ${isLongest ? 'text-amber-600' : 'text-text-light-tertiary'}">
                ${isLongest ? '<span class="material-symbols-outlined ms-fill" style="font-size:11px">timer</span>' : ''}${formatDuration(duration)}
               </span>`
            : '';
        return `
            <li class="flex items-center gap-2">
                ${taskStatusIcon(t.status)}
                <span class="text-[11px] flex-1 min-w-0 truncate ${isDone ? 'text-text-light-tertiary line-through decoration-gray-300' : (isLongest ? 'font-semibold text-text-light-primary' : 'text-text-light-secondary')}">${escapeHtml(t.title)}</span>
                ${durationBadge}
            </li>
        `;
    }).join('');

    return `
        <div class="pt-2.5 border-t border-gray-100">
            <p class="text-[9px] font-semibold text-text-light-tertiary uppercase tracking-wide mb-1.5">Etapas</p>
            <ul class="space-y-1.5">${items}</ul>
            ${remaining > 0 ? `<p class="text-[10px] text-text-light-tertiary mt-1.5">+${remaining} etapa${remaining > 1 ? 's' : ''}</p>` : ''}
        </div>
    `;
}

function metaCustoRow(meta, custo) {
    const hasMeta = meta > 0;
    const isOver = hasMeta && custo > meta;
    return `
        <div class="grid grid-cols-2 gap-2 pt-2.5 border-t border-gray-100">
            <div>
                <p class="text-[9px] font-semibold text-text-light-tertiary uppercase tracking-wide">Meta</p>
                <p class="text-xs font-bold text-text-light-secondary">${hasMeta ? formatCurrency(meta) : '—'}</p>
            </div>
            <div class="text-right">
                <p class="text-[9px] font-semibold text-text-light-tertiary uppercase tracking-wide">Custo</p>
                <p class="text-xs font-bold ${isOver ? 'text-red-600' : 'text-text-light-primary'}">${formatCurrency(custo)}</p>
            </div>
        </div>
    `;
}

// ─── Slide 1: Em Andamento ────────────────────────────────────────────────────

function renderProgressSlide(projects) {
    const grid = document.getElementById('progress-grid');
    const countEl = document.getElementById('progress-count');
    if (!grid) return;

    const inProgress = projects.filter(p => isEffectivelyInProgress(p));
    countEl.textContent = inProgress.length;

    if (inProgress.length === 0) {
        grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center gap-2 py-16 text-text-light-tertiary">
            <span class="material-symbols-outlined" style="font-size:36px">inbox</span>
            <p class="text-sm">Nenhum projeto em andamento no momento.</p>
        </div>`;
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    grid.innerHTML = inProgress.map(p => {
        const totalTasks = p.total_tasks || 0;
        const completedTasks = p.completed_tasks || 0;
        const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
        const isOverdue = p.due_date && p.due_date < today;
        const leadName = p.lead_name || '-';

        return `
            <div class="glass-card p-4 flex flex-col gap-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-text-light-primary truncate">${escapeHtml(p.name)}</p>
                        <p class="text-[11px] text-text-light-secondary truncate">${escapeHtml(leadName)}</p>
                    </div>
                    <span class="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-primary border border-blue-200">
                        <span class="size-1 rounded-full bg-primary animate-pulse"></span>${progress}%
                    </span>
                </div>
                <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all duration-700" style="width:${progress}%"></div>
                </div>
                <p class="text-[10px] text-text-light-tertiary">${completedTasks}/${totalTasks} tarefas</p>
                ${renderEtapas(p.id)}
                ${metaCustoRow(p.budget_goal, p.total_cost)}
                ${p.due_date ? `<div class="flex items-center gap-1 text-[10px] ${isOverdue ? 'text-red-600 font-semibold' : 'text-text-light-tertiary'}">
                    <span class="material-symbols-outlined" style="font-size:12px">event</span>
                    ${formatDate(p.due_date)}${isOverdue ? ' · atrasado' : ''}
                </div>` : ''}
            </div>
        `;
    }).join('');
}

// ─── Slide 2: Em Espera ───────────────────────────────────────────────────────

function renderHoldSlide(projects) {
    const grid = document.getElementById('hold-grid');
    const countEl = document.getElementById('hold-count');
    if (!grid) return;

    const onHold = projects.filter(p => isOnHold(p.status));
    countEl.textContent = onHold.length;

    if (onHold.length === 0) {
        grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center gap-2 py-16 text-text-light-tertiary">
            <span class="material-symbols-outlined" style="font-size:36px">inbox</span>
            <p class="text-sm">Nenhum projeto em espera no momento.</p>
        </div>`;
        return;
    }

    grid.innerHTML = onHold.map(p => {
        const totalTasks = p.total_tasks || 0;
        const completedTasks = p.completed_tasks || 0;
        const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
        const leadName = p.lead_name || '-';

        return `
            <div class="glass-card p-4 flex flex-col gap-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-text-light-primary truncate">${escapeHtml(p.name)}</p>
                        <p class="text-[11px] text-text-light-secondary truncate">${escapeHtml(leadName)}</p>
                    </div>
                    <span class="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <span class="material-symbols-outlined" style="font-size:12px">pause_circle</span>Em Espera
                    </span>
                </div>
                <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-700" style="width:${progress}%"></div>
                </div>
                <p class="text-[10px] text-text-light-tertiary">${completedTasks}/${totalTasks} tarefas</p>
                ${renderEtapas(p.id)}
                ${metaCustoRow(p.budget_goal, p.total_cost)}
                ${p.due_date ? `<div class="flex items-center gap-1 text-[10px] text-text-light-tertiary">
                    <span class="material-symbols-outlined" style="font-size:12px">event</span>
                    ${formatDate(p.due_date)}
                </div>` : ''}
            </div>
        `;
    }).join('');
}

// ─── Slide 3: Concluídos ──────────────────────────────────────────────────────

function renderDoneSlide(projects) {
    const grid = document.getElementById('done-grid');
    const countEl = document.getElementById('done-count');
    if (!grid) return;

    const done = projects
        .filter(p => isEffectivelyCompleted(p))
        .sort((a, b) => new Date(b.due_date || b.created_at || 0) - new Date(a.due_date || a.created_at || 0));

    countEl.textContent = done.length;

    if (done.length === 0) {
        grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center gap-2 py-16 text-text-light-tertiary">
            <span class="material-symbols-outlined" style="font-size:36px">inbox</span>
            <p class="text-sm">Nenhum projeto concluído ainda.</p>
        </div>`;
        return;
    }

    grid.innerHTML = done.map(p => {
        const leadName = p.lead_name || '-';
        return `
            <div class="glass-card p-4 flex flex-col gap-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-text-light-primary truncate">${escapeHtml(p.name)}</p>
                        <p class="text-[11px] text-text-light-secondary truncate">${escapeHtml(leadName)}</p>
                    </div>
                    <span class="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span class="material-symbols-outlined" style="font-size:12px">check_circle</span>Concluído
                    </span>
                </div>
                ${renderEtapas(p.id)}
                ${metaCustoRow(p.budget_goal, p.total_cost)}
                ${p.due_date ? `<div class="flex items-center gap-1 text-[10px] text-text-light-tertiary">
                    <span class="material-symbols-outlined" style="font-size:12px">event_available</span>
                    ${formatDate(p.due_date)}
                </div>` : ''}
            </div>
        `;
    }).join('');
}

// ─── Slide 4: Projetos 3D ─────────────────────────────────────────────────────
// Cross-cutting category (presence of a project_3d_pdf_path attachment) rather
// than a status bucket. Deliberately minimal card — just the name and the
// rendered design, scaled to fill the card proportionally — no status/etapas/
// custo clutter, since the point of this slide is to show the 3D design itself.

// Grid dimensions for each tile count from 1 up to THREE_D_MAX_TILES_FULL —
// picked so every tile stretches to fill an equal share of the slide with no
// scrolling. Beyond that count, tiles would get too small to read, so the
// slide falls back to the same fixed-size, scrollable tile layout the other
// slides use.
const THREE_D_LAYOUTS = { 1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2], 5: [3, 2], 6: [3, 2] };
const THREE_D_MAX_TILES_FULL = 6;

function threeDCardHtml(p, fill) {
    // preview is raw <svg>...</svg> markup produced by renderPdfFirstPageToSvg
    // (pdf.js output, not user-controlled text — safe to inline directly,
    // unlike the free-text fields elsewhere that go through escapeHtml).
    const preview = threeDPreviewByProject[p.id];
    return `
        <div class="glass-card overflow-hidden flex flex-col ${fill ? 'h-full' : 'h-64 lg:h-72'}">
            <div class="flex-1 min-h-0 bg-gray-50 flex items-center justify-center overflow-hidden">
                ${preview || `<span class="material-symbols-outlined text-gray-300" style="font-size:40px">view_in_ar</span>`}
            </div>
            <p class="px-3 py-2.5 text-sm font-bold text-text-light-primary text-center truncate border-t border-gray-100 flex-shrink-0">${escapeHtml(p.name)}</p>
        </div>
    `;
}

function renderThreeDSlide(projects) {
    const grid = document.getElementById('threed-grid');
    const countEl = document.getElementById('threed-count');
    if (!grid) return;

    const threeD = projects
        .filter(p => isVisible3d(p))
        .sort((a, b) => a.name.localeCompare(b.name));

    countEl.textContent = threeD.length;

    if (threeD.length === 0) {
        grid.removeAttribute('style');
        grid.classList.remove('overflow-hidden');
        grid.classList.add('overflow-y-auto', 'auto-rows-min');
        grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center gap-2 py-16 text-text-light-tertiary">
            <span class="material-symbols-outlined" style="font-size:36px">view_in_ar</span>
            <p class="text-sm">Nenhum projeto 3D no momento.</p>
        </div>`;
        return;
    }

    const layout = THREE_D_LAYOUTS[threeD.length];

    if (layout) {
        // Fits the whole slide with room to spare — stretch every tile to
        // fill its share of the grid exactly (inline style beats the
        // responsive grid-cols-* utility classes on the element, at every
        // breakpoint), no scrolling needed.
        const [cols, rows] = layout;
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        grid.classList.remove('overflow-y-auto', 'auto-rows-min');
        grid.classList.add('overflow-hidden');
        grid.innerHTML = threeD.map(p => threeDCardHtml(p, true)).join('');
    } else {
        // Too many to fit without shrinking tiles past readability — fall
        // back to the fixed-size tile grid + auto-scroll (autoScrollActiveSlide
        // already handles scrolling any slide taller than the viewport).
        grid.removeAttribute('style');
        grid.classList.remove('overflow-hidden');
        grid.classList.add('overflow-y-auto', 'auto-rows-min');
        grid.innerHTML = threeD.map(p => threeDCardHtml(p, false)).join('');
    }
}

// ─── Slide 5: Custo do Mês por Cliente ─────────────────────────────────────────

function renderCostSlide(exits) {
    const listEl = document.getElementById('cost-list');
    if (!listEl) return;

    const now = new Date();
    const monthLabelEl = document.getElementById('cost-month-label');
    if (monthLabelEl) {
        monthLabelEl.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    }

    const monthExits = exits.filter(e => {
        if (!e.created_at) return false;
        const d = new Date(e.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const clientCosts = {};
    let grandTotal = 0;
    monthExits.forEach(exit => {
        const clientName = exit.clients ? exit.clients.name : 'Sem Cliente';
        const quantity = parseFloat(exit.quantity) || 0;
        const unitPrice = exit.unit_price !== undefined && exit.unit_price !== null
            ? parseFloat(exit.unit_price)
            : parseFloat(exit.stock_items ? exit.stock_items.value : 0) || 0;
        const cost = quantity * unitPrice;

        if (!clientCosts[clientName]) {
            let meta = 0;
            if (exit.client_id && clientMap[exit.client_id]) {
                meta = parseFloat(clientMap[exit.client_id].metas) || 0;
            }
            clientCosts[clientName] = { totalCost: 0, meta };
        }
        clientCosts[clientName].totalCost += cost;
        grandTotal += cost;
    });

    const clientNames = Object.keys(clientCosts).sort((a, b) => clientCosts[b].totalCost - clientCosts[a].totalCost);
    const overBudget = clientNames.filter(n => clientCosts[n].meta > 0 && clientCosts[n].totalCost > clientCosts[n].meta).length;

    document.getElementById('cost-kpi-total').textContent = formatCurrency(grandTotal);
    document.getElementById('cost-kpi-clients').textContent = clientNames.length;
    document.getElementById('cost-kpi-over').textContent = overBudget;

    if (clientNames.length === 0) {
        listEl.innerHTML = `<div class="flex flex-col items-center justify-center gap-2 py-16 text-text-light-tertiary">
            <span class="material-symbols-outlined" style="font-size:36px">payments</span>
            <p class="text-sm">Nenhuma saída de estoque registrada este mês.</p>
        </div>`;
        return;
    }

    const maxCost = clientCosts[clientNames[0]].totalCost || 1;

    listEl.innerHTML = clientNames.map(name => {
        const d = clientCosts[name];
        const hasMeta = d.meta > 0;
        const isOver = hasMeta && d.totalCost > d.meta;
        const barPct = Math.max(4, Math.round((d.totalCost / maxCost) * 100));
        const barColor = isOver ? 'from-red-500 to-red-400' : hasMeta ? 'from-emerald-500 to-emerald-400' : 'from-blue-500 to-sky-400';

        return `
            <div class="glass-card px-5 py-3.5 flex items-center gap-4">
                <div class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isOver ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-primary'}">
                    ${escapeHtml(name.charAt(0).toUpperCase())}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-semibold text-text-light-primary truncate">${escapeHtml(name)}</span>
                        ${isOver ? `<span class="flex-shrink-0 ml-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">
                            <span class="material-symbols-outlined" style="font-size:11px">warning</span>Acima da meta</span>` : ''}
                    </div>
                    <div class="flex items-center gap-4 mb-1.5">
                        <span class="text-[11px] text-text-light-tertiary">Meta: <span class="font-semibold text-text-light-secondary">${hasMeta ? formatCurrency(d.meta) : '—'}</span></span>
                        <span class="text-[11px] text-text-light-tertiary">Custo: <span class="font-bold ${isOver ? 'text-red-600' : 'text-text-light-primary'}">${formatCurrency(d.totalCost)}</span></span>
                    </div>
                    <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div class="h-1.5 rounded-full bg-gradient-to-r ${barColor}" style="width:${barPct}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ─── Slide Rotation ───────────────────────────────────────────────────────────

function startSlideRotation() {
    goToSlide(0);
    slideTimer = setInterval(() => {
        goToSlide(currentSlide + 1);
    }, SLIDE_INTERVAL_MS);
}

function goToSlide(index) {
    if (activeSlides.length === 0) return;
    currentSlide = ((index % activeSlides.length) + activeSlides.length) % activeSlides.length;
    applySlideVisibility();
    restartProgressBar();
    autoScrollActiveSlide();
}

// Shows/hides the slide sections and rebuilds the footer dots to match
// activeSlides, without touching the rotation timer or progress bar — used
// both by goToSlide() and by a periodic data refresh that may change which
// slides qualify without advancing the carousel itself.
function applySlideVisibility() {
    const activeId = activeSlides[currentSlide];
    ALL_SLIDE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', id === activeId);
    });
    renderDots();
}

function renderDots() {
    const container = document.getElementById('slide-dots');
    if (!container) return;
    container.innerHTML = activeSlides.map((_, i) =>
        `<span class="dot ${i === currentSlide ? 'active' : ''}" data-dot="${i}"></span>`
    ).join('');
}

function restartProgressBar() {
    const bar = document.getElementById('slide-progress-bar');
    if (!bar) return;
    bar.classList.remove('animate');
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth; // force reflow
    bar.style.transition = `width ${SLIDE_INTERVAL_MS / 1000}s linear`;
    bar.style.width = '100%';
}

// ─── Auto-scroll ──────────────────────────────────────────────────────────────
// The kiosk has no operator, so when a list is taller than the viewport it
// scrolls itself from top to bottom during the slide's time on screen.

function autoScrollActiveSlide() {
    const containerId = SCROLL_TARGETS[activeSlides[currentSlide]];
    autoScrollContainer(document.getElementById(containerId));
}

function autoScrollContainer(el) {
    cancelAutoScroll();
    if (!el) return;

    el.scrollTop = 0;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 4) return;

    const holdStart = 1200; // pause at the top so the first items are readable
    const holdEnd = 1200;   // pause at the bottom before the slide changes
    const scrollDuration = Math.max(3000, SLIDE_INTERVAL_MS - holdStart - holdEnd);
    const startTime = performance.now() + holdStart;
    const endTime = startTime + scrollDuration;

    const step = (now) => {
        if (now < startTime) {
            scrollAnimId = requestAnimationFrame(step);
            return;
        }
        const t = Math.min(1, (now - startTime) / scrollDuration);
        el.scrollTop = maxScroll * t;
        if (now < endTime) {
            scrollAnimId = requestAnimationFrame(step);
        }
    };
    scrollAnimId = requestAnimationFrame(step);
}

function cancelAutoScroll() {
    if (scrollAnimId) cancelAnimationFrame(scrollAnimId);
    scrollAnimId = null;
}
