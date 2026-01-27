// Check if already logged in
if (localStorage.getItem('admin_logged_in') === 'true') {
    window.location.href = 'index.html';
}

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-message');

    if (user === 'admin' && pass === '@Sihaloho1995@') {
        localStorage.setItem('admin_logged_in', 'true');
        window.location.href = 'index.html';
    } else {
        errorMsg.classList.remove('hidden');
    }
};
