/**
 * Donut SMP Fake Store - Clean JavaScript
 * 
 * Includes:
 * - Preloader prevention
 * - Vanilla Modal Engine (Privacy, Terms, Checkout)
 * - Modern Clipboard Copy IP
 * - Minecraft Username Login & Platform Switcher (Java / Bedrock)
 */

(function () {
    // Current state
    let selectedPlatform = 'java';
    let activePackageId = null;

    // --- 0. PRELOADER PREVENTION ---
    function clearLoading() {
        document.body.classList.remove('loading');
        const loaders = document.querySelectorAll('.loading-wrap');
        loaders.forEach(el => el.style.display = 'none');
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', clearLoading);
    } else {
        clearLoading();
    }

    // --- 1. VANILLA MODAL ENGINE ---
    window.showModal = function(el) {
        if (!el) return;
        el.style.display = 'block';
        el.classList.add('in');
        document.body.classList.add('modal-open');
        
        let backdrop = document.querySelector('.modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade in';
            backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.75);z-index:1040;backdrop-filter:blur(4px);';
            document.body.appendChild(backdrop);
            backdrop.addEventListener('click', function() {
                window.hideModal(el);
            });
        }
    };

    window.hideModal = function(el) {
        if (!el) return;
        el.style.display = 'none';
        el.classList.remove('in');
        document.body.classList.remove('modal-open');
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
    };

    document.addEventListener('click', function (e) {
        // Open modal via data-toggle="modal"
        const toggleBtn = e.target.closest('[data-toggle="modal"]');
        if (toggleBtn) {
            e.preventDefault();
            const targetSel = toggleBtn.getAttribute('data-target') || toggleBtn.getAttribute('href');
            if (targetSel && targetSel.startsWith('#')) {
                const targetModal = document.querySelector(targetSel);
                if (targetModal) window.showModal(targetModal);
            }
            return;
        }

        // Close modal via data-dismiss="modal"
        const dismissBtn = e.target.closest('[data-dismiss="modal"]');
        if (dismissBtn) {
            e.preventDefault();
            const openModal = dismissBtn.closest('.modal');
            if (openModal) window.hideModal(openModal);
            return;
        }

        // Close when clicking directly on modal background
        if (e.target.classList.contains('modal')) {
            window.hideModal(e.target);
        }
    });

    // Hash check on page load & hashchange
    function tryOpenFromHash() {
        const hash = window.location.hash;
        if (!hash) return;
        const el = document.querySelector(hash);
        if (el && el.classList.contains('modal')) window.showModal(el);
    }
    window.addEventListener('hashchange', tryOpenFromHash);
    document.addEventListener('DOMContentLoaded', tryOpenFromHash);
    if (document.readyState !== 'loading') {
        tryOpenFromHash();
    }

    // --- 2. COPY IP BUTTON ---
    document.addEventListener('DOMContentLoaded', function() {
        const copyBtn = document.getElementById('copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (copyBtn.classList.contains('copied')) return;
                const ipToCopy = copyBtn.getAttribute('data-clipboard-text') || 'donutsmp.net';
                
                navigator.clipboard.writeText(ipToCopy).then(() => {
                    const code = copyBtn.querySelector('code');
                    const icon = copyBtn.querySelector('.copy-icon');
                    const origCode = code ? code.textContent : '';
                    const origIcon = icon ? icon.innerHTML : '';
                    
                    copyBtn.classList.add('copied');
                    if(code) code.textContent = 'IP Copied!';
                    if(icon) icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
                    
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        if(code) code.textContent = origCode;
                        if(icon) icon.innerHTML = origIcon;
                    }, 1800);
                }).catch(err => {
                    console.error("Copy failed: ", err);
                });
            });
        }
    });

    // --- 3. MINECRAFT PLATFORM SWITCHER (JAVA / BEDROCK) ---
    document.addEventListener('click', function(e) {
        const platformBtn = e.target.closest('.mc-platform-btn');
        if (!platformBtn) return;
        
        e.preventDefault();
        const card = platformBtn.closest('.mc-login-card');
        if (!card) return;

        const allButtons = card.querySelectorAll('.mc-platform-btn');
        allButtons.forEach(btn => btn.classList.remove('active'));
        platformBtn.classList.add('active');

        selectedPlatform = platformBtn.getAttribute('data-platform') || 'java';
        try {
            localStorage.setItem('donut_mc_platform', selectedPlatform);
        } catch(err){}
        
        // Update edition label in preview if visible
        const editionLabels = document.querySelectorAll('.mc-profile-edition');
        editionLabels.forEach(el => {
            el.textContent = selectedPlatform === 'java' ? 'Java Edition' : 'Bedrock Edition';
        });
    });

    // --- 4. MINECRAFT USERNAME SUBMISSION & PROFILE SYNC ---
    const PACKAGES = {
        '5999412': { name: 'Donut+ (30 days)', price: 4.99, term: '$4.99 USD EVERY 1 MONTH' },
        '7446586': { name: 'Donut++ (30 days)', price: 9.99, term: '$9.99 USD EVERY 1 MONTH' },
        '7446588': { name: 'Donut+++ (30 days)', price: 14.99, term: '$14.99 USD EVERY 1 MONTH' },
        '7446855': { name: '400 Shards', price: 0.99, term: 'ONE-TIME PURCHASE' },
        '7446857': { name: '2,500 Shards', price: 4.99, term: 'ONE-TIME PURCHASE' },
        '7446858': { name: '5,500 Shards', price: 9.99, term: 'ONE-TIME PURCHASE' },
        '7446861': { name: '12,000 Shards', price: 19.99, term: 'ONE-TIME PURCHASE' },
        '7446862': { name: '32,000 Shards', price: 49.99, term: 'ONE-TIME PURCHASE' },
        '7446865': { name: '70,000 Shards', price: 99.99, term: 'ONE-TIME PURCHASE' }
    };

    // Gift Link Logic
    let isGiftActive = false;
    try {
        if (localStorage.getItem('donut_gift_active') === 'true') isGiftActive = true;
    } catch(e) {}

    const urlParamsGlobal = new URLSearchParams(window.location.search);
    if (urlParamsGlobal.get('gift') === 'true') {
        isGiftActive = true;
        try { localStorage.setItem('donut_gift_active', 'true'); } catch(e) {}
    }

    if (isGiftActive) {
        for (const key in PACKAGES) {
            PACKAGES[key].price = 0.00;
            PACKAGES[key].term = 'FREE GIFT REDEEM';
        }

        document.addEventListener('DOMContentLoaded', function() {
            const rankPrices = document.querySelectorAll('.donut-rank-price-text');
            rankPrices.forEach(el => {
                el.innerHTML = '<span style="color:#34d399; font-weight:700;">$0.00</span><span class="donut-rank-term" style="color:#a7f3d0;"> /FREE GIFT</span>';
            });

            const shardButtons = document.querySelectorAll('.package-button a');
            shardButtons.forEach(btn => {
                btn.innerHTML = '<span style="color:#34d399; font-weight:700;">FREE</span>';
            });

            if (!document.getElementById('gift-promo-banner')) {
                const banner = document.createElement('div');
                banner.id = 'gift-promo-banner';
                banner.style.cssText = 'background: linear-gradient(90deg, #059669, #10b981); color: #ffffff; text-align: center; padding: 10px 16px; font-weight: 700; font-size: 14px; position: sticky; top: 0; z-index: 99999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
                banner.innerHTML = '🎁 <span>SPECIAL PROMO ACTIVE: 100% OFF ALL STORE PACKAGES (FREE GIFT CLAIM)</span>';
                document.body.prepend(banner);
            }
        });
    }

    function updateCardsToLoggedIn(username, platform) {
        const pkgId = activePackageId || localStorage.getItem('donut_checkout_pkg_id') || '7446586';
        const pkg = PACKAGES[pkgId] || { name: 'Donut++ (30 days)', price: 9.99 };

        const cards = document.querySelectorAll('.mc-login-card');
        cards.forEach(card => {
            const loginView = card.querySelector('#mc-login-view');
            const form = card.querySelector('.mc-login-form') || card.querySelector('#mc-login-form');
            const preview = card.querySelector('.mc-profile-preview');
            const avatarImg = card.querySelector('#basket-avatar-img') || card.querySelector('.basket-avatar-img') || card.querySelector('.mc-avatar-img');
            const usernameLabel = card.querySelector('#basket-username-val') || card.querySelector('.basket-username-val') || card.querySelector('.mc-profile-name');
            const totalSubtitle = card.querySelector('#basket-total-subtitle') || card.querySelector('.basket-subtitle');
            const itemName = card.querySelector('#basket-item-name') || card.querySelector('.basket-td.col-name');
            const itemPrice = card.querySelector('#basket-item-price') || card.querySelector('.basket-td.col-price');
            const input = card.querySelector('.mc-username-input');

            if (input) input.value = username;
            if (usernameLabel) usernameLabel.textContent = username;
            if (avatarImg) {
                avatarImg.src = `https://mc-heads.net/avatar/${encodeURIComponent(username)}/40`;
                avatarImg.onerror = function() {
                    this.onerror = null;
                    this.src = `https://minotar.net/helm/${encodeURIComponent(username)}/40.png`;
                };
            }

            if (itemName) itemName.textContent = pkg.name;
            if (itemPrice) itemPrice.textContent = `${pkg.price.toFixed(2)} USD`;
            if (totalSubtitle) totalSubtitle.innerHTML = `Total: ${pkg.price.toFixed(2)} <b>USD</b>`;

            card.classList.add('in-basket-mode');

            if (loginView) {
                loginView.style.display = 'none';
            } else {
                const title = card.querySelector('.mc-login-title');
                const platformGroup = card.querySelector('.mc-platform-group');
                if (title) title.style.display = 'none';
                if (platformGroup) platformGroup.style.display = 'none';
                if (form) form.style.display = 'none';
            }

            if (preview) preview.classList.add('show');
        });
    }

    window.handleUsernameSubmit = function(event) {
        event.preventDefault();
        const form = event.target;
        const input = form.querySelector('.mc-username-input');
        const submitBtn = form.querySelector('.mc-continue-btn');
        const username = (input ? input.value : '').trim();

        if (!username) {
            if (input) input.focus();
            return;
        }

        const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Continue';
        if (submitBtn) {
            submitBtn.innerHTML = '<span>Checking...</span>';
            submitBtn.disabled = true;
        }

        setTimeout(() => {
            if (submitBtn) {
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }

            // Save to localStorage
            try {
                localStorage.setItem('donut_mc_username', username);
                localStorage.setItem('donut_mc_platform', selectedPlatform);
            } catch(err){}

            const targetPkg = activePackageId || localStorage.getItem('donut_checkout_pkg_id') || '7446586';
            
            // Navigate directly to /checkout/basket (Authentic Tebex Step)
            window.location.href = `/checkout/basket?package=${targetPkg}&username=${encodeURIComponent(username)}`;
        }, 300);
    };

    window.handleSwitchAccount = function() {
        try {
            localStorage.removeItem('donut_mc_username');
        } catch(e){}

        const cards = document.querySelectorAll('.mc-login-card');
        cards.forEach(card => {
            card.classList.remove('in-basket-mode');
            const preview = card.querySelector('.mc-profile-preview');
            const loginView = card.querySelector('#mc-login-view');
            const form = card.querySelector('.mc-login-form') || card.querySelector('#mc-login-form');
            const title = card.querySelector('.mc-login-title');
            const platformGroup = card.querySelector('.mc-platform-group');
            const input = card.querySelector('.mc-username-input');

            if (preview) preview.classList.remove('show');
            if (loginView) {
                loginView.style.display = 'block';
            } else {
                if (title) title.style.display = 'block';
                if (platformGroup) platformGroup.style.display = 'flex';
                if (form) form.style.display = 'block';
            }
            if (input) {
                input.value = '';
                input.focus();
            }
        });
    };

    window.handleProceedCheckout = function() {
        const username = localStorage.getItem('donut_mc_username') || '';
        const targetPkg = activePackageId || localStorage.getItem('donut_checkout_pkg_id') || '7446586';
        window.location.href = `/checkout/pay?package=${targetPkg}&username=${encodeURIComponent(username)}`;
    };

    window.handleRefreshBasket = function() {
        const refreshBtn = document.querySelector('.basket-btn-refresh');
        if (refreshBtn) {
            refreshBtn.style.transform = 'rotate(360deg)';
            refreshBtn.style.transition = 'transform 0.4s ease';
            setTimeout(() => {
                refreshBtn.style.transform = 'none';
                refreshBtn.style.transition = 'none';
            }, 400);
        }
    };

    window.handleItemInfo = function() {
        const pkgId = activePackageId || localStorage.getItem('donut_checkout_pkg_id') || '7446586';
        const pkg = PACKAGES[pkgId] || { name: 'Donut++ (30 days)', price: 9.99 };
        alert(`Package Details:\n\n${pkg.name}\nPrice: $${pkg.price.toFixed(2)} USD\nIncludes priority server queue, custom chat colors, cosmetic perks and in-game boosts!`);
    };

    window.handleRemoveBasketItem = function() {
        const body = document.getElementById('basket-table-body');
        const subtitle = document.getElementById('basket-total-subtitle');
        const proceedBtn = document.querySelector('.basket-proceed-btn');
        if (body) {
            body.innerHTML = `
                <div style="padding: 36px 0; text-align: center; color: #9ca3af;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🛒</div>
                    <div style="font-size: 15px; font-weight: 700; color: #ffffff;">Your basket is currently empty.</div>
                    <div style="margin-top: 14px;">
                        <a href="/store.html" style="color: #0070f3; font-weight: 700; text-decoration: underline;">Return to Store</a>
                    </div>
                </div>
            `;
        }
        if (subtitle) subtitle.textContent = 'Total: 0.00 USD';
        if (proceedBtn) {
            proceedBtn.disabled = true;
            proceedBtn.style.opacity = '0.5';
            proceedBtn.style.cursor = 'not-allowed';
        }
    };

    // --- 5. PACKAGE CLICK / CHECKOUT NAVIGATION HANDLER ---
    window.toggleModal = function(id) {
        activePackageId = id;
        console.log("Navigating to checkout for package:", id);
        const isSubscription = ['5999412', '7446586', '7446588'].includes(String(id));
        const subPath = isSubscription ? 'subscribe' : 'single';
        window.location.href = `/checkout/packages/add/${id}/${subPath}`;
    };

    // --- 6. AUTO-RESTORE USERNAME & URL PARAMETERS ON LOAD ---
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // Clean up any stale mockup username from past testing
            if (localStorage.getItem('donut_mc_username') === 'DanhBatHuTruyen') {
                localStorage.removeItem('donut_mc_username');
            }

            // Parse package param from URL search (?package=...) or pathname (/checkout/packages/add/{id}/...)
            const urlParams = new URLSearchParams(window.location.search);
            const pathMatch = window.location.pathname.match(/\/packages\/add\/(\d+)/);
            const pkgParam = urlParams.get('package') || (pathMatch ? pathMatch[1] : null);
            if (pkgParam) {
                activePackageId = pkgParam;
                try {
                    localStorage.setItem('donut_checkout_pkg_id', pkgParam);
                    const pkgInfo = PACKAGES[pkgParam];
                    if (pkgInfo) {
                        localStorage.setItem('donut_checkout_pkg_name', pkgInfo.name);
                        localStorage.setItem('donut_checkout_pkg_price', pkgInfo.price.toFixed(2));
                    }
                } catch(e){}
            }

            let savedUser = localStorage.getItem('donut_mc_username');
            const userParam = urlParams.get('username');
            if (userParam && !savedUser) {
                savedUser = userParam;
                try { localStorage.setItem('donut_mc_username', userParam); } catch(e){}
            }

            const savedPlatform = localStorage.getItem('donut_mc_platform');
            
            if (savedPlatform) {
                selectedPlatform = savedPlatform;
                const btns = document.querySelectorAll('.mc-platform-btn');
                btns.forEach(btn => {
                    if (btn.getAttribute('data-platform') === savedPlatform) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }

            if (savedUser) {
                updateCardsToLoggedIn(savedUser, selectedPlatform);
            }
        } catch(e){}
    });
})();
