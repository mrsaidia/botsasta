document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const authForm = document.getElementById('authForm');
    const authCodeInput = document.getElementById('authCode');
    const authSection = document.getElementById('authSection');
    const userDashboard = document.getElementById('userDashboard');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const userCredits = document.getElementById('userCredits');
    const userDownloads = document.getElementById('userDownloads');
    const accountsList = document.getElementById('accountsList');
    const historyList = document.getElementById('historyList');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // Navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    const dashboardSections = document.querySelectorAll('.dashboard-section');
    const downloadModal = document.getElementById('downloadModal');
    const closeModal = document.querySelector('.close');
    
    // Current user data
    let currentUser = null;
    let currentAuthCode = null;
    let availableAccounts = [];

    // Initialize
    const savedAuthCode = localStorage.getItem('authCode');
    if (savedAuthCode) {
        authCodeInput.value = savedAuthCode;
        verifyAuthCode(savedAuthCode);
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
            
            // Update buttons
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update sections
            dashboardSections.forEach(s => s.classList.remove('active'));
            document.getElementById(`${section}Section`).classList.add('active');
            
            // Load data for the section
            if (section === 'history') {
                loadPurchaseHistory();
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
                
                displayAccounts(result.accounts);
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
                    <div class="account-cost">💰 ${account.credit_cost} Credit${account.credit_cost !== 1 ? 's' : ''}</div>
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
        const account = availableAccounts.find(acc => acc.id === accountId);
        if (!account) return;
        
        const quantityInput = document.getElementById(`quantity_${accountId}`);
        const totalCostSpan = document.getElementById(`totalCost_${accountId}`);
        const downloadBtn = document.getElementById(`downloadBtn_${accountId}`);
        
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
        const account = availableAccounts.find(acc => acc.id === accountId);
        if (!account) return;

        const quantityInput = document.getElementById(`quantity_${accountId}`);
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
                userCredits.textContent = result.remainingCredits;
                userDownloads.textContent = currentUser.totalDownloads;
                
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
                displayPurchaseHistory(result.history);
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
            historyList.innerHTML = '<p>No purchase history found.</p>';
            return;
        }

        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-header">
                    <div class="history-title">📦 ${escapeHtml(item.account_title)}</div>
                    <div class="order-code">${item.order_code}</div>
                </div>
                
                <div class="history-info">
                    <div class="history-info-item">
                        <div class="history-info-label">Credit Cost</div>
                        <div class="history-info-value">${item.credit_cost}</div>
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
                
                ${item.description ? `
                <div style="margin-top: 10px; color: #4a5568; font-style: italic;">
                    ${escapeHtml(item.description)}
                </div>
                ` : ''}
                
                <div class="history-actions" style="margin-top: 15px;">
                    <button class="btn btn-info btn-small" onclick="viewPurchasedAccounts('${item.order_code}')">
                        👁️ View Purchased Accounts
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
        
        localStorage.removeItem('authCode');
        
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
                    <textarea readonly rows="15" style="width: 100%; font-family: monospace; background: #f5f5f5; padding: 15px; border: 1px solid #ddd; border-radius: 8px; resize: vertical;">${accounts}</textarea>
                    <div style="margin-top: 15px; text-align: center;">
                        <button class="btn btn-primary" onclick="copyAccountsToClipboard('${accounts.replace(/'/g, "\\'")}')">
                            📋 Copy to Clipboard
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Close on backdrop click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // Copy accounts to clipboard function
    window.copyAccountsToClipboard = function(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                showAlert('Accounts copied to clipboard!', 'success');
            }).catch(() => {
                fallbackCopyToClipboard(text);
            });
        } else {
            fallbackCopyToClipboard(text);
        }
    };
    
    function fallbackCopyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showAlert('Accounts copied to clipboard!', 'success');
        } catch (err) {
            showAlert('Failed to copy to clipboard', 'error');
        }
        document.body.removeChild(textarea);
    }

    // Focus on auth code input initially
    authCodeInput.focus();
}); 