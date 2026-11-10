'use strict';

const { cloud } = require('../../utils/cloud.js');

Page({
    data: {
        busy: false,
        error: '',
        reason: '',
        showEmail: false,
    },

    onLoad(query) {
        const raw = query && query.reason ? query.reason : '';
        let reason = '';
        try { reason = decodeURIComponent(raw); } catch (e) { reason = raw; }
        this.setData({ reason: reason });
    },

    toggleEmail() {
        this.setData({ showEmail: !this.data.showEmail, error: '' });
    },

    // 主入口：静默拿 code，交给云后端换取 WorkBuddy 会话。
    // 不实现 jscode2session，不收集 AppSecret，也不自行保存 openid。
    async onWechatLogin() {
        if (this.data.busy) return;
        this.setData({ busy: true, error: '' });
        let code;
        try {
            code = await this.getWxCode();
        } catch (e) {
            this.logFailure('wx.login', e);
            this.setData({ busy: false, error: '微信登录失败，请重试或改用邮箱登录' });
            return;
        }
        let result;
        try {
            const appid = wx.getAccountInfoSync().miniProgram.appId;
            const signed = await cloud.auth.signInWithWechat(code, appid);
            if (!signed || signed.error) {
                const message = signed && signed.error && signed.error.message
                    ? signed.error.message : '微信登录失败';
                throw new Error(message);
            }
            result = await getApp().afterLogin();
        } catch (e) {
            this.logFailure('wechat-login-handler', e);
            result = {
                status: 'error',
                message: '微信登录失败，请确认已绑定小程序并开启微信登录，或改用邮箱登录',
            };
        }
        this.finishLogin(result);
    },

    getWxCode() {
        return new Promise(function (resolve, reject) {
            wx.login({
                success: function (res) {
                    if (res && res.code) {
                        resolve(res.code);
                    } else {
                        reject(new Error('wx.login returned no code'));
                    }
                },
                fail: function (err) {
                    reject(new Error((err && err.errMsg) || 'wx.login failed'));
                },
            });
        });
    },

    // 日志只保留阶段与消息；不记录原始错误对象、登录 code 或会话内容。
    logFailure(stage, error) {
        const message = error && error.message ? error.message : 'unknown error';
        console.error('[WorkBuddy Cloud] login failed', JSON.stringify({
            stage: stage,
            message: message,
        }));
    },

    // 邮箱验证码兜底：与微信登录共用同一套会话落地流程。
    async onSignedIn() {
        if (this.data.busy) return;
        this.setData({ busy: true, error: '' });
        let result;
        try {
            result = await getApp().afterLogin();
        } catch (e) {
            result = { status: 'error', message: '云端存档加载失败，请重试' };
        }
        this.finishLogin(result);
    },

    finishLogin(result) {
        if (result.status === 'ok') {
            wx.switchTab({ url: '/pages/index/index' });
            return;
        }
        this.setData({
            busy: false,
            error: result.message || '云端存档加载失败，请重试',
        });
    },
});
