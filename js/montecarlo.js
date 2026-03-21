let rowCount = 0;

function addRow(name = '', o = '', m = '', p = '') {
    const tbody = document.getElementById('montecarlo-tbody');
    if (!tbody) return;
    
    const tr = document.createElement('tr');
    rowCount++;
    
    tr.innerHTML = `
        <td class="px-4 py-3">
            <input type="text" class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 task-name" placeholder="Ex: Etapa ${rowCount}" value="${name}">
        </td>
        <td class="px-4 py-3">
            <input type="number" step="any" class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 optim-val" placeholder="Otimista" value="${o}">
        </td>
        <td class="px-4 py-3">
            <input type="number" step="any" class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 likely-val" placeholder="Provável" value="${m}">
        </td>
        <td class="px-4 py-3">
            <input type="number" step="any" class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 pessim-val" placeholder="Pessimista" value="${p}">
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

document.addEventListener('DOMContentLoaded', async () => {
    const addBtn = document.getElementById('add-task-btn');
    const runBtn = document.getElementById('run-simulation-btn');
    const loadBtn = document.getElementById('load-project-btn');

    // Default rows
    addRow('Ex: Fundação', 10000, 12000, 15000);
    addRow('Ex: Estrutura', 20000, 22000, 28000);
    addRow('Ex: Acabamento', 15000, 18000, 25000);

    if(addBtn) addBtn.addEventListener('click', () => addRow());
    if(runBtn) runBtn.addEventListener('click', runSimulation);
    if(loadBtn) loadBtn.addEventListener('click', importProjectData);

    await loadCompletedProjects();
});

async function loadCompletedProjects() {
    const select = document.getElementById('sim-project-select');
    if (!select) return;

    try {
        const projects = await fetchProjects();
        const completed = projects.filter(p => p.status === 'Completed' || p.status === 'Concluída');
        
        completed.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            // Limit text size
            option.textContent = p.name.length > 50 ? p.name.substring(0, 50) + '...' : p.name;
            select.appendChild(option);
        });
    } catch (e) {
        console.error("Error loading completed projects:", e);
    }
}

async function importProjectData() {
    const select = document.getElementById('sim-project-select');
    const projectId = select.value;
    if (!projectId) return alert('Selecione um projeto primeiro.');

    const btn = document.getElementById('load-project-btn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">refresh</span> Carregando...';
    btn.disabled = true;

    try {
        // Obter custos e tarefas do projeto para gerar simulação base
        const items = await fetchProjectItems(projectId);
        const allTasks = await fetchTasks();
        const projectTasks = allTasks.filter(t => t.project_id === projectId);
        
        const tbody = document.getElementById('montecarlo-tbody');
        tbody.innerHTML = '';
        rowCount = 0;

        let added = 0;

        // Import items (custos diretos modelam com -20% e +30% de incerteza sugerida)
        items.forEach(item => {
            const m = parseFloat(item.value) * parseFloat(item.quantity) || 0;
            if (m > 0) {
                const o = m * 0.8;
                const p = m * 1.3;
                addRow(`Custo: ${item.name}`, Math.round(o), Math.round(m), Math.round(p));
                added++;
            }
        });

        // Import tasks (prazos ou etapas extras, deixamos em 0 para o usuário preencher)
        projectTasks.forEach(task => {
            addRow(`Etapa: ${task.title}`, 0, 0, 0);
            added++;
        });

        if (added === 0) {
            alert('Este projeto selecionado não possui itens ou tarefas para importar.');
            // Restaurar default
            addRow('Ex: Fundação', 10000, 12000, 15000);
            addRow('Ex: Estrutura', 20000, 22000, 28000);
            addRow('Ex: Acabamento', 15000, 18000, 25000);
        } else {
            alert('Projeto Carregado!\\n\\nOs itens de custo do projeto foram preenchidos utilizando Otimista (-20%) e Pessimista (+30%) como sugestão inicial.\\nAs tarefas foram adicionadas em brancas para que você insira estimativas remanescentes.\\n\\nFique à vontade para ajustar qualquer valor antes de simular.');
        }
    } catch (e) {
         console.error(e);
         alert('Erro ao carregar projeto: ' + e.message);
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

let mcChart = null;

function runSimulation() {
    const rows = document.querySelectorAll('#montecarlo-tbody tr');
    const tasks = [];
    
    let baseSum = 0;

    rows.forEach(row => {
        const oInput = row.querySelector('.optim-val').value;
        const mInput = row.querySelector('.likely-val').value;
        const pInput = row.querySelector('.pessim-val').value;
        const name = row.querySelector('.task-name').value;

        if (oInput && mInput && pInput) {
            const o = parseFloat(oInput);
            const m = parseFloat(mInput);
            const p = parseFloat(pInput);
            
            if (!isNaN(o) && !isNaN(m) && !isNaN(p)) {
                tasks.push({name: name || 'Sem nome', o, m, p});
                baseSum += m;
            }
        }
    });

    if (tasks.length === 0) {
        alert("Adicione pelo menos uma etapa com valores válidos para simular.");
        return;
    }

    // Validate inputs
    for (let t of tasks) {
        if (t.o > t.m || t.m > t.p) {
            alert(`Erro na etapa "${t.name}": O valor Otimista deve ser menor ou igual ao Provável, e o Provável menor ou igual ao Pessimista.`);
            return;
        }
    }

    // Execute 10,000 Iterations of Monte Carlo using Triangular Distribution
    const iterations = 10000;
    const results = [];

    // Change button state
    const runBtn = document.getElementById('run-simulation-btn');
    const originalText = runBtn.innerHTML;
    runBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Simulando...';
    runBtn.disabled = true;

    // Use setTimeout to allow UI update before heavy computation
    setTimeout(() => {
        for (let i = 0; i < iterations; i++) {
            let total = 0;
            for (let t of tasks) {
                // Triangular Distribution random sample
                const U = Math.random();
                const F = (t.p - t.o) === 0 ? 0 : (t.m - t.o) / (t.p - t.o);
                
                if (U < F) {
                    total += t.o + Math.sqrt(U * (t.p - t.o) * (t.m - t.o));
                } else {
                    total += t.p - Math.sqrt((1 - U) * (t.p - t.o) * (t.p - t.m));
                }
            }
            results.push(total);
        }

        results.sort((a,b) => a - b);

        const P50 = results[Math.floor(iterations * 0.5)];
        const P80 = results[Math.floor(iterations * 0.8)];
        const P90 = results[Math.floor(iterations * 0.9)];
        const P95 = results[Math.floor(iterations * 0.95)];

        // Show Results
        document.getElementById('results-section').classList.remove('hidden');

        // Scroll to results softly
        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });

        const fmt = (v) => v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits:2});

        document.getElementById('res-base').innerText = fmt(baseSum);
        document.getElementById('res-p50').innerText = fmt(P50);
        document.getElementById('res-p80').innerText = fmt(P80);
        document.getElementById('res-p95').innerText = fmt(P95);

        document.getElementById('cont-base').innerText = fmt(baseSum);
        document.getElementById('cont-p90').innerText = fmt(P90);
        
        const contReserve = P90 - baseSum;
        const contReserveElem = document.getElementById('cont-reserve');
        
        if (contReserve >= 0) {
            contReserveElem.innerText = '+ ' + fmt(contReserve);
            contReserveElem.className = 'text-lg font-bold text-green-600 dark:text-green-400';
        } else {
            contReserveElem.innerText = fmt(contReserve);
            contReserveElem.className = 'text-lg font-bold text-red-600 dark:text-red-400';
        }

        drawHistogram(results);

        runBtn.innerHTML = originalText;
        runBtn.disabled = false;
    }, 50);
}

function drawHistogram(results) {
    const min = results[0];
    const max = results[results.length - 1];
    const binsCount = 50;
    const binSize = (max - min) / binsCount;

    const bins = new Array(binsCount).fill(0);
    
    results.forEach(val => {
        let idx = Math.floor((val - min) / binSize);
        if (idx >= binsCount) idx = binsCount - 1;
        bins[idx]++;
    });

    const labels = [];
    for (let i = 0; i < binsCount; i++) {
        const binStart = min + i * binSize;
        const binEnd = binStart + binSize;
        // Média do intervalo para a label
        const binMid = (binStart + binEnd) / 2;
        labels.push(binMid); 
    }

    const ctx = document.getElementById('montecarloChart').getContext('2d');
    
    if (mcChart) mcChart.destroy();

    // Calcula P50, P80, P90, P95 para desenhar linhas verticais (usamos o array results)
    const iterations = results.length;
    const P50 = results[Math.floor(iterations * 0.5)];
    const P90 = results[Math.floor(iterations * 0.9)];

    // Plugin customizado para desenhar linhas nos quantis
    const verticalLinePlugin = {
        id: 'verticalLines',
        afterDraw: chart => {
            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;

            const drawLine = (value, color, text) => {
                // Finds closest label index to position X
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
                
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(xPoint, yAxis.top);
                ctx.lineTo(xPoint, yAxis.bottom);
                ctx.lineWidth = 2;
                ctx.strokeStyle = color;
                ctx.setLineDash([5, 5]);
                ctx.stroke();

                ctx.fillStyle = color;
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.fillText(text, xPoint + 5, yAxis.top + 15);
                ctx.restore();
            };

            drawLine(P50, 'rgba(37, 99, 235, 1)', 'P50'); // Blue 600
            drawLine(P90, 'rgba(22, 163, 74, 1)', 'P90'); // Green 600
        }
    };

    mcChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => l.toLocaleString('pt-BR', {maximumFractionDigits:0})),
            datasets: [{
                label: 'Frequência (Iterações)',
                data: bins,
                backgroundColor: 'rgba(79, 70, 229, 0.7)', // Indigo
                borderColor: 'rgba(79, 70, 229, 1)',
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
                    title: { display: true, text: 'Valores Estimados' },
                    ticks: { maxTicksLimit: 10 }
                },
                y: {
                    title: { display: true, text: 'Número de Iterações' },
                    beginAtZero: true
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (items) => 'Intervalo ≈ ' + items[0].label,
                    }
                },
                legend: {
                    display: false
                }
            }
        },
        plugins: [verticalLinePlugin]
    });
}
