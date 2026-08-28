// _supabase is already initialized in supabaseClient.js
if (typeof _supabase === 'undefined') {
    console.error('_supabase is undefined. Check supabaseClient.js load order.');
}

// PostgREST caps every response at the project's "Max rows" setting (Supabase
// default: 1000). Any unfiltered .select() on a table past that size silently
// returns only a partial page with no error. Helpers that must return a whole
// table page through it with .range() in chunks of this size.
const PGRST_PAGE_SIZE = 1000;

// --- GLOBAL UPPERCASE STANDARDIZATION ---
document.addEventListener('input', (e) => {
    // Apply to text inputs and textareas
    if (e.target.matches('input[type="text"], textarea')) {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;

        // Convert to Uppercase
        e.target.value = e.target.value.toUpperCase();

        // Restore cursor position
        e.target.setSelectionRange(start, end);
    }
});

// Inject CSS for Visual Uppercase as well
const style = document.createElement('style');
style.innerHTML = `
    input[type="text"], textarea {
        text-transform: uppercase;
    }
`;
document.head.appendChild(style);
// ----------------------------------------
// Helper for Brazilian Date Format
function formatDate(dateString) {
    if (!dateString) return '-';
    // Safe string manipulation to avoid timezone issues with Date object
    if (dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
    return dateString;
}

// Ensure formatDate is globally available if this script is treated as a module,
// though here it's likely loaded as a standard script.
window.formatDate = formatDate;

// Escapes free-text values before they are interpolated into innerHTML.
// Every table/name/observation field in this app is user-entered, so any of
// them can carry a stored XSS payload (e.g. a project or client "name" of
// `<img src=x onerror=...>`) that runs in the browser of whoever views the
// record next — including admins. Wrap any such value with this before
// putting it in a template string that gets assigned to innerHTML.
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// ... (rest of the API functions)


async function fetchProjects() {
    try {
        const { data, error } = await _supabase
            .from('projects')
            .select(`
                *,
                lead:lead_id (name, avatar_url)
            `);
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching projects:', error.message);
        return [];
    }
}

async function fetchProjectSummaries() {
    try {
        const { data, error } = await _supabase
            .from('project_summaries')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching project summaries:', error.message);
        return [];
    }
}

// Same as fetchProjectSummaries() but filters by status server-side via .in()
// instead of pulling every row and filtering client-side — used by pages that
// only ever display a known subset of statuses (e.g. gestao_avista.js).
async function fetchProjectSummariesByStatus(statuses) {
    try {
        const { data, error } = await _supabase
            .from('project_summaries')
            .select('*')
            .in('status', statuses)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching project summaries by status:', error.message);
        return [];
    }
}

async function fetchTasks() {
    try {
        const { data, error } = await _supabase
            .from('tasks')
            .select(`
                *,
                asignee:assigned_to (name, avatar_url)
            `);
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching tasks:', error.message);
        return [];
    }
}

// Same as fetchTasks() but scoped to a set of project ids via .in() so callers
// that already know which projects they care about (e.g. gestao_avista.js)
// don't pull the entire tasks table across the wire.
async function fetchTasksByProjectIds(projectIds) {
    if (!projectIds || projectIds.length === 0) return [];
    try {
        const { data, error } = await _supabase
            .from('tasks')
            .select(`
                *,
                asignee:assigned_to (name, avatar_url)
            `)
            .in('project_id', projectIds);
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching tasks by project ids:', error.message);
        return [];
    }
}

async function fetchMembers() {
    try {
        const { data, error } = await _supabase
            .from('users')
            .select('*');
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching members:', error.message);
        return [];
    }
}

async function fetchActivityLog() {
    try {
        const { data, error } = await _supabase
            .from('activity_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching activity log:', error.message);
        return [];
    }
}

async function fetchDashboardStats() {
    // This is a simplified example. In production, use Supabase .count() or RPCs for efficiency.
    const projects = await fetchProjects();
    const tasks = await fetchTasks();

    // Calculate stats
    const activeProjects = projects.filter(p => p.status === 'In Progress').length;
    const tasksDueToday = tasks.filter(t => t.due_date === new Date().toISOString().split('T')[0]).length; // naive check
    const overdueTasks = tasks.filter(t => t.due_date < new Date().toISOString().split('T')[0] && t.status !== 'Done').length;

    return {
        activeProjects,
        tasksDueToday,
        overdueTasks
    };
}

// CRUD Operations

// Projects
async function createProject(projectData) {
    const { data, error } = await _supabase.from('projects').insert([projectData]);
    if (error) throw error;
    return data;
}

async function updateProject(id, updates) {
    const { data, error } = await _supabase.from('projects').update(updates).eq('id', id);
    if (error) throw error;
    return data;
}

async function deleteProject(id) {
    const { error } = await _supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
}

// Tasks
async function createTask(taskData) {
    const { data, error } = await _supabase.from('tasks').insert([taskData]);
    if (error) throw error;
    return data;
}

async function updateTask(id, updates) {
    const { data, error } = await _supabase.from('tasks').update(updates).eq('id', id);
    if (error) throw error;
    return data;
}

async function deleteTask(id) {
    const { error } = await _supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
}

// Members
async function addMember(memberData) {
    const { data, error } = await _supabase.from('users').insert([memberData]);
    if (error) throw error;
    return data;
}

async function updateMember(id, updates) {
    const { data, error } = await _supabase.from('users').update(updates).eq('id', id);
    if (error) throw error;
    return data;
}

async function deleteMember(id) {
    const { error } = await _supabase.from('users').delete().eq('id', id);
    if (error) throw error;
}

// Custom RPC calls
async function adminUpdateUserAuth(userId, newEmail, newPassword) {
    const { data, error } = await _supabase.rpc('admin_update_user_auth', {
        target_user_id: userId,
        new_email: newEmail,
        new_password: newPassword
    });
    if (error) throw error;
    return data;
}

// Every account in auth.users (not just the ones with a public.users profile
// row) — admin-only RPC, see list_auth_accounts migration. Used by
// cadastro_usuario.js to surface accounts that exist in Supabase Auth but
// never got a profile (silently treated as operators otherwise).
async function fetchAuthAccounts() {
    const { data, error } = await _supabase.rpc('list_auth_accounts');
    if (error) throw error;
    return data;
}

// Project Items
async function fetchProjectItems(projectId) {
    try {
        const { data, error } = await _supabase
            .from('project_items')
            .select('*')
            .eq('project_id', projectId);
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching project items:', error.message);
        return [];
    }
}

async function createProjectItem(itemData) {
    const { data, error } = await _supabase.from('project_items').insert([itemData]);
    if (error) throw error;
    return data;
}

async function updateProjectItem(id, updates) {
    const { data, error } = await _supabase.from('project_items').update(updates).eq('id', id);
    if (error) throw error;
    return data;
}

async function updateProjectItemsInvoice(projectId, newNf, oldNf) {
    let query = _supabase.from('project_items')
        .update({ nota_fiscal: newNf })
        .eq('project_id', projectId);
        
    if (oldNf && oldNf !== 'null') {
        query = query.eq('nota_fiscal', oldNf);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    } else {
        // Se era um item sem nota, atualiza os outros itens sem nota (null ou vazio)
        const { error: err1 } = await _supabase.from('project_items')
            .update({ nota_fiscal: newNf })
            .eq('project_id', projectId)
            .is('nota_fiscal', null);
            
        const { error: err2 } = await _supabase.from('project_items')
            .update({ nota_fiscal: newNf })
            .eq('project_id', projectId)
            .eq('nota_fiscal', '');
            
        if (err1) throw err1;
        if (err2) throw err2;
        return true;
    }
}

async function deleteProjectItem(id) {
    const { error } = await _supabase.from('project_items').delete().eq('id', id);
    if (error) throw error;
}

// Project Forecast Items (Previsão)
async function fetchProjectForecastItems(projectId) {
    try {
        const { data, error } = await _supabase
            .from('project_forecast_items')
            .select('*')
            .eq('project_id', projectId);
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching project forecast items:', error.message);
        return [];
    }
}

async function createProjectForecastItem(itemData) {
    const { data, error } = await _supabase.from('project_forecast_items').insert([itemData]);
    if (error) throw error;
    return data;
}

async function updateProjectForecastItem(id, updates) {
    const { data, error } = await _supabase.from('project_forecast_items').update(updates).eq('id', id);
    if (error) throw error;
    return data;
}

async function deleteProjectForecastItem(id) {
    const { error } = await _supabase.from('project_forecast_items').delete().eq('id', id);
    if (error) throw error;
}

// Stock Items
async function fetchStockItems() {
    // Same PostgREST "Max rows" cap as fetchStockExits(): stock_items is at ~780
    // rows and climbing, so page through with .range() before a plain .select()
    // starts silently dropping the newest items once it crosses 1000.
    try {
        const all = [];
        for (let from = 0; ; from += PGRST_PAGE_SIZE) {
            const { data, error } = await _supabase
                .from('stock_items')
                .select('*')
                .order('id', { ascending: true })
                .range(from, from + PGRST_PAGE_SIZE - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            all.push(...data);
            if (data.length < PGRST_PAGE_SIZE) break;
        }
        return all;
    } catch (error) {
        console.error('Error fetching stock items:', error.message);
        return [];
    }
}

async function createStockItem(itemData) {
    const { data, error } = await _supabase.from('stock_items').insert([itemData]).select();
    if (error) throw error;
    return data;
}

async function updateStockItem(id, updates) {
    const { data, error } = await _supabase.from('stock_items').update(updates).eq('id', id);
    if (error) throw error;
    return data;
}

async function deleteStockItem(id) {
    console.log('API: deleteStockItem called with ID:', id);
    const { data, error, count } = await _supabase
        .from('stock_items')
        .delete({ count: 'exact' }) // Request count of deleted rows
        .eq('id', id)
        .select(); // Ensure we get a response to verify

    if (error) {
        console.error('API: Error deleting item:', error);
        throw error;
    }
    console.log('API: Delete successful. Rows deleted:', count, 'Data:', data);

    // If 0 rows deleted, it might be an ID mismatch, but not an SQL error
    if (count === 0 && (!data || data.length === 0)) {
        console.warn('API: Warning - No rows were deleted. Check ID match.');
    }
}

// Lógica para concluir automaticamente (ou reabrir) um projeto com base em suas tarefas
async function checkProjectCompletion(projectId) {
    try {
        // Busca todas as tarefas do projeto
        const { data: tasks, error } = await _supabase
            .from('tasks')
            .select('status')
            .eq('project_id', projectId);

        if (error) throw error;

        if (!tasks || tasks.length === 0) return false;

        // Verifica se há alguma tarefa que NÃO esteja 'Done' (ou 'Concluída')
        const remaining = tasks.filter(t => t.status !== 'Done' && t.status !== 'Concluída').length;

        if (remaining === 0) {
            // Todas as tarefas concluídas. Marca o projeto como Completed.
            const today = new Date().toISOString();
            await updateProject(projectId, {
                status: 'Completed',
                completed_at: today
            });
            return true;
        }

        // Nem todas as tarefas estão concluídas: se o projeto já havia sido
        // concluído automaticamente, reabre-o para que pare de aparecer em
        // Concluídos (ex.: uma nova tarefa foi adicionada a um projeto já finalizado).
        const { data: project, error: projectError } = await _supabase
            .from('projects')
            .select('status')
            .eq('id', projectId)
            .single();

        if (!projectError && project && (project.status === 'Completed' || project.status === 'Concluído')) {
            await updateProject(projectId, {
                status: 'In Progress',
                completed_at: null
            });
        }

        return false;
    } catch (e) {
        console.error("Error checking project completion:", e);
        return false;
    }
}

// Ensure Stock Item (Catalogue Update Only)
async function ensureStockItem(name, unitValue, qty, unit = 'UN') {
    // NOTE: quantityUsed is ignored for stock balance, but we might use it 
    // to initialize if desired. For now, we follow "No Stock Balance" logic 
    // where we only keep the item as a catalogue entry.

    // 1. Check if item exists (Case insensitive / Upercase handled by global input now, but force here too)
    const safeName = name.toUpperCase().trim();
    console.log(`Ensuring Stock Item: ${safeName}, Unit: ${unit}, Value: ${unitValue}`);

    try {
        const { data: existingItems, error: searchError } = await _supabase
            .from('stock_items')
            .select('*')
            .eq('name', safeName); // Match exact uppercase name

        if (searchError) throw searchError;

        if (existingItems && existingItems.length > 0) {
            const item = existingItems[0];
            // 2. Update existing item's VALUE and UNIT (Catalogue)
            // We DO NOT change quantity here anymore.

            // Only update if value or unit changed
            if (item.value !== unitValue || item.unit !== unit) {
                await updateStockItem(item.id, {
                    value: unitValue,
                    unit: unit
                });
            }

            return item.id;
        } else {
            // 3. Create new item (Catalogue Entry)
            const newItem = {
                name: safeName,
                quantity: 0, // Ignored logic, start at 0
                value: unitValue,
                unit: unit // Use provided unit
            };

            const created = await createStockItem(newItem);
            if (!created || created.length === 0) throw new Error("Falha ao criar novo item.");

            return created[0].id;
        }
    } catch (error) {
        console.error("Error ensuring stock item:", error);
        throw error;
    }
}

// Stock Exit Logic - Direct Insert for Cost Control
async function processStockExit(itemId, quantity, reason, projectId, obs, clientId) {
    console.log('Processing Stock Exit:', { itemId, quantity, reason });
    try {
        // Fetch current item value to freeze it in history
        const { data: items } = await _supabase.from('stock_items').select('value').eq('id', itemId);
        const unitPrice = items && items[0] ? items[0].value : 0;

        // Direct Insert instead of RPC to support unit_price and skip stock balance deduction
        const { data, error } = await _supabase
            .from('stock_exits')
            .insert([{
                item_id: itemId,
                quantity: quantity,
                reason: reason,
                project_id: projectId || null,
                observation: obs || null,
                client_id: clientId || null,
                unit_price: unitPrice // IMPORTANT: Requires 'unit_price' column in DB
            }])
            .select();

        if (error) throw error;

        // Supabase/PostgREST gotcha: if the INSERT succeeds but the table's
        // SELECT RLS policy is more restrictive than its INSERT policy, the
        // row is committed to the DB but .select() comes back empty with no
        // `error` set — this function would otherwise report success while
        // the exit stays invisible to Saída de Estoque / Custo por Cliente.
        if (!data || data.length === 0) {
            throw new Error('A saída pode ter sido gravada, mas não foi possível confirmá-la (retorno vazio). Verifique a política de RLS (SELECT) da tabela stock_exits no Supabase.');
        }

        return data;
    } catch (error) {
        console.error('Error processing stock exit:', error);
        throw error;
    }
}


// stock_exits passed 1000 rows on 2026-08-07, so a plain .select() (capped at
// PGRST_PAGE_SIZE, see top of file) silently returned only the oldest 1000 —
// every newer exit vanished from Saída de Estoque and Custo por Cliente with no
// error. Page through the whole table with .range() (newest first) until a
// short page comes back.
async function fetchStockExits() {
    try {
        const all = [];
        for (let from = 0; ; from += PGRST_PAGE_SIZE) {
            const { data, error } = await _supabase
                .from('stock_exits')
                .select(`
                    *,
                    stock_items (name, value, unit, category),
                    clients (name)
                `)
                .order('created_at', { ascending: false })
                .range(from, from + PGRST_PAGE_SIZE - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            all.push(...data);
            if (data.length < PGRST_PAGE_SIZE) break;
        }
        return all;
    } catch (error) {
        console.error('Error fetching stock exits:', error.message);
        alert('Erro ao buscar saídas de estoque: ' + error.message);
        return [];
    }
}

// Same as fetchStockExits() but scoped to a [startISO, endISO) created_at
// range via .gte()/.lt() — used by callers that only ever need a bounded
// window (e.g. gestao_avista.js's "current month" cost slide) so Postgres
// filters the rows instead of shipping the entire, ever-growing stock_exits
// history down the wire on every load.
async function fetchStockExitsForDateRange(startISO, endISO) {
    try {
        const all = [];
        for (let from = 0; ; from += PGRST_PAGE_SIZE) {
            const { data, error } = await _supabase
                .from('stock_exits')
                .select(`
                    *,
                    stock_items (name, value, unit, category),
                    clients (name)
                `)
                .gte('created_at', startISO)
                .lt('created_at', endISO)
                .order('created_at', { ascending: false })
                .range(from, from + PGRST_PAGE_SIZE - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            all.push(...data);
            if (data.length < PGRST_PAGE_SIZE) break;
        }
        return all;
    } catch (error) {
        console.error('Error fetching stock exits for date range:', error.message);
        return [];
    }
}


async function updateStockExit(id, updates) {
    const { data, error } = await _supabase.from('stock_exits').update(updates).eq('id', id);
    if (error) throw error;
    return data;
}

async function deleteStockExit(id) {
    const { error } = await _supabase.from('stock_exits').delete().eq('id', id);
    if (error) throw error;
}

// Client Management
async function fetchClients() {
    try {
        const { data, error } = await _supabase
            .from('clients')
            .select('*')
            .order('name');
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching clients:', error.message);
        alert('Erro ao buscar clientes: ' + error.message);
        return [];
    }
}

async function createClient(clientData) {
    const { data, error } = await _supabase.from('clients').insert([clientData]);
    if (error) throw error;
    return data;
}

async function updateClient(id, updates) {
    const { data, error } = await _supabase.from('clients').update(updates).eq('id', id);
    if (error) throw error;
    return data;
}

async function deleteClient(id) {
    const { error } = await _supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
}

// --- Stock Requests CRUD Operations ---
async function fetchStockRequests() {
    try {
        const { data, error } = await _supabase
            .from('stock_requests')
            .select(`
                *,
                projects (name),
                clients (name)
            `)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching stock requests:', error.message);
        return [];
    }
}

async function createStockRequest(requestData) {
    const insertData = Array.isArray(requestData) ? requestData : [requestData];
    const { data, error } = await _supabase.from('stock_requests').insert(insertData).select();
    if (error) throw error;
    return data;
}

async function updateStockRequest(id, updates) {
    const { data, error } = await _supabase.from('stock_requests').update(updates).eq('id', id).select();
    if (error) throw error;
    return data;
}

async function deleteStockRequest(id) {
    const { error } = await _supabase.from('stock_requests').delete().eq('id', id);
    if (error) throw error;
}

// --- Purchase Orders (Ordem de Compra / Conferência de Recebimento) ---

async function fetchPurchaseOrders() {
    try {
        const { data, error } = await _supabase
            .from('purchase_orders')
            .select(`
                *,
                projects (name),
                clients (name),
                purchase_order_items (*)
            `)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching purchase orders:', error.message);
        return [];
    }
}

async function createPurchaseOrder(orderData, items) {
    const { data: order, error: orderError } = await _supabase
        .from('purchase_orders')
        .insert([orderData])
        .select()
        .single();
    if (orderError) throw orderError;

    const itemRows = items.map(item => ({ ...item, order_id: order.id }));
    const { error: itemsError } = await _supabase.from('purchase_order_items').insert(itemRows);
    if (itemsError) throw itemsError;

    return order;
}

async function updatePurchaseOrder(id, updates) {
    const { data, error } = await _supabase.from('purchase_orders').update(updates).eq('id', id).select();
    if (error) throw error;
    return data;
}

async function deletePurchaseOrder(id) {
    const { error } = await _supabase.from('purchase_orders').delete().eq('id', id);
    if (error) throw error;
}

async function createPurchaseOrderItem(itemData) {
    const { data, error } = await _supabase.from('purchase_order_items').insert([itemData]).select();
    if (error) throw error;
    return data;
}

async function updatePurchaseOrderItem(id, updates) {
    const { data, error } = await _supabase.from('purchase_order_items').update(updates).eq('id', id).select();
    if (error) throw error;
    return data;
}

async function deletePurchaseOrderItem(id) {
    const { error } = await _supabase.from('purchase_order_items').delete().eq('id', id);
    if (error) throw error;
}

// All receipts for a set of item ids, newest first — used to render the
// "restante pendente" history log per item on the conference page.
async function fetchPurchaseOrderReceipts(itemIds) {
    if (!itemIds || itemIds.length === 0) return [];
    try {
        const { data, error } = await _supabase
            .from('purchase_order_receipts')
            .select('*')
            .in('order_item_id', itemIds)
            .order('received_at', { ascending: false });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching purchase order receipts:', error.message);
        return [];
    }
}

// Registers a partial (or full) receipt for one item. The DB trigger
// (apply_purchase_receipt) resyncs the item's quantity_received and the
// parent order's status automatically — callers just need to re-fetch after.
async function createPurchaseOrderReceipt(receiptData) {
    const { data, error } = await _supabase.from('purchase_order_receipts').insert([receiptData]).select();
    if (error) throw error;
    return data;
}

// Corrects a past receiving entry (quantity, nota fiscal, responsible) — the
// apply_purchase_receipt DB trigger recomputes the item's quantity_received
// (full re-sum, not a delta) and the order status on UPDATE, same as it does
// on INSERT/DELETE.
async function updatePurchaseOrderReceipt(id, updates) {
    const { data, error } = await _supabase.from('purchase_order_receipts').update(updates).eq('id', id).select();
    if (error) throw error;
    return data;
}

async function deletePurchaseOrderReceipt(id) {
    const { error } = await _supabase.from('purchase_order_receipts').delete().eq('id', id);
    if (error) throw error;
}

