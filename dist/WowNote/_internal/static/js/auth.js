// 認証関連のJavaScript

// ログインモーダルを表示
function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// ログインモーダルを閉じる
function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 登録モーダルを表示
function showRegistrationModal() {
    hideLoginModal();
    const modal = document.getElementById('registrationModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// 登録モーダルを閉じる
function hideRegistrationModal() {
    const modal = document.getElementById('registrationModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// メール送信画面を表示
function showEmailStep() {
    document.getElementById('emailStep').style.display = 'block';
    document.getElementById('verificationStep').style.display = 'none';
    document.getElementById('registrationStep').style.display = 'none';
}

// 認証待ち画面を表示
function showVerificationStep() {
    document.getElementById('emailStep').style.display = 'none';
    document.getElementById('verificationStep').style.display = 'block';
    document.getElementById('registrationStep').style.display = 'none';
}

// 登録情報入力画面を表示
function showRegistrationStep(email, token) {
    document.getElementById('emailStep').style.display = 'none';
    document.getElementById('verificationStep').style.display = 'none';
    document.getElementById('registrationStep').style.display = 'block';
    document.getElementById('regEmail').value = email;
    document.getElementById('regToken').value = token;
}

// ログイン処理
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('loginRemember') ? document.getElementById('loginRemember').checked : false;
    const errorEl = document.getElementById('loginError');

    try {
        const response = await fetch('/note/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, remember })
        });

        const data = await response.json();

        if (response.ok) {
            hideLoginModal();
            window.location.href = '/note/app'; // アプリページにリダイレクト
        } else {
            errorEl.textContent = data.error || 'ログインに失敗しました';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = 'ログインに失敗しました';
        errorEl.style.display = 'block';
    }
}

// メールアドレス送信（仮登録）
async function handleEmailSubmit(event) {
    event.preventDefault();

    const email = document.getElementById('regEmailInput').value;
    const errorEl = document.getElementById('emailError');
    const submitBtn = event.target.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';

    try {
        const response = await fetch('/note/api/auth/request-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('verificationEmail').textContent = email;
            showVerificationStep();
            // URLパラメータからトークンを確認するポーリングを開始
            startTokenPolling(email);
        } else {
            errorEl.textContent = data.error || 'メール送信に失敗しました';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = '確認メールを送信';
        }
    } catch (error) {
        errorEl.textContent = 'メール送信に失敗しました';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '確認メールを送信';
    }
}

// トークン確認のポーリング（メールリンククリック検出用）
let pollingInterval = null;
function startTokenPolling(email) {
    // URLパラメータを確認
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
        verifyEmailToken(token);
        return;
    }

    // 5秒ごとにURLパラメータを確認
    pollingInterval = setInterval(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        if (token) {
            clearInterval(pollingInterval);
            verifyEmailToken(token);
        }
    }, 5000);
}

// メールトークンを検証
async function verifyEmailToken(token) {
    try {
        const response = await fetch(`/note/api/auth/verify-email/${token}`);
        const data = await response.json();

        if (response.ok) {
            showRegistrationStep(data.email, token);
        } else {
            alert(data.error || 'トークンの検証に失敗しました');
        }
    } catch (error) {
        alert('トークンの検証に失敗しました');
    }
}

// ユーザー登録完了
async function handleRegistration(event) {
    event.preventDefault();

    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const agreedToTerms = document.getElementById('agreeTerms').checked;
    const token = document.getElementById('regToken').value;
    const errorEl = document.getElementById('registrationError');

    // バリデーション
    if (password !== confirmPassword) {
        errorEl.textContent = 'パスワードが一致しません';
        errorEl.style.display = 'block';
        return;
    }

    if (!agreedToTerms) {
        errorEl.textContent = 'プライバシーポリシーと利用規約に同意してください';
        errorEl.style.display = 'block';
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '登録中...';

    try {
        const response = await fetch('/note/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                password,
                agreedToTerms
            })
        });

        const data = await response.json();

        if (response.ok) {
            hideRegistrationModal();
            window.location.href = '/note/app'; // アプリページにリダイレクト
        } else {
            errorEl.textContent = data.error || '登録に失敗しました';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = '登録';
        }
    } catch (error) {
        errorEl.textContent = '登録に失敗しました';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '登録';
    }
}

// ログアウト
async function handleLogout() {
    // 確認ダイアログを表示
    if (!confirm('ログアウトしますか？')) {
        return; // キャンセルされた場合は何もしない
    }

    try {
        const response = await fetch('/note/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // ログアウト成功またはエラーに関わらず、ログインページにリダイレクト
        window.location.href = '/note/login';
    } catch (error) {
        console.error('Logout error:', error);
        // エラーが発生してもログインページにリダイレクト
        window.location.href = '/note/login';
    }
}

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', () => {
    // URLパラメータにトークンがある場合は登録モーダルを表示
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
        showRegistrationModal();
        verifyEmailToken(token);
        // URLからトークンを削除
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // ユーザーメニューを初期化
    initUserMenu();
});

// ユーザーメニューの初期化
async function initUserMenu() {
    const container = document.getElementById('userMenuContainer');
    if (!container) return;

    try {
        const response = await fetch('/note/api/auth/me');

        if (response.ok) {
            // ログイン済み
            const data = await response.json();
            const displayName = data.user.email.split('@')[0]; // メールアドレスの@前を表示
            container.innerHTML = `
                <button class="btn-settings" onclick="handleLogout()">
                    👤 ${displayName} | ログアウト
                </button>
            `;
        } else {
            // 未ログイン
            container.innerHTML = `
                <button class="btn-settings" onclick="showLoginModal()">
                    🔐 ログイン / 登録
                </button>
            `;
        }
    } catch (error) {
        // エラー時は未ログインとして扱う
        container.innerHTML = `
            <button class="btn-settings" onclick="showLoginModal()">
                🔐 ログイン / 登録
            </button>
        `;
    }
}
