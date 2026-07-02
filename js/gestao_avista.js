// ─── Gestão à Vista — rotating kiosk dashboard ─────────────────────────────────

const SLIDE_INTERVAL_MS = 15000;
const REFRESH_INTERVAL_MS = 60000;
const SLIDES = ['slide-progress', 'slide-hold', 'slide-done', 'slide-cost'];
const SCROLL_TARGETS = { 'slide-progress': 'progress-grid', 'slide-hold': 'hold-grid', 'slide-done': 'done-grid', 'slide-cost': 'cost-list' };

let currentSlide = 0;
let slideTimer = null;
let scrollAnimId = null;
let allProjects = [];
let allExits = [];
let clientMap = {};

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

async function loadData() {
    try {
        const [projects, exits, clients] = await Promise.all([
            fetchProjectSummaries(),
            fetchStockExits(),
            fetchClients()
        ]);

        allProjects = projects || [];
        allExits = exits || [];
        clientMap = {};
        (clients || []).forEach(c => clientMap[c.id] = c);

        renderProgressSlide(allProjects);
        renderHoldSlide(allProjects);
        renderDoneSlide(allProjects);
        renderCostSlide(allExits);

        // Re-rendering replaces innerHTML (scrollTop resets to 0) — restart the
        // auto-scroll for whichever slide is currently on screen.
        autoScrollActiveSlide();
    } catch (e) {
        console.error('Error loading Gestão à Vista data:', e);
    }
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

    const inProgress = projects.filter(p => isInProgress(p.status));
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
        .filter(p => isCompleted(p.status))
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
                ${metaCustoRow(p.budget_goal, p.total_cost)}
                ${p.due_date ? `<div class="flex items-center gap-1 text-[10px] text-text-light-tertiary">
                    <span class="material-symbols-outlined" style="font-size:12px">event_available</span>
                    ${formatDate(p.due_date)}
                </div>` : ''}
            </div>
        `;
    }).join('');
}

// ─── Slide 4: Custo do Mês por Cliente ─────────────────────────────────────────

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
        currentSlide = (currentSlide + 1) % SLIDES.length;
        goToSlide(currentSlide);
    }, SLIDE_INTERVAL_MS);
}

function goToSlide(index) {
    SLIDES.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', i === index);
    });
    document.querySelectorAll('[data-dot]').forEach(dot => {
        dot.classList.toggle('active', parseInt(dot.dataset.dot, 10) === index);
    });
    restartProgressBar();
    autoScrollActiveSlide();
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
    const containerId = SCROLL_TARGETS[SLIDES[currentSlide]];
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
