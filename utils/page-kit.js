'use strict';

// 页面公共骨架：主题同步 + 存档订阅，一处实现，各页复用。
// 此前 12 个页面每页手抄「onLoad/onShow 调 syncPage、subscribe/unsubscribe 配对」，
// 漏一页的症状是「这一页永远是白天」或「退出后还在后台刷新」，而且不报错。
//
// 为什么不用 Behavior()：Behaviors 是自定义组件的机制，Page 构造器不支持。
// 这里用「包裹函数」：页面照常写自己的 onLoad / onShow 函数体（首行仍是
// pageTheme.syncPage(this)，静态校验逐钩子看得见），只把「订阅 / 退订」这对
// 最容易漏的动作交给 kit.bind / kit.unbind——订阅口只此一处，不再各页手抄。
//
// 约定：
//   · onLoad：syncPage → kit.bind(this)（默认绑 refresh，可传方法名）→ 页面逻辑；
//   · onUnload：页面自己的清理在前，kit.unbind(this) 收尾；
//   · 不跟存档走的页面（登录 / 指南 / 说明 / 参悟）不调 bind，只保留 syncPage。

const store = require('./store.js');

// 挂订阅：fn 缺省绑页面的 refresh；榜单这类刷新口不同名的页面显式传方法名。
function bind(page, methodName) {
  const fn = page[methodName || 'refresh'];
  page.listener = fn.bind(page);
  store.subscribe(page.listener);
}

function unbind(page) {
  if (page.listener) {
    store.unsubscribe(page.listener);
    page.listener = null;
  }
}

module.exports = { bind: bind, unbind: unbind };
