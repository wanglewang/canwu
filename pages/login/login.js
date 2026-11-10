'use strict';

Page({
    data: {
        busy: false,
        error: '',
        reason: '',
    },

    onLoad(query) {
        const raw = query && query.reason ? query.reason : '';
        let reason = '';
        try { reason = decodeURIComponent(raw); } catch (e) { reason = raw; }
        this.setData({ reason: reason });
    },

    async onSignedIn() {
        if (this.data.busy) return;
        this.setData({ busy: true, error: '' });
        let result;
        try {
            result = await getApp().afterLogin();
        } catch (e) {
            result = { status: 'error', message: '云端存档加载失败，请重试' };
        }
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
