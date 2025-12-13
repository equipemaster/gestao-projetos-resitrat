document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    setupSearchHandlers();
    setupFormSubmission();
    setupReturnModal();
});

let currentReturnExit = null;

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

        // Load History
        await loadExitHistory();
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

            // Reload History
            await loadExitHistory();

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

// Return Logic
function setupReturnModal() {
    const confirmBtn = document.getElementById('confirm-return-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmReturn);
}

window.openReturnModal = (exit) => {
    currentReturnExit = exit;
    const modal = document.getElementById('return-modal');
    const desc = document.getElementById('return-modal-desc');
    const input = document.getElementById('return-qty');
    const maxQtySpan = document.getElementById('return-max-qty');

    // Reset input
    input.value = '';

    // Set content
    desc.textContent = `Devolvendo: ${exit.stock_items ? exit.stock_items.name : 'Item excluído'} (Qtd Saída: ${exit.quantity})`;
    maxQtySpan.textContent = exit.quantity;

    // Configure input
    input.max = exit.quantity;
    input.min = 0.01;
    input.step = 'any';

    modal.classList.remove('hidden');
    input.focus();
}

window.closeReturnModal = () => {
    document.getElementById('return-modal').classList.add('hidden');
    currentReturnExit = null;
}

async function confirmReturn() {
    if (!currentReturnExit) return;

    const input = document.getElementById('return-qty');
    const qtyToReturn = parseFloat(input.value);

    if (!qtyToReturn || qtyToReturn <= 0) {
        alert('Por favor, insira uma quantidade válida.');
        return;
    }

    if (qtyToReturn > currentReturnExit.quantity) {
        alert(`A quantidade a devolver não pode ser maior que a saída original (${currentReturnExit.quantity}).`);
        return;
    }

    const btn = document.getElementById('confirm-return-btn');
    try {
        btn.disabled = true;
        btn.innerText = 'Processando...';

        // 1. Update Stock Quantity
        const itemId = currentReturnExit.stock_item_id || currentReturnExit.item_id;

        if (!itemId) {
            throw new Error('ID do item não encontrado no registro de saída.');
        }

        // Fetch current stock first to be safe
        const { data: stockItems, error: fetchError } = await _supabase
            .from('stock_items')
            .select('quantity')
            .eq('id', itemId);

        if (fetchError) throw fetchError;

        const currentStock = stockItems[0].quantity;
        const newStock = currentStock + qtyToReturn;

        await updateStockItem(itemId, { quantity: newStock });

        // 2. Update or Delete Exit Record
        const remainingQty = currentReturnExit.quantity - qtyToReturn;
        const safeRemaining = Math.round(remainingQty * 1000) / 1000;

        if (safeRemaining <= 0) {
            await deleteStockExit(currentReturnExit.id);
        } else {
            await updateStockExit(currentReturnExit.id, { quantity: safeRemaining });
        }

        alert('Devolução realizada com sucesso!');
        closeReturnModal();

        await loadExitHistory();
        allStockItems = await fetchStockItems();

    } catch (error) {
        console.error('Error executing return:', error);
        alert('Erro ao realizar devolução: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Confirmar Devolução';
    }
}

async function loadExitHistory() {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Carregando...</td></tr>';

    try {
        let exits = await fetchStockExits();

        // Filter out deleted items
        exits = exits.filter(exit => exit.stock_items);

        tbody.innerHTML = '';

        if (exits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Nenhuma saída recente.</td></tr>';
            return;
        }

        // Sort by date desc
        exits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        exits.forEach(exit => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";

            const formattedDate = formatDate(exit.created_at.split('T')[0]);
            const itemName = exit.stock_items ? exit.stock_items.name : '<span class="text-red-500">Item excluído</span>';

            let destination = '-';
            // Try to find project name if loaded, otherwise just show ID or Client
            if (exit.project_id) destination = 'Projeto';
            if (exit.clients) destination = exit.clients.name;

            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${formattedDate}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${itemName}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-bold">${exit.quantity} ${exit.stock_items ? exit.stock_items.unit : ''}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${destination}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${exit.reason}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"></td>
            `;

            const actionTd = tr.lastElementChild;
            if (exit.stock_items) {
                const btn = document.createElement('button');
                btn.className = "text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center justify-end gap-1 w-full";
                btn.innerHTML = '<span class="material-symbols-outlined text-lg">undo</span> Devolver';
                btn.onclick = () => openReturnModal(exit);
                actionTd.appendChild(btn);
            }

            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading history:', e);
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Erro ao carregar histórico.</td></tr>';
    }
}
