// Show / Hide button for password fields on the sign-in page (plain script).
document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    button.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? 'Hide' : 'Show';
        button.setAttribute('aria-pressed', String(show));
        input.focus();
    });
});
