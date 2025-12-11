
let allClientCosts = {}; // Store data globally

document.addEventListener('DOMContentLoaded', () => {
    // checkSession handles auth redirection automatically via auth.js
    loadDashboardData();

    // Setup filter
    document.getElementById('client-search').addEventListener('input', (e) => {
        filterTable(e.target.value);
    });
});

async function loadDashboardData() {
    try {
        const exits = await fetchStockExits();

        // Process data
        allClientCosts = {};
        const clientCosts = allClientCosts; // Reference for existing code
        let grandTotal = 0;

        exits.forEach(exit => {
            const clientName = exit.clients ? exit.clients.name : 'Sem Cliente';
            const quantity = parseFloat(exit.quantity) || 0;
            const unitPrice = parseFloat(exit.stock_items ? exit.stock_items.value : 0) || 0;
            const cost = quantity * unitPrice;

            if (!clientCosts[clientName]) {
                clientCosts[clientName] = {
                    count: 0,
                    totalCost: 0
                };
            }
            clientCosts[clientName].count += quantity; // Summing quantity might be odd if units differ, but user asked for cost.
            clientCosts[clientName].totalCost += cost;
            grandTotal += cost;
        });

        renderTable(clientCosts);
        renderChart(clientCosts);
        document.getElementById('total-cost-display').textContent = formatCurrency(grandTotal);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        alert('Erro ao carregar dados do dashboard.');
    }
}

function renderTable(data) {
    const tbody = document.getElementById('cost-table-body');
    tbody.innerHTML = '';

    // Sort by cost desc
    const sortedClients = Object.keys(data).sort((a, b) => data[b].totalCost - data[a].totalCost);

    sortedClients.forEach(client => {
        if (data[client].totalCost === 0 && client === 'Sem Cliente') return; // Optional: hide if no cost

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

    // Filter out 'Sem Cliente' if desirable, or keep it.

    const labels = sortedClients;
    const values = sortedClients.map(c => data[c].totalCost);

    new Chart(ctx, {
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

function filterTable(query) {
    const lowerQuery = query.toLowerCase();
    const filteredData = {};

    Object.keys(allClientCosts).forEach(client => {
        if (client.toLowerCase().includes(lowerQuery)) {
            filteredData[client] = allClientCosts[client];
        }
    });

    renderTable(filteredData);
    // Optional: Filter chart as well if desired, but user asked for table filter
    // renderChart(filteredData); 
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}
