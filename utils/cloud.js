'use strict';

// 唯一的云客户端。endpoint / publishableKey 只能来自开通云服务时返回的 publicConfig。
// 小程序没有 location.origin，endpoint 必须显式传入；不要手写 wx.request 访问 /.cloud/**。

const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics.js');

const publicConfig = {
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_jiVmdkW9TIl3n14p3QlIi5_TkYmwGVR7vFAUB20vA0kXkdKVqXIm75o',
};

const cloud = createMiniProgramWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  publishableKey: publicConfig.publishableKey,
  wx: createDiagnosticWx(wx),
});

module.exports = {
  cloud: cloud,
};
