import Gio from 'gi://Gio';
import {sidebarCss, updateSidebarBlock, updateMenuBlock, menuCss} from '../sidebarStyle.js';
const css = sidebarCss(45);
if (!css.includes('45%')) throw new Error('Sidebar opacity');
if (!menuCss(65).includes('popover.menu > contents')) throw new Error('Menu background selector');
const original = '/* personal theme */\nlabel { color: red; }\n';
const added = updateSidebarBlock(original, true, 45);
if (!added.startsWith(original)) throw new Error('Preserve existing CSS');
if (updateSidebarBlock(added, true, 45) !== added) throw new Error('Idempotence');
if (updateSidebarBlock(added, false, 45).trim() !== original.trim()) throw new Error('Removal');
try {
    updateSidebarBlock('/* BEGIN GNOME Extended: Nautilus sidebar */', true, 45);
    throw new Error('Invalid block must be rejected');
} catch (error) {
    if (!error.message.includes('incompleto')) throw error;
}
const both = updateMenuBlock(added, true, 65);
if (!both.startsWith(added)) throw new Error('Preserve sidebar when adding menu CSS');
if (updateMenuBlock(both, true, 65) !== both) throw new Error('Menu idempotence');
if (updateMenuBlock(both, false, 65).trim() !== added.trim()) throw new Error('Independent menu removal');
if (/\bopacity\s*:/.test(both)) throw new Error('Must never fade foreground widgets');
if (ARGV[0]) Gio.File.new_for_path(ARGV[0]).replace_contents(css, null, false, Gio.FileCreateFlags.NONE, null);
print('Scoped sidebar stylesheet, preservation, update and removal: PASS');
