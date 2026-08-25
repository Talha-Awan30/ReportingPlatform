/**
 * Proposal Automation System - Main JavaScript
 * =============================================
 */

document.addEventListener('DOMContentLoaded', function() {

    // Flash messages disabled per user request
    // Auto-hide flash messages after 5 seconds - DISABLED
    // const alerts = document.querySelectorAll('.alert');
    // alerts.forEach(function(alert) {
    //     setTimeout(function() {
    //         alert.style.opacity = '0';
    //         alert.style.transform = 'translateY(-10px)';
    //         setTimeout(function() {
    //             alert.remove();
    //         }, 300);
    //     }, 5000);
    // });

    // Add smooth transitions to alerts - DISABLED
    // const style = document.createElement('style');
    // style.textContent = '.alert { transition: opacity 0.3s ease, transform 0.3s ease; }';
    // document.head.appendChild(style);

    // Form validation feedback — show "Please wait..." only for forms that
    // actually navigate. AJAX forms call preventDefault() in their own handlers,
    // so we restore the button on the next microtask if the submit was cancelled.
    const forms = document.querySelectorAll('form');
    forms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (!submitBtn || submitBtn.classList.contains('logout-btn')) return;
            if (submitBtn.dataset.skipPleaseWait === 'true') return;

            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Please wait...';

            // Defer the check so other submit listeners (which may call
            // preventDefault for AJAX) have a chance to run first.
            setTimeout(function() {
                if (e.defaultPrevented) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }, 0);
        });
    });

    // Add active class to current nav item
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(function(link) {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });

    console.log('Proposal Automation System loaded successfully.');
});


/**
 * Utility function to show a confirmation dialog
 * @param {string} message - The confirmation message
 * @returns {boolean} - User's choice
 */
function confirmAction(message) {
    return confirm(message);
}


/**
 * Utility function to format dates
 * @param {string} dateString - The date string to format
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}


/**
 * Print functionality for proposals
 */
function printProposal() {
    window.print();
}


/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        alert('Copied to clipboard!');
    }).catch(function(err) {
        console.error('Failed to copy: ', err);
    });
}
