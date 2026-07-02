
let allExits = [];
let clientMap = {};
let currentChart = null;
let currentDonutChart = null;
let currentTrendChart = null;
let currentChartType = 'bar';
let lastClientCosts = {};
let lastFilteredExits = [];
let sortKey = 'cost';
let sortDir = 'desc';

const CHART_COLORS = [
    '#2563eb', '#16a34a', '#0891b2', '#1d4ed8', '#0d9488',
    '#1e40af', '#059669', '#0284c7', '#15803d', '#4f46e5'
];

document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();

    document.getElementById('client-search').addEventListener('change', applyFilters);
    document.getElementById('filter-month').addEventListener('change', applyFilters);
    document.getElementById('filter-year').addEventListener('change', applyFilters);
    document.getElementById('filter-status').addEventListener('change', () => {
        renderTable(lastClientCosts);
        renderChart(lastClientCosts);
        renderDonutChart(lastClientCosts);
    });

    document.getElementById('clear-filters').addEventListener('click', () => {
        document.getElementById('client-search').value = '';
        document.getElementById('filter-month').value = '';
        document.getElementById('filter-year').value = '';
        document.getElementById('filter-status').value = '';
        applyFilters();
    });

    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
    document.getElementById('btn-refresh').addEventListener('click', loadDashboardData);

    document.getElementById('chart-type-bar').addEventListener('click', () => {
        currentChartType = 'bar';
        document.getElementById('chart-type-bar').className = 'px-3 py-1.5 bg-primary text-white transition-colors';
        document.getElementById('chart-type-line').className = 'px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';
        renderChart(lastClientCosts);
    });

    document.getElementById('chart-type-line').addEventListener('click', () => {
        currentChartType = 'line';
        document.getElementById('chart-type-line').className = 'px-3 py-1.5 bg-primary text-white transition-colors';
        document.getElementById('chart-type-bar').className = 'px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';
        renderChart(lastClientCosts);
    });

    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => setSortKey(th.dataset.sort));
    });
});

async function loadDashboardData() {
    try {
        const [exits, clients] = await Promise.all([fetchStockExits(), fetchClients()]);
        allExits = exits;
        clientMap = {};
        clients.forEach(c => clientMap[c.id] = c);
        populateClientFilter(clients);
        applyFilters();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function applyFilters() {
    const selectedClientId = document.getElementById('client-search').value;
    const monthFilter = document.getElementById('filter-month').value;
    const yearFilter = document.getElementById('filter-year').value;

    const filteredExits = allExits.filter(exit => {
        const date = new Date(exit.created_at);
        const matchesClient = selectedClientId === '' || (exit.client_id && exit.client_id.toString() === selectedClientId);
        const matchesMonth = monthFilter === '' || date.getMonth().toString() === monthFilter;
        const matchesYear = yearFilter === '' || date.getFullYear().toString() === yearFilter;
        return matchesClient && matchesMonth && matchesYear;
    });

    lastFilteredExits = filteredExits;
    processAndRender(filteredExits);
}

function processAndRender(exits) {
    const clientCosts = {};
    let grandTotal = 0;

    exits.forEach(exit => {
        const clientName = exit.clients ? exit.clients.name : 'Sem Cliente';
        const quantity = parseFloat(exit.quantity) || 0;
        const exitDate = new Date(exit.created_at);

        let unitPrice = 0;
        if (exit.unit_price !== undefined && exit.unit_price !== null) {
            unitPrice = parseFloat(exit.unit_price);
        } else {
            unitPrice = parseFloat(exit.stock_items ? exit.stock_items.value : 0) || 0;
        }

        const cost = quantity * unitPrice;

        if (!clientCosts[clientName]) {
            let meta = 0;
            if (exit.client_id && clientMap[exit.client_id]) {
                meta = parseFloat(clientMap[exit.client_id].metas) || 0;
            }
            clientCosts[clientName] = {
                count: 0, totalCost: 0, baseMeta: meta,
                minDate: exitDate, maxDate: exitDate,
                items: {}
            };
        }

        clientCosts[clientName].count += quantity;
        clientCosts[clientName].totalCost += cost;
        grandTotal += cost;

        // Aggregate item breakdown
        if (exit.stock_items) {
            const itemName = exit.stock_items.name || 'Item sem nome';
            const itemUnit = exit.stock_items.unit || 'UN';
            const itemCategory = exit.stock_items.category || '—';
            if (!clientCosts[clientName].items[itemName]) {
                clientCosts[clientName].items[itemName] = { quantity: 0, cost: 0, unit: itemUnit, category: itemCategory };
            }
            clientCosts[clientName].items[itemName].quantity += quantity;
            clientCosts[clientName].items[itemName].cost += cost;
        }

        if (exitDate < clientCosts[clientName].minDate) clientCosts[clientName].minDate = exitDate;
        if (exitDate > clientCosts[clientName].maxDate) clientCosts[clientName].maxDate = exitDate;
    });

    Object.keys(clientCosts).forEach(client => {
        const data = clientCosts[client];
        if (data.baseMeta > 0) {
            const monthsDiff = (data.maxDate.getFullYear() - data.minDate.getFullYear()) * 12 +
                (data.maxDate.getMonth() - data.minDate.getMonth()) + 1;
            data.meta = data.baseMeta * monthsDiff;
        } else {
            data.meta = 0;
        }
    });

    lastClientCosts = clientCosts;

    const clientCount = Object.keys(clientCosts).length;
    const avg = clientCount > 0 ? grandTotal / clientCount : 0;
    const overBudget = Object.values(clientCosts).filter(d => d.meta > 0 && d.totalCost > d.meta).length;

    document.getElementById('kpi-total').textContent = formatCurrency(grandTotal);
    document.getElementById('kpi-clients').textContent = clientCount;
    document.getElementById('kpi-avg').textContent = formatCurrency(avg);
    document.getElementById('kpi-overbudget').textContent = overBudget;

    renderTable(clientCosts);
    renderChart(clientCosts);
    renderDonutChart(clientCosts);
    renderTrendChart(exits);
}

function getStatusFilter() {
    return document.getElementById('filter-status').value;
}

function filterByStatus(clientCosts) {
    const statusFilter = getStatusFilter();
    if (!statusFilter) return clientCosts;

    const filtered = {};
    Object.keys(clientCosts).forEach(name => {
        const d = clientCosts[name];
        const hasMeta = d.meta > 0;
        const isOver = hasMeta && d.totalCost > d.meta;
        if (statusFilter === 'over' && isOver) filtered[name] = d;
        else if (statusFilter === 'ok' && hasMeta && !isOver) filtered[name] = d;
        else if (statusFilter === 'no-meta' && !hasMeta) filtered[name] = d;
    });
    return filtered;
}

function setSortKey(key) {
    if (sortKey === key) {
        sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
        sortKey = key;
        sortDir = 'desc';
    }
    updateSortIcons();
    renderTable(lastClientCosts);
}

function updateSortIcons() {
    ['name', 'meta', 'cost'].forEach(k => {
        const icon = document.getElementById(`sort-icon-${k}`);
        if (!icon) return;
        if (k === sortKey) {
            icon.textContent = sortDir === 'desc' ? 'arrow_downward' : 'arrow_upward';
            icon.classList.remove('text-gray-300');
            icon.classList.add('text-primary');
        } else {
            icon.textContent = 'unfold_more';
            icon.classList.remove('text-primary');
            icon.classList.add('text-gray-300');
        }
    });
}

function getSortedClients(clientCosts) {
    return Object.keys(clientCosts).sort((a, b) => {
        if (sortKey === 'name') {
            const cmp = a.toLowerCase().localeCompare(b.toLowerCase());
            return sortDir === 'asc' ? cmp : -cmp;
        }
        const valA = sortKey === 'meta' ? clientCosts[a].meta : clientCosts[a].totalCost;
        const valB = sortKey === 'meta' ? clientCosts[b].meta : clientCosts[b].totalCost;
        return sortDir === 'asc' ? valA - valB : valB - valA;
    });
}

function renderTable(allClientCosts) {
    const tbody = document.getElementById('cost-table-body');
    const clientCosts = filterByStatus(allClientCosts);
    const sortedClients = getSortedClients(clientCosts);

    document.getElementById('table-count').textContent =
        `${sortedClients.length} cliente${sortedClients.length !== 1 ? 's' : ''} encontrado${sortedClients.length !== 1 ? 's' : ''}`;

    if (sortedClients.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="px-6 py-12 text-center">
                <div class="flex flex-col items-center gap-2 text-gray-400">
                    <span class="material-symbols-outlined" style="font-size:40px">search_off</span>
                    <span class="text-sm font-medium text-gray-500 dark:text-gray-400">Nenhum registro encontrado</span>
                    <span class="text-xs text-gray-400">Tente ajustar os filtros aplicados</span>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    sortedClients.forEach((client, idx) => {
        const d = clientCosts[client];
        const meta = parseFloat(d.meta) || 0;
        const totalCost = d.totalCost;
        const hasMeta = meta > 0;
        const isOver = hasMeta && totalCost > meta;
        const isOk = hasMeta && !isOver;

        const rawPct = hasMeta ? (totalCost / meta) * 100 : 0;
        const barPct = Math.min(rawPct, 100);
        const pctLabel = hasMeta ? rawPct.toFixed(1) + '%' : null;

        let barColor = 'bg-emerald-500';
        if (hasMeta && rawPct > 100) barColor = 'bg-red-500';
        else if (hasMeta && rawPct > 80) barColor = 'bg-amber-500';

        const progressCell = hasMeta
            ? `<div class="w-full">
                <div class="flex justify-between text-xs mb-1">
                    <span class="${isOver ? 'text-red-500 font-semibold' : 'text-gray-500 dark:text-gray-400'}">${pctLabel}</span>
                    <span class="text-gray-400 text-xs">${formatCurrency(meta)}</span>
                </div>
                <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div class="h-2 rounded-full progress-bar ${barColor}" style="width:${barPct}%"></div>
                </div>
               </div>`
            : `<span class="text-xs text-gray-400">—</span>`;

        let statusBadge = '';
        if (isOver) {
            statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                <span class="material-symbols-outlined" style="font-size:12px">warning</span>Acima da Meta</span>`;
        } else if (isOk) {
            statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <span class="material-symbols-outlined" style="font-size:12px">check_circle</span>Dentro da Meta</span>`;
        } else {
            statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                <span class="material-symbols-outlined" style="font-size:12px">remove</span>Sem Meta</span>`;
        }

        const initial = client.charAt(0).toUpperCase();
        const costColor = isOver ? 'font-bold text-red-600 dark:text-red-400' : 'font-bold text-gray-900 dark:text-white';
        const rowId = `detail-row-${idx}`;
        const hasItems = d.items && Object.keys(d.items).length > 0;
        const avatarClass = isOver
            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : 'bg-primary/10 dark:bg-primary/20 text-primary';
        const leftBorder = isOver ? 'border-l-2 border-red-400' : '';

        const tr = document.createElement('tr');
        tr.className = `hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${leftBorder}`;
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full ${avatarClass} flex items-center justify-center text-xs font-bold flex-shrink-0">${escapeHtml(initial)}</div>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(client)}</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${hasMeta ? formatCurrency(meta) : '—'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${costColor}">${formatCurrency(totalCost)}</td>
            <td class="px-6 py-4 w-52">${progressCell}</td>
            <td class="px-6 py-4 whitespace-nowrap">${statusBadge}</td>
            <td class="px-4 py-4 text-center w-10">
                ${hasItems
                    ? `<button onclick="toggleClientDetail('${rowId}')"
                        class="text-gray-400 hover:text-primary transition-colors p-1 rounded-md hover:bg-primary/10"
                        title="Ver itens consumidos">
                        <span id="expand-icon-${rowId}" class="material-symbols-outlined" style="font-size:18px;transition:transform 0.25s ease">expand_more</span>
                       </button>`
                    : ''}
            </td>
        `;
        tbody.appendChild(tr);

        if (hasItems) {
            const detailTr = document.createElement('tr');
            detailTr.id = rowId;
            detailTr.className = 'hidden';
            detailTr.innerHTML = `<td colspan="6" class="p-0">${buildDetailHTML(client, d)}</td>`;
            tbody.appendChild(detailTr);
        }
    });
}

// Called from inline onclick — must be global
function toggleClientDetail(rowId) {
    const row = document.getElementById(rowId);
    const icon = document.getElementById('expand-icon-' + rowId);
    if (!row) return;
    const isNowHidden = row.classList.toggle('hidden');
    if (icon) icon.style.transform = isNowHidden ? '' : 'rotate(180deg)';
}

function buildDetailHTML(clientName, data) {
    const meta = data.meta;
    const hasMeta = meta > 0;
    const totalCost = data.totalCost;
    const isOver = hasMeta && totalCost > meta;

    const sortedItems = Object.entries(data.items || {})
        .map(([name, item]) => ({ name, ...item }))
        .sort((a, b) => b.cost - a.cost);

    if (sortedItems.length === 0) {
        return '<div class="px-6 py-4 text-xs text-gray-400">Nenhum item registrado.</div>';
    }

    // Annotate each item with cumulative cost to identify the tipping point
    let cumulative = 0;
    const annotated = sortedItems.map(item => {
        const before = cumulative;
        cumulative += item.cost;
        const isTipping = hasMeta && before < meta && cumulative >= meta;
        const isExcess = hasMeta && before >= meta;
        return { ...item, isTipping, isExcess };
    });

    const itemRows = annotated.map(item => {
        const pct = totalCost > 0 ? ((item.cost / totalCost) * 100).toFixed(1) : '0.0';
        const barWidth = totalCost > 0 ? Math.min((item.cost / totalCost) * 100, 100) : 0;

        let rowBg = '';
        let badge = '';
        let barColor = 'bg-blue-500';

        if (item.isTipping) {
            rowBg = 'bg-orange-50 dark:bg-orange-950/20';
            badge = `<span class="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 whitespace-nowrap">Estourou aqui</span>`;
            barColor = 'bg-orange-500';
        } else if (item.isExcess) {
            rowBg = 'bg-red-50 dark:bg-red-950/20';
            badge = `<span class="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 whitespace-nowrap">Excesso</span>`;
            barColor = 'bg-red-500';
        }

        return `
            <tr class="${rowBg} border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors">
                <td class="py-2.5 px-4 text-xs font-medium text-gray-800 dark:text-gray-200">
                    <div class="flex items-center flex-wrap gap-1">${escapeHtml(item.name)}${badge}</div>
                </td>
                <td class="py-2.5 px-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">${escapeHtml(item.category)}</td>
                <td class="py-2.5 px-3 text-xs text-gray-600 dark:text-gray-400 text-right whitespace-nowrap">${item.quantity.toFixed(2)} ${escapeHtml(item.unit)}</td>
                <td class="py-2.5 px-3 text-xs font-semibold text-gray-800 dark:text-gray-200 text-right whitespace-nowrap">${formatCurrency(item.cost)}</td>
                <td class="py-2.5 px-4 w-40">
                    <div class="flex items-center gap-2">
                        <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                            <div class="h-1.5 rounded-full ${barColor}" style="width:${barWidth}%"></div>
                        </div>
                        <span class="text-gray-500 dark:text-gray-400 w-8 text-right flex-shrink-0" style="font-size:10px">${pct}%</span>
                    </div>
                </td>
            </tr>`;
    }).join('');

    // Budget summary footer
    let summaryHtml = '';
    if (hasMeta) {
        const excess = totalCost - meta;
        const excessPct = ((excess / meta) * 100).toFixed(1);
        summaryHtml = `
            <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-1.5 text-xs">
                    <span class="text-gray-400">Meta:</span>
                    <span class="font-semibold text-gray-700 dark:text-gray-300">${formatCurrency(meta)}</span>
                </div>
                <div class="flex items-center gap-1.5 text-xs">
                    <span class="text-gray-400">Realizado:</span>
                    <span class="font-semibold ${isOver ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}">${formatCurrency(totalCost)}</span>
                </div>
                ${isOver ? `<div class="flex items-center gap-1.5 text-xs">
                    <span class="text-gray-400">Excesso:</span>
                    <span class="font-bold text-red-600 dark:text-red-400">+${formatCurrency(excess)} (↑${excessPct}%)</span>
                </div>` : `<div class="flex items-center gap-1.5 text-xs">
                    <span class="text-gray-400">Disponível:</span>
                    <span class="font-semibold text-emerald-600 dark:text-emerald-400">${formatCurrency(meta - totalCost)}</span>
                </div>`}
            </div>`;
    }

    const headerWarning = isOver
        ? `<span class="ml-auto flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
            <span class="material-symbols-outlined" style="font-size:13px">warning</span>
            Meta excedida em ${formatCurrency(totalCost - meta)}
           </span>`
        : '';

    return `
        <div class="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div class="px-4 py-2.5 bg-slate-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <span class="material-symbols-outlined text-primary" style="font-size:15px">inventory_2</span>
                <span class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Itens consumidos — ${escapeHtml(clientName)}
                </span>
                ${headerWarning}
            </div>
            <table class="w-full bg-white dark:bg-gray-900">
                <thead>
                    <tr class="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                        <th class="text-left py-2 px-4 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Item</th>
                        <th class="text-left py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Categoria</th>
                        <th class="text-right py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Qtd</th>
                        <th class="text-right py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Custo</th>
                        <th class="py-2 px-4 text-[10px] font-semibold uppercase tracking-wider text-gray-500 w-40">Participação</th>
                    </tr>
                </thead>
                <tbody>${itemRows}</tbody>
            </table>
            ${summaryHtml}
        </div>`;
}

function getChartTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        textColor: isDark ? '#9ca3af' : '#6b7280',
        gridColor: isDark ? '#1f2937' : '#f3f4f6',
    };
}

function renderChart(allClientCosts) {
    const clientCosts = filterByStatus(allClientCosts);
    const { textColor, gridColor } = getChartTheme();
    const ctx = document.getElementById('costChart').getContext('2d');
    const isLine = currentChartType === 'line';

    const sorted = Object.keys(clientCosts).sort((a, b) => clientCosts[b].totalCost - clientCosts[a].totalCost);
    const costValues = sorted.map(c => clientCosts[c].totalCost);
    const metaValues = sorted.map(c => clientCosts[c].meta > 0 ? clientCosts[c].meta : null);

    if (currentChart) currentChart.destroy();

    currentChart = new Chart(ctx, {
        type: isLine ? 'line' : 'bar',
        data: {
            labels: sorted,
            datasets: [
                {
                    label: 'Custo Total',
                    data: costValues,
                    backgroundColor: isLine ? 'rgba(30,58,138,0.1)' : 'rgba(37,99,235,0.85)',
                    borderColor: '#1e3a8a',
                    borderWidth: isLine ? 2.5 : 0,
                    borderRadius: isLine ? 0 : 7,
                    fill: isLine,
                    tension: 0.4,
                    pointBackgroundColor: '#2563eb',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: isLine ? 5 : 0,
                },
                {
                    label: 'Meta',
                    data: metaValues,
                    type: 'line',
                    borderColor: '#dc2626',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0,
                    pointBackgroundColor: '#dc2626',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: textColor, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: textColor,
                        font: { size: 11 },
                        callback: v => 'R$ ' + Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v)
                    },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

function renderDonutChart(allClientCosts) {
    const clientCosts = filterByStatus(allClientCosts);
    const isDark = document.documentElement.classList.contains('dark');
    const ctx = document.getElementById('donutChart').getContext('2d');

    const sorted = Object.keys(clientCosts).sort((a, b) => clientCosts[b].totalCost - clientCosts[a].totalCost);
    const TOP_N = 6;
    let labels, values;

    if (sorted.length > TOP_N) {
        labels = [...sorted.slice(0, TOP_N), 'Outros'];
        const othersTotal = sorted.slice(TOP_N).reduce((s, c) => s + clientCosts[c].totalCost, 0);
        values = [...sorted.slice(0, TOP_N).map(c => clientCosts[c].totalCost), othersTotal];
    } else {
        labels = sorted;
        values = sorted.map(c => clientCosts[c].totalCost);
    }

    if (currentDonutChart) currentDonutChart.destroy();

    currentDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderWidth: 2,
                borderColor: isDark ? '#101622' : '#ffffff',
                hoverBorderWidth: 3,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = values.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
                            return `${ctx.label}: ${formatCurrency(ctx.parsed)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    const total = values.reduce((a, b) => a + b, 0);
    document.getElementById('donut-legend').innerHTML = labels.map((label, i) => {
        const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : '0.0';
        return `<div class="flex items-center justify-between gap-1.5">
            <div class="flex items-center gap-1.5 min-w-0">
                <div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${CHART_COLORS[i] || '#94a3b8'}"></div>
                <span class="truncate text-gray-600 dark:text-gray-400" style="font-size:10px">${escapeHtml(label)}</span>
            </div>
            <span class="font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0" style="font-size:10px">${pct}%</span>
        </div>`;
    }).join('');
}

function renderTrendChart(exits) {
    const { textColor, gridColor } = getChartTheme();
    const ctx = document.getElementById('trendChart').getContext('2d');

    const monthly = {};
    exits.forEach(exit => {
        const date = new Date(exit.created_at);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        let unitPrice = exit.unit_price !== undefined && exit.unit_price !== null
            ? parseFloat(exit.unit_price)
            : parseFloat(exit.stock_items ? exit.stock_items.value : 0) || 0;
        const cost = (parseFloat(exit.quantity) || 0) * unitPrice;
        monthly[key] = (monthly[key] || 0) + cost;
    });

    const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const sortedKeys = Object.keys(monthly).sort();
    const labels = sortedKeys.map(k => {
        const [y, m] = k.split('-');
        return `${MONTH_NAMES[parseInt(m) - 1]}/${y}`;
    });
    const values = sortedKeys.map(k => monthly[k]);

    if (currentTrendChart) currentTrendChart.destroy();

    currentTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Custo Mensal',
                data: values,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(30,58,138,0.08)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#2563eb',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `Custo: ${formatCurrency(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: textColor,
                        font: { size: 11 },
                        callback: v => 'R$ ' + Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v)
                    },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

function exportCSV() {
    const clientCosts = filterByStatus(lastClientCosts);
    const sorted = getSortedClients(clientCosts);

    const rows = [['Cliente', 'Meta (R$)', 'Custo Total (R$)', 'Utilização (%)', 'Status', 'Principal Item', 'Custo do Principal Item']];
    sorted.forEach(name => {
        const d = clientCosts[name];
        const hasMeta = d.meta > 0;
        const isOver = hasMeta && d.totalCost > d.meta;
        const pct = hasMeta ? ((d.totalCost / d.meta) * 100).toFixed(1) : '';
        const status = isOver ? 'Acima da Meta' : hasMeta ? 'Dentro da Meta' : 'Sem Meta';

        const topItem = Object.entries(d.items || {}).sort((a, b) => b[1].cost - a[1].cost)[0];
        const topItemName = topItem ? topItem[0] : '';
        const topItemCost = topItem ? topItem[1].cost.toFixed(2) : '';

        rows.push([name, hasMeta ? d.meta.toFixed(2) : '', d.totalCost.toFixed(2), pct, status, topItemName, topItemCost]);
    });

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custos_clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function populateClientFilter(clients) {
    const select = document.getElementById('client-search');
    select.innerHTML = '<option value="">Todos os Clientes</option>';
    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        select.appendChild(option);
    });
}
