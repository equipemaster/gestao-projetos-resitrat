
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
// Draggable Labels State
let customLabelPositions = {};
let dragState = { isDragging: false, datasetIndex: null, dataIndex: null };
let hoveredLabelContext = null;

function handleLabelDragStart(context) {
    // If context is not passed directly (from mousedown), use hovered context
    if (!context && hoveredLabelContext) {
        context = hoveredLabelContext;
    }
    if (!context) return;

    console.log('Drag Start:', context.dataIndex);
    dragState = {
        isDragging: true,
        datasetIndex: context.datasetIndex,
        dataIndex: context.dataIndex
    };

    // Attach global listeners
    document.addEventListener('mousemove', handleLabelDragMove);
    document.addEventListener('mouseup', handleLabelDragEnd);

    return true;
}

function handleLabelDragMove(event) {
    if (!dragState.isDragging || !reportChart) return;

    // Prevent text selection
    event.preventDefault();

    const meta = reportChart.getDatasetMeta(dragState.datasetIndex);
    const element = meta.data[dragState.dataIndex];
    if (!element) return;

    // Get mouse/touch position relative to canvas
    const rect = reportChart.canvas.getBoundingClientRect();
    let clientX = event.clientX;
    let clientY = event.clientY;

    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    }

    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    // We calculate position relative to the element's 'end' (default anchor)
    // Note: For Bar chart, element.x/y is roughly the center of the top edge (vertical)

    let anchorX = element.x;
    let anchorY = element.y;

    // Adjust if needed based on chart type/orientation, but 'element.tooltipPosition()' might be safer?
    // Let's stick to element.x/y as a good proxy for 'end' anchor.

    const dx = mouseX - anchorX;
    const dy = mouseY - anchorY;

    // Convert to angle and distance
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const distance = Math.sqrt(dx * dx + dy * dy);

    const key = `${dragState.datasetIndex}-${dragState.dataIndex}`;
    customLabelPositions[key] = {
        angle: angle,
        offset: distance
    };

    // Setting chart canvas style for feedback
    reportChart.canvas.style.cursor = 'grabbing';

    // Verify if update logic runs
    // console.log('Updating chart with new position:', key, customLabelPositions[key]);

    reportChart.update();
}

function handleLabelDragEnd(event) {
    if (dragState.isDragging) {
        console.log('Drag End');
        dragState.isDragging = false;
        if (reportChart) reportChart.canvas.style.cursor = 'default';
        document.removeEventListener('mousemove', handleLabelDragMove);
        document.removeEventListener('mouseup', handleLabelDragEnd);
        // Touch events
        document.removeEventListener('touchmove', handleLabelDragMove);
        document.removeEventListener('touchend', handleLabelDragEnd);
    }
}

// Touch Support Adapter
function handleLabelDragStart(context) {
    console.log('Drag Start:', context.dataIndex);
    dragState = {
        isDragging: true,
        datasetIndex: context.datasetIndex,
        dataIndex: context.dataIndex
    };

    if (reportChart) reportChart.canvas.style.cursor = 'grabbing';

    // Attach global listeners
    document.addEventListener('mousemove', handleLabelDragMove);
    document.addEventListener('mouseup', handleLabelDragEnd);
    // Touch events for hybrid devices
    document.addEventListener('touchmove', handleLabelDragMove, { passive: false });
    document.addEventListener('touchend', handleLabelDragEnd);

    return true;
}


let allProjectsForReport = [];
let currentFilteredData = [];

async function initReportFilters() {


    // Load Projects
    allProjectsForReport = await fetchProjectSummaries();
    populateProjectSelect(allProjectsForReport);

    // Filter Listeners
    document.getElementById('report-project-select').addEventListener('change', (e) => loadProjectDetails(e.target.value));
    document.getElementById('report-month-filter').addEventListener('change', reloadDetails);
    document.getElementById('report-year-filter').addEventListener('change', reloadDetails);
    document.getElementById('chart-type-select').addEventListener('change', reloadDetails);
    
    // Global Filter Listener
    const globalStatusFilter = document.getElementById('global-status-filter');
    if (globalStatusFilter) {
        globalStatusFilter.addEventListener('change', applyGlobalFilter);
    }
}

function applyGlobalFilter() {
    const filter = document.getElementById('global-status-filter');
    if (!filter) return;
    const filterVal = filter.value;
    
    if (filterVal) {
        currentFilteredData = reportData.filter(row => {
            let normalizedStatus = row.status;
            if (row.status === 'In Progress' || row.status === 'Em Andamento') normalizedStatus = "Em Andamento";
            else if (row.status === 'Completed' || row.status === 'Concluído') normalizedStatus = "Concluído";
            else if (row.status === 'On Hold' || row.status === 'Em Espera') normalizedStatus = "Em Espera";

            return normalizedStatus === filterVal;
        });
    } else {
        currentFilteredData = [...reportData];
    }

    renderReportsTable(currentFilteredData);
    renderStatistics(currentFilteredData);
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

        // Fetch items and forecast items
        const [items, forecastItems] = await Promise.all([
            fetchProjectItems(projectId),
            _supabase.from('project_forecast_items').select('*').eq('project_id', projectId).then(res => res.data || [])
        ]);

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
        const chartForecasts = [];

        categories.forEach(cat => {
            // Get Budget
            // Map category name to column name: 'Reservatórios' -> 'budget_reservatorios'
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

            // Get Forecast (Payable only: is_paid === false)
            const catForecastItems = forecastItems.filter(i => {
                const matchCat = cat === 'Outros' ? (!i.category || i.category === 'Outros') : i.category === cat;
                return matchCat && !i.is_paid;
            });
            const catForecast = catForecastItems.reduce((sum, i) => sum + (parseFloat(i.value || 0) * parseFloat(i.quantity || 1)), 0);


            const balance = catBudget - catActual;
            const balanceClass = balance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';

            if (cat === 'Outros' && catBudget === 0 && catActual === 0 && catForecast === 0) return; // Skip empty 'Outros'

            totalBudget += catBudget;
            totalActual += catActual;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50";
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium">${cat}</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm">${formatCurrency(catBudget)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm">${formatCurrency(catActual)}</td>
                <td class="px-6 py-4 whitespace-nowrap ${balanceClass} text-sm">${formatCurrency(balance)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-orange-600 font-medium text-sm">${formatCurrency(catForecast)}</td>
            `;
            tbody.appendChild(tr);
            chartLabels.push(cat);
            chartBudgets.push(catBudget);
            chartActuals.push(catActual);
            chartForecasts.push(catForecast);
        });

        renderCostChart(chartLabels, chartBudgets, chartActuals, chartForecasts, chartType);

        const totalBalance = totalBudget - totalActual;
        const totalBalanceClass = totalBalance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
        const totalForecast = chartForecasts.reduce((a, b) => a + b, 0);

        // Update PAD for this specific project
        // Find project summary data for status info
        const projectSummary = reportData.find(p => p.projectName === project.name) || {
            projectName: project.name,
            status: project.status,
            budget: totalBudget,
            totalValue: totalActual,
            forecastPayable: totalForecast, // Add forecastPayable
            timeSpent: 0,
        };

        if (projectSummary) {
            projectSummary.budget = totalBudget;
            projectSummary.totalValue = totalActual;
            projectSummary.forecastPayable = totalForecast; // Ensure it's updated
        }

        updatePADForProject(projectSummary, items);

        tfoot.innerHTML = `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold">TOTAL</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold">${formatCurrency(totalBudget)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold">${formatCurrency(totalActual)}</td>
                <td class="px-6 py-4 whitespace-nowrap ${totalBalanceClass} text-sm">${formatCurrency(totalBalance)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-orange-600 font-bold text-sm">${formatCurrency(totalForecast)}</td>
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

        const [projects, tasks, forecastItems] = await Promise.all([
            fetchProjectSummaries(),
            fetchTasks(),
            _supabase.from('project_forecast_items').select('project_id, quantity, value, is_paid').then(res => res.data)
        ]);

        // ... (rest of logic same until render) ...

        reportData = [];

        for (const project of projects) {
            // Optimized: Use Pre-calculated Total Cost from View
            const totalValue = parseFloat(project.total_cost || 0);

            // Calculate Forecast Payment Status
            let forecastPaid = 0;
            let forecastPayable = 0;

            if (forecastItems) {
                const projectForecasts = forecastItems.filter(i => i.project_id === project.id);
                projectForecasts.forEach(item => {
                    const total = (parseFloat(item.quantity) || 0) * (parseFloat(item.value) || 0);
                    if (item.is_paid) {
                        forecastPaid += total;
                    } else {
                        forecastPayable += total;
                    }
                });
            }

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
                forecastPaid: forecastPaid,
                forecastPayable: forecastPayable,
                balance: balance,
                timeSpent: timeSpentDays,
                longestStage: longestTask.title
            });
        }

        currentFilteredData = [...reportData];
        applyGlobalFilter();

    } catch (error) {
        console.error('Error loading reports:', error);
        tableBody.innerHTML = `<tr><td colspan="10" class="px-6 py-4 text-center text-red-500">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
}

function renderReportsTable(data) {
    const tableBody = document.getElementById('main-report-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" class="px-6 py-4 text-center text-gray-500">Nenhum projeto encontrado.</td></tr>';
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
            <td class="px-6 py-4 whitespace-nowrap text-orange-600 font-medium text-sm">${formatCurrency(row.forecastPayable)}</td>
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
    const projectId = document.getElementById('report-project-select').value;

    if (projectId) {
        // Export Single Project Detail
        const projectName = document.getElementById('report-project-select').selectedOptions[0].text;
        const tbody = document.getElementById('detailed-report-body');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        if (rows.length === 0) {
            alert('Não há detalhes para exportar.');
            return;
        }

        const wsData = rows.map(row => {
            const cols = row.querySelectorAll('td');
            return {
                "Categoria": cols[0].innerText,
                "Meta (R$)": cols[1].innerText,
                "Custo Real (R$)": cols[2].innerText,
                "Saldo (R$)": cols[3].innerText,
                "Prev. A Pagar (R$)": cols[4].innerText
            };
        });

        // Add Footer Total
        const tfoot = document.getElementById('detailed-report-footer');
        if (tfoot && tfoot.rows.length > 0) {
            const footerCols = tfoot.rows[0].querySelectorAll('td');
            wsData.push({
                "Categoria": "TOTAL",
                "Meta (R$)": footerCols[1].innerText,
                "Custo Real (R$)": footerCols[2].innerText,
                "Saldo (R$)": footerCols[3].innerText,
                "Prev. A Pagar (R$)": footerCols[4].innerText
            });
        }

        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Detalhes do Projeto");
        XLSX.writeFile(wb, `Relatorio_Detalhado_${projectName.replace(/[^a-z0-9]/gi, '_')}.xlsx`);

    } else {
        // Export Global List
        if (!currentFilteredData || currentFilteredData.length === 0) {
            alert('Não há dados para exportar.');
            return;
        }

        // Prepare data for SheetJS
        const wsData = currentFilteredData.map(row => ({
            "Projeto": row.projectName,
            "Responsável": row.lead,
            "Status": row.status,
            "Meta (R$)": row.budget,
            "Custo Real (R$)": row.totalValue,
            "Saldo (R$)": row.balance,
            "Prev. A Pagar (R$)": row.forecastPayable,
            "Tempo Gasto (Dias)": row.timeSpent,
            "Etapa Mais Longa": row.longestStage
        }));

        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Relatório Projetos");
        XLSX.writeFile(wb, "Relatorio_Projetos.xlsx");
    }
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const projectId = document.getElementById('report-project-select').value;

    if (projectId) {
        // Export Single Project Detail (Charts + PAD + Table)
        const projectName = document.getElementById('report-project-select').selectedOptions[0].text;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();

        // Title
        doc.setFontSize(16);
        doc.text(`Relatório Detalhado: ${projectName}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 26);

        let currentY = 35;

        // 1. PAD Sections
        // 1. PAD Sections
        const getTextWithoutIcons = (elementId) => {
            const el = document.getElementById(elementId);
            if (!el) return "";
            const clone = el.cloneNode(true);

            // Remove icons
            clone.querySelectorAll('.material-symbols-outlined').forEach(icon => icon.remove());

            // Helper to traverse and insert newlines for block elements
            let text = "";
            const traverse = (node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    text += node.textContent;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tagName = node.tagName.toLowerCase();
                    const isBlock = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'br'].includes(tagName);

                    if (tagName === 'br') text += "\n";

                    if (isBlock && text.length > 0 && !text.endsWith("\n")) {
                        // Add newline before block if needed (e.g., start of list item)
                        // But we primarily care about AFTER
                    }

                    node.childNodes.forEach(child => traverse(child));

                    if (isBlock) {
                        text += "\n"; // Add newline after block element
                    }
                }
            };

            traverse(clone);

            // Normalize whitespace:
            // 1. Replace multiple newlines with a single newline
            // 2. Trim each line
            return text.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
        };

        const problemsText = getTextWithoutIcons('pad-problems');
        const analysisText = getTextWithoutIcons('pad-analysis-summary');
        const decisionsText = getTextWithoutIcons('pad-decisions');

        doc.setFontSize(12);
        doc.setTextColor(220, 38, 38); // Red
        doc.text("Problema (Pontos de Atenção):", 14, currentY);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        const splitProblems = doc.splitTextToSize(problemsText, pageWidth - 28);
        doc.text(splitProblems, 14, currentY + 6);
        currentY += 6 + (splitProblems.length * 5) + 5;

        doc.setFontSize(12);
        doc.setTextColor(37, 99, 235); // Blue
        doc.text("Análise (Resumo):", 14, currentY);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        const splitAnalysis = doc.splitTextToSize(analysisText, pageWidth - 28);
        doc.text(splitAnalysis, 14, currentY + 6);
        currentY += 6 + (splitAnalysis.length * 5) + 5;

        doc.setFontSize(12);
        doc.setTextColor(22, 163, 74); // Green
        doc.text("Decisão (Sugestões):", 14, currentY);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        const splitDecisions = doc.splitTextToSize(decisionsText, pageWidth - 28);
        doc.text(splitDecisions, 14, currentY + 6);
        currentY += 6 + (splitDecisions.length * 5) + 10;

        // 2. Charts
        // We need to capture the canvas as image
        const costChartCanvas = document.getElementById('costAnalysisChart');
        const statusChartCanvas = document.getElementById('statusDistributionChart');

        if (costChartCanvas) {
            const costImg = costChartCanvas.toDataURL("image/png");
            const imgProps = doc.getImageProperties(costImg);
            const imgWidth = pageWidth - 28;
            const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

            if (currentY + imgHeight > 280) { doc.addPage(); currentY = 20; }

            doc.setFontSize(12);
            doc.text("Gráfico de Custos:", 14, currentY);
            doc.addImage(costImg, 'PNG', 14, currentY + 5, imgWidth, imgHeight);
            currentY += imgHeight + 15;
        }

        if (statusChartCanvas) {
            const statusImg = statusChartCanvas.toDataURL("image/png");
            // Make this one smaller, maybe half width or strictly controlled
            const imgWidth = 80;
            const imgHeight = 80;

            if (currentY + imgHeight > 280) { doc.addPage(); currentY = 20; }

            doc.setFontSize(12);
            doc.text("Gráfico de Status/Orçamento:", 14, currentY);
            doc.addImage(statusImg, 'PNG', 14, currentY + 5, imgWidth, imgHeight);
            currentY += imgHeight + 15;
        }


        // 3. Detailed Table
        if (currentY + 20 > 280) { doc.addPage(); currentY = 20; }

        doc.setFontSize(12);
        doc.text("Detalhamento Financeiro:", 14, currentY);

        const tbody = document.getElementById('detailed-report-body');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        if (rows.length > 0) {
            const tableBodyData = rows.map(row => {
                const cols = row.querySelectorAll('td');
                return [cols[0].innerText, cols[1].innerText, cols[2].innerText, cols[3].innerText, cols[4].innerText];
            });

            // Footer
            const tfoot = document.getElementById('detailed-report-footer');
            if (tfoot && tfoot.rows.length > 0) {
                const footerCols = tfoot.rows[0].querySelectorAll('td');
                tableBodyData.push(["TOTAL", footerCols[1].innerText, footerCols[2].innerText, footerCols[3].innerText, footerCols[4].innerText]);
            }

            doc.autoTable({
                head: [['Categoria', 'Meta', 'Custo Real', 'Saldo', 'A Pagar']],
                body: tableBodyData,
                startY: currentY + 5,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' }
            });
        }


        doc.save(`Relatorio_Detalhado_${projectName.replace(/[^a-z0-9]/gi, '_')}.pdf`);

    } else {
        // Export Global List
        if (!currentFilteredData || currentFilteredData.length === 0) {
            alert('Não há dados para exportar.');
            return;
        }

        const doc = new jsPDF('l');

        doc.setFontSize(18);
        doc.text("Relatório de Projetos", 14, 22);
        doc.setFontSize(11);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

        const tableColumn = ["Projeto", "Responsável", "Status", "Meta", "Custo", "Saldo", "A Pagar", "Tempo"];
        const tableRows = [];

        currentFilteredData.forEach(row => {
            const reportRow = [
                row.projectName,
                row.lead,
                row.status === 'In Progress' ? 'Em Andamento' : row.status,
                formatCurrency(row.budget),
                formatCurrency(row.totalValue),
                formatCurrency(row.balance),
                formatCurrency(row.forecastPayable),
                row.timeSpent
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
}

function renderCostChart(labels, budgets, actuals, forecasts, chartType = 'bar') {
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



    // Add canvas mousedown listener for drag
    ctx.canvas.onmousedown = function (e) {
        if (hoveredLabelContext) {
            handleLabelDragStart(hoveredLabelContext);
        }
    };

    const leaderLinePlugin = {
        id: 'leaderLinePlugin',
        afterDatasetsDraw: (chart) => {
            const ctx = chart.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#666';
            ctx.setLineDash([2, 5]); // Dotted line

            Object.keys(customLabelPositions).forEach(key => {
                const [datasetIndex, dataIndex] = key.split('-').map(Number);
                const meta = chart.getDatasetMeta(datasetIndex);
                if (meta.hidden) return;
                const element = meta.data[dataIndex];
                if (!element) return;

                const pos = customLabelPositions[key];

                const startX = element.x;
                const startY = element.y;

                const angleRad = pos.angle * (Math.PI / 180);
                const endX = startX + pos.offset * Math.cos(angleRad);
                const endY = startY + pos.offset * Math.sin(angleRad);

                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
            });

            ctx.stroke();
            ctx.restore();
        }
    };

    reportChart = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Meta (Orçamento)',
                    data: budgets,
                    barPercentage: 0.6,
                    categoryPercentage: 0.7,
                    backgroundColor: 'rgba(107, 114, 128, 0.5)',
                    borderColor: 'rgba(107, 114, 128, 1)',
                    borderWidth: 1,
                    datalabels: {
                        clamp: false,
                        clip: false,
                        align: function (context) {
                            const key = `${context.datasetIndex}-${context.dataIndex}`;
                            return customLabelPositions[key] ? customLabelPositions[key].angle : (indexAxis === 'y' ? 'end' : 'end');
                        },
                        anchor: indexAxis === 'y' ? 'end' : 'end',
                        offset: function (context) {
                            const key = `${context.datasetIndex}-${context.dataIndex}`;
                            return customLabelPositions[key] ? customLabelPositions[key].offset : 4;
                        },
                        rotation: 0,
                        backgroundColor: '#fff',
                        borderRadius: 4,
                        borderColor: '#e5e7eb',
                        borderWidth: 1,
                        padding: 4,
                        color: '#6b7280',
                        font: { size: 10, weight: 'bold' },
                        formatter: (val) => val > 0 ? 'R$' + val.toLocaleString('pt-BR') : '',
                        display: function (context) { return context.dataset.data[context.dataIndex] > 0; },
                        listeners: {
                            enter: function (context) {
                                hoveredLabelContext = context;
                                context.hovered = true;
                                context.chart.canvas.style.cursor = 'move';
                                return true;
                            },
                            leave: function (context) {
                                hoveredLabelContext = null;
                                context.hovered = false;
                                context.chart.canvas.style.cursor = 'default';
                                return true;
                            }
                        }
                    }
                },
                {
                    label: 'Custo Real',
                    data: actuals,
                    barPercentage: 0.6,
                    categoryPercentage: 0.7,
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
                        clamp: false,
                        clip: false,
                        align: function (context) {
                            const key = `${context.datasetIndex}-${context.dataIndex}`;
                            return customLabelPositions[key] ? customLabelPositions[key].angle : (indexAxis === 'y' ? 'end' : 'end');
                        },
                        anchor: indexAxis === 'y' ? 'end' : 'end',
                        offset: function (context) {
                            const key = `${context.datasetIndex}-${context.dataIndex}`;
                            return customLabelPositions[key] ? customLabelPositions[key].offset : 4;
                        },
                        rotation: 0,
                        backgroundColor: '#fff',
                        borderRadius: 4,
                        borderColor: 'rgba(220, 38, 38, 1)',
                        borderWidth: 1,
                        padding: 4,
                        color: '#000',
                        font: { weight: 'bold', size: 10 },
                        formatter: (val) => val > 0 ? 'R$' + val.toLocaleString('pt-BR') : '',
                        display: function (context) { return context.dataset.data[context.dataIndex] > 0; },
                        listeners: {
                            enter: function (context) {
                                hoveredLabelContext = context;
                                context.hovered = true;
                                context.chart.canvas.style.cursor = 'move';
                                return true;
                            },
                            leave: function (context) {
                                hoveredLabelContext = null;
                                context.hovered = false;
                                context.chart.canvas.style.cursor = 'default';
                                return true;
                            }
                        }
                    }
                },
                {
                    label: 'Prev. A Pagar',
                    data: forecasts,
                    barPercentage: 0.6,
                    categoryPercentage: 0.7,
                    backgroundColor: 'rgba(245, 158, 11, 0.7)', // Amber-500
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 1,
                    datalabels: {
                        clamp: false,
                        clip: false,
                        align: function (context) {
                            const key = `${context.datasetIndex}-${context.dataIndex}`;
                            return customLabelPositions[key] ? customLabelPositions[key].angle : (indexAxis === 'y' ? 'end' : 'end');
                        },
                        anchor: indexAxis === 'y' ? 'end' : 'end',
                        offset: function (context) {
                            const key = `${context.datasetIndex}-${context.dataIndex}`;
                            return customLabelPositions[key] ? customLabelPositions[key].offset : 4;
                        },
                        rotation: 0,
                        backgroundColor: '#fff',
                        borderRadius: 4,
                        borderColor: 'rgba(245, 158, 11, 1)',
                        borderWidth: 1,
                        padding: 4,
                        color: '#b45309', // Amber-700
                        font: { weight: 'bold', size: 10 },
                        formatter: (val) => val > 0 ? 'R$' + val.toLocaleString('pt-BR') : '',
                        display: function (context) { return context.dataset.data[context.dataIndex] > 0; },
                        listeners: {
                            enter: function (context) {
                                hoveredLabelContext = context;
                                context.hovered = true;
                                context.chart.canvas.style.cursor = 'move';
                                return true;
                            },
                            leave: function (context) {
                                hoveredLabelContext = null;
                                context.hovered = false;
                                context.chart.canvas.style.cursor = 'default';
                                return true;
                            }
                        }
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
                    right: 80, // extra padding for horizontal labels
                    top: 80, // increased padding for labels
                    bottom: 20
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Análise Financeira: Meta, Custo Real e Previsão a Pagar',
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
        plugins: [ChartDataLabels, leaderLinePlugin]
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
            problematicProjects.forEach(p => {
                problemsHTML += `<li>${p.name} (+${formatCurrency(p.extrValue)})</li>`;
            });
            problemsHTML += '</ul></div>';
        }
        if (delayedProjects.length > 0) {
            problemsHTML += `<div><p class="font-bold text-orange-600">${delayedProjects.length} Projetos com atraso/parados:</p><ul class="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">`;
            delayedProjects.forEach(p => {
                problemsHTML += `<li>${p.name}</li>`;
            });
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

    // Check Forecast vs Remaining Budget
    const remainingBudget = Math.max(0, project.budget - project.totalValue);
    const forecastPayable = project.forecastPayable || 0;
    const forecastRisk = forecastPayable > remainingBudget && project.budget > 0;

    if (forecastRisk) {
        issues.push({
            text: `Risco de Estouro: Previsão a Pagar (${formatCurrency(forecastPayable)}) maior que Saldo (${formatCurrency(remainingBudget)})`,
            severity: 'orange'
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
                        let total = 0;
                        ctx.chart.data.datasets[0].data.forEach(d => total += d);

                        if (total === 0) return "";

                        // If Over Budget, calculate percentage relative to Budget (index 0)
                        if (overBudget && project.budget > 0) {
                            const budgetVal = ctx.chart.data.datasets[0].data[0];
                            const percentage = (value / budgetVal * 100).toFixed(1);

                            // If it's the overflow slice (index 1)
                            if (ctx.dataIndex === 1) return "+" + percentage + "%";
                            // If it's the budget slice (index 0)
                            return "100%";
                        }

                        // Default behavior (Under Budget or No Budget)
                        return (value * 100 / total).toFixed(0) + "%";
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
        Previsão a Pagar: <span class="font-bold text-orange-600">${formatCurrency(project.forecastPayable || 0)}</span><br>
        Status Atual: <span class="font-bold">${project.status || 'Desconhecido'}</span>
    `;

    // --- 3. Decisão (Specific Recommendations) ---
    let decisionsHTML = '';
    const suggestions = [];

    if (overBudget) {
        suggestions.push("Analisar itens mais caros (ver tabela abaixo).");
        suggestions.push("Negociar suplementação de verba ou corte de custos.");
    }
    if (forecastRisk) {
        suggestions.push("Alerta: Previsão de gastos excede o saldo restante.");
        suggestions.push("Revisar itens futuros para evitar estouro.");
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
