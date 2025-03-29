// Fix for dropdown appearing behind elements and staying in position when scrolling
(function() {
    // Move the dropdown to the end of the body to ensure it's on top of everything
    document.addEventListener('DOMContentLoaded', () => {
        const fixZIndexIssues = () => {
            const dropdown = document.getElementById('group-dropdown-content');
            const dropdownHeader = document.getElementById('selected-group-display');
            
            if (!dropdown || !dropdownHeader) return;
            
            // Force higher stacking context by moving to end of document
            document.body.appendChild(dropdown);
            
            // Track dropdown state
            let isDropdownVisible = false;
            let headerRect = null;
            
            // Original click handler
            const originalClick = dropdownHeader.onclick;
            
            // Override click handler to handle positioning
            dropdownHeader.onclick = function(e) {
                if (originalClick) originalClick.call(this, e);
                
                // Update visibility state after the original click handler has run
                isDropdownVisible = dropdown.style.display === 'block';
                
                if (isDropdownVisible) {
                    // Store header position for scroll handling
                    headerRect = dropdownHeader.getBoundingClientRect();
                    
                    // Position the dropdown correctly
                    dropdown.style.position = 'fixed';
                    dropdown.style.top = `${headerRect.bottom + 4}px`; // 4px margin
                    dropdown.style.left = `${headerRect.left}px`;
                    dropdown.style.width = `${headerRect.width}px`;
                }
            };
            
            // Handle scroll events to keep dropdown properly positioned
            window.addEventListener('scroll', () => {
                if (isDropdownVisible && headerRect) {
                    const currentHeaderRect = dropdownHeader.getBoundingClientRect();
                    
                    // Update dropdown position to follow the header
                    dropdown.style.top = `${currentHeaderRect.bottom + 4}px`;
                    dropdown.style.left = `${currentHeaderRect.left}px`;
                }
            }, { passive: true });
            
            // Also listen for resize events
            window.addEventListener('resize', () => {
                if (isDropdownVisible && headerRect) {
                    const currentHeaderRect = dropdownHeader.getBoundingClientRect();
                    dropdown.style.top = `${currentHeaderRect.bottom + 4}px`;
                    dropdown.style.left = `${currentHeaderRect.left}px`;
                    dropdown.style.width = `${currentHeaderRect.width}px`;
                }
            }, { passive: true });
            
            // Update the dropdown's closed state when it's closed
            document.addEventListener('click', (e) => {
                if (!dropdownHeader.contains(e.target) && !dropdown.contains(e.target)) {
                    isDropdownVisible = false;
                }
            });
        };
        
        // Small delay to ensure DOM is ready
        setTimeout(fixZIndexIssues, 100);
    });
})();
