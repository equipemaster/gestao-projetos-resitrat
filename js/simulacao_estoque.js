let rowCount = 0;
let simulationResultsData = {}; // Store results by item id to draw charts later
let charts = {
    c30: null,
    cLT: null
};

// --- Math Functions --- //
function randomPoisson(lambda) {
    let L = Math.exp(-lambda), k = 0, p = 1;
    do {
        k++;
        p *= Math.random();
    } while (p > L);
    return k - 1;
}

function randomNormal(mu, sigma) {
    let u1 = Math.random();
    let u2 = Math.random();
    let z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    let val = z0 * sigma + mu;
    return val >= 0 ? val : 0; // Demand can't be negative
}
// ---------------------- //

function addRow(name = '', mu = '', sigma = '', lt = '', dist = 'poisson') {
    const tbody = document.getElementById('estoque-tbody');
    if (!tbody) return;
    
    const tr = document.createElement('tr');
    tr.dataset.id = 'item_' + (++rowCount);
    
    tr.innerHTML = `
        <td class="px-4 py-3">
            <input type="text" class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 item-name" placeholder="Ex: Item ${rowCount}" value="${name}">
        </td>
        <td class="px-4 py-3">
            <input type="number" step="any" class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 item-mu" placeholder="Ex: 0.25" value="${mu}">
        </td>
        <td class="px-4 py-3">
            <input type="number" step="any" class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 item-sigma" placeholder="Ex: 1.06" value="${sigma}">
        </td>
        <td class="px-4 py-3">
            <input type="number" step="1" class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 item-lt" placeholder="Dias" value="${lt}">
        </td>
        <td class="px-4 py-3">
            <select class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 item-dist">
                <option value="poisson" ${dist === 'poisson' ? 'selected' : ''}>Poisson</option>
                <option value="normal" ${dist === 'normal' ? 'selected' : ''}>Normal</option>
            </select>
        </td>
        <td class="px-4 py-3 text-right">
            <button type="button" class="text-red-500 hover:text-red-700 remove-btn p-1 mt-1">
                <span class="material-symbols-outlined text-lg">delete</span>
            </button>
        </td>
    `;

    tr.querySelector('.remove-btn').addEventListener('click', () => {
        tr.remove();
    });

    tbody.appendChild(tr);
}

document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('add-item-btn');
    const runBtn = document.getElementById('run-simulation-btn');
    const importBtn = document.getElementById('import-history-btn');
    const horizonSel = document.getElementById('sim-horizon');
    const clearBtn = document.getElementById('clear-items-btn');

    // Default rows based on instruction
    addRow('SODA LÍQUIDA 50% - BB 30 KG', 0.25, 1.06, 7, 'poisson');
    addRow('PAC BB 30 KG', 0.35, 1.21, 7, 'poisson');

    if(addBtn) addBtn.addEventListener('click', () => addRow());
    if(runBtn) runBtn.addEventListener('click', runSimulation);
    if(importBtn) importBtn.addEventListener('click', importFromHistory);
    if(clearBtn) clearBtn.addEventListener('click', clearItems);
    
    if(horizonSel) {
        horizonSel.addEventListener('change', () => {
            const val = horizonSel.value;
            document.getElementById('lbl-horizon').textContent = val;
            document.querySelectorAll('.res-lbl-horizon').forEach(el => el.textContent = val);
            const btnLbl = document.getElementById('btn-import-lbl');
            if (btnLbl) btnLbl.textContent = val + 'd';
            
            const subtitleLbl = document.getElementById('subtitle-horizon');
            if (subtitleLbl) subtitleLbl.textContent = val + ' Dias';
        });
    }

    const chartSelect = document.getElementById('chart-item-select');
    if (chartSelect) {
        chartSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                showItemCharts(e.target.value);
            }
        });
    }
});

async function importFromHistory() {
    const btn = document.getElementById('import-history-btn');
    if(!btn) return;
    
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">refresh</span> Importando...';
    btn.disabled = true;

    try {
        const exits = await fetchStockExits();
        if(!exits || exits.length === 0) {
            alert('Nenhum histórico de saída encontrado.');
            return;
        }

        const tbody = document.getElementById('estoque-tbody');
        tbody.innerHTML = '';
        rowCount = 0;

        // Consider selected horizon days
        const horizonSel = document.getElementById('sim-horizon');
        const horizonValue = horizonSel ? parseInt(horizonSel.value) : 30;
        
        const horizonDaysAgo = new Date();
        horizonDaysAgo.setDate(horizonDaysAgo.getDate() - horizonValue);
        
        // Group by item_id or stock_items.name
        const itemsMap = {};
        
        exits.forEach(exit => {
            const d = new Date(exit.created_at);
            if (d >= horizonDaysAgo) {
                const name = exit.stock_items ? exit.stock_items.name : ('Item ID ' + exit.item_id);
                if (!itemsMap[name]) {
                    itemsMap[name] = { 
                        name: name,
                        dailySum: Array(horizonValue).fill(0) 
                    };
                }
                
                // Which of the horizon days?
                const diffTime = Math.abs(new Date() - d);
                let diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                if(diffDays >= horizonValue) diffDays = horizonValue - 1; // guard
                
                itemsMap[name].dailySum[diffDays] += Number(exit.quantity) || 0;
            }
        });

        let added = 0;
        for (const name in itemsMap) {
            const daily = itemsMap[name].dailySum;
            const total = daily.reduce((a, b) => a + b, 0);
            const mu = total / horizonValue; // average per day
            
            if (mu > 0) {
                // Calculate standard deviation
                const variance = daily.reduce((acc, val) => acc + Math.pow(val - mu, 2), 0) / horizonValue;
                const sigma = Math.sqrt(variance);
                
                // Determine Distribution (Chemicals/Discrete are usually Poisson, others Normal)
                const nUpper = name.toUpperCase();
                let dist = 'normal';
                if (mu < 1 || nUpper.includes('SODA') || nUpper.includes('CLORO') || nUpper.includes('PAC') || nUpper.includes('POLIMERO')) {
                    dist = 'poisson';
                }
                
                // Default lead time to 7 days
                const lt = 7; 
                
                // Append
                addRow(name, mu.toFixed(3), sigma.toFixed(3), lt, dist);
                added++;
            }
        }

        if (added === 0) {
            alert(`Não há saídas registradas nos últimos ${horizonValue} dias.\\nAdicione itens manualmente ou registre saídas para gerar um histórico.`);
            // Restore defaults if nothing found
            addRow('SODA LÍQUIDA 50% - BB 30 KG', 0.25, 1.06, 7, 'poisson');
            addRow('PAC BB 30 KG', 0.35, 1.21, 7, 'poisson');
        } else {
            alert(`Foram importados ${added} itens com movimentação nos últimos ${horizonValue} dias!\\n\\nO Desvio Padrão e a Média foram calculados dia a dia.\\nVocê pode alterar o Lead Time padrão (7 dias) antes de simular.`);
        }
        
    } catch(e) {
        console.error("Erro ao importar do histórico:", e);
        alert('Ocorreu um erro ao importar dados do histórico.');
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

function runSimulation() {
    const rows = document.querySelectorAll('#estoque-tbody tr');
    const items = [];
    
    rows.forEach(row => {
        const name = row.querySelector('.item-name').value;
        const muInput = row.querySelector('.item-mu').value;
        const sigmaInput = row.querySelector('.item-sigma').value;
        const ltInput = row.querySelector('.item-lt').value;
        const dist = row.querySelector('.item-dist').value;
        const id = row.dataset.id;

        if (name && muInput && ltInput) {
            const mu = parseFloat(muInput);
            const sigma = parseFloat(sigmaInput) || 0; // Sigma might be empty/zero
            const lt = parseInt(ltInput);
            
            if (!isNaN(mu) && !isNaN(lt)) {
                items.push({ id, name, mu, sigma, lt, dist });
            }
        }
    });

    if (items.length === 0) {
        alert("Adicione pelo menos um item com Média Diária e Lead Time preenchidos para simular.");
        return;
    }

    // Output UI reset
    const resultsTbody = document.getElementById('results-tbody');
    resultsTbody.innerHTML = '';
    simulationResultsData = {};
    document.getElementById('charts-container').classList.add('hidden');

    // Execute 10,000 Iterations
    const iterations = 10000;
    
    // UI Loading state
    const runBtn = document.getElementById('run-simulation-btn');
    const originalText = runBtn.innerHTML;
    runBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Simulando...';
    runBtn.disabled = true;
    
    // Get Horizon
    const horizonInput = document.getElementById('sim-horizon');
    const horizon = horizonInput ? parseInt(horizonInput.value) : 30;

    // Async execution for UI unblocking
    setTimeout(() => {
        
        items.forEach(item => {
            let res30d = new Float32Array(iterations);
            let resLT = new Float32Array(iterations);
            
            for (let i = 0; i < iterations; i++) {
                let sum30 = 0;
                let sumLT = 0;
                
                // Simulate based on Horizon
                for (let d = 0; d < horizon; d++) {
                    let sample = item.dist === 'poisson' ? randomPoisson(item.mu) : randomNormal(item.mu, item.sigma);
                    sum30 += sample;
                    if (d < item.lt) {
                        sumLT += sample;
                    }
                }
                
                res30d[i] = sum30;
                resLT[i] = sumLT;
            }

            // Sort results to find quantiles
            res30d.sort();
            resLT.sort();

            const p50_30d = res30d[Math.floor(iterations * 0.5)];
            const p95_30d = res30d[Math.floor(iterations * 0.95)];
            
            const p50_LT = resLT[Math.floor(iterations * 0.5)];
            const p95_LT = resLT[Math.floor(iterations * 0.95)];

            simulationResultsData[item.id] = {
                item,
                res30d,
                resLT,
                p50_30d, p95_30d,
                p50_LT, p95_LT
            };

            // Render Result Row
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    ${item.name} <br>
                    <span class="text-xs text-gray-400 font-normal">(${(item.dist === 'poisson' ? 'Poisson' : 'Normal')}, lt: ${item.lt}d)</span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-500 dark:text-gray-400" style="border-left: 1px solid #e5e7eb;">
                    ${formatVal(p50_30d)} und
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-600 dark:text-blue-400" style="border-right: 1px solid #e5e7eb;">
                    ${formatVal(p95_30d)} und
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-500 dark:text-gray-400">
                    ${formatVal(p50_LT)} und
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-center font-bold bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400" style="border-right: 1px solid #e5e7eb;">
                    ${formatVal(p95_LT)} und
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <button class="text-primary hover:text-primary/80 view-chart-btn inline-flex items-center gap-1" data-id="${item.id}">
                        <span class="material-symbols-outlined text-sm">bar_chart</span> Detalhes
                    </button>
                </td>
            `;

            tr.querySelector('.view-chart-btn').addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                showItemCharts(id);
            });

            resultsTbody.appendChild(tr);
        });

        // Show Results section
        document.getElementById('results-section').classList.remove('hidden');
        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
        
        // Show Export PDF button
        const exportBtn = document.getElementById('export-pdf-btn');
        if(exportBtn) exportBtn.classList.remove('hidden');

        // Populate Chart Select Dropdown
        const chartSelect = document.getElementById('chart-item-select');
        if (chartSelect) {
            chartSelect.innerHTML = '';
            for (const key in simulationResultsData) {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = simulationResultsData[key].item.name;
                chartSelect.appendChild(opt);
            }
            chartSelect.addEventListener('change', (e) => {
                showItemCharts(e.target.value);
            });
        }

        // Auto show charts for first item
        if (items.length > 0) {
            if (chartSelect) chartSelect.value = items[0].id;
            showItemCharts(items[0].id);
        }

        // Restore button state
        runBtn.innerHTML = originalText;
        runBtn.disabled = false;
        
    }, 100);
}

function formatVal(val) {
    return Math.ceil(val).toString(); // Rounding up for physical stock
}

function showItemCharts(itemId) {
    const data = simulationResultsData[itemId];
    if (!data) return;

    document.getElementById('charts-container').classList.remove('hidden');
    
    const chartSelect = document.getElementById('chart-item-select');
    if (chartSelect && chartSelect.value !== itemId) {
        chartSelect.value = itemId;
    }
    
    document.getElementById('lt-label').textContent = data.item.lt;

    drawHistogram('chart30Days', charts.c30, data.res30d, data.p50_30d, data.p95_30d, 'rgba(37, 99, 235, 1)', (newChart) => charts.c30 = newChart);
    drawHistogram('chartLeadTime', charts.cLT, data.resLT, data.p50_LT, data.p95_LT, 'rgba(220, 38, 38, 1)', (newChart) => charts.cLT = newChart);
}

function drawHistogram(canvasId, existingChart, resultsArray, p50, p95, primaryColor, saveRefFn) {
    const min = resultsArray[0];
    const max = resultsArray[resultsArray.length - 1];

    // Determine bins
    let binsCount = Math.min(50, Math.ceil(max - min) + 1);
    if (binsCount < 5) binsCount = 5;
    const binSize = (max - min) / binsCount || 1; // prevent div by zero
    
    const bins = new Array(binsCount).fill(0);
    
    for(let i=0; i<resultsArray.length; i++) {
        let val = resultsArray[i];
        let idx = Math.floor((val - min) / binSize);
        if (idx >= binsCount) idx = binsCount - 1;
        bins[idx]++;
    }

    const labels = [];
    for (let i = 0; i < binsCount; i++) {
        const binStart = min + i * binSize;
        const binEnd = binStart + binSize;
        const binMid = (binStart + binEnd) / 2;
        labels.push(binMid);
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    if (existingChart) existingChart.destroy();

    const verticalLinePlugin = {
        id: 'verticalLines',
        afterDraw: chart => {
            const ctxPlugin = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;

            const drawLine = (value, color, text) => {
                let closestIdx = 0;
                let minDiff = Infinity;
                labels.forEach((lbl, idx) => {
                    const diff = Math.abs(lbl - value);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIdx = idx;
                    }
                });

                const xPoint = xAxis.getPixelForTick(closestIdx);
                
                ctxPlugin.save();
                ctxPlugin.beginPath();
                ctxPlugin.moveTo(xPoint, yAxis.top);
                ctxPlugin.lineTo(xPoint, yAxis.bottom);
                ctxPlugin.lineWidth = 2;
                ctxPlugin.strokeStyle = color;
                ctxPlugin.setLineDash([5, 5]);
                ctxPlugin.stroke();

                ctxPlugin.fillStyle = color;
                ctxPlugin.font = 'bold 12px Inter, sans-serif';
                ctxPlugin.fillText(text + ' (' + Math.ceil(value) + ')', xPoint + 5, yAxis.top + 15);
                ctxPlugin.restore();
            };

            drawLine(p50, 'rgba(107, 114, 128, 1)', 'P50'); // Gray 500
            drawLine(p95, primaryColor, 'P95');
        }
    };

    const newChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => l.toLocaleString('pt-BR', {maximumFractionDigits:1})),
            datasets: [{
                label: 'Frequência',
                data: bins,
                backgroundColor: primaryColor.replace(', 1)', ', 0.6)'),
                borderColor: primaryColor,
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
                    title: { display: false },
                    ticks: { maxTicksLimit: 10 }
                },
                y: {
                    title: { display: false },
                    beginAtZero: true
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (items) => 'Unidades ≈ ' + items[0].label
                    }
                },
                legend: {
                    display: false
                }
            }
        },
        plugins: [verticalLinePlugin]
    });

    saveRefFn(newChart);
}

function clearItems() {
    if(confirm('Tem certeza que deseja remover todos os itens da tabela de simulação?')) {
        document.getElementById('estoque-tbody').innerHTML = '';
        rowCount = 0;
        document.getElementById('results-section').classList.add('hidden');
        document.getElementById('charts-container').classList.add('hidden');
        const exportBtn = document.getElementById('export-pdf-btn');
        if(exportBtn) exportBtn.classList.add('hidden');
        simulationResultsData = {};
    }
}

function exportSimulationPDF() {
    if (!window.jspdf) {
        alert('Erro ao carregar a biblioteca de PDF. Verifique a conexão com a internet.');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape

    const horizonInput = document.getElementById('sim-horizon');
    const horizon = horizonInput ? parseInt(horizonInput.value) : 30;
    
    doc.setFontSize(16);
    doc.text(`Simulação Estatística de Estoque (Monte Carlo) - Resitrat`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Data da Simulação: ${new Date().toLocaleDateString('pt-BR')} - Horizonte Previsão: ${horizon} Dias`, 14, 22);
    
    const tableData = [];
    for(const key in simulationResultsData) {
        const d = simulationResultsData[key];
        tableData.push([
            `${d.item.name} (${d.item.dist === 'poisson' ? 'Poisson' : 'Normal'}, LT: ${d.item.lt}d)`,
            `${Math.ceil(d.p50_30d)}`,
            `${Math.ceil(d.p95_30d)}`,
            `${Math.ceil(d.p50_LT)}`,
            `${Math.ceil(d.p95_LT)}`
        ]);
    }

    if (tableData.length === 0) {
        alert('Nenhum resultado para exportar. Execute a simulação primeiro.');
        return;
    }

    doc.autoTable({
        head: [['Item (Configuração)', `Previsão (${horizon}d) - P50`, `Compra Segura (${horizon}d) - P95`, 'Média Reposição. - P50', 'Estoque de Segurança - P95']],
        body: tableData,
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: [19, 91, 236] }, // Tailwind Primary Color (#135bec)
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: {
            1: { halign: 'center' },
            2: { halign: 'center', fontStyle: 'bold', textColor: [37, 99, 235] },
            3: { halign: 'center' },
            4: { halign: 'center', fontStyle: 'bold', textColor: [220, 38, 38], fillColor: [254, 242, 242] }
        }
    });

    doc.save(`Previsao_Estoque_MonteCarlo_${new Date().toISOString().split('T')[0]}.pdf`);
}
