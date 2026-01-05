// _supabase is already initialized in supabaseClient.js
if (typeof _supabase === 'undefined') {
    console.error('_supabase is undefined. Check supabaseClient.js load order.');
}
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

async function deleteMember(id) {
    const { error } = await _supabase.from('users').delete().eq('id', id);
    if (error) throw error;
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

// Ensure Stock Item (Find or Create)
async function ensureStockItem(name, unitValue, quantityNeeded) {
    console.log(`Ensuring item: ${name}, Value: ${unitValue}, Need: ${quantityNeeded}`);
    try {
        // 1. Try to find existing item (case-insensitive)
        const { data: existingItems, error: searchError } = await _supabase
            .from('stock_items')
            .select('*')
            .ilike('name', name); // Case-insensitive match

        if (searchError) throw searchError;

        if (existingItems && existingItems.length > 0) {
            const item = existingItems[0];
            // 2. Update existing item
            // We add the needed quantity to the current stock so the exit doesn't fail (or just to track flow)
            // And we update the value to the most recent one provided
            const newQuantity = (parseFloat(item.quantity) || 0) + parseFloat(quantityNeeded);

            await updateStockItem(item.id, {
                quantity: newQuantity,
                value: unitValue
            });

            return item.id;
        } else {
            // 3. Create new item
            const newItem = {
                name: name,
                quantity: parseFloat(quantityNeeded), // Start with exactly what we need
                value: unitValue,
                unit: 'un' // Default unit
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

// Stock Exit Logic (RPC) - Updated
async function processStockExit(itemId, quantity, reason, projectId, obs, clientId) {
    try {
        const { data, error } = await _supabase.rpc('register_stock_exit', {
            p_item_id: itemId,
            p_quantity: quantity,
            p_reason: reason,
            p_project_id: projectId || null,
            p_observation: obs || null,
            p_client_id: clientId || null
        });

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
