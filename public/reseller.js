document.addEventListener('DOMContentLoaded', function() {
    // Enhanced Elements
    const authForm = document.getElementById('authForm');
    const authCodeInput = document.getElementById('authCode');
    const authSection = document.getElementById('authSection');
    const userDashboard = document.getElementById('userDashboard');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const userCredits = document.getElementById('userCredits');
    const userDownloads = document.getElementById('userDownloads');
    const accountsList = document.getElementById('accountsList');
    const historyList = document.getElementById('historyList');
    const favoritesList = document.getElementById('favoritesList');
    const logoutBtn = document.getElementById('logoutBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const userAuthDisplay = document.getElementById('userAuthDisplay');
    
    // Enhanced UI Elements
    const togglePasswordBtn = document.querySelector('.toggle-password');
    const pasteCodeBtn = document.querySelector('.paste-code');
    const rememberAuthCheckbox = document.getElementById('rememberAuth');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    
    // Navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    const dashboardSections = document.querySelectorAll('.dashboard-section');
    const downloadModal = document.getElementById('downloadModal');
    const closeModal = document.querySelector('.close');
    
    // Current user data
    let currentUser = null;
    let currentAuthCode = null;
    let availableAccounts = [];
    let allAccounts = [];
    let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    let purchaseHistory = [];

    // Initialize
    const savedAuthCode = localStorage.getItem('authCode');
    const savedActiveTab = localStorage.getItem('activeTab') || 'accounts';
    
    if (savedAuthCode) {
        authCodeInput.value = savedAuthCode;
        verifyAuthCode(savedAuthCode).then(() => {
            // Restore active tab after successful authentication
            setTimeout(() => {
                if (savedActiveTab !== 'accounts') {
                    switchToSection(savedActiveTab);
                }
            }, 1000);
        });
    }

    // Auth form submission
    authForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const authCode = authCodeInput.value.trim().toUpperCase();
        if (!authCode) {
            showAlert('Please enter an authentication code', 'error');
            return;
        }

        await verifyAuthCode(authCode);
    });

    // Navigation functionality
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            
            // Save active tab to localStorage
            localStorage.setItem('activeTab', section);
            
            // Update buttons
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update sections
            dashboardSections.forEach(s => s.classList.remove('active'));
            document.getElementById(`${section}Section`).classList.add('active');
            
            // Load data for the section
            if (section === 'history') {
                loadPurchaseHistory();
            } else if (section === 'favorites') {
                loadFavorites();
            }
        });
    });

    // Logout functionality
    logoutBtn.addEventListener('click', function() {
        logout();
    });

    // Verify authentication code
    async function verifyAuthCode(authCode) {
        try {
            showLoading('Verifying authentication code...');
            
            const response = await fetch('/api/reseller/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ authCode })
            });

            const result = await response.json();

            if (result.success) {
                currentUser = result.user;
                currentAuthCode = authCode;
                
                // Save auth code for next visit
                localStorage.setItem('authCode', authCode);
                
                showUserDashboard();
                loadAccounts();
                showAlert('Successfully authenticated!', 'success');
            } else {
                showAlert(result.error || 'Invalid authentication code', 'error');
                hideLoading();
            }
        } catch (error) {
            console.error('Error verifying auth code:', error);
            showAlert('Authentication failed. Please try again.', 'error');
            hideLoading();
        }
    }

    // Show user dashboard
    function showUserDashboard() {
        authSection.style.display = 'none';
        userDashboard.style.display = 'block';
        
        welcomeMessage.textContent = `Welcome, ${currentUser.username}!`;
        userCredits.textContent = currentUser.credits;
        userDownloads.textContent = currentUser.totalDownloads;
        
        // Update auth code display
        if (userAuthDisplay && currentAuthCode) {
            userAuthDisplay.textContent = `🔑 ${currentAuthCode}`;
        }
        
        // Update credits spent
        const creditsSpentElement = document.getElementById('creditsSpent');
        if (creditsSpentElement) {
            creditsSpentElement.textContent = currentUser.creditsSpent || 0;
        }
        
        // Load favorites to update count
        loadFavorites();
        updateNavCounts();
        hideLoading();
    }

    // Load available accounts
    async function loadAccounts() {
        try {
            accountsList.innerHTML = '<p>Loading accounts...</p>';
            
            const response = await fetch('/api/reseller/accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ authCode: currentAuthCode })
            });

            const result = await response.json();

            if (result.accounts) {
                availableAccounts = result.accounts;
                currentUser.credits = result.userCredits; // Update credits
                userCredits.textContent = result.userCredits;
                
                allAccounts = result.accounts;
                displayAccounts(result.accounts);
                updateNavCounts();
            } else {
                showAlert('Failed to load accounts', 'error');
                accountsList.innerHTML = '<p>Failed to load accounts.</p>';
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
            accountsList.innerHTML = '<p>Error loading accounts.</p>';
        }
    }

    // Display accounts
    function displayAccounts(accounts) {
        if (accounts.length === 0) {
            accountsList.innerHTML = '<p>No accounts available at this time.</p>';
            return;
        }

        accountsList.innerHTML = accounts.map(account => `
            <div class="account-item">
                <div class="account-header">
                    <div class="account-title-section">
                        ${account.logo_path ? `<img src="${account.logo_path}" alt="Logo" class="product-logo" onerror="this.style.display='none'">` : ''}
                        <div class="account-title">📦 ${escapeHtml(account.title)}</div>
                    </div>
                    <div class="account-header-actions">
                        <button class="favorite-star" 
                                data-account-id="${account.id}" 
                                onclick="toggleFavorite(${account.id})"
                                title="${favorites.includes(account.id) ? 'Remove from favorites' : 'Add to favorites'}"
                                style="background: none; border: none; font-size: 20px; cursor: pointer; color: ${favorites.includes(account.id) ? '#fbbf24' : '#d1d5db'};">
                            ${favorites.includes(account.id) ? '⭐' : '☆'}
                        </button>
                        <div class="account-cost">💰 ${account.credit_cost} Credit${account.credit_cost !== 1 ? 's' : ''}</div>
                    </div>
                </div>
                
                ${account.description ? `
                <div class="account-description">
                    ${escapeHtml(account.description)}
                </div>
                ` : ''}
                
                                 <div class="account-stats">
                     <span>📦 Available: ${account.stock_quantity}</span>
                     <span>📊 Sold: ${account.total_sold || 0}</span>
                 </div>
                
                                 <div class="account-actions">
                     <div class="quantity-selector">
                         <label>Quantity:</label>
                         <input type="number" id="quantity_${account.id}" value="1" min="1" max="${account.stock_quantity}" 
                                onchange="updateDownloadButton(${account.id})" style="width: 60px; margin: 0 10px;">
                         <span class="total-cost" id="totalCost_${account.id}">Cost: ${account.credit_cost} credits</span>
                     </div>
                     <button class="btn btn-download" 
                             id="downloadBtn_${account.id}"
                             onclick="downloadAccount(${account.id})"
                             ${currentUser.credits < account.credit_cost || account.stock_quantity <= 0 ? 'disabled' : ''}>
                         ${account.stock_quantity <= 0 ? '❌ Out of Stock' : 
                           currentUser.credits < account.credit_cost ? '❌ Insufficient Credits' : '🛒 Buy'}
                     </button>
                 </div>
            </div>
        `).join('');
    }

    // Update download button based on quantity
    window.updateDownloadButton = function(accountId) {
        const account = availableAccounts.find(acc => acc.id === accountId) || allAccounts.find(acc => acc.id === accountId);
        if (!account) return;
        
        // Check for both regular and favorite view elements
        const quantityInput = document.getElementById(`quantity_${accountId}`) || document.getElementById(`quantity_fav_${accountId}`);
        const totalCostSpan = document.getElementById(`totalCost_${accountId}`) || document.getElementById(`totalCost_fav_${accountId}`);
        const downloadBtn = document.getElementById(`downloadBtn_${accountId}`) || document.getElementById(`downloadBtn_fav_${accountId}`);
        
        if (!quantityInput || !totalCostSpan || !downloadBtn) return;
        
        const quantity = parseInt(quantityInput.value) || 1;
        const totalCost = account.credit_cost * quantity;
        
        totalCostSpan.textContent = `Cost: ${totalCost} credits`;
        
        // Update button state
        if (quantity > account.stock_quantity) {
            downloadBtn.textContent = '❌ Not enough stock';
            downloadBtn.disabled = true;
        } else if (currentUser.credits < totalCost) {
            downloadBtn.textContent = '❌ Insufficient Credits';
            downloadBtn.disabled = true;
        } else {
            downloadBtn.textContent = '🛒 Buy';
            downloadBtn.disabled = false;
        }
    };

    // Download account
    window.downloadAccount = async function(accountId) {
        const account = availableAccounts.find(acc => acc.id === accountId) || allAccounts.find(acc => acc.id === accountId);
        if (!account) return;

        const quantityInput = document.getElementById(`quantity_${accountId}`) || document.getElementById(`quantity_fav_${accountId}`);
        const quantity = parseInt(quantityInput.value) || 1;
        const totalCost = account.credit_cost * quantity;

        if (currentUser.credits < totalCost) {
            showAlert('Insufficient credits to download this account', 'error');
            return;
        }

        if (quantity > account.stock_quantity) {
            showAlert('Not enough stock available', 'error');
            return;
        }

        if (!confirm(`Buy ${quantity}x "${account.title}" for ${totalCost} credit${totalCost !== 1 ? 's' : ''}?`)) {
            return;
        }

        try {
            showLoading('Processing purchase...');
            
            const response = await fetch('/api/reseller/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    authCode: currentAuthCode, 
                    accountId: accountId,
                    quantity: quantity
                })
            });

            const result = await response.json();

            if (result.success) {
                // Update user credits
                currentUser.credits = result.remainingCredits;
                currentUser.totalDownloads++;
                
                // Update credits spent
                if (!currentUser.creditsSpent) currentUser.creditsSpent = 0;
                currentUser.creditsSpent += totalCost;
                
                // Update UI
                userCredits.textContent = result.remainingCredits;
                userDownloads.textContent = currentUser.totalDownloads;
                const creditsSpentElement = document.getElementById('creditsSpent');
                if (creditsSpentElement) {
                    creditsSpentElement.textContent = currentUser.creditsSpent;
                }
                
                // Show account data in modal with order code
                showAccountData(result.account, result.orderCode);
                
                // Reload accounts to update download counts and button states
                loadAccounts();
                
                showAlert(`${result.quantity}x accounts purchased successfully! Order Code: ${result.orderCode}`, 'success');
            } else {
                showAlert(result.error || 'Purchase failed', 'error');
            }
        } catch (error) {
            console.error('Error downloading account:', error);
            showAlert('Purchase failed. Please try again.', 'error');
        } finally {
            hideLoading();
        }
    };

    // Show account data in modal
    function showAccountData(account, orderCode = null) {
        document.getElementById('downloadTitle').textContent = account.title;
        document.getElementById('downloadDescription').textContent = account.description || 'No description provided';
        document.getElementById('accountDataDisplay').value = account.data;
        document.getElementById('remainingCreditsInfo').textContent = `Remaining credits: ${currentUser.credits}`;
        
        // Show order code if provided
        if (orderCode) {
            document.getElementById('orderCodeDisplay').textContent = orderCode;
            document.getElementById('orderCodeInfo').style.display = 'block';
        } else {
            document.getElementById('orderCodeInfo').style.display = 'none';
        }
        
        downloadModal.style.display = 'block';
    }

    // Load purchase history
    async function loadPurchaseHistory() {
        try {
            historyList.innerHTML = '<p>Loading history...</p>';
            
            const response = await fetch('/api/reseller/history', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ authCode: currentAuthCode })
            });

            const result = await response.json();

            if (result.history) {
                purchaseHistory = result.history;
                displayPurchaseHistory(result.history);
                updateNavCounts();
            } else {
                showAlert('Failed to load purchase history', 'error');
                historyList.innerHTML = '<p>Failed to load history.</p>';
            }
        } catch (error) {
            console.error('Error loading history:', error);
            historyList.innerHTML = '<p>Error loading history.</p>';
        }
    }

    // Display purchase history
    function displayPurchaseHistory(history) {
        if (history.length === 0) {
            historyList.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h4>No purchase history</h4><p>Your order history will appear here</p></div>';
            return;
        }

        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-header">
                    <div class="history-product-info">
                        ${item.logo_path ? `<img src="${item.logo_path}" alt="Product Logo" class="history-logo" onerror="this.style.display='none'">` : ''}
                        <div class="history-product-details">
                            <div class="history-title">📦 ${escapeHtml(item.account_title)}</div>
                            ${item.description ? `<div class="history-description">${escapeHtml(item.description)}</div>` : ''}
                        </div>
                    </div>
                    <div class="order-code" title="Click to copy" onclick="copyOrderCode('${item.order_code}')">${item.order_code}</div>
                </div>
                
                <div class="history-info">
                    <div class="history-info-item">
                        <div class="history-info-label">Quantity</div>
                        <div class="history-info-value">${item.quantity || 1}</div>
                    </div>
                    <div class="history-info-item">
                        <div class="history-info-label">Total Cost</div>
                        <div class="history-info-value">${item.credit_cost * (item.quantity || 1)} credits</div>
                    </div>
                    <div class="history-info-item">
                        <div class="history-info-label">Purchase Date</div>
                        <div class="history-info-value">${new Date(item.download_date).toLocaleDateString()}</div>
                    </div>
                    <div class="history-info-item">
                        <div class="history-info-label">Purchase Time</div>
                        <div class="history-info-value">${new Date(item.download_date).toLocaleTimeString()}</div>
                    </div>
                </div>
                
                <div class="history-actions">
                    <button class="btn btn-info btn-small" onclick="viewPurchasedAccounts('${item.order_code}')">
                        👁️ View Purchased Accounts
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="downloadOrderFile('${item.order_code}', '${escapeHtml(item.account_title)}')">
                        📥 Download Order
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Logout function
    function logout() {
        currentUser = null;
        currentAuthCode = null;
        availableAccounts = [];
        allAccounts = [];
        favorites = [];
        purchaseHistory = [];
        
        localStorage.removeItem('authCode');
        localStorage.removeItem('favorites');
        
        authSection.style.display = 'block';
        userDashboard.style.display = 'none';
        
        authCodeInput.value = '';
        authCodeInput.focus();
        
        showAlert('Logged out successfully', 'info');
    }

    // Modal close handlers
    closeModal.addEventListener('click', function() {
        downloadModal.style.display = 'none';
    });

    window.addEventListener('click', function(event) {
        if (event.target === downloadModal) {
            downloadModal.style.display = 'none';
        }
    });

    // Auto-format auth code input
    authCodeInput.addEventListener('input', function(e) {
        let value = e.target.value.toUpperCase().replace(/\s/g, '');
        e.target.value = value;
    });

    // Enhanced password toggle functionality
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', function() {
            const input = authCodeInput;
            if (input.type === 'password') {
                input.type = 'text';
                togglePasswordBtn.textContent = '🙈';
                togglePasswordBtn.title = 'Hide Code';
            } else {
                input.type = 'password';
                togglePasswordBtn.textContent = '👁️';
                togglePasswordBtn.title = 'Show Code';
            }
        });
    }

    // Enhanced paste functionality
    if (pasteCodeBtn) {
        pasteCodeBtn.addEventListener('click', async function() {
            try {
                const text = await navigator.clipboard.readText();
                authCodeInput.value = text.toUpperCase().replace(/\s/g, '');
                authCodeInput.focus();
                showAlert('Code pasted successfully!', 'success');
            } catch (err) {
                // Fallback for browsers that don't support clipboard API
                authCodeInput.focus();
                authCodeInput.select();
                showAlert('Please use Ctrl+V to paste', 'info');
            }
        });
    }

    // Enhanced user auth display click to copy
    if (userAuthDisplay) {
        userAuthDisplay.addEventListener('click', async function() {
            const authCode = currentAuthCode;
            if (authCode) {
                await copyToClipboard(authCode, 'Auth code copied to clipboard!');
            }
        });
    }

    // Helper function for copying order codes
    window.copyOrderCode = async function(orderCode) {
        console.log('copyOrderCode called with:', orderCode);
        try {
            await copyToClipboard(orderCode, 'Order code copied!');
        } catch (error) {
            console.error('copyOrderCode error:', error);
            showAlert('❌ Failed to copy order code', 'error');
        }
    };

    // Utility functions
    function showLoading(message) {
        // Create or update loading overlay
        let loadingOverlay = document.getElementById('loadingOverlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loadingOverlay';
            loadingOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                color: white;
                font-size: 18px;
                font-weight: 600;
            `;
            document.body.appendChild(loadingOverlay);
        }
        
        loadingOverlay.innerHTML = `
            <div style="text-align: center;">
                <div class="loading"></div>
                ${message}
            </div>
        `;
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    function showAlert(message, type) {
        console.log('showAlert called:', message, type);
        
        // Remove existing alerts
        const existingAlert = document.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 10000;
            max-width: 400px;
            word-wrap: break-word;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        // Set colors based on type
        if (type === 'success') {
            alert.style.background = '#10b981';
            alert.style.color = 'white';
        } else if (type === 'error') {
            alert.style.background = '#ef4444';
            alert.style.color = 'white';
        } else if (type === 'info') {
            alert.style.background = '#3b82f6';
            alert.style.color = 'white';
        }
        
        document.body.appendChild(alert);
        console.log('Alert added to DOM');
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
                console.log('Alert removed from DOM');
            }
        }, 4000);
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

    // ========== ENHANCED FEATURES ==========
    
    // Update navigation counts
    function updateNavCounts() {
        const accountsCount = document.getElementById('accountsCount');
        const historyCount = document.getElementById('historyCount');
        const favoritesCount = document.getElementById('favoritesCount');
        
        if (accountsCount) {
            accountsCount.textContent = allAccounts.length || 0;
            accountsCount.style.display = allAccounts.length > 0 ? 'flex' : 'none';
        }
        if (historyCount) {
            historyCount.textContent = purchaseHistory.length || 0;
            historyCount.style.display = purchaseHistory.length > 0 ? 'flex' : 'none';
        }
        if (favoritesCount) {
            favoritesCount.textContent = favorites.length || 0;
            favoritesCount.style.display = favorites.length > 0 ? 'flex' : 'none';
        }
    }
    
    // Enhanced copying with feedback
    async function copyToClipboard(text, successMessage = 'Copied to clipboard!') {
        console.log('copyToClipboard called with:', text, successMessage);
        try {
            // Try modern clipboard API first
            if (navigator.clipboard && window.isSecureContext) {
                console.log('Using modern clipboard API');
                await navigator.clipboard.writeText(text);
                console.log('Modern clipboard success');
                showAlert('✅ ' + successMessage, 'success');
            } else {
                console.log('Using fallback method');
                // Fallback method for non-secure contexts or older browsers
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-999999px';
                textarea.style.top = '-999999px';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                
                const success = document.execCommand('copy');
                console.log('execCommand result:', success);
                
                if (success) {
                    showAlert('✅ ' + successMessage, 'success');
                } else {
                    throw new Error('execCommand failed');
                }
                
                document.body.removeChild(textarea);
            }
        } catch (err) {
            console.error('Copy operation failed:', err);
            showAlert('❌ Failed to copy to clipboard', 'error');
        }
    }
    
    // Refresh user data
    async function refreshUserData() {
        if (!currentAuthCode) return;
        
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '⏳';
        
        try {
            await loadAccounts();
            const activeSection = document.querySelector('.dashboard-section.active');
            if (activeSection && activeSection.id === 'historySection') {
                await loadPurchaseHistory();
            } else if (activeSection && activeSection.id === 'favoritesSection') {
                loadFavorites();
            }
            updateNavCounts();
            showAlert('Data refreshed!', 'success');
        } catch (error) {
            showAlert('Failed to refresh data', 'error');
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '🔄';
        }
    }
    
    // Switch to section
    function switchToSection(sectionName) {
        // Save active tab to localStorage
        localStorage.setItem('activeTab', sectionName);
        
        // Update buttons
        navBtns.forEach(b => b.classList.remove('active'));
        const targetBtn = document.querySelector(`[data-section="${sectionName}"]`);
        if (targetBtn) targetBtn.classList.add('active');
        
        // Update sections
        dashboardSections.forEach(s => s.classList.remove('active'));
        const targetSection = document.getElementById(`${sectionName}Section`);
        if (targetSection) targetSection.classList.add('active');
        
        // Load data for the section
        if (sectionName === 'history') {
            loadPurchaseHistory();
        } else if (sectionName === 'favorites') {
            loadFavorites();
        }
    }
    
    // Toggle filters panel
    window.toggleFilters = function() {
        if (filterPanel) {
            const isCollapsed = filterPanel.classList.contains('collapsed');
            if (isCollapsed) {
                filterPanel.classList.remove('collapsed');
                filterToggle.textContent = '🔍 Hide Filters';
            } else {
                filterPanel.classList.add('collapsed');
                filterToggle.textContent = '🔍 Show Filters';
            }
        }
    };
    
    // Search products
    window.searchProducts = function() {
        updateProductResults();
    };
    
    // Filter products
    window.filterProducts = function() {
        updateProductResults();
    };
    
    // Sort products
    window.sortProducts = function() {
        updateProductResults();
    };
    
    // Clear filters
    window.clearFilters = function() {
        if (productSearch) productSearch.value = '';
        if (priceFilter) priceFilter.value = 'all';
        if (sortBy) sortBy.value = 'name';
        updateProductResults();
    };
    
    // Update product results based on filters
    function updateProductResults() {
        if (!allAccounts.length) return;
        
        let filteredAccounts = [...allAccounts];
        
        // Search filter
        const searchTerm = productSearch ? productSearch.value.toLowerCase() : '';
        if (searchTerm) {
            filteredAccounts = filteredAccounts.filter(account =>
                account.title.toLowerCase().includes(searchTerm) ||
                (account.description && account.description.toLowerCase().includes(searchTerm))
            );
        }
        
        // Price filter
        const priceRange = priceFilter ? priceFilter.value : 'all';
        if (priceRange !== 'all') {
            const [min, max] = priceRange.split('-').map(Number);
            filteredAccounts = filteredAccounts.filter(account => {
                if (max) {
                    return account.credit_cost >= min && account.credit_cost <= max;
                } else {
                    return account.credit_cost >= min;
                }
            });
        }
        
        // Sort
        const sortOption = sortBy ? sortBy.value : 'name';
        filteredAccounts.sort((a, b) => {
            switch (sortOption) {
                case 'price-low':
                    return a.credit_cost - b.credit_cost;
                case 'price-high':
                    return b.credit_cost - a.credit_cost;
                case 'stock':
                    return b.stock_quantity - a.stock_quantity;
                case 'popular':
                    return (b.total_sold || 0) - (a.total_sold || 0);
                default: // name
                    return a.title.localeCompare(b.title);
            }
        });
        
        // Update results display
        availableAccounts = filteredAccounts;
        displayAccounts(filteredAccounts);
        
        // Update filter stats
        const productResults = document.getElementById('productResults');
        if (productResults) {
            productResults.textContent = `Showing ${filteredAccounts.length} of ${allAccounts.length} products`;
        }
    }
    
    // Quick Actions Functions
    window.quickReorder = function() {
        if (purchaseHistory.length === 0) {
            showAlert('No previous orders to reorder', 'info');
            return;
        }
        
        const lastOrder = purchaseHistory[0]; // Assuming sorted by date desc
        const account = allAccounts.find(acc => acc.title === lastOrder.account_title);
        
        if (account && account.stock_quantity > 0) {
            showPurchaseModal(account);
        } else {
            showAlert('Last ordered product is no longer available', 'error');
        }
    };
    
    window.showFavorites = function() {
        switchToSection('favorites');
    };
    
    window.switchToShop = function() {
        switchToSection('accounts');
    };
    
    window.showBulkPurchase = function() {
        showAlert('Bulk purchase feature coming soon!', 'info');
    };
    
    window.contactSupport = function() {
        const message = `Hello! I need help with my account.\n\nUsername: ${currentUser?.username}\nAuth Code: ${currentAuthCode}\nCredits: ${currentUser?.credits}`;
        
        // Try to open email client
        const emailUrl = `mailto:support@example.com?subject=Reseller Support Request&body=${encodeURIComponent(message)}`;
        window.open(emailUrl);
        
        showAlert('Support email opened! If email client didn\'t open, please contact support manually.', 'info');
    };
    
    // Load favorites
    function loadFavorites() {
        const favoriteAccounts = allAccounts.filter(account => 
            favorites.includes(account.id)
        );
        
        if (favoriteAccounts.length === 0) {
            favoritesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⭐</div>
                    <h4>No favorites yet</h4>
                    <p>Add products to favorites by clicking the star icon</p>
                    <button class="btn btn-primary" onclick="switchToShop()">Browse Products</button>
                </div>
            `;
        } else {
            favoritesList.innerHTML = favoriteAccounts.map(account => `
                <div class="account-item">
                    <div class="account-header">
                        <div class="account-title-section">
                            ${account.logo_path ? `<img src="${account.logo_path}" alt="Logo" class="product-logo" onerror="this.style.display='none'">` : ''}
                            <div class="account-title">📦 ${escapeHtml(account.title)}</div>
                        </div>
                        <div class="account-header-actions">
                            <button class="favorite-star" 
                                    data-account-id="${account.id}" 
                                    onclick="toggleFavorite(${account.id})"
                                    title="Remove from favorites"
                                    style="background: none; border: none; font-size: 20px; cursor: pointer; color: #fbbf24;">
                                ⭐
                            </button>
                            <div class="account-cost">💰 ${account.credit_cost} Credit${account.credit_cost !== 1 ? 's' : ''}</div>
                        </div>
                    </div>
                    
                    ${account.description ? `
                    <div class="account-description">
                        ${escapeHtml(account.description)}
                    </div>
                    ` : ''}
                    
                    <div class="account-stats">
                        <span>📦 Available: ${account.stock_quantity}</span>
                        <span>📊 Sold: ${account.total_sold || 0}</span>
                    </div>
                    
                    <div class="account-actions">
                        <div class="quantity-selector">
                            <label>Quantity:</label>
                            <input type="number" id="quantity_fav_${account.id}" value="1" min="1" max="${account.stock_quantity}" 
                                   onchange="updateDownloadButton(${account.id})" style="width: 60px; margin: 0 10px;">
                            <span class="total-cost" id="totalCost_fav_${account.id}">Cost: ${account.credit_cost} credits</span>
                        </div>
                        <button class="btn btn-download" 
                                id="downloadBtn_fav_${account.id}"
                                onclick="downloadAccount(${account.id})"
                                ${currentUser.credits < account.credit_cost || account.stock_quantity <= 0 ? 'disabled' : ''}>
                            ${account.stock_quantity <= 0 ? '❌ Out of Stock' : 
                              currentUser.credits < account.credit_cost ? '❌ Insufficient Credits' : '🛒 Buy'}
                        </button>
                    </div>
                </div>
            `).join('');
        }
        
        // Update nav counts after loading
        updateNavCounts();
    }
    
    // Toggle favorite
    window.toggleFavorite = function(accountId) {
        const index = favorites.indexOf(accountId);
        if (index > -1) {
            favorites.splice(index, 1);
            showAlert('Removed from favorites', 'info');
        } else {
            favorites.push(accountId);
            showAlert('Added to favorites!', 'success');
        }
        
        localStorage.setItem('favorites', JSON.stringify(favorites));
        updateNavCounts();
        
        // Refresh current view if we're on favorites
        if (document.getElementById('favoritesSection').classList.contains('active')) {
            loadFavorites();
        }
        
        // Update star icons in accounts view
        updateFavoriteStars();
    };
    
    // Update favorite stars in account cards
    function updateFavoriteStars() {
        document.querySelectorAll('.favorite-star').forEach(star => {
            const accountId = parseInt(star.dataset.accountId);
            const isFavorite = favorites.includes(accountId);
            star.textContent = isFavorite ? '⭐' : '☆';
            star.style.color = isFavorite ? '#fbbf24' : '#d1d5db';
        });
    }

    // View purchased accounts function
    window.viewPurchasedAccounts = async function(orderCode) {
        try {
            showLoading('Loading purchased accounts...');
            
            const response = await fetch('/api/reseller/purchased-accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    authCode: currentAuthCode,
                    orderCode: orderCode.replace(/-.+$/, '') // Remove -Q suffix for search
                })
            });

            const result = await response.json();

            if (result.success) {
                showPurchasedAccountsModal(result.accounts, result.orderCode, result.title);
            } else {
                showAlert(result.error || 'Failed to load purchased accounts', 'error');
            }
        } catch (error) {
            console.error('Error loading purchased accounts:', error);
            showAlert('An error occurred while loading purchased accounts.', 'error');
        } finally {
            hideLoading();
        }
    };

    // Show purchased accounts modal
    function showPurchasedAccountsModal(accounts, orderCode, title) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
                <h2>📦 Purchased Accounts</h2>
                <h3>${escapeHtml(title)} - Order: ${orderCode}</h3>
                <div class="purchased-accounts-content">
                    <textarea readonly rows="15" id="accountDataTextarea" style="width: 100%; font-family: monospace; background: #f5f5f5; padding: 15px; border: 1px solid #ddd; border-radius: 8px; resize: vertical;">${accounts}</textarea>
                    <div style="margin-top: 15px; text-align: center; display: flex; gap: 10px; justify-content: center;">
                        <button class="btn btn-primary" id="copyAccountDataBtn">
                            📋 Copy to Clipboard
                        </button>
                        <button class="btn btn-secondary" id="downloadAccountDataBtn">
                            📥 Download as File
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add event listeners after modal is created
        const copyBtn = modal.querySelector('#copyAccountDataBtn');
        const downloadBtn = modal.querySelector('#downloadAccountDataBtn');
        const textarea = modal.querySelector('#accountDataTextarea');
        
        copyBtn.addEventListener('click', async function() {
            try {
                // Try modern clipboard API first
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(accounts);
                    showAlert('✅ Account data copied to clipboard!', 'success');
                } else {
                    // Fallback method
                    const textarea = document.createElement('textarea');
                    textarea.value = accounts;
                    textarea.style.position = 'fixed';
                    textarea.style.left = '-999999px';
                    textarea.style.top = '-999999px';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    
                    if (document.execCommand('copy')) {
                        showAlert('✅ Account data copied to clipboard!', 'success');
                    } else {
                        showAlert('❌ Failed to copy to clipboard', 'error');
                    }
                    
                    document.body.removeChild(textarea);
                }
            } catch (err) {
                console.error('Copy failed:', err);
                showAlert('❌ Failed to copy to clipboard', 'error');
            }
        });
        
        downloadBtn.addEventListener('click', function() {
            downloadAccountDataFile(accounts, orderCode, title);
        });
        
        // Close on backdrop click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // Download account data as file
    function downloadAccountDataFile(accounts, orderCode, title) {
        // Find order details from history
        const orderDetails = purchaseHistory.find(item => 
            item.order_code === orderCode
        );
        
        // Create file content
        const fileContent = `
=== ORDER DETAILS ===
Order Code: ${orderCode}
Product: ${title}
${orderDetails ? `Purchase Date: ${new Date(orderDetails.download_date).toLocaleString()}` : ''}
${orderDetails ? `Quantity: ${orderDetails.quantity || 1}` : ''}
${orderDetails ? `Total Cost: ${orderDetails.credit_cost * (orderDetails.quantity || 1)} credits` : ''}
User: ${currentUser.username}

=== ACCOUNT DATA ===
${accounts}

=== END OF ORDER ===
Generated on: ${new Date().toLocaleString()}
BOT Delivery System
`.trim();

        // Create and download file
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${orderCode}_${title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showAlert('Account data downloaded successfully!', 'success');
    }



    // Search history
    window.searchHistory = function() {
        filterHistoryResults();
    };
    
    // Filter history
    window.filterHistory = function() {
        filterHistoryResults();
    };
    
    // Filter history results
    function filterHistoryResults() {
        if (!purchaseHistory.length) return;
        
        let filteredHistory = [...purchaseHistory];
        
        // Search filter
        const historySearchInput = document.getElementById('historySearch');
        const searchTerm = historySearchInput ? historySearchInput.value.toLowerCase() : '';
        if (searchTerm) {
            filteredHistory = filteredHistory.filter(item =>
                item.order_code.toLowerCase().includes(searchTerm) ||
                item.account_title.toLowerCase().includes(searchTerm) ||
                (item.description && item.description.toLowerCase().includes(searchTerm))
            );
        }
        
        // Time filter
        const timeFilterInput = document.getElementById('timeFilter');
        const timeFilter = timeFilterInput ? timeFilterInput.value : 'all';
        if (timeFilter !== 'all') {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfWeek = new Date(startOfDay);
            startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            
            filteredHistory = filteredHistory.filter(item => {
                const itemDate = new Date(item.download_date);
                switch (timeFilter) {
                    case 'today':
                        return itemDate >= startOfDay;
                    case 'week':
                        return itemDate >= startOfWeek;
                    case 'month':
                        return itemDate >= startOfMonth;
                    default:
                        return true;
                }
            });
        }
        
        // Display filtered results
        displayPurchaseHistory(filteredHistory);
        
        // Update filter stats (optional)
        const totalItems = purchaseHistory.length;
        const filteredItems = filteredHistory.length;
        console.log(`Showing ${filteredItems} of ${totalItems} orders`);
    }
    
    // Export history function
    window.exportHistory = function() {
        if (!purchaseHistory.length) {
            showAlert('No history to export', 'info');
            return;
        }
        
        const csvContent = [
            ['Order Code', 'Product Name', 'Quantity', 'Total Cost', 'Purchase Date', 'Purchase Time'],
            ...purchaseHistory.map(item => [
                item.order_code,
                item.account_title,
                item.quantity || 1,
                `${item.credit_cost * (item.quantity || 1)} credits`,
                new Date(item.download_date).toLocaleDateString(),
                new Date(item.download_date).toLocaleTimeString()
            ])
        ].map(row => row.join(',')).join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `purchase-history-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        showAlert('History exported successfully!', 'success');
    };

    // Search purchased accounts function
    window.searchPurchasedAccounts = async function() {
        const searchInput = document.getElementById('purchasedAccountSearch');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        
        if (searchTerm.length < 2) {
            if (searchTerm.length === 0) {
                // If search is cleared, show normal history
                displayPurchaseHistory(purchaseHistory);
            }
            return;
        }
        
        try {
            showLoading('Searching purchased accounts...');
            
            const response = await fetch('/api/reseller/search-purchased', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    authCode: currentAuthCode,
                    searchTerm: searchTerm
                })
            });

            const result = await response.json();

            if (result.success) {
                displayPurchasedSearchResults(result.results, result.searchTerm);
                showAlert(`Found ${result.totalMatches} orders containing "${searchTerm}"`, 'success');
            } else {
                showAlert(result.error || 'Search failed', 'error');
            }
        } catch (error) {
            console.error('Error searching purchased accounts:', error);
            showAlert('Search failed. Please try again.', 'error');
        } finally {
            hideLoading();
        }
    };

    // Display purchased search results
    function displayPurchasedSearchResults(results, searchTerm) {
        if (results.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h4>No matches found</h4>
                    <p>No purchased accounts contain "${searchTerm}"</p>
                    <button class="btn btn-secondary" onclick="clearAllHistoryFilters()">Clear Search</button>
                </div>
            `;
            return;
        }

        historyList.innerHTML = results.map(item => `
            <div class="history-item search-result">
                <div class="history-header">
                    <div class="history-product-info">
                        ${item.logo_path ? `<img src="${item.logo_path}" alt="Product Logo" class="history-logo" onerror="this.style.display='none'">` : ''}
                        <div class="history-product-details">
                            <div class="history-title">📦 ${escapeHtml(item.account_title)}</div>
                            ${item.description ? `<div class="history-description">${escapeHtml(item.description)}</div>` : ''}
                            <div class="search-matches">🔍 ${item.match_count} match${item.match_count > 1 ? 'es' : ''} found</div>
                        </div>
                    </div>
                    <div class="order-code" title="Click to copy" onclick="copyOrderCode('${item.order_code}')">${item.order_code}</div>
                </div>
                
                <div class="history-info">
                    <div class="history-info-item">
                        <div class="history-info-label">Quantity</div>
                        <div class="history-info-value">${item.quantity || 1}</div>
                    </div>
                    <div class="history-info-item">
                        <div class="history-info-label">Total Cost</div>
                        <div class="history-info-value">${item.credit_cost * (item.quantity || 1)} credits</div>
                    </div>
                    <div class="history-info-item">
                        <div class="history-info-label">Purchase Date</div>
                        <div class="history-info-value">${new Date(item.download_date).toLocaleDateString()}</div>
                    </div>
                    <div class="history-info-item">
                        <div class="history-info-label">Purchase Time</div>
                        <div class="history-info-value">${new Date(item.download_date).toLocaleTimeString()}</div>
                    </div>
                </div>
                
                <div class="purchased-data-preview">
                    <h5>📋 Account Data Preview:</h5>
                    <div class="data-preview">${escapeHtml(item.highlighted_data).replace(/\*\*(.*?)\*\*/g, '<mark>$1</mark>')}</div>
                </div>
                
                                 <div class="history-actions">
                     <button class="btn btn-info btn-small" onclick="viewPurchasedAccounts('${item.order_code}')">
                         👁️ View Full Account Data
                     </button>
                     <button class="btn btn-secondary btn-small" onclick="downloadOrderFile('${item.order_code}', '${escapeHtml(item.account_title)}')">
                         📥 Download Order
                     </button>
                 </div>
            </div>
        `).join('');
    }

    // Clear all history filters
    window.clearAllHistoryFilters = function() {
        const historySearchInput = document.getElementById('historySearch');
        const purchasedSearchInput = document.getElementById('purchasedAccountSearch');
        const timeFilterInput = document.getElementById('timeFilter');
        
        if (historySearchInput) historySearchInput.value = '';
        if (purchasedSearchInput) purchasedSearchInput.value = '';
        if (timeFilterInput) timeFilterInput.value = 'all';
        
        // Display original purchase history
        displayPurchaseHistory(purchaseHistory);
        showAlert('All filters cleared', 'info');
    };

    // Download order as file
    window.downloadOrderFile = async function(orderCode, productTitle) {
        try {
            showLoading('Preparing order file...');
            
            const response = await fetch('/api/reseller/purchased-accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    authCode: currentAuthCode,
                    orderCode: orderCode.replace(/-.+$/, '') // Remove -Q suffix for search
                })
            });

            const result = await response.json();

            if (result.success) {
                // Find order details from history
                const orderDetails = purchaseHistory.find(item => 
                    item.order_code === orderCode
                );
                
                // Create file content
                const fileContent = `
=== ORDER DETAILS ===
Order Code: ${result.orderCode}
Product: ${result.title}
${orderDetails ? `Purchase Date: ${new Date(orderDetails.download_date).toLocaleString()}` : ''}
${orderDetails ? `Quantity: ${orderDetails.quantity || 1}` : ''}
${orderDetails ? `Total Cost: ${orderDetails.credit_cost * (orderDetails.quantity || 1)} credits` : ''}
User: ${currentUser.username}

=== ACCOUNT DATA ===
${result.accounts}

=== END OF ORDER ===
Generated on: ${new Date().toLocaleString()}
BOT Delivery System
`.trim();

                // Create and download file
                const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${orderCode}_${productTitle.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                showAlert('Order file downloaded successfully!', 'success');
            } else {
                showAlert(result.error || 'Failed to download order', 'error');
            }
        } catch (error) {
            console.error('Error downloading order:', error);
            showAlert('Download failed. Please try again.', 'error');
        } finally {
            hideLoading();
        }
    };

    // Test function for debugging
    window.testCopy = function() {
        console.log('Test copy function called');
        copyToClipboard('TEST123', 'Test successful!');
    };

    // Focus on auth code input initially
    authCodeInput.focus();
}); 