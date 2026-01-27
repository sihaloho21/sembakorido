# Reward Points Integration Guide

This document provides a comprehensive guide to integrate the **Floating Point** and **Claim Reward** features with your `user_points` sheet.

## 1. Understanding the Current Implementation

Currently, the reward points system in your `script.js` fetches data from the main product API (`API_URL`) and then filters it to find user point records. This approach is not ideal for a dedicated user points system, as it relies on the main product data source.

## 2. Key Fixes and Enhancements

To properly integrate with a dedicated `user_points` sheet, the following modifications are necessary:

### 2.1. Update the API Configuration

To fetch data specifically from your `user_points` sheet in SheetDB, you need to modify the API URL within the `checkUserPoints` function. SheetDB allows specifying a particular sheet by appending `?sheet=sheet_name` to the base API URL.

**Action Required:**

Locate the `checkUserPoints` function in `assets/js/script.js` and update the `apiUrl` variable as follows:

```javascript
// Original line:
const apiUrl = API_URL; 

// Change to this:
const apiUrl = `${API_URL}?sheet=user_points`;
```

This change ensures that the `checkUserPoints` function queries the `user_points` sheet directly, rather than the main product sheet.

### 2.2. Match Sheet Column Names

For the JavaScript code to correctly identify and process user point data, the column headers in your Google Sheet (which SheetDB exposes) must match the property names expected by the script. Based on the existing `script.js` logic, your `user_points` Google Sheet should include at least the following columns:

| Column Name | Description |
| :---------- | :---------- |
| `whatsapp`  | Stores the user's WhatsApp phone number. This should be in a normalized format (e.g., `628993370200`). |
| `poin`      | Stores the user's current point balance. This should be a numeric value (e.g., `10.5`). |

**Action Required:**

Verify that your `user_points` Google Sheet has these exact column headers. If not, rename them accordingly.

### 2.3. Refine Point Checking Logic

The current `checkUserPoints` function iterates through all fetched data to find a matching user. While functional, ensuring robust normalization of phone numbers is crucial for accurate lookups.

**Recommended Code Snippet for `checkUserPoints`:**

Replace your existing `checkUserPoints` function in `assets/js/script.js` with the following improved version:

```javascript
function checkUserPoints() {
    const phone = document.getElementById("reward-phone").value.trim();
    
    if (!phone) {
        alert("Mohon masukkan nomor WhatsApp.");
        return;
    }

    const normalizedPhone = normalizePhone(phone); // Ensure phone number is normalized
    const apiUrl = `${API_URL}?sheet=user_points`; // Target the specific sheet

    // Show loading state (assuming event.target is available, or get button by ID)
    const checkBtn = document.querySelector("#reward-modal button"); // Adjust selector if needed
    const originalText = checkBtn ? checkBtn.innerText : "";
    if (checkBtn) {
        checkBtn.innerText = "Mencari...";
        checkBtn.disabled = true;
    }

    fetch(apiUrl)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            // Find user by normalized phone number
            const user = data.find(r => normalizePhone(r.whatsapp || "") === normalizedPhone);
            
            const pointsDisplay = document.getElementById("points-display");
            const pointsValue = document.querySelector("#points-display h4");

            if (user) {
                const pts = parseFloat(user.poin) || 0;
                pointsValue.innerHTML = `${pts.toFixed(1)} <span class="text-sm font-bold">Poin</span>`;
                sessionStorage.setItem("reward_phone", normalizedPhone);
                sessionStorage.setItem("user_points", pts);
                showToast(`Ditemukan ${pts.toFixed(1)} poin untuk nomor ini!`);
            } else {
                pointsValue.innerHTML = `0.0 <span class="text-sm font-bold">Poin</span>`;
                sessionStorage.setItem("reward_phone", normalizedPhone);
                sessionStorage.setItem("user_points", 0);
                showToast("Nomor ini belum memiliki poin. Mulai berbelanja untuk mendapatkan poin!");
            }
            pointsDisplay.classList.remove("hidden");
        })
        .catch(error => {
            console.error("Error checking points:", error);
            alert("Gagal mengecek poin. Silakan coba lagi.");
        })
        .finally(() => {
            if (checkBtn) {
                checkBtn.innerText = originalText;
                checkBtn.disabled = false;
            }
        });
}
```

### 2.4. Implementing the Claim Reward Feature

Currently, the `claimReward` function primarily facilitates manual processing by opening a WhatsApp chat with pre-filled order details. For a fully automated point deduction, direct client-side updates to SheetDB are generally **not recommended** due to security concerns (exposing API keys).

**Current Implementation (`claimReward` function):**

```javascript
function claimReward(rewardId) {
    const phone = sessionStorage.getItem("reward_phone");
    const points = parseFloat(sessionStorage.getItem("user_points")) || 0;
    
    if (!phone) {
        alert("Mohon cek poin Anda terlebih dahulu.");
        return;
    }
    
    if (points <= 0) {
        alert("Anda tidak memiliki poin untuk ditukar.");
        return;
    }
    
    const message = `Tukar poin Anda (${points.toFixed(1)} poin) dengan reward ini?`;
    if (confirm(message)) {
        const waMessage = `*KLAIM REWARD POIN*\n\nNomor WhatsApp: ${phone}\nTotal Poin: ${points.toFixed(1)} Poin\nReward ID: ${rewardId}\n\nMohon proses klaim reward saya.`;
        const waUrl = `https://wa.me/628993370200?text=${encodeURIComponent(waMessage)}`;
        window.open(waUrl, "_blank");
        
        showToast("Permintaan klaim reward telah dikirim ke WhatsApp admin!");
    }
}
```

**Future Considerations for Automation:**

If you require automated point deduction and management, the most secure and scalable approach would be to implement a server-side solution. A common method for SheetDB users is to leverage **Google Apps Script (GAS)** as a middleware. This would involve:

1.  **GAS Web App**: Create a GAS project linked to your Google Sheet. This script would expose a web endpoint.
2.  **Secure API Key**: Your GAS script would handle the SheetDB API key securely on the server-side, never exposing it to the client.
3.  **Client-Side Request**: Your `claimReward` function would send a request to your GAS web app endpoint, passing the user's phone number, reward ID, and points to deduct.
4.  **GAS Processing**: The GAS script would receive the request, validate it, update the `user_points` sheet (deducting points), and then respond to the client.

This approach enhances security and allows for more complex logic (e.g., checking reward availability, logging transactions) without exposing sensitive credentials.

## 3. Summary of Future Steps

To successfully implement and manage your reward points system with a dedicated sheet:

*   **Sheet Setup**: Create a Google Sheet named `user_points` with at least `whatsapp` and `poin` columns.
*   **API URL Update**: Modify the `apiUrl` in `checkUserPoints` to specifically target the `user_points` sheet.
*   **Phone Normalization**: Ensure consistent phone number normalization (`normalizePhone` function) across all relevant parts of your application.
*   **Automated Claim (Advanced)**: For automated point deduction, investigate using Google Apps Script as a secure intermediary between your frontend and SheetDB.

By following these guidelines, you can establish a robust and maintainable reward points system for your **Paket Sembako** project.
