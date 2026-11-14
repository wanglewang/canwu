'use strict';

const store = require('./utils/store.js');
const cloudSave = require('./utils/cloud-save.js');
const { cloud } = require('./utils/cloud.js');

function toast(title) {
  if (typeof wx !== 'undefined' && wx.showToast) wx.showToast({ title: title, icon: 'none', duration: 2200 });
}

// 游客标记：在登录页选了「先不登录」就落一个盘，冷启动直接进主页。
// 不落盘的话，每次杀掉小程再进来都会被挡在登录页——那是把人赶走最快的方式。
const GUEST_KEY = 'canwu_guest_v1';

function readGuest() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return false;
    return wx.getStorageSync(GUEST_KEY) === 1;
  } catch (e) { return false; }
}

function writeGuest(on) {
  try {
    if (typeof wx === 'undefined') return;
    if (on) wx.setStorageSync(GUEST_KEY, 1);
    else if (wx.removeStorageSync) wx.removeStorageSync(GUEST_KEY);
  } catch (e) { /* 存不进去就本次会话有效，不影响开局 */ }
}

// 错误记录：开发者工具与真机 vConsole 都能看到的最后一道线索。
// 小程序里未捕获异常不会崩进程，只会安静地少做一件事——症状与「点了没反应」一样，
// 没有这条前缀日志，真机排查时只能靠猜。只留最近 20 条，不落盘、不上报。
const ERROR_KEEP = 20;

App({
    globalData: {
        appName: '参悟',
        offline: false,
        // tab 页不能带 query：宫格或别处跳 tab 时，先把「落地后展开哪一节」暂存一次。
        pendingSection: '',
        // 上次对着练的是哪一门：功法页、主页吸底、换门都会写它，
        // 参悟页没带 ?skillId（例如从结算「再来一局」回来）时用它兜底。
        lastSkillId: '',
        // 游客：没有账号，只玩本机进度。云端这一层在 store 里整体停用。
        guest: false,
        // 最近几条未捕获异常 / 丢页记录（环形，仅内存）。
        errors: [],
    },

    onLaunch() {
        store.setCloudAdapter(cloudSave);
        store.init();               // 同步：先给页面一份本地缓存，避免白屏
        this.globalData.guest = readGuest();
        store.setGuest(this.globalData.guest);
        this.bootstrapped = false;
        this.awaitingLogin = false;
        this.bootstrapPromise = null;
        this.watchNetwork();
        this.checkUpdate();
    },

    // 新版下载完只弹一次「重开」，不自动重启：自动重启会打断正在打的一局。
    // 审核通过后玩家不会立刻拿到新版本，没这段代码可能长期停在旧版上。
    checkUpdate() {
        if (typeof wx === 'undefined' || !wx.getUpdateManager) return;
        const um = wx.getUpdateManager();
        if (!um) return;
        um.onUpdateReady(function () {
            wx.showModal({
                title: '新版本已备好',
                content: '重开一次就能用上新版本，本机进度不会丢。',
                confirmText: '重开',
                cancelText: '稍后',
                success: function (res) { if (res.confirm) um.applyUpdate(); },
            });
        });
        um.onUpdateFailed(function () {
            // 下载失败不打扰玩家：下次冷启动会再检查一次。
        });
    },

    onError(error) {
        this.recordError('error', error);
    },

    // Promise 里的失败默认没有任何人接：云同步、登录、音频都走这一路，
    // 不在这里记一笔，线上就只剩「功能偶尔不生效」。
    onUnhandledRejection(res) {
        const reason = res && (res.reason || res);
        this.recordError('promise', reason && (reason.message || reason));
    },

    // 跳到不存在的页面时默认是一片空白 / 停住（旧版分享卡、改名的手滑链接）。
    // 静态校验已经守住「跳转目标必须是注册页」，这里只兜线上已经发生的那一种。
    onPageNotFound(res) {
        const p = (res && res.path) || '';
        this.recordError('route', p);
        if (p.indexOf('pages/index/index') === 0) return;
        wx.reLaunch({ url: '/pages/index/index' });
    },

    recordError(kind, detail) {
        const item = { kind: kind, detail: String(detail || '').slice(0, 300), at: Date.now() };
        this.globalData.errors.push(item);
        if (this.globalData.errors.length > ERROR_KEEP) this.globalData.errors.shift();
        try {
            if (typeof console !== 'undefined' && console.error) console.error('[参悟][' + kind + ']', detail);
        } catch (e) { /* 控制台不可用就算了，绝不能因为记日志再抛一次 */ }
    },

    onShow() {
        if (this.awaitingLogin) return;
        if (!this.bootstrapped && !this.bootstrapPromise) {
            this.startBootstrap();
        } else if (this.bootstrapped) {
            store.settle();
        }
    },

    onHide() {
        // 本地已在每次 commit 同步落盘；这里尽力把云端也补写一次。
        // 即使请求被系统冻结，pending 标记会在下次启动补写，不会丢档。
        store.flush();
    },

    startBootstrap() {
        this.bootstrapPromise = this.bootstrap().then(
            function (result) { return result; },
            function (error) { return { status: 'offline', message: '启动检查失败，已先用本机进度' }; }
        ).then((result) => {
            this.bootstrapPromise = null;
            return result;
        });
        return this.bootstrapPromise;
    },

    // 冷启动统一入口：检查会话，再拉取当前用户的云端存档。
    // 只有「确实未登录」才跳登录页；网络问题一律保留本地进度离线可玩。
    async bootstrap() {
        const result = await store.hydrate();
        const status = result.status;

        if (status === 'signed-out') {
            // 上次选了「先不登录」：本机进度照常可玩，不再挡一道登录页。
            if (this.globalData.guest) {
                this.bootstrapped = true;
                this.awaitingLogin = false;
                this.globalData.offline = false;
                store.settle();
                return { status: 'guest', message: '' };
            }
            this.bootstrapped = false;
            this.awaitingLogin = true;
            this.globalData.offline = false;
            wx.reLaunch({ url: '/pages/login/login' });
            return result;
        }

        if (status === 'conflict') {
            this.bootstrapped = false;
            this.askConflict();
            return result;
        }

        // 确实有账号了：之前的游客标记作废，存档重新走云端。
        if (this.globalData.guest) {
            this.globalData.guest = false;
            writeGuest(false);
            store.setGuest(false);
        }
        this.bootstrapped = true;
        this.awaitingLogin = false;
        this.globalData.offline = status === 'offline';
        if (status === 'offline') {
            toast('暂时连不上云端，先用本机进度');
            this.scheduleRetry();
        } else {
            this.globalData.offline = false;
        }
        store.settle();
        return result;
    },

    // 两台设备都改过存档时不静默覆盖，交由玩家决定保留哪一份。
    askConflict() {
        const app = this;
        wx.showModal({
            title: '进度有冲突',
            content: '另一台设备也更新了这份进度。用云端那份，还是用本机这份覆盖？',
            confirmText: '用本机覆盖',
            cancelText: '用云端进度',
            success: async function (res) {
                const result = await store.resolveConflict(!res.confirm);
                if (!result.ok) {
                    toast(result.message || '处理失败，请稍后重试');
                    app.askConflict();
                    return;
                }
                app.bootstrapped = true;
                app.awaitingLogin = false;
                app.globalData.offline = false;
                toast('进度已对齐');
                store.settle();
            },
        });
    },

    // 登录组件触发 signedin 后调用：重新按新用户的身份拉档。
    async afterLogin() {
        this.bootstrapped = false;
        const result = await store.hydrate();
        if (result.status === 'conflict') {
            this.askConflict();
            return result;
        }
        if (result.status === 'signed-out') {
            this.awaitingLogin = true;
            return result;
        }
        this.bootstrapped = true;
        this.awaitingLogin = false;
        this.globalData.offline = result.status === 'offline';
        if (result.status === 'offline') toast('已登录，但云端暂不可用，先用本机进度');
        store.settle();
        return result;
    },

    watchNetwork() {
        if (typeof wx === 'undefined' || !wx.onNetworkStatusChange) return;
        const app = this;
        wx.onNetworkStatusChange(function (res) {
            if (res.isConnected && app.globalData.offline) app.retrySync();
        });
    },

    scheduleRetry() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        const app = this;
        this.retryTimer = setTimeout(function () {
            app.retryTimer = null;
            if (app.globalData.offline) app.retrySync();
        }, 15000);
    },

    async retrySync() {
        const result = await store.flushCloud();
        if (result && result.ok) {
            this.globalData.offline = false;
            toast('云端已重新连上');
        } else if (result && result.conflict) {
            this.askConflict();
        } else {
            this.scheduleRetry();
        }
    },

    // 登录页「先不登录」：本机进度直接开玩，不建会话、不写云端。
    enterGuest() {
        this.globalData.guest = true;
        this.globalData.offline = false;
        this.bootstrapped = true;
        this.awaitingLogin = false;
        writeGuest(true);
        store.setGuest(true);
        store.settle();
    },

    // 游客主动去登录：先摘标记再进登录页；即使临阵改主意，登录页还能再点「先不登录」。
    leaveGuest() {
        this.globalData.guest = false;
        this.awaitingLogin = true;
        writeGuest(false);
        store.setGuest(false);
    },

    ensureSession() {
        return cloud.auth.getSession();
    },

    resetSession() {
        this.bootstrapped = false;
    },
});
