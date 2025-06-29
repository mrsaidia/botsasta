document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        window.location.href = '/';
        return;
    }

    // Set authorization header for all requests
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        if (args[1]) {
            args[1].headers = args[1].headers || {};
            args[1].headers['Authorization'] = `Bearer ${adminToken}`;
        } else {
            args[1] = {
                headers: {
                    'Authorization': `Bearer ${adminToken}`
                }
            };
        }
        return originalFetch.apply(this, args);
    };

    // Tab functionality
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Forms
    const addUserForm = document.getElementById('addUserForm');
    const addAccountForm = document.getElementById('addAccountForm');
    const editCreditsForm = document.getElementById('editCreditsForm');
    
    // Lists
    const usersList = document.getElementById('usersList');
    const accountsList = document.getElementById('accountsList');
    
    // Modal
    const editCreditsModal = document.getElementById('editCreditsModal');
    const closeModal = document.querySelector('.close');
    
    let currentEditUserId = null;
    let accounts = []; // Global accounts array for edit functions

    // Initialize
    loadAdminInfo();
    loadDashboardStats();
    loadUsers();
    loadAccounts();

    // Load backup list if super admin
    if (window.currentAdmin?.role === 'super_admin') {
        loadBackupList();
    }

    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update content
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tab}-tab`).classList.add('active');
        });
    });

    // Add user form
    addUserForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(addUserForm);
        const userData = {
            username: formData.get('username'),
            credits: parseInt(formData.get('credits')) || 0
        };
        
        try {
            const response = await fetch('/api/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert(`User created successfully! Auth Code: ${result.authCode}`, 'success');
                addUserForm.reset();
                loadUsers();
                loadDashboardStats();
            } else {
                showAlert(result.error || 'Failed to create user', 'error');
            }
        } catch (error) {
            console.error('Error creating user:', error);
            showAlert('Failed to create user. Please try again.', 'error');
        }
    });

    // Add admin form
    const addAdminForm = document.getElementById('addAdminForm');
    addAdminForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(addAdminForm);
        const adminData = {
            name: formData.get('adminName'),
            authCode: formData.get('adminAuthCode')
        };
        
        try {
            const response = await fetch('/api/admin/admins', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(adminData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert('Sub Admin added successfully!', 'success');
                addAdminForm.reset();
                loadAdmins(); // Reload admin list
            } else {
                showAlert(result.error || 'Failed to add sub admin', 'error');
            }
        } catch (error) {
            console.error('Error adding admin:', error);
            showAlert('Failed to add sub admin. Please try again.', 'error');
        }
    });

    // Add account form
    addAccountForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(addAccountForm);
        
        // Handle file upload if present
        const logoFile = formData.get('productLogo');
        if (logoFile && logoFile.size > 0) {
            // Upload logo first
            const logoFormData = new FormData();
            logoFormData.append('logo', logoFile);
            
            try {
                const logoResponse = await fetch('/api/admin/upload-logo', {
                    method: 'POST',
                    body: logoFormData
                });
                const logoResult = await logoResponse.json();
                
                if (logoResult.success) {
                    formData.append('logoPath', logoResult.logoPath);
                }
            } catch (error) {
                console.error('Error uploading logo:', error);
            }
        }
        
        const accountData = {
            title: formData.get('title'),
            accountData: formData.get('accountData'),
            description: formData.get('description'),
            creditCost: parseInt(formData.get('creditCost')) || 1,
            logoPath: formData.get('logoPath') || null
        };
        
        try {
            const response = await fetch('/api/admin/accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(accountData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert('Account uploaded successfully!', 'success');
                addAccountForm.reset();
                loadAccounts();
                loadDashboardStats();
            } else {
                showAlert(result.error || 'Failed to upload account', 'error');
            }
        } catch (error) {
            console.error('Error uploading account:', error);
            showAlert('Failed to upload account. Please try again.', 'error');
        }
    });

    // Edit credits form
    editCreditsForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!currentEditUserId) return;
        
        const newCredits = parseInt(document.getElementById('newCredits').value);
        
        try {
            const response = await fetch(`/api/admin/users/${currentEditUserId}/credits`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ credits: newCredits })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert('Credits updated successfully!', 'success');
                editCreditsModal.style.display = 'none';
                loadUsers();
                loadDashboardStats();
            } else {
                showAlert(result.error || 'Failed to update credits', 'error');
            }
        } catch (error) {
            console.error('Error updating credits:', error);
            showAlert('Failed to update credits. Please try again.', 'error');
        }
    });

    // Load dashboard statistics
    async function loadDashboardStats() {
        try {
            const response = await fetch('/api/admin/stats');
            const stats = await response.json();
            
            document.getElementById('totalUsers').textContent = stats.totalUsers;
            document.getElementById('totalAccounts').textContent = stats.totalAccounts;
            document.getElementById('totalCredits').textContent = stats.totalCredits;
            document.getElementById('totalSold').textContent = stats.totalSold;
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    // Load users
    async function loadUsers() {
        try {
            const response = await fetch('/api/admin/users');
            const users = await response.json();
            
            // Store users globally for search/filter
            window.allUsers = users;
            
            if (users.length === 0) {
                usersList.innerHTML = '<p>No users created yet.</p>';
                return;
            }
            
            usersList.innerHTML = users.map(user => `
                <div class="user-item">
                    <div class="item-header">
                        <div class="item-title">👤 ${escapeHtml(user.username)}</div>
                        <div class="item-date">${new Date(user.created_date).toLocaleDateString()}</div>
                    </div>
                    
                    <div class="item-info">
                        <div class="info-item">
                            <div class="info-label">Credits</div>
                            <div class="info-value">${user.credits}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Downloads</div>
                            <div class="info-value">${user.total_downloads}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Auth Code</div>
                            <div class="info-value">${user.auth_code}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Status</div>
                            <div class="info-value">
                                <span class="status-badge status-${user.status}">${user.status}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="auth-code" onclick="copyToClipboard('${user.auth_code}')" title="Click to copy">
                        🔑 ${user.auth_code}
                    </div>
                    
                    <div class="item-actions">
                        <button class="btn btn-secondary btn-small" onclick="editCredits(${user.id}, ${user.credits})">
                            💰 Edit Credits
                        </button>
                        <button class="btn ${user.status === 'active' ? 'btn-warning' : 'btn-success'} btn-small" onclick="toggleUserStatus(${user.id}, '${user.status}')">
                            ${user.status === 'active' ? '⏸️ Deactivate' : '▶️ Activate'}
                        </button>
                        <button class="btn btn-danger btn-small" onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading users:', error);
            usersList.innerHTML = '<p>Error loading users.</p>';
        }
    }

    // Load accounts
    async function loadAccounts() {
        try {
            const response = await fetch('/api/admin/accounts');
            accounts = await response.json(); // Update global accounts array
            
            if (accounts.length === 0) {
                accountsList.innerHTML = '<p>No accounts uploaded yet.</p>';
                return;
            }
            
            accountsList.innerHTML = accounts.map(account => `
                <div class="account-item">
                    <div class="item-header">
                        <div class="item-title">📦 ${escapeHtml(account.title)}</div>
                        <div class="item-date">${new Date(account.upload_date).toLocaleDateString()}</div>
                    </div>
                    
                    ${account.logo_path ? `
                    <div style="margin-bottom: 15px;">
                        <img src="${account.logo_path}" alt="Product Logo" style="max-width: 100px; height: auto; border-radius: 8px;">
                    </div>
                    ` : ''}
                    
                    ${account.description ? `
                    <div style="margin-bottom: 15px;">
                        <strong>Description:</strong> ${escapeHtml(account.description)}
                    </div>
                    ` : ''}
                    
                                         <div class="item-info">
                         <div class="info-item">
                             <div class="info-label">Credit Cost</div>
                             <div class="info-value">${account.credit_cost}</div>
                         </div>
                         <div class="info-item">
                             <div class="info-label">Stock</div>
                             <div class="info-value">${account.stock_quantity || 0}</div>
                         </div>
                         <div class="info-item">
                             <div class="info-label">Sold</div>
                             <div class="info-value">${account.total_sold || 0}</div>
                         </div>
                         <div class="info-item">
                             <div class="info-label">Status</div>
                             <div class="info-value">
                                 <span class="status-badge status-${account.status}">${account.status}</span>
                             </div>
                         </div>
                     </div>
                    
                    <div class="account-data-preview" title="Click to view full data" onclick="showAccountData('${escapeHtml(account.account_data)}')">
                        ${escapeHtml(account.account_data.substring(0, 200))}${account.account_data.length > 200 ? '...' : ''}
                    </div>
                    
                                         <div class="item-actions">
                         <button class="btn btn-warning btn-small" onclick="editProduct(${account.id})">
                             ✏️ Edit
                         </button>
                         <button class="btn btn-danger btn-small" onclick="deleteAccount(${account.id}, '${escapeHtml(account.title)}')">
                             🗑️ Delete Product
                         </button>
                     </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading accounts:', error);
            accountsList.innerHTML = '<p>Error loading accounts.</p>';
        }
    }

    // Modal functions
    window.editCredits = function(userId, currentCredits) {
        currentEditUserId = userId;
        document.getElementById('newCredits').value = currentCredits;
        editCreditsModal.style.display = 'block';
    };

    // Toggle user status
    window.toggleUserStatus = async function(userId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const action = newStatus === 'active' ? 'activate' : 'deactivate';
        
        if (!confirm(`Are you sure you want to ${action} this user?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/users/${userId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert(`User ${action}d successfully!`, 'success');
                loadUsers();
            } else {
                showAlert(result.error || `Failed to ${action} user`, 'error');
            }
        } catch (error) {
            console.error(`Error ${action}ing user:`, error);
            showAlert(`Failed to ${action} user. Please try again.`, 'error');
        }
    };

    // Delete user
    window.deleteUser = async function(userId, username) {
        if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert('User deleted successfully!', 'success');
                loadUsers();
                loadDashboardStats();
            } else {
                showAlert(result.error || 'Failed to delete user', 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showAlert('Failed to delete user. Please try again.', 'error');
        }
    };

    // Delete account
    window.deleteAccount = async function(accountId, title) {
        if (!confirm(`Are you sure you want to delete product "${title}"?\n\nThis will permanently remove:\n- The product and all its stock\n- Cannot be undone`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/accounts/${accountId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert(`Product "${title}" deleted successfully!`, 'success');
                loadAccounts();
                loadDashboardStats();
            } else {
                showAlert(result.error || 'Failed to delete product', 'error');
            }
        } catch (error) {
            console.error('Error deleting account:', error);
            showAlert('Failed to delete product. Please try again.', 'error');
        }
    };

    // Edit product function
    window.editProduct = function(productId) {
        const product = accounts.find(acc => acc.id === productId);
        
        if (!product) {
            showAlert('Product not found', 'error');
            return;
        }

        // Populate edit form
        document.getElementById('editProductId').value = product.id;
        document.getElementById('editTitle').value = product.title;
        document.getElementById('editDescription').value = product.description || '';
        document.getElementById('editCreditCost').value = product.credit_cost;
        document.getElementById('editAccountData').value = product.account_data;
        
        updateAccountStats();
        openModal('editModal');
    };

    // Update account statistics
    function updateAccountStats() {
        const accountData = document.getElementById('editAccountData').value;
        const lines = accountData.split('\n').filter(line => line.trim());
        const product = accounts.find(acc => acc.id == document.getElementById('editProductId').value);
        const sold = product ? product.total_sold : 0;
        
        document.getElementById('accountStats').innerHTML = 
            `Total accounts: ${lines.length} | Available: ${lines.length} | Sold: ${sold}`;
    }

    // Remove duplicates function
    window.removeDuplicates = function() {
        const textarea = document.getElementById('editAccountData');
        const lines = textarea.value.split('\n').filter(line => line.trim());
        const uniqueLines = [...new Set(lines)];
        const removedCount = lines.length - uniqueLines.length;
        
        textarea.value = uniqueLines.join('\n');
        updateAccountStats();
        
        if (removedCount > 0) {
            showAlert(`Removed ${removedCount} duplicate accounts`, 'success');
        } else {
            showAlert('No duplicates found', 'info');
        }
    };

    // Separate sold accounts (for manual management)
    window.separateSoldAccounts = function() {
        const product = accounts.find(acc => acc.id == document.getElementById('editProductId').value);
        if (!product || product.total_sold === 0) {
            showAlert('No sold accounts to separate', 'info');
            return;
        }
        
        const textarea = document.getElementById('editAccountData');
        const lines = textarea.value.split('\n').filter(line => line.trim());
        
        if (lines.length > 0) {
            const separator = '\n\n--- SOLD ACCOUNTS (for reference) ---\n';
            const note = '(Note: First ' + product.total_sold + ' accounts were sold)\n';
            textarea.value = lines.join('\n') + separator + note;
            updateAccountStats();
            showAlert(`Added note about ${product.total_sold} sold accounts`, 'info');
        }
    };

    // Edit form handler
    document.getElementById('editForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        
        // Handle logo upload if present
        let logoPath = null;
        const logoFile = formData.get('editProductLogo');
        if (logoFile && logoFile.size > 0) {
            const logoFormData = new FormData();
            logoFormData.append('logo', logoFile);
            
            try {
                const logoResponse = await fetch('/api/admin/upload-logo', {
                    method: 'POST',
                    body: logoFormData
                });
                const logoResult = await logoResponse.json();
                
                if (logoResult.success) {
                    logoPath = logoResult.logoPath;
                }
            } catch (error) {
                console.error('Error uploading logo:', error);
            }
        }
        
        const data = {
            id: document.getElementById('editProductId').value,
            title: formData.get('title'),
            description: formData.get('description'),
            creditCost: parseInt(formData.get('creditCost')),
            accountData: formData.get('accountData'),
            logoPath: logoPath
        };

        try {
            const response = await fetch('/api/admin/accounts/' + data.id, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                showAlert('Product updated successfully!', 'success');
                closeEditModal();
                loadAccounts();
                loadDashboardStats();
            } else {
                showAlert(result.error || 'Failed to update product', 'error');
            }
        } catch (error) {
            console.error('Error updating product:', error);
            showAlert('Failed to update product. Please try again.', 'error');
        }
    });

    // Update stats when editing account data
    document.getElementById('editAccountData').addEventListener('input', updateAccountStats);

    // Copy to clipboard
    window.copyToClipboard = function(text) {
        navigator.clipboard.writeText(text).then(() => {
            showAlert('Auth code copied to clipboard!', 'info');
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showAlert('Auth code copied to clipboard!', 'info');
        });
    };

    // Show account data
    window.showAccountData = function(data) {
        alert('Account Data:\n\n' + data);
    };

    // Modal close handlers
    closeModal.addEventListener('click', function() {
        editCreditsModal.style.display = 'none';
    });

    window.addEventListener('click', function(event) {
        if (event.target === editCreditsModal) {
            editCreditsModal.style.display = 'none';
        }
    });

    // Utility functions
    function showAlert(message, type) {
        // Remove existing alerts
        const existingAlert = document.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        
        const container = document.querySelector('.container');
        container.insertBefore(alert, container.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 5000);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Modal functions
    function openModal(modalId) {
        document.getElementById(modalId).style.display = 'block';
    }

    function closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
    }

    window.openModal = openModal;
    window.closeModal = function(modalId) {
        document.getElementById(modalId).style.display = 'none';
    };

    // Logout function
    window.logout = function() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('adminToken');
            window.location.href = '/';
        }
    };

    // Handle unauthorized responses
    window.addEventListener('unhandledrejection', function(event) {
        if (event.reason && event.reason.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = '/';
        }
    });

    // Search Users Function
    window.searchUsers = function() {
        const searchTerm = document.getElementById('userSearch').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        
        if (!window.allUsers) return;
        
        let filteredUsers = window.allUsers.filter(user => {
            const matchesSearch = !searchTerm || 
                user.username.toLowerCase().includes(searchTerm) ||
                (user.email && user.email.toLowerCase().includes(searchTerm)) ||
                user.auth_code.toLowerCase().includes(searchTerm);
            
            const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        });
        
        displayFilteredUsers(filteredUsers);
        updateSearchStats(filteredUsers.length, window.allUsers.length, searchTerm);
    };

    // Filter Users by Status
    window.filterUsers = function() {
        searchUsers(); // Reuse search function with filter
    };

    // Sort Users
    window.sortUsers = function() {
        const sortBy = document.getElementById('sortBy').value;
        
        if (!window.allUsers) return;
        
        let sortedUsers = [...window.allUsers];
        
        switch(sortBy) {
            case 'username':
                sortedUsers.sort((a, b) => a.username.localeCompare(b.username));
                break;
            case 'credits':
                sortedUsers.sort((a, b) => b.credits - a.credits);
                break;
            case 'downloads':
                sortedUsers.sort((a, b) => b.total_downloads - a.total_downloads);
                break;
            case 'created_date':
            default:
                sortedUsers.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
                break;
        }
        
        window.allUsers = sortedUsers;
        searchUsers(); // Apply current search/filter to sorted data
    };

    // Display Filtered Users
    function displayFilteredUsers(users) {
        if (users.length === 0) {
            usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;"><h3>No users found</h3><p>Try adjusting your search criteria</p></div>';
            return;
        }

        usersList.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="item-header">
                    <div class="item-title">👤 ${escapeHtml(user.username)}</div>
                    <div class="item-date">${new Date(user.created_date).toLocaleDateString()}</div>
                </div>
                
                <div class="item-info">
                    <div class="info-item">
                        <div class="info-label">Credits</div>
                        <div class="info-value">${user.credits}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Downloads</div>
                        <div class="info-value">${user.total_downloads}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Auth Code</div>
                        <div class="info-value">${user.auth_code}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Status</div>
                        <div class="info-value">
                            <span class="status-badge status-${user.status}">${user.status}</span>
                        </div>
                    </div>
                </div>
                
                <div class="auth-code" onclick="copyToClipboard('${user.auth_code}')" title="Click to copy">
                    🔑 ${user.auth_code}
                </div>
                
                <div class="item-actions">
                    <button class="btn btn-secondary btn-small" onclick="editCredits(${user.id}, ${user.credits})">
                        💰 Edit Credits
                    </button>
                    <button class="btn ${user.status === 'active' ? 'btn-warning' : 'btn-success'} btn-small" onclick="toggleUserStatus(${user.id}, '${user.status}')">
                        ${user.status === 'active' ? '⏸️ Deactivate' : '▶️ Activate'}
                    </button>
                    <button class="btn btn-danger btn-small" onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Update Search Statistics
    function updateSearchStats(filtered, total, searchTerm) {
        const searchResults = document.getElementById('searchResults');
        if (searchTerm) {
            searchResults.textContent = `Found ${filtered} of ${total} users for "${searchTerm}"`;
        } else {
            const statusFilter = document.getElementById('statusFilter').value;
            if (statusFilter !== 'all') {
                searchResults.textContent = `Showing ${filtered} ${statusFilter} users of ${total} total`;
            } else {
                searchResults.textContent = `Showing all ${total} users`;
            }
        }
    }

    // Clear Search
    window.clearSearch = function() {
        document.getElementById('userSearch').value = '';
        document.getElementById('statusFilter').value = 'all';
        document.getElementById('sortBy').value = 'created_date';
        
        if (window.allUsers) {
            displayFilteredUsers(window.allUsers);
            updateSearchStats(window.allUsers.length, window.allUsers.length, '');
        }
    };

    // Load admin info and set permissions
    async function loadAdminInfo() {
        try {
            const response = await fetch('/api/admin/me');
            const adminInfo = await response.json();
            
            // Store admin info globally
            window.currentAdmin = adminInfo;
            
            // Update role badge
            const roleBadge = document.getElementById('adminRoleBadge');
            if (adminInfo.role === 'super_admin') {
                roleBadge.innerHTML = '👑 Super Admin';
                roleBadge.className = 'admin-role-badge super-admin';
                
                // Show all features for super admin
                document.querySelectorAll('.super-admin-only').forEach(el => {
                    el.classList.remove('hidden');
                });
                
                // Load admins list
                loadAdmins();
            } else {
                roleBadge.innerHTML = `👤 Sub Admin: ${adminInfo.name}`;
                roleBadge.className = 'admin-role-badge sub-admin';
                
                // Hide super admin features
                document.querySelectorAll('.super-admin-only').forEach(el => {
                    el.classList.add('hidden');
                });
            }
        } catch (error) {
            console.error('Error loading admin info:', error);
        }
    }

    // Load admins (Super Admin only)
    async function loadAdmins() {
        if (window.currentAdmin?.role !== 'super_admin') {
            return;
        }
        
        try {
            // Show super admin code
            const superAdminCodeElement = document.getElementById('superAdminCode');
            const currentToken = localStorage.getItem('adminToken');
            superAdminCodeElement.textContent = currentToken || 'Not available';
            
            const response = await fetch('/api/admin/admins');
            if (!response.ok) {
                throw new Error('Access denied');
            }
            
            const admins = await response.json();
            const adminsList = document.getElementById('adminsList');
            
            if (admins.length === 0) {
                adminsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;"><p>No sub admins created yet</p></div>';
                return;
            }

            adminsList.innerHTML = admins.map(admin => `
                <div class="admin-item">
                    <div class="admin-header">
                        <div class="admin-title">👤 ${escapeHtml(admin.name)} <span style="color: #4ecdc4; font-size: 0.8em;">(Sub Admin)</span></div>
                        <div class="admin-date">${new Date(admin.created_date).toLocaleDateString()}</div>
                    </div>
                    
                    <div class="admin-auth-code" onclick="copyToClipboard('${admin.auth_code}')" title="Click to copy">
                        🔑 ${admin.auth_code}
                    </div>
                    
                    <div class="admin-actions">
                        <button class="btn btn-danger btn-small" onclick="deleteAdmin(${admin.id}, '${escapeHtml(admin.name)}')">
                            🗑️ Delete Sub Admin
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading admins:', error);
            document.getElementById('adminsList').innerHTML = '<div style="color: red; text-align: center; padding: 20px;">Access denied - Super Admin only</div>';
        }
    }

    // Delete admin function (Super Admin only)
    window.deleteAdmin = async function(adminId, adminName) {
        if (window.currentAdmin?.role !== 'super_admin') {
            showAlert('Access denied - Super Admin only', 'error');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete sub admin "${adminName}"?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/admins/${adminId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert('Sub Admin deleted successfully!', 'success');
                loadAdmins();
            } else {
                showAlert(result.error || 'Failed to delete sub admin', 'error');
            }
        } catch (error) {
            console.error('Error deleting admin:', error);
            showAlert('Failed to delete sub admin. Please try again.', 'error');
        }
    };

    // Create manual backup
    window.createManualBackup = async function() {
        if (window.currentAdmin?.role !== 'super_admin') {
            showAlert('Access denied - Super Admin only', 'error');
            return;
        }
        
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = '⏳ Creating backup...';
        button.disabled = true;
        
        try {
            const response = await fetch('/api/admin/backup/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert('Backup created successfully!', 'success');
                loadBackupList(); // Refresh the list
            } else {
                showAlert(result.error || 'Failed to create backup', 'error');
            }
        } catch (error) {
            console.error('Error creating backup:', error);
            showAlert('Failed to create backup. Please try again.', 'error');
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    };

    // Load backup list
    window.loadBackupList = async function() {
        if (window.currentAdmin?.role !== 'super_admin') {
            return;
        }
        
        try {
            const response = await fetch('/api/admin/backup/list', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                displayBackupList(result.backups);
            } else {
                document.getElementById('backupsList').innerHTML = '<p style="color: red;">Failed to load backups</p>';
            }
        } catch (error) {
            console.error('Error loading backups:', error);
            document.getElementById('backupsList').innerHTML = '<p style="color: red;">Google Drive backup not configured</p>';
        }
    };

    // Display backup list
    function displayBackupList(backups) {
        const backupsList = document.getElementById('backupsList');
        
        if (backups.length === 0) {
            backupsList.innerHTML = `
                <h3>📋 Available Backups</h3>
                <div style="text-align: center; padding: 20px; color: #666;">
                    <p>No backups found</p>
                    <p>Create your first backup using the button above</p>
                </div>
            `;
            return;
        }
        
        backupsList.innerHTML = `
            <h3>📋 Available Backups (${backups.length})</h3>
            ${backups.map(backup => `
                <div class="backup-item">
                    <div class="backup-header">
                        <div class="backup-title">💾 ${backup.name}</div>
                        <div class="backup-date">${formatBackupDate(backup.createdTime)}</div>
                    </div>
                    
                    <div class="backup-info">
                        <div class="info-item">
                            <div class="info-label">Size</div>
                            <div class="info-value">${formatFileSize(backup.size)}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Created</div>
                            <div class="info-value">${new Date(backup.createdTime).toLocaleDateString()}</div>
                        </div>
                    </div>
                    
                    <div class="backup-actions">
                        <button class="btn btn-secondary btn-small" onclick="downloadBackup('${backup.id}', '${backup.name}')">
                            📥 Download
                        </button>
                    </div>
                </div>
            `).join('')}
        `;
    }

    // Download backup
    window.downloadBackup = async function(fileId, fileName) {
        if (window.currentAdmin?.role !== 'super_admin') {
            showAlert('Access denied - Super Admin only', 'error');
            return;
        }
        
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = '⏳ Downloading...';
        button.disabled = true;
        
        try {
            const response = await fetch('/api/admin/backup/download', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fileId, fileName })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert('Backup downloaded to server successfully!', 'success');
            } else {
                showAlert(result.error || 'Failed to download backup', 'error');
            }
        } catch (error) {
            console.error('Error downloading backup:', error);
            showAlert('Failed to download backup. Please try again.', 'error');
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    };

    // Format backup date
    function formatBackupDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    // Format file size
    function formatFileSize(bytes) {
        if (!bytes || bytes === 'Unknown') return 'Unknown';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}); 