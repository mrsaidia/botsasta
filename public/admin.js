// Global variables
let authToken = localStorage.getItem('adminToken');
let usersData = [];
let accountsData = [];
let historyData = [];
let currentTab = localStorage.getItem('adminCurrentTab') || 'users';
let currentDiscountSubTab = localStorage.getItem('adminCurrentDiscountSubTab') || 'user-discounts';

// Pagination and filtering variables
let currentPage = 1;
let itemsPerPage = 12;
let filteredHistoryData = [];
let currentView = localStorage.getItem('adminCurrentHistoryView') || 'table'; // 'cards' or 'table'

// Users pagination variables
let usersCurrentPage = 1;
let usersEntriesPerPage = 25;
let usersTotalEntries = 0;
let filteredUsersData = [];
let currentSort = null; // 'asc' | 'desc' | null

// --- SEARCH & SORT USERS ---
// let filteredUsersData = [];
// let currentSort = null; // 'asc' | 'desc' | null

// Check authentication on page load
    if (!authToken) {
    window.location.href = '/admin-login.html';
}

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin panel loading...');
    console.log('Auth token:', authToken ? 'Present' : 'Missing');
    
    // Initialize theme
    initializeTheme();
    
    if (authToken) {
        // Set the saved tab as active
        if (currentTab) {
            switchTab(currentTab);
        }
        
        // Restore sub-tab states after a small delay to ensure tabs are loaded
        setTimeout(() => {
            // Restore discount sub-tab state
            if (currentTab === 'discounts' && currentDiscountSubTab) {
                switchDiscountTab(currentDiscountSubTab);
            }
            
            // Restore history view state
            if (currentTab === 'history' && currentView) {
                // Set the radio button state
                const viewRadio = document.querySelector(`input[name="historyView"][value="${currentView}"]`);
                if (viewRadio) {
                    viewRadio.checked = true;
                }
                toggleHistoryView();
            }
        }, 100);
        
        // Gắn event search/sort user ở đây
        const searchInput = document.getElementById('searchUserInput');
        const sortDescBtn = document.getElementById('sortCreditDescBtn');
        const sortAscBtn = document.getElementById('sortCreditAscBtn');
        if (searchInput) searchInput.addEventListener('input', applyUserFilters);
        if (sortDescBtn) sortDescBtn.addEventListener('click', () => { currentSort = 'desc'; applyUserFilters(); });
        if (sortAscBtn) sortAscBtn.addEventListener('click', () => { currentSort = 'asc'; applyUserFilters(); });
        
        loadAllData();
    } else {
        window.location.href = '/admin-login.html';
    }
    
    const unsortBtn = document.getElementById('unsortBtn');
    if (unsortBtn) unsortBtn.addEventListener('click', () => {
        currentSort = null;
        document.getElementById('searchUserInput').value = '';
        filteredUsersData = [];
        usersCurrentPage = 1;
        renderUsersTable();
    });
});

// Load all data
async function loadAllData() {
        await loadUsers();
        await loadAccounts();
    await loadOrderHistory();

    

}

// Tab switching
function switchTab(tabName) {
    // Remove active class from all tabs and panels
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    
    // Add active class to selected tab and panel
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    currentTab = tabName;
    localStorage.setItem('adminCurrentTab', tabName); // Save current tab
    
    // Load specific data for certain tabs
    switch(tabName) {
        case 'history':
            loadOrderHistory().then(() => {
                initializeHistoryFeatures();
            });
            break;
        case 'backup':
            loadBackupTab();
            break;
        case 'discounts':
            loadDiscountsTab();
            break;
        case 'shared-accounts':
            loadSharedAccountsTab();
            // Load accounts by default when entering shared accounts tab
            const savedTab = localStorage.getItem('currentSharedSubTab') || 'accounts';
            switchSharedTab(savedTab);
            break;
    }
}

// Discounts Tab Management
function loadDiscountsTab() {
    loadUserDiscounts();
    loadCouponCodes();
    loadUsersForDiscounts();
    loadProductsForDiscounts();
    
    // Restore discount sub-tab state
    setTimeout(() => {
        if (currentDiscountSubTab) {
            switchDiscountTab(currentDiscountSubTab);
        }
    }, 50);
}

// Sub-tab switching for discounts
function switchDiscountTab(subtabName) {
    // Remove active class from all sub-tab buttons and panels
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sub-tab-panel').forEach(panel => panel.classList.remove('active'));
    
    // Add active class to selected sub-tab and panel
    document.querySelector(`[data-subtab="${subtabName}"]`).classList.add('active');
    document.getElementById(`${subtabName}-subtab`).classList.add('active');
    
    // Save current discount sub-tab state
    currentDiscountSubTab = subtabName;
    localStorage.setItem('adminCurrentDiscountSubTab', subtabName);
}

function switchSharedTab(subtabName) {
    // Save current sub-tab
    localStorage.setItem('currentSharedSubTab', subtabName);
    
    // Update buttons
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === subtabName) {
            btn.classList.add('active');
        }
    });
    
    // Update panels
    document.querySelectorAll('.sub-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`${subtabName}-subtab`).classList.add('active');
    
    // Load appropriate data
    if (subtabName === 'accounts') {
        loadSharedAccounts();
    } else if (subtabName === 'codes') {
        loadSharedCodes();
    }
}

// Theme Management
function initializeTheme() {
    const savedTheme = localStorage.getItem('adminTheme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-mode');
        updateThemeIcon('dark');
    } else {
        document.body.classList.remove('dark-mode');
        updateThemeIcon('light');
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    
    if (isDark) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('adminTheme', 'light');
        updateThemeIcon('light');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('adminTheme', 'dark');
        updateThemeIcon('dark');
    }
}

function updateThemeIcon(theme) {
    const themeToggle = document.querySelector('.theme-toggle i');
    if (themeToggle) {
        if (theme === 'dark') {
            themeToggle.className = 'fas fa-sun';
        } else {
            themeToggle.className = 'fas fa-moon';
        }
    }
}

// Authentication
function handleLogout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminLoginTime');
    localStorage.removeItem('adminRole');
    localStorage.removeItem('adminName');
    localStorage.removeItem('adminCurrentTab');
    localStorage.removeItem('adminCurrentDiscountSubTab');
    localStorage.removeItem('adminCurrentHistoryView');
    window.location.href = '/';
}

// API helper function
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
            headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(endpoint, options);
    
    if (!response.ok) {
        if (response.status === 401) {
            handleLogout();
            return;
        }
        throw new Error(`API call failed: ${response.statusText}`);
    }
    
    return await response.json();
}

// Users Management
async function loadUsers() {
    try {
        usersData = await apiCall('/api/admin/users');
        renderUsersTable();
    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('Failed to load users', 'error');
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    const data = (typeof filteredUsersData !== 'undefined' && filteredUsersData.length > 0) || document.getElementById('searchUserInput')?.value ? filteredUsersData : usersData;
    data.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>
                <span class="auth-code auth-code-tooltip" onclick="copyAuthCode('${user.auth_code}')">
                    ${user.auth_code}
                </span>
            </td>
            <td>${user.credits}</td>
            <td>${user.total_downloads}</td>
            <td><span class="status-badge status-${user.status}">${user.status}</span></td>
            <td>${formatDate(user.created_date)}</td>
            <td>
                <button class="action-btn action-btn-edit" onclick="editUser(${user.id})">Edit</button>
                <button class="action-btn action-btn-delete" onclick="deleteUser(${user.id})">Delete</button>
                <button class="action-btn action-btn-view" onclick="viewUserDetails(${user.id})">View</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showAddUserModal() {
    console.log('showAddUserModal called');
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 500px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <h3 style="color: #2d3748; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-user-plus"></i> Add New User
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: #718096;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                <form id="dynamicAddUserForm" style="padding: 0 2rem 2rem 2rem;">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Username *</label>
                        <input type="text" name="username" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Initial Credits</label>
                        <input type="number" name="credits" value="0" min="0" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button type="button" onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #2d3748;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Cancel</button>
                        <button type="submit" style="
                            padding: 0.75rem 1.5rem;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Add User</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submission handler
    document.getElementById('dynamicAddUserForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const userData = {
            username: formData.get('username'),
            credits: parseFloat(formData.get('credits')) || 0
        };
        
        try {
            await apiCall('/api/admin/users', 'POST', userData);
            await loadUsers();
            closeDynamicModal();
            showAlert('User added successfully', 'success');
        } catch (error) {
            console.error('Error adding user:', error);
            showAlert('Failed to add user', 'error');
        }
    });
    
    console.log('Dynamic modal created and should be visible');
}

function closeDynamicModal() {
    const modal = document.getElementById('dynamicModal');
    if (modal) {
        modal.remove();
    }
}

// Make functions global
window.closeDynamicModal = closeDynamicModal;

function editUser(userId) {
    console.log('editUser called for ID:', userId);
    const user = usersData.find(u => u.id === userId);
    if (!user) {
        console.error('User not found for ID:', userId);
        return;
    }
    
    console.log('Found user:', user);
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 500px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <h3 style="color: #2d3748; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-user-edit"></i> Edit User
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: #718096;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                <form id="dynamicEditUserForm" style="padding: 0 2rem 2rem 2rem;">
                    <input type="hidden" name="userId" value="${user.id}">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Username *</label>
                        <input type="text" name="username" value="${user.username}" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Auth Code</label>
                        <input type="text" value="${user.auth_code}" readonly onclick="copyAuthCode('${user.auth_code}')" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                            background: #f7fafc;
                            cursor: pointer;
                        ">
                        <small style="color: #718096; font-size: 0.875rem;">Click to copy to clipboard</small>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Credits</label>
                        <input type="number" name="credits" value="${user.credits}" min="0" step="0.1" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Status</label>
                        <select name="status" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                            <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                            <option value="banned" ${user.status === 'banned' ? 'selected' : ''}>Banned</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button type="button" onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #2d3748;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Cancel</button>
                        <button type="submit" style="
                            padding: 0.75rem 1.5rem;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Update User</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submission handler
    document.getElementById('dynamicEditUserForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const userId = formData.get('userId');
        const credits = parseFloat(formData.get('credits'));
        
        try {
            // Use the specific credits update endpoint
            await apiCall(`/api/admin/users/${userId}/credits`, 'PUT', { credits });
            
            await loadUsers();
            closeDynamicModal();
            showAlert('User updated successfully', 'success');
        } catch (error) {
            console.error('Error updating user:', error);
            showAlert('Failed to update user', 'error');
        }
    });
    
    console.log('Dynamic edit user modal created');
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
        await apiCall(`/api/admin/users/${userId}`, 'DELETE');
        await loadUsers();
        showAlert('User deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting user:', error);
        showAlert('Failed to delete user', 'error');
    }
}

function viewUserDetails(userId) {
    const user = usersData.find(u => u.id === userId);
    if (!user) return;
    
    alert(`User Details:
Name: ${user.username}
Auth Code: ${user.auth_code}
Credits: ${user.credits}
Total Downloads: ${user.total_downloads}
Status: ${user.status}
Created: ${formatDate(user.created_date)}`);
}

// Products/Accounts Management
async function loadAccounts() {
    try {
        accountsData = await apiCall('/api/admin/accounts');
        renderAccountsTable();
    } catch (error) {
        console.error('Error loading accounts:', error);
        showAlert('Failed to load accounts', 'error');
    }
}

function renderAccountsTable() {
    const tbody = document.getElementById('accountsTableBody');
    tbody.innerHTML = '';
    
    accountsData.forEach(account => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${account.id}</td>
            <td>
                ${account.logo_path ? 
                    `<img src="${account.logo_path}" alt="Logo" class="product-logo">` : 
                    'No Logo'
                }
            </td>
            <td>${account.title}</td>
            <td>${account.description || 'N/A'}</td>
            <td>${account.credit_cost}</td>
            <td>${account.stock_quantity}</td>
            <td>${account.total_sold}</td>
            <td><span class="status-badge status-${account.status}">${account.status}</span></td>
            <td>
                <button class="action-btn action-btn-edit" onclick="editAccount(${account.id})">Edit</button>
                <button class="action-btn action-btn-delete" onclick="deleteAccount(${account.id})">Delete</button>
                <button class="action-btn action-btn-view" onclick="viewAccountDetails(${account.id})">View</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showAddProductModal() {
    console.log('showAddProductModal called');
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 600px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <h3 style="color: #2d3748; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-box"></i> Add New Product
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: #718096;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                <form id="dynamicAddProductForm" style="padding: 0 2rem 2rem 2rem;">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Product Title *</label>
                        <input type="text" name="title" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Description</label>
                        <textarea name="description" rows="3" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                            resize: vertical;
                        "></textarea>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Price (Credits) *</label>
                        <input type="number" name="creditCost" step="0.1" min="0" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Account Data *</label>
                        <textarea name="accountData" rows="5" placeholder="Enter account data (one per line)..." required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                            resize: vertical;
                        "></textarea>
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Logo Upload</label>
                        <input type="file" name="logo" accept="image/*" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button type="button" onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #2d3748;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Cancel</button>
                        <button type="submit" style="
                            padding: 0.75rem 1.5rem;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Add Product</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submission handler
    document.getElementById('dynamicAddProductForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        // Upload logo first if selected
        let logoPath = null;
        const logoFile = formData.get('logo');
        if (logoFile && logoFile.size > 0) {
            try {
                const logoFormData = new FormData();
                logoFormData.append('logo', logoFile);
                
                const logoResponse = await fetch('/api/admin/upload-logo', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: logoFormData
                });
                
                if (logoResponse.ok) {
                    const logoResult = await logoResponse.json();
                    logoPath = logoResult.logoPath;
                }
            } catch (error) {
                console.error('Error uploading logo:', error);
            }
        }
        
        const productData = {
            title: formData.get('title'),
            description: formData.get('description'),
            creditCost: parseFloat(formData.get('creditCost')),
            accountData: formData.get('accountData'),
            logoPath: logoPath
        };
        
        try {
            await apiCall('/api/admin/accounts', 'POST', productData);
            await loadAccounts();
            closeDynamicModal();
            showAlert('Product added successfully', 'success');
        } catch (error) {
            console.error('Error adding product:', error);
            showAlert('Failed to add product', 'error');
        }
    });
    
    console.log('Dynamic product modal created');
}

function editAccount(accountId) {
    const account = accountsData.find(a => a.id === accountId);
    if (!account) return;
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 700px !important;
                width: 95% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 16px 16px 0 0;
                ">
                    <h3 style="color: white; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-edit"></i> Edit Product
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: white;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                
                <form id="dynamicEditProductForm" style="padding: 2rem;">
                    <input type="hidden" name="productId" value="${account.id}">
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">
                                Product Title <span style="color: #e53e3e;">*</span>
                            </label>
                            <input type="text" name="title" value="${account.title}" required style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                transition: border-color 0.2s;
                            " placeholder="Enter product title">
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">
                                Credit Cost <span style="color: #e53e3e;">*</span>
                            </label>
                            <input type="number" name="creditCost" value="${account.credit_cost}" min="0" step="0.1" required style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                transition: border-color 0.2s;
                            " placeholder="0.0">
                        </div>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">
                            Description
                        </label>
                        <textarea name="description" rows="3" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            transition: border-color 0.2s;
                            resize: vertical;
                        " placeholder="Product description (optional)">${account.description || ''}</textarea>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">
                            Account Data <span style="color: #e53e3e;">*</span>
                        </label>
                        <textarea name="accountData" rows="8" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 0.9rem;
                            font-family: monospace;
                            transition: border-color 0.2s;
                            resize: vertical;
                        " placeholder="Enter account credentials (one per line)">${account.account_data}</textarea>
                        <div style="font-size: 0.875rem; color: #4a5568; margin-top: 0.5rem;">
                            Enter one account per line. Format: username:password or any other format.
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">
                                Product Logo
                            </label>
                            <input type="file" name="logo" accept="image/*" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                transition: border-color 0.2s;
                            ">
                            <div style="font-size: 0.875rem; color: #4a5568; margin-top: 0.5rem;">
                                Leave empty to keep current logo
                            </div>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">
                                Status
                            </label>
                            <select name="status" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                transition: border-color 0.2s;
                                background: white;
                            ">
                                <option value="active" ${account.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="inactive" ${account.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                    </div>

                    <div style="
                        background: #f7fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 1rem;
                        margin-bottom: 2rem;
                    ">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; text-align: center;">
                            <div>
                                <div style="font-size: 0.875rem; color: #4a5568; margin-bottom: 0.25rem;">Current Stock</div>
                                <div style="font-size: 1.25rem; font-weight: 600; color: #2d3748;">${account.stock_quantity || 0}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.875rem; color: #4a5568; margin-bottom: 0.25rem;">Total Sold</div>
                                <div style="font-size: 1.25rem; font-weight: 600; color: #48bb78;">${account.total_sold || 0}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.875rem; color: #4a5568; margin-bottom: 0.25rem;">Created</div>
                                <div style="font-size: 1rem; font-weight: 500; color: #2d3748;">${formatDate(account.upload_date)}</div>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button type="button" onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #4a5568;
                            border: none;
                            border-radius: 8px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: background-color 0.2s;
                        ">Cancel</button>
                        <button type="submit" style="
                            padding: 0.75rem 1.5rem;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            border: none;
                            border-radius: 8px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                            transition: transform 0.2s;
                        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="fas fa-save"></i>
                            Update Product
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submit handler
    document.getElementById('dynamicEditProductForm').addEventListener('submit', handleDynamicEditProduct);
}

// Handle dynamic edit product form submission
async function handleDynamicEditProduct(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const productId = formData.get('productId');
    const logoFile = formData.get('logo');
    
    let logoPath = null;
    
    // Upload logo first if a new file is selected
    if (logoFile && logoFile.size > 0) {
        try {
            console.log('Uploading logo file...');
            const logoFormData = new FormData();
            logoFormData.append('logo', logoFile);
            
            const logoResponse = await fetch('/api/admin/upload-logo', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                },
                body: logoFormData
            });
            
            if (logoResponse.ok) {
                const logoResult = await logoResponse.json();
                logoPath = logoResult.logoPath;
                console.log('Logo uploaded successfully:', logoPath);
            } else {
                console.error('Logo upload failed');
                showAlert('Failed to upload logo', 'warning');
            }
        } catch (error) {
            console.error('Error uploading logo:', error);
            showAlert('Logo upload failed', 'warning');
        }
    }
    
    // Prepare product data (include logoPath only if new logo was uploaded)
    const productData = {
        title: formData.get('title'),
        description: formData.get('description'),
        creditCost: parseFloat(formData.get('creditCost')),
        accountData: formData.get('accountData'),
        status: formData.get('status')
    };
    
    // Add logoPath only if new logo was uploaded
    if (logoPath) {
        productData.logoPath = logoPath;
    }
    
    console.log('Sending product data:', productData);
    
    try {
        const response = await fetch(`/api/admin/accounts/${productId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Product updated successfully!' + (logoPath ? ' (Logo updated)' : ''), 'success');
            closeDynamicModal();
            await loadAccounts(); // Refresh products list
        } else {
            showAlert(`Failed to update product: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error updating product:', error);
        showAlert('Failed to update product', 'error');
    }
}

async function deleteAccount(accountId) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
        await apiCall(`/api/admin/accounts/${accountId}`, 'DELETE');
        await loadAccounts();
        showAlert('Product deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting account:', error);
        showAlert('Failed to delete product', 'error');
    }
}

function viewAccountDetails(accountId) {
    const account = accountsData.find(a => a.id === accountId);
    if (!account) return;
    
    alert(`Product Details:
Title: ${account.title}
Description: ${account.description || 'N/A'}
Price: ${account.credit_cost} credits
Stock: ${account.stock_quantity}
Total Sold: ${account.total_sold}
Status: ${account.status}
Created: ${formatDate(account.upload_date)}`);
}



// Order History
async function loadOrderHistory() {
    try {
        console.log('=== LOADING ORDER HISTORY ===');
        console.log('Calling API endpoint: /api/admin/history');
        
        const response = await apiCall('/api/admin/history');
        
        console.log('=== API RESPONSE RECEIVED ===');
        console.log('Type:', typeof response);
        console.log('Is Array:', Array.isArray(response));
        console.log('Response keys:', Object.keys(response || {}));
        console.log('Full response:', JSON.stringify(response, null, 2));
        
        historyData = response.history || response;
        
        console.log('=== PROCESSED HISTORY DATA ===');
        console.log('historyData type:', typeof historyData);
        console.log('historyData length:', historyData?.length);
        console.log('historyData sample:', historyData?.[0]);
        
        if (historyData && historyData.length > 0) {
            console.log('Sample order account_data:', historyData[0].account_data);
            console.log('Sample order logo_url:', historyData[0].logo_url);
        }
        
        renderOrderHistoryCards();
    } catch (error) {
        console.error('=== ERROR LOADING ORDER HISTORY ===');
        console.error('Error details:', error);
        showAlert('Failed to load order history', 'error');
        document.getElementById('historyCardsContainer').innerHTML = 
            '<div class="history-empty"><div class="history-empty-icon"><i class="fas fa-exclamation-triangle"></i></div><h3>Failed to Load</h3><p>Unable to load order history data</p></div>';
    }
}

// Helper function to create order card
function createOrderCard(order) {
    const date = new Date(order.download_date);
    const userInitial = (order.username || 'U').charAt(0).toUpperCase();
    
    console.log('Processing order:', order.id, 'Logo:', order.logo_url, 'Account data:', order.account_data?.substring(0, 50)); // Debug
    
    // Create account items HTML safely
    let accountItemsHTML = '<div class="no-account">No account data available</div>';
    if (order.account_data && order.account_data.trim()) {
        const accounts = order.account_data.split('\n').filter(account => account.trim());
        if (accounts.length > 0) {
            accountItemsHTML = accounts.map(account => {
                const cleanAccount = account.trim();
                const escapedAccount = cleanAccount.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
                return `<div class="account-item">
                    <i class="fas fa-key"></i>
                    <span class="account-text">${cleanAccount}</span>
                    <button class="copy-account-btn" onclick="copyAccountText('${escapedAccount}')" title="Copy account">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>`;
            }).join('');
        }
    }
    
    // Logo URL handling - handle null/undefined values
    let logoSrc = '/uploads/default-product.png';
    if (order.logo_url && order.logo_url.trim() && order.logo_url !== 'null') {
        logoSrc = order.logo_url;
    }
    
    return `
        <div class="history-card">
            <div class="history-card-header">
                <div class="order-info">
                    <div class="order-id">Order #${order.id}</div>
                    <div class="order-code" onclick="copyToClipboard('${order.order_code}')" title="Click to copy">
                        ${order.order_code}
                    </div>
                </div>
                <span class="order-status">Completed</span>
            </div>

            <div class="user-info">
                <div class="user-avatar">${userInitial}</div>
                <div class="user-details">
                    <div class="username">${order.username}</div>
                    <div class="user-role">Customer</div>
                </div>
            </div>

                <div class="product-info">
                <img src="${logoSrc}" 
                     alt="${order.account_title}" 
                     class="product-logo"
                     onerror="this.src='/uploads/default-product.png'">
                <div class="product-details">
                    <div class="product-title">${order.account_title}</div>
                    <div class="product-description">${order.description || 'Premium account access'}</div>
                </div>
            </div>

            <div class="account-details">
                <div class="account-header">
                    <i class="fas fa-user-circle"></i>
                    <span>Account Purchased:</span>
            </div>
                <div class="account-data">
                    ${accountItemsHTML}
                </div>
            </div>

            <div class="order-meta">
                <div class="meta-item">
                    <div class="meta-label">Quantity</div>
                    <div class="meta-value">${order.quantity}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Credits Used</div>
                    <div class="meta-value">${order.cost.toFixed(1)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Purchase Date</div>
                    <div class="meta-value">${date.toLocaleDateString()}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Purchase Time</div>
                    <div class="meta-value">${date.toLocaleTimeString()}</div>
                </div>
            </div>

            <div class="history-card-actions">
                <button class="card-btn card-btn-primary" onclick="showOrderDetailsModal(${order.id})">
                    <i class="fas fa-eye"></i> View Details
                </button>
                <button class="card-btn card-btn-secondary" onclick="copyOrderInfo('${order.order_code}', '${order.username}', '${order.account_title}')">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </div>
            </div>
        `;
}

function renderOrderHistoryCards() {
    const container = document.getElementById('historyCardsContainer');
    
    if (!historyData || historyData.length === 0) {
        container.innerHTML = `
            <div class="history-empty">
                <div class="history-empty-icon">
                    <i class="fas fa-shopping-cart"></i>
                </div>
                <h3>No Orders Found</h3>
                <p>No order history available to display.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = historyData.map(order => createOrderCard(order)).join('');
}

// Initialize history features (pagination, search, view toggle)
function initializeHistoryFeatures() {
    // Restore saved view state first
    const savedView = localStorage.getItem('adminCurrentHistoryView') || 'table';
    currentView = savedView;
    
    // Set the correct radio button
    const viewRadio = document.querySelector(`input[name="historyView"][value="${savedView}"]`);
    if (viewRadio) {
        viewRadio.checked = true;
    }
    
    // Set up view toggle listeners
    document.querySelectorAll('input[name="historyView"]').forEach(radio => {
        radio.addEventListener('change', function() {
            currentView = this.value;
            localStorage.setItem('adminCurrentHistoryView', currentView);
            toggleHistoryView();
        });
    });
    
    // Set up search listeners
    const historySearch = document.getElementById('historySearch');
    const productSearch = document.getElementById('productSearch');
    const historyFilter = document.getElementById('historyFilter');
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    
    if (historySearch) {
        historySearch.addEventListener('input', debounce(() => filterHistory(), 300));
    }
    
    if (productSearch) {
        productSearch.addEventListener('input', debounce(() => filterHistory(), 300));
    }
    
    if (historyFilter) {
        historyFilter.addEventListener('change', () => filterHistory());
    }
    
    if (itemsPerPageSelect) {
        itemsPerPageSelect.addEventListener('change', function() {
            itemsPerPage = this.value === 'all' ? 'all' : parseInt(this.value);
            currentPage = 1;
            renderHistoryWithPagination();
        });
    }
    
    // Initialize with all data
    filterHistory();
    
    // Update summary statistics
    updateSummaryStatistics();
}

// Toggle between card, table, and summary view
function toggleHistoryView() {
    const cardsContainer = document.getElementById('historyCardsContainer');
    const tableContainer = document.getElementById('historyTableContainer');
    const summaryContainer = document.getElementById('summaryNoteView');
    const historyContainer = document.querySelector('.history-container');
    const searchFilters = document.querySelector('.search-filters');
    const paginationControls = document.querySelector('.pagination-controls');
    
    // Hide all containers first
    cardsContainer.style.display = 'none';
    tableContainer.style.display = 'none';
    summaryContainer.style.display = 'none';
    
    if (currentView === 'cards') {
        tableContainer.style.display = 'block';
        historyContainer.style.display = 'block';
        searchFilters.style.display = 'flex';
        paginationControls.style.display = 'flex';
        renderHistoryWithPagination();
    } else if (currentView === 'table') {
        cardsContainer.style.display = 'grid';
        historyContainer.style.display = 'block';
        searchFilters.style.display = 'flex';
        paginationControls.style.display = 'flex';
        renderHistoryWithPagination();
    } else if (currentView === 'summary') {
        summaryContainer.style.display = 'block';
        historyContainer.style.display = 'none';
        searchFilters.style.display = 'none';
        paginationControls.style.display = 'none';
        updateSummaryStatistics();
    }
}

// Function to switch back to cards view from summary
function switchToCardsView() {
    const tableRadio = document.querySelector('input[name="historyView"][value="table"]');
    if (tableRadio) {
        tableRadio.checked = true;
        currentView = 'table';
        localStorage.setItem('adminCurrentHistoryView', 'table');
        toggleHistoryView();
    }
}

// Update summary statistics
function updateSummaryStatistics() {
    if (!historyData || historyData.length === 0) {
        document.getElementById('summaryTotalOrders').textContent = '0';
        document.getElementById('summaryTotalAccounts').textContent = '0';
        document.getElementById('summaryTotalUsers').textContent = '0';
        document.getElementById('summaryTotalRevenue').textContent = '0';
        return;
    }
    
    // Calculate statistics
    const totalOrders = historyData.length;
    const totalAccounts = historyData.reduce((sum, order) => sum + (order.quantity || 0), 0);
    const totalRevenue = historyData.reduce((sum, order) => {
        const credits = order.credits_used || order.cost || (order.credit_cost * order.quantity) || 0;
        return sum + credits;
    }, 0);
    
    // Get unique users count
    const uniqueUsers = new Set(historyData.map(order => order.username).filter(Boolean)).size;
    
    // Update display
    document.getElementById('summaryTotalOrders').textContent = totalOrders.toLocaleString();
    document.getElementById('summaryTotalAccounts').textContent = totalAccounts.toLocaleString();
    document.getElementById('summaryTotalUsers').textContent = uniqueUsers.toLocaleString();
    document.getElementById('summaryTotalRevenue').textContent = totalRevenue.toLocaleString();
}

// Export order history function
function exportOrderHistory() {
    if (!historyData || historyData.length === 0) {
        showAlert('No data to export', 'warning');
        return;
    }
    
    try {
        // Prepare CSV data
        const csvData = [
            ['Order ID', 'Order Code', 'User', 'Product', 'Quantity', 'Credits Used', 'Date', 'Account Data']
        ];
        
        historyData.forEach(order => {
            const date = new Date(order.download_date);
            csvData.push([
                order.id,
                order.order_code || '',
                order.username || '',
                order.account_title || '',
                order.quantity || 0,
                order.credits_used || order.cost || 0,
                date.toLocaleDateString() + ' ' + date.toLocaleTimeString(),
                order.account_data || ''
            ]);
        });
        
        // Convert to CSV string
        const csvString = csvData.map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        
        // Create and download file
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `order_history_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showAlert('Order history exported successfully!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showAlert('Failed to export order history', 'error');
    }
}

// Filter history data based on search and filters
function filterHistory() {
    const searchTerm = document.getElementById('historySearch')?.value.toLowerCase() || '';
    const accountDataSearchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
    const dateFilter = document.getElementById('historyFilter')?.value || '';
    
    console.log('=== FILTER DEBUG ===');
    console.log('Search term:', searchTerm);
    console.log('Account data search term:', accountDataSearchTerm);
    console.log('Date filter:', dateFilter);
    console.log('Total history data:', historyData.length);
    
    filteredHistoryData = historyData.filter(order => {
        // Search in user, product, order code
        const matchesSearch = !searchTerm || 
            (order.username || '').toLowerCase().includes(searchTerm) ||
            (order.account_title || '').toLowerCase().includes(searchTerm) ||
            (order.order_code || '').toLowerCase().includes(searchTerm);
        
        // Search specifically in account data (purchased accounts)
        const matchesAccountData = !accountDataSearchTerm || 
            (order.account_data || '').toLowerCase().includes(accountDataSearchTerm);
        
        // Date filter
        let matchesDate = true;
        if (dateFilter) {
            const orderDate = new Date(order.download_date);
            const now = new Date();
            
            switch(dateFilter) {
                case 'today':
                    matchesDate = orderDate.toDateString() === now.toDateString();
                    break;
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    matchesDate = orderDate >= weekAgo;
                    break;
                case 'month':
                    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                    matchesDate = orderDate >= monthAgo;
                    break;
            }
        }
        
        const result = matchesSearch && matchesAccountData && matchesDate;
        
        // Debug logging for first few items
        if (historyData.indexOf(order) < 3) {
            console.log(`Order ${order.id}:`, {
                account_title: order.account_title,
                account_data: (order.account_data || '').substring(0, 20) + '...',
                matchesSearch,
                matchesAccountData,
                matchesDate,
                result
            });
        }
        
        return result;
    });
    
    console.log('Filtered results:', filteredHistoryData.length);
    
    currentPage = 1;
    renderHistoryWithPagination();
}

// Render history with pagination
function renderHistoryWithPagination() {
    if (currentView === 'cards') {
        renderHistoryTable();
    } else {
        renderHistoryCards();
    }
    updatePaginationControls();
}

// Render history cards with pagination
function renderHistoryCards() {
    const container = document.getElementById('historyCardsContainer');
    
    if (!filteredHistoryData || filteredHistoryData.length === 0) {
        container.innerHTML = `
            <div class="history-empty">
                <div class="history-empty-icon">
                    <i class="fas fa-search"></i>
                </div>
                <h3>No Orders Found</h3>
                <p>No orders match your search criteria.</p>
            </div>
        `;
        return;
    }
    
    // Pagination logic
    let paginatedData = filteredHistoryData;
    if (itemsPerPage !== 'all') {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        paginatedData = filteredHistoryData.slice(startIndex, endIndex);
    }
    
    container.innerHTML = paginatedData.map(order => createOrderCard(order)).join('');
}

// Render history table
function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    
    if (!filteredHistoryData || filteredHistoryData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No orders match your search criteria.</td></tr>';
        return;
    }
    
    // Pagination logic
    let paginatedData = filteredHistoryData;
    if (itemsPerPage !== 'all') {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        paginatedData = filteredHistoryData.slice(startIndex, endIndex);
    }
    
    tbody.innerHTML = '';
    paginatedData.forEach(order => {
        const row = document.createElement('tr');
        const date = new Date(order.download_date);
        
        row.innerHTML = `
            <td>${order.id}</td>
            <td>${order.username || 'Unknown'}</td>
            <td>${order.account_title || 'Deleted Product'}</td>
            <td>${order.quantity}</td>
            <td>${order.cost ? order.cost.toFixed(1) : 'N/A'}</td>
            <td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
            <td><span class="status-badge status-active">Completed</span></td>
            <td>
                <button class="action-btn action-btn-view" onclick="showOrderDetailsModal(${order.id})">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="action-btn action-btn-edit" onclick="copyOrderInfo('${order.order_code}', '${order.username}', '${order.account_title}')">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Update pagination controls
function updatePaginationControls() {
    const totalItems = filteredHistoryData.length;
    const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(totalItems / itemsPerPage);
    
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    
    if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages || itemsPerPage === 'all';
    
    // Update pagination info
    const paginationInfo = document.querySelector('.pagination-info');
    if (paginationInfo) {
        if (itemsPerPage === 'all') {
            paginationInfo.innerHTML = `
                <span>Showing all ${totalItems} items</span>
            `;
        } else {
            const startItem = (currentPage - 1) * itemsPerPage + 1;
            const endItem = Math.min(currentPage * itemsPerPage, totalItems);
            paginationInfo.innerHTML = `
                <span>Show:</span>
                <select id="itemsPerPage" class="items-per-page">
                    <option value="12" ${itemsPerPage == 12 ? 'selected' : ''}>12</option>
                    <option value="24" ${itemsPerPage == 24 ? 'selected' : ''}>24</option>
                    <option value="48" ${itemsPerPage == 48 ? 'selected' : ''}>48</option>
                    <option value="all" ${itemsPerPage == 'all' ? 'selected' : ''}>All</option>
                </select>
                <span>per page</span>
            `;
            
            // Re-attach event listener
            const itemsPerPageSelect = document.getElementById('itemsPerPage');
            if (itemsPerPageSelect) {
                itemsPerPageSelect.addEventListener('change', function() {
                    itemsPerPage = this.value === 'all' ? 'all' : parseInt(this.value);
                    currentPage = 1;
                    renderHistoryWithPagination();
                });
            }
        }
    }
}

// Change page
function changePage(direction) {
    const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(filteredHistoryData.length / itemsPerPage);
    
    const newPage = currentPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderHistoryWithPagination();
    }
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showOrderDetailsModal(orderId) {
    const order = historyData.find(o => o.id === orderId);
    if (!order) return;
    
    const date = new Date(order.download_date);
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Generate account details HTML
    let accountDetailsHTML = '<div style="color: #666; font-style: italic;">No account data available</div>';
    if (order.account_data && order.account_data.trim()) {
        const accounts = order.account_data.split('\n').filter(account => account.trim());
        if (accounts.length > 0) {
            accountDetailsHTML = accounts.map(account => {
                const cleanAccount = account.trim();
                const escapedAccount = cleanAccount.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
                return `
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        background: #f8f9fa;
                        padding: 0.75rem;
                        border-radius: 8px;
                        margin-bottom: 0.5rem;
                        border: 1px solid #e9ecef;
                    ">
                        <div style="font-family: monospace; color: #2d3748; word-break: break-all;">${cleanAccount}</div>
                        <button onclick="copyAccountText('${escapedAccount}')" style="
                            background: #667eea;
                            color: white;
                            border: none;
                            padding: 0.5rem;
                            border-radius: 6px;
                            cursor: pointer;
                            margin-left: 1rem;
                            flex-shrink: 0;
                        " title="Copy account">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }
    }
    
    // Create modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 800px !important;
                width: 95% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 16px 16px 0 0;
                ">
                    <h3 style="color: white; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-receipt"></i> Order Details
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: rgba(255, 255, 255, 0.2);
                        border: 2px solid rgba(255, 255, 255, 0.3);
                        font-size: 1.2rem;
                        cursor: pointer;
                        color: white;
                        padding: 0.5rem;
                        width: 2.5rem;
                        height: 2.5rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                        transition: all 0.2s ease;
                        font-weight: bold;
                    " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'; this.style.transform='scale(1.1)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'; this.style.transform='scale(1)'">&times;</button>
                </div>
                
                <div style="padding: 2rem;">
                    <!-- Account Details First -->
                    <div style="margin-bottom: 2rem;">
                        <h4 style="color: #2d3748; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-user-secret" style="color: #667eea;"></i> Account Details
                        </h4>
                        <div style="background: #f8f9fa; border-radius: 12px; padding: 1.5rem; border: 1px solid #e9ecef;">
                            ${accountDetailsHTML}
                        </div>
                    </div>
                    
                    <!-- Order Information -->
                    <div style="margin-bottom: 2rem;">
                        <h4 style="color: #2d3748; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-info-circle" style="color: #667eea;"></i> Order Information
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; border-left: 4px solid #667eea;">
                                <div style="font-weight: 600; color: #4a5568; margin-bottom: 0.25rem;">Order ID</div>
                                <div style="color: #2d3748; font-size: 1.1rem;">#${order.id}</div>
                            </div>
                            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; border-left: 4px solid #667eea;">
                                <div style="font-weight: 600; color: #4a5568; margin-bottom: 0.25rem;">Order Code</div>
                                <div style="color: #2d3748; font-family: monospace; cursor: pointer; font-size: 1.1rem;" onclick="copyToClipboard('${order.order_code}')" title="Click to copy">${order.order_code}</div>
                            </div>
                            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; border-left: 4px solid #48bb78;">
                                <div style="font-weight: 600; color: #4a5568; margin-bottom: 0.25rem;">Status</div>
                                <div><span style="background: #48bb78; color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.875rem;">Completed</span></div>
                            </div>
                            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; border-left: 4px solid #667eea;">
                                <div style="font-weight: 600; color: #4a5568; margin-bottom: 0.25rem;">Purchase Date</div>
                                <div style="color: #2d3748; font-size: 1.1rem;">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Customer Information -->
                    <div style="margin-bottom: 2rem;">
                        <h4 style="color: #2d3748; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-user" style="color: #667eea;"></i> Customer Information
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; border-left: 4px solid #667eea;">
                                <div style="font-weight: 600; color: #4a5568; margin-bottom: 0.25rem;">Username</div>
                                <div style="color: #2d3748; font-size: 1.1rem;">${order.username}</div>
                            </div>
                            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; border-left: 4px solid #667eea;">
                                <div style="font-weight: 600; color: #4a5568; margin-bottom: 0.25rem;">User Type</div>
                                <div style="color: #2d3748; font-size: 1.1rem;">Customer</div>
                            </div>
                        </div>
                    </div>

                    <!-- Product Information -->
                    <div style="margin-bottom: 2rem;">
                        <h4 style="color: #2d3748; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-box" style="color: #667eea;"></i> Product Information
                        </h4>
                        <div style="
                            background: #f7fafc;
                            padding: 1.5rem;
                            border-radius: 8px;
                            border: 1px solid #e2e8f0;
                            display: flex;
                            align-items: center;
                            gap: 1rem;
                        ">
                            <img src="${order.logo_url || '/uploads/default-product.png'}" 
                                 alt="${order.account_title}" 
                                 style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover;"
                                 onerror="this.src='/uploads/default-product.png'">
                            <div>
                                <div style="font-weight: 600; color: #2d3748; font-size: 1.1rem; margin-bottom: 0.25rem;">${order.account_title}</div>
                                <div style="color: #4a5568;">${order.description || 'Premium account access'}</div>
                            </div>
                        </div>
                    </div>



                    <!-- Purchase Summary -->
                    <div style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 1.5rem;
                        border-radius: 12px;
                        margin-top: 2rem;
                    ">
                        <h4 style="color: white; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-receipt"></i> Purchase Summary
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                            <div style="text-align: center;">
                                <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.25rem;">Quantity</div>
                                <div style="font-size: 1.5rem; font-weight: 600;">${order.quantity}</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.25rem;">Credits Used</div>
                                <div style="font-size: 1.5rem; font-weight: 600;">${order.cost.toFixed(1)}</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.25rem;">Total Value</div>
                                <div style="font-size: 1.5rem; font-weight: 600;">${(order.cost * order.quantity).toFixed(1)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function copyOrderDetails() {
    const modal = document.getElementById('orderDetailsModal');
    if (!modal.classList.contains('active')) return;
    
    // Extract text content from the modal
    const content = document.getElementById('orderDetailsContent');
    const textContent = content.innerText;
    
    navigator.clipboard.writeText(textContent).then(() => {
        showAlert('Order details copied to clipboard!', 'success');
    }).catch(() => {
        showAlert('Failed to copy order details', 'error');
    });
}

function copyOrderInfo(orderCode, username, productTitle) {
    const info = `Order Code: ${orderCode}\nUser: ${username}\nProduct: ${productTitle}`;
    
    navigator.clipboard.writeText(info).then(() => {
        showAlert('Order info copied to clipboard!', 'success');
    }).catch(() => {
        showAlert('Failed to copy order info', 'error');
    });
}

// Export order history to CSV
function exportHistoryCSV() {
    if (!historyData || historyData.length === 0) {
        showAlert('No data to export', 'warning');
        return;
    }
    
    const headers = ['Order ID', 'Username', 'Product', 'Order Code', 'Quantity', 'Credits Used', 'Purchase Date'];
    const csvContent = [
        headers.join(','),
        ...historyData.map(order => {
            const date = new Date(order.download_date);
            return [
                order.id,
                order.username,
                `"${order.account_title}"`,
                order.order_code,
                order.quantity,
                order.cost.toFixed(1),
                `"${date.toLocaleDateString()} ${date.toLocaleTimeString()}"`
            ].join(',');
        })
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `order_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showAlert('Order history exported successfully!', 'success');
}



// Modal Management
function closeModal() {
    // Hide modal overlay
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
    
    // Hide all modals
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
    
    // Reset forms
    document.querySelectorAll('form').forEach(form => {
        form.reset();
    });
}

// Form Handlers
document.getElementById('addUserForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const userData = {
        username: formData.get('username'),
        credits: parseFloat(formData.get('credits')) || 0
    };
    
    try {
        await apiCall('/api/admin/users', 'POST', userData);
        await loadUsers();
        closeModal();
        showAlert('User added successfully', 'success');
    } catch (error) {
        console.error('Error adding user:', error);
        showAlert('Failed to add user', 'error');
    }
});

document.getElementById('editUserForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const userId = formData.get('userId');
    const credits = parseFloat(formData.get('credits'));
    
    try {
        // Use the specific credits update endpoint
        await apiCall(`/api/admin/users/${userId}/credits`, 'PUT', { credits });
        
        // Also update other fields if they changed
        const userData = {
            username: formData.get('username'),
            status: formData.get('status')
        };
        
        // You may need to add a separate endpoint for updating user profile
        // For now, let's just update credits
        
        await loadUsers();
        closeModal();
        showAlert('User updated successfully', 'success');
    } catch (error) {
        console.error('Error updating user:', error);
        showAlert('Failed to update user', 'error');
    }
});

document.getElementById('addProductForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    
    // Upload logo first if selected
    let logoPath = null;
    const logoFile = formData.get('logo');
    if (logoFile && logoFile.size > 0) {
        try {
            const logoFormData = new FormData();
            logoFormData.append('logo', logoFile);
            
            const logoResponse = await fetch('/api/admin/upload-logo', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
                body: logoFormData
            });
            
            if (logoResponse.ok) {
                const logoResult = await logoResponse.json();
                logoPath = logoResult.logoPath;
            }
        } catch (error) {
            console.error('Error uploading logo:', error);
        }
    }
    
    const productData = {
        title: formData.get('title'),
        description: formData.get('description'),
        creditCost: parseFloat(formData.get('creditCost')),
        accountData: formData.get('accountData'),
        logoPath: logoPath
    };
    
    try {
        await apiCall('/api/admin/accounts', 'POST', productData);
        await loadAccounts();
        closeModal();
        showAlert('Product added successfully', 'success');
    } catch (error) {
        console.error('Error adding product:', error);
        showAlert('Failed to add product', 'error');
    }
});

document.getElementById('editProductForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const productId = formData.get('productId');
    
    const productData = {
        title: formData.get('title'),
        description: formData.get('description'),
        creditCost: parseFloat(formData.get('creditCost')),
        accountData: formData.get('accountData'),
        status: formData.get('status')
    };
    
    try {
        await apiCall(`/api/admin/accounts/${productId}`, 'PUT', productData);
        await loadAccounts();
        closeModal();
        showAlert('Product updated successfully', 'success');
    } catch (error) {
        console.error('Error updating product:', error);
        showAlert('Failed to update product', 'error');
    }
});





// Copy auth code to clipboard
function copyAuthCode(authCode) {
    navigator.clipboard.writeText(authCode).then(() => {
        showAlert('Auth code copied to clipboard!', 'success');
    }).catch(err => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = authCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showAlert('Auth code copied to clipboard!', 'success');
    });
}

// General copy to clipboard function
function copyToClipboard(text, successMessage = 'Copied to clipboard!') {
    navigator.clipboard.writeText(text).then(() => {
        showAlert(successMessage, 'success');
    }).catch(err => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showAlert(successMessage, 'success');
    });
}

// Copy account text specifically
function copyAccountText(escapedText) {
    // Decode HTML entities back to original text
    const text = escapedText.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    copyToClipboard(text, 'Account copied!');
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function showAlert(message, type) {
    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;
    
    // Add to page
    document.body.appendChild(alert);
    
    // Position alert
    alert.style.position = 'fixed';
    alert.style.top = '20px';
    alert.style.right = '20px';
    alert.style.zIndex = '9999';
    alert.style.maxWidth = '400px';
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    }, 5000);
}

// Close modal when clicking outside
document.getElementById('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

// Escape key to close modal
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// Backup & Notifications Tab Functions
async function loadBackupTab() {
    try {
        console.log('Loading backup tab...');
        
        // Update stats
        updateBackupStats();
        
        // Load Telegram configuration
        await loadTelegramConfiguration();
        
        // Load sales notification settings
        await loadSalesNotificationSettings();
        
        // Load auto backup settings
        await loadAutoBackupSettings();
        
        console.log('Backup tab loaded successfully');
        
    } catch (error) {
        console.error('Error loading backup tab:', error);
        showAlert('Error loading backup settings', 'error');
    }
}

// Update backup statistics
function updateBackupStats() {
    try {
        document.getElementById('totalUsersCount').textContent = usersData.length || 0;
        document.getElementById('totalProductsCount').textContent = accountsData.length || 0;
        document.getElementById('totalOrdersCount').textContent = historyData.length || 0;
    } catch (error) {
        console.error('Error updating backup stats:', error);
    }
}

// Load Telegram configuration
async function loadTelegramConfiguration() {
    try {
        const response = await apiCall('/api/admin/telegram-settings');
        
        if (response.botToken) {
            document.getElementById('telegramBotToken').value = response.botToken;
        }
        if (response.chatId) {
            document.getElementById('telegramChatId').value = response.chatId;
        }
        
        // Update status indicator
        updateTelegramStatus(response.botToken && response.chatId);
        
    } catch (error) {
        console.error('Error loading telegram configuration:', error);
        updateTelegramStatus(false);
    }
}

// Update Telegram status indicator
function updateTelegramStatus(isConfigured) {
    const indicator = document.getElementById('telegramStatusIndicator');
    const statusText = document.getElementById('telegramStatusText');
    
    if (isConfigured) {
        indicator.classList.add('connected');
        indicator.classList.remove('error');
        statusText.textContent = 'Connected';
    } else {
        indicator.classList.remove('connected');
        indicator.classList.add('error');
        statusText.textContent = 'Not configured';
    }
}

// Save Telegram settings
async function saveTelegramSettings() {
    const botToken = document.getElementById('telegramBotToken').value.trim();
    const chatId = document.getElementById('telegramChatId').value.trim();
    const saleNotificationsEnabled = document.getElementById('salesNotificationsEnabled').checked;
    
    if (!botToken || !chatId) {
        showAlert('Please enter both Bot Token and Chat ID', 'warning');
        return;
    }
    
    try {
        const response = await apiCall('/api/admin/telegram-settings', 'POST', {
            botToken,
            chatId,
            saleNotificationsEnabled
        });
        
        if (response.success) {
            showAlert('Telegram settings saved successfully!', 'success');
            updateTelegramStatus(true);
        } else {
            showAlert('Failed to save Telegram settings', 'error');
            updateTelegramStatus(false);
        }
    } catch (error) {
        console.error('Error saving telegram settings:', error);
        showAlert('Failed to save Telegram settings', 'error');
        updateTelegramStatus(false);
    }
}

// Test Telegram connection
async function testTelegramConnection() {
    const botToken = document.getElementById('telegramBotToken').value.trim();
    const chatId = document.getElementById('telegramChatId').value.trim();
    
    if (!botToken || !chatId) {
        showAlert('Please save Telegram settings first', 'warning');
        return;
    }
    
    try {
        showAlert('Testing Telegram connection...', 'info');
        
        const response = await apiCall('/api/admin/test-telegram', 'POST');
        
        if (response.success) {
            showAlert('Telegram connection successful!', 'success');
            updateTelegramStatus(true);
        } else {
            showAlert(`Connection test failed: ${response.error}`, 'error');
            updateTelegramStatus(false);
        }
    } catch (error) {
        console.error('Error testing telegram connection:', error);
        showAlert('Failed to test Telegram connection', 'error');
        updateTelegramStatus(false);
    }
}

// Load sales notification settings
async function loadSalesNotificationSettings() {
    try {
        const response = await apiCall('/api/admin/telegram-settings');
        
        const checkbox = document.getElementById('salesNotificationsEnabled');
        checkbox.checked = response.saleNotificationsEnabled || false;
        
    } catch (error) {
        console.error('Error loading sales notification settings:', error);
        document.getElementById('salesNotificationsEnabled').checked = false;
    }
}

// Toggle sales notifications
async function toggleSalesNotifications() {
    const enabled = document.getElementById('salesNotificationsEnabled').checked;
    
    try {
        const response = await apiCall('/api/admin/sale-notification-settings', 'POST', {
            enabled
        });
        
        if (response.success) {
            showAlert(`Sales notifications ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } else {
            showAlert('Failed to update sales notification settings', 'error');
            document.getElementById('salesNotificationsEnabled').checked = !enabled;
        }
    } catch (error) {
        console.error('Error toggling sales notifications:', error);
        showAlert('Failed to update sales notification settings', 'error');
        document.getElementById('salesNotificationsEnabled').checked = !enabled;
    }
}

// Send test sale notification
async function sendTestSaleNotification() {
    try {
        showAlert('Sending test sale notification...', 'info');
        
        const response = await apiCall('/api/admin/test-sale-notification', 'POST');
        
        if (response.success) {
            showAlert('Test sale notification sent successfully!', 'success');
        } else {
            showAlert('Failed to send test notification', 'error');
        }
    } catch (error) {
        console.error('Error sending test notification:', error);
        showAlert('Failed to send test notification', 'error');
    }
}

// Create and send backup to Telegram
async function createAndSendBackup() {
    const includeUsers = document.getElementById('backupUsers').checked;
    const includeProducts = document.getElementById('backupProducts').checked;
    const includeOrders = document.getElementById('backupOrders').checked;
    
    if (!includeUsers && !includeProducts && !includeOrders) {
        showAlert('Please select at least one backup option', 'warning');
        return;
    }
    
    try {
        showAlert('Creating and sending backup to Telegram...', 'info');
        
        const response = await apiCall('/api/admin/create-backup', 'POST', {
            includeUsers,
            includeProducts,
            includeOrders,
            sendToTelegram: true
        });
        
        if (response.success) {
            showAlert('Backup created and sent to Telegram successfully!', 'success');
            updateLastBackupTime();
        } else {
            showAlert('Failed to create and send backup', 'error');
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        showAlert('Failed to create and send backup', 'error');
    }
}

// Download backup locally
async function downloadBackup() {
    const includeUsers = document.getElementById('backupUsers').checked;
    const includeProducts = document.getElementById('backupProducts').checked;
    const includeOrders = document.getElementById('backupOrders').checked;
    
    if (!includeUsers && !includeProducts && !includeOrders) {
        showAlert('Please select at least one backup option', 'warning');
        return;
    }
    
    try {
        showAlert('Creating backup for download...', 'info');
        
        const response = await apiCall('/api/admin/create-backup', 'POST', {
            includeUsers,
            includeProducts,
            includeOrders,
            sendToTelegram: false
        });
        
        if (response.success && response.downloadUrl) {
            // Download the backup file
            const link = document.createElement('a');
            link.href = response.downloadUrl;
            link.download = response.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showAlert('Backup downloaded successfully!', 'success');
            updateLastBackupTime();
        } else {
            showAlert('Failed to create backup for download', 'error');
        }
    } catch (error) {
        console.error('Error downloading backup:', error);
        showAlert('Failed to download backup', 'error');
    }
}

// Update last backup time
function updateLastBackupTime() {
    const now = new Date();
    const timeString = now.toLocaleString();
    document.getElementById('lastBackupTime').textContent = timeString;
}

// Load auto backup settings
async function loadAutoBackupSettings() {
    try {
        const response = await apiCall('/api/admin/auto-backup-settings');
        
        const checkbox = document.getElementById('autoBackupEnabled');
        const frequencyOptions = document.getElementById('backupFrequencyOptions');
        const intervalSelect = document.getElementById('backupInterval');
        
        checkbox.checked = response.enabled || false;
        
        if (response.enabled) {
            frequencyOptions.style.display = 'block';
            intervalSelect.value = response.interval || 'daily';
        } else {
            frequencyOptions.style.display = 'none';
        }
        
        // Update scheduled backup display
        updateScheduledBackupTime(response.scheduledTime);
        updateAutoBackupStatus(response.enabled, response.scheduledTime);
        
    } catch (error) {
        console.error('Error loading auto backup settings:', error);
        document.getElementById('autoBackupEnabled').checked = false;
        document.getElementById('backupFrequencyOptions').style.display = 'none';
        updateScheduledBackupTime(null);
        updateAutoBackupStatus(false, null);
    }
}

// Toggle auto backup
async function toggleAutoBackup() {
    const enabled = document.getElementById('autoBackupEnabled').checked;
    const frequencyOptions = document.getElementById('backupFrequencyOptions');
    const interval = document.getElementById('backupInterval').value;
    
    if (enabled) {
        frequencyOptions.style.display = 'block';
    } else {
        frequencyOptions.style.display = 'none';
    }
    
    try {
        const response = await apiCall('/api/admin/auto-backup-settings', 'POST', {
            enabled,
            interval
        });
        
        if (response.success) {
            showAlert(`Auto backup ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } else {
            showAlert('Failed to update auto backup settings', 'error');
            document.getElementById('autoBackupEnabled').checked = !enabled;
            frequencyOptions.style.display = enabled ? 'none' : 'block';
        }
    } catch (error) {
        console.error('Error toggling auto backup:', error);
        showAlert('Failed to update auto backup settings', 'error');
        document.getElementById('autoBackupEnabled').checked = !enabled;
        frequencyOptions.style.display = enabled ? 'none' : 'block';
    }
}

// Show recover backup modal
function showRecoverBackupModal() {
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 600px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                    color: white;
                    border-radius: 16px 16px 0 0;
                ">
                    <h3 style="color: white; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-database"></i> Recover from Backup
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: white;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                
                <form id="dynamicRecoverBackupForm" style="padding: 2rem;">
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">
                            Select Backup File <span style="color: #e53e3e;">*</span>
                        </label>
                        <input type="file" id="dynamicBackupFile" accept=".json" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            transition: border-color 0.2s;
                        ">
                        <div style="font-size: 0.875rem; color: #4a5568; margin-top: 0.5rem;">
                            Only JSON backup files are supported
                        </div>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 1rem; font-weight: 600; color: #2d3748;">
                            Recovery Options:
                        </label>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <label style="
                                display: flex;
                                align-items: center;
                                padding: 1rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                cursor: pointer;
                                transition: all 0.2s;
                                background: #f7fafc;
                            " onclick="this.style.background = this.querySelector('input').checked ? '#e6fffa' : '#f7fafc'; this.style.borderColor = this.querySelector('input').checked ? '#38b2ac' : '#e2e8f0';">
                                <input type="checkbox" id="dynamicRestoreUsers" checked style="margin-right: 0.5rem; transform: scale(1.2);">
                                <span style="font-weight: 500;">Restore Users Data</span>
                            </label>
                            
                            <label style="
                                display: flex;
                                align-items: center;
                                padding: 1rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                cursor: pointer;
                                transition: all 0.2s;
                                background: #f7fafc;
                            " onclick="this.style.background = this.querySelector('input').checked ? '#e6fffa' : '#f7fafc'; this.style.borderColor = this.querySelector('input').checked ? '#38b2ac' : '#e2e8f0';">
                                <input type="checkbox" id="dynamicRestoreProducts" checked style="margin-right: 0.5rem; transform: scale(1.2);">
                                <span style="font-weight: 500;">Restore Products Data</span>
                            </label>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <label style="
                                display: flex;
                                align-items: center;
                                padding: 1rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                cursor: pointer;
                                transition: all 0.2s;
                                background: #f7fafc;
                            " onclick="this.style.background = this.querySelector('input').checked ? '#e6fffa' : '#f7fafc'; this.style.borderColor = this.querySelector('input').checked ? '#38b2ac' : '#e2e8f0';">
                                <input type="checkbox" id="dynamicRestoreOrders" checked style="margin-right: 0.5rem; transform: scale(1.2);">
                                <span style="font-weight: 500;">Restore Orders History</span>
                            </label>
                            
                            <label style="
                                display: flex;
                                align-items: center;
                                padding: 1rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                cursor: pointer;
                                transition: all 0.2s;
                                background: #f7fafc;
                            " onclick="this.style.background = this.querySelector('input').checked ? '#fff5f5' : '#f7fafc'; this.style.borderColor = this.querySelector('input').checked ? '#fc8181' : '#e2e8f0';">
                                <input type="checkbox" id="dynamicOverwriteExisting" style="margin-right: 0.5rem; transform: scale(1.2);">
                                <span style="font-weight: 500;">Overwrite Existing Data</span>
                            </label>
                        </div>
                    </div>

                    <div style="
                        margin-bottom: 1.5rem;
                        padding: 1rem;
                        background: #fff5f5;
                        border: 1px solid #fed7d7;
                        border-radius: 8px;
                    ">
                        <label style="
                            display: flex;
                            align-items: center;
                            cursor: pointer;
                            font-weight: 500;
                            color: #c53030;
                        " onclick="this.style.color = this.querySelector('input').checked ? '#e53e3e' : '#c53030';">
                            <input type="checkbox" id="dynamicFullRestore" style="margin-right: 0.5rem; transform: scale(1.2);">
                            <span>Full System Restore</span>
                        </label>
                        <div style="font-size: 0.875rem; color: #c53030; margin-top: 0.5rem; margin-left: 1.5rem;">
                            (Clears all data first)
                        </div>
                    </div>

                    <div style="
                        background: #fff3cd;
                        border: 1px solid #ffeaa7;
                        padding: 1rem;
                        border-radius: 8px;
                        margin-bottom: 2rem;
                    ">
                        <div style="display: flex; align-items: center; color: #856404; font-weight: 600; margin-bottom: 0.5rem;">
                            <i class="fas fa-exclamation-triangle" style="margin-right: 0.5rem;"></i>
                            Warning:
                        </div>
                        <div style="color: #856404; font-size: 0.875rem;">
                            This action will modify your database. Make sure you have a current backup before proceeding.
                        </div>
                    </div>

                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button type="button" onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #4a5568;
                            border: none;
                            border-radius: 8px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: background-color 0.2s;
                        ">Cancel</button>
                        <button type="submit" style="
                            padding: 0.75rem 1.5rem;
                            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                            color: white;
                            border: none;
                            border-radius: 8px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                            transition: transform 0.2s;
                        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="fas fa-upload"></i>
                            Restore Backup
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submit handler
    document.getElementById('dynamicRecoverBackupForm').addEventListener('submit', handleDynamicRecoverBackup);
}

// Handle dynamic recover backup form submission
async function handleDynamicRecoverBackup(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('dynamicBackupFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showAlert('Please select a backup file', 'error');
        return;
    }
    
    const restoreUsers = document.getElementById('dynamicRestoreUsers').checked;
    const restoreProducts = document.getElementById('dynamicRestoreProducts').checked;
    const restoreOrders = document.getElementById('dynamicRestoreOrders').checked;
    const overwriteExisting = document.getElementById('dynamicOverwriteExisting').checked;
    const fullRestore = document.getElementById('dynamicFullRestore').checked;
    
    if (!restoreUsers && !restoreProducts && !restoreOrders) {
        showAlert('Please select at least one restore option', 'warning');
        return;
    }
    
    // Confirm dangerous operations
    if (fullRestore) {
        if (!confirm('⚠️ DANGER: Full system restore will DELETE ALL existing data and replace it with the backup data. This action cannot be undone. Are you absolutely sure?')) {
            return;
        }
    } else if (overwriteExisting) {
        if (!confirm('⚠️ Warning: This will overwrite existing data with backup data. Continue?')) {
            return;
        }
    }
    
    try {
        showAlert('Processing backup restore...', 'info');
        
        const formData = new FormData();
        formData.append('backupFile', file);
        formData.append('restoreUsers', restoreUsers);
        formData.append('restoreProducts', restoreProducts);
        formData.append('restoreOrders', restoreOrders);
        formData.append('overwriteExisting', overwriteExisting);
        formData.append('fullRestore', fullRestore);
        
        const response = await fetch('/api/admin/restore-backup', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(`Backup restored successfully! ${result.message || ''}`, 'success');
            closeDynamicModal();
            
            // Refresh ALL data after restore
            await loadAllData();
            
            // Refresh current tab data
            const activeTab = document.querySelector('.tab-button.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (activeTab) {
                switchTab(activeTab);
            }
        } else {
            showAlert(`Restore failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
        showAlert('Failed to restore backup', 'error');
    }
}

// Handle recover backup form submission (legacy)
document.addEventListener('DOMContentLoaded', function() {
    const recoverForm = document.getElementById('recoverBackupForm');
    if (recoverForm) {
        recoverForm.addEventListener('submit', handleRecoverBackup);
    }
});

async function handleRecoverBackup(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('backupFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showAlert('Please select a backup file', 'error');
        return;
    }
    
    const restoreUsers = document.getElementById('restoreUsers').checked;
    const restoreProducts = document.getElementById('restoreProducts').checked;
    const restoreOrders = document.getElementById('restoreOrders').checked;
    const overwriteExisting = document.getElementById('overwriteExisting').checked;
    const fullRestore = document.getElementById('fullRestore').checked;
    
    if (!restoreUsers && !restoreProducts && !restoreOrders) {
        showAlert('Please select at least one restore option', 'warning');
        return;
    }
    
    // Confirm dangerous operations
    if (fullRestore) {
        if (!confirm('⚠️ DANGER: Full system restore will DELETE ALL existing data and replace it with the backup data. This action cannot be undone. Are you absolutely sure?')) {
            return;
        }
    } else if (overwriteExisting) {
        if (!confirm('⚠️ Warning: This will overwrite existing data with backup data. Continue?')) {
            return;
        }
    }
    
    try {
        showAlert('Processing backup restore...', 'info');
        
        const formData = new FormData();
        formData.append('backupFile', file);
        formData.append('restoreUsers', restoreUsers);
        formData.append('restoreProducts', restoreProducts);
        formData.append('restoreOrders', restoreOrders);
        formData.append('overwriteExisting', overwriteExisting);
        formData.append('fullRestore', fullRestore);
        
        const response = await fetch('/api/admin/restore-backup', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(`Backup restored successfully! ${result.message || ''}`, 'success');
            closeModal();
            
            // Refresh current tab data
            const activeTab = document.querySelector('.tab-button.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (activeTab) {
                switchTab(activeTab);
            }
        } else {
            showAlert(`Restore failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
        showAlert('Failed to restore backup', 'error');
    }
}

// Schedule backup in 6 hours
async function scheduleBackupIn6Hours() {
    try {
        showAlert('Scheduling backup for 6 hours from now...', 'info');
        
        const response = await apiCall('/api/admin/schedule-backup', 'POST');
        
        if (response.success) {
            const scheduledTime = new Date(response.scheduledTime);
            showAlert(`Backup scheduled for ${scheduledTime.toLocaleString()}`, 'success');
            updateScheduledBackupTime(response.scheduledTime);
        } else {
            showAlert('Failed to schedule backup', 'error');
        }
    } catch (error) {
        console.error('Error scheduling backup:', error);
        showAlert('Failed to schedule backup', 'error');
    }
}

// Cancel scheduled backup
async function cancelScheduledBackup() {
    try {
        const response = await apiCall('/api/admin/cancel-scheduled-backup', 'POST');
        
        if (response.success) {
            showAlert('Scheduled backup canceled', 'success');
            updateScheduledBackupTime(null);
        } else {
            showAlert('Failed to cancel scheduled backup', 'error');
        }
    } catch (error) {
        console.error('Error canceling scheduled backup:', error);
        showAlert('Failed to cancel scheduled backup', 'error');
    }
}

// Update scheduled backup time display
function updateScheduledBackupTime(scheduledTime) {
    const element = document.getElementById('scheduledBackupTime');
    if (scheduledTime) {
        const date = new Date(scheduledTime);
        element.textContent = date.toLocaleString();
        element.style.color = '#28a745';
        
        // Add cancel button if not exists
        if (!document.getElementById('cancelScheduledBackup')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancelScheduledBackup';
            cancelBtn.className = 'btn btn-danger btn-sm';
            cancelBtn.style.marginLeft = '10px';
            cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
            cancelBtn.onclick = cancelScheduledBackup;
            element.parentNode.appendChild(cancelBtn);
        }
    } else {
        element.textContent = 'None';
        element.style.color = '#6c757d';
        
        // Remove cancel button if exists
        const cancelBtn = document.getElementById('cancelScheduledBackup');
        if (cancelBtn) {
            cancelBtn.remove();
        }
    }
}

// Update auto backup status
function updateAutoBackupStatus(enabled, scheduledTime) {
    const statusElement = document.getElementById('autoBackupStatusText');
    const containerElement = document.getElementById('autoBackupStatus');
    
    if (scheduledTime) {
        const timeLeft = new Date(scheduledTime) - new Date();
        if (timeLeft > 0) {
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            statusElement.textContent = `Scheduled in ${hours}h ${minutes}m`;
            containerElement.style.background = '#fff3cd';
            containerElement.style.border = '1px solid #ffeaa7';
        } else {
            statusElement.textContent = 'Scheduled backup overdue';
            containerElement.style.background = '#f8d7da';
            containerElement.style.border = '1px solid #f5c6cb';
        }
    } else if (enabled) {
        statusElement.textContent = 'Enabled (regular interval)';
        containerElement.style.background = '#d4edda';
        containerElement.style.border = '1px solid #c3e6cb';
    } else {
        statusElement.textContent = 'Disabled';
        containerElement.style.background = '#f8f9fa';
        containerElement.style.border = '1px solid #dee2e6';
    }
}

// Auto-refresh data every 30 seconds
setInterval(() => {
    if (document.visibilityState === 'visible') {
        loadAllData();
        // Update scheduled backup countdown
        loadAutoBackupSettings();
    }
}, 30000);









// User Discounts Management
async function loadUserDiscounts() {
    try {
        const discounts = await apiCall('/api/admin/user-discounts');
        displayUserDiscounts(discounts);
    } catch (error) {
        console.error('Error loading user discounts:', error);
        showAlert('Failed to load user discounts', 'error');
    }
}

function displayUserDiscounts(discounts) {
    const tbody = document.getElementById('userDiscountsTableBody');
    
    if (!discounts || discounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="no-data">No user discounts found</td></tr>';
        return;
    }
    
    tbody.innerHTML = discounts.map(discount => {
        const expiresDate = discount.expires_date ? new Date(discount.expires_date).toLocaleDateString() : 'Never';
        const isExpired = discount.expires_date && new Date(discount.expires_date) < new Date();
        const statusClass = isExpired ? 'inactive' : discount.status;
        
        return `
            <tr>
                <td>${discount.id}</td>
                <td>${discount.username || 'Unknown'}</td>
                <td>${discount.account_title || 'All Products'}</td>
                <td>${discount.discount_percentage}%</td>
                <td>${discount.description || '-'}</td>
                <td>${expiresDate}</td>
                <td><span class="status-badge status-${statusClass}">${isExpired ? 'Expired' : discount.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editUserDiscount(${discount.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUserDiscount(${discount.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Coupon Codes Management
async function loadCouponCodes() {
    try {
        const coupons = await apiCall('/api/admin/coupon-codes');
        displayCouponCodes(coupons);
    } catch (error) {
        console.error('Error loading coupon codes:', error);
        showAlert('Failed to load coupon codes', 'error');
    }
}

function displayCouponCodes(coupons) {
    const tbody = document.getElementById('couponCodesTableBody');
    
    if (!coupons || coupons.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">No coupon codes found</td></tr>';
        return;
    }
    
    tbody.innerHTML = coupons.map(coupon => {
        const expiresDate = coupon.expires_date ? new Date(coupon.expires_date).toLocaleDateString() : 'Never';
        const isExpired = coupon.expires_date && new Date(coupon.expires_date) < new Date();
        const statusClass = isExpired ? 'inactive' : coupon.status;
        
        return `
            <tr>
                <td>${coupon.id}</td>
                <td><code>${coupon.code}</code></td>
                <td>${coupon.account_title || 'All Products'}</td>
                <td>${coupon.discount_percentage}%</td>
                <td>${coupon.max_uses && coupon.max_uses > 0 ? coupon.max_uses : 'Unlimited'}</td>
                <td>${coupon.used_count || 0}</td>
                <td>${expiresDate}</td>
                <td><span class="status-badge status-${statusClass}">${isExpired ? 'Expired' : coupon.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editCouponCode(${coupon.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCouponCode(${coupon.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Load users and products for dropdowns
async function loadUsersForDiscounts() {
    try {
        const users = await apiCall('/api/admin/users');
        const select = document.getElementById('userDiscountUser');
        if (select) {
            select.innerHTML = '<option value="">Select User</option>';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.username} (${user.credits} credits)`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading users for discounts:', error);
    }
}

async function loadProductsForDiscounts() {
    try {
        const products = await apiCall('/api/admin/accounts');
        const userDiscountSelect = document.getElementById('userDiscountProduct');
        const couponProductSelect = document.getElementById('couponProduct');
        
        [userDiscountSelect, couponProductSelect].forEach(select => {
            if (select) {
                select.innerHTML = '<option value="">All Products</option>';
                products.forEach(product => {
                    const option = document.createElement('option');
                    option.value = product.id;
                    option.textContent = `${product.title} (${product.credit_cost} credits)`;
                    select.appendChild(option);
                });
            }
        });
    } catch (error) {
        console.error('Error loading products for discounts:', error);
    }
}

// Edit and Delete User Discounts
async function editUserDiscount(id) {
    console.log('Edit user discount clicked for ID:', id);
    try {
        const discounts = await apiCall('/api/admin/user-discounts');
        console.log('Fetched discounts:', discounts);
        const discount = discounts.find(d => d.id === id);
        console.log('Found discount:', discount);
        
        if (!discount) {
            showAlert('Discount not found', 'error');
            return;
        }
        
        // Get users and products for dropdowns
        const [users, products] = await Promise.all([
            apiCall('/api/admin/users'),
            apiCall('/api/admin/accounts')
        ]);
        
        // Remove any existing modal
        const existingModal = document.getElementById('dynamicModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create modal HTML
        const modalHTML = `
            <div id="dynamicModal" style="
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(0, 0, 0, 0.5) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 2147483647 !important;
                padding: 20px !important;
                box-sizing: border-box !important;
            ">
                <div style="
                    position: relative !important;
                    background: white !important;
                    border-radius: 16px !important;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                    max-width: 600px !important;
                    width: 90% !important;
                    max-height: 90vh !important;
                    overflow-y: auto !important;
                    padding: 0 !important;
                ">
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 1.5rem;
                        padding: 2rem 2rem 1rem 2rem;
                        border-bottom: 1px solid #e2e8f0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border-radius: 16px 16px 0 0;
                    ">
                        <h3 style="color: white; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                            <i class="fas fa-edit"></i> Edit User Discount
                        </h3>
                        <button onclick="closeDynamicModal()" style="
                            background: none;
                            border: none;
                            font-size: 1.5rem;
                            cursor: pointer;
                            color: white;
                            padding: 0;
                            width: 2rem;
                            height: 2rem;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 50%;
                        ">&times;</button>
                    </div>
                    <form id="dynamicEditDiscountForm" style="padding: 0 2rem 2rem 2rem;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">User *</label>
                                <select name="userId" required style="
                                    width: 100%;
                                    padding: 0.75rem;
                                    border: 2px solid #e2e8f0;
                                    border-radius: 8px;
                                    font-size: 1rem;
                                    box-sizing: border-box;
                                ">
                                    <option value="">Select User</option>
                                    ${users.map(user => `
                                        <option value="${user.id}" ${user.id === discount.user_id ? 'selected' : ''}>
                                            ${user.username} (${user.credits} credits)
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Product</label>
                                <select name="productId" style="
                                    width: 100%;
                                    padding: 0.75rem;
                                    border: 2px solid #e2e8f0;
                                    border-radius: 8px;
                                    font-size: 1rem;
                                    box-sizing: border-box;
                                ">
                                    <option value="">All Products</option>
                                    ${products.map(product => `
                                        <option value="${product.id}" ${product.id === discount.account_id ? 'selected' : ''}>
                                            ${product.title} (${product.credit_cost} credits)
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Discount Percentage *</label>
                                <input type="number" name="percentage" min="1" max="100" required value="${discount.discount_percentage}" style="
                                    width: 100%;
                                    padding: 0.75rem;
                                    border: 2px solid #e2e8f0;
                                    border-radius: 8px;
                                    font-size: 1rem;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Expires Date</label>
                                <input type="datetime-local" name="expiresDate" value="${discount.expires_date ? new Date(discount.expires_date).toISOString().slice(0, 16) : ''}" style="
                                    width: 100%;
                                    padding: 0.75rem;
                                    border: 2px solid #e2e8f0;
                                    border-radius: 8px;
                                    font-size: 1rem;
                                    box-sizing: border-box;
                                ">
                            </div>
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Description</label>
                            <input type="text" name="description" value="${discount.description || ''}" placeholder="e.g. VIP customer discount" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Status</label>
                            <select name="status" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                                <option value="active" ${discount.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="inactive" ${discount.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                            <button type="button" onclick="closeDynamicModal()" style="
                                padding: 0.75rem 1.5rem;
                                background: #e2e8f0;
                                color: #2d3748;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 1rem;
                            ">Cancel</button>
                            <button type="submit" style="
                                padding: 0.75rem 1.5rem;
                                background: #667eea;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 1rem;
                            "><i class="fas fa-save"></i> Update Discount</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        // Append to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add form submission handler
        document.getElementById('dynamicEditDiscountForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const updateData = {
                user_id: parseInt(formData.get('userId')),
                account_id: formData.get('productId') ? parseInt(formData.get('productId')) : null,
                discount_percentage: parseInt(formData.get('percentage')),
                description: formData.get('description'),
                expires_date: formData.get('expiresDate') || null,
                status: formData.get('status')
            };
            
            try {
                const result = await apiCall(`/api/admin/user-discounts/${id}`, 'PUT', updateData);
                
                if (result.success) {
                    showAlert('User discount updated successfully!', 'success');
                    closeDynamicModal();
                    loadUserDiscounts();
                } else {
                    showAlert(result.error || 'Failed to update user discount', 'error');
                }
            } catch (error) {
                console.error('Error updating user discount:', error);
                showAlert('Failed to update user discount', 'error');
            }
        });
        
        console.log('Dynamic edit discount modal created');
        
    } catch (error) {
        console.error('Error loading discount for edit:', error);
        showAlert('Failed to load discount details', 'error');
    }
}

async function loadUsersForEdit(selectedUserId) {
    try {
        const users = await apiCall('/api/admin/users');
        const select = document.getElementById('editUserDiscountUser');
        select.innerHTML = '<option value="">Select User</option>';
        
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.username} (${user.credits} credits)`;
            if (user.id === selectedUserId) option.selected = true;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading users for edit:', error);
    }
}

async function loadProductsForEdit(selectedProductId) {
    try {
        const products = await apiCall('/api/admin/accounts');
        const select = document.getElementById('editUserDiscountProduct');
        select.innerHTML = '<option value="">All Products</option>';
        
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.title} (${product.credit_cost} credits)`;
            if (product.id === selectedProductId) option.selected = true;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading products for edit:', error);
    }
}

async function updateUserDiscount(id) {
    const form = document.getElementById('editUserDiscountForm');
    const formData = new FormData(form);
    
    const updateData = {
        user_id: parseInt(formData.get('userId')),
        account_id: formData.get('productId') ? parseInt(formData.get('productId')) : null,
        discount_percentage: parseInt(formData.get('percentage')),
        description: formData.get('description'),
        expires_date: formData.get('expiresDate') || null,
        status: formData.get('status')
    };
    
    try {
        const result = await apiCall(`/api/admin/user-discounts/${id}`, 'PUT', updateData);
        
        if (result.success) {
            showAlert('User discount updated successfully!', 'success');
            closeEditDiscountModal();
            loadUserDiscounts();
        } else {
            showAlert(result.error || 'Failed to update user discount', 'error');
        }
    } catch (error) {
        console.error('Error updating user discount:', error);
        showAlert('Failed to update user discount', 'error');
    }
}

function closeEditDiscountModal() {
    const modal = document.getElementById('editDiscountModalOverlay');
    if (modal) {
        modal.remove();
    }
}

async function deleteUserDiscount(id) {
    if (!confirm('Are you sure you want to delete this user discount? This action cannot be undone.')) {
        return;
    }
    
    try {
        const result = await apiCall(`/api/admin/user-discounts/${id}`, 'DELETE');
        
        if (result.success) {
            showAlert('User discount deleted successfully!', 'success');
            loadUserDiscounts();
        } else {
            showAlert(result.error || 'Failed to delete user discount', 'error');
        }
    } catch (error) {
        console.error('Error deleting user discount:', error);
        showAlert('Failed to delete user discount', 'error');
    }
}

// Edit and Delete Coupon Codes
async function editCouponCode(id) {
    console.log('Edit coupon code clicked for ID:', id);
    try {
        const coupons = await apiCall('/api/admin/coupon-codes');
        console.log('Fetched coupons:', coupons);
        const coupon = coupons.find(c => c.id === id);
        console.log('Found coupon:', coupon);
        
        if (!coupon) {
            showAlert('Coupon code not found', 'error');
            return;
        }
        
        // Create edit modal - Simple version
        const modalHTML = `
            <div id="editCouponModalOverlay" style="
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(0,0,0,0.7) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 999999 !important;
            ">
                <div id="editCouponModal" style="
                    background: white !important;
                    border-radius: 12px !important;
                    max-width: 600px !important;
                    width: 90% !important;
                    max-height: 90vh !important;
                    overflow-y: auto !important;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3) !important;
                    position: relative !important;
                ">
                    <div style="background: #667eea; color: white; padding: 20px; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0;"><i class="fas fa-edit" style="margin-right: 10px;"></i>Edit Coupon Code</h3>
                        <button onclick="closeEditCouponModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">&times;</button>
                    </div>
                        <div class="modal-body" style="padding: 20px;">
                            <form id="editCouponCodeForm">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label for="editCouponCode">Coupon Code *</label>
                                        <input type="text" id="editCouponCode" name="code" required 
                                               value="${coupon.code}">
                                    </div>
                                    <div class="form-group">
                                        <label for="editCouponProduct">Product</label>
                                        <select id="editCouponProduct" name="productId">
                                            <option value="">All Products</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div class="form-row">
                                    <div class="form-group">
                                        <label for="editCouponPercentage">Discount Percentage *</label>
                                        <input type="number" id="editCouponPercentage" name="percentage" 
                                               min="1" max="100" required value="${coupon.discount_percentage}">
                                    </div>
                                    <div class="form-group">
                                        <label for="editCouponMaxUses">Maximum Uses</label>
                                        <input type="number" id="editCouponMaxUses" name="maxUses" 
                                               min="0" value="${coupon.max_uses || 0}">
                                    </div>
                                </div>
                                
                                <div class="form-row">
                                    <div class="form-group">
                                        <label for="editCouponExpires">Expires Date</label>
                                        <input type="datetime-local" id="editCouponExpires" name="expiresDate"
                                               value="${coupon.expires_date ? new Date(coupon.expires_date).toISOString().slice(0, 16) : ''}">
                                    </div>
                                    <div class="form-group">
                                        <label for="editCouponDescription">Description</label>
                                        <input type="text" id="editCouponDescription" name="description" 
                                               value="${coupon.description || ''}" placeholder="e.g. Black Friday Sale">
                                    </div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="editCouponStatus">Status</label>
                                    <select id="editCouponStatus" name="status">
                                        <option value="active" ${coupon.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="inactive" ${coupon.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div style="padding: 20px; text-align: right; border-top: 1px solid #eee; display: flex; gap: 10px; justify-content: flex-end;">
                            <button type="button" onclick="closeEditCouponModal()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer;">Cancel</button>
                            <button type="button" onclick="updateCouponCode(${id})" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                <i class="fas fa-save"></i> Update Coupon
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        console.log('Coupon modal HTML inserted into page');
        
        // Load products for edit form
        await loadProductsForCouponEdit(coupon.account_id);
        
        console.log('Coupon modal should be visible now');
        
        // Simple check if modal exists
        const modalOverlay = document.getElementById('editCouponModalOverlay');
        if (modalOverlay) {
            console.log('✅ Modal overlay found in DOM');
            
            // Add click outside to close
            modalOverlay.addEventListener('click', function(e) {
                if (e.target === modalOverlay) {
                    closeEditCouponModal();
                }
            });
        } else {
            console.log('❌ Modal overlay NOT found in DOM');
        }
        
        // Auto-uppercase coupon code input
        const editCouponInput = document.getElementById('editCouponCode');
        if (editCouponInput) {
            editCouponInput.addEventListener('input', function(e) {
                e.target.value = e.target.value.toUpperCase();
            });
        }
        
    } catch (error) {
        console.error('Error loading coupon for edit:', error);
        showAlert('Failed to load coupon details', 'error');
    }
}

async function loadProductsForCouponEdit(selectedProductId) {
    try {
        const products = await apiCall('/api/admin/accounts');
        const select = document.getElementById('editCouponProduct');
        select.innerHTML = '<option value="">All Products</option>';
        
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.title} (${product.credit_cost} credits)`;
            if (product.id === selectedProductId) option.selected = true;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading products for coupon edit:', error);
    }
}

async function updateCouponCode(id) {
    const form = document.getElementById('editCouponCodeForm');
    const formData = new FormData(form);
    
    const maxUsesValue = formData.get('maxUses');
    const maxUsesInt = parseInt(maxUsesValue);
    
    const updateData = {
        code: formData.get('code').toUpperCase(),
        productId: formData.get('productId') ? parseInt(formData.get('productId')) : null,
        percentage: parseInt(formData.get('percentage')),
        maxUses: maxUsesValue === '' || maxUsesValue === '0' || maxUsesInt === 0 ? 0 : maxUsesInt,
        description: formData.get('description'),
        expiresDate: formData.get('expiresDate') || null,
        status: formData.get('status')
    };
    
    console.log('Updating coupon with data:', updateData);
    
    try {
        const result = await apiCall(`/api/admin/coupon-codes/${id}`, 'PUT', updateData);
        
        console.log('Update result:', result);
        
        if (result.success) {
            showAlert('Coupon code updated successfully!', 'success');
            closeEditCouponModal();
            loadCouponCodes();
        } else {
            showAlert(result.error || 'Failed to update coupon code', 'error');
        }
    } catch (error) {
        console.error('Error updating coupon code:', error);
        showAlert('Failed to update coupon code', 'error');
    }
}

function closeEditCouponModal() {
    const modal = document.getElementById('editCouponModalOverlay');
    if (modal) {
        modal.remove();
        console.log('Modal closed and removed');
    }
}

async function deleteCouponCode(id) {
    if (!confirm('Are you sure you want to delete this coupon code? This action cannot be undone.')) {
        return;
    }
    
    try {
        const result = await apiCall(`/api/admin/coupon-codes/${id}`, 'DELETE');
        
        if (result.success) {
            showAlert('Coupon code deleted successfully!', 'success');
            loadCouponCodes();
        } else {
            showAlert(result.error || 'Failed to delete coupon code', 'error');
        }
    } catch (error) {
        console.error('Error deleting coupon code:', error);
        showAlert('Failed to delete coupon code', 'error');
    }
}

// Make switchDiscountTab global
window.switchDiscountTab = switchDiscountTab;

// Add form handlers for discount management
(function() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDiscountForms);
    } else {
        initDiscountForms();
    }
    
    function initDiscountForms() {
        // User Discount Form
        const userDiscountForm = document.getElementById('addUserDiscountForm');
        if (userDiscountForm) {
            userDiscountForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const formData = new FormData(this);
                const discountData = {
                    user_id: parseInt(formData.get('userId')),
                    account_id: formData.get('productId') ? parseInt(formData.get('productId')) : null,
                    discount_percentage: parseInt(formData.get('percentage')),
                    description: formData.get('description'),
                    expires_date: formData.get('expiresDate') || null
                };
                
                // Validation
                if (!discountData.user_id) {
                    showAlert('Please select a user', 'error');
                    return;
                }
                
                if (!discountData.discount_percentage || discountData.discount_percentage < 1 || discountData.discount_percentage > 100) {
                    showAlert('Please enter a valid discount percentage (1-100)', 'error');
                    return;
                }
                
                try {
                    const result = await apiCall('/api/admin/user-discounts', 'POST', discountData);
                    if (result.success) {
                        showAlert('User discount added successfully!', 'success');
                        this.reset();
                        loadUserDiscounts();
                        loadUsersForDiscounts();
                        loadProductsForDiscounts();
                    } else {
                        showAlert(result.error || 'Failed to add user discount', 'error');
                    }
                } catch (error) {
                    console.error('Error adding user discount:', error);
                    showAlert('Failed to add user discount', 'error');
                }
            });
        }
        
        // Coupon Code Form
        const couponCodeForm = document.getElementById('addCouponCodeForm');
        if (couponCodeForm) {
            couponCodeForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const formData = new FormData(this);
                const maxUsesValue = formData.get('maxUses');
                const maxUsesInt = parseInt(maxUsesValue);
                
                const couponData = {
                    code: formData.get('code').toUpperCase(),
                    productId: formData.get('productId') ? parseInt(formData.get('productId')) : null,
                    percentage: parseInt(formData.get('percentage')),
                    maxUses: maxUsesValue === '' || maxUsesValue === '0' || maxUsesInt === 0 ? 0 : maxUsesInt,
                    description: formData.get('description'),
                    expiresDate: formData.get('expiresDate') || null
                };
                
                console.log('Creating coupon with data:', couponData);
                
                // Validation
                if (!couponData.code || couponData.code.length < 3) {
                    showAlert('Please enter a valid coupon code (at least 3 characters)', 'error');
                    return;
                }
                
                if (!couponData.percentage || couponData.percentage < 1 || couponData.percentage > 100) {
                    showAlert('Please enter a valid discount percentage (1-100)', 'error');
                    return;
                }
                
                try {
                    const result = await apiCall('/api/admin/coupon-codes', 'POST', couponData);
                    if (result.success) {
                        showAlert('Coupon code added successfully!', 'success');
                        this.reset();
                        loadCouponCodes();
                        loadProductsForDiscounts();
                    } else {
                        showAlert(result.error || 'Failed to add coupon code', 'error');
                    }
                } catch (error) {
                    console.error('Error adding coupon code:', error);
                    showAlert('Failed to add coupon code', 'error');
                }
            });
        }
        
        // Auto-uppercase coupon code input
        const couponCodeInput = document.getElementById('couponCode');
        if (couponCodeInput) {
            couponCodeInput.addEventListener('input', function(e) {
                e.target.value = e.target.value.toUpperCase();
            });
        }
    }
})();









// Shared Accounts Management
let sharedAccountsData = [];

// Load shared accounts tab
async function loadSharedAccountsTab() {
    // Don't auto-load anything here, let switchSharedTab handle it
    console.log('Shared accounts tab loaded');
}

// Load shared accounts data
async function loadSharedAccounts() {
    try {
        sharedAccountsData = await apiCall('/api/admin/shared-accounts');
        renderSharedAccountsTable();
    } catch (error) {
        console.error('Error loading shared accounts:', error);
        showAlert('Failed to load shared accounts', 'error');
    }
}

// Render shared accounts table
function renderSharedAccountsTable() {
    const tbody = document.getElementById('sharedAccountsTableBody');
    tbody.innerHTML = '';
    
    if (!sharedAccountsData || sharedAccountsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #718096;">No shared accounts found. Add one to get started!</td></tr>';
        return;
    }
    
    sharedAccountsData.forEach(account => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${account.id}</td>
            <td>${account.account_name}</td>
            <td>${account.description || 'No description'}</td>
            <td><span class="status-badge status-${account.status}">${account.status}</span></td>
            <td>${formatDate(account.created_date)}</td>
            <td>
                <button class="action-btn action-btn-edit" onclick="editSharedAccount(${account.id})">Edit</button>
                <button class="action-btn action-btn-delete" onclick="deleteSharedAccount(${account.id})">Delete</button>
                <button class="action-btn action-btn-view" onclick="viewSharedAccountDetails(${account.id})">View</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function loadSharedCodes() {
    try {
        sharedCodesData = await apiCall('/api/admin/shared-codes');
        renderSharedCodesTable();
    } catch (error) {
        console.error('Error loading shared codes:', error);
        showAlert('Failed to load shared codes', 'error');
    }
}

function renderSharedCodesTable() {
    const tbody = document.getElementById('sharedCodesTableBody');
    tbody.innerHTML = '';
    
    if (!sharedCodesData || sharedCodesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #718096;">No shared codes found. Add one to get started!</td></tr>';
        return;
    }
    
    sharedCodesData.forEach(code => {
        const usageText = code.usage_limit > 0 
            ? `${code.usage_count}/${code.usage_limit}` 
            : `${code.usage_count}/∞`;
        
        const assignedUserText = code.assigned_user === 'everyone' 
            ? '<span style="color: #48bb78;">Everyone</span>' 
            : `<span style="color: #667eea;">${code.assigned_user}</span>`;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${code.id}</td>
            <td>${code.account_name}</td>
            <td>
                <span class="auth-code auth-code-tooltip" onclick="copyUniqueCode('${code.unique_code}')" style="
                    cursor: pointer;
                    background: #e6fffa;
                    color: #234e52;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    font-family: monospace;
                    font-weight: 600;
                ">
                    ${code.unique_code}
                </span>
            </td>
            <td>${usageText}</td>
            <td>${assignedUserText}</td>
            <td><span class="status-badge status-${code.status}">${code.status}</span></td>
            <td>${formatDate(code.created_date)}</td>
            <td>
                <button class="action-btn action-btn-edit" onclick="editSharedCode(${code.id})">Edit</button>
                <button class="action-btn action-btn-delete" onclick="deleteSharedCode(${code.id})">Delete</button>
                <button class="action-btn action-btn-view" onclick="viewSharedCodeDetails(${code.id})">View</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Show Add Shared Account Modal
function showAddSharedAccountModal() {
    console.log('showAddSharedAccountModal called');
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // No unique code needed in account form anymore
    
    // Create modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 600px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <h3 style="color: #2d3748; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-share-alt"></i> Add Shared Account
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: #718096;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                <form id="dynamicAddSharedAccountForm" style="padding: 0 2rem 2rem 2rem;">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Account Name *</label>
                        <input type="text" name="accountName" required placeholder="e.g., Netflix Premium, Discord Nitro" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Username *</label>
                            <input type="text" name="username" required placeholder="Account username" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Password *</label>
                            <input type="password" name="password" required placeholder="Account password" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                        </div>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">2FA Secret *</label>
                        <input type="text" name="twoFaSecret" required placeholder="Base32 encoded 2FA secret" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                        <small style="color: #718096; font-size: 0.8rem;">The base32 secret from the 2FA setup (not the QR code)</small>
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Description</label>
                        <textarea name="description" rows="2" placeholder="Optional description for this shared account" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            resize: vertical;
                            box-sizing: border-box;
                        "></textarea>
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button type="button" onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #2d3748;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Cancel</button>
                        <button type="submit" style="
                            padding: 0.75rem 1.5rem;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Add Shared Account</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submit handler
    document.getElementById('dynamicAddSharedAccountForm').addEventListener('submit', handleDynamicAddSharedAccount);
}

// Handle add shared account form submission
async function handleDynamicAddSharedAccount(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const sharedAccountData = {
        accountName: formData.get('accountName'),
        username: formData.get('username'),
        password: formData.get('password'),
        twoFaSecret: formData.get('twoFaSecret'),
        description: formData.get('description')
    };
    
    try {
        await apiCall('/api/admin/shared-accounts', 'POST', sharedAccountData);
        
        showAlert('Shared account added successfully!', 'success');
        closeDynamicModal();
        loadSharedAccounts(); // Reload the table
        
    } catch (error) {
        console.error('Error adding shared account:', error);
        showAlert('Failed to add shared account: ' + error.message, 'error');
    }
}

// Show Add Shared Code Modal
function showAddSharedCodeModal() {
    console.log('showAddSharedCodeModal called');
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Generate unique code
    const uniqueCode = generateUniqueCode();
    
    // Create modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 500px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <h3 style="color: #2d3748; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-key"></i> Add Shared Code
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: #718096;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                <form id="dynamicAddSharedCodeForm" style="padding: 0 2rem 2rem 2rem;">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Account *</label>
                        <select name="accountId" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                            <option value="">Select an account...</option>
                            ${sharedAccountsData.map(account => 
                                `<option value="${account.id}">${account.account_name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Unique Code *</label>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input type="text" name="uniqueCode" value="${uniqueCode}" required style="
                                flex: 1;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                            <button type="button" onclick="regenerateUniqueCode()" style="
                                padding: 0.75rem;
                                background: #667eea;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 0.9rem;
                            ">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                        </div>
                        <small style="color: #718096; font-size: 0.8rem;">Users will use this code to get 2FA codes</small>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Usage Limit</label>
                            <input type="number" name="usageLimit" min="0" placeholder="0 = unlimited" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                            <small style="color: #718096; font-size: 0.8rem;">0 = unlimited uses</small>
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Assigned User</label>
                            <input type="text" name="assignedUser" placeholder="everyone" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                            <small style="color: #718096; font-size: 0.8rem;">Leave empty for everyone</small>
                        </div>
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button type="button" onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #2d3748;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Cancel</button>
                        <button type="submit" style="
                            padding: 0.75rem 1.5rem;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Add Code</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Append modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submit handler
    document.getElementById('dynamicAddSharedCodeForm').addEventListener('submit', handleDynamicAddSharedCode);
}

// Handle add shared code form submission
async function handleDynamicAddSharedCode(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const sharedCodeData = {
        accountId: parseInt(formData.get('accountId')),
        uniqueCode: formData.get('uniqueCode'),
        usageLimit: parseInt(formData.get('usageLimit')) || 0,
        assignedUser: formData.get('assignedUser') || 'everyone'
    };
    
    try {
        await apiCall('/api/admin/shared-codes', 'POST', sharedCodeData);
        
        showAlert('Shared code added successfully!', 'success');
        closeDynamicModal();
        loadSharedCodes(); // Reload the table
        
    } catch (error) {
        console.error('Error adding shared code:', error);
        showAlert('Failed to add shared code: ' + error.message, 'error');
    }
}

// Edit shared code
async function editSharedCode(codeId) {
    // Find the code data
    const code = sharedCodesData.find(c => c.id === codeId);
    if (!code) {
        showAlert('Shared code not found', 'error');
        return;
    }
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create edit modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 500px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <h3 style="color: #2d3748; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-edit"></i> Edit Shared Code
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: #718096;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                <form id="dynamicEditSharedCodeForm" style="padding: 0 2rem 2rem 2rem;">
                    <input type="hidden" name="codeId" value="${code.id}">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Account *</label>
                        <select name="accountId" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                            <option value="">Select an account...</option>
                            ${sharedAccountsData.map(account => 
                                `<option value="${account.id}" ${account.id === code.account_id ? 'selected' : ''}>${account.account_name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Unique Code *</label>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input type="text" name="uniqueCode" value="${code.unique_code}" required style="
                                flex: 1;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                            <button type="button" onclick="regenerateUniqueCode()" style="
                                padding: 0.75rem;
                                background: #667eea;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 0.9rem;
                            ">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                        </div>
                        <small style="color: #718096; font-size: 0.8rem;">Users will use this code to get 2FA codes</small>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Usage Limit</label>
                            <input type="number" name="usageLimit" value="${code.usage_limit}" min="0" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                            <small style="color: #718096; font-size: 0.8rem;">0 = unlimited uses</small>
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Usage Count</label>
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                <input type="number" name="usageCount" value="${code.usage_count}" min="0" style="
                                    flex: 1;
                                    padding: 0.75rem;
                                    border: 2px solid #e2e8f0;
                                    border-radius: 8px;
                                    font-size: 1rem;
                                    box-sizing: border-box;
                                ">
                                <button type="button" onclick="resetUsageCount()" style="
                                    padding: 0.75rem;
                                    background: #f56565;
                                    color: white;
                                    border: none;
                                    border-radius: 8px;
                                    cursor: pointer;
                                    font-size: 0.8rem;
                                ">Reset</button>
                            </div>
                            <small style="color: #718096; font-size: 0.8rem;">Current usage count</small>
                        </div>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Assigned User</label>
                            <input type="text" name="assignedUser" value="${code.assigned_user}" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                            <small style="color: #718096; font-size: 0.8rem;">Leave empty for everyone</small>
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Status</label>
                            <select name="status" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                                <option value="active" ${code.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="inactive" ${code.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button type="button" onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #2d3748;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Cancel</button>
                        <button type="submit" style="
                            padding: 0.75rem 1.5rem;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Update Code</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Append modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submit handler
    document.getElementById('dynamicEditSharedCodeForm').addEventListener('submit', handleDynamicEditSharedCode);
}

// Handle edit shared code form submission
async function handleDynamicEditSharedCode(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const codeId = formData.get('codeId');
    
    const sharedCodeData = {
        accountId: parseInt(formData.get('accountId')),
        uniqueCode: formData.get('uniqueCode'),
        usageLimit: parseInt(formData.get('usageLimit')) || 0,
        usageCount: parseInt(formData.get('usageCount')) || 0,
        assignedUser: formData.get('assignedUser') || 'everyone',
        status: formData.get('status')
    };
    
    try {
        await apiCall(`/api/admin/shared-codes/${codeId}`, 'PUT', sharedCodeData);
        
        showAlert('Shared code updated successfully!', 'success');
        closeDynamicModal();
        loadSharedCodes(); // Reload the table
        
    } catch (error) {
        console.error('Error updating shared code:', error);
        showAlert('Failed to update shared code: ' + error.message, 'error');
    }
}

// Delete shared code
async function deleteSharedCode(codeId) {
    if (!confirm('Are you sure you want to delete this shared code? This action cannot be undone.')) {
        return;
    }
    
    try {
        await apiCall(`/api/admin/shared-codes/${codeId}`, 'DELETE');
        showAlert('Shared code deleted successfully!', 'success');
        loadSharedCodes(); // Reload the table
    } catch (error) {
        console.error('Error deleting shared code:', error);
        showAlert('Failed to delete shared code: ' + error.message, 'error');
    }
}

// View shared code details
function viewSharedCodeDetails(codeId) {
    const code = sharedCodesData.find(c => c.id === codeId);
    if (!code) {
        showAlert('Shared code not found', 'error');
        return;
    }
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const usageText = code.usage_limit > 0 
        ? `${code.usage_count}/${code.usage_limit}` 
        : `${code.usage_count}/∞`;
    
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 500px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <h3 style="color: #2d3748; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-eye"></i> Shared Code Details
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: #718096;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                <div style="padding: 0 2rem 2rem 2rem;">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Account</label>
                        <div style="padding: 0.75rem; background: #f7fafc; border-radius: 8px; color: #2d3748;">${code.account_name}</div>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Unique Code</label>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <div style="
                                flex: 1;
                                padding: 0.75rem;
                                background: #e6fffa;
                                color: #234e52;
                                border-radius: 8px;
                                font-family: monospace;
                                font-weight: 600;
                            ">${code.unique_code}</div>
                            <button onclick="copyUniqueCode('${code.unique_code}')" style="
                                padding: 0.75rem;
                                background: #667eea;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 0.9rem;
                            ">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Usage</label>
                            <div style="padding: 0.75rem; background: #f7fafc; border-radius: 8px; color: #2d3748;">${usageText}</div>
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Assigned User</label>
                            <div style="padding: 0.75rem; background: #f7fafc; border-radius: 8px; color: #2d3748;">${code.assigned_user}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Status</label>
                            <div style="padding: 0.75rem; background: #f7fafc; border-radius: 8px; color: #2d3748;">${code.status}</div>
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Created Date</label>
                            <div style="padding: 0.75rem; background: #f7fafc; border-radius: 8px; color: #2d3748;">${formatDate(code.created_date)}</div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: center;">
                        <button onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Append modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Generate unique code
function generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Regenerate unique code in form
function regenerateUniqueCode() {
    const uniqueCodeInput = document.querySelector('input[name="uniqueCode"]');
    if (uniqueCodeInput) {
        uniqueCodeInput.value = generateUniqueCode();
    }
}

// Copy unique code to clipboard
function copyUniqueCode(uniqueCode) {
    copyToClipboard(uniqueCode, 'Unique code copied to clipboard!');
}

// Regenerate unique code in edit modal
function regenerateEditUniqueCode() {
    const newCode = generateUniqueCode();
    const uniqueCodeInput = document.querySelector('#dynamicEditSharedAccountForm input[name="uniqueCode"]');
    if (uniqueCodeInput) {
        uniqueCodeInput.value = newCode;
    }
}

// Reset usage count in edit modal
function resetUsageCount() {
    // Try both account and code forms
    const accountUsageInput = document.querySelector('#dynamicEditSharedAccountForm input[name="usageCount"]');
    const codeUsageInput = document.querySelector('#dynamicEditSharedCodeForm input[name="usageCount"]');
    
    if (accountUsageInput) {
        accountUsageInput.value = '0';
        showAlert('Usage count reset to 0', 'success');
    } else if (codeUsageInput) {
        codeUsageInput.value = '0';
        showAlert('Usage count reset to 0', 'success');
    }
}

// Edit shared account
async function editSharedAccount(accountId) {
    // Find the account data
    const account = sharedAccountsData.find(acc => acc.id === accountId);
    if (!account) {
        showAlert('Shared account not found', 'error');
        return;
    }
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create edit modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 600px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <h3 style="color: #2d3748; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-edit"></i> Edit Shared Account
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: #718096;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                <form id="dynamicEditSharedAccountForm" style="padding: 0 2rem 2rem 2rem;">
                    <input type="hidden" name="accountId" value="${account.id}">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Account Name *</label>
                        <input type="text" name="accountName" value="${account.account_name}" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Username *</label>
                            <input type="text" name="username" value="${account.username}" required style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Password *</label>
                            <input type="password" name="password" value="${account.password}" required style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                        </div>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">2FA Secret *</label>
                        <input type="text" name="twoFaSecret" value="${account.two_fa_secret}" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Description</label>
                        <textarea name="description" rows="2" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            resize: vertical;
                            box-sizing: border-box;
                        ">${account.description || ''}</textarea>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Usage Limit</label>
                            <input type="number" name="usageLimit" value="${account.usage_limit || 0}" min="0" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                            <small style="color: #718096; font-size: 0.8rem;">0 = unlimited uses</small>
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Assigned User</label>
                            <input type="text" name="assignedUser" value="${account.assigned_user || 'everyone'}" style="
                                width: 100%;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                            <small style="color: #718096; font-size: 0.8rem;">Leave empty for everyone</small>
                        </div>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Unique Code</label>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input type="text" name="uniqueCode" value="${account.unique_code}" style="
                                flex: 1;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                                font-weight: 600;
                                text-transform: uppercase;
                            ">
                            <button type="button" onclick="regenerateEditUniqueCode()" style="
                                padding: 0.75rem;
                                background: #667eea;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 0.9rem;
                            ">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                        </div>
                        <small style="color: #718096; font-size: 0.8rem;">Edit the unique code or generate a new one</small>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Usage Count</label>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input type="number" name="usageCount" value="${account.usage_count || 0}" min="0" style="
                                flex: 1;
                                padding: 0.75rem;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 1rem;
                                box-sizing: border-box;
                            ">
                            <button type="button" onclick="resetUsageCount()" style="
                                padding: 0.75rem 1rem;
                                background: #f56565;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 0.9rem;
                                white-space: nowrap;
                            ">
                                <i class="fas fa-undo"></i> Reset
                            </button>
                        </div>
                        <small style="color: #718096; font-size: 0.8rem;">Edit usage count or reset to 0</small>
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #2d3748;">Status</label>
                        <select name="status" style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            font-size: 1rem;
                            box-sizing: border-box;
                        ">
                            <option value="active" ${account.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${account.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button type="button" onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #2d3748;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Cancel</button>
                        <button type="submit" style="
                            padding: 0.75rem 1.5rem;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Update Account</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submit handler
    document.getElementById('dynamicEditSharedAccountForm').addEventListener('submit', handleDynamicEditSharedAccount);
}

// Handle edit shared account form submission
async function handleDynamicEditSharedAccount(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const accountId = formData.get('accountId');
    const sharedAccountData = {
        accountName: formData.get('accountName'),
        username: formData.get('username'),
        password: formData.get('password'),
        twoFaSecret: formData.get('twoFaSecret'),
        uniqueCode: formData.get('uniqueCode').toUpperCase(),
        description: formData.get('description'),
        usageLimit: parseInt(formData.get('usageLimit')) || 0,
        usageCount: parseInt(formData.get('usageCount')) || 0,
        assignedUser: formData.get('assignedUser') || 'everyone',
        status: formData.get('status')
    };
    
    try {
        await apiCall(`/api/admin/shared-accounts/${accountId}`, 'PUT', sharedAccountData);
        
        showAlert('Shared account updated successfully!', 'success');
        closeDynamicModal();
        loadSharedAccounts(); // Reload the table
        
    } catch (error) {
        console.error('Error updating shared account:', error);
        showAlert('Failed to update shared account: ' + error.message, 'error');
    }
}

// Delete shared account
async function deleteSharedAccount(accountId) {
    if (!confirm('Are you sure you want to delete this shared account? This action cannot be undone.')) {
        return;
    }
    
    try {
        await apiCall(`/api/admin/shared-accounts/${accountId}`, 'DELETE');
        showAlert('Shared account deleted successfully!', 'success');
        loadSharedAccounts(); // Reload the table
    } catch (error) {
        console.error('Error deleting shared account:', error);
        showAlert('Failed to delete shared account: ' + error.message, 'error');
    }
}

// View shared account details
function viewSharedAccountDetails(accountId) {
    const account = sharedAccountsData.find(acc => acc.id === accountId);
    if (!account) {
        showAlert('Shared account not found', 'error');
        return;
    }
    
    // Remove any existing modal
    const existingModal = document.getElementById('dynamicModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create view modal HTML
    const modalHTML = `
        <div id="dynamicModal" style="
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        ">
            <div style="
                position: relative !important;
                background: white !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                max-width: 500px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                padding: 0 !important;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding: 2rem 2rem 1rem 2rem;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <h3 style="color: #2d3748; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <i class="fas fa-eye"></i> Shared Account Details
                    </h3>
                    <button onclick="closeDynamicModal()" style="
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        color: #718096;
                        padding: 0;
                        width: 2rem;
                        height: 2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                    ">&times;</button>
                </div>
                <div style="padding: 0 2rem 2rem 2rem;">
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: #2d3748;">Account Name:</strong><br>
                        <span style="color: #4a5568;">${account.account_name}</span>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: #2d3748;">Username:</strong><br>
                        <span style="color: #4a5568; font-family: monospace; background: #f7fafc; padding: 0.25rem 0.5rem; border-radius: 4px;">${account.username}</span>
                        <button onclick="copyToClipboard('${account.username}', 'Username copied!')" style="margin-left: 0.5rem; padding: 0.25rem 0.5rem; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: #2d3748;">Password:</strong><br>
                        <span style="color: #4a5568; font-family: monospace; background: #f7fafc; padding: 0.25rem 0.5rem; border-radius: 4px;">••••••••</span>
                        <button onclick="copyToClipboard('${account.password}', 'Password copied!')" style="margin-left: 0.5rem; padding: 0.25rem 0.5rem; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: #2d3748;">Unique Code:</strong><br>
                        <span style="color: #4a5568; font-family: monospace; background: #f7fafc; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: bold;">${account.unique_code}</span>
                        <button onclick="copyToClipboard('${account.unique_code}', 'Unique code copied!')" style="margin-left: 0.5rem; padding: 0.25rem 0.5rem; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: #2d3748;">Description:</strong><br>
                        <span style="color: #4a5568;">${account.description || 'No description'}</span>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: #2d3748;">Usage:</strong><br>
                        <span style="color: #4a5568;">${account.usage_count || 0} / ${account.usage_limit > 0 ? account.usage_limit : '∞'}</span>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: #2d3748;">Assigned User:</strong><br>
                        <span style="color: #4a5568;">${account.assigned_user === 'everyone' ? 'Everyone' : account.assigned_user}</span>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: #2d3748;">Status:</strong><br>
                        <span class="status-badge status-${account.status}">${account.status}</span>
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <strong style="color: #2d3748;">Created:</strong><br>
                        <span style="color: #4a5568;">${formatDate(account.created_date)}</span>
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                        <button onclick="closeDynamicModal()" style="
                            padding: 0.75rem 1.5rem;
                            background: #e2e8f0;
                            color: #2d3748;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Close</button>
                        <button onclick="closeDynamicModal(); editSharedAccount(${account.id});" style="
                            padding: 0.75rem 1.5rem;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">Edit Account</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}









// --- SEARCH & SORT USERS ---
// let filteredUsersData = [];
// let currentSort = null; // 'asc' | 'desc' | null

function applyUserFilters() {
    const searchVal = document.getElementById('searchUserInput').value.trim().toLowerCase();
    filteredUsersData = usersData.filter(u => u.username.toLowerCase().includes(searchVal));
    if (currentSort === 'asc') {
        filteredUsersData.sort((a, b) => a.credits - b.credits);
    } else if (currentSort === 'desc') {
        filteredUsersData.sort((a, b) => b.credits - a.credits);
    }
    
    // Reset to page 1 when filtering
    usersCurrentPage = 1;
    renderUsersTable();
}

// Gắn event cho search & sort
window.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchUserInput');
    const sortDescBtn = document.getElementById('sortCreditDescBtn');
    const sortAscBtn = document.getElementById('sortCreditAscBtn');
    if (searchInput) {
        searchInput.addEventListener('input', applyUserFilters);
    }
    if (sortDescBtn) {
        sortDescBtn.addEventListener('click', () => {
            currentSort = 'desc';
            applyUserFilters();
        });
    }
    if (sortAscBtn) {
        sortAscBtn.addEventListener('click', () => {
            currentSort = 'asc';
            applyUserFilters();
        });
    }
});

// Render users table with pagination
function renderUsersTable() {
    const data = (typeof filteredUsersData !== 'undefined' && filteredUsersData.length > 0) || document.getElementById('searchUserInput')?.value ? filteredUsersData : usersData;
    usersTotalEntries = data.length;
    
    if (data.length === 0) {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #718096;">No users found</td></tr>';
        updateUsersPaginationInfo(0, 0, 0);
        return;
    }

    renderUsersCurrentPage();
    updateUsersPaginationControls();
}

// Render current page for users
function renderUsersCurrentPage() {
    const data = (typeof filteredUsersData !== 'undefined' && filteredUsersData.length > 0) || document.getElementById('searchUserInput')?.value ? filteredUsersData : usersData;
    const startIndex = (usersCurrentPage - 1) * usersEntriesPerPage;
    const endIndex = startIndex + usersEntriesPerPage;
    const currentPageData = data.slice(startIndex, endIndex);

    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    
    currentPageData.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>
                <span class="auth-code auth-code-tooltip" onclick="copyAuthCode('${user.auth_code}')">
                    ${user.auth_code}
                </span>
            </td>
            <td>${user.credits}</td>
            <td>${user.total_downloads}</td>
            <td><span class="status-badge status-${user.status}">${user.status}</span></td>
            <td>${formatDate(user.created_date)}</td>
            <td>
                <button class="action-btn action-btn-edit" onclick="editUser(${user.id})">Edit</button>
                <button class="action-btn action-btn-delete" onclick="deleteUser(${user.id})">Delete</button>
                <button class="action-btn action-btn-view" onclick="viewUserDetails(${user.id})">View</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    updateUsersPaginationInfo(startIndex + 1, Math.min(endIndex, usersTotalEntries), usersTotalEntries);
}

// Update pagination info for users
function updateUsersPaginationInfo(start, end, total) {
    const tableInfo = document.getElementById('usersTableInfo');
    const paginationInfo = document.getElementById('usersPaginationInfo');
    
    const infoText = `Showing ${start} to ${end} of ${total} entries`;
    if (tableInfo) tableInfo.textContent = infoText;
    if (paginationInfo) paginationInfo.textContent = infoText;
}

// Update pagination controls for users
function updateUsersPaginationControls() {
    const totalPages = Math.ceil(usersTotalEntries / usersEntriesPerPage);
    const prevBtn = document.getElementById('usersPrevPage');
    const nextBtn = document.getElementById('usersNextPage');
    const pageNumbers = document.getElementById('usersPageNumbers');

    // Update prev/next buttons
    if (prevBtn) prevBtn.disabled = usersCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = usersCurrentPage === totalPages || totalPages === 0;

    // Generate page numbers
    if (pageNumbers) {
        let pagesHTML = '';
        const maxVisiblePages = 5;
        let startPage = Math.max(1, usersCurrentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pagesHTML += `<button class="page-btn ${i === usersCurrentPage ? 'active' : ''}" onclick="goToUsersPage(${i})">${i}</button>`;
        }

        pageNumbers.innerHTML = pagesHTML;
    }
}

// Users pagination functions
function changeUsersEntriesPerPage() {
    const select = document.getElementById('usersEntriesPerPage');
    usersEntriesPerPage = parseInt(select.value);
    usersCurrentPage = 1;
    renderUsersCurrentPage();
    updateUsersPaginationControls();
}

function previousUsersPage() {
    if (usersCurrentPage > 1) {
        usersCurrentPage--;
        renderUsersCurrentPage();
        updateUsersPaginationControls();
    }
}

function nextUsersPage() {
    const totalPages = Math.ceil(usersTotalEntries / usersEntriesPerPage);
    if (usersCurrentPage < totalPages) {
        usersCurrentPage++;
        renderUsersCurrentPage();
        updateUsersPaginationControls();
    }
}

function goToUsersPage(page) {
    usersCurrentPage = page;
    renderUsersCurrentPage();
    updateUsersPaginationControls();
}

// ========== SUMMARY NOTE FOR ORDER HISTORY ==========
function updateHistorySummaryNote() {
    // Lấy dữ liệu orders, users
    const orders = historyData || [];
    const users = usersData || [];

    // Tổng đơn hàng
    const totalOrders = orders.length;
    // Tổng tài khoản đã bán (tổng quantity của tất cả orders)
    const totalAccounts = orders.reduce((sum, o) => sum + (o.quantity || 1), 0);
    // Tổng thành viên
    const totalUsers = users.length;
    // Tổng doanh thu (credits)
    const totalRevenue = orders.reduce((sum, o) => sum + (o.credits_used || o.cost || (o.credit_cost * (o.quantity || 1))), 0);

    // Format số có dấu phẩy
    function formatNumber(n) {
        return n.toLocaleString('en-US');
    }

    // Update UI
    const elOrders = document.getElementById('summaryTotalOrders');
    const elAccounts = document.getElementById('summaryTotalAccounts');
    const elUsers = document.getElementById('summaryTotalUsers');
    const elRevenue = document.getElementById('summaryTotalRevenue');
    if (elOrders) elOrders.textContent = formatNumber(totalOrders);
    if (elAccounts) elAccounts.textContent = formatNumber(totalAccounts);
    if (elUsers) elUsers.textContent = formatNumber(totalUsers);
    if (elRevenue) elRevenue.textContent = formatNumber(totalRevenue) + ' credits';
}

// Function to update pagination controls
function changePage(direction) {
    const totalPages = Math.ceil(filteredHistoryData.length / (itemsPerPage === 'all' ? filteredHistoryData.length : itemsPerPage));
    
    if (direction === -1 && currentPage > 1) {
        currentPage--;
    } else if (direction === 1 && currentPage < totalPages) {
        currentPage++;
    }
    
    renderHistoryWithPagination();
}

// Gọi updateHistorySummaryNote khi load xong orders/users
// (Gọi sau loadAllData, loadOrderHistory, loadUsers)
// Thêm vào cuối loadOrderHistory và loadUsers:
const _oldLoadOrderHistory = loadOrderHistory;
loadOrderHistory = async function() {
    await _oldLoadOrderHistory.apply(this, arguments);
    updateHistorySummaryNote();
};
const _oldLoadUsers = loadUsers;
loadUsers = async function() {
    await _oldLoadUsers.apply(this, arguments);
    updateHistorySummaryNote();
};
// Gọi khi DOMContentLoaded (nếu đã có data)
document.addEventListener('DOMContentLoaded', function() {
    updateHistorySummaryNote();
});








