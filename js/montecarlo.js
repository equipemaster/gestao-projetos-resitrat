// Monte Carlo simulation for chemical/hydraulic material stock forecasting
// Uses Triangular distribution (PMBoK 3-point) for consumption + Uniform for lead time

const UNITS = ['un', 'kg', 'L', 'g', 'm', 'm²', 'm³', 'pç', 'cx', 'rolo', 'lt', 'sc'];
const ITERATIONS = 10000;

let mcChart = null;
let coverageChart = null;
let lastResults = [];
let lastHorizon = 3;
let lastConfidence = 90;
let rowCount = 0;

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const colorMap = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-blue-500' };
    const iconMap  = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const el = document.createElement('div');
    el.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white pointer-events-auto ${colorMap[type]} transform translate-x-full transition-all duration-300 max-w-sm`;
    el.innerHTML = `
        <span class="material-symbols-outlined flex-shrink-0" style="font-size:20px">${iconMap[type]}</span>
        <span class="text-sm font-medium flex-1 leading-snug">${message}</span>
        <button onclick="this.parentElement.remove()" class="opacity-70 hover:opacity-100 flex-shrink-0 ml-1">
            <span class="material-symbols-outlined" style="font-size:16px">close</span>
        </button>`;
    container.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.replace('translate-x-full', 'translate-x-0')));
    setTimeout(() => { el.classList.add('opacity-0'); setTimeout(() => el.remove(), 300); }, duration);
}

// ─── Row Management ───────────────────────────────────────────────────────────

function addProductRow(name = '', unit = 'un', minC = '', likelyC = '', maxC = '', ltMin = '7', ltMax = '30', curStock = '0') {
    const tbody = document.getElementById('montecarlo-tbody');
    if (!tbody) return;
    rowCount++;

    const unitOptions = UNITS.map(u => `<option value="${u}"${u === unit ? ' selected' : ''}>${u}</option>`).join('');
    const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none';

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group';
    tr.innerHTML = `
        <td class="px-3 py-2">
            <input type="text" class="task-name ${inputCls}" placeholder="Ex: CLORO GRANULADO" value="${escapeHtml(name)}">
        </td>
        <td class="px-2 py-2">
            <select class="unit-val ${inputCls}">
                ${unitOptions}
            </select>
        </td>
        <td class="px-2 py-2">
            <input type="number" step="any" min="0" class="optim-val ${inputCls} text-right" placeholder="0" value="${minC}">
        </td>
        <td class="px-2 py-2">
            <input type="number" step="any" min="0" class="likely-val ${inputCls} text-right font-medium" placeholder="0" value="${likelyC}">
        </td>
        <td class="px-2 py-2">
            <input type="number" step="any" min="0" class="pessim-val ${inputCls} text-right" placeholder="0" value="${maxC}">
        </td>
        <td class="px-2 py-2">
            <input type="number" step="1" min="0" class="lt-min-val ${inputCls} text-right" placeholder="7" value="${ltMin}">
        </td>
        <td class="px-2 py-2">
            <input type="number" step="1" min="0" class="lt-max-val ${inputCls} text-right" placeholder="30" value="${ltMax}">
        </td>
        <td class="px-2 py-2">
            <input type="number" step="any" min="0" class="stock-val ${inputCls} text-right" placeholder="0" value="${curStock}">
        </td>
        <td class="px-2 py-2 text-center">
            <button type="button" class="remove-btn text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded opacity-0 group-hover:opacity-100">
                <span class="material-symbols-outlined" style="font-size:18px">delete</span>
            </button>
        </td>`;

    tr.querySelector('.remove-btn').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
}

// ─── Import from Supabase stock_items ─────────────────────────────────────────

async function importFromStock() {
    const btn = document.getElementById('import-stock-btn');
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size:15px">refresh</span> Carregando...';
    btn.disabled = true;

    try {
        const { data, error } = await _supabase.from('stock_items').select('*').order('name');
        if (error) throw error;
        if (!data || data.length === 0) {
            showToast('Nenhum item encontrado no estoque.', 'warning');
            return;
        }

        const tbody = document.getElementById('montecarlo-tbody');
        tbody.innerHTML = '';
        rowCount = 0;

        data.forEach(item => {
            addProductRow(
                item.name || '',
                item.unit || 'un',
                '', '', '',     // consumo em branco para o usuário preencher
                '7', '30',
                parseFloat(item.quantity) || 0
            );
        });

        document.getElementById('results-section').classList.add('hidden');
        showToast(`${data.length} produtos importados. Preencha as estimativas de consumo mensal e clique em Simular.`, 'success', 7000);
    } catch (e) {
        console.error(e);
        showToast('Erro ao importar do estoque: ' + e.message, 'error');
    } finally {
        btn.innerHTML = origHTML;
        btn.disabled = false;
    }
}

// ─── Monte Carlo Engine ────────────────────────────────────────────────────────

function triangularSample(a, b, c) {
    // Clamp mode to [a, c]
    if (b < a) b = a;
    if (b > c) b = c;
    if (a === c) return a;
    const F = (b - a) / (c - a);
    const U = Math.random();
    return U <= F
        ? a + Math.sqrt(U * (c - a) * (b - a))
        : c - Math.sqrt((1 - U) * (c - a) * (c - b));
}

function uniformSample(min, max) {
    return min >= max ? min : min + Math.random() * (max - min);
}

function runMonteCarloForProduct(product, horizonMonths, confidencePct) {
    const { minC, likelyC, maxC, ltMin, ltMax, currentStock } = product;
    const pIdx = confidencePct / 100;

    const periodResults       = new Array(ITERATIONS);
    const leadtimeDemandArr   = new Array(ITERATIONS);

    for (let i = 0; i < ITERATIONS; i++) {
        // Total consumption over the horizon
        let total = 0;
        for (let m = 0; m < horizonMonths; m++) {
            total += triangularSample(minC, likelyC, maxC);
        }
        periodResults[i] = total;

        // Demand during lead time (fractional months allowed)
        const ltDays    = uniformSample(ltMin, ltMax);
        const ltMonths  = ltDays / 30;
        const fullM     = Math.floor(ltMonths);
        const fracM     = ltMonths - fullM;
        let ltDemand    = 0;
        for (let m = 0; m < fullM; m++) {
            ltDemand += triangularSample(minC, likelyC, maxC);
        }
        if (fracM > 0.001) {
            ltDemand += triangularSample(minC, likelyC, maxC) * fracM;
        }
        leadtimeDemandArr[i] = ltDemand;
    }

    periodResults.sort((a, b) => a - b);
    leadtimeDemandArr.sort((a, b) => a - b);

    const p50       = periodResults[Math.floor(ITERATIONS * 0.50)];
    const pConf     = periodResults[Math.floor(ITERATIONS * pIdx)];
    const avgLT     = leadtimeDemandArr[Math.floor(ITERATIONS * 0.50)];
    const safeLT    = leadtimeDemandArr[Math.floor(ITERATIONS * pIdx)];

    const safetyStock       = Math.max(0, safeLT - avgLT);
    const rop               = avgLT + safetyStock;               // = safeLT
    const suggestedPurchase = Math.max(0, pConf + safetyStock - currentStock);

    // Coverage: how many days current stock lasts at P50 daily rate
    const dailyP50    = p50 / (horizonMonths * 30);
    const coverageDays = dailyP50 > 0 ? Math.round(currentStock / dailyP50) : 9999;

    let status;
    if (currentStock <= 0 || currentStock <= safetyStock) status = 'CRÍTICO';
    else if (currentStock <= rop)                          status = 'ATENÇÃO';
    else                                                   status = 'OK';

    return {
        name: product.name,
        unit: product.unit,
        currentStock,
        p50,
        pConf,
        safetyStock,
        rop,
        suggestedPurchase,
        coverageDays,
        status,
        periodResults   // kept for histogram rendering
    };
}

// ─── Simulation Runner ────────────────────────────────────────────────────────

function runSimulation() {
    const rows    = document.querySelectorAll('#montecarlo-tbody tr');
    const products = [];
    let valid = true;

    rows.forEach((row, idx) => {
        const name      = row.querySelector('.task-name')?.value?.trim();
        const unit      = row.querySelector('.unit-val')?.value || 'un';
        const minC      = parseFloat(row.querySelector('.optim-val')?.value);
        const likelyC   = parseFloat(row.querySelector('.likely-val')?.value);
        const maxC      = parseFloat(row.querySelector('.pessim-val')?.value);
        const ltMin     = parseFloat(row.querySelector('.lt-min-val')?.value) || 7;
        const ltMax     = parseFloat(row.querySelector('.lt-max-val')?.value) || 30;
        const curStock  = parseFloat(row.querySelector('.stock-val')?.value) || 0;

        if (!name) return;

        if (isNaN(minC) || isNaN(likelyC) || isNaN(maxC)) {
            showToast(`"${name || 'Linha ' + (idx + 1)}": preencha os três valores de consumo (Mín, Provável, Máx).`, 'warning');
            valid = false; return;
        }
        if (minC > likelyC || likelyC > maxC) {
            showToast(`"${name}": ordem inválida — Mín ≤ Provável ≤ Máx.`, 'error');
            valid = false; return;
        }
        if (ltMin > ltMax) {
            showToast(`"${name}": Lead Time Mín deve ser ≤ Lead Time Máx.`, 'error');
            valid = false; return;
        }

        products.push({ name, unit, minC, likelyC, maxC, ltMin, ltMax, currentStock: curStock });
    });

    if (!valid) return;
    if (products.length === 0) {
        showToast('Adicione pelo menos um produto com todos os valores de consumo preenchidos.', 'warning');
        return;
    }

    const horizonMonths = parseInt(document.getElementById('horizon-select')?.value) || 3;
    const confidencePct = parseInt(document.getElementById('confidence-select')?.value) || 90;

    const runBtn = document.getElementById('run-simulation-btn');
    const origHTML = runBtn.innerHTML;
    runBtn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size:20px">refresh</span><span class="text-sm">Simulando...</span>';
    runBtn.disabled = true;

    // Yield to UI before heavy computation
    setTimeout(() => {
        try {
            lastHorizon    = horizonMonths;
            lastConfidence = confidencePct;
            lastResults    = products.map(p => runMonteCarloForProduct(p, horizonMonths, confidencePct));
            displayResults(lastResults, horizonMonths, confidencePct);
            showToast(
                `Simulação concluída — ${products.length} produto(s) · ${(ITERATIONS * products.length).toLocaleString('pt-BR')} iterações.`,
                'success'
            );
        } catch (e) {
            console.error(e);
            showToast('Erro durante a simulação: ' + e.message, 'error');
        } finally {
            runBtn.innerHTML = origHTML;
            runBtn.disabled = false;
        }
    }, 50);
}

// ─── Display Results ──────────────────────────────────────────────────────────

function displayResults(results, horizonMonths, confidencePct) {
    const section = document.getElementById('results-section');
    section.classList.remove('hidden');

    // Update all confidence labels
    document.querySelectorAll('.conf-label').forEach(el => { el.textContent = confidencePct; });
    const infoConf = document.getElementById('info-confidence');
    const infoConf2 = document.getElementById('info-confidence-2');
    if (infoConf)  infoConf.textContent  = confidencePct;
    if (infoConf2) infoConf2.textContent = confidencePct;

    // KPIs
    const critical  = results.filter(r => r.status === 'CRÍTICO').length;
    const attention = results.filter(r => r.status === 'ATENÇÃO').length;
    const capDays   = results.map(r => Math.min(r.coverageDays, 365));
    const avgCov    = Math.round(capDays.reduce((s, v) => s + v, 0) / results.length);

    document.getElementById('kpi-total').textContent     = results.length;
    document.getElementById('kpi-critical').textContent  = critical;
    document.getElementById('kpi-attention').textContent = attention;
    document.getElementById('kpi-coverage').textContent  = avgCov >= 365 ? '365+' : avgCov;

    const sub = document.getElementById('results-subtitle');
    if (sub) sub.textContent = `${horizonMonths} ${horizonMonths === 1 ? 'mês' : 'meses'} · P${confidencePct}`;

    // Sort: CRÍTICO → ATENÇÃO → OK, then by coverage ascending
    const statusOrder = { 'CRÍTICO': 0, 'ATENÇÃO': 1, 'OK': 2 };
    const sorted = [...results].sort((a, b) => {
        const so = statusOrder[a.status] - statusOrder[b.status];
        return so !== 0 ? so : a.coverageDays - b.coverageDays;
    });

    // Render table
    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';

    const badgeCls = {
        'CRÍTICO': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        'ATENÇÃO' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        'OK'      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    };
    const fmt = (v, dec = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const fmt0 = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

    sorted.forEach(r => {
        const origIdx = results.indexOf(r);
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-primary/5 dark:hover:bg-primary/10 cursor-pointer transition-colors';
        tr.dataset.idx = origIdx;

        const rowBg = r.status === 'CRÍTICO'
            ? 'bg-red-50/40 dark:bg-red-900/10'
            : r.status === 'ATENÇÃO'
                ? 'bg-amber-50/40 dark:bg-amber-900/10'
                : '';
        if (rowBg) tr.classList.add(...rowBg.split(' '));

        tr.innerHTML = `
            <td class="px-4 py-2.5 text-sm font-semibold text-text-light-primary dark:text-text-dark-primary">${escapeHtml(r.name)}</td>
            <td class="px-3 py-2.5 text-xs text-center text-text-light-secondary dark:text-text-dark-secondary">${escapeHtml(r.unit)}</td>
            <td class="px-3 py-2.5 text-sm text-right text-text-light-primary dark:text-text-dark-primary">${fmt0(r.currentStock)}</td>
            <td class="px-3 py-2.5 text-sm text-right font-medium text-blue-600 dark:text-blue-400">${fmt(r.p50, 1)}</td>
            <td class="px-3 py-2.5 text-sm text-right font-semibold text-orange-600 dark:text-orange-400">${fmt(r.pConf, 1)}</td>
            <td class="px-3 py-2.5 text-sm text-right text-text-light-primary dark:text-text-dark-primary">${fmt(r.safetyStock, 1)}</td>
            <td class="px-3 py-2.5 text-sm text-right text-text-light-primary dark:text-text-dark-primary">${fmt(r.rop, 1)}</td>
            <td class="px-3 py-2.5 text-sm text-right font-semibold ${r.suggestedPurchase > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}">${r.suggestedPurchase > 0 ? '+' + fmt(r.suggestedPurchase, 1) : '—'}</td>
            <td class="px-3 py-2.5 text-sm text-right text-text-light-secondary dark:text-text-dark-secondary">${r.coverageDays >= 9999 ? '∞' : r.coverageDays >= 365 ? '365+ dias' : r.coverageDays + ' dias'}</td>
            <td class="px-3 py-2.5 text-center">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeCls[r.status]}">${r.status}</span>
            </td>`;

        tr.addEventListener('click', () => {
            document.querySelectorAll('#results-tbody tr').forEach(t => t.classList.remove('ring-2', 'ring-inset', 'ring-primary/40'));
            tr.classList.add('ring-2', 'ring-inset', 'ring-primary/40');
            drawHistogram(results[parseInt(tr.dataset.idx)], horizonMonths, confidencePct);
        });

        tbody.appendChild(tr);
    });

    // Auto-select worst product
    const firstRow = tbody.querySelector('tr');
    if (firstRow) {
        firstRow.classList.add('ring-2', 'ring-inset', 'ring-primary/40');
        drawHistogram(sorted[0], horizonMonths, confidencePct);
    }

    drawCoverageChart(sorted);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Histogram Chart ──────────────────────────────────────────────────────────

function drawHistogram(product, horizonMonths, confidencePct) {
    const pIdx       = confidencePct / 100;
    const results    = product.periodResults;
    const n          = results.length;
    const BINS       = 40;
    const minV       = results[0];
    const maxV       = results[n - 1];
    const binSize    = (maxV - minV) / BINS || 1;
    const bins       = new Array(BINS).fill(0);
    const labels     = [];

    results.forEach(val => {
        let idx = Math.floor((val - minV) / binSize);
        if (idx >= BINS) idx = BINS - 1;
        bins[idx]++;
    });

    for (let i = 0; i < BINS; i++) {
        labels.push(minV + (i + 0.5) * binSize);
    }

    const P50   = results[Math.floor(n * 0.50)];
    const PConf = results[Math.floor(n * pIdx)];

    const titleEl = document.getElementById('histogram-title');
    if (titleEl) titleEl.textContent = `Distribuição de Consumo — ${product.name}`;

    const horizonLabel = horizonMonths === 1 ? '1 mês' : `${horizonMonths} meses`;

    const verticalLinesPlugin = {
        id: 'verticalLines',
        afterDraw: chart => {
            const ctx   = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;

            const drawLine = (value, color, text) => {
                let closestIdx = 0, minDiff = Infinity;
                labels.forEach((lbl, i) => {
                    const d = Math.abs(lbl - value);
                    if (d < minDiff) { minDiff = d; closestIdx = i; }
                });
                const xPx = xAxis.getPixelForTick(closestIdx);
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(xPx, yAxis.top);
                ctx.lineTo(xPx, yAxis.bottom);
                ctx.lineWidth = 2;
                ctx.strokeStyle = color;
                ctx.setLineDash([5, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = color;
                ctx.font = 'bold 10px Inter, sans-serif';
                ctx.fillText(text, xPx + 4, yAxis.top + 13);
                ctx.restore();
            };

            drawLine(P50,   'rgba(37,99,235,0.9)',  `P50: ${P50.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`);
            drawLine(PConf, 'rgba(22,163,74,0.9)',  `P${confidencePct}: ${PConf.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`);
        }
    };

    const ctx = document.getElementById('montecarloChart').getContext('2d');
    if (mcChart) mcChart.destroy();

    mcChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => l.toLocaleString('pt-BR', { maximumFractionDigits: 1 })),
            datasets: [{
                label: 'Iterações',
                data: bins,
                backgroundColor: 'rgba(19,91,236,0.6)',
                borderColor: 'rgba(19,91,236,0.85)',
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 1.0,
                borderRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: `Consumo total (${product.unit}) em ${horizonLabel}`, font: { size: 11 } },
                    ticks: { maxTicksLimit: 8, font: { size: 10 } }
                },
                y: {
                    title: { display: true, text: 'Nº de iterações', font: { size: 11 } },
                    beginAtZero: true,
                    ticks: { font: { size: 10 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: items => `≈ ${items[0].label} ${product.unit}`,
                        label: items => `${items.raw} cenários`
                    }
                }
            }
        },
        plugins: [verticalLinesPlugin]
    });
}

// ─── Coverage Bar Chart ────────────────────────────────────────────────────────

function drawCoverageChart(sortedResults) {
    const ctx = document.getElementById('coverageChart').getContext('2d');
    if (coverageChart) coverageChart.destroy();

    const labels = sortedResults.map(r => r.name.length > 22 ? r.name.substring(0, 20) + '…' : r.name);
    const data   = sortedResults.map(r => Math.min(r.coverageDays >= 9999 ? 365 : r.coverageDays, 365));
    const colors = sortedResults.map(r =>
        r.status === 'CRÍTICO' ? 'rgba(220,38,38,0.72)' :
        r.status === 'ATENÇÃO' ? 'rgba(217,119,6,0.72)' :
        'rgba(22,163,74,0.72)'
    );

    coverageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Cobertura (dias)',
                data,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.72', '1')),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Dias de cobertura (P50)', font: { size: 11 } },
                    beginAtZero: true,
                    ticks: { font: { size: 10 } }
                },
                y: { ticks: { font: { size: 10 } } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: items => items.raw >= 365 ? '365+ dias' : `${items.raw} dias`
                    }
                }
            }
        }
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('add-row-btn')?.addEventListener('click', () => addProductRow());
    document.getElementById('run-simulation-btn')?.addEventListener('click', runSimulation);
    document.getElementById('import-stock-btn')?.addEventListener('click', importFromStock);
    document.getElementById('clear-rows-btn')?.addEventListener('click', () => {
        if (!confirm('Deseja limpar todos os produtos da lista?')) return;
        document.getElementById('montecarlo-tbody').innerHTML = '';
        rowCount = 0;
        document.getElementById('results-section').classList.add('hidden');
        showToast('Lista limpa.', 'info', 2500);
    });

    // Default example rows with typical chemical/hydraulic products
    addProductRow('CLORO GRANULADO',          'kg',  8,  15, 25, 7,  15, 30);
    addProductRow('HIPOCLORITO DE SÓDIO 10%', 'L',  40,  75, 120, 5, 10, 180);
    addProductRow('SULFATO DE ALUMÍNIO',       'kg', 15,  28, 45, 10, 20, 60);
    addProductRow('ANEL DE VEDAÇÃO BORRACHA',  'un',  4,   7, 14, 14, 30, 18);
    addProductRow('TUBO PVC 50mm',             'm',   2,   5, 10, 7,  21, 12);
    addProductRow('GRAXA LUBRIFICANTE',        'kg',  1, 1.5,  3, 10, 21, 4);
});
