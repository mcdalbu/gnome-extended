// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
let Mtk;
let Cairo;
try {
    Mtk = (await import('gi://Mtk')).default;
} catch {
    Cairo = (await import('cairo')).default;
}

// Clip the destination framebuffer directly: an offscreen mask would change
// the framebuffer that BACKGROUND blur captures. Cache the pixel region.
export const RoundedClip = GObject.registerClass(class RoundedClip extends Clutter.Effect {
    _init() {
        super._init();
        this.radius = 0;
    }

    vfunc_paint(_node, context, _flags) {
        const actor = this.get_actor();
        const framebuffer = context.get_framebuffer();
        const views = actor.peek_stage_views();
        const view = views.find(v => v.get_framebuffer() === framebuffer) ?? views[0];
        if (!view) {
            actor.continue_paint(context);
            return;
        }
        const layout = view.layout;
        const scale = view.get_scale();
        const [stageX, stageY] = actor.get_transformed_position();
        const [stageWidth, stageHeight] = actor.get_transformed_size();
        const x = Math.ceil((stageX - layout.x) * scale);
        const y = Math.ceil((stageY - layout.y) * scale);
        const width = Math.floor((stageX + stageWidth - layout.x) * scale) - x;
        const height = Math.floor((stageY + stageHeight - layout.y) * scale) - y;
        const transformScale = Math.min(stageWidth / actor.width, stageHeight / actor.height);
        const radius = Math.min(this.radius * scale * transformScale, width / 2, height / 2);
        const key = `${x}:${y}:${width}:${height}:${radius}`;
        if (key !== this._key) {
            const region = Mtk ? Mtk.Region.create() : new Cairo.Region();
            const add = (left, top, w, h) => {
                if (w <= 0 || h <= 0)
                    return;
                const rect = {x:left, y:top, width:w, height:h};
                if (Mtk)
                    region.union_rectangle(new Mtk.Rectangle(rect));
                else
                    region.unionRectangle(rect);
            };
            const rows = Math.ceil(radius);
            add(x, y + rows, width, height - rows * 2);
            for (let row = 0; row < rows; row++) {
                const dy = Math.max(0, radius - row - 0.5);
                const inset = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - dy * dy)));
                add(x + inset, y + row, width - inset * 2, 1);
                add(x + inset, y + height - row - 1, width - inset * 2, 1);
            }
            this._region = region;
            this._key = key;
        }
        framebuffer.push_region_clip(this._region);
        try {
            actor.continue_paint(context);
        } finally {
            framebuffer.pop_clip();
        }
    }
});
