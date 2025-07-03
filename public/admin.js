document.addEventListener('DOMContentLoaded', async function() {
    // Enhanced session management
    function clearAdminSession() {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminLoginTime');
        localStorage.removeItem('adminRole');
        localStorage.removeItem('adminName');
    }

    // Check admin authentication
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        window.location.href = '/';
        return;
    }

    // Show loading indicator during verification
    document.body.style.opacity = '0.7';
    
    // Verify token validity before proceeding
    try {
        const verifyResponse = await fetch('/api/admin/me', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!verifyResponse.ok) {
            // Token invalid, clear and redirect
            clearAdminSession();
            window.location.href = '/';
            return;
        }
        
        // Token valid, show the interface
        document.body.style.opacity = '1';
        
        // Show welcome message if returning user
        const adminName = localStorage.getItem('adminName');
        if (adminName && !sessionStorage.getItem('welcomeShown')) {
            setTimeout(() => {
                showAlert(`Welcome back, ${adminName}! 👋`, 'success');
                sessionStorage.setItem('welcomeShown', 'true');
            }, 500);
        }
        
        // Add manual refresh option
        window.refreshCurrentTab = function() {
            const currentTab = localStorage.getItem('activeAdminTab') || 'users';
            console.log('Manual refresh triggered for tab:', currentTab);
            switchToTab(currentTab);
        };
        
        // Add keyboard shortcut for debugging (Ctrl+R+T)
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                console.log('Debug: Current tab state');
                console.log('Active tab from storage:', localStorage.getItem('activeAdminTab'));
                console.log('Current admin:', window.currentAdmin);
                refreshCurrentTab();
            }
        });
        
    } catch (error) {
        console.warn('Token verification failed, but continuing with stored token:', error);
        // Continue anyway in case of network issues
        document.body.style.opacity = '1';
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
        return originalFetch.apply(this, args).catch(error => {
            // If any API call fails with 401, clear token and redirect
            if (error.status === 401) {
                clearAdminSession();
                window.location.href = '/';
                return Promise.reject(error);
            }
            return Promise.reject(error);
        });
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
    
    // Don't load all tabs immediately - they will be loaded when switched to
    // This improves performance and ensures proper tab state

    // Enhanced tab switching with state persistence
    function switchToTab(tabName) {
        console.log('Switching to tab:', tabName);
        
        // Check if tab is allowed for current admin
        if (tabName === 'backup' && window.currentAdmin?.role !== 'super_admin') {
            console.warn('Backup tab not allowed for non-super admin');
            tabName = 'users'; // Fallback to users tab
        }
        
        // Update buttons
        tabBtns.forEach(b => b.classList.remove('active'));
        const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
            console.log('Set active button for:', tabName);
        } else {
            console.warn('Tab button not found:', tabName);
        }
        
        // Update content
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        const targetContent = document.getElementById(`${tabName}-tab`);
        if (targetContent) {
            targetContent.classList.add('active');
            console.log('Set active content for:', tabName);
        } else {
            console.warn('Tab content not found:', tabName + '-tab');
        }
        
        // Save active tab to localStorage
        localStorage.setItem('activeAdminTab', tabName);
        
        // Reload data for specific tabs
        if (tabName === 'sold-accounts') {
            loadSoldAccounts();
        } else if (tabName === 'users') {
            loadUsers();
        } else if (tabName === 'accounts') {
            loadAccounts();
        } else if (tabName === 'backup') {
            // Only load backup for super admin
            if (window.currentAdmin?.role === 'super_admin') {
                loadTelegramConfig();
                loadBackupHistory();
                checkBackupStatus();
            }
        }
    }
    
    // Restore last active tab on page load  
    const savedTab = localStorage.getItem('activeAdminTab') || 'users';
    
    // Wait for admin info to load first
    const waitForAdminInfo = () => {
        if (window.currentAdmin) {
            switchToTab(savedTab);
        } else {
            setTimeout(waitForAdminInfo, 100);
        }
    };
    
    setTimeout(waitForAdminInfo, 300);
    
    // Fallback: ensure at least users tab is shown after 2 seconds
    setTimeout(() => {
        const hasActiveTab = document.querySelector('.tab-content.active');
        if (!hasActiveTab) {
            console.warn('No active tab found, falling back to users tab');
            switchToTab('users');
        }
    }, 2000);
    
    // Tab switching event listeners
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchToTab(tab);
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
        
        // Store current logo path for preservation
        document.getElementById('editProductId').dataset.currentLogo = product.logo_path || '';
        
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
            // Upload new logo
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
        } else {
            // Preserve current logo if no new logo uploaded
            const currentLogo = document.getElementById('editProductId').dataset.currentLogo;
            logoPath = currentLogo || null;
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
            clearAdminSession();
            window.location.href = '/';
        }
    };

    // Handle unauthorized responses and token expiration
    window.addEventListener('unhandledrejection', function(event) {
        if (event.reason && event.reason.status === 401) {
            console.warn('Unauthorized access detected, redirecting to login...');
            clearAdminSession();
            window.location.href = '/';
        }
    });

    // Enhanced error handling for fetch responses
    function handleApiResponse(response) {
        if (response.status === 401) {
            console.warn('Token expired or invalid, redirecting to login...');
            clearAdminSession();
            window.location.href = '/';
            throw new Error('Unauthorized');
        }
        return response;
    }

    // Improved token persistence - save login time
    if (!localStorage.getItem('adminLoginTime')) {
        localStorage.setItem('adminLoginTime', Date.now().toString());
    }

    // Auto-refresh token validation every 30 minutes
    setInterval(async function() {
        try {
            const response = await fetch('/api/admin/me');
            if (!response.ok && response.status === 401) {
                console.warn('Session expired, redirecting to login...');
                clearAdminSession();
                window.location.href = '/';
            }
        } catch (error) {
            console.warn('Failed to verify session:', error);
        }
    }, 30 * 60 * 1000); // 30 minutes

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

        // ============ SIMPLE GOOGLE AUTHENTICATION ============

     // Google configuration
     const GOOGLE_CLIENT_ID = '13824380504-75shpunu5tmf95jeso6bpkq11ngur6cq.apps.googleusercontent.com';
     
     // Global variables
     let currentUser = null;
     let isSignedIn = false;

              // Real Google Sign-In Handler
     window.handleGoogleSignIn = function() {
         console.log('🔐 Real Google Sign-In button clicked');
         
         updateAuthStatus('🔄 Opening Google Sign-In...');
         
         // Use Google Identity Services for OAuth2
         if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
             const tokenClient = google.accounts.oauth2.initTokenClient({
                 client_id: GOOGLE_CLIENT_ID,
                 scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
                 callback: async (tokenResponse) => {
                     console.log('🔑 Token response received:', tokenResponse);
                     
                     if (tokenResponse.access_token) {
                         try {
                             updateAuthStatus('🔄 Getting user information...');
                             
                             // Get user info from Google
                             const userResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenResponse.access_token}`);
                             const userInfo = await userResponse.json();
                             
                             console.log('👤 User info received:', userInfo);
                             
                             const user = {
                                 id: userInfo.id,
                                 email: userInfo.email,
                                 name: userInfo.name,
                                 picture: userInfo.picture
                             };
                             
                             // Store access token globally for Drive API calls
                             window.googleAccessToken = tokenResponse.access_token;
                             console.log('💾 Access token stored');
                             console.log('🔍 Token length:', tokenResponse.access_token.length);
                             console.log('🔍 Token starts with:', tokenResponse.access_token.substring(0, 10));
                             console.log('🔍 Token type:', tokenResponse.token_type);
                             
                             // Debug: Check token scopes
                             if (tokenResponse.scope) {
                                 console.log('📋 Granted scopes:', tokenResponse.scope);
                                 if (tokenResponse.scope.includes('drive.file')) {
                                     console.log('✅ Drive.file scope detected - can upload and access app files!');
                                     showAlert('Google Drive connected with file access permissions. You can now backup!', 'success');
                                 } else if (tokenResponse.scope.includes('https://www.googleapis.com/auth/drive')) {
                                     console.log('✅ Full Drive scope detected!');
                                 } else {
                                     console.warn('⚠️ No Drive scope detected');
                                     showAlert('No Drive permissions granted', 'error');
                                 }
                             }
                             
                             handleAuthSuccess(user);
                         } catch (error) {
                             console.error('❌ Error getting user info:', error);
                             updateAuthStatus('❌ Failed to get user information');
                             showAlert('Failed to get user information from Google', 'error');
                         }
                     } else {
                         console.error('❌ No access token received');
                         updateAuthStatus('❌ Authentication failed');
                         showAlert('Google authentication failed', 'error');
                     }
                 },
                 error_callback: (error) => {
                     console.error('❌ OAuth error:', error);
                     updateAuthStatus('❌ Authentication cancelled or failed');
                     if (error.type !== 'popup_closed') {
                         showAlert('Google authentication error: ' + error.type, 'error');
                     }
                 }
             });
             
             // Request access token (opens popup)
             tokenClient.requestAccessToken();
         } else {
             console.error('❌ Google API not loaded');
             updateAuthStatus('❌ Google API not available');
             showAlert('Google API not loaded. Please refresh the page and try again.', 'error');
         }
     };



     // Update authentication status
     function updateAuthStatus(message) {
         const authStatusText = document.getElementById('authStatusText');
         if (authStatusText) {
             authStatusText.innerHTML = message;
         }
     }

     // Handle successful authentication
     function handleAuthSuccess(user) {
         console.log('✅ Google authentication successful', user);
         
         currentUser = user;
         isSignedIn = true;
         
         // Update UI to show signed in state
         updateSignedInUI(user);
         updateAuthStatus('✅ Successfully signed in with Google!');
         
         // Enable backup buttons
         enableBackupButtons();
         
         showAlert(`Welcome ${user.name}! You can now backup to your Google Drive.`, 'success');
     }



         // Update signed in UI
     function updateSignedInUI(user) {
         const signedOutView = document.getElementById('signedOutView');
         const signedInView = document.getElementById('signedInView');

         if (signedOutView && signedInView) {
             // Show signed in view
             signedOutView.style.display = 'none';
             signedInView.style.display = 'block';

             // Update user info
             const userName = document.getElementById('userName');
             const userEmail = document.getElementById('userEmail');
             const userAvatar = document.getElementById('userAvatar');
             
             if (userName) userName.textContent = user.name || 'Unknown User';
             if (userEmail) userEmail.textContent = user.email || 'No email';
             if (userAvatar) userAvatar.src = user.picture || '';
         }
     }

     // Enable backup buttons
     function enableBackupButtons() {
         const createBtn = document.getElementById('createGDriveBackupBtn');
         const loadBtn = document.getElementById('loadGDriveBackupsBtn');
         
         if (createBtn) {
             createBtn.disabled = false;
             createBtn.textContent = '☁️ Backup to My Google Drive';
         }
         
         if (loadBtn) {
             loadBtn.disabled = false;
             loadBtn.textContent = '📋 View My Drive Backups';
         }
     }

     // Force Refresh Google Authentication (Nuclear Option)
     window.forceRefreshGoogleAuth = async function() {
         console.log('🔄 NUCLEAR OPTION: Complete Google auth refresh...');
         
         // Step 1: Revoke all Google permissions
         try {
             if (window.googleAccessToken) {
                 console.log('🗑️ Revoking old token...');
                 await fetch(`https://oauth2.googleapis.com/revoke?token=${window.googleAccessToken}`, {
                     method: 'POST'
                 });
                 console.log('✅ Old token revoked');
             }
         } catch (error) {
             console.warn('⚠️ Could not revoke old token:', error);
         }
         
         // Step 2: Clear everything in memory
         window.googleAccessToken = null;
         currentUser = null;
         isSignedIn = false;
         
         // Step 3: Update UI to signed out state
         const signedOutView = document.getElementById('signedOutView');
         const signedInView = document.getElementById('signedInView');
         
         if (signedOutView && signedInView) {
             signedOutView.style.display = 'block';
             signedInView.style.display = 'none';
         }
         
         // Step 4: Disable backup buttons
         const createBtn = document.getElementById('createGDriveBackupBtn');
         const loadBtn = document.getElementById('loadGDriveBackupsBtn');
         
         if (createBtn) createBtn.disabled = true;
         if (loadBtn) loadBtn.disabled = true;
         
         updateAuthStatus('🔄 Complete reset done. Signing in with fresh token...');
         showAlert('🧹 Complete reset performed. Getting fresh token with production permissions...', 'info');
         
         // Step 5: Automatically trigger new sign-in with fresh credentials
         setTimeout(() => {
             console.log('🚀 Starting fresh Google authentication...');
             handleGoogleSignIn();
         }, 1500);
     };

     // Google Sign Out
     window.signOutFromGoogle = function() {
         console.log('🚪 Signing out from Google');
         
         currentUser = null;
         isSignedIn = false;
         
         // Update UI
         const signedOutView = document.getElementById('signedOutView');
         const signedInView = document.getElementById('signedInView');
         
         if (signedOutView && signedInView) {
             signedOutView.style.display = 'block';
             signedInView.style.display = 'none';
         }
         
         // Disable backup buttons
         const createBtn = document.getElementById('createGDriveBackupBtn');
         const loadBtn = document.getElementById('loadGDriveBackupsBtn');
         
         if (createBtn) createBtn.disabled = true;
         if (loadBtn) loadBtn.disabled = true;
         
         updateAuthStatus('👆 Click button above to sign in with Google Drive');
         showAlert('Signed out from Google', 'info');
     };

         // Initialize when backup tab is loaded
     window.initGoogleDriveAuth = function() {
         if (window.currentAdmin?.role !== 'super_admin') {
             return;
         }

         console.log('🔄 Initializing simple Google authentication...');

         // Setup event listeners for sign out button
         const signOutBtn = document.getElementById('googleSignOutBtn');
         if (signOutBtn) {
             signOutBtn.addEventListener('click', signOutFromGoogle);
             console.log('✅ Sign out event listener attached');
         }

         // Initialize status
         updateAuthStatus('👆 Click button above to sign in with Google Drive');
         
         console.log('✅ Google authentication ready!');
     };

    // ============ BACKUP SYSTEM ============
    
    // Fetch system data from server
    async function fetchSystemData() {
        const [users, accounts, soldAccounts, stats] = await Promise.all([
            fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
            }).then(r => r.json()),
            
            fetch('/api/admin/accounts', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
            }).then(r => r.json()),
            
            fetch('/api/admin/sold-accounts', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
            }).then(r => r.json()),
            
            fetch('/api/admin/stats', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
            }).then(r => r.json())
        ]);

        return { users, accounts, soldAccounts, stats };
    }

    // Create backup content
    function createBackupContent(systemData) {
        const backupData = {
            metadata: {
                createdAt: new Date().toISOString(),
                server: 'BOT Delivery System',
                version: '1.0.0',
                backupType: 'Telegram Backup',
                admin: window.currentAdmin?.name || 'Unknown'
            },
            data: systemData
        };

        return JSON.stringify(backupData, null, 2);
    }

    // Local backup (old method)
    window.createLocalBackup = async function() {
        try {
            const response = await fetch('/api/admin/backup/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                }
            });

            const result = await response.json();

            if (result.success) {
                showAlert('✅ Local backup created successfully!', 'success');
                logBackupToHistory('local', result.fileName || 'backup.json');
                loadBackupList();
            } else {
                showAlert(result.error || 'Failed to create backup', 'error');
            }
        } catch (error) {
            console.error('Error creating backup:', error);
            showAlert('Failed to create backup. Please try again.', 'error');
        }
    };

    // ============ TELEGRAM BACKUP SYSTEM ============
    
    // Save Telegram configuration
    window.saveTelegramConfig = function() {
        const botToken = document.getElementById('telegramBotToken').value.trim();
        const chatId = document.getElementById('telegramChatId').value.trim();
        
        if (!botToken || !chatId) {
            showAlert('❌ Please enter both Bot Token and Chat ID', 'error');
            return;
        }
        
        // Save to localStorage
        localStorage.setItem('telegramBotToken', botToken);
        localStorage.setItem('telegramChatId', chatId);
        
        showAlert('✅ Telegram configuration saved successfully!', 'success');
    };
    
    // Test Telegram connection
    window.testTelegramConnection = async function() {
        const botToken = document.getElementById('telegramBotToken').value.trim() || localStorage.getItem('telegramBotToken');
        const chatId = document.getElementById('telegramChatId').value.trim() || localStorage.getItem('telegramChatId');
        
        if (!botToken || !chatId) {
            showAlert('❌ Please save Telegram configuration first', 'error');
            return;
        }
        
        try {
            showAlert('🧪 Testing Telegram connection...', 'info');
            
            const testResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: '🧪 Test message from BOT Delivery System\n✅ Telegram backup is configured correctly!'
                })
            });
            
            if (testResponse.ok) {
                showAlert('✅ Telegram connection test successful!', 'success');
            } else {
                const error = await testResponse.json();
                throw new Error(error.description || 'Telegram API error');
            }
            
        } catch (error) {
            console.error('Telegram test error:', error);
            showAlert('❌ Telegram connection test failed: ' + error.message, 'error');
        }
    };
    
    // Send backup to Telegram
    window.sendToTelegram = async function() {
        console.log('📱 Starting Telegram backup...');
        
        // Get saved configuration
        const botToken = localStorage.getItem('telegramBotToken');
        const chatId = localStorage.getItem('telegramChatId');
        
        if (!botToken || !chatId) {
            showAlert('❌ Please configure Telegram settings first', 'error');
            return;
        }
        
        try {
            showAlert('📱 Creating backup and sending to Telegram...', 'info');
            
            // Get system data
            const systemData = await fetchSystemData();
            const backupContent = createBackupContent(systemData);
            
            // Create file blob
            const blob = new Blob([backupContent], { type: 'application/json' });
            const fileName = `BOT-Delivery-Backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            
            // Send to Telegram
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('document', blob, fileName);
            formData.append('caption', `🤖 BOT Delivery System Backup\n📅 ${new Date().toLocaleString()}\n📊 Users: ${systemData.users.length} | Accounts: ${systemData.accounts.length} | Sales: ${systemData.soldAccounts.length}`);
            
            const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
                method: 'POST',
                body: formData
            });
            
            if (telegramResponse.ok) {
                showAlert('✅ Backup sent to Telegram successfully!', 'success');
                // Log backup to history
                logBackupToHistory('telegram', fileName);
            } else {
                const error = await telegramResponse.json();
                throw new Error(error.description || 'Telegram API error');
            }
            
        } catch (error) {
            console.error('Telegram backup error:', error);
            showAlert('❌ Failed to send backup to Telegram: ' + error.message, 'error');
        }
    };
    
    // Save auto backup configuration
    window.saveAutoBackupConfig = async function() {
        const interval = document.getElementById('autoBackupInterval').value;
        const time = document.getElementById('backupTime').value;
        
        try {
            const response = await fetch('/api/admin/backup/auto-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                },
                body: JSON.stringify({
                    interval: interval,
                    time: time,
                    telegramBotToken: localStorage.getItem('telegramBotToken'),
                    telegramChatId: localStorage.getItem('telegramChatId')
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert('✅ Auto backup configuration saved!', 'success');
                checkBackupStatus();
            } else {
                showAlert('❌ Failed to save configuration: ' + result.error, 'error');
            }
            
        } catch (error) {
            console.error('Auto backup config error:', error);
            showAlert('❌ Failed to save auto backup configuration', 'error');
        }
    };
    
    // Check backup status
    window.checkBackupStatus = async function() {
        try {
            const response = await fetch('/api/admin/backup/status', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                updateBackupStatusUI(result.status);
            } else {
                showAlert('❌ Failed to get backup status', 'error');
            }
            
        } catch (error) {
            console.error('Backup status error:', error);
            showAlert('❌ Failed to check backup status', 'error');
        }
    };
    
    // Update backup status UI
    function updateBackupStatusUI(status) {
        const statusInfo = document.getElementById('statusInfo');
        
        let statusHTML = `
            <div class="status-item">
                <strong>📅 Auto Backup:</strong> ${status.autoBackup ? `✅ Enabled (${status.interval})` : '❌ Disabled'}
            </div>
            <div class="status-item">
                <strong>🕐 Next Backup:</strong> ${status.nextBackup || 'Not scheduled'}
            </div>
            <div class="status-item">
                <strong>📱 Telegram:</strong> ${status.telegramConfigured ? '✅ Configured' : '❌ Not configured'}
            </div>
            <div class="status-item">
                <strong>🔄 Last Backup:</strong> ${status.lastBackup || 'Never'}
            </div>
        `;
        
        statusInfo.innerHTML = statusHTML;
    }
    
    // Log backup to history
    function logBackupToHistory(type, filename) {
        const history = JSON.parse(localStorage.getItem('backupHistory') || '[]');
        history.unshift({
            type: type,
            filename: filename,
            timestamp: new Date().toISOString(),
            size: 'Unknown'
        });
        
        // Keep only last 10 entries
        if (history.length > 10) {
            history.splice(10);
        }
        
        localStorage.setItem('backupHistory', JSON.stringify(history));
        loadBackupHistory();
    }
    
    // Load backup history
    function loadBackupHistory() {
        const history = JSON.parse(localStorage.getItem('backupHistory') || '[]');
        const backupHistory = document.getElementById('backupHistory');
        
        if (history.length === 0) {
            backupHistory.innerHTML = '<p>No backup history available.</p>';
            return;
        }
        
        backupHistory.innerHTML = history.map(backup => `
            <div class="backup-history-item" style="background: white; padding: 15px; margin-bottom: 10px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${backup.type === 'telegram' ? '📱 Telegram' : '💾 Local'} Backup</strong>
                        <div style="font-size: 0.9em; color: #666;">${backup.filename}</div>
                    </div>
                    <div style="text-align: right; font-size: 0.9em; color: #666;">
                        ${new Date(backup.timestamp).toLocaleDateString()}<br>
                        ${new Date(backup.timestamp).toLocaleTimeString()}
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    // Load saved Telegram config on page load
    window.loadTelegramConfig = function() {
        const botToken = localStorage.getItem('telegramBotToken');
        const chatId = localStorage.getItem('telegramChatId');
        
        if (botToken) {
            document.getElementById('telegramBotToken').value = botToken;
        }
        if (chatId) {
            document.getElementById('telegramChatId').value = chatId;
        }
    };

    // ============ RECOVER BACKUP FUNCTIONALITY ============
    
    // Recover from backup file
    window.recoverFromBackup = async function() {
        if (window.currentAdmin?.role !== 'super_admin') {
            showAlert('Access denied - Super Admin only', 'error');
            return;
        }
        
        const fileInput = document.getElementById('backupFile');
        const file = fileInput.files[0];
        
        if (!file) {
            showAlert('❌ Please select a backup file first', 'error');
            return;
        }
        
        if (!file.name.endsWith('.json')) {
            showAlert('❌ Please select a valid JSON backup file', 'error');
            return;
        }
        
        // Strong confirmation
        const confirmed = confirm(`⚠️ DANGER: This will REPLACE ALL current data with backup data!

This action will:
- Delete all current users, accounts, and sales data
- Replace with data from the backup file
- This action CANNOT BE UNDONE

Are you absolutely sure you want to continue?`);
        
        if (!confirmed) return;
        
        const doubleConfirm = prompt('Type "DELETE ALL DATA" to confirm this dangerous operation:');
        if (doubleConfirm !== 'DELETE ALL DATA') {
            showAlert('❌ Operation cancelled - confirmation text incorrect', 'info');
            return;
        }
        
        try {
            showAlert('📥 Reading backup file...', 'info');
            
            // Read file content
            const fileContent = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });
            
            // Parse JSON
            let backupData;
            try {
                backupData = JSON.parse(fileContent);
            } catch (error) {
                throw new Error('Invalid JSON format in backup file');
            }
            
            // Validate backup structure
            if (!backupData.data || !backupData.metadata) {
                throw new Error('Invalid backup file structure');
            }
            
            showAlert('🔄 Restoring database... This may take a moment', 'info');
            
            // Send to server
            const response = await fetch('/api/admin/backup/recover', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                },
                body: JSON.stringify({ backupData })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert(`✅ Database restored successfully!
📊 Restored: ${result.stats.users} users, ${result.stats.accounts} accounts, ${result.stats.sales} sales
🕐 Backup date: ${new Date(backupData.metadata.createdAt).toLocaleString()}`, 'success');
                
                // Refresh all data
                loadDashboardStats();
                loadUsers();
                loadAccounts();
                loadSoldAccounts();
                
                // Clear file input
                fileInput.value = '';
            } else {
                showAlert('❌ Failed to restore backup: ' + result.error, 'error');
            }
            
        } catch (error) {
            console.error('Backup recovery error:', error);
            showAlert('❌ Failed to recover backup: ' + error.message, 'error');
        }
    };

    // ============ SALES NOTIFICATIONS FUNCTIONALITY ============
    
    // Save notification configuration
    window.saveNotificationConfig = async function() {
        const botToken = document.getElementById('notificationBotToken').value.trim();
        const chatId = document.getElementById('notificationChatId').value.trim();
        const template = document.getElementById('notificationTemplate').value.trim();
        
        if (!botToken || !chatId) {
            showAlert('❌ Please enter both Bot Token and Chat ID', 'error');
            return;
        }
        
        try {
            showAlert('💾 Saving notification settings...', 'info');
            
            // Save to server
            const response = await fetch('/api/admin/notification/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                },
                body: JSON.stringify({
                    notificationBotToken: botToken,
                    notificationChatId: chatId,
                    notificationTemplate: template || getDefaultNotificationTemplate()
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Also save to localStorage as backup
                localStorage.setItem('notificationBotToken', botToken);
                localStorage.setItem('notificationChatId', chatId);
                localStorage.setItem('notificationTemplate', template || getDefaultNotificationTemplate());
                
                showAlert('✅ Notification settings saved to server successfully!', 'success');
            } else {
                showAlert('❌ Failed to save settings: ' + result.error, 'error');
            }
            
        } catch (error) {
            console.error('Save notification config error:', error);
            showAlert('❌ Failed to save notification settings', 'error');
        }
    };
    
    // Test sales notification
    window.testNotification = async function() {
        try {
            showAlert('🧪 Sending test notification...', 'info');
            
            // Use server API to test notification
            const response = await fetch('/api/admin/notification/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                showAlert('✅ Test notification sent successfully!', 'success');
            } else {
                showAlert('❌ Test notification failed: ' + result.error, 'error');
            }
            
        } catch (error) {
            console.error('Test notification error:', error);
            showAlert('❌ Test notification failed: ' + error.message, 'error');
        }
    };
    
    // Load saved notification config
    window.loadNotificationConfig = function() {
        const botToken = localStorage.getItem('notificationBotToken');
        const chatId = localStorage.getItem('notificationChatId');
        const template = localStorage.getItem('notificationTemplate');
        
        if (botToken) {
            document.getElementById('notificationBotToken').value = botToken;
        }
        if (chatId) {
            document.getElementById('notificationChatId').value = chatId;
        }
        if (template) {
            document.getElementById('notificationTemplate').value = template;
        }
    };
    
    // Get default notification template
    function getDefaultNotificationTemplate() {
        return `🛒 New Sale Alert!

💰 Product: {product}
👤 Customer: {customer}
💳 Amount: {amount} credits
📅 Time: {time}

Order: {orderCode}`;
    }
    
    // Load configs when backup tab is accessed
    const originalSwitchToTab = window.switchToTab || function() {};
    window.switchToTab = function(tabName) {
        originalSwitchToTab(tabName);
        
        if (tabName === 'backup') {
            // Load configs
            setTimeout(() => {
                loadTelegramConfig();
                loadNotificationConfig();
            }, 100);
        }
    };

    // ============ DROPBOX BACKUP (Easier than Google) ============
    
    window.uploadToDropbox = async function() {
        console.log('📦 Starting Dropbox backup...');
        
        // Simple Dropbox upload with access token
        const accessToken = prompt('Enter your Dropbox Access Token:\n(Get from Dropbox App Console)');
        if (!accessToken) return;
        
        try {
            showAlert('📦 Creating backup and uploading to Dropbox...', 'info');
            
            // Get system data
            const systemData = await fetchSystemData();
            const backupContent = createBackupContent(systemData);
            const fileName = `BOT-Delivery-Backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            
            // Upload to Dropbox
            const dropboxResponse = await fetch('https://content.dropboxapi.com/2/files/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Dropbox-API-Arg': JSON.stringify({
                        path: `/${fileName}`,
                        mode: 'add',
                        autorename: true
                    }),
                    'Content-Type': 'application/octet-stream'
                },
                body: backupContent
            });
            
            if (dropboxResponse.ok) {
                const result = await dropboxResponse.json();
                showAlert(`✅ Backup uploaded to Dropbox successfully!\nFile: ${result.name}`, 'success');
            } else {
                const error = await dropboxResponse.json();
                throw new Error(error.error_summary || 'Dropbox API error');
            }
            
        } catch (error) {
            console.error('Dropbox backup error:', error);
            showAlert('❌ Failed to upload to Dropbox: ' + error.message, 'error');
        }
    };

    // Show backup progress
    function showBackupProgress(message, percentage) {
        let progressDiv = document.getElementById('backupProgress');
        if (!progressDiv) {
            progressDiv = document.createElement('div');
            progressDiv.id = 'backupProgress';
            progressDiv.className = 'backup-progress';
            
            const backupControls = document.getElementById('backupControls');
            backupControls.parentNode.insertBefore(progressDiv, backupControls.nextSibling);
        }

        progressDiv.innerHTML = `
            <h4>🔄 Backup in Progress</h4>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="backup-status">${message}</div>
        `;
    }

    // Hide backup progress
    function hideBackupProgress() {
        const progressDiv = document.getElementById('backupProgress');
        if (progressDiv) {
            setTimeout(() => {
                progressDiv.remove();
            }, 1000);
        }
    }

    // ============ SOLD ACCOUNTS MANAGEMENT ============
    
    let allSoldAccounts = [];

    // Load sold accounts
    async function loadSoldAccounts() {
        try {
            const response = await fetch('/api/admin/sold-accounts');
            allSoldAccounts = await response.json();
            
            updateSoldAccountsStats();
            displaySoldAccounts(allSoldAccounts);
            updateSoldSearchStats(allSoldAccounts.length, allSoldAccounts.length, '');
        } catch (error) {
            console.error('Error loading sold accounts:', error);
            document.getElementById('soldAccountsList').innerHTML = '<p>Error loading sold accounts.</p>';
        }
    }

    // Update sold accounts statistics
    function updateSoldAccountsStats() {
        const totalSales = allSoldAccounts.length;
        const totalRevenue = allSoldAccounts.reduce((sum, sale) => sum + sale.total_cost, 0);
        const uniqueCustomers = new Set(allSoldAccounts.map(sale => sale.username)).size;
        
        // Find top product
        const productCounts = {};
        allSoldAccounts.forEach(sale => {
            productCounts[sale.account_title] = (productCounts[sale.account_title] || 0) + sale.quantity;
        });
        
        const topProduct = Object.keys(productCounts).length > 0 ? 
            Object.keys(productCounts).reduce((a, b) => productCounts[a] > productCounts[b] ? a : b) : '-';

        document.getElementById('totalSales').textContent = totalSales;
        document.getElementById('totalRevenue').textContent = totalRevenue;
        document.getElementById('uniqueCustomers').textContent = uniqueCustomers;
        document.getElementById('topProduct').textContent = topProduct.length > 15 ? topProduct.substring(0, 15) + '...' : topProduct;
    }

    // Display sold accounts
    function displaySoldAccounts(soldAccounts) {
        const soldAccountsList = document.getElementById('soldAccountsList');
        
        if (soldAccounts.length === 0) {
            soldAccountsList.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;"><h3>No sales found</h3><p>No accounts have been sold yet</p></div>';
            return;
        }

        soldAccountsList.innerHTML = soldAccounts.map(sale => `
            <div class="sold-account-item" style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div class="item-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div class="item-title" style="font-size: 1.1em; font-weight: bold; color: #2c3e50;">
                        🛒 Order: ${escapeHtml(sale.order_code)}
                    </div>
                    <div class="item-date" style="color: #7f8c8d; font-size: 0.9em;">
                        ${new Date(sale.download_date).toLocaleDateString()} ${new Date(sale.download_date).toLocaleTimeString()}
                    </div>
                </div>
                
                <div class="customer-info" style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div>
                            <strong>👤 Customer:</strong> ${escapeHtml(sale.username)}<br>
                            <strong>🔑 Auth Code:</strong> <span onclick="copyToClipboard('${sale.user_auth_code}')" style="cursor: pointer; color: #3498db; text-decoration: underline;" title="Click to copy">${sale.user_auth_code}</span>
                        </div>
                        <div>
                            <strong>📦 Product:</strong> ${escapeHtml(sale.account_title)}<br>
                            ${sale.account_description ? `<strong>📝 Description:</strong> ${escapeHtml(sale.account_description)}` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="sale-details" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 15px;">
                    <div class="detail-item" style="text-align: center; padding: 10px; background: #e8f5e8; border-radius: 6px;">
                        <div style="font-size: 1.5em; font-weight: bold; color: #27ae60;">×${sale.quantity}</div>
                        <div style="font-size: 0.8em; color: #666;">Quantity</div>
                    </div>
                    <div class="detail-item" style="text-align: center; padding: 10px; background: #e8f4f8; border-radius: 6px;">
                        <div style="font-size: 1.5em; font-weight: bold; color: #3498db;">${sale.credit_cost}</div>
                        <div style="font-size: 0.8em; color: #666;">Price/Unit</div>
                    </div>
                    <div class="detail-item" style="text-align: center; padding: 10px; background: #fff3cd; border-radius: 6px;">
                        <div style="font-size: 1.5em; font-weight: bold; color: #f39c12;">${sale.total_cost}</div>
                        <div style="font-size: 0.8em; color: #666;">Total Credits</div>
                    </div>
                </div>
                
                <div class="purchased-data" style="background: #f1f2f6; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                    <strong>📄 Purchased Data:</strong>
                    <div style="max-height: 100px; overflow-y: auto; margin-top: 8px; padding: 8px; background: white; border-radius: 4px; font-family: monospace; font-size: 0.9em; white-space: pre-wrap;">${escapeHtml(sale.purchased_data)}</div>
                </div>
                
                <div class="item-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn btn-info btn-small" onclick="viewFullSaleDetails(${sale.id})" style="background: #17a2b8; color: white;">
                        👁️ View Details
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="copySaleData('${escapeHtml(sale.purchased_data)}')" style="background: #6c757d; color: white;">
                        📋 Copy Data
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Search sold accounts and other functions (continuing the file)
    window.searchSoldAccounts = function() {
        const searchTerm = document.getElementById('soldAccountSearch').value.toLowerCase();
        const dateFilter = document.getElementById('dateFilter').value;
        
        let filteredSales = allSoldAccounts.filter(sale => {
            const matchesSearch = !searchTerm || 
                sale.username.toLowerCase().includes(searchTerm) ||
                sale.order_code.toLowerCase().includes(searchTerm) ||
                sale.account_title.toLowerCase().includes(searchTerm) ||
                sale.user_auth_code.toLowerCase().includes(searchTerm);
            
            const matchesDate = filterByDate(sale.download_date, dateFilter);
            
            return matchesSearch && matchesDate;
        });
        
        displaySoldAccounts(filteredSales);
        updateSoldSearchStats(filteredSales.length, allSoldAccounts.length, searchTerm);
    };

    // Additional functions
    function filterByDate(dateString, filter) {
        if (filter === 'all') return true;
        
        const saleDate = new Date(dateString);
        const now = new Date();
        
        switch(filter) {
            case 'today':
                return saleDate.toDateString() === now.toDateString();
            case 'week':
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                return saleDate >= weekAgo;
            case 'month':
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                return saleDate >= monthAgo;
            default:
                return true;
        }
    }

    window.filterSoldAccounts = function() {
        searchSoldAccounts();
    };

    function updateSoldSearchStats(filtered, total, searchTerm) {
        const searchResults = document.getElementById('soldSearchResults');
        if (searchTerm) {
            searchResults.textContent = `Found ${filtered} of ${total} sales for "${searchTerm}"`;
        } else {
            const dateFilter = document.getElementById('dateFilter').value;
            if (dateFilter !== 'all') {
                const filterText = {
                    'today': 'today',
                    'week': 'this week',
                    'month': 'this month'
                }[dateFilter] || dateFilter;
                searchResults.textContent = `Showing ${filtered} sales from ${filterText} of ${total} total`;
            } else {
                searchResults.textContent = `Showing all ${total} sales`;
            }
        }
    }

});