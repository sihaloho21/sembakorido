/**
 * UI Module
 * Handles UI operations like toasts, notifications, modals
 */

class UIModule {
    /**
     * Show toast notification
     */
    static showToast(message, duration = 3000) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #4CAF50;
            color: white;
            padding: 16px;
            border-radius: 4px;
            z-index: 1000;
            animation: slideIn 0.3s ease-in;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * Show error toast
     */
    static showError(message, duration = 3000) {
        const toast = document.createElement('div');
        toast.className = 'toast-error';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #f44336;
            color: white;
            padding: 16px;
            border-radius: 4px;
            z-index: 1000;
            animation: slideIn 0.3s ease-in;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * Show success notification
     */
    static showSuccess(title, message, orderId = null) {
        const notification = document.createElement('div');
        notification.className = 'success-notification';
        notification.innerHTML = `
            <div style="text-align: center;">
                <h2>${title}</h2>
                <p>${message}</p>
                ${orderId ? `<p><strong>Order ID: ${orderId}</strong></p>` : ''}
            </div>
        `;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: white;
            padding: 32px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 2000;
            max-width: 500px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    /**
     * Show loading spinner
     */
    static showLoading(message = 'Loading...') {
        const loader = document.createElement('div');
        loader.className = 'loading-spinner';
        loader.innerHTML = `
            <div style="text-align: center;">
                <div class="spinner" style="
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 16px;
                "></div>
                <p>${message}</p>
            </div>
        `;
        loader.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: white;
            padding: 32px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 2000;
        `;
        
        document.body.appendChild(loader);
        return loader;
    }

    /**
     * Hide loading spinner
     */
    static hideLoading(loader) {
        if (loader) {
            loader.remove();
        }
    }

    /**
     * Show modal
     */
    static showModal(title, content, buttons = []) {
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        modal.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 3000;
            ">
                <div style="
                    background-color: white;
                    padding: 32px;
                    border-radius: 8px;
                    max-width: 500px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                ">
                    <h2>${title}</h2>
                    <div>${content}</div>
                    <div style="margin-top: 24px; display: flex; gap: 12px;">
                        ${buttons.map(btn => `
                            <button onclick="${btn.onclick}" style="
                                padding: 8px 16px;
                                background-color: ${btn.color || '#3498db'};
                                color: white;
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                            ">${btn.label}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        return modal;
    }

    /**
     * Hide modal
     */
    static hideModal(modal) {
        if (modal) {
            modal.remove();
        }
    }

    /**
     * Update cart badge
     */
    static updateCartBadge(count) {
        const badge = document.querySelector('.cart-badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'block' : 'none';
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIModule;
}
