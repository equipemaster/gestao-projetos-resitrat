document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    setupSearchHandlers();
    setupFormSubmission();
});

let allStockItems = [];

async function loadInitialData() {
    try {
        // Load Projects for dropdown
        const projects = await fetchProjects();
        const projectSelect = document.getElementById('project-select');
        projects
            .filter(p => p.status !== 'Completed' && p.status !== 'Done') // Only active projects
            .forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.text = p.name;
                projectSelect.appendChild(option);
            });

        // Load Clients for dropdown
        const clients = await fetchClients();
        const clientSelect = document.getElementById('client-select');
        clients.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            // Show Name and Company/CNPJ if available for better context
            let label = c.name;
            if (c.company) label += ` (${c.company})`;
            else if (c.cnpj) label += ` (CNPJ: ${c.cnpj})`;

            option.textContent = label;
            clientSelect.appendChild(option);
        });

        // Load Stock Items for search
        allStockItems = await fetchStockItems();
    } catch (e) {
        console.error('Error loading initial data:', e);
        alert('Erro ao carregar dados iniciais.');
    }
}

function setupSearchHandlers() {
    const searchInput = document.getElementById('item-search');
    const resultsDiv = document.getElementById('item-results');
    const selectedIdInput = document.getElementById('selected-item-id');
    const stockDisplay = document.getElementById('current-stock-display');

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length < 2) {
            resultsDiv.classList.add('hidden');
            return;
        }

        const filtered = allStockItems.filter(item =>
            item.name.toLowerCase().includes(query) ||
            (item.category && item.category.toLowerCase().includes(query))
        );

        renderSearchResults(filtered);
    });

    function renderSearchResults(items) {
        resultsDiv.innerHTML = '';
        if (items.length === 0) {
            resultsDiv.classList.add('hidden');
            return;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = "px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-sm text-gray-700 dark:text-gray-200";
            div.textContent = `${item.name} (Qtd: ${item.quantity} ${item.unit})`;
            div.onclick = () => selectItem(item);
            resultsDiv.appendChild(div);
        });

        resultsDiv.classList.remove('hidden');
    }

    function selectItem(item) {
        searchInput.value = item.name;
        selectedIdInput.value = item.id;
        stockDisplay.textContent = `Em estoque: ${item.quantity} ${item.unit}`;
        resultsDiv.classList.add('hidden');
    }

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.classList.add('hidden');
        }
    });
}

function setupFormSubmission() {
    const form = document.getElementById('exit-form');
    console.log('Setup Form Submission');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('submit-btn');
        const itemId = document.getElementById('selected-item-id').value;
        const qty = parseFloat(document.getElementById('exit-qty').value);
        const projectId = document.getElementById('project-select').value;
        const clientId = document.getElementById('client-select').value;
        const reason = document.getElementById('exit-reason').value;
        const obs = document.getElementById('exit-obs').value;

        if (!itemId) {
            alert('Por favor, selecione um item do estoque.');
            return;
        }

        if (!qty || qty <= 0) {
            alert('Por favor, insira uma quantidade válida.');
            return;
        }

        if (!clientId) {
            alert('Por favor, selecione um cliente.');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processando...';

            // Call API
            const result = await processStockExit(itemId, qty, reason, projectId, obs, clientId);

            alert('Saída registrada com sucesso!');
            console.log('Result:', result);

            // Reset form
            form.reset();
            document.getElementById('selected-item-id').value = '';
            document.getElementById('current-stock-display').textContent = '';

            // Reload stock items to get fresh quantities
            allStockItems = await fetchStockItems();

        } catch (error) {
            console.error(error);
            alert('Erro ao registrar saída: ' + (error.message || error.error_description || 'Erro desconhecido'));
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirmar Saída';
        }
    });
}

window.exportExitHistory = async () => {
    try {
        const btn = document.querySelector('button[onclick="exportExitHistory()"]');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Exportando...';
            btn.disabled = true;
        }

        const exits = await fetchStockExits();

        if (!exits || exits.length === 0) {
            alert('Não há histórico de saídas para exportar.');
            return;
        }

        // Format data for Excel
        const dataToExport = exits.map(item => ({
            'Data': formatDate(item.created_at.split('T')[0]),
            'Item': item.stock_items ? item.stock_items.name : 'Item excluído',
            'Quantidade': item.quantity,
            'Unidade': item.stock_items ? item.stock_items.unit : '-',
            'Motivo': item.reason,
            'Projeto': item.project_id ? 'Sim' : 'Não', // Ideally fetch project name if needed
            'Cliente': item.clients ? item.clients.name : '-',
            'Observação': item.observation || ''
        }));

        // Create Worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Saídas de Estoque");

        // Download
        XLSX.writeFile(wb, "Histórico_Saida_Estoque.xlsx");

    } catch (error) {
        console.error('Export error:', error);
        alert('Erro ao exportar: ' + error.message);
    } finally {
        const btn = document.querySelector('button[onclick="exportExitHistory()"]');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined text-xl">download</span><span class="text-sm font-medium">Exportar Histórico</span>';
            btn.disabled = false;
        }
    }
}
