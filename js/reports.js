
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Reports page loading...');
    await loadReportsData();
    await loadReportsData();
    await initReportFilters();
    setupExportButtons();
    // Register Chart DataLabels
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }
});

let reportChart = null;
let statusChart = null;


let allProjectsForReport = [];

async function initReportFilters() {


    // Load Projects
    allProjectsForReport = await fetchProjectSummaries();
    populateProjectSelect(allProjectsForReport);

    // Filter Listeners
    document.getElementById('report-project-select').addEventListener('change', (e) => loadProjectDetails(e.target.value));
    document.getElementById('report-month-filter').addEventListener('change', reloadDetails);
    document.getElementById('report-year-filter').addEventListener('change', reloadDetails);
    document.getElementById('chart-type-select').addEventListener('change', reloadDetails);
}



function populateProjectSelect(projects) {
    const select = document.getElementById('report-project-select');
    select.innerHTML = '<option value="">Selecione um projeto...</option>';
    projects.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        select.appendChild(option);
    });
}

function reloadDetails() {
    const projectId = document.getElementById('report-project-select').value;
    if (projectId) loadProjectDetails(projectId);
}

async function loadProjectDetails(projectId) {
    const month = document.getElementById('report-month-filter').value;
    const year = document.getElementById('report-year-filter').value;
    const chartType = document.getElementById('chart-type-select').value;

    const container = document.getElementById('detailed-report-container');
    const chartContainer = document.getElementById('chart-container');
    const tbody = document.getElementById('detailed-report-body');
    const tfoot = document.getElementById('detailed-report-footer');

    if (!projectId) {
        container.classList.add('hidden');
        chartContainer.classList.add('hidden');
        // Revert to global stats
        renderStatistics(reportData);
        return;
    }

    try {
        // Fetch full project details (for budget columns)
        // Since fetchProjects currently returns all, we can find it in the cached list or fetch again.
        // Optimizing: fetch single project by ID if API supports, or find in fetched list.
        // Let's rely on fetchProjects for now or fetchItems + finding project.
        // We'll fetch items and project.

        // Fetch project to get budget breakdown
        const { data: project, error } = await _supabase.from('projects').select('*').eq('id', projectId).single();
        if (error) throw error;

        // Fetch items
        const items = await fetchProjectItems(projectId);

        container.classList.remove('hidden');
        if (typeof chartContainer !== 'undefined' && chartContainer) {
            chartContainer.classList.remove('hidden');
        }
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        const categories = [
            'Reservatórios', 'Filtros PRFV', 'Bombas', 'Hidráulicos',
            'Elétricos', 'Dosadoras', 'Terceiros', 'Frete', 'Eletrólise', 'Outros'
        ];

        let totalBudget = 0;
        let totalActual = 0;

        // Arrays for Chart
        const chartLabels = [];
        const chartBudgets = [];
        const chartActuals = [];

        categories.forEach(cat => {
            // Get Budget
            // Map category name to column name: 'Reservatórios' -> 'budget_reservatorios'
            // Special handling for special chars or mapping
            let budgetCol = '';
            if (cat === 'Reservatórios') budgetCol = 'budget_reservatorios';
            else if (cat === 'Filtros PRFV') budgetCol = 'budget_filtros';
            else if (cat === 'Bombas') budgetCol = 'budget_bombas';
            else if (cat === 'Hidráulicos') budgetCol = 'budget_hidraulicos';
            else if (cat === 'Elétricos') budgetCol = 'budget_eletricos';
            else if (cat === 'Dosadoras') budgetCol = 'budget_dosadoras';
            else if (cat === 'Terceiros') budgetCol = 'budget_terceiros';
            else if (cat === 'Frete') budgetCol = 'budget_frete';
            else if (cat === 'Eletrólise') budgetCol = 'budget_eletrolise';

            const catBudget = budgetCol ? (parseFloat(project[budgetCol]) || 0) : 0;

            // Get Actual Cost
            // Get Actual Cost (Filtered)
            const catItems = items.filter(i => {
                // Category Filter
                const matchCat = cat === 'Outros' ? (!i.category || i.category === 'Outros') : i.category === cat;

                // Date Filter (using created_at of item)
                let matchDate = true;
                if (i.created_at) {
                    const d = new Date(i.created_at);
                    if (month !== "" && d.getMonth().toString() !== month) matchDate = false;
                    if (year !== "" && d.getFullYear().toString() !== year) matchDate = false;
                }

                return matchCat && matchDate;
            });
            const catActual = catItems.reduce((sum, i) => sum + (parseFloat(i.value || 0) * parseFloat(i.quantity || 1)), 0);

            const balance = catBudget - catActual;
            const balanceClass = balance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';

            if (cat === 'Outros' && catBudget === 0 && catActual === 0) return; // Skip empty 'Outros'

            totalBudget += catBudget;
            totalActual += catActual;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50";
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium">${cat}</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm">${formatCurrency(catBudget)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm">${formatCurrency(catActual)}</td>
                <td class="px-6 py-4 whitespace-nowrap ${balanceClass} text-sm">${formatCurrency(balance)}</td>
            `;
            tbody.appendChild(tr);
            chartLabels.push(cat);
            chartBudgets.push(catBudget);
            chartActuals.push(catActual);
        });

        renderCostChart(chartLabels, chartBudgets, chartActuals, chartType);

        // Update PAD for this specific project
        // Find project summary data for status info
        const projectSummary = reportData.find(p => p.projectName === project.name) || {
            projectName: project.name,
            status: project.status,
            budget: totalBudget, // Use calculated total budget
            totalValue: totalActual, // Use calculated total actual
            timeSpent: 0, // We might need to fetch this if not available, or pass it
            // For now let's use what we have or try to find in reportData
        };

        // If we found it in reportData, it has timeSpent and other computed fields
        if (projectSummary) {
            // Ensure totals match the detailed calculation if needed, or just use detaled calculation
            projectSummary.budget = totalBudget;
            projectSummary.totalValue = totalActual;
        }

        updatePADForProject(projectSummary, items);

        const totalBalance = totalBudget - totalActual;
        const totalBalanceClass = totalBalance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';

        tfoot.innerHTML = `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold">TOTAL</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold">${formatCurrency(totalBudget)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold">${formatCurrency(totalActual)}</td>
                <td class="px-6 py-4 whitespace-nowrap ${totalBalanceClass} text-sm">${formatCurrency(totalBalance)}</td>
            </tr>
        `;

    } catch (e) {
        console.error("Error loading details", e);
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Erro ao carregar detalhes: ${e.message}</td></tr>`;
    }
}

let reportData = [];

async function loadReportsData() {
    const tableBody = document.getElementById('main-report-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="8" class="px-6 py-4 text-center">Carregando dados...</td></tr>';

    try {

        const projects = await fetchProjectSummaries();
        const tasks = await fetchTasks();

        // ... (rest of logic same until render) ...

        reportData = [];

        for (const project of projects) {
            // Optimized: Use Pre-calculated Total Cost from View
            const totalValue = parseFloat(project.total_cost || 0);

            // Filter tasks for this project
            const projectTasks = tasks.filter(t => t.project_id === project.id);

            // Calculate Time Metrics (Simple estimation based on completed tasks)
            let totalDurationMs = 0;
            let longestTask = { title: '-', duration: 0 };

            projectTasks.forEach(task => {
                if (task.status === 'Done' || task.status === 'Completed' || task.completed_at) {
                    const end = task.completed_at ? new Date(task.completed_at) : new Date(task.due_date); // Fallback
                    const start = new Date(task.created_at);
                    const duration = end - start;

                    if (duration > 0) {
                        totalDurationMs += duration;
                        if (duration > longestTask.duration) {
                            longestTask = { title: task.title, duration: duration };
                        }
                    }
                }
            });

            // Convert to days
            const timeSpentDays = Math.round(totalDurationMs / (1000 * 60 * 60 * 24));

            const budget = parseFloat(project.budget_goal || 0);
            const balance = budget - totalValue;

            reportData.push({
                projectName: project.name,
                lead: project.lead_name || 'N/A',
                status: project.status,
                budget: budget,
                totalValue: totalValue, // Custo Real
                balance: balance,
                timeSpent: timeSpentDays,
                longestStage: longestTask.title
            });
        }


        renderStatistics(reportData);
        renderReportsTable(reportData);

    } catch (error) {
        console.error('Error loading reports:', error);
        tableBody.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-center text-red-500">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
}

function renderReportsTable(data) {
    const tableBody = document.getElementById('main-report-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="px-6 py-4 text-center text-gray-500">Nenhum projeto encontrado.</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";

        // Status Badge logic
        let statusClass = "bg-gray-100 text-gray-800";
        let statusLabel = row.status;
        if (row.status === 'In Progress' || row.status === 'Em Andamento') {
            statusClass = "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
            statusLabel = "Em Andamento";
        } else if (row.status === 'Completed' || row.status === 'Concluído') {
            statusClass = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
            statusLabel = "Concluído";
        } else if (row.status === 'On Hold' || row.status === 'Em Espera') {
            statusClass = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
            statusLabel = "Em Espera";
        }

        const balanceClass = row.balance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium">${row.projectName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${row.lead}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                    ${statusLabel}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm">${formatCurrency(row.budget)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm">${formatCurrency(row.totalValue)}</td>
            <td class="px-6 py-4 whitespace-nowrap ${balanceClass} text-sm">${formatCurrency(row.balance)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${row.timeSpent} dias</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm truncate max-w-xs" title="${row.longestStage}">${row.longestStage}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function setupExportButtons() {
    const exportXlsBtn = document.getElementById('export-btn');
    if (exportXlsBtn) {
        exportXlsBtn.onclick = exportToXLS;
    }

    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) {
        exportPdfBtn.onclick = exportToPDF;
    }
}

function exportToXLS() {
    if (!reportData || reportData.length === 0) {
        alert('Não há dados para exportar.');
        return;
    }

    // Prepare data for SheetJS
    const wsData = reportData.map(row => ({
        "Projeto": row.projectName,
        "Responsável": row.lead,
        "Status": row.status,
        "Meta (R$)": row.budget,
        "Custo Real (R$)": row.totalValue,
        "Saldo (R$)": row.balance,
        "Tempo Gasto (Dias)": row.timeSpent,
        "Etapa Mais Longa": row.longestStage
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório Projetos");

    XLSX.writeFile(wb, "Relatorio_Projetos.xlsx");
}

function exportToPDF() {
    if (!reportData || reportData.length === 0) {
        alert('Não há dados para exportar.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l'); // Landscape for more columns

    doc.setFontSize(18);
    doc.text("Relatório de Projetos", 14, 22);
    doc.setFontSize(11);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

    const tableColumn = ["Projeto", "Responsável", "Status", "Meta", "Custo", "Saldo", "Tempo", "Etapa Longa"];
    const tableRows = [];

    reportData.forEach(row => {
        const reportRow = [
            row.projectName,
            row.lead,
            row.status === 'In Progress' ? 'Em Andamento' : row.status,
            formatCurrency(row.budget),
            formatCurrency(row.totalValue),
            formatCurrency(row.balance),
            row.timeSpent,
            row.longestStage
        ];
        tableRows.push(reportRow);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 40,
    });

    doc.save("Relatorio_Projetos.pdf");
}

function renderCostChart(labels, budgets, actuals, chartType = 'bar') {
    const ctx = document.getElementById('costAnalysisChart').getContext('2d');

    let type = 'bar';
    let indexAxis = 'x';
    if (chartType === 'horizontalBar') {
        type = 'bar';
        indexAxis = 'y';
    } else if (chartType === 'line') {
        type = 'line';
    }



    if (reportChart) {
        reportChart.destroy();
    }

    if (indexAxis === 'y') {
        const height = labels.length * 50 + 100; // 50px per bar group + padding
        ctx.canvas.parentNode.style.height = `${height}px`;
    } else {
        ctx.canvas.parentNode.style.height = '400px'; // Default for vertical/line
    }

    reportChart = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Meta (Orçamento)',
                    data: budgets,
                    backgroundColor: 'rgba(107, 114, 128, 0.5)',
                    borderColor: 'rgba(107, 114, 128, 1)',
                    borderWidth: 1,
                    datalabels: {
                        align: indexAxis === 'y' ? 'end' : 'end',
                        anchor: indexAxis === 'y' ? 'end' : 'end',
                        color: '#6b7280',
                        formatter: (val) => val > 0 ? 'R$' + val.toLocaleString('pt-BR') : '',
                        display: function (context) { return context.dataset.data[context.dataIndex] > 0; }
                    }
                },
                {
                    label: 'Custo Real',
                    data: actuals,
                    backgroundColor: function (context) {
                        const index = context.dataIndex;
                        const budget = budgets[index] || 0;
                        const actual = context.dataset.data[index] || 0;
                        return actual > budget && budget > 0 ? 'rgba(220, 38, 38, 0.7)' : 'rgba(19, 91, 236, 0.7)';
                    },
                    borderColor: function (context) {
                        const index = context.dataIndex;
                        const budget = budgets[index] || 0;
                        const actual = context.dataset.data[index] || 0;
                        return actual > budget && budget > 0 ? 'rgba(220, 38, 38, 1)' : 'rgba(19, 91, 236, 1)';
                    },
                    borderWidth: 1,
                    datalabels: {
                        align: indexAxis === 'y' ? 'end' : 'end',
                        anchor: indexAxis === 'y' ? 'end' : 'end',
                        color: '#000',
                        font: { weight: 'bold' },
                        formatter: (val) => val > 0 ? 'R$' + val.toLocaleString('pt-BR') : '',
                        display: function (context) { return context.dataset.data[context.dataIndex] > 0; }
                    }
                }
            ]
        },
        options: {
            indexAxis: indexAxis,
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    right: 50, // extra padding for horizontal labels
                    top: 30
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Análise Financeira: Meta vs Custo Real por Categoria',
                    font: { size: 16 }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (val) {
                            return indexAxis === 'y' ? 'R$ ' + val.toLocaleString('pt-BR') : val;
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (val) {
                            return indexAxis === 'x' ? 'R$ ' + val.toLocaleString('pt-BR') : this.getLabelForValue(val);
                        }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}


function renderStatistics(data) {
    const problemsContainer = document.getElementById('pad-problems');
    const analysisContainer = document.getElementById('pad-analysis-summary');
    const decisionsContainer = document.getElementById('pad-decisions');

    if (!problemsContainer || !analysisContainer || !decisionsContainer) return;

    // --- 1. Problema (Detect Issues) ---
    const problematicProjects = [];
    const delayedProjects = [];

    data.forEach(p => {
        // Budget vs Cost issue
        if (p.totalValue > p.budget && p.budget > 0) {
            problematicProjects.push({ name: p.projectName, type: 'cost', extrValue: p.totalValue - p.budget });
        }
        // Status issue
        if (p.status === 'Late' || p.status === 'Atrasado' || (p.status === 'On Hold' && p.timeSpent > 30)) {
            delayedProjects.push({ name: p.projectName, type: 'delay' });
        }
    });

    let problemsHTML = '';
    if (problematicProjects.length === 0 && delayedProjects.length === 0) {
        problemsHTML = '<div class="text-green-600 flex items-center gap-2"><span class="material-symbols-outlined">check_circle</span><p>Nenhum problema crítico detectado.</p></div>';
    } else {
        if (problematicProjects.length > 0) {
            problemsHTML += `<div class="mb-2"><p class="font-bold text-red-600">${problematicProjects.length} Projetos acima do orçamento:</p><ul class="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">`;
            problematicProjects.slice(0, 3).forEach(p => {
                problemsHTML += `<li>${p.name} (+${formatCurrency(p.extrValue)})</li>`;
            });
            if (problematicProjects.length > 3) problemsHTML += `<li>...e mais ${problematicProjects.length - 3}</li>`;
            problemsHTML += '</ul></div>';
        }
        if (delayedProjects.length > 0) {
            problemsHTML += `<div><p class="font-bold text-orange-600">${delayedProjects.length} Projetos com atraso/parados:</p><ul class="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">`;
            delayedProjects.slice(0, 3).forEach(p => {
                problemsHTML += `<li>${p.name}</li>`;
            });
            if (delayedProjects.length > 3) problemsHTML += `<li>...e mais ${delayedProjects.length - 3}</li>`;
            problemsHTML += '</ul></div>';
        }
    }
    problemsContainer.innerHTML = problemsHTML;

    // --- 2. Análise (Visualize & Summarize) ---
    renderStatusChart(data); // Re-use chart logic

    const totalProjects = data.length;
    const completed = data.filter(p => p.status === 'Completed' || p.status === 'Concluído').length;
    const completionRate = totalProjects > 0 ? ((completed / totalProjects) * 100).toFixed(0) : 0;

    analysisContainer.innerHTML = `
        <span class="font-bold">${totalProjects}</span> projetos totais analisados.<br>
        Taxa de conclusão atual: <span class="font-bold ${completionRate >= 50 ? 'text-green-600' : 'text-yellow-600'}">${completionRate}%</span>.<br>
        Visualização da distribuição de status acima.
    `;

    // --- 3. Decisão (Actionable Insights) ---
    let decisionsHTML = '';
    const suggestions = [];

    if (problematicProjects.length > 0) {
        suggestions.push("Revisar planilha de custos dos projetos com estouro de orçamento.");
        suggestions.push("Agendar reunião de alinhamento financeiro.");
    }
    if (delayedProjects.length > 0) {
        suggestions.push("Verificar impedimentos dos projetos parados/atrasados.");
    }
    if (completionRate < 30) {
        suggestions.push("Focar na entrega de projetos em fase final.");
    }
    if (suggestions.length === 0) {
        suggestions.push("Manter o monitoramento regular.");
        suggestions.push("Avaliar início de novos projetos.");
    }

    suggestions.forEach(s => {
        decisionsHTML += `
            <div class="flex items-start gap-2">
                <span class="material-symbols-outlined text-green-500 text-lg mt-0.5">arrow_forward</span>
                <p class="text-sm text-gray-700 dark:text-gray-300">${s}</p>
            </div>
        `;
    });
    decisionsContainer.innerHTML = decisionsHTML;
}


function renderStatusChart(data) {
    const ctx = document.getElementById('statusDistributionChart').getContext('2d');

    // Count statuses
    const statusCounts = {};
    data.forEach(p => {
        let status = p.status;
        if (status === 'In Progress') status = 'Em Andamento';
        if (status === 'Completed') status = 'Concluído';
        if (status === 'On Hold') status = 'Em Espera';

        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const labels = Object.keys(statusCounts);
    const downloadData = Object.values(statusCounts);

    if (statusChart) {
        statusChart.destroy();
    }

    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: downloadData,
                backgroundColor: [
                    '#3b82f6', // blue for active
                    '#22c55e', // green for completed
                    '#eab308', // yellow for on hold
                    '#ef4444', // red
                    '#a855f7'  // purple
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        weight: 'bold'
                    },
                    formatter: (value, ctx) => {
                        let sum = 0;
                        let dataArr = ctx.chart.data.datasets[0].data;
                        dataArr.map(data => {
                            sum += data;
                        });
                        let percentage = (value * 100 / sum).toFixed(0) + "%";
                        return percentage;
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function updatePADForProject(project, items) {
    const problemsContainer = document.getElementById('pad-problems');
    const analysisContainer = document.getElementById('pad-analysis-summary');
    const decisionsContainer = document.getElementById('pad-decisions');

    if (!problemsContainer || !analysisContainer || !decisionsContainer) return;

    // --- 1. Problema (Specific Project Issues) ---
    let problemsHTML = '';
    const issues = [];

    // Check Cost
    const overBudget = project.totalValue > project.budget && project.budget > 0;
    if (overBudget) {
        issues.push({
            text: `Orçamento Excedido: +${formatCurrency(project.totalValue - project.budget)}`,
            severity: 'red'
        });
    }

    // Check Status/Time
    let statusMsg = '';
    if (project.status === 'Late' || project.status === 'Atrasado') {
        issues.push({ text: "Projeto Atrasado", severity: 'orange' });
    } else if (project.status === 'On Hold' || project.status === 'Em Espera') {
        issues.push({ text: "Projeto Parado/Em Espera", severity: 'orange' });
    }

    if (issues.length === 0) {
        problemsHTML = '<div class="text-green-600 flex items-center gap-2"><span class="material-symbols-outlined">check_circle</span><p>Projeto dentro dos parâmetros.</p></div>';
    } else {
        problemsHTML += `<div class="mb-2"><p class="font-bold text-gray-800 dark:text-gray-200 mb-2">Atenção Necessária:</p><ul class="space-y-2">`;
        issues.forEach(issue => {
            const colorClass = issue.severity === 'red' ? 'text-red-600' : 'text-orange-600';
            problemsHTML += `<li class="flex items-center gap-2 ${colorClass}"><span class="material-symbols-outlined text-sm">error</span>${issue.text}</li>`;
        });
        problemsHTML += '</ul></div>';
    }
    problemsContainer.innerHTML = problemsHTML;

    // --- 2. Análise (Project Specific Financial Chart) ---
    const ctx = document.getElementById('statusDistributionChart').getContext('2d');
    if (statusChart) {
        statusChart.destroy();
    }

    // Chart Data: Spending vs Remaining Budget (or just Spending breakdown if over budget)
    let chartLabels = ['Gasto (Custo Real)'];
    let chartData = [project.totalValue];
    let chartColors = ['#ef4444'];
    let chartTitle = '';

    if (project.budget > 0) {
        if (project.totalValue <= project.budget) {
            chartLabels = ['Gasto (Custo Real)', 'Saldo Restante'];
            chartData = [project.totalValue, project.budget - project.totalValue];
            chartColors = ['#3b82f6', '#22c55e']; // Blue spent, Green remaining
            chartTitle = 'Uso do Orçamento';
        } else {
            chartLabels = ['Orçamento Inicial', 'Estouro'];
            chartData = [project.budget, project.totalValue - project.budget];
            chartColors = ['#9ca3af', '#ef4444']; // Gray budget, Red overflow
            chartTitle = 'Orçamento Estourado';
        }
    } else {
        chartLabels = ['Gasto Total'];
        chartData = [project.totalValue];
        chartColors = ['#3b82f6'];
        chartTitle = 'Sem Orçamento Definido';
    }

    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chartLabels,
            datasets: [{
                data: chartData,
                backgroundColor: chartColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                title: { display: true, text: chartTitle },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold' },
                    formatter: (value, ctx) => {
                        // show percentage
                        let sum = 0;
                        ctx.chart.data.datasets[0].data.forEach(d => sum += d);
                        if (sum === 0) return "";
                        return (value * 100 / sum).toFixed(0) + "%";
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });

    const completionText = (project.budget > 0)
        ? ((project.totalValue / project.budget) * 100).toFixed(1) + '% do orçamento utilizado.'
        : 'Progresso financeiro indefinido (sem meta).';

    analysisContainer.innerHTML = `
        <span class="font-bold">${project.projectName}</span><br>
        ${completionText}<br>
        Status Atual: <span class="font-bold">${project.status || 'Desconhecido'}</span>
    `;

    // --- 3. Decisão (Specific Recommendations) ---
    let decisionsHTML = '';
    const suggestions = [];

    if (overBudget) {
        suggestions.push("Analisar itens mais caros (ver tabela abaixo).");
        suggestions.push("Negociar suplementação de verba ou corte de custos.");
    }
    if (project.status === 'Late' || project.status === 'Atrasado') {
        suggestions.push("Rever cronograma e prazos das tarefas pendentes.");
    }
    if (project.status === 'On Hold' || project.status === 'Em Espera') {
        suggestions.push("Verificar pendências bloqueantes para retomar o projeto.");
    }
    if (project.budget === 0) {
        suggestions.push("Definir meta orçamentária para melhor controle.");
    }

    // Default suggestion if mostly fine
    if (suggestions.length === 0) {
        suggestions.push("Seguir plano de execução atual.");
        suggestions.push("Monitorar novas compras/gastos.");
    }

    suggestions.forEach(s => {
        decisionsHTML += `
            <div class="flex items-start gap-2">
                <span class="material-symbols-outlined text-green-500 text-lg mt-0.5">arrow_forward</span>
                <p class="text-sm text-gray-700 dark:text-gray-300">${s}</p>
            </div>
        `;
    });
    decisionsContainer.innerHTML = decisionsHTML;
}
