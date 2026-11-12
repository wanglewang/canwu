'use strict';

const store = require('./utils/store.js');
const cloudSave = require('./utils/cloud-save.js');
const { cloud } = require('./utils/cloud.js');

function toast(title) {
  if (typeof wx !== 'undefined' && wx.showToast) wx.showToast({ title: title, icon: 'none', duration: 2200 });
}

App({
    globalData: {
        appName: '参悟',
        offline: false,
        // tab 页不能带 query：六宫格跳 tab 时先把「落地后展开哪一节」暂存一次。
        pendingSection: '',
        // 修炼页记住上次选的功法，切 tab 回来不弹回第一门。
        lastSkillId: '',
    },

    onLaunch() {
        store.setCloudAdapter(cloudSave);
        store.init();               // 同步：先给页面一份本地缓存，避免白屏
        this.bootstrapped = false;
        this.awaitingLogin = false;
        this.bootstrapPromise = null;
        this.watchNetwork();
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

    ensureSession() {
        return cloud.auth.getSession();
    },

    resetSession() {
        this.bootstrapped = false;
    },
});
