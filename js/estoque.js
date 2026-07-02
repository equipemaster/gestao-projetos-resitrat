document.addEventListener('DOMContentLoaded', async () => {
    console.log('Stock Inventory page loading...');
    loadStockItems();
    setupImportHandlers();

    // Search Handler
    document.getElementById('search-stock').addEventListener('input', (e) => {
        filterStock(e.target.value);
    });
});

let currentStock = [];

async function loadStockItems() {
    if (typeof fetchStockItems !== 'function') {
        console.error('fetchStockItems missing in api.js');
        return;
    }
    currentStock = await fetchStockItems();
    renderStockTable(currentStock);
}

function filterStock(query) {
    if (!query) return renderStockTable(currentStock);
    const lowerQuery = query.toLowerCase();
    const filtered = currentStock.filter(item =>
        item.name.toLowerCase().includes(lowerQuery) ||
        (item.category && item.category.toLowerCase().includes(lowerQuery))
    );
    renderStockTable(filtered);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function renderStockTable(items) {
    const tableBody = document.getElementById('stock-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Nenhum item encontrado.</td></tr>';
        return;
    }

    let totalStockValue = 0;

    items.forEach(item => {
        const val = parseFloat(item.value) || 0;
        const total = val * item.quantity;
        totalStockValue += total;

        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <input type="checkbox" class="stock-checkbox rounded border-gray-300 text-primary focus:ring-primary h-4 w-4" 
                    value="${item.id}" onclick="updateBulkActionState()">
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium">${escapeHtml(item.name)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm"><span class="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs">${escapeHtml(item.category || 'Outros')}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${item.quantity}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${escapeHtml(item.unit)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${formatCurrency(val)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold">${formatCurrency(total)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3" onclick="editStockItem('${item.id}')"><span class="material-symbols-outlined">edit</span></button>
                <button class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300" onclick="deleteItem('${item.id}')"><span class="material-symbols-outlined">delete</span></button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    const totalRow = document.createElement('tr');
    totalRow.className = "bg-gray-50 dark:bg-gray-800 font-bold";
    totalRow.innerHTML = `
        <td colspan="6" class="px-6 py-4 text-right text-gray-900 dark:text-white">TOTAL GERAL EM ESTOQUE:</td>
        <td class="px-6 py-4 text-gray-900 dark:text-white">${formatCurrency(totalStockValue)}</td>
        <td colspan="2"></td>
    `;
    tableBody.appendChild(totalRow);

    // Reset selection state on re-render
    document.getElementById('select-all').checked = false;
    updateBulkActionState();
}

// Bulk Actions Logic
let selectedStockIds = [];

window.toggleSelectAll = () => {
    const isChecked = document.getElementById('select-all').checked;
    const checkboxes = document.querySelectorAll('.stock-checkbox');
    checkboxes.forEach(cb => cb.checked = isChecked);
    updateBulkActionState();
}

window.updateBulkActionState = () => {
    const checkboxes = document.querySelectorAll('.stock-checkbox:checked');
    selectedStockIds = Array.from(checkboxes).map(cb => cb.value);

    const count = selectedStockIds.length;
    const toolbar = document.getElementById('bulk-actions');
    const countLabel = document.getElementById('selected-count');

    if (count > 0) {
        toolbar.classList.remove('hidden');
        countLabel.innerText = `${count} selecionado${count > 1 ? 's' : ''}`;
    } else {
        toolbar.classList.add('hidden');
    }
}

window.bulkDelete = async () => {
    if (selectedStockIds.length === 0) return;
    openDeleteModal(null, true);
}

// Bulk Edit Category Logic
window.bulkEditCategory = () => {
    if (selectedStockIds.length === 0) return;

    // Reset modal fields
    document.getElementById('bulk-category-select').value = 'Outros';
    document.getElementById('bulk-category-custom').value = '';
    document.getElementById('bulk-category-custom').classList.add('hidden');

    document.getElementById('bulk-edit-modal').classList.remove('hidden');
}

window.closeBulkEditModal = () => {
    document.getElementById('bulk-edit-modal').classList.add('hidden');
}

window.toggleBulkCustomCategory = () => {
    const select = document.getElementById('bulk-category-select');
    const customInput = document.getElementById('bulk-category-custom');

    if (select.value === 'custom') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
        customInput.value = '';
    }
}

window.saveBulkEdit = async () => {
    // Get Category
    const select = document.getElementById('bulk-category-select');
    const customInput = document.getElementById('bulk-category-custom');
    let category = select.value;

    if (category === 'custom') {
        category = customInput.value.trim();
        if (!category) return alert('Por favor, digite o nome da nova categoria.');
    }

    try {
        // Update all selected items
        for (const id of selectedStockIds) {
            await updateStockItem(id, { category: category });
        }

        closeBulkEditModal();
        selectedStockIds = [];
        document.getElementById('select-all').checked = false;
        updateBulkActionState();
        await loadStockItems();
        alert('Categorias atualizadas com sucesso!');
    } catch (e) {
        console.error('Bulk edit error:', e);
        alert('Erro ao atualizar categorias: ' + e.message);
    }
}

// Delete Modal Logic
let pendingDeleteId = null;
let isBulkDelete = false;

window.openDeleteModal = (id = null, bulk = false) => {
    pendingDeleteId = id;
    isBulkDelete = bulk;

    const title = document.getElementById('delete-modal-title');
    const msg = document.getElementById('delete-modal-message');

    if (bulk) {
        title.innerText = 'Excluir Itens Selecionados';
        msg.innerText = `Tem certeza que deseja excluir ${selectedStockIds.length} itens? Esta ação não pode ser desfeita.`;
    } else {
        title.innerText = 'Excluir Item';
        msg.innerText = 'Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.';
    }

    document.getElementById('delete-modal').classList.remove('hidden');
}

window.closeDeleteModal = () => {
    document.getElementById('delete-modal').classList.add('hidden');
    pendingDeleteId = null;
    isBulkDelete = false;
}

// Bind confirm button
document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    const btn = document.getElementById('confirm-delete-btn');
    const originalText = btn.innerText;
    btn.innerText = 'Excluindo...';
    btn.disabled = true;

    try {
        if (isBulkDelete) {
            for (const id of selectedStockIds) {
                await deleteStockItem(id);
            }
            selectedStockIds = [];
            document.getElementById('select-all').checked = false;
            updateBulkActionState();
            alert('Itens excluídos com sucesso!');
        } else if (pendingDeleteId) {
            await deleteStockItem(pendingDeleteId);
            // Alert removed here to make UI smoother, or keep if preferred. user asked for modal.
        }

        await loadStockItems();
        closeDeleteModal();

    } catch (e) {
        console.error('Delete error:', e);
        alert('Erro ao excluir: ' + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

// Updated Delete Entry Points
window.deleteItem = (id) => {
    openDeleteModal(id, false);
}

// Toggle Custom Category Input
window.toggleCustomCategory = () => {
    const select = document.getElementById('s-category-select');
    const customInput = document.getElementById('s-category-custom');

    if (select.value === 'custom') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
        customInput.value = '';
    }
}

// Modal functions
window.openStockModal = () => {
    document.getElementById('modal-title').innerText = 'Novo Item de Estoque';
    document.getElementById('s-id').value = '';
    document.getElementById('s-name').value = '';

    // Reset Category
    document.getElementById('s-category-select').value = 'Outros';
    document.getElementById('s-category-custom').value = '';
    document.getElementById('s-category-custom').classList.add('hidden');

    document.getElementById('s-qty').value = '1';
    document.getElementById('s-value').value = '0.00';
    document.getElementById('stock-modal').classList.remove('hidden');
}

window.closeStockModal = () => {
    document.getElementById('stock-modal').classList.add('hidden');
}

window.editStockItem = (id) => {
    console.log('Edit requested for ID:', id, 'Type:', typeof id);
    const item = currentStock.find(i => i.id == id); // Loose equality

    if (!item) {
        console.error('Item not found for ID:', id, 'Available stock:', currentStock);
        alert('Erro: Item não encontrado para edição.');
        return;
    }

    document.getElementById('modal-title').innerText = 'Editar Item';
    document.getElementById('s-id').value = item.id;
    document.getElementById('s-name').value = item.name;

    // Handle Category Logic
    const select = document.getElementById('s-category-select');
    const customInput = document.getElementById('s-category-custom');
    const options = Array.from(select.options).map(o => o.value);

    if (options.includes(item.category)) {
        select.value = item.category;
        customInput.classList.add('hidden');
    } else {
        select.value = 'custom';
        customInput.value = item.category || '';
        customInput.classList.remove('hidden');
    }

    document.getElementById('s-qty').value = item.quantity;
    document.getElementById('s-unit').value = item.unit;
    document.getElementById('s-value').value = item.value;

    document.getElementById('stock-modal').classList.remove('hidden');
}

window.saveStockItem = async () => {
    const id = document.getElementById('s-id').value;
    const name = document.getElementById('s-name').value;

    // Get Category
    const select = document.getElementById('s-category-select');
    const customInput = document.getElementById('s-category-custom');
    let category = select.value;

    if (category === 'custom') {
        category = customInput.value.trim();
        if (!category) return alert('Por favor, digite o nome da nova categoria.');
    }

    const qty = document.getElementById('s-qty').value;
    const unit = document.getElementById('s-unit').value;
    const value = document.getElementById('s-value').value;

    if (!name) return alert('Nome é obrigatório');

    try {
        if (id) {
            // Update
            await updateStockItem(id, {
                name: name,
                category: category,
                quantity: qty,
                unit: unit,
                value: value
            });
        } else {
            // Create
            await createStockItem({
                name: name,
                category: category,
                quantity: qty,
                unit: unit,
                value: value
            });
        }
        closeStockModal();
        await loadStockItems();
    } catch (e) {
        alert('Erro ao salvar: ' + e.message);
    }
}

window.deleteItem = async (id) => {
    console.log('Delete requested for ID:', id);
    if (confirm('Tem certeza que deseja excluir este item do estoque?')) {
        try {
            await deleteStockItem(id);
            await loadStockItems();
        } catch (e) {
            console.error('Error deleting:', e);
            alert('Erro ao excluir item: ' + e.message);
        }
    }
}

// Import Logic
function setupImportHandlers() {
    // Check if input already exists
    if (!document.getElementById('import-file')) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'import-file';
        fileInput.accept = '.xlsx, .xls, .pdf';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        fileInput.addEventListener('change', handleFileSelect);
    }

    window.triggerImport = () => {
        document.getElementById('import-file').click();
    }
}

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith('.pdf')) {
        await parsePDF(file);
    } else {
        await parseXLS(file);
    }
    e.target.value = '';
}

async function parseXLS(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        let addedCount = 0;
        for (let row of jsonData) {
            if (row.length >= 1) {
                const name = row[0];
                // Skip header or empty rows
                if (!name || name.toString().toLowerCase().includes('nome')) continue;

                const qty = parseInt(row[1]) || 1;
                const unit = row[2] || 'un';
                const val = parseFloat(row[3]) || 0; // Assume 4th column is value

                await createStockItem({
                    name: name,
                    quantity: qty,
                    unit: unit,
                    value: val
                });
                addedCount++;
            }
        }
        alert(`${addedCount} itens importados do Excel para o Estoque com sucesso!`);
        await loadStockItems();
    };
    reader.readAsArrayBuffer(file);
}

async function parsePDF(file) {
    const reader = new FileReader();
    reader.onload = async (event) => {
        const typedarray = new Uint8Array(event.target.result);
        try {
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let extractedText = '';

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                extractedText += pageText + '\n';
            }

            const lines = extractedText.split(/\r?\n/);
            let addedCount = 0;

            for (let line of lines) {
                line = line.trim();
                // Simple heuristic: Line must be long enough and not just numbers
                if (line.length > 5 && !line.match(/^\d+$/)) {
                    // Try to extract quantity if present at start "2x Item Name"
                    let qty = 1;
                    let name = line;

                    // Very basic regex to check for "10 x Something" or "10 Something"
                    const qtyMatch = line.match(/^(\d+)\s*[xX]?\s+(.*)/);
                    if (qtyMatch) {
                        qty = parseInt(qtyMatch[1]);
                        name = qtyMatch[2];
                    }

                    await createStockItem({
                        name: name,
                        quantity: qty,
                        unit: 'un',
                        value: 0 // Cannot reliably parse value from unstructured text
                    });
                    addedCount++;
                }
            }

            alert(`${addedCount} itens extraídos do PDF e adicionados ao Estoque.`);
            await loadStockItems();

        } catch (err) {
            console.error(err);
            alert('Erro ao ler PDF: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}
