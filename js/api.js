// _supabase is already initialized in supabaseClient.js
if (typeof _supabase === 'undefined') {
    console.error('_supabase is undefined. Check supabaseClient.js load order.');
}

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
    try {
        const { data, error } = await _supabase
            .from('stock_items')
            .select('*');
        if (error) throw error;
        return data;
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

// Logic to check and auto-complete project
async function checkProjectCompletion(projectId) {
    try {
        // Fetch all tasks for the project
        const { data: tasks, error } = await _supabase
            .from('tasks')
            .select('status')
            .eq('project_id', projectId);

        if (error) throw error;

        if (!tasks || tasks.length === 0) return false;

        // Check if there are any tasks NOT in 'Done' (or 'Concluída')
        const remaining = tasks.filter(t => t.status !== 'Done' && t.status !== 'Concluída').length;

        if (remaining === 0) {
            // All tasks done. Mark project as Completed.
            const today = new Date().toISOString();
            await updateProject(projectId, {
                status: 'Completed',
                completed_at: today
            });
            return true;
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
        return data;
    } catch (error) {
        console.error('Error processing stock exit:', error);
        throw error;
    }
}


async function fetchStockExits() {
    try {
        const { data, error } = await _supabase
            .from('stock_exits')
            .select(`
                *,
                stock_items (name, value, unit),
                clients (name)
            `);
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching stock exits:', error.message);
        alert('Erro ao buscar saídas de estoque: ' + error.message);
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
    const { data, error } = await _supabase.from('stock_requests').insert([requestData]).select();
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

