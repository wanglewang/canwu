'use strict';

const store = require('./utils/store.js');
const cloudSave = require('./utils/cloud-save.js');
const { cloud } = require('./utils/cloud.js');

App({
    globalData: {
        appName: '参悟',
    },

    onLaunch() {
        store.setCloudAdapter(cloudSave);
        store.init();               // 同步：先给页面一份本地缓存，避免白屏
        this.bootstrapped = false;
        this.awaitingLogin = false;
        this.bootstrapPromise = null;
    },

    onShow() {
        if (this.awaitingLogin) return;
        if (!this.bootstrapped && !this.bootstrapPromise) {
            this.bootstrapPromise = this.bootstrap().then(function (result) {
                return result;
            });
        } else if (this.bootstrapped) {
            store.settle();
        }
    },

    onHide() {
        store.flush();              // 本地立即落盘，云端异步补写
    },

    // 冷启动统一入口：检查会话，再拉取当前用户的云端存档。
    async bootstrap() {
        const result = await store.hydrate();
        this.bootstrapPromise = null;
        if (result.status !== 'ok') {
            this.bootstrapped = false;
            this.awaitingLogin = true;
            const reason = result.status === 'signed-out' ? '' : (result.message || '');
            wx.reLaunch({
                url: '/pages/login/login?reason=' + encodeURIComponent(reason),
            });
            return result;
        }
        this.bootstrapped = true;
        this.awaitingLogin = false;
        store.settle();
        return result;
    },

    // 登录组件触发 signedin 后调用：重新按新用户的身份拉档。
    async afterLogin() {
        this.bootstrapped = false;
        const result = await store.hydrate();
        if (result.status === 'ok') {
            this.bootstrapped = true;
            this.awaitingLogin = false;
            store.settle();
        }
        return result;
    },

    ensureSession() {
        return cloud.auth.getSession();
    },

    resetSession() {
        this.bootstrapped = false;
    },
});
