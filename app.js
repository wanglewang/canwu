'use strict';

const store = require('./utils/store.js');

App({
    globalData: {
        appName: '参悟',
    },

    onLaunch() {
        store.init();
    },

    onShow() {
        // 回到前台时结算离线收益；不满 1 分钟不弹结算
        store.settle();
    },

    onHide() {
        store.flush();
    },
});
