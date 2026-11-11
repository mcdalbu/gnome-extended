// Private integration session only; gives both switchers real windows to list.
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
const app = new Gtk.Application({application_id: ARGV[0] ?? 'local.SoftBlurTest'});
app.connect('activate', () => {
    const css = new Gtk.CssProvider();
    css.load_from_string(`window { background: transparent; }
        .test-sidebar { background: rgba(30, 30, 30, .45); }
        .test-content { background: rgb(235, 235, 235); color: black; }`);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    for (const title of ['Soft blur test — one', 'Soft blur test — two']) {
        const window = new Gtk.ApplicationWindow({application: app, title,
            default_width: 420, default_height: 240});
        const box = new Gtk.Box();
        const sidebar = new Gtk.Box({width_request: 150});
        sidebar.add_css_class('test-sidebar');
        const content = new Gtk.Label({label: title, hexpand: true});
        content.add_css_class('test-content');
        box.append(sidebar);
        box.append(content);
        window.set_child(box);
        window.present();
    }
});
app.run([]);
