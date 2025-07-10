// Check authentication
const authToken = localStorage.getItem('adminToken');
if (!authToken) {
    window.location.href = '/';
}

let currentAdminRole = 'super_admin'; // Default

// Load admin info
fetch('/api/admin/me', {
    headers: {
        'Authorization': `Bearer ${authToken}`
    }
})
.then(response => {
    if (!response.ok) throw new Error('Auth failed');
    return response.json();
})
.then(data => {
    currentAdminRole = data.role;
    document.getElementById('adminRoleBadge').textContent = 
        data.role === 'super_admin' ? '👑 Super Admin' : `🔑 ${data.name}`;
    
    // Show/hide super admin features
    const isSuper = data.role === 'super_admin';
    document.querySelectorAll('.super-admin-only').forEach(el => {
        el.style.display = isSuper ? 'block' : 'none';
    });
})
.catch(() => handleLogout());

// Tab Navigation
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        if (!tabName) return; // Skip for non-tab buttons

        // Update active states
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load data when tab is changed
        switch(tabName) {
            case 'users':
                loadUsers();
                loadSubAdmins();
                break;
            case 'accounts':
                loadAccounts();
                break;
            case 'sold-accounts':
                loadSoldAccounts();
                loadSalesStats();
                break;
            case 'shared-accounts':
                loadSharedAccounts();
                break;
            case 'user-discounts':
                loadUserDiscounts();
                loadUsersForDiscounts();
                loadProductsForDiscounts();
                break;
            case 'coupon-codes':
                loadCouponCodes();
                loadProductsForCoupons();
                break;
            case 'backup':
                loadBackupConfig();
                break;
        }
    });
});

// Load dashboard stats
function loadStats() {
    fetch('/api/admin/stats', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(stats => {
        document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
        document.getElementById('totalAccounts').textContent = stats.totalAccounts || 0;
        document.getElementById('totalCredits').textContent = stats.totalCredits || 0;
        document.getElementById('totalSold').textContent = stats.totalSold || 0;
    })
    .catch(error => console.error('Error loading stats:', error));
}

// Load sales statistics for sold accounts tab
function loadSalesStats() {
    fetch('/api/admin/sales-stats', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(stats => {
        document.getElementById('totalSales').textContent = stats.totalSales || 0;
        document.getElementById('totalCreditsUsed').textContent = stats.totalRevenue || 0;
        document.getElementById('uniqueCustomers').textContent = stats.uniqueCustomers || 0;
        document.getElementById('topProduct').textContent = stats.topProduct || '-';
    })
    .catch(error => console.error('Error loading sales stats:', error));
}

// Load users
function loadUsers() {
    fetch('/api/admin/users', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(users => {
        const tbody = document.getElementById('usersList');
        tbody.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="user-info">
                    <h4>${user.username}</h4>
                    <p>Auth Code: <span class="auth-code">${user.auth_code}</span></p>
                    <p>Credits: <input type="number" value="${user.credits}" 
                                     onchange="updateCredits(${user.id}, this.value)" 
                                     min="0" step="0.01"></p>
                    <p>Downloads: ${user.total_downloads}</p>
                    <p>Created: ${new Date(user.created_date).toLocaleDateString()}</p>
                    <p>Status: <span class="status-badge status-${user.status}">${user.status}</span></p>
                </div>
                <div class="user-actions">
                    <button class="btn btn-primary" onclick="editUser(${user.id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteUser(${user.id})">Delete</button>
                </div>
            </div>
        `).join('');
    })
    .catch(error => {
        console.error('Error loading users:', error);
        document.getElementById('usersList').innerHTML = '<p>Error loading users</p>';
    });
}

// Load sub admins
function loadSubAdmins() {
    const subAdminsList = document.getElementById('subAdminsList');
    subAdminsList.innerHTML = '<p>No sub admins created yet</p>';
    // TODO: Implement sub admin API endpoints
}

// Load accounts
function loadAccounts() {
    fetch('/api/admin/accounts', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(accounts => {
        const tbody = document.getElementById('accountsList');
        tbody.innerHTML = accounts.map(account => `
            <div class="account-item">
                <div class="account-info">
                    <h4>${account.title}</h4>
                    <p>${account.description || 'No description'}</p>
                    <p>Credit Cost: ${account.credit_cost}</p>
                    <p>Stock: ${account.stock_quantity}</p>
                    <p>Sold: ${account.total_sold}</p>
                    <p>Upload Date: ${new Date(account.upload_date).toLocaleDateString()}</p>
                    ${account.logo_path ? `<img src="${account.logo_path}" alt="Logo" class="account-logo">` : ''}
                </div>
                <div class="account-actions">
                    <button class="btn btn-primary" onclick="editAccount(${account.id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteAccount(${account.id})">Delete</button>
                </div>
            </div>
        `).join('');
    })
    .catch(error => {
        console.error('Error loading accounts:', error);
        document.getElementById('accountsList').innerHTML = '<p>Error loading accounts</p>';
    });
}

// Load sold accounts
function loadSoldAccounts() {
    fetch('/api/admin/sold-accounts', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(sales => {
        const tbody = document.getElementById('soldAccountsList');
        tbody.innerHTML = sales.map(sale => `
            <div class="sale-item">
                <div class="sale-info">
                    <h4>Order: ${sale.order_code}</h4>
                    <p>👤 Customer: ${sale.username}</p>
                    <p>🔑 Auth Code: ${sale.user_auth_code}</p>
                    <p>📦 Product: ${sale.account_title}</p>
                    <p>📊 Quantity: ${sale.quantity}</p>
                    <p>💰 Cost: ${sale.total_cost} credits</p>
                    <p>📅 Date: ${new Date(sale.download_date).toLocaleString()}</p>
                    ${sale.account_description ? `<p>📝 Description: ${sale.account_description}</p>` : ''}
                </div>
                <div class="sale-data">
                    <h5>📋 Purchased Data:</h5>
                    <pre>${sale.purchased_data}</pre>
                </div>
            </div>
        `).join('');
    })
    .catch(error => {
        console.error('Error loading sold accounts:', error);
        document.getElementById('soldAccountsList').innerHTML = '<p>Error loading sold accounts</p>';
    });
}

// Load shared accounts (placeholder)
function loadSharedAccounts() {
    const sharedAccountsList = document.getElementById('sharedAccountsList');
    sharedAccountsList.innerHTML = '<p>Loading shared accounts...</p>';
    // TODO: Implement shared accounts API
}

// Load user discounts (placeholder)
function loadUserDiscounts() {
    fetch('/api/admin/user-discounts', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(discounts => {
        const userDiscountsList = document.getElementById('userDiscountsList');
        
        if (discounts.length === 0) {
            userDiscountsList.innerHTML = `
                <div class="no-data">
                    <p>No discounts found</p>
                    <p>No user discounts have been created yet</p>
                </div>
            `;
            return;
        }
        
        userDiscountsList.innerHTML = `
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Product</th>
                            <th>Discount</th>
                            <th>Description</th>
                            <th>Expires</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${discounts.map(discount => `
                            <tr>
                                <td><strong>${discount.username}</strong></td>
                                <td>${discount.account_title || 'All Products'}</td>
                                <td><span class="discount-badge">${discount.discount_percentage}%</span></td>
                                <td>${discount.description || '-'}</td>
                                <td>${discount.expires_date ? new Date(discount.expires_date).toLocaleDateString() : 'Never'}</td>
                                <td><span class="status-badge ${discount.status}">${discount.status}</span></td>
                                <td>
                                    <button class="btn btn-small btn-primary" onclick="editUserDiscount(${discount.id})">Edit</button>
                                    <button class="btn btn-small btn-danger" onclick="deleteUserDiscount(${discount.id})">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    })
    .catch(error => {
        console.error('Error loading user discounts:', error);
        showAlert('Error loading user discounts', 'error');
    });
}

// Load users for discount dropdown
function loadUsersForDiscounts() {
    fetch('/api/admin/users', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(users => {
        const select = document.getElementById('discountUser');
        select.innerHTML = '<option value="">Select User</option>' +
            users.map(user => `<option value="${user.id}">${user.username}</option>`).join('');
    })
    .catch(error => console.error('Error loading users for discounts:', error));
}

// Load products for discount dropdown
function loadProductsForDiscounts() {
    fetch('/api/admin/accounts', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(accounts => {
        const select = document.getElementById('discountProduct');
        select.innerHTML = '<option value="">All Products</option>' +
            accounts.map(account => `<option value="${account.id}">${account.title}</option>`).join('');
    })
    .catch(error => console.error('Error loading products for discounts:', error));
}

// Add user discount form handler
document.getElementById('addUserDiscountForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const discountData = {
        userId: formData.get('userId'),
        productId: formData.get('productId') || null,
        percentage: parseInt(formData.get('percentage')),
        description: formData.get('description'),
        expiresDate: formData.get('expiresDate') || null
    };
    
    fetch('/api/admin/user-discounts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(discountData)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('User discount added successfully!', 'success');
            e.target.reset();
            loadUserDiscounts();
        } else {
            showAlert(result.error || 'Failed to add user discount', 'error');
        }
    })
    .catch(error => {
        console.error('Error adding user discount:', error);
        showAlert('Error adding user discount', 'error');
    });
});

// Delete user discount
function deleteUserDiscount(discountId) {
    if (!confirm('Are you sure you want to delete this user discount?')) return;
    
    fetch(`/api/admin/user-discounts/${discountId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('User discount deleted successfully!', 'success');
            loadUserDiscounts();
        } else {
            showAlert(result.error || 'Failed to delete user discount', 'error');
        }
    })
    .catch(error => {
        console.error('Error deleting user discount:', error);
        showAlert('Error deleting user discount', 'error');
    });
}

// Load coupon codes (placeholder)
function loadCouponCodes() {
    fetch('/api/admin/coupon-codes', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(coupons => {
        const couponCodesList = document.getElementById('couponCodesList');
        
        if (coupons.length === 0) {
            couponCodesList.innerHTML = `
                <div class="no-data">
                    <p>No coupons found</p>
                    <p>No coupon codes have been created yet</p>
                </div>
            `;
            return;
        }
        
        couponCodesList.innerHTML = `
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Discount</th>
                            <th>Product</th>
                            <th>Usage</th>
                            <th>Description</th>
                            <th>Expires</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${coupons.map(coupon => `
                            <tr>
                                <td><code>${coupon.code}</code></td>
                                <td><span class="discount-badge">${coupon.discount_percentage}%</span></td>
                                <td>${coupon.account_title || 'All Products'}</td>
                                <td>${coupon.used_count}/${coupon.max_uses === -1 ? '∞' : coupon.max_uses}</td>
                                <td>${coupon.description || '-'}</td>
                                <td>${coupon.expires_date ? new Date(coupon.expires_date).toLocaleDateString() : 'Never'}</td>
                                <td><span class="status-badge ${coupon.status}">${coupon.status}</span></td>
                                <td>
                                    <button class="btn btn-small btn-primary" onclick="editCouponCode(${coupon.id})">Edit</button>
                                    <button class="btn btn-small btn-danger" onclick="deleteCouponCode(${coupon.id})">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    })
    .catch(error => {
        console.error('Error loading coupon codes:', error);
        showAlert('Error loading coupon codes', 'error');
    });
}

// Load products for coupon dropdown
function loadProductsForCoupons() {
    fetch('/api/admin/accounts', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(accounts => {
        const select = document.getElementById('couponProduct');
        select.innerHTML = '<option value="">All Products</option>' +
            accounts.map(account => `<option value="${account.id}">${account.title}</option>`).join('');
    })
    .catch(error => console.error('Error loading products for coupons:', error));
}

// Create coupon form handler
document.getElementById('createCouponForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const couponData = {
        code: formData.get('code').toUpperCase(),
        percentage: parseInt(formData.get('percentage')),
        productId: formData.get('productId') || null,
        maxUses: parseInt(formData.get('maxUses')) || 1,
        description: formData.get('description'),
        expiresDate: formData.get('expiresDate') || null
    };
    
    fetch('/api/admin/coupon-codes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(couponData)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('Coupon code created successfully!', 'success');
            e.target.reset();
            loadCouponCodes();
        } else {
            showAlert(result.error || 'Failed to create coupon code', 'error');
        }
    })
    .catch(error => {
        console.error('Error creating coupon code:', error);
        showAlert('Error creating coupon code', 'error');
    });
});

// Delete coupon code
function deleteCouponCode(couponId) {
    if (!confirm('Are you sure you want to delete this coupon code?')) return;
    
    fetch(`/api/admin/coupon-codes/${couponId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('Coupon code deleted successfully!', 'success');
            loadCouponCodes();
        } else {
            showAlert(result.error || 'Failed to delete coupon code', 'error');
        }
    })
    .catch(error => {
        console.error('Error deleting coupon code:', error);
        showAlert('Error deleting coupon code', 'error');
    });
}

// Load backup configuration
function loadBackupConfig() {
    fetch('/api/admin/backup-config', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(config => {
        // Fill backup configuration form
        if (config.bot_token) document.getElementById('botToken').value = config.bot_token;
        if (config.chat_id) document.getElementById('chatId').value = config.chat_id;
        if (config.notification_bot_token) document.getElementById('notificationBotToken').value = config.notification_bot_token;
        if (config.notification_chat_id) document.getElementById('notificationChatId').value = config.notification_chat_id;
        if (config.message_template) document.getElementById('messageTemplate').value = config.message_template;
    })
    .catch(error => console.error('Error loading backup config:', error));
}

// Add user
async function handleAddUser(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const credits = parseFloat(document.getElementById('credits').value) || 0;

    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ username, credits })
        });

        const data = await response.json();
        if (data.success) {
            alert(`User created successfully!\nAuth Code: ${data.authCode}`);
            document.getElementById('addUserForm').reset();
            loadUsers();
            loadStats();
        } else {
            alert(data.error || 'Failed to create user');
        }
    } catch (error) {
        alert('Error creating user');
    }
}

// Add account
async function handleAddAccount(event) {
    event.preventDefault();
    
    let logoPath = null;
    const logoFile = document.getElementById('productLogo').files[0];
    
    if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        
        try {
            const uploadResponse = await fetch('/api/admin/upload-logo', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
                body: formData
            });
            
            const uploadData = await uploadResponse.json();
            if (uploadData.success) {
                logoPath = uploadData.logoPath;
            }
        } catch (error) {
            console.error('Logo upload failed:', error);
        }
    }

    const accountData = {
        title: document.getElementById('accountTitle').value,
        accountData: document.getElementById('accountData').value,
        description: document.getElementById('accountDescription').value,
        creditCost: parseFloat(document.getElementById('creditCost').value) || 1,
        logoPath: logoPath
    };

    try {
        const response = await fetch('/api/admin/accounts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(accountData)
        });

        const data = await response.json();
        if (data.success) {
            alert('Account created successfully!');
            document.getElementById('addAccountForm').reset();
            loadAccounts();
            loadStats();
        } else {
            alert(data.error || 'Failed to create account');
        }
    } catch (error) {
        alert('Error creating account');
    }
}

// Update user credits
async function updateCredits(userId, newCredits) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/credits`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ credits: parseFloat(newCredits) })
        });

        const data = await response.json();
        if (data.success) {
            loadStats(); // Refresh stats
        } else {
            alert(data.error || 'Failed to update credits');
            loadUsers(); // Reload to reset input
        }
    } catch (error) {
        alert('Error updating credits');
        loadUsers(); // Reload to reset input
    }
}

// Edit user
function editUser(userId) {
    // Simple implementation - for now just focus on credits
    const newCredits = prompt('Enter new credits amount:');
    if (newCredits !== null && !isNaN(newCredits)) {
        updateCredits(userId, newCredits);
    }
}

// Delete user
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();
        if (data.success) {
            loadUsers();
            loadStats();
        } else {
            alert(data.error || 'Failed to delete user');
        }
    } catch (error) {
        alert('Error deleting user');
    }
}

// Edit account
function editAccount(accountId) {
    fetch('/api/admin/accounts', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(accounts => {
        const account = accounts.find(a => a.id === accountId);
        if (account) {
            document.getElementById('editAccountId').value = account.id;
            document.getElementById('editAccountTitle').value = account.title;
            document.getElementById('editAccountDescription').value = account.description || '';
            document.getElementById('editAccountCreditCost').value = account.credit_cost;
            document.getElementById('editAccountData').value = account.account_data;
            
            updateAccountStats();
            document.getElementById('editAccountModal').style.display = 'block';
        }
    })
    .catch(error => {
        alert('Error loading account details');
    });
}

// Update account stats in edit modal
function updateAccountStats() {
    const accountData = document.getElementById('editAccountData').value;
    const lines = accountData.split('\n').filter(line => line.trim());
    document.getElementById('editAccountStats').textContent = 
        `${lines.length} accounts in stock`;
}

// Handle edit account form
async function handleEditAccount(event) {
    event.preventDefault();
    
    const accountId = document.getElementById('editAccountId').value;
    const accountData = {
        title: document.getElementById('editAccountTitle').value,
        description: document.getElementById('editAccountDescription').value,
        creditCost: parseFloat(document.getElementById('editAccountCreditCost').value),
        accountData: document.getElementById('editAccountData').value
    };

    try {
        const response = await fetch(`/api/admin/accounts/${accountId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(accountData)
        });

        const data = await response.json();
        if (data.success) {
            alert('Account updated successfully!');
            closeModal('editAccountModal');
            loadAccounts();
            loadStats();
        } else {
            alert(data.error || 'Failed to update account');
        }
    } catch (error) {
        alert('Error updating account');
    }
}

// Remove duplicates from account data
function removeDuplicates() {
    const accountData = document.getElementById('editAccountData').value;
    const lines = accountData.split('\n').filter(line => line.trim());
    const uniqueLines = [...new Set(lines)];
    document.getElementById('editAccountData').value = uniqueLines.join('\n');
    updateAccountStats();
    alert(`Removed ${lines.length - uniqueLines.length} duplicates`);
}

// Delete account
async function deleteAccount(accountId) {
    if (!confirm('Are you sure you want to delete this account?')) return;

    try {
        const response = await fetch(`/api/admin/accounts/${accountId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();
        if (data.success) {
            loadAccounts();
            loadStats();
        } else {
            alert(data.error || 'Failed to delete account');
        }
    } catch (error) {
        alert('Error deleting account');
    }
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Search functions
function searchUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const items = document.querySelectorAll('.user-item');
    let matches = 0;
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const display = text.includes(searchTerm);
        item.style.display = display ? '' : 'none';
        if (display) matches++;
    });
    
    document.getElementById('searchResults').textContent = 
        `Showing ${matches} user${matches !== 1 ? 's' : ''}`;
}

function filterUsers() {
    const status = document.getElementById('statusFilter').value;
    const items = document.querySelectorAll('.user-item');
    let matches = 0;
    
    items.forEach(item => {
        const userStatus = item.querySelector('.status-badge').textContent;
        const display = status === 'all' || userStatus === status;
        item.style.display = display ? '' : 'none';
        if (display) matches++;
    });
    
    document.getElementById('searchResults').textContent = 
        `Showing ${matches} user${matches !== 1 ? 's' : ''}`;
}

function sortUsers() {
    const sortBy = document.getElementById('sortBy').value;
    const container = document.getElementById('usersList');
    const items = Array.from(container.getElementsByClassName('user-item'));
    
    items.sort((a, b) => {
        switch (sortBy) {
            case 'username':
                return a.querySelector('h4').textContent.localeCompare(b.querySelector('h4').textContent);
            case 'credits':
                return parseFloat(b.querySelector('input').value) - parseFloat(a.querySelector('input').value);
            case 'downloads':
                const aDownloads = parseInt(a.textContent.match(/Downloads: (\d+)/)?.[1] || 0);
                const bDownloads = parseInt(b.textContent.match(/Downloads: (\d+)/)?.[1] || 0);
                return bDownloads - aDownloads;
            default: // created_date
                return 0; // Keep original order
        }
    });
    
    items.forEach(item => container.appendChild(item));
}

// Search sold accounts
function searchSoldAccounts() {
    const searchTerm = document.getElementById('soldAccountSearch').value.toLowerCase();
    const items = document.querySelectorAll('.sale-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// Filter sold accounts by date
function filterSoldAccounts() {
    const filter = document.getElementById('dateFilter').value;
    const items = document.querySelectorAll('.sale-item');
    const now = new Date();
    
    items.forEach(item => {
        const dateText = item.querySelector('.sale-info p:last-child').textContent;
        const saleDate = new Date(dateText.split(': ')[1]);
        let show = true;
        
        switch (filter) {
            case 'today':
                show = saleDate.toDateString() === now.toDateString();
                break;
            case 'week':
                const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                show = saleDate >= weekAgo;
                break;
            case 'month':
                const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                show = saleDate >= monthAgo;
                break;
            default: // 'all'
                show = true;
        }
        
        item.style.display = show ? '' : 'none';
    });
}

// Clear search
function clearSearch() {
    document.getElementById('soldAccountSearch').value = '';
    document.getElementById('dateFilter').value = 'all';
    searchSoldAccounts();
    filterSoldAccounts();
}

// Export data (placeholder)
function exportData() {
    alert('Export functionality will be implemented soon!');
}

// Backup functions
async function saveBackupConfig() {
    const botToken = document.getElementById('botToken').value;
    const chatId = document.getElementById('chatId').value;
    const notificationBotToken = document.getElementById('notificationBotToken').value;
    const notificationChatId = document.getElementById('notificationChatId').value;
    const messageTemplate = document.getElementById('messageTemplate').value;

    try {
        const response = await fetch('/api/admin/backup-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                botToken,
                chatId,
                notificationBotToken,
                notificationChatId,
                messageTemplate
            })
        });

        const data = await response.json();
        if (data.success) {
            alert('✅ Backup configuration saved successfully!');
        } else {
            alert('❌ ' + (data.error || 'Failed to save configuration'));
        }
    } catch (error) {
        alert('❌ Error saving configuration: ' + error.message);
    }
}

async function testConnection() {
    const botToken = document.getElementById('botToken').value;
    const chatId = document.getElementById('chatId').value;

    if (!botToken || !chatId) {
        alert('❌ Please enter both Bot Token and Chat ID first');
        return;
    }

    try {
        const response = await fetch('/api/admin/test-telegram', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                botToken,
                chatId,
                type: 'backup'
            })
        });

        const data = await response.json();
        if (data.success) {
            alert('✅ ' + data.message);
        } else {
            alert('❌ ' + (data.error || 'Test failed'));
        }
    } catch (error) {
        alert('❌ Connection test failed: ' + error.message);
    }
}

async function sendBackupToTelegram() {
    if (!confirm('📤 This will create a backup and send it to your configured Telegram chat. Continue?')) {
        return;
    }

    const button = event.target;
    button.disabled = true;
    button.textContent = '📤 Creating backup...';

    try {
        const response = await fetch('/api/admin/create-backup', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();
        if (data.success) {
            alert('✅ ' + data.message);
        } else {
            alert('❌ ' + (data.error || 'Failed to create backup'));
        }
    } catch (error) {
        alert('❌ Backup failed: ' + error.message);
    } finally {
        button.disabled = false;
        button.textContent = '📤 Send Backup to Telegram Now';
    }
}

async function createLocalBackup() {
    const button = event.target;
    button.disabled = true;
    button.textContent = '💾 Creating backup...';

    try {
        const response = await fetch('/api/admin/create-local-backup', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();
        if (data.success) {
            alert('✅ ' + data.message);
            // Offer download
            if (data.downloadUrl) {
                const download = confirm('💾 Backup created! Do you want to download it now?');
                if (download) {
                    window.open(data.downloadUrl, '_blank');
                }
            }
        } else {
            alert('❌ ' + (data.error || 'Failed to create local backup'));
        }
    } catch (error) {
        alert('❌ Local backup failed: ' + error.message);
    } finally {
        button.disabled = false;
        button.textContent = '💾 Create Local Backup';
    }
}

function restoreDatabase() {
    if (confirm('⚠️ This will replace all current data with backup data. Are you sure?')) {
        alert('🚧 Database restore feature will be implemented soon!');
    }
}

async function saveNotificationConfig() {
    // Same as saveBackupConfig since they use the same endpoint
    await saveBackupConfig();
}

async function testNotification() {
    const notificationBotToken = document.getElementById('notificationBotToken').value;
    const notificationChatId = document.getElementById('notificationChatId').value;

    if (!notificationBotToken || !notificationChatId) {
        alert('❌ Please enter both Notification Bot Token and Chat ID first');
        return;
    }

    try {
        const response = await fetch('/api/admin/test-telegram', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                botToken: notificationBotToken,
                chatId: notificationChatId,
                type: 'notification'
            })
        });

        const data = await response.json();
        if (data.success) {
            alert('✅ ' + data.message);
        } else {
            alert('❌ ' + (data.error || 'Test notification failed'));
        }
    } catch (error) {
        alert('❌ Notification test failed: ' + error.message);
    }
}

// Handle logout (when auth fails)
function handleLogout() {
    logout();
}

// Logout
function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminLoginTime');
    localStorage.removeItem('adminRole');
    localStorage.removeItem('adminName');
    window.location.href = '/';
}

// Initial load
loadStats();
loadUsers();

// Event listeners
document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
document.getElementById('addAccountForm').addEventListener('submit', handleAddAccount);
document.getElementById('editAccountForm').addEventListener('submit', handleEditAccount);

// Update account stats when editing
document.getElementById('editAccountData').addEventListener('input', updateAccountStats);

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// Handle escape key to close modals
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
});