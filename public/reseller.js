// Global theme functions
window.toggleTheme = function() {
    console.log('toggleTheme called!');
    const isDark = document.body.classList.contains('dark-mode');
    console.log('Current theme is dark:', isDark);
    
    if (isDark) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('resellerTheme', 'light');
        updateThemeIcon('light');
        console.log('Switched to light mode');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('resellerTheme', 'dark');
        updateThemeIcon('dark');
        console.log('Switched to dark mode');
    }
};

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

document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme
    initializeTheme();
    
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

    // Clean up duplicate favorites and ensure all items are numbers
    function cleanupFavorites() {
        favorites = favorites.map(id => parseInt(id)).filter((id, index, arr) => {
            return !isNaN(id) && arr.indexOf(id) === index;
        });
        localStorage.setItem('favorites', JSON.stringify(favorites));
    }

    // Initialize favorites cleanup
    cleanupFavorites();

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
            } else if (section === 'shared-accounts') {
                loadSharedAccounts();
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
                // Load purchase history to update dashboard stats
                loadPurchaseHistory();
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
        
        // Load favorites to update count
        loadFavorites();
        updateNavCounts();
        hideLoading();
    }

    // Update dashboard statistics
    function updateDashboardStats() {
        // Calculate recent orders (this week)
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
        startOfWeek.setHours(0, 0, 0, 0);
        
        const recentOrdersCount = purchaseHistory.filter(order => {
            const orderDate = new Date(order.download_date);
            return orderDate >= startOfWeek;
        }).length;
        
        // Calculate total credits spent
        const totalCreditsSpent = purchaseHistory.reduce((total, order) => {
            // Use credits_used if available, otherwise calculate from quantity and cost
            const creditsUsed = order.credits_used !== undefined ? order.credits_used : (order.cost || (order.credit_cost * (order.quantity || 1)));
            return total + creditsUsed;
        }, 0);
        
        // Update UI elements
        const recentOrdersElement = document.getElementById('recentOrders');
        const creditsSpentElement = document.getElementById('creditsSpent');
        
        if (recentOrdersElement) {
            recentOrdersElement.textContent = recentOrdersCount;
        }
        
        if (creditsSpentElement) {
            creditsSpentElement.textContent = totalCreditsSpent;
        }
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
                    <div class="buy-action-container">
                     <div class="quantity-selector">
                         <label>Quantity:</label>
                         <input type="number" id="quantity_${account.id}" value="1" min="1" max="${account.stock_quantity}" 
                                onchange="updateDownloadButton(${account.id})" style="width: 60px; margin: 0 10px;">
                     </div>
                        <button class="btn btn-buy-now" 
                             id="downloadBtn_${account.id}"
                             onclick="downloadAccount(${account.id})"
                             ${currentUser.credits < account.credit_cost || account.stock_quantity <= 0 ? 'disabled' : ''}>
                         ${account.stock_quantity <= 0 ? '❌ Out of Stock' : 
                              currentUser.credits < account.credit_cost ? '❌ Insufficient Credits' : '<span><i class="fas fa-shopping-cart"></i> Buy now</span>'}
                     </button>
                    </div>
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
        const downloadBtn = document.getElementById(`downloadBtn_${accountId}`) || document.getElementById(`downloadBtn_fav_${accountId}`);
        
        if (!quantityInput || !downloadBtn) return;
        
        const quantity = parseInt(quantityInput.value) || 1;
        const totalCost = account.credit_cost * quantity;
        
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

    // Open purchase modal
    window.downloadAccount = function(accountId) {
        const account = availableAccounts.find(acc => acc.id === accountId) || allAccounts.find(acc => acc.id === accountId);
        if (!account) return;

        const quantityInput = document.getElementById(`quantity_${accountId}`) || document.getElementById(`quantity_fav_${accountId}`);
        const quantity = parseInt(quantityInput.value) || 1;

        // Store current purchase data
        window.currentPurchase = {
            account: account,
            quantity: quantity,
            appliedCoupon: null,
            userDiscount: null,
            finalPrice: account.credit_cost * quantity
        };

        // Populate purchase modal
        document.getElementById('purchaseTitle').textContent = account.title;
        document.getElementById('purchaseDescription').textContent = account.description || 'No description provided';
        document.getElementById('purchaseQuantity').value = quantity;
        document.getElementById('purchaseQuantity').max = account.stock_quantity;
        document.getElementById('couponCode').value = '';
        
        // Reset coupon status and button
        const couponStatus = document.getElementById('couponStatus');
        const validateBtn = document.getElementById('validateCouponBtn');
        couponStatus.className = 'coupon-status';
        couponStatus.style.display = 'none';
        validateBtn.textContent = '✓ Apply';
        validateBtn.disabled = false;
        
        // Hide discount row initially
        document.getElementById('discountRow').style.display = 'none';
        
        // Hide user discount info initially
        document.getElementById('userDiscountInfo').style.display = 'none';
        
        // Check for user discount
        checkUserDiscount(account.id);
        
        // Update purchase summary
        updatePurchaseTotal();
        
        // Show purchase form, hide download content
        document.getElementById('purchaseForm').style.display = 'block';
        document.getElementById('downloadContent').style.display = 'none';
        
        downloadModal.style.display = 'block';
    };

    // Check user discount
    async function checkUserDiscount(accountId) {
        try {
            const response = await fetch('/api/reseller/check-discounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    authCode: currentAuthCode,
                    accountId: accountId
                })
            });
            
            const result = await response.json();
            
            if (result.success && result.userDiscount) {
                window.currentPurchase.userDiscount = result.userDiscount;
                
                // Show user discount info
                const userDiscountInfo = document.getElementById('userDiscountInfo');
                const userDiscountText = document.getElementById('userDiscountText');
                
                userDiscountText.textContent = `${result.userDiscount.discountPercentage}% discount - ${result.userDiscount.description}`;
                userDiscountInfo.style.display = 'block';
                
                updatePurchaseTotal();
            }
        } catch (error) {
            console.error('Error checking user discount:', error);
        }
    }

    // Update purchase total
    window.updatePurchaseTotal = function() {
        const quantity = parseInt(document.getElementById('purchaseQuantity').value) || 1;
        const account = window.currentPurchase.account;
        
        window.currentPurchase.quantity = quantity;
        
        let unitPrice = account.credit_cost;
        let totalPrice = unitPrice * quantity;
        let discount = 0;
        let discountSource = '';
        
        // Determine the best discount (user discount vs coupon)
        const userDiscountPercent = window.currentPurchase.userDiscount ? window.currentPurchase.userDiscount.discountPercentage : 0;
        const couponDiscountPercent = window.currentPurchase.appliedCoupon ? window.currentPurchase.appliedCoupon.discountPercentage : 0;
        
        if (userDiscountPercent >= couponDiscountPercent && userDiscountPercent > 0) {
            discount = userDiscountPercent;
            discountSource = 'Personal discount';
        } else if (couponDiscountPercent > 0) {
            discount = couponDiscountPercent;
            discountSource = `Coupon: ${window.currentPurchase.appliedCoupon.code}`;
        }
        
        // Apply discount
        if (discount > 0) {
            totalPrice = Math.ceil(totalPrice * (100 - discount) / 100);
        }
        
        window.currentPurchase.finalPrice = totalPrice;
        
        // Update UI
        document.getElementById('unitPrice').textContent = `${unitPrice} credits`;
        document.getElementById('summaryQuantity').textContent = quantity;
        document.getElementById('totalCost').innerHTML = `<strong>${totalPrice} credits</strong>`;
        document.getElementById('userCreditsDisplay').textContent = `${currentUser.credits}`;
        document.getElementById('creditsAfterPurchase').textContent = `${currentUser.credits - totalPrice}`;
        
        // Show/hide discount row
        if (discount > 0) {
            document.getElementById('discountRow').style.display = 'flex';
            document.getElementById('discountAmount').textContent = `${discount}% (-${(unitPrice * quantity) - totalPrice} credits) - ${discountSource}`;
        } else {
            document.getElementById('discountRow').style.display = 'none';
        }
        
        // Update purchase button state
        const confirmBtn = document.getElementById('confirmPurchaseBtn');
        if (quantity > account.stock_quantity) {
            confirmBtn.textContent = '❌ Not enough stock';
            confirmBtn.disabled = true;
        } else if (currentUser.credits < totalPrice) {
            confirmBtn.textContent = '❌ Insufficient Credits';
            confirmBtn.disabled = true;
        } else {
            confirmBtn.textContent = `🛒 Purchase ${quantity}x for ${totalPrice} credits`;
            confirmBtn.disabled = false;
        }
    };

    // Validate coupon code
    window.validateCoupon = async function() {
        const couponCode = document.getElementById('couponCode').value.trim().toUpperCase();
        const couponStatus = document.getElementById('couponStatus');
        const validateBtn = document.getElementById('validateCouponBtn');
        
        if (!couponCode) {
            couponStatus.className = 'coupon-status error';
            couponStatus.textContent = 'Please enter a coupon code';
            return;
        }
        
        try {
            validateBtn.textContent = '⏳ Checking...';
            validateBtn.disabled = true;
            
            const response = await fetch('/api/reseller/validate-coupon', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    authCode: currentAuthCode,
                    couponCode: couponCode,
                    accountId: window.currentPurchase.account.id
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                window.currentPurchase.appliedCoupon = result.coupon;
                
                // Check if user discount is better
                const userDiscountPercent = window.currentPurchase.userDiscount ? window.currentPurchase.userDiscount.discountPercentage : 0;
                const couponDiscountPercent = result.coupon.discountPercentage;
                
                if (userDiscountPercent >= couponDiscountPercent && userDiscountPercent > 0) {
                    couponStatus.className = 'coupon-status info';
                    couponStatus.textContent = `ℹ️ Coupon valid (${couponDiscountPercent}%), but your personal discount (${userDiscountPercent}%) is better and will be applied automatically.`;
                } else {
                    couponStatus.className = 'coupon-status success';
                    couponStatus.textContent = `✅ ${couponDiscountPercent}% coupon discount applied! (Better than your ${userDiscountPercent}% personal discount)`;
                }
                
                validateBtn.textContent = '✅ Applied';
                updatePurchaseTotal();
            } else {
                window.currentPurchase.appliedCoupon = null;
                couponStatus.className = 'coupon-status error';
                couponStatus.textContent = `❌ ${result.error}`;
                validateBtn.textContent = '✓ Apply';
                validateBtn.disabled = false;
                updatePurchaseTotal();
            }
        } catch (error) {
            console.error('Error validating coupon:', error);
            window.currentPurchase.appliedCoupon = null;
            couponStatus.className = 'coupon-status error';
            couponStatus.textContent = '❌ Failed to validate coupon';
            validateBtn.textContent = '✓ Apply';
            validateBtn.disabled = false;
            updatePurchaseTotal();
        }
    };

    // Confirm purchase
    window.confirmPurchase = async function() {
        const purchase = window.currentPurchase;
        
        if (currentUser.credits < purchase.finalPrice) {
            showAlert('Insufficient credits for this purchase', 'error');
            return;
        }

        if (purchase.quantity > purchase.account.stock_quantity) {
            showAlert('Not enough stock available', 'error');
            return;
        }

        try {
            const confirmBtn = document.getElementById('confirmPurchaseBtn');
            confirmBtn.textContent = '⏳ Processing...';
            confirmBtn.disabled = true;
            
            const couponCode = purchase.appliedCoupon ? purchase.appliedCoupon.code : null;
            showLoading('Processing purchase...');
            
            const requestData = { 
                authCode: currentAuthCode, 
                accountId: purchase.account.id,
                quantity: purchase.quantity
            };
            
            // Add coupon code if applied
            if (purchase.appliedCoupon) {
                requestData.couponCode = purchase.appliedCoupon.code;
            }
            
            const response = await fetch('/api/reseller/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();

            if (result.success) {
                // Update user credits
                currentUser.credits = result.remainingCredits;
                currentUser.totalDownloads++;
                
                // Update UI
                userCredits.textContent = result.remainingCredits;
                userDownloads.textContent = currentUser.totalDownloads;
                
                // Show account data in modal with order code
                showPurchaseSuccess(result.account, result.orderCode, result.actualCost || purchase.finalPrice);
                
                // Reload accounts to update download counts and button states
                loadAccounts();
                
                // Reload purchase history to update dashboard stats
                loadPurchaseHistory();
                
                showAlert(`${result.quantity}x accounts purchased successfully! Order Code: ${result.orderCode}`, 'success');
            } else {
                showAlert(result.error || 'Purchase failed', 'error');
            }
        } catch (error) {
            console.error('Error processing purchase:', error);
            showAlert('Purchase failed. Please try again.', 'error');
        } finally {
            hideLoading();
        }
    };

    // Show purchase success
    function showPurchaseSuccess(account, orderCode, actualCost) {
        document.getElementById('downloadTitle').textContent = account.title;
        document.getElementById('downloadDescription').textContent = account.description || 'No description provided';
        document.getElementById('accountDataDisplay').value = account.data;
        document.getElementById('remainingCreditsInfo').textContent = `Remaining credits: ${currentUser.credits} | Paid: ${actualCost} credits`;
        
        // Show order code
        document.getElementById('orderCodeDisplay').textContent = orderCode;
        document.getElementById('orderCodeInfo').style.display = 'block';
        
        // Switch to download view
        document.getElementById('purchaseForm').style.display = 'none';
        document.getElementById('downloadContent').style.display = 'block';
    }

    // Close purchase modal
    window.closePurchaseModal = function() {
        downloadModal.style.display = 'none';
        window.currentPurchase = null;
    };

    // Close download modal
    window.closeDownloadModal = function() {
        downloadModal.style.display = 'none';
        window.currentPurchase = null;
    };

    // Copy account data
    window.copyAccountData = function() {
        const accountData = document.getElementById('accountDataDisplay').value;
        copyToClipboard(accountData, 'Account data copied to clipboard!');
    };

    // Download account file
    window.downloadAccountFile = function() {
        const accountData = document.getElementById('accountDataDisplay').value;
        const title = document.getElementById('downloadTitle').textContent;
        const orderCode = document.getElementById('orderCodeDisplay').textContent;
        
        const blob = new Blob([accountData], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}-${orderCode}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showAlert('Account data downloaded successfully!', 'success');
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
                updateDashboardStats(); // Update dashboard statistics after loading history
            } else {
                showAlert('Failed to load purchase history', 'error');
                historyList.innerHTML = '<p>Failed to load history.</p>';
            }
        } catch (error) {
            console.error('Error loading history:', error);
            historyList.innerHTML = '<p>Error loading history.</p>';
        }
    }

    // Pagination variables
    let currentPage = 1;
    let entriesPerPage = 25;
    let totalEntries = 0;
    let filteredHistory = [];

    // Display purchase history with pagination
    function displayPurchaseHistory(history) {
        filteredHistory = history;
        totalEntries = history.length;
        
        if (history.length === 0) {
            historyList.innerHTML = '<tr><td colspan="7" class="empty-state-cell"><div class="empty-state"><div class="empty-icon">📋</div><h4>No purchase history</h4><p>Your order history will appear here</p></div></td></tr>';
            updatePaginationInfo(0, 0, 0);
            return;
        }

        renderCurrentPage();
        updatePaginationControls();
    }

    // Render current page
    function renderCurrentPage() {
        const startIndex = (currentPage - 1) * entriesPerPage;
        const endIndex = startIndex + entriesPerPage;
        const currentPageData = filteredHistory.slice(startIndex, endIndex);

        historyList.innerHTML = currentPageData.map((item, index) => `
            <tr class="history-row">
                <td class="row-number">${startIndex + index + 1}</td>
                <td class="trans-id" title="Click to copy" onclick="copyOrderCode('${item.order_code}')">
                    ${item.order_code}
                </td>
                <td class="product-info">
                    <div class="product-details">
                        ${item.logo_url ? `<img src="${item.logo_url}" alt="Logo" class="product-logo">` : ''}
                        <div class="product-text">
                            <div class="product-name">${escapeHtml(item.account_title)}</div>
                            <div class="product-desc">${escapeHtml(item.description || '').substring(0, 50)}${item.description && item.description.length > 50 ? '...' : ''}</div>
                    </div>
                    </div>
                </td>
                <td class="amount-cell">
                    <span class="amount-badge">${item.quantity || 1}</span>
                </td>
                <td class="pay-cell">
                    <span class="pay-badge">${item.credits_used !== undefined ? item.credits_used : (item.cost || (item.credit_cost * (item.quantity || 1)))}</span>
                </td>
                <td class="time-cell">
                    <div class="time-info">
                        <div class="date">${new Date(item.download_date).toLocaleDateString()}</div>
                        <div class="time">${new Date(item.download_date).toLocaleTimeString()}</div>
                    </div>
                </td>
                <td class="action-cell">
                    <button class="history-btn see-more" onclick="viewPurchasedAccounts('${item.order_code}')" title="View Account Data">
                        See More
                    </button>
                    <button class="history-btn download" onclick="downloadOrderFile('${item.order_code}', '${escapeHtml(item.account_title)}')" title="Download Order">
                        Download
                    </button>
                </td>
            </tr>
        `).join('');

        updatePaginationInfo(startIndex + 1, Math.min(endIndex, totalEntries), totalEntries);
    }

    // Update pagination info
    function updatePaginationInfo(start, end, total) {
        const tableInfo = document.getElementById('tableInfo');
        const paginationInfo = document.getElementById('paginationInfo');
        
        const infoText = `Showing ${start} to ${end} of ${total} entries`;
        if (tableInfo) tableInfo.textContent = infoText;
        if (paginationInfo) paginationInfo.textContent = infoText;
    }

    // Update pagination controls
    function updatePaginationControls() {
        const totalPages = Math.ceil(totalEntries / entriesPerPage);
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const pageNumbers = document.getElementById('pageNumbers');

        // Update prev/next buttons
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;

        // Generate page numbers
        if (pageNumbers) {
            let pagesHTML = '';
            const maxVisiblePages = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

            if (endPage - startPage + 1 < maxVisiblePages) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }

            for (let i = startPage; i <= endPage; i++) {
                pagesHTML += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
            }

            pageNumbers.innerHTML = pagesHTML;
        }
    }

    // Pagination functions
    window.changeEntriesPerPage = function() {
        const select = document.getElementById('entriesPerPage');
        entriesPerPage = parseInt(select.value);
        currentPage = 1;
        renderCurrentPage();
        updatePaginationControls();
    };

    window.previousPage = function() {
        if (currentPage > 1) {
            currentPage--;
            renderCurrentPage();
            updatePaginationControls();
        }
    };

    window.nextPage = function() {
        const totalPages = Math.ceil(totalEntries / entriesPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderCurrentPage();
            updatePaginationControls();
        }
    };

    window.goToPage = function(page) {
        currentPage = page;
        renderCurrentPage();
        updatePaginationControls();
    };

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

    // Add event listener for coupon code input changes
    document.addEventListener('input', function(e) {
        if (e.target.id === 'couponCode') {
            // Reset coupon validation when user types
                const validateBtn = document.getElementById('validateCouponBtn');
                const couponStatus = document.getElementById('couponStatus');
                
            // Always reset the button state when user changes input
                validateBtn.textContent = '✓ Apply';
                validateBtn.disabled = false;
                couponStatus.className = 'coupon-status';
                couponStatus.style.display = 'none';
            
            // Reset applied coupon if exists
            if (window.currentPurchase && window.currentPurchase.appliedCoupon) {
                window.currentPurchase.appliedCoupon = null;
                updatePurchaseTotal();
            }
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
            // Always load purchase history to update dashboard stats
            if (purchaseHistory.length === 0) {
                await loadPurchaseHistory();
            } else {
                updateDashboardStats();
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
                        <div class="buy-action-container">
                        <div class="quantity-selector">
                            <label>Quantity:</label>
                            <input type="number" id="quantity_fav_${account.id}" value="1" min="1" max="${account.stock_quantity}" 
                                   onchange="updateDownloadButton(${account.id})" style="width: 60px; margin: 0 10px;">
                        </div>
                            <button class="btn btn-buy-now" 
                                id="downloadBtn_fav_${account.id}"
                                onclick="downloadAccount(${account.id})"
                                ${currentUser.credits < account.credit_cost || account.stock_quantity <= 0 ? 'disabled' : ''}>
                            ${account.stock_quantity <= 0 ? '❌ Out of Stock' : 
                                  currentUser.credits < account.credit_cost ? '❌ Insufficient Credits' : '<span><i class="fas fa-shopping-cart"></i> Buy now</span>'}
                        </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        // Update nav counts after loading
        updateNavCounts();
    }
    
    // Toggle favorite
    window.toggleFavorite = function(accountId) {
        // Ensure accountId is a number to prevent type mismatch
        accountId = parseInt(accountId);
        
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
        
        let filteredResults = [...purchaseHistory];
        
        // Search filter
        const historySearchInput = document.getElementById('historySearch');
        const searchTerm = historySearchInput ? historySearchInput.value.toLowerCase() : '';
        if (searchTerm) {
            filteredResults = filteredResults.filter(item =>
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
            
            filteredResults = filteredResults.filter(item => {
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
        
        // Reset to page 1 when filtering
        currentPage = 1;
        
        // Display filtered results
        displayPurchaseHistory(filteredResults);
        
        // Update filter stats (optional)
        const totalItems = purchaseHistory.length;
        const filteredItems = filteredResults.length;
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
                <tr>
                    <td colspan="7" class="empty-state-cell">
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h4>No matches found</h4>
                    <p>No purchased accounts contain "${searchTerm}"</p>
                    <button class="btn btn-secondary" onclick="clearAllHistoryFilters()">Clear Search</button>
                </div>
                    </td>
                </tr>
            `;
            return;
        }

        historyList.innerHTML = results.map((item, index) => `
            <tr class="history-row search-result">
                <td class="row-number">${index + 1}</td>
                <td class="trans-id" title="Click to copy" onclick="copyOrderCode('${item.order_code}')">
                    ${item.order_code}
                </td>
                <td class="product-info">
                    <div class="product-details">
                        ${item.logo_path ? `<img src="${item.logo_path}" alt="Logo" class="product-logo">` : ''}
                        <div class="product-text">
                            <div class="product-name">${escapeHtml(item.account_title)}</div>
                            <div class="search-matches">🔍 ${item.match_count} match${item.match_count > 1 ? 'es' : ''} found</div>
                        </div>
                    </div>
                </td>
                <td class="amount-cell">
                    <span class="amount-badge">${item.quantity || 1}</span>
                </td>
                <td class="pay-cell">
                    <span class="pay-badge">${item.credits_used || (item.credit_cost * (item.quantity || 1))}</span>
                </td>
                <td class="time-cell">
                    <div class="time-info">
                        <div class="date">${new Date(item.download_date).toLocaleDateString()}</div>
                        <div class="time">${new Date(item.download_date).toLocaleTimeString()}</div>
                </div>
                </td>
                <td class="action-cell">
                    <button class="history-btn see-more" onclick="viewPurchasedAccounts('${item.order_code}')" title="View Account Data">
                        See More
                     </button>
                    <button class="history-btn download" onclick="downloadOrderFile('${item.order_code}', '${escapeHtml(item.account_title)}')" title="Download Order">
                        Download
                     </button>
                </td>
            </tr>
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
        
        // Reset pagination
        currentPage = 1;
        
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

    // 2FA Functionality
    let tfaSecrets = JSON.parse(localStorage.getItem('tfaSecrets') || '[]');
    
    // Switch to section function (updated to handle 2FA)
    window.switchToSection = function(sectionName) {
        localStorage.setItem('activeTab', sectionName);
        
        navBtns.forEach(b => b.classList.remove('active'));
        dashboardSections.forEach(s => s.classList.remove('active'));
        
        const activeBtn = document.querySelector(`[data-section="${sectionName}"]`);
        const activeSection = document.getElementById(`${sectionName}Section`);
        
        if (activeBtn) activeBtn.classList.add('active');
        if (activeSection) activeSection.classList.add('active');
        
        if (sectionName === 'history') {
            loadPurchaseHistory();
        } else if (sectionName === 'favorites') {
            loadFavorites();
        } else if (sectionName === 'get2fa') {
            load2FA();
        }
    };
    
    // 2FA Functions
    window.addNew2FA = function() {
        document.getElementById('add2faModal').style.display = 'block';
    };
    
    window.close2FAModal = function() {
        document.getElementById('add2faModal').style.display = 'none';
        document.getElementById('add2faForm').reset();
    };
    
    // Generate TOTP code
    function generateTOTP(secret, digits = 6, period = 30) {
        try {
            // Simple base32 decoder (basic implementation)
            const base32Decode = (encoded) => {
                const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
                let bits = '';
                let hex = '';
                
                encoded = encoded.replace(/[^A-Z2-7]/g, '').toUpperCase();
                
                for (let i = 0; i < encoded.length; i++) {
                    const val = alphabet.indexOf(encoded.charAt(i));
                    if (val === -1) throw new Error('Invalid base32 character');
                    bits += val.toString(2).padStart(5, '0');
                }
                
                for (let i = 0; i + 8 <= bits.length; i += 8) {
                    const chunk = bits.substr(i, 8);
                    hex += parseInt(chunk, 2).toString(16).padStart(2, '0');
                }
                
                return hex;
            };
            
            const time = Math.floor(Date.now() / 1000 / period);
            const timeHex = time.toString(16).padStart(16, '0');
            
            // Use Web Crypto API for HMAC-SHA1
            const keyHex = base32Decode(secret);
            const timeBuffer = new Uint8Array(timeHex.match(/.{2}/g).map(byte => parseInt(byte, 16)));
            const keyBuffer = new Uint8Array(keyHex.match(/.{2}/g).map(byte => parseInt(byte, 16)));
            
            return crypto.subtle.importKey(
                'raw',
                keyBuffer,
                { name: 'HMAC', hash: 'SHA-1' },
                false,
                ['sign']
            ).then(key => {
                return crypto.subtle.sign('HMAC', key, timeBuffer);
            }).then(signature => {
                const hmac = new Uint8Array(signature);
                const offset = hmac[hmac.length - 1] & 0x0f;
                const code = (
                    ((hmac[offset] & 0x7f) << 24) |
                    ((hmac[offset + 1] & 0xff) << 16) |
                    ((hmac[offset + 2] & 0xff) << 8) |
                    (hmac[offset + 3] & 0xff)
                ) % Math.pow(10, digits);
                
                return code.toString().padStart(digits, '0');
            });
        } catch (error) {
            console.error('TOTP generation error:', error);
            return Promise.resolve('ERROR');
        }
    }
    
    // Load 2FA secrets
    function load2FA() {
        const tfaList = document.getElementById('tfaList');
        const empty2FA = document.getElementById('empty2FA');
        
        if (tfaSecrets.length === 0) {
            empty2FA.style.display = 'block';
            tfaList.innerHTML = empty2FA.outerHTML;
            return;
        }
        
        empty2FA.style.display = 'none';
        
        tfaList.innerHTML = tfaSecrets.map((tfa, index) => `
            <div class="tfa-item" data-index="${index}">
                <div class="tfa-header">
                    <div class="tfa-info">
                        <div class="tfa-name">🔐 ${escapeHtml(tfa.name)}</div>
                        ${tfa.issuer ? `<div class="tfa-issuer">${escapeHtml(tfa.issuer)}</div>` : ''}
                    </div>
                    <div class="tfa-actions">
                        <button class="btn btn-danger btn-small" onclick="delete2FA(${index})" title="Delete">🗑️</button>
                    </div>
                </div>
                
                <div class="tfa-code-section">
                    <div class="tfa-code" id="tfaCode_${index}">
                        <div class="code-display">------</div>
                        <div class="code-progress">
                            <div class="progress-bar" id="progress_${index}"></div>
                        </div>
                    </div>
                    <button class="btn btn-info btn-small" onclick="copy2FACode(${index})" id="copyBtn_${index}">
                        📋 Copy
                    </button>
                </div>
                
                <div class="tfa-timer" id="timer_${index}">Next code in: --s</div>
            </div>
        `).join('');
        
        // Start generating codes
        update2FACodes();
    }
    
    // Update 2FA codes
    async function update2FACodes() {
        const now = Math.floor(Date.now() / 1000);
        const period = 30;
        const timeLeft = period - (now % period);
        
        for (let i = 0; i < tfaSecrets.length; i++) {
            const tfa = tfaSecrets[i];
            const codeElement = document.getElementById(`tfaCode_${i}`);
            const timerElement = document.getElementById(`timer_${i}`);
            const progressElement = document.getElementById(`progress_${i}`);
            
            if (codeElement && timerElement && progressElement) {
                try {
                    const code = await generateTOTP(tfa.secret);
                    codeElement.querySelector('.code-display').textContent = code;
                    timerElement.textContent = `Next code in: ${timeLeft}s`;
                    
                    // Update progress bar
                    const progress = ((period - timeLeft) / period) * 100;
                    progressElement.style.width = `${progress}%`;
                    
                    // Change color as time runs out
                    if (timeLeft <= 10) {
                        progressElement.style.background = '#e74c3c';
                    } else if (timeLeft <= 20) {
                        progressElement.style.background = '#f39c12';
                    } else {
                        progressElement.style.background = '#27ae60';
                    }
                } catch (error) {
                    codeElement.querySelector('.code-display').textContent = 'ERROR';
                    console.error('Error generating code for', tfa.name, error);
                }
            }
        }
    }
    
    // Copy 2FA code
    window.copy2FACode = function(index) {
        const codeElement = document.getElementById(`tfaCode_${index}`);
        const copyBtn = document.getElementById(`copyBtn_${index}`);
        
        if (codeElement) {
            const code = codeElement.querySelector('.code-display').textContent;
            if (code !== '------' && code !== 'ERROR') {
                copyToClipboard(code, `2FA code copied: ${code}`);
                copyBtn.textContent = '✅ Copied';
                setTimeout(() => {
                    copyBtn.innerHTML = '📋 Copy';
                }, 2000);
            }
        }
    };
    
    // Delete 2FA
    window.delete2FA = function(index) {
        if (confirm(`Delete 2FA for "${tfaSecrets[index].name}"?`)) {
            tfaSecrets.splice(index, 1);
            localStorage.setItem('tfaSecrets', JSON.stringify(tfaSecrets));
            load2FA();
            showAlert('2FA deleted successfully', 'success');
        }
    };
    
    // Search 2FA
    window.search2FA = function() {
        const searchTerm = document.getElementById('tfaSearch').value.toLowerCase();
        const tfaItems = document.querySelectorAll('.tfa-item');
        
        tfaItems.forEach(item => {
            const name = item.querySelector('.tfa-name').textContent.toLowerCase();
            const issuer = item.querySelector('.tfa-issuer');
            const issuerText = issuer ? issuer.textContent.toLowerCase() : '';
            
            if (name.includes(searchTerm) || issuerText.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    };
    
    // Clear 2FA filters
    window.clear2FAFilters = function() {
        document.getElementById('tfaSearch').value = '';
        search2FA();
    };
    
    // Add 2FA form submission
    document.getElementById('add2faForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const name = document.getElementById('tfaName').value.trim();
        const secret = document.getElementById('tfaSecret').value.trim().replace(/\s/g, '').toUpperCase();
        const issuer = document.getElementById('tfaIssuer').value.trim();
        
        if (!name || !secret) {
            showAlert('Name and secret are required', 'error');
            return;
        }
        
        // Validate secret format (basic check)
        if (!/^[A-Z2-7]+$/.test(secret) || secret.length < 16) {
            showAlert('Invalid secret format. Please check your 2FA secret key.', 'error');
            return;
        }
        
        // Check for duplicates
        const exists = tfaSecrets.some(tfa => tfa.name.toLowerCase() === name.toLowerCase());
        if (exists) {
            showAlert('A 2FA with this name already exists', 'error');
            return;
        }
        
        // Add new 2FA
        tfaSecrets.push({
            name: name,
            secret: secret,
            issuer: issuer || null,
            created: new Date().toISOString()
        });
        
        localStorage.setItem('tfaSecrets', JSON.stringify(tfaSecrets));
        close2FAModal();
        load2FA();
        showAlert('2FA added successfully!', 'success');
    });
    
    // Close modal when clicking outside
    document.getElementById('add2faModal').addEventListener('click', function(e) {
        if (e.target === this) {
            close2FAModal();
        }
    });
    
    // Update 2FA codes every second if on 2FA tab
    setInterval(() => {
        const get2faSection = document.getElementById('get2faSection');
        if (get2faSection && get2faSection.classList.contains('active')) {
            update2FACodes();
        }
    }, 1000);

    // ============ SHARED ACCOUNTS FUNCTIONALITY ============
    
    let sharedAccounts = [];
    let currentRequestAccount = null;

    // Load shared accounts
    async function loadSharedAccounts() {
        try {
            showLoading('Loading shared accounts...');
            
            const response = await fetch('/api/shared-accounts', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok && Array.isArray(result)) {
                sharedAccounts = result;
                displaySharedAccounts(sharedAccounts);
                updateSharedAccountsCount();
            } else {
                showAlert(result.error || 'Failed to load shared accounts', 'error');
                document.getElementById('sharedAccountsGrid').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🤝</div>
                        <h4>No shared accounts available</h4>
                        <p>Contact your admin for access to shared accounts</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading shared accounts:', error);
            showAlert('Failed to load shared accounts', 'error');
        } finally {
            hideLoading();
        }
    }

    // Display shared accounts
    function displaySharedAccounts(accounts) {
        const sharedAccountsList = document.getElementById('sharedAccountsGrid');
        
        if (accounts.length === 0) {
            sharedAccountsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🤝</div>
                    <h4>No shared accounts available</h4>
                    <p>Contact your admin for access to shared accounts</p>
                </div>
            `;
            return;
        }

        sharedAccountsList.innerHTML = accounts.map(account => `
            <div class="shared-account-input-card">
                <div class="account-header">
                    <div class="account-icon">🤝</div>
                    <div class="account-info">
                        <h3>${escapeHtml(account.account_name)}</h3>
                        <small>ID: ${account.id}</small>
                    </div>
                </div>
                
                ${account.description ? `
                <div class="account-description">
                    <small>${escapeHtml(account.description)}</small>
                </div>
                ` : ''}
                
                <div class="input-with-button">
                    <input type="text" 
                           placeholder="Enter unique code for ${escapeHtml(account.account_name)}..." 
                           id="uniqueCode_${account.id}"
                           style="text-transform: uppercase;"
                           onkeypress="if(event.key==='Enter') requestSharedAccount(${account.id})">
                    <button class="btn-request-2fa" onclick="requestSharedAccount(${account.id})">
                        🔐 Get Access
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Open request 2FA modal
    window.openRequest2FAModal = function(accountId) {
        currentRequestAccount = sharedAccounts.find(acc => acc.id === accountId);
        if (!currentRequestAccount) {
            showAlert('Account not found', 'error');
            return;
        }

        // Fill modal with account info
        document.getElementById('requestAccountTitle').textContent = currentRequestAccount.title;
        document.getElementById('requestAccountEmail').textContent = currentRequestAccount.email;
        document.getElementById('requestAccountDescription').textContent = currentRequestAccount.description || 'No description available';

        // Reset form
        document.getElementById('uniqueCodeInput').value = '';
        document.getElementById('request2faForm').style.display = 'block';
        document.getElementById('totpResult').style.display = 'none';

        // Show modal
        document.getElementById('request2faModal').style.display = 'block';
    };

    // Close request 2FA modal
    window.closeRequest2FAModal = function() {
        document.getElementById('request2faModal').style.display = 'none';
        currentRequestAccount = null;
    };

    // Request shared account access
    window.requestSharedAccount = async function(accountId) {
        const uniqueCode = document.getElementById(`uniqueCode_${accountId}`).value.trim().toUpperCase();
        
        if (!uniqueCode) {
            showAlert('Please enter a unique code', 'error');
            return;
        }
        
        try {
            showLoading('Requesting access...');
            
            const response = await fetch('/api/get-shared-account', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uniqueCode: uniqueCode,
                    userIdentifier: currentAuthCode || 'anonymous',
                    accountId: accountId
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Display the account information
                displaySharedAccountResult(result);
                showAlert('Access granted! Account details loaded.', 'success');
            } else {
                showAlert(result.error || 'Failed to access shared account', 'error');
            }
        } catch (error) {
            console.error('Error requesting shared account:', error);
            showAlert('Request failed. Please try again.', 'error');
        } finally {
            hideLoading();
        }
    };

    // Display shared account result
    function displaySharedAccountResult(result) {
        const resultDiv = document.getElementById('quickAccountResult');
        
        resultDiv.innerHTML = `
            <div class="account-result-header">
                <h3>🔐 ${escapeHtml(result.accountName)}</h3>
                <div class="account-result-status">✅ Access Granted</div>
            </div>
            
            <div class="account-credentials">
                <div class="credential-item">
                    <label>👤 Username:</label>
                    <div class="credential-value">
                        <span id="sharedUsername">${escapeHtml(result.username)}</span>
                        <button class="btn-copy" onclick="copyToClipboard('${result.username}', 'Username copied!')">📋</button>
                    </div>
                </div>
                
                <div class="credential-item">
                    <label>🔑 Password:</label>
                    <div class="credential-value">
                        <span id="sharedPassword">${escapeHtml(result.password)}</span>
                        <button class="btn-copy" onclick="copyToClipboard('${result.password}', 'Password copied!')">📋</button>
                    </div>
                </div>
                
                <div class="credential-item">
                    <label>🔐 2FA Code:</label>
                    <div class="credential-value totp-code">
                        <span id="shared2faCode" class="totp-display">${result.twoFaCode}</span>
                        <button class="btn-copy" onclick="copyToClipboard('${result.twoFaCode}', '2FA code copied!')">📋</button>
                        <div class="totp-timer">⏰ Expires in ~${result.expiresIn}s</div>
                    </div>
                </div>
            </div>
            
            ${result.description ? `
            <div class="account-description">
                <strong>📝 Description:</strong>
                <p>${escapeHtml(result.description)}</p>
            </div>
            ` : ''}
            
            <div class="usage-info">
                <div class="usage-stats">
                    <span>📊 Usage: ${result.usageCount}</span>
                    <span>📈 Remaining: ${result.remainingUses === 'unlimited' ? '∞' : result.remainingUses}</span>
                </div>
            </div>
            
            <div class="result-actions">
                <button class="btn btn-secondary" onclick="clearSharedAccountResult()">❌ Clear</button>
                <button class="btn btn-primary" onclick="copyAllCredentials('${result.username}', '${result.password}', '${result.twoFaCode}')">📋 Copy All</button>
            </div>
        `;
        
        resultDiv.style.display = 'block';
        resultDiv.scrollIntoView({ behavior: 'smooth' });
    }

    // Clear shared account result
    window.clearSharedAccountResult = function() {
        document.getElementById('quickAccountResult').style.display = 'none';
    };

    // Copy all credentials
    window.copyAllCredentials = function(username, password, twoFaCode) {
        const allCredentials = `Username: ${username}\nPassword: ${password}\n2FA Code: ${twoFaCode}`;
        copyToClipboard(allCredentials, 'All credentials copied!');
    };

    // Submit TOTP request
    window.submitTotpRequest = async function() {
        const uniqueCode = document.getElementById('uniqueCodeInput').value.trim();
        
        if (!uniqueCode) {
            showAlert('Please enter your unique code', 'error');
            return;
        }

        if (!currentRequestAccount) {
            showAlert('No account selected', 'error');
            return;
        }

        try {
            const requestBtn = document.getElementById('requestTotpBtn');
            requestBtn.disabled = true;
            requestBtn.innerHTML = '⏳ Generating...';

            const response = await fetch('/api/reseller/request-2fa', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    authCode: currentAuthCode,
                    uniqueCode: uniqueCode.toUpperCase(),
                    sharedAccountId: currentRequestAccount.id
                })
            });

            const result = await response.json();

            if (result.success) {
                // Show TOTP result
                document.getElementById('generatedTotpCode').textContent = result.totpCode;
                document.getElementById('usageRemaining').textContent = 
                    `Remaining uses: ${result.usageRemaining >= 0 ? result.usageRemaining : 'Unlimited'}`;
                
                document.getElementById('request2faForm').style.display = 'none';
                document.getElementById('totpResult').style.display = 'block';
                
                showAlert('TOTP code generated successfully!', 'success');
                
                // Auto-copy the code
                copyToClipboard(result.totpCode, '🔑 TOTP code copied automatically!');
            } else {
                showAlert(result.error || 'Failed to generate TOTP code', 'error');
            }
        } catch (error) {
            console.error('Error requesting TOTP:', error);
            showAlert('Request failed. Please try again.', 'error');
        } finally {
            const requestBtn = document.getElementById('requestTotpBtn');
            requestBtn.disabled = false;
            requestBtn.innerHTML = '🔑 Generate TOTP Code';
        }
    };

    // Copy TOTP code
    window.copyTotpCode = function() {
        const totpCode = document.getElementById('generatedTotpCode').textContent;
        copyToClipboard(totpCode, '🔑 TOTP code copied!');
    };

    // Refresh shared accounts
    window.refreshSharedAccounts = function() {
        loadSharedAccounts();
    };

    // Search shared accounts
    window.searchSharedAccounts = function() {
        const searchTerm = document.getElementById('sharedAccountSearch').value.toLowerCase();
        const cards = document.querySelectorAll('.shared-account-card');
        
        cards.forEach(card => {
            const title = card.querySelector('.shared-account-title').textContent.toLowerCase();
            const email = card.querySelector('.shared-account-email').textContent.toLowerCase();
            const description = card.querySelector('.shared-account-description');
            const descText = description ? description.textContent.toLowerCase() : '';
            
            if (title.includes(searchTerm) || email.includes(searchTerm) || descText.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    };

    // Clear shared account filters
    window.clearSharedAccountFilters = function() {
        document.getElementById('sharedAccountSearch').value = '';
        searchSharedAccounts();
    };

    // Update shared accounts count
    function updateSharedAccountsCount() {
        const countElement = document.getElementById('sharedAccountsCount');
        if (countElement) {
            countElement.textContent = sharedAccounts.length;
        }
    }

    // Enhanced switchToSection to handle shared accounts
    const originalSwitchToSection = window.switchToSection;
    window.switchToSection = function(sectionName) {
        // Call original function
        if (originalSwitchToSection) {
            originalSwitchToSection(sectionName);
        } else {
            // Fallback implementation
            localStorage.setItem('activeTab', sectionName);
            
            navBtns.forEach(b => b.classList.remove('active'));
            dashboardSections.forEach(s => s.classList.remove('active'));
            
            const activeBtn = document.querySelector(`[data-section="${sectionName}"]`);
            const activeSection = document.getElementById(`${sectionName}Section`);
            
            if (activeBtn) activeBtn.classList.add('active');
            if (activeSection) activeSection.classList.add('active');
            
            if (sectionName === 'history') {
                loadPurchaseHistory();
            } else if (sectionName === 'favorites') {
                loadFavorites();
            } else if (sectionName === 'get2fa') {
                load2FA();
            }
        }
        
        // Handle shared accounts section
        if (sectionName === 'shared-accounts') {
            loadSharedAccounts();
        }
    };

    // Close modal when clicking outside
    document.getElementById('request2faModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeRequest2FAModal();
        }
    });

    // Close modal when clicking X
    document.querySelector('#request2faModal .close').addEventListener('click', function() {
        closeRequest2FAModal();
    });
    
    // Theme Management
    function initializeTheme() {
        const savedTheme = localStorage.getItem('resellerTheme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.body.classList.add('dark-mode');
            updateThemeIcon('dark');
        } else {
            document.body.classList.remove('dark-mode');
            updateThemeIcon('light');
        }
    }

    // Add close event for all .close buttons in modals
    document.querySelectorAll('.modal .close').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const modal = btn.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });
}); 