let allOrders = [];
let currentReceiptOrder = null;
let currentUserName = 'Usuário';

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') await checkSession();
    await loadCurrentUserName();
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

function formatDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Data Loading ────────────────────────────────────────────────────────────

async function refreshOrders() {
    allOrders = await fetchPurchaseOrders();
    renderKpis();
    renderOrders();
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

function renderKpis() {
    const container = document.getElementById('kpi-cards');
    if (!container) return;

    const pendingOrders = allOrders.filter(o => o.status === 'ABERTO' || o.status === 'PARCIAL');
    const itemsAwaiting = pendingOrders.reduce((sum, o) =>
        sum + (o.purchase_order_items || []).filter(i => (i.quantity_received || 0) < (i.quantity || 0)).length, 0);

    let valorPendente = 0;
    pendingOrders.forEach(o => {
        (o.purchase_order_items || []).forEach(item => {
            const pending = Math.max(0, (item.quantity || 0) - (item.quantity_received || 0));
            valorPendente += pending * (item.unit_price || 0);
        });
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const recebidasMes = allOrders.filter(o => o.status === 'RECEBIDO').length;

    const cards = [
        { label: 'Ordens Aguardando Recebimento', value: pendingOrders.length, icon: 'local_shipping', gradient: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)' },
        { label: 'Itens Pendentes', value: itemsAwaiting, icon: 'inventory_2', gradient: 'linear-gradient(135deg,#92400e 0%,#d97706 100%)' },
        { label: 'Valor Pendente', value: formatCurrency(valorPendente), icon: 'payments', gradient: 'linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)' },
        { label: 'Ordens Totalmente Recebidas', value: recebidasMes, icon: 'task_alt', gradient: 'linear-gradient(135deg,#14532d 0%,#16a34a 100%)' }
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

// ─── Receiving Thermometer (signature visual, shared with Ordem de Compra) ──

function receiptBarHtml(ordered, received) {
    const pct = ordered > 0 ? Math.min(100, (received / ordered) * 100) : 0;
    const color = pct >= 100 ? '#16a34a' : pct > 0 ? '#d97706' : '#9ca3af';
    return `
        <div class="receipt-bar">
            <div class="receipt-bar-fill" style="width:${pct}%; background:${color}"></div>
        </div>
    `;
}

// Compact "name — unit price" list for the orders table, so the item and its
// unit value are visible without opening the conference modal.
const ITEMS_CELL_VISIBLE = 2;

function itemsCellHtml(items) {
    if (!items || items.length === 0) return '<span class="italic text-gray-400">Sem itens</span>';

    const visible = items.slice(0, ITEMS_CELL_VISIBLE).map(i => `
        <div class="truncate">
            <span class="text-gray-700 dark:text-gray-200">${escapeHtml(i.name)}</span>
            <span class="text-gray-400"> — ${formatCurrency(i.unit_price)}/${escapeHtml(i.unit)}</span>
        </div>
    `).join('');

    const remaining = items.length - ITEMS_CELL_VISIBLE;
    const more = remaining > 0 ? `<div class="text-gray-400">+${remaining} ${remaining === 1 ? 'item' : 'itens'}</div>` : '';

    return `<div class="text-xs space-y-0.5 max-w-[220px]">${visible}${more}</div>`;
}

function statusBadge(status) {
    const map = {
        ABERTO: { label: 'Em Aberto', cls: 'bg-blue-50 text-primary border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' },
        PARCIAL: { label: 'Parcial', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' },
        RECEBIDO: { label: 'Recebido', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' },
        CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' }
    };
    const s = map[status] || map.ABERTO;
    return `<span class="inline-block whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-bold border ${s.cls}">${s.label}</span>`;
}

// ─── Orders Table ────────────────────────────────────────────────────────────

function renderOrders() {
    const tbody = document.getElementById('orders-table-body');
    const countEl = document.getElementById('orders-count');
    if (!tbody) return;

    const statusFilter = document.getElementById('filter-status').value;
    const search = (document.getElementById('search-orders').value || '').trim().toUpperCase();

    let list = allOrders.slice();
    if (statusFilter === 'pending') {
        list = list.filter(o => o.status === 'ABERTO' || o.status === 'PARCIAL');
    } else if (statusFilter) {
        list = list.filter(o => o.status === statusFilter);
    }
    if (search) {
        list = list.filter(o =>
            (o.code || '').toUpperCase().includes(search) ||
            (o.supplier_name || '').toUpperCase().includes(search) ||
            (o.projects?.name || '').toUpperCase().includes(search)
        );
    }

    list.sort((a, b) => {
        const da = a.expected_date || '9999-12-31';
        const db = b.expected_date || '9999-12-31';
        return da.localeCompare(db);
    });

    countEl.textContent = `${list.length} ${list.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}`;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-10 text-center text-sm text-gray-400">Nenhum pedido encontrado para este filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(o => {
        const items = o.purchase_order_items || [];
        const totalOrdered = items.reduce((s, i) => s + (i.quantity || 0), 0);
        const totalReceived = items.reduce((s, i) => s + (i.quantity_received || 0), 0);
        const itemsDone = items.filter(i => (i.quantity_received || 0) >= (i.quantity || 0)).length;
        const isOverdue = o.expected_date && o.expected_date < new Date().toISOString().split('T')[0] &&
            (o.status === 'ABERTO' || o.status === 'PARCIAL');
        const canReceive = o.status === 'ABERTO' || o.status === 'PARCIAL';

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <td class="px-5 py-3.5 text-sm font-bold text-primary whitespace-nowrap">${escapeHtml(o.code || '-')}</td>
                <td class="px-5 py-3.5 text-sm text-gray-700 dark:text-gray-200">${escapeHtml(o.supplier_name)}</td>
                <td class="px-5 py-3.5">${itemsCellHtml(items)}</td>
                <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">${o.projects?.name ? escapeHtml(o.projects.name) : '<span class="italic text-gray-400">Estoque geral</span>'}</td>
                <td class="px-5 py-3.5 text-sm whitespace-nowrap ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500 dark:text-gray-400'}">
                    ${o.expected_date ? formatDate(o.expected_date) : '-'}
                    ${isOverdue ? '<span class="material-symbols-outlined align-middle ml-1" style="font-size:14px">warning</span>' : ''}
                </td>
                <td class="px-5 py-3.5 min-w-[140px]">
                    <div class="flex items-center gap-2">
                        <div class="flex-1">${receiptBarHtml(totalOrdered, totalReceived)}</div>
                        <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">${itemsDone}/${items.length}</span>
                    </div>
                </td>
                <td class="px-5 py-3.5 whitespace-nowrap">${statusBadge(o.status)}</td>
                <td class="px-5 py-3.5 text-right whitespace-nowrap">
                    ${canReceive ? `
                    <button onclick="openReceiptModal('${o.id}')" class="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-blue-700 transition-colors shadow-sm ml-auto">
                        <span class="material-symbols-outlined" style="font-size:15px">fact_check</span>
                        Conferir
                    </button>` : `
                    <button onclick="openReceiptModal('${o.id}')" class="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Ver histórico">
                        <span class="material-symbols-outlined" style="font-size:18px">visibility</span>
                    </button>`}
                </td>
            </tr>
        `;
    }).join('');
}

// ─── Receipt Conference Modal ────────────────────────────────────────────────

async function openReceiptModal(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;
    currentReceiptOrder = order;

    document.getElementById('rm-code').textContent = order.code || '';
    document.getElementById('rm-supplier').textContent = order.supplier_name || '';
    const metaParts = [
        order.projects?.name ? `Projeto: ${order.projects.name}` : 'Estoque geral',
        `Pedido em ${formatDate(order.order_date)}`,
        order.expected_date ? `Previsão: ${formatDate(order.expected_date)}` : null
    ].filter(Boolean);
    document.getElementById('rm-meta').textContent = metaParts.join(' · ');

    const projectHint = document.getElementById('rm-project-hint');
    if (order.project_id) {
        projectHint.innerHTML = `<span class="material-symbols-outlined flex-shrink-0" style="font-size:15px">sync_alt</span><span>Cada recebimento confirmado aqui será lançado automaticamente em <strong>Itens do Projeto</strong> (${escapeHtml(order.projects?.name || 'projeto vinculado')}).</span>`;
        projectHint.classList.remove('hidden');
    } else {
        projectHint.classList.add('hidden');
    }

    renderReceiptItems(order);
    await renderReceiptHistory(order);

    document.getElementById('receipt-modal').classList.remove('hidden');
}

function closeReceiptModal() {
    document.getElementById('receipt-modal').classList.add('hidden');
    currentReceiptOrder = null;
}

function renderReceiptItems(order) {
    const container = document.getElementById('rm-items-list');
    const template = document.getElementById('rm-item-template');
    const canReceive = order.status === 'ABERTO' || order.status === 'PARCIAL';
    container.innerHTML = '';

    (order.purchase_order_items || []).forEach(item => {
        const clone = template.content.cloneNode(true);
        const root = clone.querySelector('.rm-item');
        const pending = Math.max(0, (item.quantity || 0) - (item.quantity_received || 0));

        root.dataset.itemId = item.id;
        root.querySelector('.rm-item-name').textContent = item.name;
        root.querySelector('.rm-item-ordered').textContent = `${item.quantity} ${item.unit}`;
        root.querySelector('.rm-item-unit-price').textContent = `${formatCurrency(item.unit_price)}/${item.unit}`;
        root.querySelector('.rm-item-received').textContent = `${item.quantity_received || 0} ${item.unit}`;

        const badge = root.querySelector('.rm-item-pending-badge');
        if (pending > 0) {
            badge.textContent = `Pendente: ${pending} ${item.unit}`;
            badge.className = 'rm-item-pending-badge text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400';
        } else {
            badge.textContent = 'Completo';
            badge.className = 'rm-item-pending-badge text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400';
        }

        const barFill = root.querySelector('.receipt-bar-fill');
        const pct = item.quantity > 0 ? Math.min(100, ((item.quantity_received || 0) / item.quantity) * 100) : 0;
        barFill.style.width = pct + '%';
        barFill.style.background = pct >= 100 ? '#16a34a' : pct > 0 ? '#d97706' : '#9ca3af';

        const qtyInput = root.querySelector('.rm-item-qty-input');
        const notesInput = root.querySelector('.rm-item-notes-input');
        const registerBtn = root.querySelector('.rm-item-register-btn');

        if (!canReceive || pending <= 0) {
            qtyInput.disabled = true;
            notesInput.disabled = true;
            registerBtn.disabled = true;
            registerBtn.classList.add('opacity-40', 'cursor-not-allowed');
        } else {
            qtyInput.max = pending;
            qtyInput.placeholder = `Máx: ${pending}`;
            registerBtn.addEventListener('click', () => registerReceipt(item.id, item, qtyInput, notesInput));
        }

        container.appendChild(clone);
    });
}

async function registerReceipt(itemId, item, qtyInput, notesInput) {
    const qty = parseFloat(qtyInput.value);
    const pending = Math.max(0, (item.quantity || 0) - (item.quantity_received || 0));

    if (!qty || qty <= 0) {
        showToast('Informe uma quantidade válida para receber.', 'error');
        return;
    }
    if (qty > pending) {
        showToast(`Quantidade maior que o pendente (${pending} ${item.unit}).`, 'error');
        return;
    }

    try {
        const notes = notesInput.value.trim() || null;
        await createPurchaseOrderReceipt({
            order_item_id: itemId,
            quantity: qty,
            received_by: currentUserName,
            notes: notes
        });

        let toastMsg = `Recebimento de ${qty} ${item.unit} registrado para "${item.name}".`;

        // Orders tied to a project auto-post each confirmed receipt to Itens do
        // Projeto — the material physically arrived for that project, so it's
        // already an "output" to it, same as the Industrialização route in
        // requisicao_estoque.js.
        if (currentReceiptOrder?.project_id) {
            try {
                await createProjectItem({
                    project_id: currentReceiptOrder.project_id,
                    name: item.name,
                    quantity: qty,
                    unit: item.unit,
                    value: item.unit_price || 0,
                    category: 'Ordem de Compra',
                    nota_fiscal: notes
                });
                toastMsg += ` Lançado em Itens do Projeto (${currentReceiptOrder.projects?.name || 'projeto vinculado'}).`;
            } catch (projErr) {
                console.error('Error posting receipt to project items:', projErr);
                showToast('Recebimento registrado, mas houve um erro ao lançar em Itens do Projeto: ' + projErr.message, 'warning');
            }
        }

        showToast(toastMsg, 'success');

        await refreshOrders();
        const updatedOrder = allOrders.find(o => o.id === currentReceiptOrder.id);
        if (updatedOrder) {
            currentReceiptOrder = updatedOrder;
            renderReceiptItems(updatedOrder);
            await renderReceiptHistory(updatedOrder);
        }
    } catch (err) {
        console.error(err);
        showToast('Erro ao registrar recebimento: ' + err.message, 'error');
    }
}

// ─── Receiving History (with running "restante pendente") ──────────────────

async function renderReceiptHistory(order) {
    const tbody = document.getElementById('rm-history-body');
    const items = order.purchase_order_items || [];
    const itemIds = items.map(i => i.id);
    const receipts = await fetchPurchaseOrderReceipts(itemIds);

    if (receipts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-3 py-6 text-center text-gray-400">Nenhum recebimento registrado ainda.</td></tr>`;
        return;
    }

    const itemById = {};
    items.forEach(i => { itemById[i.id] = i; });

    // Running total per item, oldest first, so "restante pendente" reflects
    // the balance immediately after each event — not just the final state.
    const chronological = receipts.slice().sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
    const runningReceived = {};
    const rows = chronological.map(r => {
        const item = itemById[r.order_item_id];
        if (!item) return null;
        runningReceived[r.order_item_id] = (runningReceived[r.order_item_id] || 0) + Number(r.quantity);
        const remaining = Math.max(0, (item.quantity || 0) - runningReceived[r.order_item_id]);
        return { ...r, itemName: item.name, unit: item.unit, remainingAfter: remaining };
    }).filter(Boolean);

    // Display newest first.
    rows.reverse();

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td class="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">${formatDateTime(r.received_at)}</td>
            <td class="px-3 py-2 font-medium text-gray-700 dark:text-gray-200">${escapeHtml(r.itemName)}</td>
            <td class="px-3 py-2 text-emerald-600 font-semibold whitespace-nowrap">+${r.quantity} ${escapeHtml(r.unit)}</td>
            <td class="px-3 py-2 whitespace-nowrap">
                <span class="font-semibold ${r.remainingAfter > 0 ? 'text-amber-600' : 'text-gray-400'}">${r.remainingAfter} ${escapeHtml(r.unit)}</span>
            </td>
            <td class="px-3 py-2 text-gray-500 dark:text-gray-400">${escapeHtml(r.received_by || '-')}</td>
            <td class="px-3 py-2 text-gray-500 dark:text-gray-400">${escapeHtml(r.notes || '-')}</td>
        </tr>
    `).join('');
}
