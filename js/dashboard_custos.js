

let allExits = []; // Store raw exits data
let currentChart = null; // Store chart instance to update it

document.addEventListener('DOMContentLoaded', () => {
    // checkSession handles auth redirection automatically via auth.js
    loadDashboardData();

    // Setup filters
    document.getElementById('client-search').addEventListener('input', applyFilters);
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
        allExits = await fetchStockExits();
        applyFilters(); // Initial render
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        alert('Erro ao carregar dados do dashboard.');
    }
}

function applyFilters() {
    const nameQuery = document.getElementById('client-search').value.toLowerCase();
    const monthFilter = document.getElementById('filter-month').value; // 0-11 or empty
    const yearFilter = document.getElementById('filter-year').value; // YYYY or empty

    // Filter Exits
    const filteredExits = allExits.filter(exit => {
        const date = new Date(exit.created_at);
        const exitMonth = date.getMonth().toString();
        const exitYear = date.getFullYear().toString();
        const clientName = exit.clients ? exit.clients.name.toLowerCase() : 'sem cliente';

        // Check Name
        const matchesName = clientName.includes(nameQuery);

        // Check Month
        const matchesMonth = monthFilter === "" || exitMonth === monthFilter;

        // Check Year
        const matchesYear = yearFilter === "" || exitYear === yearFilter;

        return matchesName && matchesMonth && matchesYear;
    });

    processAndRender(filteredExits);
}

function processAndRender(exits) {
    const clientCosts = {};
    let grandTotal = 0;

    exits.forEach(exit => {
        const clientName = exit.clients ? exit.clients.name : 'Sem Cliente';
        const quantity = parseFloat(exit.quantity) || 0;

        // Use historical unit price if available (preferred), otherwise fallback to current catalogue value
        let unitPrice = 0;
        if (exit.unit_price !== undefined && exit.unit_price !== null) {
            unitPrice = parseFloat(exit.unit_price);
        } else {
            unitPrice = parseFloat(exit.stock_items ? exit.stock_items.value : 0) || 0;
        }

        const cost = quantity * unitPrice;

        if (!clientCosts[clientName]) {
            clientCosts[clientName] = {
                count: 0,
                totalCost: 0
            };
        }
        clientCosts[clientName].count += quantity;
        clientCosts[clientName].totalCost += cost;
        grandTotal += cost;
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
        tbody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500">Nenhum registro encontrado.</td></tr>';
        return;
    }

    sortedClients.forEach(client => {
        // if (data[client].totalCost === 0 && client === 'Sem Cliente') return; 

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${client}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${data[client].count.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">${formatCurrency(data[client].totalCost)}</td>
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

