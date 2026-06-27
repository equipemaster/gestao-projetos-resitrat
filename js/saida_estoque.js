document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    setupFormSubmission();
    setupReturnModal();
});

let currentReturnExit = null;

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) { alert(message); return; }
    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const colors = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-500', info: 'bg-blue-600' };
    const toast = document.createElement('div');
    toast.className = `toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-white text-xs font-medium max-w-sm ${colors[type]}`;
    toast.innerHTML = `<span class="material-symbols-outlined flex-shrink-0" style="font-size:18px">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    const remove = () => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };
    const timer = setTimeout(remove, duration);
    toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function updateStats(exits) {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7);

    const exitsToday = exits.filter(e => e.created_at && e.created_at.startsWith(today)).length;
    const valueMonth = exits
        .filter(e => e.created_at && e.created_at.startsWith(currentMonth))
        .reduce((sum, e) => {
            const unitPrice = e.unit_price || (e.stock_items ? e.stock_items.value : 0);
            return sum + (unitPrice * e.quantity);
        }, 0);

    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

    const el1 = document.getElementById('stat-exits-today');
    const el2 = document.getElementById('stat-value-month');
    const el3 = document.getElementById('stat-exits-count');
    if (el1) el1.textContent = exitsToday;
    if (el2) el2.textContent = fmt(valueMonth);
    if (el3) el3.textContent = exits.length;
}

// ─── Initial Data ─────────────────────────────────────────────────────────────

async function loadInitialData() {
    try {
        const [projects, clients] = await Promise.all([fetchProjects(), fetchClients()]);

        const projectSelect = document.getElementById('project-select');
        projects
            .filter(p => p.status !== 'Completed' && p.status !== 'Done')
            .forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.text = p.name;
                projectSelect.appendChild(opt);
            });

        const clientSelect = document.getElementById('client-select');
        const filterSelect = document.getElementById('history-client-filter');
        clients.forEach(c => {
            let label = c.name;
            if (c.company) label += ` (${c.company})`;
            else if (c.cnpj) label += ` (${c.cnpj})`;

            const opt1 = document.createElement('option');
            opt1.value = c.id;
            opt1.textContent = label;
            clientSelect.appendChild(opt1);

            if (filterSelect) {
                const opt2 = document.createElement('option');
                opt2.value = c.id;
                opt2.textContent = label;
                filterSelect.appendChild(opt2);
            }
        });

        if (filterSelect) filterSelect.addEventListener('change', () => loadExitHistory());
        const dateFilter = document.getElementById('history-date-filter');
        if (dateFilter) dateFilter.addEventListener('change', () => loadExitHistory());

        await loadExitHistory();
    } catch (e) {
        console.error('Error loading initial data:', e);
        showToast('Erro ao carregar dados iniciais.', 'error');
    }
}

// ─── Item Rows ────────────────────────────────────────────────────────────────

let editingExitId = null;

function resetItemRows() {
    const container = document.getElementById('items-container');
    if (!container) return;
    const rows = container.querySelectorAll('.item-row');
    for (let i = 1; i < rows.length; i++) rows[i].remove();
    const firstRow = rows[0];
    firstRow.querySelectorAll('input, select').forEach(input => {
        if (input.tagName === 'SELECT' && input.name === 'item_unit') input.value = 'UN';
        else input.value = '';
    });
    const removeBtn = firstRow.querySelector('.remove-item-btn');
    if (removeBtn) removeBtn.classList.add('hidden');
}

// ─── Form Submission ──────────────────────────────────────────────────────────

function setupFormSubmission() {
    const form = document.getElementById('exit-form');

    // Inject cancel button after submit
    if (!document.getElementById('cancel-edit-btn')) {
        const submitWrapper = document.querySelector('#exit-form .flex.flex-col.gap-2');
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'cancel-edit-btn';
        cancelBtn.className = 'hidden w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';
        cancelBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">close</span> Cancelar Edição';
        cancelBtn.onclick = cancelEdit;
        if (submitWrapper) submitWrapper.appendChild(cancelBtn);
    }

    // Add item button
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', () => {
            const container = document.getElementById('items-container');
            const firstRow = container.querySelector('.item-row');
            const newRow = firstRow.cloneNode(true);
            newRow.querySelectorAll('input, select').forEach(input => {
                if (input.tagName === 'SELECT' && input.name === 'item_unit') input.value = 'UN';
                else input.value = '';
            });
            const removeBtn = newRow.querySelector('.remove-item-btn');
            removeBtn.classList.remove('hidden');
            removeBtn.onclick = function () { this.closest('.item-row').remove(); };
            container.appendChild(newRow);
            newRow.querySelector('[name="item_name"]')?.focus();
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
            showToast('Selecione um cliente antes de confirmar a saída.', 'warning');
            document.getElementById('client-select')?.focus();
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

            if (!itemName) { showToast('Informe o nome de todos os materiais.', 'warning'); validationError = true; return; }
            if (isNaN(itemValue) || itemValue < 0) { showToast(`Valor unitário inválido para "${itemName}".`, 'warning'); validationError = true; return; }
            if (isNaN(qty) || qty <= 0) { showToast(`Quantidade inválida para "${itemName}".`, 'warning'); validationError = true; return; }
            exitsData.push({ itemName: itemName.toUpperCase(), itemUnit, itemValue, qty });
        });

        if (validationError || exitsData.length === 0) return;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Processando...';

            if (editingExitId) {
                const item = exitsData[0];
                const itemId = await ensureStockItem(item.itemName, item.itemValue, item.qty, item.itemUnit);
                await updateStockExit(editingExitId, {
                    item_id: itemId, quantity: item.qty, reason,
                    project_id: projectId || null, observation: obs || null,
                    client_id: clientId || null, unit_price: item.itemValue
                });
                showToast('Saída atualizada com sucesso!', 'success');
                cancelEdit();
            } else {
                const todayStr = new Date().toDateString();
                let skipped = 0;
                for (const item of exitsData) {
                    const itemId = await ensureStockItem(item.itemName, item.itemValue, item.qty, item.itemUnit);
                    const { data: duplicates, error: dupError } = await _supabase
                        .from('stock_exits').select('id, created_at')
                        .eq('client_id', clientId).eq('reason', reason)
                        .eq('item_id', itemId).eq('unit_price', item.itemValue);
                    if (dupError) throw dupError;

                    const isDuplicate = duplicates?.some(d => new Date(d.created_at).toDateString() === todayStr);
                    if (isDuplicate) {
                        showToast(`"${item.itemName}" já foi registrado hoje com os mesmos dados. Ignorado.`, 'warning', 6000);
                        skipped++;
                        continue;
                    }
                    await processStockExit(itemId, item.qty, reason, projectId, obs, clientId);
                }
                const registered = exitsData.length - skipped;
                if (registered > 0) showToast(`${registered} saída(s) registrada(s) com sucesso!`, 'success');
                form.reset();
                resetItemRows();
            }

            await loadExitHistory();
        } catch (error) {
            console.error(error);
            showToast('Erro ao salvar: ' + (error.message || 'Erro desconhecido'), 'error');
        } finally {
            submitBtn.disabled = false;
            if (!editingExitId) {
                submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">check_circle</span> Confirmar Saída';
            } else {
                submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">save</span> Salvar Alterações';
            }
        }
    });
}

function cancelEdit() {
    editingExitId = null;
    document.getElementById('exit-form').reset();
    resetItemRows();

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">check_circle</span> Confirmar Saída';
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
    firstRow.querySelector('[name="item_name"]').value = exit.stock_items ? exit.stock_items.name : '';
    firstRow.querySelector('[name="item_unit"]').value = exit.stock_items ? exit.stock_items.unit : 'UN';
    firstRow.querySelector('[name="item_value"]').value = exit.unit_price || (exit.stock_items ? exit.stock_items.value : 0);
    firstRow.querySelector('[name="item_qty"]').value = exit.quantity;

    document.getElementById('project-select').value = exit.project_id || '';
    document.getElementById('client-select').value = exit.client_id || '';
    document.getElementById('exit-reason').value = exit.reason;
    document.getElementById('exit-obs').value = exit.observation || '';

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">save</span> Salvar Alterações';
    submitBtn.classList.remove('bg-primary', 'hover:bg-primary/90');
    submitBtn.classList.add('bg-green-600', 'hover:bg-green-700');

    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) addItemBtn.classList.add('hidden');
};

// ─── Filters ──────────────────────────────────────────────────────────────────

async function getFilteredExits() {
    let exits = await fetchStockExits();
    const filterClientId = document.getElementById('history-client-filter')?.value || '';
    const filterMonth = document.getElementById('history-date-filter')?.value || '';
    if (filterClientId) exits = exits.filter(e => e.client_id == filterClientId);
    if (filterMonth) exits = exits.filter(e => e.created_at?.startsWith(filterMonth));
    exits = exits.filter(e => e.stock_items);
    exits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return exits;
}

// ─── History Table ────────────────────────────────────────────────────────────

function getReasonBadge(reason) {
    const map = {
        'Industrialização': 'bg-blue-100 text-blue-700',
        'Manutenção':       'bg-amber-100 text-amber-700',
        'Perda/Quebra':     'bg-red-100 text-red-700',
        'Venda':            'bg-emerald-100 text-emerald-700',
        'Serviço':          'bg-purple-100 text-purple-700',
        'Outro':            'bg-gray-100 text-gray-600',
    };
    const cls = map[reason] || 'bg-gray-100 text-gray-600';
    return `<span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}">${reason}</span>`;
}

async function loadExitHistory() {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-10 text-center"><div class="flex flex-col items-center gap-2"><span class="material-symbols-outlined text-gray-300 dark:text-gray-600" style="font-size:32px">hourglass_empty</span><p class="text-sm text-gray-400">Carregando...</p></div></td></tr>`;

    try {
        const exits = await getFilteredExits();
        updateStats(exits);
        tbody.innerHTML = '';

        if (exits.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-10 text-center"><div class="flex flex-col items-center gap-2"><span class="material-symbols-outlined text-gray-300 dark:text-gray-600" style="font-size:32px">search_off</span><p class="text-sm text-gray-400">Nenhuma saída encontrada para os filtros aplicados.</p></div></td></tr>`;
            return;
        }

        exits.forEach(exit => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';

            const formattedDate = formatDate(exit.created_at.split('T')[0]);
            const itemName = exit.stock_items ? exit.stock_items.name : '<span class="text-red-400 text-xs">Item excluído</span>';
            let destination = '-';
            if (exit.project_id) destination = 'Projeto';
            if (exit.clients) destination = exit.clients.name;
            const unitPrice = exit.unit_price || (exit.stock_items ? exit.stock_items.value : 0);
            const totalPrice = unitPrice * exit.quantity;
            const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

            tr.innerHTML = `
                <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">${formattedDate}</td>
                <td class="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-gray-900 dark:text-white">${itemName}</td>
                <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${fmt(unitPrice)}</td>
                <td class="px-5 py-3.5 whitespace-nowrap text-xs font-bold text-gray-800 dark:text-gray-200">${exit.quantity} <span class="font-normal text-gray-400">${exit.stock_items?.unit || ''}</span></td>
                <td class="px-5 py-3.5 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-white">${fmt(totalPrice)}</td>
                <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${destination}</td>
                <td class="px-5 py-3.5 whitespace-nowrap">${getReasonBadge(exit.reason)}</td>
                <td class="px-5 py-3.5 whitespace-nowrap text-right"></td>
            `;

            const actionTd = tr.lastElementChild;
            const btnGroup = document.createElement('div');
            btnGroup.className = 'flex items-center justify-end gap-1';

            const editBtn = document.createElement('button');
            editBtn.className = 'p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors';
            editBtn.title = 'Editar';
            editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">edit</span>';
            editBtn.onclick = () => editExit(exit);
            btnGroup.appendChild(editBtn);

            if (exit.stock_items) {
                const returnBtn = document.createElement('button');
                returnBtn.className = 'p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors';
                returnBtn.title = 'Devolver';
                returnBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">undo</span>';
                returnBtn.onclick = () => openReturnModal(exit);
                btnGroup.appendChild(returnBtn);
            }

            actionTd.appendChild(btnGroup);
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading history:', e);
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-center text-sm text-red-500">Erro ao carregar histórico.</td></tr>`;
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

window.exportExitHistory = async () => {
    const btn = document.querySelector('button[onclick="exportExitHistory()"]');
    try {
        if (btn) { btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size:16px">refresh</span> Exportando...'; btn.disabled = true; }
        const exits = await getFilteredExits();
        if (!exits || exits.length === 0) { showToast('Nenhuma saída para exportar com os filtros aplicados.', 'warning'); return; }
        const dataToExport = exits.map(item => ({
            'Data': formatDate(item.created_at.split('T')[0]),
            'Item': item.stock_items ? item.stock_items.name : 'Item excluído',
            'Valor Unitário': (item.unit_price || (item.stock_items ? item.stock_items.value : 0)).toFixed(2),
            'Quantidade': item.quantity,
            'Unidade': item.stock_items ? item.stock_items.unit : '-',
            'Motivo': item.reason,
            'Destino': item.clients ? item.clients.name : '-',
            'Observação': item.observation || ''
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Saídas de Estoque");
        XLSX.writeFile(wb, "Historico_Saida_Estoque.xlsx");
        showToast('Planilha exportada com sucesso!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Erro ao exportar: ' + error.message, 'error');
    } finally {
        if (btn) { btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">download</span> Exportar XLS'; btn.disabled = false; }
    }
};

window.exportExitHistoryPDF = async () => {
    const btn = document.querySelector('button[onclick="exportExitHistoryPDF()"]');
    try {
        if (btn) { btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size:16px">refresh</span> Exportando...'; btn.disabled = true; }
        const exits = await getFilteredExits();
        if (!exits || exits.length === 0) { showToast('Nenhuma saída para exportar com os filtros aplicados.', 'warning'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        doc.setFontSize(16);
        doc.text('Histórico de Saídas de Estoque', 14, 20);
        doc.setFontSize(9);
        doc.setTextColor(100);
        const filterSelect = document.getElementById('history-client-filter');
        const clientName = filterSelect?.value ? filterSelect.options[filterSelect.selectedIndex].text : 'Todos';
        const dateFilter = document.getElementById('history-date-filter');
        const monthYear = dateFilter?.value || 'Todos';
        doc.text(`Cliente: ${clientName} | Período: ${monthYear}`, 14, 27);

        const tableRows = exits.map(item => [
            formatDate(item.created_at.split('T')[0]),
            item.stock_items ? item.stock_items.name : 'Item excluído',
            `R$ ${(item.unit_price || (item.stock_items ? item.stock_items.value : 0)).toFixed(2)}`,
            item.quantity.toString(),
            item.stock_items ? item.stock_items.unit : '-',
            item.reason,
            item.clients ? item.clients.name : '-',
            item.observation || ''
        ]);

        doc.autoTable({
            startY: 32,
            head: [["Data", "Item", "Valor Unit.", "Qtd", "Unidade", "Motivo", "Cliente", "Observação"]],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [30, 58, 138] },
            styles: { fontSize: 8 }
        });
        doc.save('Historico_Saida_Estoque.pdf');
        showToast('PDF exportado com sucesso!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Erro ao exportar PDF: ' + error.message, 'error');
    } finally {
        if (btn) { btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">picture_as_pdf</span> Exportar PDF'; btn.disabled = false; }
    }
};

// ─── Return Modal ─────────────────────────────────────────────────────────────

function setupReturnModal() {
    const confirmBtn = document.getElementById('confirm-return-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmReturn);
}

window.openReturnModal = (exit) => {
    currentReturnExit = exit;
    const modal = document.getElementById('return-modal');
    document.getElementById('return-modal-desc').textContent =
        `Devolvendo: ${exit.stock_items ? exit.stock_items.name : 'Item excluído'} — Qtd. saída: ${exit.quantity}`;
    const input = document.getElementById('return-qty');
    input.value = '';
    input.max = exit.quantity;
    input.min = 0.01;
    input.step = 'any';
    document.getElementById('return-max-qty').textContent = exit.quantity;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
};

window.closeReturnModal = () => {
    const modal = document.getElementById('return-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    currentReturnExit = null;
};

async function confirmReturn() {
    if (!currentReturnExit) return;
    const input = document.getElementById('return-qty');
    const qtyToReturn = parseFloat(input.value);

    if (!qtyToReturn || qtyToReturn <= 0) {
        showToast('Informe uma quantidade válida para devolver.', 'warning');
        input.focus();
        return;
    }
    if (qtyToReturn > currentReturnExit.quantity) {
        showToast(`A quantidade não pode exceder a saída original (${currentReturnExit.quantity}).`, 'warning');
        return;
    }

    const btn = document.getElementById('confirm-return-btn');
    try {
        btn.disabled = true;
        btn.textContent = 'Processando...';

        const itemId = currentReturnExit.stock_item_id || currentReturnExit.item_id;
        if (!itemId) throw new Error('ID do item não encontrado no registro de saída.');

        const { data: stockItems, error: fetchError } = await _supabase
            .from('stock_items').select('quantity').eq('id', itemId);
        if (fetchError) throw fetchError;

        const newStock = stockItems[0].quantity + qtyToReturn;
        await updateStockItem(itemId, { quantity: newStock });

        const remaining = Math.round((currentReturnExit.quantity - qtyToReturn) * 1000) / 1000;
        if (remaining <= 0) await deleteStockExit(currentReturnExit.id);
        else await updateStockExit(currentReturnExit.id, { quantity: remaining });

        showToast('Devolução realizada com sucesso!', 'success');
        closeReturnModal();
        await loadExitHistory();
    } catch (error) {
        console.error('Return error:', error);
        showToast('Erro ao realizar devolução: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar Devolução';
    }
}
