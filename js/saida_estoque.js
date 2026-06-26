document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    /* Search handlers removed as we are using manual entry now */
    // setupSearchHandlers(); // Removed
    setupFormSubmission();
    setupReturnModal();
});

let currentReturnExit = null;

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

        // Populate Filter Dropdown
        const filterSelect = document.getElementById('history-client-filter');
        if (filterSelect) {
            clients.forEach(c => {
                const option = document.createElement('option');
                option.value = c.id;
                let label = c.name;
                if (c.company) label += ` (${c.company})`;
                option.textContent = label;
                filterSelect.appendChild(option);
            });

            filterSelect.addEventListener('change', () => loadExitHistory());
        }

        // Date Filter Listener
        const dateFilter = document.getElementById('history-date-filter');
        if (dateFilter) {
            dateFilter.addEventListener('change', () => loadExitHistory());
        }

        // Load History
        await loadExitHistory();
    } catch (e) {
        console.error('Error loading initial data:', e);
        alert('Erro ao carregar dados iniciais.');
    }
}

let editingExitId = null;

function resetItemRows() {
    const container = document.getElementById('items-container');
    if (!container) return;
    const rows = container.querySelectorAll('.item-row');
    // Keep first row, remove others
    for (let i = 1; i < rows.length; i++) {
        rows[i].remove();
    }
    // Reset first row
    const firstRow = rows[0];
    const inputs = firstRow.querySelectorAll('input, select');
    inputs.forEach(input => {
        if(input.tagName === 'SELECT') {
            if(input.name === 'item_unit') input.value = 'UN';
        } else {
            input.value = '';
        }
    });
    // Hide remove btn on first row
    const removeBtn = firstRow.querySelector('.remove-item-btn');
    if (removeBtn) removeBtn.classList.add('hidden');
}

function setupFormSubmission() {
    const form = document.getElementById('exit-form');
    console.log('Setup Form Submission');

    // Add Cancel Button logic
    if (!document.getElementById('cancel-edit-btn')) {
        const btnContainer = document.querySelector('#exit-form .pt-4');
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'cancel-edit-btn';
        cancelBtn.className = 'hidden w-full mt-2 flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors';
        cancelBtn.textContent = 'Cancelar Edição';
        cancelBtn.onclick = cancelEdit;
        btnContainer.appendChild(cancelBtn);
    }

    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', () => {
            const container = document.getElementById('items-container');
            const firstRow = container.querySelector('.item-row');
            const newRow = firstRow.cloneNode(true);
            
            // Clear inputs
            const inputs = newRow.querySelectorAll('input, select');
            inputs.forEach(input => {
                if(input.tagName === 'SELECT') {
                    if(input.name === 'item_unit') input.value = 'UN';
                } else {
                    input.value = '';
                }
            });
            
            // Show remove button
            const removeBtn = newRow.querySelector('.remove-item-btn');
            removeBtn.classList.remove('hidden');
            removeBtn.onclick = function() {
                this.closest('.item-row').remove();
            };
            
            container.appendChild(newRow);
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('submit-btn');
        const projectId = document.getElementById('project-select').value;
        const clientId = document.getElementById('client-select').value;
        const reason = document.getElementById('exit-reason').value;
        const obs = document.getElementById('exit-obs').value;

        if (!clientId) {
            alert('Por favor, selecione um cliente.');
            return;
        }

        const rows = document.querySelectorAll('.item-row');
        let exitsData = [];
        let validationError = false;

        rows.forEach(row => {
            const itemName = row.querySelector('[name="item_name"]').value.trim();
            const itemUnit = row.querySelector('[name="item_unit"]').value;
            const itemValue = parseFloat(row.querySelector('[name="item_value"]').value);
            const qty = parseFloat(row.querySelector('[name="item_qty"]').value);

            if (!itemName) {
                alert('Por favor, informe o nome de todos os materiais.');
                validationError = true;
                return;
            }
            if (isNaN(itemValue) || itemValue < 0) {
                alert(`Por favor, insira um valor unitário válido para ${itemName}.`);
                validationError = true;
                return;
            }
            if (isNaN(qty) || qty <= 0) {
                alert(`Por favor, insira uma quantidade válida para ${itemName}.`);
                validationError = true;
                return;
            }

            exitsData.push({
                itemName: itemName.toUpperCase(),
                itemUnit,
                itemValue,
                qty
            });
        });

        if (validationError || exitsData.length === 0) return;

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processando...';

            if (editingExitId) {
                // UPDATE existing exit (only updates the first/only item being edited)
                const item = exitsData[0];
                const itemId = await ensureStockItem(item.itemName, item.itemValue, item.qty, item.itemUnit);
                
                await updateStockExit(editingExitId, {
                    item_id: itemId,
                    quantity: item.qty,
                    reason: reason,
                    project_id: projectId || null,
                    observation: obs || null,
                    client_id: clientId || null,
                    unit_price: item.itemValue
                });
                alert('Saída atualizada com sucesso!');
                cancelEdit();
            } else {
                // CREATE new exits
                // Check for duplicates before creating
                const todayStr = new Date().toDateString();
                
                for (const item of exitsData) {
                    const itemId = await ensureStockItem(item.itemName, item.itemValue, item.qty, item.itemUnit);
                    
                    const { data: duplicates, error: dupError } = await _supabase
                        .from('stock_exits')
                        .select('id, created_at')
                        .eq('client_id', clientId)
                        .eq('reason', reason)
                        .eq('item_id', itemId)
                        .eq('unit_price', item.itemValue);
                    
                    if (dupError) throw dupError;

                    const isDuplicate = duplicates && duplicates.some(d => {
                        return new Date(d.created_at).toDateString() === todayStr;
                    });

                    if (isDuplicate) {
                        alert(`Atenção: A saída de ${item.itemName} não foi registrada pois já existe um registro hoje com os mesmos dados.`);
                        continue; // Skip duplicate, continue with others
                    }

                    // CREATE new exit
                    await processStockExit(itemId, item.qty, reason, projectId, obs, clientId);
                }
                
                alert('Operação concluída!');
                form.reset();
                resetItemRows();
            }

            console.log('Operation successful');
            await loadExitHistory();

        } catch (error) {
            console.error(error);
            alert('Erro ao salvar: ' + (error.message || error.error_description || 'Erro desconhecido'));
        } finally {
            submitBtn.disabled = false;
            if (!editingExitId) submitBtn.textContent = 'Confirmar Saída';
            else submitBtn.textContent = 'Salvar Alterações';
        }
    });
}

function cancelEdit() {
    editingExitId = null;
    const form = document.getElementById('exit-form');
    form.reset();
    resetItemRows();

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.textContent = 'Confirmar Saída';
    submitBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
    submitBtn.classList.add('bg-primary', 'hover:bg-primary/90');

    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) addItemBtn.classList.remove('hidden');

    document.getElementById('selected-item-id').value = '';
}

window.editExit = (exit) => {
    document.getElementById('exit-form').scrollIntoView({ behavior: 'smooth' });
    editingExitId = exit.id;
    
    resetItemRows();
    const container = document.getElementById('items-container');
    const firstRow = container.querySelector('.item-row');

    // Populate Fields
    firstRow.querySelector('[name="item_name"]').value = exit.stock_items ? exit.stock_items.name : '';
    firstRow.querySelector('[name="item_unit"]').value = exit.stock_items ? exit.stock_items.unit : 'UN';

    const val = exit.unit_price || (exit.stock_items ? exit.stock_items.value : 0);
    firstRow.querySelector('[name="item_value"]').value = val;
    firstRow.querySelector('[name="item_qty"]').value = exit.quantity;
    
    document.getElementById('project-select').value = exit.project_id || '';
    document.getElementById('client-select').value = exit.client_id || '';
    document.getElementById('exit-reason').value = exit.reason;
    document.getElementById('exit-obs').value = exit.observation || '';

    // Update Buttons
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.textContent = 'Salvar Alterações';
    submitBtn.classList.remove('bg-primary', 'hover:bg-primary/90');
    submitBtn.classList.add('bg-green-600', 'hover:bg-green-700');

    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    
    // Hide Add Item button during edit (since edit is single row)
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) addItemBtn.classList.add('hidden');
}

async function getFilteredExits() {
    let exits = await fetchStockExits();

    // Apply Client Filter
    const filterSelect = document.getElementById('history-client-filter');
    const filterClientId = filterSelect ? filterSelect.value : '';

    if (filterClientId) {
        exits = exits.filter(exit => exit.client_id == filterClientId);
    }

    // Apply Date Filter (Month)
    const dateFilter = document.getElementById('history-date-filter');
    const filterMonth = dateFilter ? dateFilter.value : '';

    if (filterMonth) {
        // filterMonth is YYYY-MM
        exits = exits.filter(exit => exit.created_at.startsWith(filterMonth));
    }

    // Filter out deleted items
    exits = exits.filter(exit => exit.stock_items);

    // Sort by date desc
    exits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return exits;
}

window.exportExitHistory = async () => {
    try {
        const btn = document.querySelector('button[onclick="exportExitHistory()"]');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Exportando...';
            btn.disabled = true;
        }

        const exits = await getFilteredExits();

        if (!exits || exits.length === 0) {
            alert('Não há histórico de saídas para exportar com os filtros atuais.');
            return;
        }

        // Format data for Excel
        const dataToExport = exits.map(item => ({
            'Data': formatDate(item.created_at.split('T')[0]),
            'Item': item.stock_items ? item.stock_items.name : 'Item excluído',
            'Valor Unitário': (item.unit_price || (item.stock_items ? item.stock_items.value : 0)).toFixed(2),
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
            btn.innerHTML = '<span class="material-symbols-outlined text-xl">download</span><span class="text-sm font-medium">Exportar XLS</span>';
            btn.disabled = false;
        }
    }
}

window.exportExitHistoryPDF = async () => {
    try {
        const btn = document.querySelector('button[onclick="exportExitHistoryPDF()"]');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Exportando...';
            btn.disabled = true;
        }

        const exits = await getFilteredExits();

        if (!exits || exits.length === 0) {
            alert('Não há histórico de saídas para exportar com os filtros atuais.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFontSize(18);
        doc.text('Histórico de Saídas de Estoque', 14, 22);

        doc.setFontSize(11);
        doc.setTextColor(100);
        
        const filterSelect = document.getElementById('history-client-filter');
        const clientName = filterSelect && filterSelect.options[filterSelect.selectedIndex] && filterSelect.value !== ''
            ? filterSelect.options[filterSelect.selectedIndex].text : 'Todos';
        const dateFilter = document.getElementById('history-date-filter');
        const monthYear = dateFilter && dateFilter.value ? dateFilter.value : 'Todos';
        
        doc.text(`Filtros - Cliente: ${clientName} | Mês: ${monthYear}`, 14, 30);

        const tableColumn = ["Data", "Item", "Valor Unit.", "Qtd", "Unidade", "Motivo", "Cliente", "Observação"];
        const tableRows = [];

        exits.forEach(item => {
            const rowData = [
                formatDate(item.created_at.split('T')[0]),
                item.stock_items ? item.stock_items.name : 'Item excluído',
                `R$ ${(item.unit_price || (item.stock_items ? item.stock_items.value : 0)).toFixed(2)}`,
                item.quantity.toString(),
                item.stock_items ? item.stock_items.unit : '-',
                item.reason,
                item.clients ? item.clients.name : '-',
                item.observation || ''
            ];
            tableRows.push(rowData);
        });

        doc.autoTable({
            startY: 36,
            head: [tableColumn],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [19, 91, 236] }, // Primary color
            styles: { fontSize: 9 },
            margin: { top: 30 }
        });

        doc.save('Historico_Saida_Estoque.pdf');

    } catch (error) {
        console.error('Export error:', error);
        alert('Erro ao exportar PDF: ' + error.message);
    } finally {
        const btn = document.querySelector('button[onclick="exportExitHistoryPDF()"]');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined text-xl">picture_as_pdf</span><span class="text-sm font-medium">Exportar PDF</span>';
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

    tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Carregando...</td></tr>';

    try {
        const exits = await getFilteredExits();

        tbody.innerHTML = '';

        if (exits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Nenhuma saída recente.</td></tr>';
            return;
        }

        exits.forEach(exit => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";

            const formattedDate = formatDate(exit.created_at.split('T')[0]);
            const itemName = exit.stock_items ? exit.stock_items.name : '<span class="text-red-500">Item excluído</span>';

            let destination = '-';
            // Try to find project name if loaded, otherwise just show ID or Client
            if (exit.project_id) destination = 'Projeto';
            if (exit.clients) destination = exit.clients.name;

            const unitPrice = exit.unit_price || (exit.stock_items ? exit.stock_items.value : 0);
            const totalPrice = unitPrice * exit.quantity;

            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${formattedDate}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${itemName}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">R$ ${unitPrice.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-bold">${exit.quantity} ${exit.stock_items ? exit.stock_items.unit : ''}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-bold">R$ ${totalPrice.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${destination}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${exit.reason}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"></td>
            `;

            const actionTd = tr.lastElementChild;
            const container = document.createElement('div');
            container.className = "flex items-center justify-end gap-2";

            // Edit Button
            const editBtn = document.createElement('button');
            editBtn.className = "text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300 flex items-center gap-1";
            editBtn.innerHTML = '<span class="material-symbols-outlined text-lg">edit</span>';
            editBtn.title = 'Editar';
            // We need to attach the full object. Since we are in a loop, 'exit' is available.
            editBtn.onclick = () => editExit(exit);
            container.appendChild(editBtn);

            if (exit.stock_items) {
                const returnBtn = document.createElement('button');
                returnBtn.className = "text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1";
                returnBtn.innerHTML = '<span class="material-symbols-outlined text-lg">undo</span>';
                returnBtn.title = 'Devolver';
                returnBtn.onclick = () => openReturnModal(exit);
                container.appendChild(returnBtn);
            }

            actionTd.appendChild(container);

            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading history:', e);
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-red-500">Erro ao carregar histórico.</td></tr>';
    }
}
