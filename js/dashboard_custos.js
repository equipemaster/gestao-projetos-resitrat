

let allExits = []; // Store raw exits data
let clientMap = {}; // Map id -> client data
let currentChart = null; // Store chart instance to update it

document.addEventListener('DOMContentLoaded', () => {
    // checkSession handles auth redirection automatically via auth.js
    loadDashboardData();

    // Setup filters
    document.getElementById('client-search').addEventListener('change', applyFilters); // Changed to 'change' for select
    document.getElementById('filter-month').addEventListener('change', applyFilters);
    document.getElementById('filter-year').addEventListener('change', applyFilters);

    document.getElementById('clear-filters').addEventListener('click', () => {
        document.getElementById('client-search').value = '';
        document.getElementById('filter-month').value = '';
        document.getElementById('filter-year').value = '';
        applyFilters();
    });
});

async function loadDashboardData() {
    try {
        const [exits, clients] = await Promise.all([
            fetchStockExits(),
            fetchClients() // Reuse existing API function
        ]);
        allExits = exits;

        // Debug Alert
        console.log(`Dados carregados: ${exits.length} saídas, ${clients.length} clientes.`);
        if (exits.length === 0) alert('Atenção: Nenhuma saída de estoque encontrada no banco de dados.');
        if (clients.length === 0) alert('Atenção: Nenhum cliente encontrado no banco de dados.');

        // Build client map
        clientMap = {};
        clients.forEach(c => clientMap[c.id] = c);

        populateClientFilter(clients);
        applyFilters(); // Initial render
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        alert('Erro ao carregar dados do dashboard.');
    }
}

function applyFilters() {
    // const nameQuery = document.getElementById('client-search').value.toLowerCase(); // REMOVED
    const monthFilter = document.getElementById('filter-month').value; // 0-11 or empty
    const yearFilter = document.getElementById('filter-year').value; // YYYY or empty

    // Filter Exits
    const filteredExits = allExits.filter(exit => {
        const date = new Date(exit.created_at);
        const exitMonth = date.getMonth().toString();
        const exitYear = date.getFullYear().toString();
        const clientName = exit.clients ? exit.clients.name.toLowerCase() : 'sem cliente';

        // Check Name
        // Check Client (ID match)
        const selectedClientId = document.getElementById('client-search').value;
        const matchesClient = selectedClientId === "" || (exit.client_id && exit.client_id.toString() === selectedClientId);

        // Check Month
        const matchesMonth = monthFilter === "" || exitMonth === monthFilter;

        // Check Year
        const matchesYear = yearFilter === "" || exitYear === yearFilter;

        return matchesClient && matchesMonth && matchesYear;
    });

    processAndRender(filteredExits);
}

function processAndRender(exits) {
    const clientCosts = {};
    let grandTotal = 0;

    exits.forEach(exit => {
        const clientName = exit.clients ? exit.clients.name : 'Sem Cliente';
        const quantity = parseFloat(exit.quantity) || 0;
        const exitDate = new Date(exit.created_at);

        // Use historical unit price if available (preferred), otherwise fallback to current catalogue value
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
                count: 0,
                totalCost: 0,
                baseMeta: meta,
                minDate: exitDate,
                maxDate: exitDate
            };
        }

        // Update data
        clientCosts[clientName].count += quantity;
        clientCosts[clientName].totalCost += cost;
        grandTotal += cost;

        // Update date range
        if (exitDate < clientCosts[clientName].minDate) clientCosts[clientName].minDate = exitDate;
        if (exitDate > clientCosts[clientName].maxDate) clientCosts[clientName].maxDate = exitDate;
    });

    // Calculate proportional meta
    Object.keys(clientCosts).forEach(client => {
        const data = clientCosts[client];
        if (data.baseMeta > 0) {
            // Calculate number of months involved in the range
            const monthsDiff = (data.maxDate.getFullYear() - data.minDate.getFullYear()) * 12 + (data.maxDate.getMonth() - data.minDate.getMonth()) + 1;
            data.meta = data.baseMeta * monthsDiff;
        } else {
            data.meta = 0;
        }
    });

    renderTable(clientCosts);
    renderChart(clientCosts);
    document.getElementById('total-cost-display').textContent = formatCurrency(grandTotal);
}

function renderTable(data) {
    const tbody = document.getElementById('cost-table-body');
    tbody.innerHTML = '';

    // Sort by cost desc
    const sortedClients = Object.keys(data).sort((a, b) => data[b].totalCost - data[a].totalCost);

    if (sortedClients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Nenhum registro encontrado.</td></tr>';
        return;
    }

    sortedClients.forEach(client => {
        const clientData = data[client];
        const clientMeta = parseFloat(clientData.meta) || 0;
        const totalCost = clientData.totalCost;
        const isOverBudget = clientMeta > 0 && totalCost > clientMeta;

        let metaDisplay = '-';
        if (clientMeta > 0) {
            metaDisplay = formatCurrency(clientMeta);
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';

        let costClass = "font-bold text-gray-900 dark:text-white";
        let statusIcon = "";

        if (isOverBudget) {
            costClass = "font-bold text-red-600 dark:text-red-400";
            statusIcon = `<span class="material-symbols-outlined text-red-600 dark:text-red-400 text-sm align-middle ml-1" title="Acima da Meta">warning</span>`;
        }

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${client}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 hidden">${data[client].count.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${metaDisplay}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${costClass}">
                ${formatCurrency(totalCost)}
                ${statusIcon}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderChart(data) {
    const ctx = document.getElementById('costChart').getContext('2d');
    const sortedClients = Object.keys(data).sort((a, b) => data[b].totalCost - data[a].totalCost);

    const labels = sortedClients;
    const values = sortedClients.map(c => data[c].totalCost);

    if (currentChart) {
        currentChart.destroy();
    }

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Custo Total (R$)',
                data: values,
                backgroundColor: 'rgba(19, 91, 236, 0.7)',
                borderColor: 'rgba(19, 91, 236, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return 'R$ ' + value;
                        }
                    }
                }
            }
        }
    });
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}


function populateClientFilter(clients) {
    const select = document.getElementById('client-search');
    // Keep the first "All" option
    select.innerHTML = '<option value="">Todos os Clientes</option>';

    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        select.appendChild(option);
    });
}
