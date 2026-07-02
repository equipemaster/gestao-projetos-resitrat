document.addEventListener('DOMContentLoaded', async () => {
    console.log('Project Forecast Items page loading...');
    await loadProjectSelect();

    // Setup handlers
    setupImportHandlers(); // Can modify later if import needs to check structure differently
    setupFilters();

    // Initial load
    const select = document.getElementById('project-select');

    // Check URL for project ID
    const urlParams = new URLSearchParams(window.location.search);
    const textParam = urlParams.get('project');

    if (textParam && select.querySelector(`option[value="${textParam}"]`)) {
        select.value = textParam;
        await loadItems(textParam);
    } else if (select.value) {
        loadItems(select.value);
    }

    select.addEventListener('change', (e) => {
        loadItems(e.target.value);
    });
});

let currentItems = [];

async function loadProjectSelect() {
    const projects = await fetchProjects();
    const select = document.getElementById('project-select');
    select.innerHTML = '<option value="">Selecione um Projeto</option>';

    projects.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        select.appendChild(option);
    });

    // Auto select first if exists and no URL param
    if (projects.length > 0 && !select.value) {
        select.value = projects[0].id;
        await loadItems(projects[0].id);
    }
}

async function loadItems(projectId) {
    if (!projectId) {
        renderItemsTable([]);
        return;
    }

    if (typeof fetchProjectForecastItems !== 'function') {
        console.error('fetchProjectForecastItems missing in api.js');
        return;
    }
    currentItems = await fetchProjectForecastItems(projectId);
    renderItemsTable(currentItems);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function renderItemsTable(items) {
    const tableBody = document.querySelector('tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Nenhum item de previsão encontrado.</td></tr>';
        return;
    }

    let totalProjectValue = 0;
    let totalRemainingValue = 0;

    items.forEach(item => {
        const val = parseFloat(item.value) || 0;
        const total = val * item.quantity;
        totalProjectValue += total;

        if (!item.is_paid) {
            totalRemainingValue += total;
        }

        const isPaidChecked = item.is_paid ? 'checked' : '';
        const rowClass = item.is_paid ? 'opacity-50 bg-gray-50 dark:bg-gray-800/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50';
        const textDecoration = item.is_paid ? 'line-through' : '';

        const row = document.createElement('tr');
        row.className = rowClass;
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium ${textDecoration}">${escapeHtml(item.name)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm ${textDecoration}"><span class="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">${escapeHtml(item.category || 'Outros')}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm ${textDecoration}">${item.quantity}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm ${textDecoration}">${escapeHtml(item.unit)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm ${textDecoration}">${formatCurrency(val)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold ${textDecoration}">${formatCurrency(total)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <input type="checkbox" class="w-5 h-5 text-primary rounded border-gray-300 focus:ring-primary dark:bg-gray-700 dark:border-gray-600" 
                    ${isPaidChecked} onchange="togglePaidStatus('${item.id}', this.checked)">
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3" onclick="editItem('${item.id}')"><span class="material-symbols-outlined">edit</span></button>
                <button class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300" onclick="deleteItem('${item.id}')"><span class="material-symbols-outlined">delete</span></button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Add total row
    const totalRow = document.createElement('tr');
    totalRow.className = "bg-gray-50 dark:bg-gray-800 font-bold border-t-2 border-gray-200 dark:border-gray-700";
    totalRow.innerHTML = `
        <td colspan="5" class="px-6 py-4 text-right text-gray-900 dark:text-white">TOTAL GERAL:</td>
        <td class="px-6 py-4 text-gray-900 dark:text-white">${formatCurrency(totalProjectValue)}</td>
        <td colspan="2"></td>
    `;
    tableBody.appendChild(totalRow);

    // Add remaining row
    const remainingRow = document.createElement('tr');
    remainingRow.className = "bg-primary/5 dark:bg-primary/20 font-bold text-primary";
    remainingRow.innerHTML = `
        <td colspan="5" class="px-6 py-4 text-right">A PAGAR:</td>
        <td class="px-6 py-4">${formatCurrency(totalRemainingValue)}</td>
        <td colspan="2"></td>
    `;
    tableBody.appendChild(remainingRow);
}

window.togglePaidStatus = async (id, isPaid) => {
    try {
        await updateProjectForecastItem(id, { is_paid: isPaid });
        // Reload to update sorting/styling
        const projectId = document.getElementById('project-select').value;
        await loadItems(projectId);
    } catch (e) {
        console.error('Error updating status:', e);
        alert('Erro ao atualizar status.');
    }
}

// Modal functions
window.openNewItemModal = () => {
    document.getElementById('modal-title').innerText = 'Novo Item de Previsão';
    document.getElementById('i-id').value = ''; // Clear ID
    document.getElementById('i-name').value = '';
    document.getElementById('i-category').value = 'Outros';
    document.getElementById('i-qty').value = '1';
    document.getElementById('i-value').value = '0.00';
    document.getElementById('item-modal').classList.remove('hidden');
}

window.closeItemModal = () => {
    document.getElementById('item-modal').classList.add('hidden');
}

window.editItem = (id) => {
    const item = currentItems.find(i => i.id === id);
    if (!item) return;

    document.getElementById('modal-title').innerText = 'Editar Item de Previsão';
    document.getElementById('i-id').value = item.id;
    document.getElementById('i-name').value = item.name;
    document.getElementById('i-category').value = item.category || 'Outros';
    document.getElementById('i-qty').value = item.quantity;
    document.getElementById('i-unit').value = item.unit;
    document.getElementById('i-value').value = item.value;

    document.getElementById('item-modal').classList.remove('hidden');
}

window.saveItem = async () => {
    const projectId = document.getElementById('project-select').value;
    if (!projectId) {
        alert('Selecione um projeto primeiro.');
        return;
    }

    const id = document.getElementById('i-id').value;
    const name = document.getElementById('i-name').value;
    const category = document.getElementById('i-category').value;
    const qty = document.getElementById('i-qty').value;
    const unit = document.getElementById('i-unit').value;
    const value = document.getElementById('i-value').value;

    if (!name) return alert('Nome é obrigatório');

    try {
        if (id) {
            // Update
            await updateProjectForecastItem(id, {
                name: name,
                category: category,
                quantity: qty,
                unit: unit,
                value: value
            });
        } else {
            // Create
            await createProjectForecastItem({
                project_id: projectId,
                name: name,
                category: category,
                quantity: qty,
                unit: unit,
                value: value
            });
        }
        closeItemModal();
        await loadItems(projectId);
    } catch (e) {
        alert('Erro ao salvar: ' + e.message);
    }
}

window.deleteItem = async (id) => {
    if (confirm('Excluir este item da previsão?')) {
        await deleteProjectForecastItem(id);
        const projectId = document.getElementById('project-select').value;
        await loadItems(projectId);
    }
}

// Import Logic (Reused structure from items, can be adapted if forecast import format differs)
function setupImportHandlers() {
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

        const projectId = document.getElementById('project-select').value;
        if (!projectId) return alert('Selecione um projeto.');

        let addedCount = 0;
        for (let row of jsonData) {
            if (row.length >= 1) {
                const name = row[0];
                if (!name || name.toString().toLowerCase().includes('nome')) continue;

                const qty = parseInt(row[1]) || 1;
                const unit = row[2] || 'un';
                const val = parseFloat(row[3]) || 0; // Assume 4th column is value

                await createProjectForecastItem({
                    project_id: projectId,
                    name: name,
                    quantity: qty,
                    unit: unit,
                    value: val
                });
                addedCount++;
            }
        }
        alert(`${addedCount} itens importados para previsão com sucesso!`);
        await loadItems(projectId);
    };
    reader.readAsArrayBuffer(file);
}

async function parsePDF(file) {
    const projectId = document.getElementById('project-select').value;
    if (!projectId) return alert('Selecione um projeto.');

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
                if (line.length > 3 && !line.match(/^\d+$/)) {
                    await createProjectForecastItem({
                        project_id: projectId,
                        name: line,
                        quantity: 1,
                        unit: 'un',
                        value: 0
                    });
                    addedCount++;
                }
            }

            alert(`${addedCount} itens extraídos do PDF para previsão. Valores definidos como 0.`);
            await loadItems(projectId);

        } catch (err) {
            console.error(err);
            alert('Erro ao ler PDF: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function setupFilters() {
    const searchInput = document.getElementById('itemSearch');
    const categoryFilter = document.getElementById('categoryFilter');

    if (searchInput) {
        searchInput.addEventListener('input', filterItems);
    }
    if (categoryFilter) {
        categoryFilter.addEventListener('change', filterItems);
    }
}

function filterItems() {
    const searchInput = document.getElementById('itemSearch');
    const categoryFilter = document.getElementById('categoryFilter');

    if (!searchInput || !categoryFilter) return;

    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const searchTerm = normalize(searchInput.value);
    const category = categoryFilter.value;

    const filtered = currentItems.filter(item => {
        const itemName = normalize(item.name || '');
        const matchesSearch = itemName.includes(searchTerm);

        const itemCategory = item.category || 'Outros';
        const matchesCategory = category === 'All' || itemCategory === category;

        return matchesSearch && matchesCategory;
    });

    renderItemsTable(filtered);
}
