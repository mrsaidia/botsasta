// Debug script for admin panel
console.log('=== DEBUG ADMIN PANEL ===');

// Check if elements exist
function checkElement(id) {
    const element = document.getElementById(id);
    console.log(`Element ${id}:`, element ? 'EXISTS' : 'NOT FOUND');
    return element;
}

// Debug function to check tab
function debugNotificationsTab() {
    console.log('=== DEBUGGING NOTIFICATIONS TAB ===');
    
    // Check tab elements
    const notificationsTab = checkElement('notifications-tab');
    const notificationsContent = document.querySelector('.notification-backup-container');
    
    if (notificationsTab) {
        console.log('Tab display:', getComputedStyle(notificationsTab).display);
        console.log('Tab visibility:', getComputedStyle(notificationsTab).visibility);
        console.log('Tab innerHTML length:', notificationsTab.innerHTML.length);
    }
    
    if (notificationsContent) {
        console.log('Content display:', getComputedStyle(notificationsContent).display);
        console.log('Content visibility:', getComputedStyle(notificationsContent).visibility);
        console.log('Content innerHTML length:', notificationsContent.innerHTML.length);
    }
    
    // Check for CSS loading
    const stylesheets = document.styleSheets;
    console.log('Number of stylesheets loaded:', stylesheets.length);
    
    // Check for JavaScript errors
    console.log('Current tab:', window.currentTab);
    
    // Force show the content
    if (notificationsContent) {
        console.log('Content found:', notificationsContent);
        notificationsContent.style.display = 'grid';
        notificationsContent.style.visibility = 'visible';
        notificationsContent.style.opacity = '1';
        notificationsContent.style.background = 'white';
        notificationsContent.style.color = 'black';
        
        // Force all children
        const allChildren = notificationsContent.querySelectorAll('*');
        allChildren.forEach(child => {
            child.style.color = 'black';
            child.style.visibility = 'visible';
            child.style.opacity = '1';
        });
        
        // Force form cards
        const formCards = notificationsContent.querySelectorAll('.form-card');
        formCards.forEach(card => {
            card.style.background = 'white';
            card.style.color = 'black';
            card.style.border = '1px solid #ddd';
            card.style.padding = '20px';
            card.style.margin = '10px 0';
            card.style.borderRadius = '8px';
        });
        
        console.log('ULTRA FORCED CONTENT TO SHOW');
    } else {
        console.log('CONTENT NOT FOUND - trying to find any notification content');
        const allNotificationElements = document.querySelectorAll('[class*="notification"]');
        console.log('Found notification elements:', allNotificationElements);
    }
}

// Run debug when page loads
window.addEventListener('load', () => {
    setTimeout(debugNotificationsTab, 1000);
});

// Add to global scope
window.debugNotificationsTab = debugNotificationsTab; 