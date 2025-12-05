document.addEventListener('DOMContentLoaded', async () => {
    console.log('Project Items page loading...');
    await loadProjectSelect();

    // We don't need to re-insert modal HTML here if it's already in the page or if we are using the one from HTML file.
    // The previous implementation inserted modal via JS. The HTML file now has the modal structure partially? 
    // Wait, the previous replacement added the modal structure to the HTML file? 
    // Let's check. Use write_to_file to overwrite the whole JS logic is safer to avoid duplication or conflicts.

    // Setup handlers
    setupImportHandlers();

    // Initial load
    const select = document.getElementById('project-select');
    if (select.value) {
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

    if (projects.length > 0) {
        select.value = projects[0].id; // Auto-select first project
        await loadItems(projects[0].id);
    }
}

async function loadItems(projectId) {
    if (!projectId) {
        renderItemsTable([]);
        return;
    }
    // Check if fetchProjectItems exists (it should now)
    if (typeof fetchProjectItems !== 'function') {
        console.error('fetchProjectItems missing in api.js');
        return;
    }
    currentItems = await fetchProjectItems(projectId);
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
        tableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Nenhum item encontrado.</td></tr>';
        return;
    }

    let totalProjectValue = 0;

    items.forEach(item => {
        const val = parseFloat(item.value) || 0;
        const total = val * item.quantity;
        totalProjectValue += total;

        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50";
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium">${item.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${item.quantity}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${item.unit}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${formatCurrency(val)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white text-sm font-bold">${formatCurrency(total)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3" onclick="editItem('${item.id}')"><span class="material-symbols-outlined">edit</span></button>
                <button class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300" onclick="deleteItem('${item.id}')"><span class="material-symbols-outlined">delete</span></button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Add total row
    const totalRow = document.createElement('tr');
    totalRow.className = "bg-gray-50 dark:bg-gray-800 font-bold";
    totalRow.innerHTML = `
        <td colspan="4" class="px-6 py-4 text-right text-gray-900 dark:text-white">TOTAL GERAL:</td>
        <td class="px-6 py-4 text-gray-900 dark:text-white">${formatCurrency(totalProjectValue)}</td>
        <td colspan="2"></td>
    `;
    tableBody.appendChild(totalRow);
}

// Modal functions
window.openNewItemModal = () => {
    document.getElementById('modal-title').innerText = 'Novo Item';
    document.getElementById('i-id').value = ''; // Clear ID
    document.getElementById('i-name').value = '';
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

    document.getElementById('modal-title').innerText = 'Editar Item';
    document.getElementById('i-id').value = item.id;
    document.getElementById('i-name').value = item.name;
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
    const qty = document.getElementById('i-qty').value;
    const unit = document.getElementById('i-unit').value;
    const value = document.getElementById('i-value').value;

    if (!name) return alert('Nome é obrigatório');

    try {
        if (id) {
            // Update
            await updateProjectItem(id, {
                name: name,
                quantity: qty,
                unit: unit,
                value: value
            });
        } else {
            // Create
            await createProjectItem({
                project_id: projectId,
                name: name,
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
    if (confirm('Excluir este item?')) {
        await deleteProjectItem(id);
        const projectId = document.getElementById('project-select').value;
        await loadItems(projectId);
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

                await createProjectItem({
                    project_id: projectId,
                    name: name,
                    quantity: qty,
                    unit: unit,
                    value: val
                });
                addedCount++;
            }
        }
        alert(`${addedCount} itens importados do Excel com sucesso!`);
        await loadItems(projectId);
    };
    reader.readAsArrayBuffer(file);
}

// Basic PDF Text Extraction (Kept simple, no value parsing for now unless clear structure)
async function parsePDF(file) {
    // ... (Same as before, maybe hard to extract price from text blob reliably without AI)
    // We'll just stick to name for now.
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
                    await createProjectItem({
                        project_id: projectId,
                        name: line,
                        quantity: 1,
                        unit: 'un',
                        value: 0
                    });
                    addedCount++;
                }
            }

            alert(`${addedCount} itens extraídos do PDF. Valores definidos como 0.`);
            await loadItems(projectId);

        } catch (err) {
            console.error(err);
            alert('Erro ao ler PDF: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}
