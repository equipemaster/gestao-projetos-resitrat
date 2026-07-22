let allOrders = [];
let allProjectsList = [];
let editingOrderId = null;
let pendingDeleteId = null;
let currentUserName = 'Usuário';

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') await checkSession();
    setupFormHandlers();
    await loadCurrentUserName();
    await loadProjectsDropdown();
    await refreshOrders();
});

async function loadCurrentUserName() {
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        if (!session?.user) return;
        const { data: profile } = await _supabase
            .from('users').select('name').eq('email', session.user.email).maybeSingle();
        currentUserName = profile?.name || session.user.email.split('@')[0].toUpperCase();
    } catch (e) {
        console.error('Error loading current user name:', e);
    }
}

// ─── Toast Notification ─────────────────────────────────────────────────────

function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const colors = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-500', info: 'bg-blue-600' };

    const toast = document.createElement('div');
    toast.className = `toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl text-white text-xs font-medium max-w-sm ${colors[type] || colors.info}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined flex-shrink-0" style="font-size:18px">${icons[type] || 'info'}</span>
        <span class="flex-1">${escapeHtml(message)}</span>
        <button onclick="this.parentElement.remove()" class="ml-1 opacity-70 hover:opacity-100 transition-opacity flex-shrink-0">
            <span class="material-symbols-outlined" style="font-size:16px">close</span>
        </button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

function formatCurrency(value) {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Data Loading ────────────────────────────────────────────────────────────

async function loadProjectsDropdown() {
    allProjectsList = await fetchProjects();
    const select = document.getElementById('order-project');
    allProjectsList
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
}

async function refreshOrders() {
    allOrders = await fetchPurchaseOrders();
    renderKpis();
    renderOrders();
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

function renderKpis() {
    const container = document.getElementById('kpi-cards');
    if (!container) return;

    const abertas = allOrders.filter(o => o.status === 'ABERTO').length;
    const parciais = allOrders.filter(o => o.status === 'PARCIAL').length;
    const recebidas = allOrders.filter(o => o.status === 'RECEBIDO').length;

    let valorPendente = 0;
    allOrders.forEach(o => {
        if (o.status === 'ABERTO' || o.status === 'PARCIAL') {
            (o.purchase_order_items || []).forEach(item => {
                const pending = Math.max(0, (item.quantity || 0) - (item.quantity_received || 0));
                valorPendente += pending * (item.unit_price || 0);
            });
        }
    });

    const cards = [
        { label: 'Em Aberto', value: abertas, icon: 'pending_actions', gradient: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)' },
        { label: 'Parcial', value: parciais, icon: 'hourglass_top', gradient: 'linear-gradient(135deg,#92400e 0%,#d97706 100%)' },
        { label: 'Recebidas', value: recebidas, icon: 'task_alt', gradient: 'linear-gradient(135deg,#14532d 0%,#16a34a 100%)' },
        { label: 'Valor Pendente de Recebimento', value: formatCurrency(valorPendente), icon: 'payments', gradient: 'linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)' }
    ];

    container.innerHTML = cards.map(c => `
        <div class="bg-white dark:bg-background-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3">
            <div style="background:${c.gradient}" class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-white" style="font-size:20px">${c.icon}</span>
            </div>
            <div class="min-w-0">
                <p class="text-lg font-bold text-[#0d121b] dark:text-white truncate">${c.value}</p>
                <p class="text-xs text-gray-400 truncate">${c.label}</p>
            </div>
        </div>
    `).join('');
}

// ─── Receiving Thermometer (signature visual, shared with Conferência) ─────

function receiptBarHtml(ordered, received) {
    const pct = ordered > 0 ? Math.min(100, (received / ordered) * 100) : 0;
    const color = pct >= 100 ? '#16a34a' : pct > 0 ? '#d97706' : '#9ca3af';
    return `
        <div class="receipt-bar">
            <div class="receipt-bar-fill" style="width:${pct}%; background:${color}"></div>
        </div>
    `;
}

function statusBadge(status) {
    const map = {
        ABERTO: { label: 'Em Aberto', cls: 'bg-blue-50 text-primary border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' },
        PARCIAL: { label: 'Parcial', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' },
        RECEBIDO: { label: 'Recebido', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' },
        CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' }
    };
    const s = map[status] || map.ABERTO;
    return `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${s.cls}">${s.label}</span>`;
}

// ─── Orders Table ────────────────────────────────────────────────────────────

function renderOrders() {
    const tbody = document.getElementById('orders-table-body');
    const countEl = document.getElementById('orders-count');
    if (!tbody) return;

    const statusFilter = document.getElementById('filter-status').value;
    const search = (document.getElementById('search-orders').value || '').trim().toUpperCase();

    let list = allOrders.slice();
    if (statusFilter) list = list.filter(o => o.status === statusFilter);
    if (search) {
        list = list.filter(o =>
            (o.code || '').toUpperCase().includes(search) ||
            (o.supplier_name || '').toUpperCase().includes(search) ||
            (o.projects?.name || '').toUpperCase().includes(search)
        );
    }

    countEl.textContent = `${list.length} ${list.length === 1 ? 'ordem encontrada' : 'ordens encontradas'}`;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="px-6 py-10 text-center text-sm text-gray-400">Nenhuma ordem de compra encontrada.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(o => {
        const items = o.purchase_order_items || [];
        const totalOrdered = items.reduce((s, i) => s + (i.quantity || 0), 0);
        const totalReceived = items.reduce((s, i) => s + (i.quantity_received || 0), 0);
        const itemsDone = items.filter(i => (i.quantity_received || 0) >= (i.quantity || 0)).length;
        const totalValue = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
        const canEdit = o.status === 'ABERTO';
        const canDelete = totalReceived === 0;

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <td class="px-5 py-3.5 text-sm font-bold text-primary whitespace-nowrap">${escapeHtml(o.code || '-')}</td>
                <td class="px-5 py-3.5 text-sm text-gray-700 dark:text-gray-200">${escapeHtml(o.supplier_name)}</td>
                <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">${o.projects?.name ? escapeHtml(o.projects.name) : '<span class="italic text-gray-400">Estoque geral</span>'}</td>
                <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">${formatDate(o.order_date)}</td>
                <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">${o.expected_date ? formatDate(o.expected_date) : '-'}</td>
                <td class="px-5 py-3.5 min-w-[140px]">
                    <div class="flex items-center gap-2">
                        <div class="flex-1">${receiptBarHtml(totalOrdered, totalReceived)}</div>
                        <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">${itemsDone}/${items.length}</span>
                    </div>
                </td>
                <td class="px-5 py-3.5 text-sm font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">${formatCurrency(totalValue)}</td>
                <td class="px-5 py-3.5">${statusBadge(o.status)}</td>
                <td class="px-5 py-3.5 text-right whitespace-nowrap">
                    <button onclick="openDetailModal('${o.id}')" class="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Ver detalhes">
                        <span class="material-symbols-outlined" style="font-size:18px">visibility</span>
                    </button>
                    <button onclick="exportOrderPDF('${o.id}')" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Gerar PDF">
                        <span class="material-symbols-outlined" style="font-size:18px">picture_as_pdf</span>
                    </button>
                    ${canEdit ? `
                    <button onclick="editOrder('${o.id}')" class="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors" title="Editar">
                        <span class="material-symbols-outlined" style="font-size:18px">edit</span>
                    </button>` : ''}
                    ${canDelete ? `
                    <button onclick="openDeleteModal('${o.id}')" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Excluir">
                        <span class="material-symbols-outlined" style="font-size:18px">delete</span>
                    </button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// ─── Order Modal (Create / Edit) ────────────────────────────────────────────

function openNewOrderModal() {
    editingOrderId = null;
    document.getElementById('order-modal-title').textContent = 'Nova Ordem de Compra';
    document.getElementById('order-form').reset();
    document.getElementById('editing-order-id').value = '';
    document.getElementById('order-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('order-items-container').innerHTML = '';
    addItemRow();
    updateTotalPreview();
    toggleProjectHint();
    document.getElementById('order-modal').classList.remove('hidden');
}

function closeOrderModal() {
    document.getElementById('order-modal').classList.add('hidden');
}

// Shown whenever a project is selected, so it's clear receipts on this order
// will auto-post to Itens do Projeto (see registerReceipt in conferencia_recebimento.js).
function toggleProjectHint() {
    const hasProject = !!document.getElementById('order-project').value;
    document.getElementById('order-project-hint').classList.toggle('hidden', !hasProject);
}

function addItemRow(item) {
    const template = document.getElementById('order-item-row-template');
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.order-item-row');

    if (item) {
        row.querySelector('[name="item_name"]').value = item.name || '';
        row.querySelector('[name="item_unit"]').value = item.unit || 'UN';
        row.querySelector('[name="item_qty"]').value = item.quantity ?? '';
        row.querySelector('[name="item_price"]').value = item.unit_price ?? '';
        if (item.id) row.dataset.itemId = item.id;
    }

    row.querySelector('.remove-item-btn').addEventListener('click', () => {
        row.remove();
        toggleRemoveButtons();
        updateTotalPreview();
    });
    row.querySelectorAll('[name="item_qty"], [name="item_price"]').forEach(el => {
        el.addEventListener('input', updateTotalPreview);
    });

    document.getElementById('order-items-container').appendChild(clone);
    toggleRemoveButtons();
}

function toggleRemoveButtons() {
    const rows = document.querySelectorAll('.order-item-row');
    rows.forEach(row => {
        const btn = row.querySelector('.remove-item-btn');
        btn.classList.toggle('hidden', rows.length <= 1);
    });
}

function updateTotalPreview() {
    let total = 0;
    document.querySelectorAll('.order-item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('[name="item_qty"]').value) || 0;
        const price = parseFloat(row.querySelector('[name="item_price"]').value) || 0;
        total += qty * price;
    });
    document.getElementById('order-total-preview').textContent = formatCurrency(total);
}

function collectItemRows() {
    return Array.from(document.querySelectorAll('.order-item-row')).map(row => ({
        id: row.dataset.itemId || null,
        name: row.querySelector('[name="item_name"]').value.trim(),
        unit: row.querySelector('[name="item_unit"]').value,
        quantity: parseFloat(row.querySelector('[name="item_qty"]').value) || 0,
        unit_price: parseFloat(row.querySelector('[name="item_price"]').value) || 0
    })).filter(i => i.name && i.quantity > 0);
}

function setupFormHandlers() {
    document.getElementById('order-add-item-btn').addEventListener('click', () => addItemRow());

    document.getElementById('order-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const items = collectItemRows();
        if (items.length === 0) {
            showToast('Adicione ao menos um item válido ao pedido.', 'error');
            return;
        }

        const orderData = {
            supplier_name: document.getElementById('order-supplier').value.trim(),
            project_id: document.getElementById('order-project').value || null,
            order_date: document.getElementById('order-date').value || new Date().toISOString().split('T')[0],
            expected_date: document.getElementById('order-expected-date').value || null,
            notes: document.getElementById('order-notes').value.trim() || null
        };
        if (!editingOrderId) orderData.created_by_name = currentUserName;

        const submitBtn = document.getElementById('order-submit-btn');
        submitBtn.disabled = true;

        try {
            if (editingOrderId) {
                await updatePurchaseOrder(editingOrderId, orderData);

                const existing = allOrders.find(o => o.id === editingOrderId);
                const existingIds = new Set((existing?.purchase_order_items || []).map(i => i.id));
                const keptIds = new Set(items.filter(i => i.id).map(i => i.id));

                for (const item of items) {
                    if (item.id) {
                        await updatePurchaseOrderItem(item.id, {
                            name: item.name, unit: item.unit, quantity: item.quantity, unit_price: item.unit_price
                        });
                    } else {
                        await createPurchaseOrderItem({ ...item, order_id: editingOrderId, id: undefined });
                    }
                }
                for (const oldId of existingIds) {
                    if (!keptIds.has(oldId)) await deletePurchaseOrderItem(oldId);
                }

                showToast('Ordem de compra atualizada com sucesso!', 'success');
            } else {
                const cleanItems = items.map(({ id, ...rest }) => rest);
                await createPurchaseOrder(orderData, cleanItems);
                showToast('Ordem de compra criada com sucesso!', 'success');
            }

            closeOrderModal();
            await refreshOrders();
        } catch (err) {
            console.error(err);
            showToast('Erro ao salvar ordem de compra: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
        }
    });

    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        if (!pendingDeleteId) return;
        try {
            await deletePurchaseOrder(pendingDeleteId);
            showToast('Ordem de compra excluída.', 'success');
            closeDeleteModal();
            await refreshOrders();
        } catch (err) {
            showToast('Erro ao excluir: ' + err.message, 'error');
        }
    });

    document.getElementById('detail-cancel-order-btn').addEventListener('click', async () => {
        const id = document.getElementById('detail-cancel-order-btn').dataset.orderId;
        if (!id) return;
        try {
            await updatePurchaseOrder(id, { status: 'CANCELADO' });
            showToast('Ordem de compra cancelada.', 'success');
            closeDetailModal();
            await refreshOrders();
        } catch (err) {
            showToast('Erro ao cancelar: ' + err.message, 'error');
        }
    });

    document.getElementById('detail-pdf-btn').addEventListener('click', () => {
        const id = document.getElementById('detail-pdf-btn').dataset.orderId;
        if (id) exportOrderPDF(id);
    });
}

// ─── PDF Export (individual order) ──────────────────────────────────────────

function exportOrderPDF(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('portrait');
        const items = order.purchase_order_items || [];

        doc.setFontSize(16);
        doc.setTextColor(30, 58, 138);
        doc.text('Ordem de Compra — Resitrat', 14, 18);

        doc.setFontSize(20);
        doc.setTextColor(20);
        doc.text(order.code || '-', 14, 28);

        doc.setFontSize(9);
        doc.setTextColor(100);
        const infoLines = [
            `Fornecedor: ${order.supplier_name || '-'}`,
            `Projeto: ${order.projects?.name || 'Estoque geral / sem projeto'}`,
            `Data do Pedido: ${formatDate(order.order_date)}    Previsão de Entrega: ${order.expected_date ? formatDate(order.expected_date) : '-'}`,
            `Status: ${order.status}`,
            order.created_by_name ? `Solicitado por: ${order.created_by_name}` : null
        ].filter(Boolean);
        let y = 36;
        infoLines.forEach(line => { doc.text(line, 14, y); y += 5; });

        if (order.notes) {
            doc.setFontSize(9);
            doc.setTextColor(120);
            const noteLines = doc.splitTextToSize(`Observações: ${order.notes}`, 180);
            doc.text(noteLines, 14, y + 2);
            y += 2 + noteLines.length * 5;
        }

        const totalOrdered = items.reduce((s, i) => s + (i.quantity || 0), 0);
        const totalReceived = items.reduce((s, i) => s + (i.quantity_received || 0), 0);
        const totalValue = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);

        doc.autoTable({
            startY: y + 6,
            head: [['Material', 'Unid.', 'Qtd. Pedida', 'Val. Unit.', 'Val. Total', 'Recebido', 'Pendente']],
            body: items.map(item => {
                const pending = Math.max(0, (item.quantity || 0) - (item.quantity_received || 0));
                return [
                    item.name,
                    item.unit,
                    item.quantity,
                    formatCurrency(item.unit_price),
                    formatCurrency((item.quantity || 0) * (item.unit_price || 0)),
                    `${item.quantity_received || 0} ${item.unit}`,
                    `${pending} ${item.unit}`
                ];
            }),
            theme: 'striped',
            headStyles: { fillColor: [30, 58, 138] },
            styles: { fontSize: 8.5 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            foot: [['', '', String(totalOrdered), '', formatCurrency(totalValue), String(totalReceived), '']],
            footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' }
        });

        const finalY = doc.lastAutoTable.finalY || y + 6;
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, finalY + 10);

        doc.save(`Ordem_Compra_${(order.code || 'pedido').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`);
        showToast('PDF gerado com sucesso!', 'success');
    } catch (e) {
        console.error('PDF Export Error:', e);
        showToast('Erro ao gerar PDF: ' + e.message, 'error');
    }
}

function editOrder(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;

    editingOrderId = id;
    document.getElementById('order-modal-title').textContent = `Editar Ordem ${order.code || ''}`;
    document.getElementById('editing-order-id').value = id;
    document.getElementById('order-supplier').value = order.supplier_name || '';
    document.getElementById('order-project').value = order.project_id || '';
    document.getElementById('order-date').value = order.order_date || '';
    document.getElementById('order-expected-date').value = order.expected_date || '';
    document.getElementById('order-notes').value = order.notes || '';

    document.getElementById('order-items-container').innerHTML = '';
    (order.purchase_order_items || []).forEach(item => addItemRow(item));
    if ((order.purchase_order_items || []).length === 0) addItemRow();
    updateTotalPreview();
    toggleProjectHint();

    document.getElementById('order-modal').classList.remove('hidden');
}

// ─── Detail Modal ────────────────────────────────────────────────────────────

function openDetailModal(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;

    document.getElementById('detail-code').textContent = order.code || '';
    document.getElementById('detail-supplier').textContent = order.supplier_name || '';
    const metaParts = [
        order.projects?.name ? `Projeto: ${order.projects.name}` : 'Estoque geral',
        `Pedido em ${formatDate(order.order_date)}`,
        order.expected_date ? `Previsão: ${formatDate(order.expected_date)}` : null
    ].filter(Boolean);
    document.getElementById('detail-meta').textContent = metaParts.join(' · ');

    const notesWrapper = document.getElementById('detail-notes-wrapper');
    if (order.notes) {
        notesWrapper.textContent = order.notes;
        notesWrapper.classList.remove('hidden');
    } else {
        notesWrapper.classList.add('hidden');
    }

    const items = order.purchase_order_items || [];
    document.getElementById('detail-items-list').innerHTML = items.map(item => {
        const pending = Math.max(0, (item.quantity || 0) - (item.quantity_received || 0));
        return `
            <div class="p-3.5 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div class="flex items-center justify-between gap-3 mb-2">
                    <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">${escapeHtml(item.name)}</p>
                    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">${formatCurrency((item.quantity || 0) * (item.unit_price || 0))}</span>
                </div>
                ${receiptBarHtml(item.quantity, item.quantity_received)}
                <div class="flex items-center justify-between mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>Pedido: <strong class="text-gray-700 dark:text-gray-200">${item.quantity} ${escapeHtml(item.unit)}</strong></span>
                    <span>Recebido: <strong class="text-emerald-600">${item.quantity_received || 0} ${escapeHtml(item.unit)}</strong></span>
                    <span>Pendente: <strong class="${pending > 0 ? 'text-amber-600' : 'text-gray-400'}">${pending} ${escapeHtml(item.unit)}</strong></span>
                </div>
            </div>
        `;
    }).join('');

    const cancelBtn = document.getElementById('detail-cancel-order-btn');
    cancelBtn.dataset.orderId = order.id;
    cancelBtn.classList.toggle('hidden', order.status === 'CANCELADO' || order.status === 'RECEBIDO');

    document.getElementById('detail-pdf-btn').dataset.orderId = order.id;

    document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.add('hidden');
}

// ─── Delete Modal ────────────────────────────────────────────────────────────

function openDeleteModal(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    pendingDeleteId = id;
    document.getElementById('delete-modal-desc').innerHTML =
        `Tem certeza que deseja excluir a ordem <strong>${escapeHtml(order.code || '')}</strong> (${escapeHtml(order.supplier_name)})? Todos os itens serão removidos.`;
    document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
    pendingDeleteId = null;
    document.getElementById('delete-modal').classList.add('hidden');
}
