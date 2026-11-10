import Gio from 'gi://Gio';
import {settingsWindowTemplate} from '../settingsLauncher.js';
import {sidebarCss, updateSidebarBlock, updateMenuBlock, menuCss, settingsSidebarCss, updateSettingsSidebarBlock} from '../sidebarStyle.js';
const template='<interface><template class="CcWindow" parent="AdwApplicationWindow"><property name="title">Settings</property></template></interface>';
const patched=settingsWindowTemplate(template);
if(!patched.includes('<style><class name="gnome-extended-settings"/></style>') || !patched.includes('<property name="title">Settings</property>'))throw new Error('Scoped Settings template');
let invalidRejected=false;
try{settingsWindowTemplate('<interface/>');}catch{invalidRejected=true;}
if(!invalidRejected)throw new Error('Unknown Settings template must be preserved');
const css = sidebarCss(45);
if (!css.includes('45%')) throw new Error('Sidebar opacity');
if (!menuCss(65).includes('popover.menu > contents')) throw new Error('Menu background selector');
const settingsCss=settingsSidebarCss(67);
if (!settingsCss.includes('window.gnome-extended-settings') || !settingsCss.includes('67%')) throw new Error('Settings scoped background');
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
const settingsStyle=updateSettingsSidebarBlock(both,true,67);
if(!settingsStyle.startsWith(both))throw new Error('Settings must preserve other styles');
if(updateSettingsSidebarBlock(settingsStyle,true,67)!==settingsStyle)throw new Error('Settings idempotence');
if(updateSettingsSidebarBlock(settingsStyle,false,67).trim()!==both.trim())throw new Error('Independent Settings removal');
if (ARGV[0]) Gio.File.new_for_path(ARGV[0]).replace_contents(css, null, false, Gio.FileCreateFlags.NONE, null);
print('Scoped sidebar stylesheet, preservation, update and removal: PASS');
