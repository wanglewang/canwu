'use strict';

// 道相：纯 CSS 绘制的角色形象，参数（variant / realm）都是存档数据，随云端同步。
// 不使用任何图片资源，也不需要用户授权；换一尊道相只是换编号与配色。

const PALETTES = [
    { robe: '#3d6b5b', trim: '#d8b775', aura: '#bcd7c7', disc: '#eef4ec', skin: '#f2ddc2', hair: '#2f3b36', seal: '山' },
    { robe: '#4a5f86', trim: '#c9d6ef', aura: '#c3d3ec', disc: '#eef2f8', skin: '#f2ddc2', hair: '#303744', seal: '水' },
    { robe: '#8a5a44', trim: '#e3c39a', aura: '#e6cdb6', disc: '#f7f0e7', skin: '#f2ddc2', hair: '#3b3029', seal: '火' },
    { robe: '#6b6f48', trim: '#d8d29b', aura: '#d6dcb6', disc: '#f3f4e8', skin: '#f2ddc2', hair: '#34382b', seal: '木' },
    { robe: '#6d5878', trim: '#d9c2e3', aura: '#d8c6e2', disc: '#f4eef7', skin: '#f2ddc2', hair: '#372f3d', seal: '雷' },
    { robe: '#8c7b5e', trim: '#e8d5a8', aura: '#ded5bd', disc: '#f7f3e9', skin: '#f2ddc2', hair: '#3d362a', seal: '风' },
];

Component({
    properties: {
        variant: { type: Number, value: 0, observer: 'refresh' },
        realm: { type: Number, value: 0, observer: 'refresh' },
        size: { type: String, value: 'normal' },
    },

    data: {
        p: PALETTES[0],
        rings: [],
    },

    lifetimes: {
        attached: function () { this.refresh(); },
    },

    methods: {
        refresh: function () {
            const v = Math.floor(Number(this.data.variant)) || 0;
            const i = ((v % PALETTES.length) + PALETTES.length) % PALETTES.length;
            const r = Math.max(0, Math.min(3, Math.floor(Number(this.data.realm)) || 0));
            const rings = [];
            for (let k = 0; k < r + 1; k += 1) {
                rings.push({ scale: 1 + k * 0.13, opacity: 0.85 - k * 0.19 });
            }
            this.setData({ p: PALETTES[i], rings: rings });
        },
    },
});
