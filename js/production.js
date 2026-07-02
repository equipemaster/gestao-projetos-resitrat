document.addEventListener('DOMContentLoaded', async () => {
    // Check auth
    if (typeof checkSession === 'function') {
        await checkSession();
    }

    // Load initial data
    await loadProjects();
    await loadProductionOrders();
});

let projectsMap = {}; // Map project_id to project_name
let productionOrders = [];
let currentLogOrderId = null;

// Drag and Drop Logic
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    ev.dataTransfer.setData("text/plain", ev.target.id);
    ev.target.classList.add('opacity-50');
}

function dragEnd(ev) {
    ev.target.classList.remove('opacity-50');
}

async function drop(ev, newStatus) {
    ev.preventDefault();
    const data = ev.dataTransfer.getData("text/plain");
    const draggedElement = document.getElementById(data);

    if (!draggedElement) return;

    // Remove opacity
    draggedElement.classList.remove('opacity-50');

    // Find the closest drop zone (column)
    const dropZone = ev.target.closest('.kanban-col');

    if (dropZone) {
        // Optimistic UI update
        dropZone.appendChild(draggedElement);

        // Update local state
        const orderId = data.replace('order-', '');

        // Update database
        try {
            const { error } = await _supabase
                .from('production_orders')
                .update({ status: newStatus })
                .eq('id', orderId);

            if (error) throw error;

            // Re-fetch to confirm and update counts
            await loadProductionOrders();

        } catch (error) {
            console.error('Error updating status:', error);
            alert('Falha ao atualizar status. Revertendo...');
            await loadProductionOrders(); // Revert logic essentially
        }
    }
}


// Load Projects for Dropdown and Mapping
async function loadProjects() {
    try {
        const { data, error } = await _supabase
            .from('projects')
            .select('id, name');

        if (error) throw error;

        const select = document.getElementById('projectSelect');
        select.innerHTML = '<option value="">Selecione um projeto...</option>';

        data.forEach(project => {
            projectsMap[project.id] = project.name;

            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

// Load Production Orders
async function loadProductionOrders() {
    try {
        const { data, error } = await _supabase
            .from('production_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        productionOrders = data;
        applyFiltersAndRender(); // Changed to use filter logic

    } catch (error) {
        console.error('Error loading production orders:', error);
    }
}

// Filter and Sort Logic
let filteredOrders = [];

window.filterOrders = () => {
    applyFiltersAndRender();
}

window.sortOrders = () => {
    applyFiltersAndRender();
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    applyFiltersAndRender();
});

function applyFiltersAndRender() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const priorityFilter = document.getElementById('filterPriority').value;
    const sortBy = document.getElementById('sortBy').value;

    filteredOrders = productionOrders.filter(order => {
        const matchesSearch = (order.title && order.title.toLowerCase().includes(searchTerm)) ||
            (order.description && order.description.toLowerCase().includes(searchTerm)) ||
            (projectsMap[order.project_id] && projectsMap[order.project_id].toLowerCase().includes(searchTerm));

        const matchesPriority = priorityFilter === 'All' || order.priority === priorityFilter;

        return matchesSearch && matchesPriority;
    });

    // Sort
    filteredOrders.sort((a, b) => {
        switch (sortBy) {
            case 'created_desc':
                return new Date(b.created_at) - new Date(a.created_at);
            case 'created_asc':
                return new Date(a.created_at) - new Date(b.created_at);
            case 'due_date':
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date) - new Date(b.due_date);
            case 'priority':
                const pMap = { 'Urgent': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
                return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
            default:
                return 0;
        }
    });

    renderKanbanBoard(filteredOrders);
}

function renderKanbanBoard(ordersToRender = productionOrders) {
    // Clear all columns
    const columns = [
        'Planning', 'Cutting', 'Welding', 'Assembly',
        'Finishing', 'Quality Control', 'Completed'
    ];

    // Reset Counts
    columns.forEach(col => {
        const colId = col.toLowerCase().replace(' ', '_');
        document.getElementById(`col-${colId}`).innerHTML = '';
        document.getElementById(`count-${colId}`).textContent = '0';
    });

    const counts = {};

    ordersToRender.forEach(order => {
        const colId = order.status.toLowerCase().replace(' ', '_');
        const container = document.getElementById(`col-${colId}`);

        if (container) {
            const card = createCardElement(order);
            container.appendChild(card);

            // Increment specific column count
            counts[colId] = (counts[colId] || 0) + 1;
        }
    });

    // Update UI counts (Note: this only counts visible items now, which is correct for filters)
    columns.forEach(col => {
        const colId = col.toLowerCase().replace(' ', '_');
        document.getElementById(`count-${colId}`).textContent = counts[colId] || 0;
    });
}

function createCardElement(order) {
    const card = document.createElement('div');
    card.id = `order-${order.id}`;
    card.draggable = true;
    card.ondragstart = drag;
    card.ondragend = dragEnd;
    card.className = "bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 cursor-move hover:shadow-md transition-shadow group";

    const projectName = projectsMap[order.project_id] || 'Projeto Desconhecido';

    // Priority Badge colors
    let priorityColor = 'bg-gray-100 text-gray-600';
    if (order.priority === 'High') priorityColor = 'bg-orange-100 text-orange-700';
    if (order.priority === 'Urgent') priorityColor = 'bg-red-100 text-red-700';

    // Translate Priority
    const priorityMap = { 'Low': 'Baixa', 'Medium': 'Média', 'High': 'Alta', 'Urgent': 'Urgente' };

    card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="text-xs font-semibold px-2 py-0.5 rounded ${priorityColor}">${escapeHtml(priorityMap[order.priority] || order.priority)}</span>
            <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button onclick="editOrder('${order.id}')" class="text-gray-400 hover:text-blue-500"><span class="material-symbols-outlined text-sm">edit</span></button>
                <button onclick="deleteOrder('${order.id}')" class="text-gray-400 hover:text-red-500"><span class="material-symbols-outlined text-sm">delete</span></button>
            </div>
        </div>
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">${escapeHtml(order.title)}</h4>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2 max-h-12 overflow-hidden">${escapeHtml(order.description || '')}</p>
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <span class="text-xs text-blue-600 dark:text-blue-400 font-medium truncate max-w-[120px]" title="${escapeHtml(projectName)}">${escapeHtml(projectName)}</span>
            ${order.due_date ? `<span class="text-xs text-gray-400 flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">calendar_today</span> ${formatDateShort(order.due_date)}</span>` : ''}
        </div>
    `;

    return card;
}

function formatDateShort(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}


// --- Modal Functions ---

let isEditing = false;

function openProductionModal() {
    isEditing = false;
    currentLogOrderId = null;
    document.getElementById('productionForm').reset();
    document.getElementById('orderId').value = '';
    document.getElementById('modalTitle').textContent = 'Nova Ordem de Produção';

    // Show Details tab by default
    switchTab('details');
    // Hide Logs tab button if new order (need ID to log)
    document.getElementById('tab-logs').classList.add('hidden');

    document.getElementById('productionModal').classList.remove('hidden');
}

function closeProductionModal() {
    document.getElementById('productionModal').classList.add('hidden');
}

window.editOrder = async (id) => {
    isEditing = true;
    currentLogOrderId = id;
    const order = productionOrders.find(o => o.id === id);
    if (!order) return;

    document.getElementById('orderId').value = order.id;
    document.getElementById('orderTitle').value = order.title;
    document.getElementById('projectSelect').value = order.project_id || '';
    document.getElementById('prioritySelect').value = order.priority;
    document.getElementById('orderDueDate').value = order.due_date || '';
    document.getElementById('orderDescription').value = order.description || '';

    // Enable Logs tab
    document.getElementById('tab-logs').classList.remove('hidden');
    // Reset Log Form
    resetLogForm();
    // Load Logs
    await loadLogs(id);

    document.getElementById('modalTitle').textContent = 'Editar Ordem';
    switchTab('details'); // Default to details modal
    document.getElementById('productionModal').classList.remove('hidden');
};

document.getElementById('productionForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('orderId').value;
    const title = document.getElementById('orderTitle').value;
    const project_id = document.getElementById('projectSelect').value || null;
    const priority = document.getElementById('prioritySelect').value;
    const due_date = document.getElementById('orderDueDate').value || null;
    const description = document.getElementById('orderDescription').value;

    const payload = {
        title,
        project_id,
        priority,
        due_date,
        description
    };

    try {
        if (isEditing && id) {
            const { error } = await _supabase
                .from('production_orders')
                .update(payload)
                .eq('id', id);
            if (error) throw error;
        } else {
            payload.status = 'Planning';
            const { error } = await _supabase
                .from('production_orders')
                .insert([payload]);
            if (error) throw error;
        }

        closeProductionModal();
        await loadProductionOrders();

    } catch (error) {
        console.error('Error saving order:', error);
        alert('Erro ao salvar ordem de produção.');
    }
});

window.deleteOrder = async (id) => {
    if (confirm('Tem certeza que deseja excluir esta ordem?')) {
        try {
            const { error } = await _supabase
                .from('production_orders')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await loadProductionOrders();
        } catch (error) {
            console.error('Error deleting:', error);
            alert('Erro ao excluir.');
        }
    }
}

// --- Tabs & Logging Logic ---

window.switchTab = (tab) => {
    const detailsTab = document.getElementById('tab-details');
    const logsTab = document.getElementById('tab-logs');
    const contentDetails = document.getElementById('content-details');
    const contentLogs = document.getElementById('content-logs');

    if (tab === 'details') {
        detailsTab.classList.add('border-primary', 'text-primary');
        detailsTab.classList.remove('border-transparent');
        logsTab.classList.remove('border-primary', 'text-primary');
        logsTab.classList.add('border-transparent');
        contentDetails.classList.remove('hidden');
        contentLogs.classList.add('hidden');
    } else {
        logsTab.classList.add('border-primary', 'text-primary');
        logsTab.classList.remove('border-transparent');
        detailsTab.classList.remove('border-primary', 'text-primary');
        detailsTab.classList.add('border-transparent');
        contentLogs.classList.remove('hidden');
        contentDetails.classList.add('hidden');
    }
}

window.toggleLogFields = () => {
    const type = document.getElementById('logType').value;
    const unitSelect = document.getElementById('logUnit');
    const descInput = document.getElementById('logDescription');

    // Clear existing options
    unitSelect.innerHTML = '';

    if (type === 'TIME') {
        // Add Time specific options
        const opt = document.createElement('option');
        opt.value = 'h';
        opt.text = 'h';
        unitSelect.appendChild(opt);

        descInput.placeholder = 'Ex: Solda, Pintura...';
    } else {
        // Add Material specific options
        ['kg', 'un', 'mt'].forEach(u => {
            const opt = document.createElement('option');
            opt.value = u;
            opt.text = u;
            unitSelect.appendChild(opt);
        });
        descInput.placeholder = 'Ex: Tubo de Aço, Eletrodo...';
    }
}

function resetLogForm() {
    document.getElementById('logType').value = 'TIME';
    toggleLogFields(); // Reset units based on TIME default
    document.getElementById('logDescription').value = '';
    document.getElementById('logQty').value = '';
    document.getElementById('logCost').value = '';
    document.getElementById('logIsWaste').checked = false;
}

window.addLogEntry = async () => {
    if (!currentLogOrderId) {
        alert('Salve a ordem antes de adicionar apontamentos.');
        return;
    }

    const type = document.getElementById('logType').value;
    const description = document.getElementById('logDescription').value;
    const quantity = parseFloat(document.getElementById('logQty').value) || 0;
    const unit = document.getElementById('logUnit').value;
    const unit_cost = parseFloat(document.getElementById('logCost').value) || 0;
    const is_waste = document.getElementById('logIsWaste').checked;

    if (!description || quantity <= 0) {
        alert('Preencha a descrição e uma quantidade válida.');
        return;
    }

    const total_cost = quantity * unit_cost;

    try {
        const { error } = await _supabase
            .from('production_logs')
            .insert([{
                order_id: currentLogOrderId,
                type,
                description,
                quantity,
                unit,
                unit_cost,
                total_cost,
                is_waste
            }]);

        if (error) throw error;

        resetLogForm();
        await loadLogs(currentLogOrderId);

    } catch (error) {
        console.error('Error adding log:', error);
        alert('Erro ao adicionar apontamento.');
    }
}

async function loadLogs(orderId) {
    const tbody = document.getElementById('logsTableBody');
    const totalDisplay = document.getElementById('totalCostDisplay');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Carregando...</td></tr>';

    try {
        const { data, error } = await _supabase
            .from('production_logs')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        tbody.innerHTML = '';
        let total = 0;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-500 text-sm">Nenhum apontamento registrado.</td></tr>';
        } else {
            data.forEach(log => {
                total += parseFloat(log.total_cost || 0);
                const tr = document.createElement('tr');
                const isWasteClass = log.is_waste ? 'text-red-500 font-medium' : '';
                const wasteLabel = log.is_waste ? '<span class="text-xs bg-red-100 text-red-600 px-1 rounded ml-1">Perda</span>' : '';

                tr.innerHTML = `
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${log.type === 'TIME' ? 'Mão de Obra' : 'Material'}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white ${isWasteClass}">${escapeHtml(log.description)} ${wasteLabel}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-right text-sm text-gray-700 dark:text-gray-300">${log.quantity} ${escapeHtml(log.unit || '')}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">R$ ${parseFloat(log.total_cost).toFixed(2)}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-right text-sm">
                        <button onclick="deleteLog('${log.id}')" class="text-red-500 hover:text-red-700"><span class="material-symbols-outlined text-sm">delete</span></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        totalDisplay.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);

    } catch (error) {
        console.error('Error loading logs:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-red-500">Erro ao carregar.</td></tr>';
    }
}

window.deleteLog = async (logId) => {
    if (!confirm('Excluir este apontamento?')) return;

    try {
        const { error } = await _supabase
            .from('production_logs')
            .delete()
            .eq('id', logId);

        if (error) throw error;
        await loadLogs(currentLogOrderId);

    } catch (error) {
        console.error('Error deleting log:', error);
        alert('Erro ao excluir apontamento.');
    }
}
