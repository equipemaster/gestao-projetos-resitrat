
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Reports page loading...');
    await loadReportsData();
    setupExportButtons();
});

let reportData = [];

async function loadReportsData() {
    const tableBody = document.querySelector('tbody');
    tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center">Carregando dados...</td></tr>';

    try {
        const projects = await fetchProjects();
        const tasks = await fetchTasks();

        reportData = [];

        for (const project of projects) {
            // Fetch items for this project
            const items = await fetchProjectItems(project.id);

            // Calculate Total Value
            const totalValue = items.reduce((sum, item) => {
                return sum + (parseFloat(item.value || 0) * parseFloat(item.quantity || 1));
            }, 0);

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

            reportData.push({
                projectName: project.name,
                lead: project.lead ? project.lead.name : 'N/A',
                status: project.status,
                totalValue: totalValue,
                timeSpent: timeSpentDays,
                longestStage: longestTask.title
            });
        }

        renderReportsTable(reportData);

    } catch (error) {
        console.error('Error loading reports:', error);
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
}

function renderReportsTable(data) {
    const tableBody = document.querySelector('tbody');
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Nenhum projeto encontrado.</td></tr>';
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

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium">${row.projectName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${row.lead}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                    ${statusLabel}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold">${formatCurrency(row.totalValue)}</td>
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
        "Valor Total": row.totalValue,
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
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Relatório de Projetos", 14, 22);
    doc.setFontSize(11);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

    const tableColumn = ["Projeto", "Responsável", "Status", "Valor Total", "Tempo (Dias)", "Etapa Longa"];
    const tableRows = [];

    reportData.forEach(row => {
        const reportRow = [
            row.projectName,
            row.lead,
            row.status === 'In Progress' ? 'Em Andamento' : row.status,
            formatCurrency(row.totalValue),
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
